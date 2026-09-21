import { createClient, getUser } from "@/lib/supabase/server";
import { MODEL_EMBED, embed, isGeminiConfigured, toPgVector } from "@/lib/gemini";
import { logAiRun } from "@/lib/ai-server";

export const maxDuration = 30;

/**
 * Cache de embeddings de consulta, no processo.
 *
 * Repetir uma busca (voltar na tela, ajustar um filtro, apertar Enter de novo)
 * é comum, e cada repetição seria uma requisição a menos na quota do dia.
 * O cache é pequeno e some quando a instância recicla — o que é aceitável,
 * porque o pior caso é simplesmente gastar a requisição.
 */
const QUERY_CACHE = new Map<string, number[]>();
const CACHE_MAX = 60;

function cacheGet(key: string) {
  const hit = QUERY_CACHE.get(key);
  if (hit) {
    QUERY_CACHE.delete(key);
    QUERY_CACHE.set(key, hit);
  }
  return hit;
}

function cacheSet(key: string, value: number[]) {
  QUERY_CACHE.set(key, value);
  if (QUERY_CACHE.size > CACHE_MAX) {
    QUERY_CACHE.delete(QUERY_CACHE.keys().next().value as string);
  }
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const supabase = await createClient();
  const body = await request.json().catch(() => ({}));

  const q = String(body?.q ?? "").trim();
  const areaId = body?.areaId ? String(body.areaId) : null;
  const kind = body?.kind ? String(body.kind) : null;
  const semantic = body?.semantic !== false;
  const limit = Math.min(Number(body?.limit) || 20, 50);

  if (!q) return Response.json({ results: [], semanticUsed: false });

  // A busca semântica é um bônus. Se ela falhar — sem chave, sem quota, erro
  // de rede — a busca full-text continua respondendo normalmente. Buscar é a
  // função mais básica do app: ela nunca pode depender de um serviço externo.
  let queryVector: string | null = null;
  let semanticUsed = false;
  let semanticError: string | null = null;

  if (semantic && isGeminiConfigured()) {
    const key = q.toLowerCase();
    try {
      let vec = cacheGet(key);
      if (!vec) {
        [vec] = await embed([q], "RETRIEVAL_QUERY");
        cacheSet(key, vec);
        await logAiRun(supabase, user.id, "search-embed", MODEL_EMBED, true);
      }
      queryVector = toPgVector(vec);
      semanticUsed = true;
    } catch (err) {
      semanticError = err instanceof Error ? err.message : "Busca semântica indisponível.";
      await logAiRun(supabase, user.id, "search-embed", MODEL_EMBED, false, semanticError);
    }
  }

  const { data, error } = await supabase.rpc("search_items", {
    q,
    q_embedding: queryVector,
    match_count: limit,
    p_area_id: areaId,
    p_kind: kind,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ results: data ?? [], semanticUsed, semanticError });
}
