"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * Transição entre telas.
 *
 * Duas camadas independentes, de propósito:
 *
 *   · `PageTransition` remonta o conteúdo a cada rota e roda a animação de
 *     ENTRADA. Funciona em qualquer navegador, e é a garantia mínima.
 *   · View Transitions nativas (no CSS) fazem o cruzamento com a tela ANTERIOR
 *     onde houver suporte. É melhoria, nunca requisito.
 *
 * Não existe animação de saída em JS aqui: para isso seria preciso segurar a
 * árvore antiga montada enquanto a nova chega, o que atrasa a navegação real
 * para ganhar um efeito. Velocidade percebida vale mais que simetria.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="route-enter">
      {children}
    </div>
  );
}

/**
 * Fio de progresso da navegação.
 *
 * O Next navega sem feedback quando a rota é dinâmica e o servidor demora:
 * a tela fica parada e parece travada. Este fio aparece no clique e some
 * quando o pathname muda.
 *
 * Escuta o clique no documento em vez de exigir um componente de link
 * especial — assim vale para todo link do app, inclusive os que ainda nem
 * foram escritos.
 */
export function NavProgress() {
  const pathname = usePathname();

  // Guarda o DESTINO do clique, não um booleano. Assim o fio apaga sozinho
  // quando o pathname alcança o destino, sem um efeito observando a rota só
  // para chamar `setState(false)` em todo navegação.
  const [target, setTarget] = React.useState<string | null>(null);
  const active = target !== null && target !== pathname;

  React.useEffect(() => {
    function onClick(event: MouseEvent) {
      // Cliques com modificador abrem em outra aba: não há navegação aqui.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const anchor = (event.target as Element | null)?.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/") || anchor.target === "_blank") return;
      if (href === window.location.pathname) return;

      setTarget(href.split("?")[0]);
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  // Rede de segurança: navegação cancelada, ou destino que nunca chega,
  // deixaria o fio preso na tela.
  React.useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => setTarget(null), 8000);
    return () => clearTimeout(id);
  }, [active]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-px overflow-hidden"
    >
      <span
        className="block h-full origin-left bg-acid transition-[transform,opacity] duration-700 ease-out"
        style={{
          transform: active ? "scaleX(0.82)" : "scaleX(0)",
          opacity: active ? 1 : 0,
        }}
      />
    </div>
  );
}
