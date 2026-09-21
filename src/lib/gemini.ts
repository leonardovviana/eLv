/**
 * Camada Gemini. Tudo aqui roda SÓ no servidor — a chave nunca chega ao browser.
 *
 * O free tier do Gemini é apertado (o Flash topo de linha roda na casa de ~20
 * requisições/dia) e o Google não expõe o saldo por API. Por isso este módulo é
 * construído em torno de três regras:
 *
 *   1. Nunca uma chamada por item — quem chama manda o lote inteiro.
 *   2. Toda chamada é registrada em `ai_runs`, que alimenta o contador na UI.
 *   3. Estouro de quota vira `GeminiQuotaError`, tratado como aviso e não como
 *      falha do app: sem IA o eLv continua 100% utilizável.
 */

// Configurável por env para dar para apontar a camada inteira a um servidor
// de mentira e testar retry, fallback e erro tipado sem depender do humor do
// Google. Em produção ninguém define isso.
const API_BASE =
  process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta/models";

export const MODEL_FAST = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
export const MODEL_HEAVY = process.env.GEMINI_MODEL_HEAVY || "gemini-3.7-flash";
export const MODEL_EMBED = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";

/** Dimensão dos embeddings. Ver nota em normalizeL2 e na migration. */
export const EMBED_DIMS = 768;

export class GeminiQuotaError extends Error {
  constructor(message = "Quota do Gemini esgotada por agora.") {
    super(message);
    this.name = "GeminiQuotaError";
  }
}

/**
 * O modelo existe, a chave está certa, a quota não estourou: o Google está
 * sobrecarregado. É o único erro da camada que vale a pena tentar de novo
 * daqui a pouco, e por isso tem tipo próprio: a tela precisa saber a
 * diferença entre "volta amanhã" (quota) e "tenta de novo agora".
 */
export class GeminiUnavailableError extends Error {
  readonly model?: string;

  constructor(
    message = "O Gemini está sobrecarregado agora. Tente de novo em instantes.",
    model?: string,
  ) {
    super(message);
    this.name = "GeminiUnavailableError";
    this.model = model;
  }
}

export class GeminiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function apiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("GEMINI_API_KEY não configurada.");
  return key;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Espera antes da próxima tentativa.
 *
 * Recuo exponencial com jitter. O jitter não é enfeite: sem ele, todo mundo
 * que tomou 503 ao mesmo tempo volta ao mesmo tempo, e a segunda onda derruba
 * de novo o serviço que estava se recuperando.
 */
function backoff(attempt: number, retryAfter?: string | null) {
  const hinted = Number(retryAfter);
  if (Number.isFinite(hinted) && hinted > 0) return Math.min(hinted * 1000, 10_000);

  const base = 900 * Math.pow(2.2, attempt);
  return Math.min(Math.round(base * (0.7 + Math.random() * 0.6)), 8000);
}

/** Quantas vezes insistir quando o outro lado está instável. */
const MAX_UNAVAILABLE_RETRIES = 3;

async function post(path: string, body: unknown, attempt = 0): Promise<any> {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey(),
    },
    body: JSON.stringify(body),
  });

  if (res.ok) return res.json();

  const text = await res.text().catch(() => "");

  // 429 = quota. Um retry só faz sentido se for limite POR MINUTO; se for o
  // limite diário, insistir só queima as requisições que ainda restam.
  // Por isso: no máximo uma nova tentativa, e depois desiste com erro tipado.
  if (res.status === 429) {
    if (attempt < 1 && !/per day|daily|PerDay/i.test(text)) {
      await sleep(backoff(attempt, res.headers.get("retry-after")));
      return post(path, body, attempt + 1);
    }
    throw new GeminiQuotaError(
      /per day|daily|PerDay/i.test(text)
        ? "Você atingiu o limite diário do Gemini. Volta a funcionar amanhã."
        : "Limite de requisições do Gemini atingido. Tente de novo em instantes.",
    );
  }

  // 500/503: instabilidade do lado deles. Insiste mais do que antes, porque
  // pico de demanda costuma passar em segundos, e desistir na segunda
  // tentativa devolvia erro para o usuário enquanto o serviço já voltava.
  if (res.status === 503 || res.status === 500 || res.status === 504) {
    if (attempt < MAX_UNAVAILABLE_RETRIES) {
      await sleep(backoff(attempt, res.headers.get("retry-after")));
      return post(path, body, attempt + 1);
    }

    // O modelo vem no caminho ("gemini-3.7-flash:generateContent").
    const model = path.split(":")[0];
    throw new GeminiUnavailableError(
      `O modelo ${model} está sobrecarregado no Google agora. Tente de novo em instantes.`,
      model,
    );
  }

  // Erro de verdade (404 de modelo inexistente, 400 de payload torto): a
  // mensagem do Google ajuda a depurar, mas não vai crua para a tela.
  throw new GeminiError(`Gemini respondeu ${res.status}: ${text.slice(0, 300)}`, res.status);
}

type GenerateOptions = {
  system?: string;
  schema?: Record<string, unknown>;
  model?: string;
  temperature?: number;
};

/**
 * Gera conteúdo. Com `schema`, força saída JSON válida e já devolve parseada —
 * evita gastar uma segunda requisição consertando resposta malformada.
 */
export async function generate<T = unknown>(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<T> {
  const model = opts.model || MODEL_FAST;

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      ...(opts.schema
        ? { responseMimeType: "application/json", responseSchema: opts.schema }
        : {}),
    },
  };

  if (opts.system) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }

  const json = await post(`${model}:generateContent`, body);

  const text: string =
    json?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("") ?? "";

  if (!text.trim()) {
    const reason = json?.candidates?.[0]?.finishReason;
    throw new GeminiError(
      reason ? `Resposta vazia do Gemini (${reason}).` : "Resposta vazia do Gemini.",
    );
  }

  if (!opts.schema) return text as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    // Rede de segurança: às vezes vem cercado de crase mesmo com schema.
    const match = text.match(/[[{][\s\S]*[\]}]/);
    if (match) return JSON.parse(match[0]) as T;
    throw new GeminiError("Gemini devolveu JSON inválido.");
  }
}

/**
 * Gera com plano B.
 *
 * Quando o modelo pesado está sobrecarregado, cair para o leve entrega uma
 * resposta pior que uma resposta boa, e infinitamente melhor que um erro
 * vermelho na tela. O pico de demanda do Google não é problema de quem só
 * queria melhorar uma nota.
 *
 * Devolve `degraded` para quem chamou poder AVISAR que a resposta saiu do
 * modelo leve. Trocar o modelo por baixo dos panos e não contar seria
 * economizar um erro e gastar confiança.
 */
export async function generateResilient<T = unknown>(
  prompt: string,
  opts: GenerateOptions & { fallbackModel?: string } = {},
): Promise<{ data: T; model: string; degraded: boolean }> {
  const primary = opts.model || MODEL_FAST;

  try {
    return { data: await generate<T>(prompt, opts), model: primary, degraded: false };
  } catch (err) {
    const fallback = opts.fallbackModel;
    if (!(err instanceof GeminiUnavailableError) || !fallback || fallback === primary) {
      throw err;
    }

    // Só uma queda, e só para sobrecarga. Se o plano B também estiver fora,
    // o erro sobe: insistir num terceiro modelo viraria loteria.
    const data = await generate<T>(prompt, { ...opts, model: fallback });
    return { data, model: fallback, degraded: true };
  }
}

/**
 * Normalização L2.
 *
 * O gemini-embedding-001 devolve 3072 dims por padrão e, quando truncado via
 * outputDimensionality, NÃO renormaliza o vetor (só o gemini-embedding-2 faz
 * isso sozinho). Normalizamos aqui.
 *
 * Note que a busca atual NÃO depende disto para estar correta: o operador
 * `<=>` do pgvector é distância de cosseno, que já divide pelas normas. Isto
 * existe para (a) deixar a porta aberta para trocar por inner product `<#>`,
 * que é mais rápido e aí sim exige norma 1, e (b) manter o centroide de
 * related_items bem comportado, já que a média de vetores de normas diferentes
 * pesa mais os maiores.
 *
 * O que de fato obriga a escolha de 768 é outra coisa: o índice HNSW do
 * pgvector não aceita mais de 2000 dimensões. Com os 3072 padrão não haveria
 * índice, e a busca viraria scan sequencial.
 */
export function normalizeL2(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum);
  if (!norm || !Number.isFinite(norm)) return vec;
  return vec.map((v) => v / norm);
}

type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/** Embeddings em lote, já normalizados. Devolve na mesma ordem da entrada. */
export async function embed(
  texts: string[],
  taskType: EmbedTask = "RETRIEVAL_DOCUMENT",
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const out: number[][] = [];
  const BATCH = 50; // a API rejeita lotes grandes demais

  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const json = await post(`${MODEL_EMBED}:batchEmbedContents`, {
      requests: slice.map((text) => ({
        model: `models/${MODEL_EMBED}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: EMBED_DIMS,
      })),
    });

    const embeddings = json?.embeddings;
    if (!Array.isArray(embeddings) || embeddings.length !== slice.length) {
      throw new GeminiError("Resposta de embedding com formato inesperado.");
    }

    for (const e of embeddings) out.push(normalizeL2(e.values as number[]));
  }

  return out;
}

/** Formato que o pgvector aceita por texto: "[0.1,0.2,...]". */
export function toPgVector(vec: number[]) {
  return `[${vec.join(",")}]`;
}
