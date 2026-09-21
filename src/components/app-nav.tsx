"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Compass,
  Layers,
  Map as MapIcon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Waves,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRipple } from "@/components/motion";

export type NavState = {
  seeds: number;
  due: number;
  vitality: number;
  streak: number;
};

/**
 * Navegação.
 *
 * A v1 tinha cinco abas irmãs, todas do mesmo peso, e nenhuma dizia o que
 * fazer primeiro. Aqui a barra DESENHA O CICLO: Fluxo, Revisar e Mapa ficam
 * amarrados por um fio com um pulso descendo, porque é isso que eles são,
 * três etapas de um movimento que volta ao início. Hoje fica acima como
 * painel, Buscar e Trilhas abaixo como ferramentas, Config fora da fileira.
 *
 * Quem olha de relance aprende o produto pela forma da navegação, antes de
 * ler qualquer rótulo.
 */

/** Altura de cada linha, em pixels. Fixa porque o indicador deslizante
 *  calcula a posição a partir dela em vez de medir o DOM: medir exigiria
 *  layout effect e estado, e um render a mais em toda troca de rota. */
const ROW = 42;

type Row =
  | { kind: "head"; label: string }
  | {
      kind: "item";
      href: string;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      badge?: "seeds" | "due";
      thread?: boolean;
    };

const ROWS: Row[] = [
  { kind: "item", href: "/", label: "Hoje", icon: Waves },
  { kind: "head", label: "Ciclo" },
  { kind: "item", href: "/fluxo", label: "Fluxo", icon: Layers, badge: "seeds", thread: true },
  { kind: "item", href: "/revisar", label: "Revisar", icon: Sparkles, badge: "due", thread: true },
  { kind: "item", href: "/mapa", label: "Mapa", icon: MapIcon, thread: true },
  { kind: "head", label: "Ferramentas" },
  { kind: "item", href: "/buscar", label: "Buscar", icon: Search },
  { kind: "item", href: "/trilhas", label: "Trilhas", icon: Compass },
];

/** No celular cabem quatro dedos e o polegar no meio, que é sempre capturar. */
const DOCK = [
  { href: "/", label: "Hoje", icon: Waves },
  { href: "/fluxo", label: "Fluxo", icon: Layers, badge: "seeds" as const },
  { href: "/revisar", label: "Revisar", icon: Sparkles, badge: "due" as const },
  { href: "/mapa", label: "Mapa", icon: MapIcon },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Vibração curta no toque. Só onde existe, e nunca no desktop. */
function tap() {
  try {
    navigator.vibrate?.(8);
  } catch {
    // Alguns navegadores expõem a API e recusam a chamada fora de gesto.
  }
}

/** Monograma: um "e" dentro de um alvo quadrado, com o ponto vivo. */
export function Monogram({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--surface-sunken))] shadow-[inset_0_0_0_1px_hsl(var(--acid)/0.3)]",
        className,
      )}
    >
      <span className="font-display text-xl font-semibold leading-none tracking-[-0.06em] text-acid">
        e
      </span>
      <span className="absolute right-1.5 top-1.5 h-1 w-1 animate-breathe rounded-full bg-acid" />
    </span>
  );
}

function Count({ n, tone }: { n: number; tone: "acid" | "plasma" }) {
  if (n <= 0) return null;
  return (
    <span
      className={cn(
        "animate-pop-in rounded-[3px] px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums",
        tone === "acid" ? "bg-acid text-acid-foreground" : "bg-plasma text-[hsl(var(--background))]",
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

/**
 * `route` existe para a bancada de QA (`/preview`) conseguir montar a barra
 * como ela aparece em cada tela. Em uso normal ninguém passa isso e a rota
 * vem do router, como deve ser.
 */
export function SidebarNav({ state, route }: { state: NavState; route?: string }) {
  const current = usePathname();
  const pathname = route ?? current;

  // Posição do indicador: índice da linha ativa vezes a altura fixa. Nenhum
  // ref, nenhuma medição, nenhum quadro de atraso na troca de rota.
  const activeRow = ROWS.findIndex((r) => r.kind === "item" && isActive(pathname, r.href));

  const cycleStart = ROWS.findIndex((r) => r.kind === "item" && r.thread);
  const cycleEnd = ROWS.map((r) => r.kind === "item" && r.thread).lastIndexOf(true);

  return (
    <aside className="sticky top-0 hidden h-dvh w-[76px] shrink-0 flex-col p-3 shadow-[inset_-1px_0_0_0_hsl(0_0%_100%/0.06)] md:flex lg:w-[248px] lg:p-5">
      <Link
        href="/"
        className="group flex items-center gap-3 rounded-md px-1 py-1"
        aria-label="eLv, ir para Hoje"
      >
        <Monogram className="transition-transform duration-500 ease-spring group-hover:scale-105" />
        <span className="hidden leading-none lg:block">
          <span className="block font-display text-xl font-semibold tracking-[-0.04em] text-foreground">
            eLv
          </span>
          <span className="datum mt-1.5 block">segundo cérebro</span>
        </span>
      </Link>

      <div className="rule my-5" />

      <nav className="relative">
        {/* Indicador único que DESLIZA entre as linhas. Um fundo por item
            acenderia e apagaria; deslizar mostra de onde você veio. */}
        {activeRow >= 0 && (
          <span
            aria-hidden
            className="absolute inset-x-0 rounded-md bg-[hsl(var(--surface-raised))] shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.07)] transition-transform duration-500 ease-spring"
            style={{ height: ROW - 2, transform: `translateY(${activeRow * ROW}px)` }}
          />
        )}

        {/* O fio do ciclo, com o pulso descendo. */}
        {cycleStart >= 0 && (
          <span
            aria-hidden
            className="thread absolute left-[16px] hidden lg:block"
            style={{
              top: cycleStart * ROW + 6,
              height: (cycleEnd - cycleStart + 1) * ROW - 12,
            }}
          />
        )}

        <ul className="relative">
          {ROWS.map((row, i) =>
            row.kind === "head" ? (
              <li
                key={`h-${row.label}`}
                style={{ height: ROW }}
                className="flex items-end pb-2 pl-3"
              >
                <span className="hidden text-[11px] uppercase tracking-[0.14em] text-muted-foreground/50 lg:block">
                  {row.label}
                </span>
                {/* No rail estreito o rótulo não cabe: vira um traço. */}
                <span aria-hidden className="h-px w-5 bg-[hsl(0_0%_100%/0.1)] lg:hidden" />
              </li>
            ) : (
              <NavRow
                key={row.href}
                row={row}
                active={i === activeRow}
                state={state}
                height={ROW}
              />
            ),
          )}
        </ul>
      </nav>

      <div className="mt-auto">
        <div className="rule mb-4" />

        {/* Força do cérebro sempre à vista: a barra é o dado que muda sozinho
            enquanto você usa o app, e é o que torna a lateral algo vivo em
            vez de um índice parado. */}
        <div className="mb-4 hidden px-1 lg:block">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-muted-foreground">Força</span>
            <span className="font-mono text-[13px] tabular-nums text-foreground">
              {state.vitality}
            </span>
          </div>
          <span className="meter mt-2">
            <span style={{ width: `${Math.max(2, state.vitality)}%` }} />
          </span>
          {state.streak > 0 && (
            <p className="datum mt-2.5">
              {state.streak} {state.streak === 1 ? "dia seguido" : "dias seguidos"}
            </p>
          )}
        </div>

        <Link
          href="/config"
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors duration-200",
            isActive(pathname, "/config")
              ? "bg-[hsl(var(--surface-raised))] text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Settings className="h-4 w-4 shrink-0 transition-transform duration-700 ease-out hover:rotate-90" />
          <span className="hidden lg:block">Config</span>
        </Link>

        <p className="mt-3 hidden items-center gap-2 px-3 text-[11px] text-muted-foreground/60 lg:flex">
          <kbd className="rounded-[3px] bg-[hsl(0_0%_100%/0.05)] px-1.5 py-0.5 font-mono shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.08)]">
            ⌘K
          </kbd>
          capturar
        </p>
      </div>
    </aside>
  );
}

function NavRow({
  row,
  active,
  state,
  height,
}: {
  row: Extract<Row, { kind: "item" }>;
  active: boolean;
  state: NavState;
  height: number;
}) {
  const Icon = row.icon;
  const n = row.badge === "seeds" ? state.seeds : row.badge === "due" ? state.due : 0;

  return (
    <li style={{ height }} className="pb-0.5">
      <Link
        href={row.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex h-10 items-center justify-center gap-3 rounded-md px-2.5 text-sm transition-colors duration-200 lg:justify-start lg:pl-3.5 lg:pr-2.5",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {/* Nó do ciclo: o ponto senta em cima do fio e acende quando é aqui
            que você está. */}
        {row.thread && (
          <span
            aria-hidden
            className={cn(
              // Esconde no rail estreito: com 52px úteis, o nó e o ícone
              // disputam o mesmo espaço e o resultado lê como sujeira.
              "absolute left-[14px] hidden h-1.5 w-1.5 rounded-full transition-all duration-500 ease-spring lg:block",
              active
                ? "scale-150 bg-acid"
                : "scale-100 bg-[hsl(var(--surface-raised))] shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.18)] group-hover:bg-[hsl(var(--acid)/0.5)]",
            )}
          />
        )}

        {/* `lg:ml-3` em toda linha, com ou sem nó: a coluna do fio fica
            reservada e os rótulos alinham numa única vertical. */}
        <Icon
          className={cn(
            "h-4 w-4 shrink-0 transition-all duration-500 ease-spring lg:ml-3",
            active ? "scale-110 text-acid" : "group-hover:scale-110",
          )}
        />

        <span className="hidden truncate lg:block">{row.label}</span>

        <span className="ml-auto hidden lg:block">
          <Count n={n} tone={row.badge === "due" ? "acid" : "plasma"} />
        </span>

        {/* No rail estreito o contador não cabe: vira um ponto no canto. */}
        {n > 0 && (
          <span
            aria-hidden
            className="absolute right-2.5 top-1.5 h-1.5 w-1.5 animate-breathe rounded-full bg-acid lg:hidden"
          />
        )}

        <span className="sr-only">
          {n > 0 ? `${row.label}, ${n} pendentes` : row.label}
        </span>
      </Link>
    </li>
  );
}

/**
 * Dock do celular.
 *
 * Flutua em vez de ocupar altura fixa: no celular, altura é o recurso mais
 * escasso. O item ativo é marcado por uma peça que desliza, o botão do meio
 * é o único elevado, e a barra encolhe conforme você rola, devolvendo a tela
 * para o conteúdo sem esconder a navegação.
 */
export function BottomNav({ state, route }: { state: NavState; route?: string }) {
  const current = usePathname();
  const pathname = route ?? current;
  const ripple = useRipple<HTMLButtonElement>();

  const activeIndex = DOCK.findIndex((d) => isActive(pathname, d.href));
  // As colunas 0 e 1 ficam à esquerda do botão central; 2 e 3 à direita, já
  // pulando a coluna dele.
  const slot = activeIndex < 0 ? -1 : activeIndex < 2 ? activeIndex : activeIndex + 1;

  function openCommand() {
    tap();
    // A paleta escuta ⌘K no documento. Disparar o evento em vez de exportar
    // um estado global mantém o dock sem dependência do componente dela.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
  }

  return (
    <nav
      className="dock fixed inset-x-3 z-40 md:hidden"
      style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="glass relative grid grid-cols-5 items-stretch rounded-2xl p-1.5 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.09),0_20px_40px_-16px_hsl(0_0%_0%/0.9)]">
        {/* Peça que desliza por baixo do item ativo. */}
        {slot >= 0 && (
          <span
            aria-hidden
            className="absolute bottom-1.5 top-1.5 w-[calc(20%-0.375rem)] rounded-xl bg-[hsl(var(--surface-raised))] shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.07)] transition-transform duration-500 ease-spring"
            style={{ left: "0.375rem", transform: `translateX(calc(${slot} * (100% + 0.375rem)))` }}
          />
        )}

        {DOCK.slice(0, 2).map((link) => (
          <DockLink key={link.href} link={link} pathname={pathname} state={state} />
        ))}

        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={openCommand}
            onPointerDown={ripple}
            aria-label="Capturar"
            className="ripple-host relative -mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-acid text-acid-foreground shadow-[0_0_0_1px_hsl(var(--acid)/0.5),0_14px_34px_-10px_hsl(var(--acid)/0.7)] transition-transform duration-300 ease-spring active:scale-90"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>

        {DOCK.slice(2).map((link) => (
          <DockLink key={link.href} link={link} pathname={pathname} state={state} />
        ))}
      </div>
    </nav>
  );
}

function DockLink({
  link,
  pathname,
  state,
}: {
  link: (typeof DOCK)[number];
  pathname: string;
  state: NavState;
}) {
  const Icon = link.icon;
  const active = isActive(pathname, link.href);
  const n = link.badge === "seeds" ? state.seeds : link.badge === "due" ? state.due : 0;

  return (
    <Link
      href={link.href}
      onClick={tap}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative z-10 flex flex-col items-center justify-center gap-1 rounded-xl py-2 transition-colors duration-300",
        active ? "text-acid" : "text-muted-foreground",
      )}
    >
      <span className="relative">
        <Icon
          className={cn(
            "h-[18px] w-[18px] transition-transform duration-500 ease-spring",
            active && "-translate-y-0.5 scale-110",
          )}
        />
        {n > 0 && (
          <span className="absolute -right-2 -top-1.5 h-1.5 w-1.5 animate-breathe rounded-full bg-acid" />
        )}
      </span>

      {/* O rótulo some conforme a pessoa rola: com o conteúdo em movimento,
          o ícone já basta, e a barra devolve altura para a leitura. */}
      <span className="dock-label text-[10px] leading-none">{link.label}</span>
    </Link>
  );
}
