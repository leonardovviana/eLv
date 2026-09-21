/**
 * Gera os ícones do PWA a partir de um SVG inline.
 *
 * Rode com: npm run generate:icons
 *
 * Os PNGs ficam fora do git (ver .gitignore) porque são derivados — quem
 * clonar o projeto roda este script e tem os mesmos arquivos de volta.
 *
 * O desenho repete a linguagem do app: fundo quase preto, marcas de mira nos
 * cantos e um "e" em traço ácido. Nada de texto renderizado — o ícone é
 * geometria pura, então independe de fonte instalada na máquina de quem gera.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public");

const BG = "#08090C";
const ACID = "#D4FF3D";

/** `maskable` reserva a margem que o Android recorta, e vira o fundo redondo. */
function svg(size, { maskable = false } = {}) {
  const pad = maskable ? size * 0.2 : size * 0.12;
  const box = size - pad * 2;
  const stroke = Math.max(2, box * 0.06);
  const r = size * (maskable ? 0.5 : 0.22);

  const cx = size / 2;
  const cy = size / 2;
  const rad = box * 0.28;

  // Marcas de canto: o mesmo detalhe que aparece no hover dos cartões.
  const t = box * 0.16; // comprimento do tique
  const o = pad * 0.92; // distância da borda
  const tick = (x1, y1, x2, y2) =>
    `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="${ACID}" stroke-width="${stroke * 0.55}" stroke-linecap="square" opacity="0.55"/>`;

  const corners = maskable
    ? ""
    : [
        tick(o, o + t, o, o),
        tick(o, o, o + t, o),
        tick(size - o - t, size - o, size - o, size - o),
        tick(size - o, size - o, size - o, size - o - t),
      ].join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="${BG}"/>
  ${corners}
  <circle cx="${cx}" cy="${cy}" r="${rad * 1.5}" fill="none" stroke="${ACID}" stroke-width="${stroke * 0.4}" opacity="0.22"/>
  <path d="M ${cx - rad * 0.72} ${cy + rad * 0.06}
           h ${rad * 1.44}
           a ${rad * 0.72} ${rad * 0.72} 0 1 0 -${rad * 0.32} ${rad * 0.6}"
        fill="none" stroke="${ACID}" stroke-width="${stroke}"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${cx + rad * 0.95}" cy="${cy - rad * 0.95}" r="${stroke * 0.85}" fill="${ACID}"/>
</svg>`;
}

const TARGETS = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
  { file: "apple-touch-icon.png", size: 180, maskable: false },
];

await mkdir(outDir, { recursive: true });

for (const { file, size, maskable } of TARGETS) {
  const buffer = await sharp(Buffer.from(svg(size, { maskable })))
    .png({ compressionLevel: 9 })
    .toBuffer();

  await writeFile(join(outDir, file), buffer);
  console.log(`  ${file}  ${size}x${size}${maskable ? " (maskable)" : ""}`);
}

console.log("\nÍcones gerados em public/");
