import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GeminiQuotaError, GeminiUnavailableError } from "@/lib/gemini";

/** Registra a chamada em ai_runs. Nunca deixa um erro de log derrubar a request. */
export async function logAiRun(
  supabase: SupabaseClient,
  userId: string,
  kind: string,
  model: string,
  ok: boolean,
  error?: string,
) {
  try {
    await supabase.from("ai_runs").insert({
      user_id: userId,
      kind,
      model,
      ok,
      error: error?.slice(0, 500) ?? null,
    });
  } catch {
    // Log é observabilidade, não caminho crítico.
  }
}

/** Quantas chamadas foram feitas hoje — alimenta o contador da UI. */
export async function aiUsageToday(supabase: SupabaseClient) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("ai_runs")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since.toISOString());

  return count ?? 0;
}

/** Converte qualquer erro da camada de IA numa resposta HTTP coerente. */
export function aiErrorResponse(err: unknown) {
  if (err instanceof GeminiQuotaError) {
    return Response.json({ error: err.message, quota: true }, { status: 429 });
  }

  // Sobrecarga do outro lado: `retry` diz à tela que insistir faz sentido,
  // o que não vale para quota estourada nem para payload torto.
  if (err instanceof GeminiUnavailableError) {
    return Response.json({ error: err.message, retry: true }, { status: 503 });
  }
  const message = err instanceof Error ? err.message : "Falha inesperada na IA.";
  return Response.json({ error: message }, { status: 500 });
}
