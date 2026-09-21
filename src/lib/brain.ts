import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EMPTY_PULSE,
  type ActivityDay,
  type BrainMap,
  type DueItem,
  type Move,
  type Pulse,
} from "@/lib/types";

/**
 * Leitura do estado do cérebro.
 *
 * Tudo aqui é consulta — nada escreve. As telas chamam estas funções em vez de
 * montar as próprias queries, para que "o que conta como item vivo" tenha uma
 * definição só. Na v1 cada página filtrava `status` do seu jeito e a home
 * contava itens que a área não contava.
 */

export async function getPulse(supabase: SupabaseClient): Promise<Pulse> {
  const { data, error } = await supabase.rpc("brain_pulse");
  if (error || !data) return EMPTY_PULSE;
  return { ...EMPTY_PULSE, ...(data as Partial<Pulse>) };
}

export async function getDueQueue(supabase: SupabaseClient, limit = 12): Promise<DueItem[]> {
  const { data } = await supabase.rpc("due_queue", { p_limit: limit });
  return (data ?? []) as DueItem[];
}

export async function getActivity(supabase: SupabaseClient, days = 28): Promise<ActivityDay[]> {
  const { data } = await supabase.rpc("activity_days", { p_days: days });
  return (data ?? []) as ActivityDay[];
}

export async function getBrainMap(supabase: SupabaseClient, limit = 140): Promise<BrainMap> {
  const { data } = await supabase.rpc("brain_map", { p_limit: limit });
  const map = (data ?? {}) as Partial<BrainMap>;
  return { nodes: map.nodes ?? [], edges: map.edges ?? [] };
}

/**
 * Decide o próximo movimento.
 *
 * A prioridade não é estética, é o que mantém o ciclo girando:
 *
 *   1. Jardim vazio          → plantar, senão não há app.
 *   2. Revisão vencida       → o que já está dentro perde valor a cada dia.
 *   3. Sementes acumulando   → inbox cheio mata a vontade de capturar.
 *   4. Fora da busca         → item não indexado é item invisível.
 *   5. Nada capturado hoje   → o hábito é diário.
 *   6. Tudo em dia           → descanso explícito, não uma tela vazia.
 *
 * "Conectar" fica fora da fila principal de propósito: é a ação mais lenta e
 * a menos urgente, e só aparece quando há acervo indexado o bastante.
 */
export function nextMove(pulse: Pulse): Move {
  if (pulse.total === 0) {
    return {
      id: "plant",
      label: "Primeiro movimento",
      title: "Plante o jardim",
      detail:
        "Seu cérebro está vazio. Capture a primeira coisa, ou deixe o app plantar um acervo de partida para você ver o ciclo girando.",
      href: "/fluxo",
      cta: "Começar",
      tone: "acid",
    };
  }

  if (pulse.due > 0) {
    return {
      id: "review",
      label: "Próximo movimento",
      title: pulse.due === 1 ? "1 item pede revisão" : `${pulse.due} itens pedem revisão`,
      detail:
        "Memória decai. Cada revisão empurra o item mais para longe no tempo e aumenta a força dele no seu repertório.",
      href: "/revisar",
      cta: "Revisar agora",
      tone: "acid",
      count: pulse.due,
    };
  }

  if (pulse.seeds > 0) {
    return {
      id: "distill",
      label: "Próximo movimento",
      title:
        pulse.seeds === 1 ? "1 semente esperando" : `${pulse.seeds} sementes esperando`,
      detail:
        "Destilar é o que transforma um link colado em conhecimento seu: título, área, resumo e para que serve. A IA faz o lote inteiro numa chamada.",
      href: "/fluxo",
      cta: "Destilar",
      tone: "plasma",
      count: pulse.seeds,
    };
  }

  if (pulse.unindexed > 0) {
    return {
      id: "index",
      label: "Próximo movimento",
      title:
        pulse.unindexed === 1
          ? "1 item fora da busca"
          : `${pulse.unindexed} itens fora da busca`,
      detail:
        "Item sem índice semântico só é encontrável pela palavra exata. Indexar é uma chamada só, para o lote inteiro.",
      href: "/config",
      cta: "Indexar",
      tone: "ember",
      count: pulse.unindexed,
    };
  }

  if (pulse.links === 0 && pulse.total >= 4) {
    return {
      id: "connect",
      label: "Próximo movimento",
      title: "Nenhuma conexão ainda",
      detail:
        "O valor de um segundo cérebro não está nos itens, está entre eles. Veja o que seu acervo já sugere ligar.",
      href: "/mapa",
      cta: "Abrir o mapa",
      tone: "plasma",
    };
  }

  if (pulse.captured_today === 0) {
    return {
      id: "capture",
      label: "Próximo movimento",
      title: "Nada capturado hoje",
      detail:
        "A fila está em dia. O que passou pela sua frente hoje e merecia não se perder?",
      href: "/fluxo",
      cta: "Capturar",
      tone: "muted",
    };
  }

  return {
    id: "rest",
    label: "Tudo em dia",
    title: "O cérebro está em ordem",
    detail:
      "Sem revisão vencida, sem semente parada, tudo indexado. Volte amanhã, ou vasculhe o que você já sabe.",
    href: "/buscar",
    cta: "Vasculhar",
    tone: "muted",
  };
}

/**
 * Vitalidade média traduzida em palavra.
 *
 * O número sozinho ("62") não diz se é bom ou ruim. O rótulo dá a leitura, e
 * é ele que aparece grande no painel.
 */
export function vitalityLabel(v: number) {
  if (v >= 80) return { word: "Afiado", tone: "text-acid" };
  if (v >= 55) return { word: "Firme", tone: "text-acid" };
  if (v >= 30) return { word: "Esfriando", tone: "text-plasma" };
  if (v > 0) return { word: "Apagando", tone: "text-ember" };
  return { word: "Adormecido", tone: "text-muted-foreground" };
}
