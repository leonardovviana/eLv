import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkText, contentHash, embeddableText } from "@/lib/chunk";
import { MODEL_EMBED, embed, toPgVector } from "@/lib/gemini";
import { logAiRun } from "@/lib/ai-server";

type Row = {
  id: string;
  title: string | null;
  content: string | null;
  summary: string | null;
  why_useful: string | null;
  url: string | null;
  content_hash: string | null;
};

export type IndexResult = {
  indexed: number;
  skipped: number;
  chunks: number;
};

/**
 * Indexa itens para a busca semântica.
 *
 * Só toca em quem mudou de verdade: o hash do texto embeddável é comparado com
 * `content_hash`. Sem isso, cada salvamento reindexaria a biblioteca inteira e
 * torraria a quota diária num item só.
 *
 * `itemIds` vazio = indexa todos os pendentes do usuário.
 */
export async function embedItems(
  supabase: SupabaseClient,
  userId: string,
  itemIds?: string[],
  limit = 40,
): Promise<IndexResult> {
  let query = supabase
    .from("items")
    .select("id, title, content, summary, why_useful, url, content_hash")
    .eq("user_id", userId)
    .neq("status", "archived")
    .limit(limit);

  if (itemIds?.length) query = query.in("id", itemIds);
  else query = query.is("content_hash", null);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao carregar itens: ${error.message}`);

  const rows = (data ?? []) as Row[];
  const result: IndexResult = { indexed: 0, skipped: 0, chunks: 0 };
  if (rows.length === 0) return result;

  // 1. Descobrir quem realmente precisa reindexar.
  const pending: { row: Row; text: string; hash: string; chunks: string[] }[] = [];

  for (const row of rows) {
    const text = embeddableText(row);
    if (!text) {
      result.skipped++;
      continue;
    }
    const hash = await contentHash(text);
    if (hash === row.content_hash) {
      result.skipped++;
      continue;
    }
    pending.push({ row, text, hash, chunks: chunkText(text) });
  }

  if (pending.length === 0) return result;

  // 2. Uma única chamada de embedding para TODOS os chunks de TODOS os itens.
  const flat = pending.flatMap((p) => p.chunks);
  let vectors: number[][];

  try {
    vectors = await embed(flat, "RETRIEVAL_DOCUMENT");
    await logAiRun(supabase, userId, "embed", MODEL_EMBED, true);
  } catch (err) {
    await logAiRun(
      supabase,
      userId,
      "embed",
      MODEL_EMBED,
      false,
      err instanceof Error ? err.message : String(err),
    );
    throw err;
  }

  // 3. Gravar. Só marca o content_hash depois que os chunks entraram —
  //    se falhar no meio, o item continua pendente e será retentado.
  let cursor = 0;
  for (const { row, hash, chunks } of pending) {
    const slice = vectors.slice(cursor, cursor + chunks.length);
    cursor += chunks.length;

    const { error: delErr } = await supabase.from("item_chunks").delete().eq("item_id", row.id);
    if (delErr) throw new Error(`Falha ao limpar chunks: ${delErr.message}`);

    const { error: insErr } = await supabase.from("item_chunks").insert(
      chunks.map((content, i) => ({
        item_id: row.id,
        user_id: userId,
        chunk_index: i,
        content,
        embedding: toPgVector(slice[i]),
      })),
    );
    if (insErr) throw new Error(`Falha ao gravar chunks: ${insErr.message}`);

    await supabase.from("items").update({ content_hash: hash }).eq("id", row.id);

    result.indexed++;
    result.chunks += chunks.length;
  }

  return result;
}

/** Quantos itens ainda não estão na busca semântica. */
export async function pendingIndexCount(supabase: SupabaseClient) {
  const { count } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .is("content_hash", null)
    .neq("status", "archived");

  return count ?? 0;
}
