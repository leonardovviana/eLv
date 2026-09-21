import type { ItemKind } from "@/lib/types";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Primeira linha não-vazia do markdown, sem marcação, como título de fallback. */
export function deriveTitle(content: string, fallback = "Sem título") {
  const line = content
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").replace(/[*_`>#-]/g, "").trim())
    .find((l) => l.length > 0);
  return line ? line.slice(0, 120) : fallback;
}

export function isUrl(value: string) {
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Tipo inferido do texto cru colado na captura.
 *
 * Vive aqui, e não na server action, porque a barra de captura mostra ao vivo
 * o tipo que o item vai receber. Duas cópias da regra divergiriam na primeira
 * vez que alguém mexesse numa delas.
 */
export function guessKind(raw: string): ItemKind {
  const text = raw.trim();
  if (!isUrl(text)) {
    return /^```|^\s{4}\S|;\s*$|=>/m.test(text) ? "snippet" : "note";
  }
  return /^https?:\/\/(www\.)?github\.com\/[^/]+\/[^/]+/i.test(text) ? "repo" : "link";
}

/**
 * Vitalidade — espelho em TypeScript de `item_vitality` no Postgres.
 *
 * Existe porque nem todo lugar vem de `due_queue`: um cartão montado a partir
 * de `items` precisa da mesma leitura sem uma ida ao banco. As duas fórmulas
 * precisam andar juntas — se uma mudar, a outra muda no mesmo commit, senão o
 * mesmo item mostra forças diferentes em duas telas.
 */
export function vitalityOf(item: {
  strength?: number | null;
  last_reviewed_at?: string | null;
  interval_days?: number | null;
}) {
  const strength = item.strength ?? 0;
  if (!item.last_reviewed_at) return strength;

  const days = (Date.now() - new Date(item.last_reviewed_at).getTime()) / 86_400_000;
  const interval = Math.max(item.interval_days ?? 0, 1);
  const overdue = Math.max(0, days / interval - 1);

  return Math.max(0, Math.min(100, Math.round(strength * Math.exp(-0.5 * overdue))));
}

/**
 * Data de revisão em linguagem humana.
 *
 * "2026-10-02T13:04:11Z" não diz nada num cartão. "vence em 3 dias" e
 * "vencido há 2 dias" dizem, e a diferença entre os dois é o que faz a fila
 * parecer urgente ou tranquila.
 */
export function dueLabel(next: string | null | undefined) {
  if (!next) return null;

  const diff = new Date(next).getTime() - Date.now();
  const days = Math.round(diff / 86_400_000);

  if (diff < 0) {
    const late = Math.abs(days);
    if (late === 0) return { text: "vence hoje", overdue: true };
    if (late === 1) return { text: "vencido ontem", overdue: true };
    return { text: `vencido há ${late} dias`, overdue: true };
  }

  if (days === 0) return { text: "vence hoje", overdue: true };
  if (days === 1) return { text: "volta amanhã", overdue: false };
  if (days < 30) return { text: `volta em ${days} dias`, overdue: false };

  const months = Math.round(days / 30);
  return { text: months === 1 ? "volta em 1 mês" : `volta em ${months} meses`, overdue: false };
}

/**
 * Atraso em dias, já calculado pelo banco, virando texto.
 *
 * Existe para a tela não precisar reconstruir uma data a partir do número
 * só para formatar: `due_queue` devolve `days_overdue` pronto, e fabricar um
 * `new Date(Date.now() - ...)` no meio do render é trabalho e impureza à toa.
 */
export function overdueLabel(days: number) {
  const late = Math.round(days);
  if (late <= 0) return "vence hoje";
  if (late === 1) return "vencido ontem";
  return `vencido há ${late} dias`;
}

/** "há 3 dias", para datas de captura. */
export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "";

  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return "agora";
  if (seconds < 3600) return `há ${Math.floor(seconds / 60)} min`;
  if (seconds < 86_400) return `há ${Math.floor(seconds / 3600)} h`;

  const days = Math.floor(seconds / 86_400);
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;

  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "há 1 mês" : `há ${months} meses`;

  const years = Math.floor(months / 12);
  return years === 1 ? "há 1 ano" : `há ${years} anos`;
}
