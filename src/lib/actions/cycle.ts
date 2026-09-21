"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";
import type { Grade, Stage } from "@/lib/types";

type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

/**
 * Ações do ciclo: revisar, conectar, plantar.
 *
 * Separadas de `items.ts` porque não editam um item — movem o estado do
 * cérebro. Quem mexe aqui está mudando quando algo volta, o que se liga a quê,
 * e o que existe para começar.
 */

/**
 * Registra uma revisão.
 *
 * O cálculo inteiro (novo intervalo, nova força, novo estágio, log) roda em
 * `register_review` no Postgres. Fazer isso aqui exigiria ler o item, calcular,
 * escrever e inserir o log em quatro idas ao banco — e qualquer falha no meio
 * deixaria o item com intervalo novo e força velha.
 */
export async function review(
  itemId: string,
  grade: Grade,
): Promise<
  ActionResult<{
    stage: Stage;
    strength: number;
    interval_days: number;
    next_review_at: string;
    reviews: number;
  }>
> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Não autenticado." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_review", {
    p_item_id: itemId,
    p_grade: grade,
  });

  if (error) return { ok: false, error: error.message };

  const row = Array.isArray(data) ? data[0] : data;

  // A fila e o pulso mudam a cada nota, mas revalidar aqui recarregaria a
  // tela no meio da sessão de revisão. Quem chama decide quando atualizar.
  return { ok: true, data: row };
}

/** Adia sem dar nota: sai da fila de hoje, não mexe na força. */
export async function snooze(itemId: string, days = 1): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Não autenticado." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({ next_review_at: new Date(Date.now() + days * 86_400_000).toISOString() })
    .eq("id", itemId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Liga dois itens.
 *
 * O par é normalizado (menor id primeiro) antes de gravar: sem isso, "A→B" e
 * "B→A" viram duas linhas para a mesma ideia, e o mapa desenha a aresta em
 * dobro.
 */
export async function linkItems(
  aId: string,
  bId: string,
  origin: "manual" | "ai" | "semantic" = "manual",
  score = 0,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Não autenticado." };
  if (aId === bId) return { ok: false, error: "Um item não se liga a si mesmo." };

  const [from, to] = aId < bId ? [aId, bId] : [bId, aId];

  const supabase = await createClient();
  const { error } = await supabase
    .from("item_links")
    .upsert(
      { from_item_id: from, to_item_id: to, origin, score },
      { onConflict: "from_item_id,to_item_id" },
    );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/mapa");
  revalidatePath(`/item/${aId}`);
  revalidatePath(`/item/${bId}`);
  return { ok: true };
}

export async function unlinkItems(aId: string, bId: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Não autenticado." };

  const [from, to] = aId < bId ? [aId, bId] : [bId, aId];

  const supabase = await createClient();
  const { error } = await supabase
    .from("item_links")
    .delete()
    .eq("from_item_id", from)
    .eq("to_item_id", to);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/mapa");
  return { ok: true };
}

/**
 * Planta o acervo de partida.
 *
 * Existe porque um segundo cérebro vazio não demonstra nada: sem itens não há
 * fila, nem pulso, nem mapa. A função SQL é idempotente e reconhece o que já
 * plantou pelo título, então clicar duas vezes não duplica.
 */
export async function plantGarden(): Promise<ActionResult<{ planted: number }>> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Não autenticado." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("plant_starter_garden");

  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, data: { planted: Number(data ?? 0) } };
}
