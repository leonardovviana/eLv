"use client";

import { useEffect } from "react";

/**
 * Um único listener no documento alimenta a luz de todos os cartões.
 *
 * A alternativa — `onMouseMove` em cada cartão — criaria dezenas de handlers
 * e um re-render do React por pixel de movimento. Aqui nada re-renderiza:
 * escrevemos duas custom properties direto no nó, dentro de um rAF, e o
 * gradiente de `.spotlight` se reposiciona no compositor.
 *
 * Em telas de toque o efeito não faz sentido e nem roda: `pointermove` com
 * `pointerType` diferente de mouse é ignorado.
 */
export function PointerGlow() {
  useEffect(() => {
    let frame = 0;
    let last: HTMLElement | null = null;

    function onMove(event: PointerEvent) {
      if (event.pointerType !== "mouse") return;
      if (frame) return;

      frame = requestAnimationFrame(() => {
        frame = 0;
        const target =
          (event.target as Element | null)?.closest<HTMLElement>(".spotlight") ?? null;

        if (target !== last && last) {
          last.style.removeProperty("--mx");
          last.style.removeProperty("--my");
        }
        last = target;
        if (!target) return;

        const rect = target.getBoundingClientRect();
        target.style.setProperty("--mx", `${event.clientX - rect.left}px`);
        target.style.setProperty("--my", `${event.clientY - rect.top}px`);
      });
    }

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
