"use client";

import * as React from "react";
import { useIdle, usePrefersReducedMotion } from "@/components/motion";

type Fragment = {
  id: string;
  title: string;
  why: string | null;
  stage: string;
};

/**
 * Modo sonho — o que o app faz quando você para.
 *
 * Um segundo cérebro só entrega valor quando algo guardado volta à tona. A
 * tela ociosa é o único momento em que dá para fazer isso sem atrapalhar
 * ninguém: em vez de escurecer, o app começa a lembrar em voz alta, puxando
 * fragmentos reais do acervo sobre uma constelação em deriva.
 *
 * Três decisões que sustentam isso:
 *
 *   · O overlay NÃO captura ponteiro nem foco. Qualquer movimento já o
 *     dissolve pelo hook de ociosidade, então prender o clique só criaria um
 *     jeito de ficar preso.
 *   · O canvas só existe enquanto o sonho está na tela. Deixá-lo montado
 *     rodaria rAF o dia inteiro atrás de um elemento invisível.
 *   · Com `prefers-reduced-motion`, o sonho não acontece. Não é um efeito
 *     opcional decorativo: é a tela inteira se mexendo.
 */
export function IdleDream({
  fragments,
  after = 50_000,
}: {
  fragments: Fragment[];
  after?: number;
}) {
  const idle = useIdle(after);
  const reduced = usePrefersReducedMotion();
  const active = idle && !reduced && fragments.length > 0;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 transition-opacity duration-[1200ms] ease-out"
      style={{ opacity: active ? 1 : 0, visibility: active ? "visible" : "hidden" }}
    >
      {active && <Dream fragments={fragments} />}
    </div>
  );
}

function Dream({ fragments }: { fragments: Fragment[] }) {
  const [index, setIndex] = React.useState(() => Math.floor(Math.random() * fragments.length));

  // Um fragmento a cada sete segundos: tempo de ler sem virar slideshow.
  React.useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % fragments.length);
    }, 7000);
    return () => clearInterval(id);
  }, [fragments.length]);

  const current = fragments[index];

  return (
    <>
      {/* Véu: escurece o app sem apagá-lo. O conteúdo continua legível
          atrás, porque a pessoa pode estar lendo — parada não é ausente. */}
      <div className="absolute inset-0 bg-[hsl(var(--background)/0.82)] backdrop-blur-[2px]" />

      <DreamCanvas />

      <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
        <p className="label mb-8 flex items-center gap-2.5 text-muted-foreground/70">
          <span className="beat" style={{ "--tone": "var(--plasma)" } as React.CSSProperties} />
          Em repouso · o cérebro está revisitando
        </p>

        {/* `key` no fragmento reinicia a animação a cada troca. */}
        <div key={current.id} className="max-w-2xl text-center">
          <p className="display-sm animate-rise-blur text-balance text-foreground/90">
            {current.title}
          </p>

          {current.why && (
            <p
              className="mx-auto mt-6 max-w-lg animate-fade-in text-pretty text-sm leading-relaxed text-muted-foreground"
              style={{ animationDelay: "500ms" }}
            >
              {current.why}
            </p>
          )}
        </div>

        <p
          className="label mt-14 animate-fade-in text-muted-foreground/45"
          style={{ animationDelay: "1.2s" }}
        >
          mova o mouse para voltar
        </p>
      </div>
    </>
  );
}

/**
 * Constelação em deriva.
 *
 * Partículas com velocidade constante e arestas desenhadas só entre vizinhos
 * próximos. O custo é O(n²) na contagem de nós, então a contagem é pequena e
 * derivada da largura da tela — num celular, trinta pontos já enchem a área,
 * e cento e vinte só gastariam bateria.
 */
function DreamCanvas() {
  const ref = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let frame = 0;

    type Dot = { x: number; y: number; vx: number; vy: number; r: number; hue: number };
    let dots: Dot[] = [];

    function resize() {
      const canvas = ref.current;
      if (!canvas || !ctx) return;

      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.round(Math.min(64, Math.max(22, (width * height) / 26000)));
      dots = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: Math.random() * 1.6 + 0.6,
        // A maioria fria (plasma), algumas ácidas: o mesmo código de cor do
        // resto do app — máquina em azul, memória forte em ácido.
        hue: Math.random() > 0.78 ? 73 : 189,
      }));
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      for (const d of dots) {
        d.x += d.vx;
        d.y += d.vy;

        // Envolve nas bordas em vez de quicar: quicar cria padrão visível de
        // acúmulo nos cantos depois de alguns minutos.
        if (d.x < -20) d.x = width + 20;
        if (d.x > width + 20) d.x = -20;
        if (d.y < -20) d.y = height + 20;
        if (d.y > height + 20) d.y = -20;
      }

      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const a = dots[i];
          const b = dots[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 > 26_000) continue;

          const alpha = (1 - dist2 / 26_000) * 0.16;
          ctx.strokeStyle = `hsl(189 100% 69% / ${alpha})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      for (const d of dots) {
        ctx.fillStyle = `hsl(${d.hue} 100% ${d.hue === 73 ? 62 : 69}% / 0.55)`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }

      frame = requestAnimationFrame(draw);
    }

    resize();
    frame = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}
