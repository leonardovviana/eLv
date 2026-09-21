import { createClient, getUser } from "@/lib/supabase/server";
import { MODEL_FAST, MODEL_HEAVY, generateResilient, isGeminiConfigured } from "@/lib/gemini";
import { aiErrorResponse, logAiRun } from "@/lib/ai-server";

export const maxDuration = 60;

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    topics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          notes: { type: "string" },
        },
        required: ["title", "notes"],
      },
    },
  },
  required: ["title", "description", "topics"],
} as const;

/**
 * Gera uma trilha de estudo.
 *
 * Recebe os itens que a pessoa já salvou naquela área e pede ao modelo que
 * ancore a trilha neles. Um roadmap genérico de internet ela acha em qualquer
 * lugar; o que só este app pode fazer é montar a trilha em cima do que ela já
 * julgou relevante o bastante para guardar.
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
    const areaId = body?.areaId ? String(body.areaId) : null;
    const theme = String(body?.theme ?? "").trim();

    if (!areaId && !theme) {
      return Response.json({ error: "Informe uma área ou um tema." }, { status: 400 });
    }

    const { data: area } = areaId
      ? await supabase.from("areas").select("id, name, slug").eq("id", areaId).single()
      : { data: null };

    let itemsQuery = supabase
      .from("items")
      .select("id, title, summary, kind")
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(30);

    if (areaId) itemsQuery = itemsQuery.eq("area_id", areaId);

    const { data: items } = await itemsQuery;

    const saved = (items ?? [])
      .map((i) => `- ${i.title}${i.summary ? `: ${i.summary}` : ""}`)
      .join("\n");

    const prompt = [
      "Monte uma trilha de estudo prática para um desenvolvedor brasileiro que trabalha com IA, agentes e programação.",
      "",
      area ? `Área: ${area.name}` : "",
      theme ? `Tema pedido: ${theme}` : "",
      "",
      saved
        ? [
            "O que ele JÁ salvou nessa área (use como âncora: cite e encaixe esses materiais nos tópicos onde fizerem sentido):",
            saved,
          ].join("\n")
        : "Ele ainda não salvou material nessa área.",
      "",
      "Devolva:",
      "- title: nome curto da trilha, em português.",
      "- description: 1 a 2 frases sobre o que ele sai sabendo fazer ao terminar.",
      "- topics: entre 6 e 10 tópicos, do básico ao avançado, na ordem de estudo.",
      "  Cada tópico tem title (curto) e notes (2 a 3 frases dizendo o que estudar ali e o que construir na prática para fixar).",
      "",
      "Foque em fazer, não em ler. Cada tópico deve levar a algo construído.",
    ]
      .filter(Boolean)
      .join("\n");

    const { data: result, model: usedModel } = await generateResilient<{
      title: string;
      description: string;
      topics: { title: string; notes: string }[];
    }>(prompt, {
      schema: SCHEMA as unknown as Record<string, unknown>,
      model: MODEL_HEAVY,
      fallbackModel: MODEL_FAST,
      temperature: 0.5,
      system:
        "Você monta trilhas de estudo práticas para desenvolvedores. Concreto, sem encheção de linguiça, sempre orientado a construir algo.",
    });

    await logAiRun(supabase, user.id, "track", usedModel, true);

    const { data: track, error: trackErr } = await supabase
      .from("tracks")
      .insert({
        user_id: user.id,
        area_id: areaId,
        title: result.title,
        description: result.description,
      })
      .select("id")
      .single();

    if (trackErr) return Response.json({ error: trackErr.message }, { status: 500 });

    const topics = (result.topics ?? []).slice(0, 12);
    if (topics.length) {
      const { error: topicsErr } = await supabase.from("track_topics").insert(
        topics.map((t, i) => ({
          track_id: track.id,
          title: t.title,
          notes: t.notes,
          sort_order: i,
        })),
      );
      if (topicsErr) return Response.json({ error: topicsErr.message }, { status: 500 });
    }

    return Response.json({ trackId: track.id, topics: topics.length });
  } catch (err) {
    await logAiRun(
      supabase,
      user.id,
      "track",
      MODEL_HEAVY,
      false,
      err instanceof Error ? err.message : String(err),
    );
    return aiErrorResponse(err);
  }
}
