"use client";

import * as React from "react";

/**
 * Primitivas de movimento.
 *
 * Regras que valem para todas:
 *
 *   1. Nada aqui usa estado do React por quadro. Animação que re-renderiza a
 *      árvore a 60fps trava a interface inteira; o que se mexe é escrito
 *      direto no nó (transform, custom property) dentro de um rAF.
 *   2. Toda peça funciona SEM JavaScript rodando. O estado inicial visível é
 *      sempre o final — o JS só adiciona o caminho até ele.
 *   3. `prefers-reduced-motion` desliga de verdade, não só encurta.
 */

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Preferência de movimento do sistema.
 *
 * Media query é uma fonte externa que muda sozinha: ler com
 * `useSyncExternalStore` dá o valor certo no primeiro render do cliente e
 * reage à troca, sem o render extra de um `setState` dentro de efeito.
 */
export function usePrefersReducedMotion() {
  return React.useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_QUERY).matches,
    // No servidor ninguém se mexe: assumir "sem redução" faria o HTML inicial
    // prometer animação para quem pediu para não ter nenhuma.
    () => true,
  );
}

/**
 * Número que sobe até o valor.
 *
 * Escreve em `textContent` dentro do rAF em vez de `setState`: um contador de
 * quatro dígitos animando por um segundo são ~60 re-renders do React por
 * número na tela, e o painel tem seis deles.
 */
export function CountUp({
  value,
  duration = 900,
  className,
  format,
}: {
  value: number;
  duration?: number;
  className?: string;
  format?: (n: number) => string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const fmt = format ?? ((n: number) => String(n));

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.textContent = fmt(value);
      return;
    }

    const from = Number(node.dataset.value ?? 0);
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutExpo: quase todo o movimento acontece no começo, então o
      // número "chega" rápido e só assenta no fim.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      node.textContent = fmt(Math.round(from + (value - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else node.dataset.value = String(value);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  // O valor final já vai no HTML do servidor: sem JS, o número aparece certo.
  return (
    <span ref={ref} className={className} data-value={0} data-numeric>
      {fmt(value)}
    </span>
  );
}

/**
 * Ondinha a partir do ponto clicado.
 *
 * O nó da onda é criado e removido na mão — mantê-lo em estado faria o
 * componente inteiro re-renderizar a cada clique só para desenhar um círculo.
 */
export function useRipple<T extends HTMLElement>() {
  return React.useCallback((event: React.PointerEvent<T>) => {
    const host = event.currentTarget;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const rect = host.getBoundingClientRect();
    const dot = document.createElement("span");
    dot.className = "ripple-dot";
    dot.style.left = `${event.clientX - rect.left}px`;
    dot.style.top = `${event.clientY - rect.top}px`;
    host.appendChild(dot);
    dot.addEventListener("animationend", () => dot.remove(), { once: true });
  }, []);
}

/**
 * Quanto tempo a pessoa está parada.
 *
 * `pointermove` é o evento mais barulhento da web: sem o corte por tempo,
 * cada pixel de movimento reagendaria o timer. Aqui o timer só é reiniciado
 * uma vez por intervalo curto.
 */
export function useIdle(ms = 45_000) {
  const [idle, setIdle] = React.useState(false);

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let last = 0;

    const wake = () => {
      const now = Date.now();
      setIdle((was) => (was ? false : was));
      if (now - last < 400) return;
      last = now;
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), ms);
    };

    const events: (keyof DocumentEventMap)[] = [
      "pointermove",
      "pointerdown",
      "keydown",
      "wheel",
      "touchstart",
      "scroll",
    ];

    events.forEach((e) => document.addEventListener(e, wake, { passive: true }));

    // Voltar para a aba não é atividade suficiente para acordar, mas sair
    // dela precisa parar o relógio: senão a pessoa volta depois do almoço e
    // encontra a animação rodando desde então, de graça.
    const onVisibility = () => {
      if (document.hidden) {
        clearTimeout(timer);
        setIdle(false);
      } else {
        wake();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    timer = setTimeout(() => setIdle(true), ms);

    return () => {
      clearTimeout(timer);
      events.forEach((e) => document.removeEventListener(e, wake));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ms]);

  return idle;
}
