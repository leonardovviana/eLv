"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Area, BrainMap, MapNode } from "@/lib/types";
import { STAGES } from "@/lib/types";

type Sim = MapNode & { x: number; y: number; vx: number; vy: number; r: number; color: string };

/**
 * Constelação do acervo.
 *
 * Layout por força, calculado no cliente e desenhado em canvas:
 *
 *   · SVG com 140 nós e suas arestas custaria 140+ elementos no DOM, cada um
 *     recalculando estilo a cada quadro. Canvas desenha tudo num contexto só.
 *   · A simulação NÃO roda para sempre. `alpha` decai até um piso e o layout
 *     congela; depois disso o rAF só redesenha com uma oscilação mínima, o
 *     que mantém a tela viva sem manter a CPU ocupada.
 *   · A posição inicial é um círculo, não aleatória: começar espalhado ao
 *     acaso produz um emaranhado que leva segundos para se desfazer.
 *
 * O grafo é de LEITURA. Clicar num nó abre o item — arrastar para reorganizar
 * seria brinquedo bonito que ninguém usa duas vezes.
 */
export function Constellation({
  map,
  areas,
  height = 460,
}: {
  map: BrainMap;
  areas: Area[];
  height?: number;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [hover, setHover] = React.useState<{ node: Sim; x: number; y: number } | null>(null);
  const router = useRouter();

  const areaColor = React.useMemo(() => {
    const m = new Map(areas.map((a) => [a.id, a.color]));
    return (id: string | null) => (id && m.get(id)) || "#64748b";
  }, [areas]);

  // Refs para o laço de animação não depender de estado do React.
  const nodesRef = React.useRef<Sim[]>([]);
  const hoverRef = React.useRef<Sim | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const glow = makeGlow();

    let width = wrap.clientWidth;
    let h = height;
    let alpha = 1;
    let frame = 0;
    let time = 0;

    const index = new Map<string, number>();
    const nodes: Sim[] = map.nodes.map((n, i) => {
      index.set(n.id, i);
      const angle = (i / Math.max(1, map.nodes.length)) * Math.PI * 2;
      const radius = Math.min(width, h) * 0.32;
      return {
        ...n,
        x: width / 2 + Math.cos(angle) * radius,
        y: h / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        // Tamanho carrega significado: nó grande é memória forte.
        r: 3 + (n.vitality / 100) * 5,
        color: areaColor(n.area_id),
      };
    });

    nodesRef.current = nodes;

    const edges = map.edges
      .map((e) => ({ a: index.get(e.a), b: index.get(e.b), score: e.score }))
      .filter((e): e is { a: number; b: number; score: number } => e.a !== undefined && e.b !== undefined);

    function resize() {
      if (!canvas || !wrap || !ctx) return;
      width = wrap.clientWidth;
      h = height;
      canvas.width = width * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      alpha = Math.max(alpha, 0.35);
    }

    function step() {
      if (alpha < 0.008) return;

      // Repulsão entre todos os pares. O laço é O(n²); com o teto de nós que
      // `brain_map` impõe, isso é alguns milhares de operações por quadro —
      // barato o bastante para não valer um quadtree e a complexidade dele.
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let dist2 = dx * dx + dy * dy;

          // Nós exatamente sobrepostos dariam divisão por zero e sumiriam
          // no infinito: um empurrãozinho aleatório desempata.
          if (dist2 < 0.01) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
            dist2 = 0.01;
          }
          if (dist2 > 40_000) continue;

          const force = (620 / dist2) * alpha;
          const dist = Math.sqrt(dist2);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
      }

      // Molas nas arestas: o que está ligado se aproxima.
      for (const e of edges) {
        const a = nodes[e.a];
        const b = nodes[e.b];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const target = 78;
        const force = ((dist - target) / dist) * 0.022 * alpha;

        a.vx += dx * force;
        a.vy += dy * force;
        b.vx -= dx * force;
        b.vy -= dy * force;
      }

      // Gravidade para o centro: sem ela, nós sem aresta escapam da moldura.
      for (const n of nodes) {
        n.vx += (width / 2 - n.x) * 0.0022 * alpha;
        n.vy += (h / 2 - n.y) * 0.0022 * alpha;

        n.vx *= 0.86;
        n.vy *= 0.86;
        n.x += n.vx;
        n.y += n.vy;

        // Moldura com margem do raio, para o nó não ser cortado na borda.
        const pad = n.r + 6;
        n.x = Math.max(pad, Math.min(width - pad, n.x));
        n.y = Math.max(pad, Math.min(h - pad, n.y));
      }

      alpha *= 0.985;
    }

    function draw() {
      if (!ctx) return;
      time += 0.01;
      ctx.clearRect(0, 0, width, h);

      for (const e of edges) {
        const a = nodes[e.a];
        const b = nodes[e.b];
        const active = hoverRef.current === a || hoverRef.current === b;

        ctx.strokeStyle = active
          ? "hsl(73 100% 62% / 0.45)"
          : `hsl(200 30% 70% / ${0.05 + e.score * 0.09})`;
        ctx.lineWidth = active ? 1 : 0.55;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Brilho de todos os nós numa passada aditiva, antes dos núcleos. Com
      // `lighter`, sobreposição soma luz em vez de tapar o que está atrás,
      // e aglomerados acendem sozinhos.
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.stage === "seed") continue;

        const active = hoverRef.current === n;
        const breath = reduced ? 0 : Math.sin(time + i) * 0.3;
        const halo = (n.r + breath) * (active ? 9 : 6.5);

        ctx.globalAlpha = (0.12 + (n.vitality / 100) * 0.3) * (active ? 2.2 : 1);
        ctx.drawImage(glow, n.x - halo, n.y - halo, halo * 2, halo * 2);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const active = hoverRef.current === n;

        // Respiração: amplitude minúscula e fase deslocada por índice, senão
        // a constelação inteira pulsaria junto como uma luz de natal.
        const breath = reduced ? 0 : Math.sin(time + i) * 0.3;
        const r = n.r + breath + (active ? 2 : 0);

        if (n.stage === "seed") {
          // Semente: anel vazado. O contorno diz "ainda não é seu".
          ctx.strokeStyle = hexWithAlpha("#ff7a47", active ? 1 : 0.75);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.stroke();
          continue;
        }

        ctx.fillStyle = hexWithAlpha(n.color, active ? 1 : 0.55 + (n.vitality / 100) * 0.4);
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();

        // Enraizado ganha um anel fino em volta: a mesma marca de maturidade
        // do selo de estágio e das hastes do jardim.
        if (n.stage === "rooted" || active) {
          ctx.strokeStyle = hexWithAlpha(n.color, active ? 0.8 : 0.35);
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 3.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      frame = requestAnimationFrame(loop);
    }

    function loop() {
      step();
      draw();
    }

    resize();
    frame = requestAnimationFrame(loop);

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // Aba escondida: nada para desenhar, e o rAF do Chrome já pausa — mas o
    // Safari não garante isso em todas as versões.
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(frame);
      else frame = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [map, areaColor, height]);

  function pick(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    let best: Sim | null = null;
    let bestDist = 18 * 18;

    for (const n of nodesRef.current) {
      const dx = n.x - x;
      const dy = n.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }

    hoverRef.current = best;

    // A posição do rótulo sai daqui, do evento, onde a largura real já está
    // medida. Ler o ref durante o render para fazer esse clamp é justamente o
    // tipo de leitura que quebra quando o React reordena trabalho.
    setHover(
      best
        ? {
            node: best,
            x: Math.min(Math.max(best.x + 14, 8), Math.max(8, rect.width - 250)),
            y: Math.max(best.y - 8, 8),
          }
        : null,
    );
  }

  return (
    <div ref={wrapRef} className="relative w-full select-none" style={{ height }}>
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-crosshair rounded-lg"
        onPointerMove={pick}
        onPointerLeave={() => {
          hoverRef.current = null;
          setHover(null);
        }}
        onClick={() => {
          if (hoverRef.current) router.push(`/item/${hoverRef.current.id}`);
        }}
      />

      {hover && (
        <div
          className="pointer-events-none absolute z-10 max-w-[240px] animate-fade-in rounded-md bg-[hsl(var(--popover))] px-3 py-2 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.1),0_18px_36px_-18px_hsl(0_0%_0%/0.9)]"
          style={{ left: hover.x, top: hover.y }}
        >
          <p className="line-clamp-2 text-xs leading-snug text-foreground">{hover.node.title}</p>
          <p className="mt-1 datum">
            {STAGES[hover.node.stage]?.label ?? hover.node.stage}
            <span className="mx-1.5 text-muted-foreground/40">·</span>
            força {hover.node.vitality}
          </p>
        </div>
      )}

      {map.nodes.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Nada para desenhar ainda.
        </p>
      )}
    </div>
  );
}

/**
 * Sprite de brilho, desenhado uma vez e reaproveitado.
 *
 * `createRadialGradient` por nó, por quadro, seria centenas de gradientes
 * novos por segundo. Um canvas de 64px desenhado com `drawImage` custa uma
 * cópia de textura e dá o mesmo resultado.
 */
function makeGlow() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.35, "rgba(255,255,255,0.22)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/** Hex do banco (#7c3aed) para rgba — o canvas não aceita alfa separado. */
function hexWithAlpha(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(100, 116, 139, ${alpha})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
