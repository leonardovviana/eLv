import { createClient, getUser } from "@/lib/supabase/server";
import { MODEL_FAST, generate, isGeminiConfigured } from "@/lib/gemini";
import { aiErrorResponse, logAiRun } from "@/lib/ai-server";
import { ITEM_KINDS } from "@/lib/types";

export const maxDuration = 60;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          area_slug: { type: "string" },
          kind: { type: "string", enum: ITEM_KINDS.map((k) => k.value) },
          summary: { type: "string" },
          why_useful: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["id", "title", "area_slug", "kind", "summary", "why_useful", "tags"],
      },
    },
  },
  required: ["items"],
} as const;

type Suggestion = {
  id: string;
  title: string;
  area_slug: string;
  kind: string;
  summary: string;
  why_useful: string;
  tags: string[];
};

/**
 * Destila TODAS as sementes numa ÚNICA chamada ao Gemini.
 *
 * Uma chamada por item seria mais simples de escrever e queimaria a quota
 * diária inteira em meia dúzia de itens. O lote é o que torna o recurso viável
 * no free tier.
 *
 * A rota não grava nada: devolve sugestões para você revisar. Quem promove a
 * semente a broto — e agenda a primeira revisão — é a server action `distill`.
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
    const limit = Math.min(Number(body?.limit) || 25, 40);

    const [{ data: items }, { data: areas }] = await Promise.all([
      supabase
        .from("items")
        .select("id, title, content, url, kind, source_meta")
        .eq("stage", "seed")
        .order("created_at", { ascending: true })
        .limit(limit),
      supabase.from("areas").select("id, name, slug").order("sort_order"),
    ]);

    if (!items?.length) return Response.json({ suggestions: [] });
    if (!areas?.length) {
      return Response.json({ error: "Nenhuma área cadastrada." }, { status: 400 });
    }

    const areaList = areas.map((a) => `- ${a.slug}: ${a.name}`).join("\n");
    const kindList = ITEM_KINDS.map((k) => `- ${k.value}: ${k.label}`).join("\n");

    const payload = items.map((i) => ({
      id: i.id,
      titulo_atual: i.title,
      url: i.url,
      tipo_atual: i.kind,
      conteudo: String(i.content ?? "").slice(0, 1200),
      meta: i.source_meta,
    }));

    const prompt = [
      "Destile os itens abaixo, capturados crus no fluxo de um segundo cérebro pessoal.",
      "",
      "Áreas disponíveis (use exatamente o slug):",
      areaList,
      "",
      "Tipos disponíveis (use exatamente o valor):",
      kindList,
      "",
      "Para CADA item, devolva:",
      "- title: título curto e específico em português (máx. 80 caracteres). Nada de título genérico como 'Artigo' ou 'Link'.",
      "- area_slug: a área mais adequada dentre as listadas.",
      "- kind: o tipo mais adequado.",
      "- summary: 1 a 2 frases dizendo o que é, em português.",
      "- why_useful: 1 frase direta sobre em que situação isso serviria para um dev que trabalha com IA, agentes e automação. Escreva em segunda pessoa ('serve quando você...').",
      "- tags: 2 a 4 tags curtas em minúsculas, sem acento e sem '#'.",
      "",
      "Preserve o campo id exatamente como veio. Não invente itens.",
      "Não use travessão (—) em nenhum texto: use vírgula, dois-pontos ou outra frase.",
      "",
      "ITENS:",
      JSON.stringify(payload, null, 2),
    ].join("\n");

    const result = await generate<{ items: Suggestion[] }>(prompt, {
      schema: SCHEMA as unknown as Record<string, unknown>,
      model: MODEL_FAST,
      system:
        "Você organiza a base de conhecimento pessoal de um desenvolvedor brasileiro focado em IA, agentes e programação. Seja concreto e específico; evite linguagem de marketing.",
    });

    await logAiRun(supabase, user.id, "distill", MODEL_FAST, true);

    // A IA devolve slug; a UI precisa de id. Itens com slug inválido caem em
    // area_id null e continuam como semente, para triagem manual.
    const bySlug = new Map(areas.map((a) => [a.slug, a.id]));
    const validIds = new Set(items.map((i) => i.id));

    const suggestions = (result.items ?? [])
      .filter((s) => validIds.has(s.id))
      .map((s) => ({
        ...s,
        area_id: bySlug.get(s.area_slug) ?? null,
        tags: (s.tags ?? []).slice(0, 4),
      }));

    return Response.json({ suggestions });
  } catch (err) {
    await logAiRun(
      supabase,
      user.id,
      "distill",
      MODEL_FAST,
      false,
      err instanceof Error ? err.message : String(err),
    );
    return aiErrorResponse(err);
  }
}
