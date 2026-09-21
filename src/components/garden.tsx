"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import type { Area, MapNode } from "@/lib/types";

/**
 * Carregamento do jardim.
 *
 * O Three.js é a maior dependência do app de longe. Ele entra por importação
 * dinâmica e sem SSR por dois motivos: renderizar WebGL no servidor é
 * impossível, e quem abre o Fluxo ou a Busca não deve baixar um motor 3D que
 * não vai usar. O pacote só desce quando esta tela aparece.
 *
 * Se o aparelho não tiver WebGL (ou estiver com aceleração desligada), o
 * componente some e a lista de áreas embaixo continua respondendo por tudo.
 * O jardim é a melhor forma de ler o acervo, não a única.
 */
const Scene = dynamic(() => import("./garden-scene").then((m) => m.GardenScene), {
  ssr: false,
  loading: () => <div className="scanning h-full w-full bg-[hsl(0_0%_100%/0.02)]" />,
});

/** Memorizado: `useSyncExternalStore` chama isto a cada render, e criar um
 *  canvas de teste por render seria lixo puro para o coletor. */
let webglSupport: boolean | null = null;

function hasWebGL() {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement("canvas");
    webglSupport = Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") || canvas.getContext("webgl")),
    );
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

export function Garden({ nodes, areas }: { nodes: MapNode[]; areas: Area[] }) {
  const supported = React.useSyncExternalStore(
    () => () => {},
    hasWebGL,
    // No servidor assumimos que dá: o mesmo HTML vale para todo mundo, e a
    // checagem real acontece no primeiro quadro do cliente.
    () => true,
  );

  if (!supported || nodes.length === 0) return null;

  // A altura vem do CSS, não de um media query em JavaScript: menos estado,
  // e o canvas já se redimensiona sozinho por ResizeObserver.
  return (
    <>
      {/* Sem esta linha o jardim é bonito e mudo: é ela que ensina que porte
          é estágio e brilho é força. Vive aqui, e não na página, porque uma
          instrução de arrastar sem nada para arrastar seria mentira. */}
      <p className="px-5 py-3 text-[13px] text-muted-foreground shadow-[inset_0_-1px_0_0_hsl(0_0%_100%/0.06)]">
        Cada planta é um item. O porte conta o estágio, o brilho conta a força, a cor conta a área.{" "}
        <span className="text-foreground/70">Arraste para girar, clique para abrir.</span>
      </p>

      <div className="h-[320px] w-full sm:h-[400px] lg:h-[460px]">
        <Scene nodes={nodes} areas={areas} />
      </div>
    </>
  );
}
