import { createClient, getUser } from "@/lib/supabase/server";
import { isGeminiConfigured } from "@/lib/gemini";
import { aiErrorResponse } from "@/lib/ai-server";
import { embedItems, pendingIndexCount } from "@/lib/embed-items";

export const maxDuration = 120;

/** Quantos itens ainda faltam entrar na busca semântica. */
export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const supabase = await createClient();
  return Response.json({ pending: await pendingIndexCount(supabase) });
}

/**
 * Indexa itens para a busca semântica.
 *
 * Roda sob demanda em vez de a cada salvamento: assim escrever uma nota nunca
 * fica lento nem falha por causa da quota do Gemini. O que fica pendente é
 * visível na tela de Config e indexado num lote só.
 */
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  if (!isGeminiConfigured()) {
    return Response.json(
      { error: "GEMINI_API_KEY não configurada. Veja o .env.example." },
      { status: 503 },
    );
  }

  const supabase = await createClient();

  try {
    const body = await request.json().catch(() => ({}));
    const itemIds = Array.isArray(body?.itemIds) ? (body.itemIds as string[]) : undefined;

    const result = await embedItems(supabase, user.id, itemIds);
    const pending = await pendingIndexCount(supabase);

    return Response.json({ ...result, pending });
  } catch (err) {
    return aiErrorResponse(err);
  }
}
