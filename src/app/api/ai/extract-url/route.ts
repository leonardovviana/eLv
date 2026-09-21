import { createClient, getUser } from "@/lib/supabase/server";
import { MODEL_FAST, generate, isGeminiConfigured } from "@/lib/gemini";
import { aiErrorResponse, logAiRun } from "@/lib/ai-server";
import { ITEM_KINDS } from "@/lib/types";
import { isUrl } from "@/lib/utils";

export const maxDuration = 60;

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    area_slug: { type: "string" },
    kind: { type: "string", enum: ITEM_KINDS.map((k) => k.value) },
    summary: { type: "string" },
    why_useful: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
  },
  required: ["title", "area_slug", "kind", "summary", "why_useful", "tags"],
} as const;

const GITHUB_RE = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/?#]+)/i;

/**
 * Busca os metadados de um repo pela API pública do GitHub.
 *
 * Isso vem ANTES do Gemini de propósito: a API devolve descrição, linguagem,
 * stars e topics já estruturados. Jogar o HTML cru da página do GitHub no
 * modelo gastaria muito mais token e ainda assim daria um resultado pior,
 * porque a página é quase toda navegação.
 */
async function fetchGithub(owner: string, repo: string) {
  const clean = repo.replace(/\.git$/, "");
  const res = await fetch(`https://api.github.com/repos/${owner}/${clean}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "elv-segundo-cerebro",
    },
  });

  if (!res.ok) return null;
  const r = await res.json();

  let readme = "";
  try {
    const rd = await fetch(`https://api.github.com/repos/${owner}/${clean}/readme`, {
      headers: { accept: "application/vnd.github.raw", "user-agent": "elv-segundo-cerebro" },
    });
    if (rd.ok) readme = (await rd.text()).slice(0, 4000);
  } catch {
    // README é bônus; o resto dos metadados já basta.
  }

  return {
    meta: {
      owner,
      repo: clean,
      stars: r.stargazers_count as number,
      language: r.language as string | null,
      topics: (r.topics ?? []) as string[],
    },
    text: [
      `Repositório: ${r.full_name}`,
      `Descrição: ${r.description ?? "(sem descrição)"}`,
      `Linguagem: ${r.language ?? "n/d"}`,
      `Stars: ${r.stargazers_count}`,
      `Topics: ${(r.topics ?? []).join(", ") || "n/d"}`,
      "",
      "README (início):",
      readme,
    ].join("\n"),
  };
}

/** Fallback: baixa a página e reduz a texto aproveitável. */
async function fetchPage(url: string) {
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; elv-segundo-cerebro)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Não consegui abrir a página (HTTP ${res.status}).`);

  const html = await res.text();
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
  const desc =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1] ??
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i)?.[1] ??
    "";

  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);

  return {
    meta: { site: new URL(url).hostname.replace(/^www\./, "") },
    text: [`Título: ${title}`, `Descrição: ${desc}`, "", "Conteúdo:", body].join("\n"),
  };
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const supabase = await createClient();

  try {
    const body = await request.json().catch(() => ({}));
    const url = String(body?.url ?? "").trim();

    if (!isUrl(url)) return Response.json({ error: "URL inválida." }, { status: 400 });

    const gh = url.match(GITHUB_RE);
    const source = gh ? await fetchGithub(gh[1], gh[2]) : null;
    const fetched = source ?? (await fetchPage(url));

    // Sem chave do Gemini a rota ainda é útil: devolve os metadados crus.
    if (!isGeminiConfigured()) {
      return Response.json({
        extraction: null,
        source_meta: fetched.meta,
        raw: fetched.text.slice(0, 500),
      });
    }

    const { data: areas } = await supabase
      .from("areas")
      .select("id, name, slug")
      .order("sort_order");

    const areaList = (areas ?? []).map((a) => `- ${a.slug}: ${a.name}`).join("\n");

    const prompt = [
      "Analise o conteúdo abaixo, capturado de uma URL para o segundo cérebro de um desenvolvedor brasileiro que trabalha com IA, agentes e programação.",
      "",
      "Áreas disponíveis (use exatamente o slug):",
      areaList,
      "",
      "Devolva:",
      "- title: título curto e específico em português (máx. 80 caracteres).",
      "- area_slug: a área mais adequada.",
      "- kind: o tipo mais adequado.",
      "- summary: 2 a 3 frases sobre o que é, em português.",
      "- why_useful: 1 ou 2 frases concretas sobre em que projeto ou situação isso serviria. Escreva em segunda pessoa.",
      "- tags: 2 a 4 tags curtas, minúsculas, sem acento.",
      "",
      `URL: ${url}`,
      "",
      "CONTEÚDO:",
      fetched.text,
    ].join("\n");

    const extraction = await generate<Record<string, unknown>>(prompt, {
      schema: SCHEMA as unknown as Record<string, unknown>,
      model: MODEL_FAST,
      system:
        "Você cataloga conteúdo técnico para a base pessoal de um desenvolvedor. Seja concreto; nunca use linguagem promocional.",
    });

    await logAiRun(supabase, user.id, "extract-url", MODEL_FAST, true);

    const areaId =
      (areas ?? []).find((a) => a.slug === extraction.area_slug)?.id ?? null;

    return Response.json({
      extraction: { ...extraction, area_id: areaId },
      source_meta: fetched.meta,
    });
  } catch (err) {
    await logAiRun(
      supabase,
      user.id,
      "extract-url",
      MODEL_FAST,
      false,
      err instanceof Error ? err.message : String(err),
    );
    return aiErrorResponse(err);
  }
}
