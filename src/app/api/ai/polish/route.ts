import { createClient, getUser } from "@/lib/supabase/server";
import { MODEL_FAST, MODEL_HEAVY, generateResilient, isGeminiConfigured } from "@/lib/gemini";
import { aiErrorResponse, logAiRun } from "@/lib/ai-server";

export const maxDuration = 60;

const SCHEMA = {
  type: "object",
  properties: {
    content: { type: "string" },
    title: { type: "string" },
    summary: { type: "string" },
    why_useful: { type: "string" },
    changes: { type: "array", items: { type: "string" } },
    additions: { type: "array", items: { type: "string" } },
  },
  required: ["content", "title", "summary", "why_useful", "changes", "additions"],
} as const;

type Polished = {
  content: string;
  title: string;
  summary: string;
  why_useful: string;
  changes: string[];
  additions: string[];
};

/**
 * Melhora uma nota que você escreveu. Dois modos, e a diferença entre eles é
 * a coisa mais importante desta rota.
 *
 * REVISAR mexe só na forma: ortografia, pontuação, frase embolada, markdown.
 * O conteúdo é intocável. É o modo seguro, e é o padrão.
 *
 * DESENVOLVER tem licença para acrescentar: contexto que falta, o passo que
 * você pulou, a ressalva óbvia, o exemplo que fecha o raciocínio. É mais
 * útil e mais perigoso, porque daqui a seis meses você relê a nota sem
 * lembrar o que era seu.
 *
 * Por isso o modo que acrescenta é obrigado a DECLARAR o que acrescentou, em
 * `additions`, e a tela mostra essa lista antes de você aceitar. A licença
 * para escrever junto vem com a obrigação de dizer onde escreveu.
 *
 * Desenvolver também recebe o que você JÁ salvou sobre o assunto. É a única
 * vantagem real que este app tem sobre colar a nota num chat qualquer: o
 * texto cresce para dentro do seu acervo, não para o conhecimento genérico
 * do modelo.
 *
 * A rota nunca grava. Devolve a proposta, e quem decide é a tela.
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
  const body = await request.json().catch(() => ({}));
  const develop = body?.mode === "desenvolver";
  const model = develop ? MODEL_HEAVY : MODEL_FAST;
  const kind = develop ? "polish-develop" : "polish";

  try {
    const text = String(body?.text ?? "").trim();
    const title = String(body?.title ?? "").trim();
    const itemId = body?.itemId ? String(body.itemId) : null;

    if (text.length < 12) {
      return Response.json(
        { error: "Escreva um pouco mais antes de pedir ajuda." },
        { status: 400 },
      );
    }

    // Teto de tamanho: uma nota gigante estoura o tempo da rota e devolve uma
    // reescrita que ninguém confere linha a linha de qualquer jeito.
    const source = text.slice(0, 8000);

    // ── Contexto do próprio acervo, só no modo que acrescenta ─────────
    let context = "";
    const sources: { id: string; title: string }[] = [];

    if (develop && itemId) {
      // `related_items` compara embeddings que já existem: contexto sem
      // gastar mais uma requisição da quota do dia.
      const { data: related } = await supabase.rpc("related_items", {
        p_item_id: itemId,
        match_count: 5,
      });

      for (const r of (related ?? []) as { id: string; title: string; summary: string | null }[]) {
        sources.push({ id: r.id, title: r.title });
      }

      if (sources.length) {
        context = [
          "",
          "O QUE ELE JÁ SALVOU SOBRE ISSO (use para conectar, cite pelo título quando fizer sentido; não invente conteúdo destes itens):",
          ((related ?? []) as { title: string; summary: string | null }[])
            .map((r) => `- ${r.title}${r.summary ? `: ${r.summary}` : ""}`)
            .join("\n"),
        ].join("\n");
      }
    }

    const common = [
      "Devolva:",
      "- content: a nota reescrita em markdown, em português do Brasil.",
      "- title: título curto e específico (máx. 80 caracteres).",
      "- summary: 1 a 2 frases dizendo o que a nota diz.",
      "- why_useful: 1 frase sobre em que situação essa nota serve, em segunda pessoa ('serve quando você...').",
      "- changes: até 4 itens curtos sobre o que você mexeu na forma.",
      "",
      "Não use travessão em nenhum texto: prefira vírgula, dois-pontos ou outra frase.",
      "",
      title ? `TÍTULO ATUAL: ${title}` : "SEM TÍTULO AINDA.",
      "",
      "NOTA:",
      source,
      context,
    ];

    const prompt = develop
      ? [
          "Abaixo está uma nota escrita à mão pelo dono de um segundo cérebro, um desenvolvedor brasileiro que trabalha com IA, agentes e programação.",
          "Desenvolva a nota: deixe-a mais completa e mais útil para ele mesmo daqui a seis meses.",
          "",
          "Pode:",
          "- corrigir a forma e organizar em markdown;",
          "- explicitar o raciocínio que ficou implícito;",
          "- acrescentar o contexto que falta, a ressalva importante, o caso em que aquilo NÃO vale;",
          "- acrescentar um exemplo concreto ou um trecho de código curto quando isso fecha a ideia;",
          "- conectar com o que ele já salvou, quando houver relação real.",
          "",
          "Regras duras:",
          "- Não contradiga o que ele escreveu. Se você discorda, registre como ressalva, não troque a conclusão dele.",
          "- Não invente número, benchmark, data, citação, nome de API ou comportamento de biblioteca. Se não tem certeza, escreva a dúvida em vez do fato.",
          "- Mantenha a voz dele: direto, concreto, sem linguagem de marketing.",
          "- Preserve todo jargão técnico exatamente como está, inclusive em inglês.",
          "",
          "- additions: OBRIGATÓRIO. Liste, em itens curtos, tudo que você acrescentou e não estava na nota original. Se acrescentou um exemplo, diga. Se acrescentou uma ressalva, diga. Esta lista é o que permite a ele separar o que é dele do que é seu; uma lista incompleta aqui é a pior falha possível nesta tarefa.",
          "",
          ...common,
        ]
      : [
          "Abaixo está uma nota escrita à mão pelo próprio dono do segundo cérebro.",
          "Reescreva a FORMA. Não toque no conteúdo.",
          "",
          "Pode:",
          "- corrigir ortografia, acentuação, concordância e pontuação;",
          "- desembolar frases longas e cortar repetição;",
          "- organizar em markdown (títulos, listas, blocos de código) quando a estrutura já estiver implícita no texto;",
          "- manter jargão técnico exatamente como está, inclusive em inglês.",
          "",
          "Não pode:",
          "- acrescentar fato, número, exemplo, definição, conclusão ou recomendação que não esteja no texto;",
          "- mudar a opinião, a dúvida ou o tom de quem escreveu;",
          "- traduzir ou resumir a ponto de perder informação.",
          "",
          "- additions: devolva uma lista VAZIA. Neste modo você não acrescenta nada.",
          "",
          ...common,
        ];

    const {
      data: result,
      model: usedModel,
      degraded,
    } = await generateResilient<Polished>(prompt.filter(Boolean).join("\n"), {
      schema: SCHEMA as unknown as Record<string, unknown>,
      model,
      // Pico de demanda no modelo pesado não pode virar erro na sua cara:
      // desenvolver cai para o leve, e a tela avisa que caiu.
      fallbackModel: develop ? MODEL_FAST : undefined,
      temperature: develop ? 0.45 : 0.2,
      system: develop
        ? "Você é um editor técnico brasileiro que desenvolve as notas do autor sem sequestrá-las. Acrescenta o que falta, nunca contradiz o autor, nunca inventa dado verificável, e declara honestamente tudo que acrescentou."
        : "Você é um editor de texto técnico brasileiro. Você melhora a forma e é rigorosamente fiel ao conteúdo: nunca acrescenta informação que o autor não escreveu. Prefere frase curta e concreta.",
    });

    await logAiRun(supabase, user.id, kind, usedModel, true);

    return Response.json({
      mode: develop ? "desenvolver" : "revisar",
      degraded,
      model: usedModel,
      polished: {
        content: result.content ?? source,
        title: result.title ?? title,
        summary: result.summary ?? "",
        why_useful: result.why_useful ?? "",
        changes: (result.changes ?? []).slice(0, 4),
        // No modo seguro a lista é descartada mesmo que o modelo insista em
        // devolver algo: ali ele não tinha licença para acrescentar nada.
        additions: develop ? (result.additions ?? []).slice(0, 8) : [],
        sources,
      },
    });
  } catch (err) {
    await logAiRun(
      supabase,
      user.id,
      kind,
      model,
      false,
      err instanceof Error ? err.message : String(err),
    );
    return aiErrorResponse(err);
  }
}
