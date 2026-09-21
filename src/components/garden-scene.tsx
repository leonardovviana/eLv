"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import { STAGES, type Area, type MapNode, type Stage } from "@/lib/types";

/**
 * O jardim, em três dimensões.
 *
 * A primeira versão desenhava plantas literais: haste fina, bola grande no
 * topo, anel horizontal em volta. Virou pirulito, e seis cores de área em
 * bolas saturadas transformaram um app de instrumento numa caixa de balas.
 *
 * Esta versão abandona a flora literal. O acervo vira um CAMPO DE HASTES DE
 * LUZ: cada item é uma agulha que sobe do chão, escura na base e acesa na
 * ponta, com marcas de escala no talo. É a mesma gramática do resto do app
 * (hairline, marca de mira, numeral mono) levada para a perspectiva.
 *
 * Como um item vira haste:
 *
 *   · ESTÁGIO define altura e marcas. Semente é um grão pousado no chão,
 *     broto é haste lisa, crescido ganha uma marca, enraizado ganha duas.
 *   · VITALIDADE define brilho e altura. O que você não revisita baixa e
 *     apaga, e o campo inteiro murcha à vista.
 *   · ÁREA define o matiz, mas não a saturação: toda cor entra por um filtro
 *     que iguala saturação e luminosidade. O campo lê como um material só,
 *     com variação de matiz, em vez de seis cores brigando.
 *
 * Decisões de implementação:
 *
 *   1. Quatro `InstancedMesh` (haste, ponta, halo, marca) para o campo
 *      inteiro. Duzentas hastes custam quatro chamadas de desenho.
 *   2. O brilho da ponta é um HALO em plano voltado para a câmera, com
 *      blending aditivo e textura de gradiente. É bloom sem passe de
 *      pós-processamento, que custaria mais do que a cena toda.
 *   3. O degradê da haste está nas CORES DE VÉRTICE da geometria, e a cor da
 *      área entra multiplicando por instância. Assim cada haste tem base
 *      escura e ponta acesa sem um shader customizado.
 *   4. A cena para quando ninguém está vendo: aba escondida ou canvas fora da
 *      viewport cancelam o laço.
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
  tip: number;
  marks: number;
  color: THREE.Color;
  phase: number;
};

/** Altura e marcas por estágio, antes do ajuste por vitalidade. */
const FORM: Record<Stage, { stem: number; tip: number; marks: number }> = {
  seed: { stem: 0, tip: 0.075, marks: 0 },
  sprout: { stem: 1.15, tip: 0.062, marks: 0 },
  grown: { stem: 1.85, tip: 0.082, marks: 1 },
  rooted: { stem: 2.7, tip: 0.105, marks: 2 },
  dormant: { stem: 0.6, tip: 0.05, marks: 0 },
};

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * Traz a cor da área para dentro do sistema.
 *
 * Mantém o matiz (é o que identifica a área) e força saturação e
 * luminosidade para uma faixa estreita. Sem isso, o roxo #7c3aed e o âmbar
 * #f59e0b chegam com energias completamente diferentes e o campo vira
 * confete.
 */
function tuned(hex: string, vivid: number) {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  return color.setHSL(hsl.h, 0.48, 0.26 + 0.34 * vivid);
}

/** Textura do halo: um ponto de luz que some nas bordas. */
function glowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.32)");
  g.addColorStop(0.55, "rgba(255,255,255,0.07)");
  g.addColorStop(1, "rgba(255,255,255,0)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Textura do chão: o grid de blueprint do app, dissolvido nas bordas.
 *
 * O `GridHelper` desenhava linhas duras até o fim do plano e cortava a cena
 * num retângulo. Aqui o grid é pintado num canvas e recortado por um
 * gradiente radial, então o chão nasce no centro e se desfaz no escuro, sem
 * aresta nenhuma.
 */
function groundTexture() {
  const size = 1024;
  const step = size / 28;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.strokeStyle = "rgba(190, 214, 255, 0.17)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 28; i++) {
    const p = Math.round(i * step) + 0.5;
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
  }
  ctx.stroke();

  // Um sopro de luz no centro, para o chão ter volume em vez de ser um
  // xadrez chapado.
  const bloom = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  bloom.addColorStop(0, "rgba(120, 160, 210, 0.09)");
  bloom.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, size, size);

  // Recorte radial: tudo que está longe do centro perde alfa.
  const mask = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.1,
    size / 2,
    size / 2,
    size / 2,
  );
  mask.addColorStop(0, "rgba(0,0,0,1)");
  mask.addColorStop(0.6, "rgba(0,0,0,0.5)");
  mask.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Cilindro com degradê nas cores de vértice: base escura, ponta acesa. */
function stemGeometry() {
  const geo = new THREE.CylinderGeometry(0.011, 0.026, 1, 5, 4, true);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    // y vai de -0.5 (base) a 0.5 (topo) na geometria unitária.
    const t = pos.getY(i) + 0.5;
    const shade = 0.12 + Math.pow(t, 1.6) * 0.88;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }

  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

export function GardenScene({ nodes, areas }: { nodes: MapNode[]; areas: Area[] }) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [hover, setHover] = React.useState<{ plant: Plant; x: number; y: number } | null>(null);
  const router = useRouter();

  // O laço da cena vive fora do React e precisa navegar. O router entra por
  // um ref atualizado em efeito: escrever o ref no corpo do componente
  // significaria tocar em estado mutável durante o render.
  const routerRef = React.useRef(router);
  React.useEffect(() => {
    routerRef.current = router;
  }, [router]);

  React.useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ── Plantio ───────────────────────────────────────────────────────
    const byArea = new Map<string, MapNode[]>();
    for (const n of nodes.slice(0, 220)) {
      const key = n.area_id ?? "sem-area";
      const list = byArea.get(key);
      if (list) list.push(n);
      else byArea.set(key, [n]);
    }

    const areaById = new Map(areas.map((a) => [a.id, a]));
    const keys = [...byArea.keys()];
    const plants: Plant[] = [];

    keys.forEach((key, ci) => {
      const group = byArea.get(key) ?? [];
      const area = areaById.get(key);

      const angle = (ci / Math.max(1, keys.length)) * Math.PI * 2;
      const ringRadius = 4 + Math.min(keys.length, 8) * 0.42;
      const cx = Math.cos(angle) * ringRadius;
      const cz = Math.sin(angle) * ringRadius;

      group.forEach((node, k) => {
        const form = FORM[node.stage] ?? FORM.sprout;
        const v = Math.max(0, Math.min(100, node.vitality)) / 100;

        // Espiral de ângulo áureo: preenche o canteiro por igual sem
        // sobreposição e sem o aspecto de grade plantada por máquina.
        const r = 0.62 * Math.sqrt(k + 0.5);
        const a = k * GOLDEN;

        // Semente é matéria nova, não memória fraca: entra clara mesmo com
        // força baixa. O resto acompanha a vitalidade.
        const vivid = node.stage === "seed" ? 0.8 : 0.18 + 0.82 * v;

        plants.push({
          id: node.id,
          title: node.title,
          stage: node.stage,
          vitality: node.vitality,
          areaName: area?.name ?? "Sem área",
          x: cx + Math.cos(a) * r,
          z: cz + Math.sin(a) * r,
          height: form.stem * (0.5 + 0.5 * v),
          tip: form.tip * (0.8 + 0.2 * v),
          marks: form.marks,
          color:
            node.stage === "seed"
              ? tuned("#ff7a47", vivid)
              : tuned(area?.color ?? "#7f8da3", vivid),
          phase: (k * 1.7 + ci * 2.3) % (Math.PI * 2),
        });
      });
    });

    if (plants.length === 0) return;

    // ── Cena ──────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a0b0e, 14, 40);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    wrap.appendChild(renderer.domElement);

    const el = renderer.domElement;
    el.style.display = "block";
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.touchAction = "pan-y";
    el.style.cursor = "grab";

    // ── Chão ──────────────────────────────────────────────────────────
    const groundTex = groundTexture();
    const groundGeo = new THREE.PlaneGeometry(34, 34);
    const groundMat = new THREE.MeshBasicMaterial({
      map: groundTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // ── Peças ─────────────────────────────────────────────────────────
    const n = plants.length;
    const markCount = plants.reduce((sum, p) => sum + p.marks, 0);

    const stemGeo = stemGeometry();
    const stemMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      toneMapped: false,
    });
    const stems = new THREE.InstancedMesh(stemGeo, stemMat, n);

    const tipGeo = new THREE.SphereGeometry(1, 10, 8);
    const tipMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    const tips = new THREE.InstancedMesh(tipGeo, tipMat, n);

    const glowTex = glowTexture();
    const haloGeo = new THREE.PlaneGeometry(1, 1);
    const haloMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.55,
    });
    const halos = new THREE.InstancedMesh(haloGeo, haloMat, n);

    // Marca de escala: um traço fino atravessando a haste, a mesma ideia dos
    // anéis do selo de estágio, sem o ar de planeta com anel.
    const markGeo = new THREE.BoxGeometry(1, 0.012, 0.012);
    const markMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.75,
      toneMapped: false,
    });
    const marks = new THREE.InstancedMesh(markGeo, markMat, Math.max(1, markCount));

    scene.add(stems, marks, tips, halos);

    const dummy = new THREE.Object3D();
    const base = new THREE.Matrix4();
    const local = new THREE.Matrix4();
    const out = new THREE.Matrix4();
    const scratch = new THREE.Vector3();
    const dim = new THREE.Color();

    for (let i = 0; i < n; i++) {
      const p = plants[i];
      tips.setColorAt(i, p.color);
      halos.setColorAt(i, p.color);
      stems.setColorAt(i, dim.copy(p.color).multiplyScalar(0.85));
    }
    if (tips.instanceColor) tips.instanceColor.needsUpdate = true;
    if (halos.instanceColor) halos.instanceColor.needsUpdate = true;
    if (stems.instanceColor) stems.instanceColor.needsUpdate = true;

    let cursor = 0;
    for (let i = 0; i < n; i++) {
      for (let m = 0; m < plants[i].marks; m++) {
        marks.setColorAt(cursor++, dim.copy(plants[i].color).multiplyScalar(0.9));
      }
    }
    if (marks.instanceColor) marks.instanceColor.needsUpdate = true;

    /** Recompõe as matrizes de todas as instâncias para o instante `t`. */
    function layout(t: number) {
      let mc = 0;

      for (let i = 0; i < n; i++) {
        const p = plants[i];

        // Balanço: a inclinação nasce na base, então a haste verga em vez de
        // deslizar. Haste baixa balança menos, como na vida.
        const amp = reduced ? 0 : 0.03 * (0.3 + p.height);
        dummy.position.set(p.x, 0, p.z);
        dummy.rotation.set(
          Math.sin(t * 0.8 + p.phase) * amp,
          0,
          Math.cos(t * 0.62 + p.phase) * amp * 0.7,
        );
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        base.copy(dummy.matrix);

        const h = p.height;

        // Haste
        local.makeTranslation(0, h / 2, 0).scale(scratch.set(1, h || 0.0001, 1));
        out.multiplyMatrices(base, local);
        stems.setMatrixAt(i, out);

        // Ponta
        const top = h + p.tip * 0.6;
        local.makeTranslation(0, top, 0).scale(scratch.set(p.tip, p.tip, p.tip));
        out.multiplyMatrices(base, local);
        tips.setMatrixAt(i, out);

        // Marcas de escala, escalonadas ao longo do talo
        for (let m = 0; m < p.marks; m++) {
          const at = h * (0.62 + m * 0.17);
          const width = p.tip * 2.6;
          local.makeTranslation(0, at, 0).scale(scratch.set(width, 1, 1));
          out.multiplyMatrices(base, local);
          marks.setMatrixAt(mc++, out);
        }

        // Halo: plano sempre de frente para a câmera. Posição em mundo, sem
        // herdar a rotação da haste, senão o brilho vira uma elipse torta.
        scratch.set(0, top, 0).applyMatrix4(base);
        dummy.position.copy(scratch);
        dummy.quaternion.copy(camera.quaternion);
        const halo = p.tip * (p.stage === "seed" ? 9 : 11);
        dummy.scale.set(halo, halo, halo);
        dummy.updateMatrix();
        halos.setMatrixAt(i, dummy.matrix);
      }

      stems.instanceMatrix.needsUpdate = true;
      tips.instanceMatrix.needsUpdate = true;
      halos.instanceMatrix.needsUpdate = true;
      marks.instanceMatrix.needsUpdate = true;
    }

    // ── Câmera orbital ────────────────────────────────────────────────
    const narrow = wrap.clientWidth < 560;
    let theta = -0.6;
    // Ângulo mais rasante que a versão anterior: de perto do chão, um campo
    // de hastes se sobrepõe e ganha profundidade; de cima, vira mapa de
    // pontos e perde a graça.
    let phi = narrow ? 1.1 : 1.33;
    let radius = (narrow ? 17.5 : 15.5) + Math.min(plants.length, 200) * 0.012;

    function placeCamera() {
      camera.position.set(
        Math.sin(phi) * Math.cos(theta) * radius,
        Math.cos(phi) * radius,
        Math.sin(phi) * Math.sin(theta) * radius,
      );
      camera.lookAt(0, 0.9, 0);
    }

    function resize() {
      const w = wrap!.clientWidth;
      const h = wrap!.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      radius = (w < 560 ? 17.5 : 15.5) + Math.min(plants.length, 200) * 0.012;
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
        phi = Math.max(0.75, Math.min(1.46, phi - dy * 0.004));
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
        // O alvo é o halo, não a ponta: a esfera tem menos de um décimo de
        // unidade e seria impossível acertar com o dedo.
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
        theta += 0.0007;
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

      // Sem isso, cada visita à tela deixa geometrias e texturas na GPU.
      stemGeo.dispose();
      tipGeo.dispose();
      haloGeo.dispose();
      markGeo.dispose();
      groundGeo.dispose();
      stemMat.dispose();
      tipMat.dispose();
      haloMat.dispose();
      markMat.dispose();
      groundMat.dispose();
      glowTex.dispose();
      groundTex.dispose();
      renderer.dispose();
      el.remove();
    };
  }, [nodes, areas]);

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
