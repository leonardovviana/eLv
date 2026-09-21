import { createClient, getUser } from "@/lib/supabase/server";
import {
  MODEL_EMBED,
  MODEL_FAST,
  MODEL_HEAVY,
  embed,
  generateResilient,
  isGeminiConfigured,
  toPgVector,
} from "@/lib/gemini";
import { aiErrorResponse, logAiRun } from "@/lib/ai-server";

export const maxDuration = 60;

const SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    used_item_ids: { type: "array", items: { type: "string" } },
    confident: { type: "boolean" },
  },
  required: ["answer", "used_item_ids", "confident"],
} as const;

/**
 * "Perguntar ao meu cérebro": responde usando SÓ o que está salvo.
 *
 * O modelo é instruído a admitir quando a base não cobre a pergunta, e a
 * resposta sempre volta com os ids das fontes para a UI renderizar links.
 * Um segundo cérebro que inventa resposta é pior que nenhum: o valor inteiro
 * está em confiar no que ele devolve.
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
    const question = String(body?.question ?? "").trim();
    if (!question) return Response.json({ error: "Faça uma pergunta." }, { status: 400 });

    let queryVector: string | null = null;
    try {
      const [vec] = await embed([question], "RETRIEVAL_QUERY");
      queryVector = toPgVector(vec);
      await logAiRun(supabase, user.id, "ask-embed", MODEL_EMBED, true);
    } catch {
      // Sem vetor a recuperação cai para full-text. Pior recall, mas responde.
    }

    const { data: hits, error } = await supabase.rpc("search_items", {
      q: question,
      q_embedding: queryVector,
      match_count: 8,
      p_area_id: null,
      p_kind: null,
    });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    if (!hits?.length) {
      return Response.json({
        answer:
          "Não encontrei nada sobre isso no seu segundo cérebro. Talvez ainda não tenha capturado, ou os itens ainda não foram indexados (veja Config → busca semântica).",
        sources: [],
        confident: false,
      });
    }

    const ids = hits.map((h: { id: string }) => h.id);
    const { data: full } = await supabase
      .from("items")
      .select("id, title, kind, url, summary, why_useful, content")
      .in("id", ids);

    const byId = new Map((full ?? []).map((i) => [i.id, i]));

    const context = ids
      .map((id: string, idx: number) => {
        const i = byId.get(id);
        if (!i) return "";
        return [
          `[FONTE ${idx + 1}] id=${i.id}`,
          `Título: ${i.title}`,
          i.url ? `URL: ${i.url}` : "",
          i.summary ? `Resumo: ${i.summary}` : "",
          i.why_useful ? `Serve para: ${i.why_useful}` : "",
          String(i.content ?? "").slice(0, 1500),
        ]
          .filter(Boolean)
          .join("\n");
      })
      .filter(Boolean)
      .join("\n\n---\n\n");

    const prompt = [
      "Responda a pergunta usando EXCLUSIVAMENTE as fontes abaixo, que vêm da base de conhecimento pessoal de quem pergunta.",
      "",
      "Regras:",
      "- Se as fontes não responderem a pergunta, diga isso claramente e marque confident como false. Não complete com conhecimento geral seu.",
      "- Responda em português do Brasil, direto ao ponto.",
      "- Em used_item_ids, liste os ids (campo id= de cada fonte) que você realmente usou.",
      "- Cite as fontes pelo título ao longo da resposta, de forma natural.",
      "",
      `PERGUNTA: ${question}`,
      "",
      "FONTES:",
      context,
    ].join("\n");

    const {
      data: result,
      model: usedModel,
      degraded,
    } = await generateResilient<{
      answer: string;
      used_item_ids: string[];
      confident: boolean;
    }>(prompt, {
      schema: SCHEMA as unknown as Record<string, unknown>,
      model: MODEL_HEAVY,
      // Sobrecarga no modelo pesado não pode deixar a pergunta sem resposta:
      // o leve responde pior e responde.
      fallbackModel: MODEL_FAST,
      temperature: 0.3,
      system:
        "Você é o mecanismo de consulta do segundo cérebro de um desenvolvedor brasileiro. Fidelidade às fontes acima de tudo: nunca invente, nunca complete lacuna com conhecimento externo.",
    });

    await logAiRun(supabase, user.id, "ask", usedModel, true);

    const used = new Set(result.used_item_ids ?? []);
    const sources = (full ?? [])
      .filter((i) => used.has(i.id))
      .map((i) => ({ id: i.id, title: i.title, kind: i.kind, url: i.url }));

    return Response.json({
      answer: result.answer,
      confident: result.confident,
      degraded,
      // Se o modelo não marcou fontes, mostra os candidatos: melhor dar um
      // ponto de partida do que uma resposta órfã.
      sources: sources.length
        ? sources
        : (full ?? []).slice(0, 3).map((i) => ({
            id: i.id,
            title: i.title,
            kind: i.kind,
            url: i.url,
          })),
    });
  } catch (err) {
    await logAiRun(
      supabase,
      user.id,
      "ask",
      MODEL_HEAVY,
      false,
      err instanceof Error ? err.message : String(err),
    );
    return aiErrorResponse(err);
  }
}
