"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";
import { deriveTitle, guessKind, isUrl, slugify } from "@/lib/utils";
import type { ItemKind, Stage } from "@/lib/types";

type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

/** Uma semente recém-destilada volta em três dias. Curto de propósito: o
 *  primeiro reencontro é o que decide se o item vira repertório ou lixo. */
const FIRST_INTERVAL_DAYS = 3;

function inDays(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/**
 * Captura: o único ponto de entrada do app.
 *
 * Nasce como SEMENTE, sem área e sem resumo. O atrito aqui tem que ser zero —
 * se capturar exigir decidir categoria, nada entra, e um segundo cérebro vazio
 * não é um segundo cérebro.
 */
export async function captureItem(input: {
  raw: string;
  title?: string;
}): Promise<ActionResult<{ id: string; title: string; kind: ItemKind }>> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Não autenticado." };

  const raw = input.raw.trim();
  if (!raw) return { ok: false, error: "Nada para capturar." };

  const supabase = await createClient();
  const kind = guessKind(raw);
  const url = isUrl(raw) ? raw : null;

  const title =
    input.title?.trim() || (url ? new URL(url).hostname.replace(/^www\./, "") : deriveTitle(raw));

  const { data, error } = await supabase
    .from("items")
    .insert({
      user_id: user.id,
      kind,
      title,
      content: url ? "" : raw,
      url,
      stage: "seed",
      strength: 5,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, data: { id: data.id, title, kind } };
}

export async function updateItem(
  id: string,
  patch: {
    title?: string;
    content?: string;
    kind?: ItemKind;
    area_id?: string | null;
    summary?: string | null;
    why_useful?: string | null;
    stage?: Stage;
    pinned?: boolean;
    url?: string | null;
    ai_expanded_at?: string | null;
  },
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Não autenticado." };

  const supabase = await createClient();

  // Mexer no texto invalida o embedding. Zerar o hash marca o item como
  // pendente de reindexação, sem gastar quota agora.
  const touchesText =
    patch.title !== undefined ||
    patch.content !== undefined ||
    patch.summary !== undefined ||
    patch.why_useful !== undefined ||
    patch.url !== undefined;

  // Promover uma semente na mão tem que agendar a primeira revisão, senão o
  // item entra no acervo e nunca mais aparece na fila — exatamente o buraco
  // que fazia o app parecer morto.
  const entersCycle = patch.stage && patch.stage !== "seed" && patch.stage !== "dormant";

  const { data: current } = entersCycle
    ? await supabase.from("items").select("stage, next_review_at").eq("id", id).maybeSingle()
    : { data: null };

  const schedule =
    entersCycle && (current?.stage === "seed" || !current?.next_review_at)
      ? { interval_days: FIRST_INTERVAL_DAYS, next_review_at: inDays(FIRST_INTERVAL_DAYS) }
      : {};

  const { error } = await supabase
    .from("items")
    .update({ ...patch, ...schedule, ...(touchesText ? { content_hash: null } : {}) })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteItem(id: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Não autenticado." };

  const supabase = await createClient();
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Tira do ciclo sem apagar: continua na busca, para de cobrar revisão. */
export async function hibernateItem(id: string): Promise<ActionResult> {
  return updateItem(id, { stage: "dormant" });
}

/** Marca que o item foi aberto. Alimenta "o que você mais consulta". */
export async function touchItem(id: string): Promise<void> {
  const user = await getUser();
  if (!user) return;

  const supabase = await createClient();
  const { data } = await supabase.from("items").select("opens").eq("id", id).maybeSingle();

  await supabase
    .from("items")
    .update({ opens: (data?.opens ?? 0) + 1, last_opened_at: new Date().toISOString() })
    .eq("id", id);
}

/** Cria (ou reaproveita) tags pelo nome e liga ao item. */
export async function setItemTags(itemId: string, tagNames: string[]): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Não autenticado." };

  const supabase = await createClient();
  const clean = Array.from(
    new Map(
      tagNames
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => [slugify(n), n]),
    ).entries(),
  ).filter(([slug]) => slug.length > 0);

  await supabase.from("item_tags").delete().eq("item_id", itemId);
  if (clean.length === 0) return { ok: true };

  const { data: tags, error: upsertErr } = await supabase
    .from("tags")
    .upsert(
      clean.map(([slug, name]) => ({ user_id: user.id, name, slug })),
      { onConflict: "user_id,slug" },
    )
    .select("id");

  if (upsertErr) return { ok: false, error: upsertErr.message };

  const { error: linkErr } = await supabase
    .from("item_tags")
    .insert((tags ?? []).map((t) => ({ item_id: itemId, tag_id: t.id })));

  if (linkErr) return { ok: false, error: linkErr.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Destilação: a semente vira broto e entra no ciclo de revisão.
 *
 * Esta é a única transição que a IA propõe e você confirma. Ela grava tudo de
 * uma vez — categoria, resumo, para que serve, tags e o primeiro agendamento.
 * Separar em passos faria a pessoa parar no meio e deixar o item num limbo.
 */
export async function distill(
  decisions: {
    id: string;
    title?: string;
    area_id?: string | null;
    kind?: ItemKind;
    summary?: string | null;
    why_useful?: string | null;
    tags?: string[];
  }[],
): Promise<ActionResult<{ applied: number }>> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Não autenticado." };

  const supabase = await createClient();
  let applied = 0;

  for (const d of decisions) {
    const { error } = await supabase
      .from("items")
      .update({
        ...(d.title ? { title: d.title } : {}),
        ...(d.area_id !== undefined ? { area_id: d.area_id } : {}),
        ...(d.kind ? { kind: d.kind } : {}),
        ...(d.summary !== undefined ? { summary: d.summary } : {}),
        ...(d.why_useful !== undefined ? { why_useful: d.why_useful } : {}),
        stage: "sprout",
        strength: 25,
        interval_days: FIRST_INTERVAL_DAYS,
        next_review_at: inDays(FIRST_INTERVAL_DAYS),
        content_hash: null,
      })
      .eq("id", d.id);

    if (error) continue;
    if (d.tags?.length) await setItemTags(d.id, d.tags);
    applied++;
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { applied } };
}
