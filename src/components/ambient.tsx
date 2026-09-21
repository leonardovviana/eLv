/**
 * Camadas atmosféricas do app — grid de blueprint, dois halos em deriva e
 * uma camada de grão. Tudo é `fixed` e decorativo: fica atrás de qualquer
 * conteúdo, não recebe ponteiro e não entra na árvore de acessibilidade.
 *
 * O grão é um SVG inline em data URI em vez de imagem: some do waterfall de
 * rede e continua nítido em qualquer densidade de tela.
 */
const GRAIN =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">
      <filter id="n">
        <feTurbulence type="fractalNoise" baseFrequency="0.86" numOctaves="4" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
      <rect width="180" height="180" filter="url(#n)" opacity="0.5"/>
    </svg>`,
  );

export function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Grid técnico, esmaecido nas bordas para não virar papel quadriculado. */}
      <div
        className="blueprint absolute inset-0"
        style={{
          maskImage:
            "radial-gradient(120% 90% at 50% 0%, black 10%, rgba(0,0,0,0.55) 45%, transparent 85%)",
          WebkitMaskImage:
            "radial-gradient(120% 90% at 50% 0%, black 10%, rgba(0,0,0,0.55) 45%, transparent 85%)",
        }}
      />

      {/* Halo ácido no alto à esquerda: a luz que dá volume ao preto. */}
      <div
        className="absolute -left-[18%] -top-[28%] h-[58vmax] w-[58vmax] animate-drift-a rounded-full opacity-[0.16] blur-[120px]"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--acid)) 0%, hsl(var(--acid) / 0.25) 40%, transparent 70%)",
        }}
      />

      {/* Contraluz plasma, mais fria, embaixo à direita. */}
      <div
        className="absolute -bottom-[32%] -right-[16%] h-[52vmax] w-[52vmax] animate-drift-b rounded-full opacity-[0.14] blur-[130px]"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--plasma)) 0%, hsl(var(--plasma) / 0.22) 42%, transparent 70%)",
        }}
      />

      {/* Vinheta: puxa o olho para o centro e sela as bordas. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(130% 100% at 50% 0%, transparent 35%, hsl(var(--background)) 100%)",
        }}
      />

      {/* Grão por cima de tudo: tira o plástico dos gradientes. */}
      <div
        className="absolute inset-0 opacity-[0.16] mix-blend-overlay"
        style={{ backgroundImage: `url("${GRAIN}")`, backgroundSize: "180px 180px" }}
      />
    </div>
  );
}
