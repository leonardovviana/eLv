"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import { STAGES, type Area, type MapEdge, type MapNode, type Stage } from "@/lib/types";

/**
 * O jardim, em três dimensões.
 *
 * Terceira versão. A primeira desenhava plantas literais e virou pirulito. A
 * segunda trocou por hastes de luz: coerente, mas rala demais para a tela
 * principal, porque não havia matéria nenhuma, só linhas finas no vazio.
 *
 * Esta tem corpo. O acervo é um CANTEIRO CULTIVADO sobre piso polido:
 *
 *   · cada item é uma haste com uma COPA FACETADA no topo, iluminada de
 *     verdade, então cada face pega a luz num ângulo diferente e o objeto
 *     tem volume em vez de ser um disco colorido;
 *   · o piso REFLETE o campo, esmaecido. É o que separa "objetos flutuando
 *     no preto" de "objetos apoiados em algum lugar";
 *   · cada área tem seu CANTEIRO: anel gravado no chão, poça de luz por
 *     baixo e o nome flutuando na borda;
 *   · itens conectados são ligados por ARCOS entre as copas, então a rede que
 *     o mapa mostra em duas dimensões também existe aqui;
 *   · poeira em suspensão e uma névoa ao fundo dão profundidade ao ar.
 *
 * Como um item vira haste:
 *
 *   · ESTÁGIO define altura, tamanho da copa e marcas no talo. Semente é um
 *     grão pousado; enraizado é a haste mais alta, com duas marcas e um
 *     satélite em órbita.
 *   · VITALIDADE define altura e brilho: o que você não revisita baixa e
 *     apaga.
 *   · ÁREA define o matiz, nunca a saturação. Toda cor passa por um filtro
 *     que iguala saturação e luminosidade, senão o campo vira confete.
 *
 * Custo: sete `InstancedMesh` (haste, copa, halo, marca, satélite e os dois
 * reflexos), um `LineSegments` para os arcos e um `Points` para a poeira.
 * Nove chamadas de desenho para o campo inteiro, com qualquer tamanho de
 * acervo. A cena para quando a aba está escondida ou o canvas sai da tela.
 */

type Plant = {
  id: string;
  title: string;
  stage: Stage;
  vitality: number;
  areaName: string;
  x: number;
  z: number;
  height: number;
  crown: number;
  marks: number;
  orbits: boolean;
  color: THREE.Color;
  phase: number;
};

type Plot = { x: number; z: number; radius: number; color: THREE.Color; name: string };

/** Porte por estágio, antes do ajuste por vitalidade. */
const FORM: Record<Stage, { stem: number; crown: number; marks: number; orbits: boolean }> = {
  seed: { stem: 0, crown: 0.075, marks: 0, orbits: false },
  sprout: { stem: 1.1, crown: 0.08, marks: 0, orbits: false },
  grown: { stem: 1.8, crown: 0.115, marks: 1, orbits: false },
  rooted: { stem: 2.6, crown: 0.155, marks: 2, orbits: true },
  dormant: { stem: 0.6, crown: 0.06, marks: 0, orbits: false },
};

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const MAX_ARCS = 24;

/** Traz a cor da área para dentro do sistema: mantém o matiz, iguala o resto. */
function tuned(hex: string, vivid: number) {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  return color.setHSL(hsl.h, 0.5, 0.3 + 0.32 * vivid);
}

function radialTexture(stops: [number, string][], size = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Grid de blueprint dissolvido nas bordas, para o piso não terminar em aresta. */
function floorTexture() {
  const size = 1024;
  const step = size / 30;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.strokeStyle = "rgba(180, 208, 255, 0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 30; i++) {
    const p = Math.round(i * step) + 0.5;
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
  }
  ctx.stroke();

  const mask = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.08,
    size / 2,
    size / 2,
    size / 2,
  );
  mask.addColorStop(0, "rgba(0,0,0,1)");
  mask.addColorStop(0.62, "rgba(0,0,0,0.45)");
  mask.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Etiqueta do canteiro, desenhada num canvas e pendurada num sprite. */
function labelTexture(text: string, color: string) {
  const w = 512;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.font = "600 54px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text.toUpperCase(), w / 2, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Cilindro com degradê nas cores de vértice: base escura, topo aceso. */
function stemGeometry() {
  const geo = new THREE.CylinderGeometry(0.013, 0.03, 1, 6, 4, true);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) + 0.5;
    const shade = 0.1 + Math.pow(t, 1.5) * 0.9;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }

  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

export function GardenScene({
  nodes,
  edges,
  areas,
}: {
  nodes: MapNode[];
  edges?: MapEdge[];
  areas: Area[];
}) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [hover, setHover] = React.useState<{ plant: Plant; x: number; y: number } | null>(null);
  const router = useRouter();

  const routerRef = React.useRef(router);
  React.useEffect(() => {
    routerRef.current = router;
  }, [router]);

  React.useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const trash: { dispose: () => void }[] = [];
    const links = edges ?? [];

    // ── Plantio ───────────────────────────────────────────────────────
    const byArea = new Map<string, MapNode[]>();
    for (const node of nodes.slice(0, 220)) {
      const key = node.area_id ?? "sem-area";
      const list = byArea.get(key);
      if (list) list.push(node);
      else byArea.set(key, [node]);
    }

    const areaById = new Map(areas.map((a) => [a.id, a]));
    const keys = [...byArea.keys()];
    const plants: Plant[] = [];
    const plots: Plot[] = [];
    const indexById = new Map<string, number>();

    keys.forEach((key, ci) => {
      const group = byArea.get(key) ?? [];
      const area = areaById.get(key);

      const angle = (ci / Math.max(1, keys.length)) * Math.PI * 2;
      const ringRadius = 4.2 + Math.min(keys.length, 8) * 0.44;
      const cx = Math.cos(angle) * ringRadius;
      const cz = Math.sin(angle) * ringRadius;

      plots.push({
        x: cx,
        z: cz,
        radius: 0.62 * Math.sqrt(group.length + 1) + 0.55,
        color: tuned(area?.color ?? "#7f8da3", 0.75),
        name: area?.name ?? "Sem área",
      });

      group.forEach((node, k) => {
        const form = FORM[node.stage] ?? FORM.sprout;
        const v = Math.max(0, Math.min(100, node.vitality)) / 100;

        // Espiral de ângulo áureo: preenche o canteiro por igual, sem
        // sobreposição e sem o aspecto de grade plantada por máquina.
        const r = 0.62 * Math.sqrt(k + 0.5);
        const a = k * GOLDEN;

        // Semente é matéria nova, não memória fraca: entra clara mesmo com
        // força baixa.
        const vivid = node.stage === "seed" ? 0.85 : 0.2 + 0.8 * v;

        indexById.set(node.id, plants.length);
        plants.push({
          id: node.id,
          title: node.title,
          stage: node.stage,
          vitality: node.vitality,
          areaName: area?.name ?? "Sem área",
          x: cx + Math.cos(a) * r,
          z: cz + Math.sin(a) * r,
          height: form.stem * (0.52 + 0.48 * v),
          crown: form.crown * (0.8 + 0.2 * v),
          marks: form.marks,
          orbits: form.orbits,
          color:
            node.stage === "seed"
              ? tuned("#ff7a47", vivid)
              : tuned(area?.color ?? "#7f8da3", vivid),
          phase: (k * 1.7 + ci * 2.3) % (Math.PI * 2),
        });
      });
    });

    if (plants.length === 0) return;

    const n = plants.length;
    const orbiters = plants.filter((p) => p.orbits).length;
    const markCount = plants.reduce((sum, p) => sum + p.marks, 0);

    // ── Cena ──────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a0b0e, 13, 42);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 140);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    wrap.appendChild(renderer.domElement);
    trash.push(renderer);

    const el = renderer.domElement;
    el.style.display = "block";
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.touchAction = "pan-y";
    el.style.cursor = "grab";

    // ── Luz ───────────────────────────────────────────────────────────
    // As copas são facetadas e iluminadas: é a luz que dá volume a elas.
    scene.add(new THREE.AmbientLight(0x9fb4d0, 0.85));

    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(5, 9, 4);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x6fe8ff, 0.9);
    rim.position.set(-7, 3, -6);
    scene.add(rim);

    // ── Ar ────────────────────────────────────────────────────────────
    const hazeTex = radialTexture([
      [0, "rgba(120,170,220,0.5)"],
      [0.45, "rgba(90,130,190,0.12)"],
      [1, "rgba(0,0,0,0)"],
    ]);
    const hazeMat = new THREE.SpriteMaterial({
      map: hazeTex,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const haze = new THREE.Sprite(hazeMat);
    haze.scale.set(46, 26, 1);
    haze.position.set(0, 3.5, -12);
    scene.add(haze);
    trash.push(hazeTex, hazeMat);

    // ── Piso ──────────────────────────────────────────────────────────
    //
    // Duas camadas: o grid, e por cima um vidro escuro semitransparente que
    // afunda o reflexo desenhado abaixo dele.
    const floorTex = floorTexture();
    const floorGeo = new THREE.PlaneGeometry(36, 36);

    const gridMat = new THREE.MeshBasicMaterial({
      map: floorTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.8,
    });
    const grid = new THREE.Mesh(floorGeo, gridMat);
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = 0.002;
    scene.add(grid);

    const glassMat = new THREE.MeshBasicMaterial({
      color: 0x0a0b0e,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const glass = new THREE.Mesh(floorGeo, glassMat);
    glass.rotation.x = -Math.PI / 2;
    glass.position.y = 0.001;
    scene.add(glass);
    trash.push(floorTex, floorGeo, gridMat, glassMat);

    // ── Canteiros ─────────────────────────────────────────────────────
    const plotGlowTex = radialTexture([
      [0, "rgba(255,255,255,0.55)"],
      [0.5, "rgba(255,255,255,0.12)"],
      [1, "rgba(255,255,255,0)"],
    ]);
    trash.push(plotGlowTex);

    for (const plot of plots) {
      const ringGeo = new THREE.RingGeometry(plot.radius, plot.radius + 0.035, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: plot.color,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(plot.x, 0.02, plot.z);
      scene.add(ring);
      trash.push(ringGeo, ringMat);

      const glowGeo = new THREE.PlaneGeometry(plot.radius * 3.4, plot.radius * 3.4);
      const glowMat = new THREE.MeshBasicMaterial({
        map: plotGlowTex,
        color: plot.color,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(plot.x, 0.012, plot.z);
      scene.add(glow);
      trash.push(glowGeo, glowMat);

      // Nome da área. Sem isto o campo é bonito e ilegível: não dá para saber
      // qual aglomerado é qual sem passar o ponteiro em cima.
      const labelTex = labelTexture(plot.name, `#${plot.color.getHexString()}`);
      const labelMat = new THREE.SpriteMaterial({
        map: labelTex,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      });
      const label = new THREE.Sprite(labelMat);
      label.scale.set(1.9, 0.48, 1);
      label.position.set(plot.x, 0.36, plot.z + plot.radius + 0.45);
      scene.add(label);
      trash.push(labelTex, labelMat);
    }

    // ── Peças do campo ────────────────────────────────────────────────
    const stemGeo = stemGeometry();
    const stemMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      toneMapped: false,
    });
    const stems = new THREE.InstancedMesh(stemGeo, stemMat, n);

    // Octaedro: poucas faces, ângulos bem diferentes entre si. É a forma que
    // mais ganha com luz direcional sem custar geometria.
    const crownGeo = new THREE.OctahedronGeometry(1, 0);
    const crownMat = new THREE.MeshStandardMaterial({
      roughness: 0.25,
      metalness: 0.35,
      emissive: new THREE.Color(0x14171d),
      flatShading: true,
    });
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, n);

    const glowTex = radialTexture([
      [0, "rgba(255,255,255,1)"],
      [0.22, "rgba(255,255,255,0.3)"],
      [0.55, "rgba(255,255,255,0.06)"],
      [1, "rgba(255,255,255,0)"],
    ]);
    const haloGeo = new THREE.PlaneGeometry(1, 1);
    const haloMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.62,
    });
    const halos = new THREE.InstancedMesh(haloGeo, haloMat, n);

    const markGeo = new THREE.BoxGeometry(1, 0.013, 0.013);
    const markMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.7,
      toneMapped: false,
    });
    const marks = new THREE.InstancedMesh(markGeo, markMat, Math.max(1, markCount));

    // Satélite do enraizado: o item que já virou repertório tem algo girando
    // em volta. É a única peça que se move por conta própria.
    const orbitGeo = new THREE.SphereGeometry(1, 6, 5);
    const orbitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.85,
      toneMapped: false,
    });
    const orbs = new THREE.InstancedMesh(orbitGeo, orbitMat, Math.max(1, orbiters));

    // Reflexo: as mesmas peças espelhadas no piso, apagadas. O truque custa
    // duas chamadas de desenho e é o que apoia o campo no chão.
    const stemRefMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      toneMapped: false,
    });
    const crownRefMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      toneMapped: false,
    });
    const stemsRef = new THREE.InstancedMesh(stemGeo, stemRefMat, n);
    const crownsRef = new THREE.InstancedMesh(crownGeo, crownRefMat, n);

    scene.add(stemsRef, crownsRef, stems, marks, crowns, orbs, halos);
    trash.push(
      stemGeo,
      crownGeo,
      haloGeo,
      markGeo,
      orbitGeo,
      glowTex,
      stemMat,
      crownMat,
      haloMat,
      markMat,
      orbitMat,
      stemRefMat,
      crownRefMat,
    );

    // ── Arcos entre itens conectados ──────────────────────────────────
    //
    // A rede que o mapa mostra em duas dimensões também existe aqui. Os arcos
    // são estáticos: o balanço das hastes é pequeno demais para valer
    // recalcular a curva a cada quadro. O degradê vive nas cores de vértice.
    const usable = links
      .filter((e) => indexById.has(e.a) && indexById.has(e.b))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, MAX_ARCS);

    if (usable.length > 0) {
      const SEG = 14;
      const positions: number[] = [];
      const colors: number[] = [];
      const curve = new THREE.QuadraticBezierCurve3();
      const mid = new THREE.Vector3();
      const tint = new THREE.Color();

      for (const e of usable) {
        const a = plants[indexById.get(e.a)!];
        const b = plants[indexById.get(e.b)!];

        const from = new THREE.Vector3(a.x, a.height + a.crown, a.z);
        const to = new THREE.Vector3(b.x, b.height + b.crown, b.z);
        const span = from.distanceTo(to);

        mid.addVectors(from, to).multiplyScalar(0.5);
        mid.y += Math.min(1.1, 0.25 + span * 0.12);

        curve.v0.copy(from);
        curve.v1.copy(mid);
        curve.v2.copy(to);

        const points = curve.getPoints(SEG);
        for (let i = 0; i < points.length - 1; i++) {
          positions.push(points[i].x, points[i].y, points[i].z);
          positions.push(points[i + 1].x, points[i + 1].y, points[i + 1].z);

          // Mais aceso no meio do arco: as pontas se dissolvem nas copas em
          // vez de encostar nelas com um risco duro.
          for (const at of [i / SEG, (i + 1) / SEG]) {
            const fade = Math.sin(at * Math.PI);
            tint.copy(a.color).lerp(b.color, at).multiplyScalar(0.25 + fade * 0.75);
            colors.push(tint.r, tint.g, tint.b);
          }
        }
      }

      const arcGeo = new THREE.BufferGeometry();
      arcGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      arcGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

      const arcMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      scene.add(new THREE.LineSegments(arcGeo, arcMat));
      trash.push(arcGeo, arcMat);
    }

    // ── Poeira em suspensão ───────────────────────────────────────────
    const DUST = reduced ? 0 : 160;
    let dustPositions: Float32Array | null = null;
    let dust: THREE.Points | null = null;

    if (DUST > 0) {
      dustPositions = new Float32Array(DUST * 3);
      for (let i = 0; i < DUST; i++) {
        dustPositions[i * 3] = (Math.random() - 0.5) * 26;
        dustPositions[i * 3 + 1] = Math.random() * 7;
        dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 26;
      }

      const dustGeo = new THREE.BufferGeometry();
      dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));

      const dustTex = radialTexture(
        [
          [0, "rgba(255,255,255,0.9)"],
          [0.5, "rgba(255,255,255,0.15)"],
          [1, "rgba(255,255,255,0)"],
        ],
        32,
      );
      const dustMat = new THREE.PointsMaterial({
        size: 0.075,
        map: dustTex,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      });

      dust = new THREE.Points(dustGeo, dustMat);
      scene.add(dust);
      trash.push(dustGeo, dustTex, dustMat);
    }

    // ── Cores por instância ───────────────────────────────────────────
    const dim = new THREE.Color();

    let oc = 0;
    let mc = 0;
    for (let i = 0; i < n; i++) {
      const p = plants[i];
      crowns.setColorAt(i, p.color);
      halos.setColorAt(i, p.color);
      stems.setColorAt(i, dim.copy(p.color).multiplyScalar(0.85));
      crownsRef.setColorAt(i, p.color);
      stemsRef.setColorAt(i, dim.copy(p.color).multiplyScalar(0.85));

      for (let m = 0; m < p.marks; m++) {
        marks.setColorAt(mc++, dim.copy(p.color).multiplyScalar(0.9));
      }
      if (p.orbits) orbs.setColorAt(oc++, dim.copy(p.color).multiplyScalar(1.15));
    }

    for (const mesh of [crowns, halos, stems, crownsRef, stemsRef, marks, orbs]) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // ── Composição das matrizes ───────────────────────────────────────
    const dummy = new THREE.Object3D();
    const base = new THREE.Matrix4();
    const local = new THREE.Matrix4();
    const spin = new THREE.Matrix4();
    const tilt = new THREE.Matrix4().makeRotationZ(0.45);
    const out = new THREE.Matrix4();
    const mirrored = new THREE.Matrix4();
    const mirror = new THREE.Matrix4().makeScale(1, -1, 1);
    const scratch = new THREE.Vector3();

    function layout(t: number) {
      let mCursor = 0;
      let oCursor = 0;

      for (let i = 0; i < n; i++) {
        const p = plants[i];

        // Balanço: a inclinação nasce na base, então a haste verga em vez de
        // deslizar. Haste baixa balança menos, como na vida.
        const amp = reduced ? 0 : 0.028 * (0.3 + p.height);
        dummy.position.set(p.x, 0, p.z);
        dummy.rotation.set(
          Math.sin(t * 0.75 + p.phase) * amp,
          0,
          Math.cos(t * 0.58 + p.phase) * amp * 0.7,
        );
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        base.copy(dummy.matrix);

        const h = p.height;
        const top = h + p.crown * 0.8;

        // Haste
        local.makeTranslation(0, h / 2, 0).scale(scratch.set(1, h || 0.0001, 1));
        out.multiplyMatrices(base, local);
        stems.setMatrixAt(i, out);
        stemsRef.setMatrixAt(i, mirrored.multiplyMatrices(mirror, out));

        // Copa, girando devagar para as faces trocarem de luz
        spin.makeRotationY(t * 0.25 + p.phase);
        local.makeTranslation(0, top, 0).multiply(spin).multiply(tilt);
        local.scale(scratch.set(p.crown, p.crown * 1.35, p.crown));
        out.multiplyMatrices(base, local);
        crowns.setMatrixAt(i, out);
        crownsRef.setMatrixAt(i, mirrored.multiplyMatrices(mirror, out));

        // Marcas de escala no talo
        for (let m = 0; m < p.marks; m++) {
          const at = h * (0.6 + m * 0.18);
          local.makeTranslation(0, at, 0).scale(scratch.set(p.crown * 2.2, 1, 1));
          out.multiplyMatrices(base, local);
          marks.setMatrixAt(mCursor++, out);
        }

        // Satélite do enraizado
        if (p.orbits) {
          const a = t * 0.8 + p.phase;
          const rr = p.crown * 2.6;
          const s = p.crown * 0.22;
          local
            .makeTranslation(
              Math.cos(a) * rr,
              top + Math.sin(a * 1.3) * p.crown * 0.6,
              Math.sin(a) * rr,
            )
            .scale(scratch.set(s, s, s));
          out.multiplyMatrices(base, local);
          orbs.setMatrixAt(oCursor++, out);
        }

        // Halo: plano voltado para a câmera, em posição de mundo.
        scratch.set(0, top, 0).applyMatrix4(base);
        dummy.position.copy(scratch);
        dummy.quaternion.copy(camera.quaternion);
        const halo = p.crown * (p.stage === "seed" ? 11 : 14);
        dummy.scale.set(halo, halo, halo);
        dummy.updateMatrix();
        halos.setMatrixAt(i, dummy.matrix);
      }

      for (const mesh of [stems, stemsRef, crowns, crownsRef, halos, marks, orbs]) {
        mesh.instanceMatrix.needsUpdate = true;
      }

      if (dust && dustPositions) {
        for (let i = 0; i < DUST; i++) {
          const y = dustPositions[i * 3 + 1] + 0.0035;
          dustPositions[i * 3 + 1] = y > 7 ? 0 : y;
        }
        dust.geometry.attributes.position.needsUpdate = true;
      }
    }

    // ── Câmera orbital ────────────────────────────────────────────────
    const narrow = wrap.clientWidth < 560;
    let theta = -0.6;
    let phi = narrow ? 1.12 : 1.3;
    let radius = (narrow ? 21 : 14.5) + Math.min(plants.length, 200) * 0.012;

    function placeCamera() {
      camera.position.set(
        Math.sin(phi) * Math.cos(theta) * radius,
        Math.cos(phi) * radius,
        Math.sin(phi) * Math.sin(theta) * radius,
      );
      camera.lookAt(0, 1.15, 0);
    }

    function resize() {
      const w = wrap!.clientWidth;
      const h = wrap!.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      radius = (w < 560 ? 21 : 14.5) + Math.min(plants.length, 200) * 0.012;
      camera.updateProjectionMatrix();
      placeCamera();
    }

    // ── Ponteiro ──────────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragging = false;
    let moved = 0;
    let lastX = 0;
    let lastY = 0;
    let hoverIndex = -1;
    let pickQueued = false;

    function onDown(e: PointerEvent) {
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    }

    function onMove(e: PointerEvent) {
      const rect = el.getBoundingClientRect();

      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        moved += Math.abs(dx) + Math.abs(dy);
        lastX = e.clientX;
        lastY = e.clientY;

        theta -= dx * 0.006;
        phi = Math.max(0.72, Math.min(1.44, phi - dy * 0.004));
        placeCamera();
        return;
      }

      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (pickQueued) return;
      pickQueued = true;

      requestAnimationFrame(() => {
        pickQueued = false;
        raycaster.setFromCamera(pointer, camera);
        // O alvo é o halo, não a copa: a copa tem um quinto de unidade e
        // seria impossível acertar com o dedo.
        const hit = raycaster.intersectObject(halos, false)[0];
        const id = hit?.instanceId ?? -1;

        if (id === hoverIndex) return;
        hoverIndex = id;
        el.style.cursor = id >= 0 ? "pointer" : "grab";
        setHover(
          id >= 0
            ? {
                plant: plants[id],
                x: Math.min(e.clientX - rect.left + 14, Math.max(8, rect.width - 250)),
                y: Math.max(e.clientY - rect.top - 10, 8),
              }
            : null,
        );
      });
    }

    function onUp(e: PointerEvent) {
      if (dragging && moved < 6 && hoverIndex >= 0) {
        // O clique navega; o arraste gira. Sem o limiar de movimento, toda
        // tentativa de girar o campo terminaria abrindo um item.
        routerRef.current.push(`/item/${plants[hoverIndex].id}`);
      }
      dragging = false;
      el.style.cursor = hoverIndex >= 0 ? "pointer" : "grab";
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // O ponteiro pode já ter sido liberado pelo próprio browser.
      }
    }

    function onLeave() {
      dragging = false;
      hoverIndex = -1;
      setHover(null);
      el.style.cursor = "grab";
    }

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onLeave);

    // ── Laço ──────────────────────────────────────────────────────────
    let frame = 0;
    let running = false;
    const clock = new THREE.Clock();

    function tick() {
      const t = clock.getElapsedTime();

      if (!dragging && !reduced) {
        theta += 0.0006;
        placeCamera();
      }

      layout(t);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    }

    function start() {
      if (running) return;
      running = true;
      clock.start();
      frame = requestAnimationFrame(tick);
    }

    function stop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(frame);
      clock.stop();
    }

    resize();
    layout(0);
    renderer.render(scene, camera);

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting && !document.hidden ? start() : stop()),
      { threshold: 0.05 },
    );
    io.observe(wrap);

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onLeave);

      // Sem isto, cada visita à tela deixa geometrias e texturas na GPU.
      for (const item of trash) item.dispose();
      el.remove();
    };
  }, [nodes, edges, areas]);

  return (
    <div ref={wrapRef} className="relative h-full w-full select-none">
      {hover && (
        <div
          className="pointer-events-none absolute z-10 max-w-[240px] animate-fade-in rounded-md bg-[hsl(var(--popover))] px-3 py-2 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.1),0_18px_36px_-18px_hsl(0_0%_0%/0.9)]"
          style={{ left: hover.x, top: hover.y }}
        >
          <p className="line-clamp-2 text-xs leading-snug text-foreground">{hover.plant.title}</p>
          <p className="datum mt-1">
            {STAGES[hover.plant.stage]?.label ?? hover.plant.stage} · {hover.plant.areaName} · força{" "}
            {hover.plant.vitality}
          </p>
        </div>
      )}
    </div>
  );
}
