/**
 * Quebra o texto de um item em pedaços para embedding.
 *
 * Corta preferencialmente em fronteira de parágrafo e, na falta dela, de frase.
 * Cortar no meio de uma frase degrada o embedding: o vetor passa a representar
 * um fragmento sem sentido, e ele volta como "resultado relevante" em buscas
 * com que não tem nada a ver.
 */

const TARGET = 1000;
const OVERLAP = 150;
const MIN_CHUNK = 80;

export function chunkText(input: string, target = TARGET): string[] {
  const text = input.replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  if (text.length <= target) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + target, text.length);

    if (end < text.length) {
      const window = text.slice(start, end);
      const breakAt =
        window.lastIndexOf("\n\n") >= MIN_CHUNK
          ? window.lastIndexOf("\n\n")
          : window.lastIndexOf("\n") >= MIN_CHUNK
            ? window.lastIndexOf("\n")
            : Math.max(
                window.lastIndexOf(". "),
                window.lastIndexOf("! "),
                window.lastIndexOf("? "),
              );

      if (breakAt >= MIN_CHUNK) end = start + breakAt + 1;
    }

    const piece = text.slice(start, end).trim();
    if (piece.length >= MIN_CHUNK || chunks.length === 0) chunks.push(piece);
    else if (piece) chunks[chunks.length - 1] += "\n" + piece;

    if (end >= text.length) break;
    start = Math.max(end - OVERLAP, start + 1);
  }

  return chunks.filter(Boolean);
}

/** Texto que de fato vai para o embedding: título e resumo dão contexto ao vetor. */
export function embeddableText(item: {
  title?: string | null;
  summary?: string | null;
  why_useful?: string | null;
  content?: string | null;
  url?: string | null;
}) {
  return [item.title, item.summary, item.why_useful, item.url, item.content]
    .filter((v) => v && String(v).trim())
    .join("\n\n")
    .trim();
}

/** Hash estável do conteúdo — usado para não re-embeddar o que não mudou. */
export async function contentHash(text: string) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
