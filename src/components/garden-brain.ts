import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * O cérebro que flutua no centro do jardim.
 *
 * O canteiro é o acervo; isto é quem cultiva. Fica no vazio do anel de áreas,
 * acima de uma poça de luz, e de lá saem raízes para cada canteiro.
 *
 * É todo procedural, sem modelo baixado:
 *
 *   · cada hemisfério nasce de uma esfera bem subdividida, moldada em
 *     elipsoide com face medial achatada, base plana e lobo temporal;
 *   · os GIROS saem de ruído simplex com domínio torcido: as linhas onde o
 *     ruído cruza zero serpenteiam como sulcos de verdade, e o que fica entre
 *     elas vira dobra arredondada;
 *   · a fissura lateral é cavada à parte, porque é a marca que faz qualquer
 *     pessoa ler "cérebro" à primeira vista;
 *   · cerebelo com folhas horizontais e tronco fecham a silhueta.
 *
 * A profundidade de cada sulco vai num atributo próprio. O shader usa isso
 * para escurecer o fundo das dobras (oclusão barata) e para acender uma onda
 * de sinal que corre da frente para trás, por dentro dos sulcos.
 */

/** Ruído simplex 3D (Gustavson), com permutação semeada: o cérebro é sempre o mesmo. */
function simplex(seed: number) {
  const grad = [
    1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1,
    1, 0, 1, -1, 0, -1, -1,
  ];
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;

  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }

  const perm = new Uint8Array(512);
  const mod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    mod12[i] = perm[i] % 12;
  }

  const F3 = 1 / 3;
  const G3 = 1 / 6;

  const corner = (g: number, x: number, y: number, z: number) => {
    let t = 0.6 - x * x - y * y - z * z;
    if (t < 0) return 0;
    t *= t;
    return t * t * (grad[g * 3] * x + grad[g * 3 + 1] * y + grad[g * 3 + 2] * z);
  };

  return (x: number, y: number, z: number) => {
    const sk = (x + y + z) * F3;
    const i = Math.floor(x + sk);
    const j = Math.floor(y + sk);
    const k = Math.floor(z + sk);
    const t = (i + j + k) * G3;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);

    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0];
      else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1];
      else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1];
    } else {
      if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1];
      else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1];
      else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0];
    }

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    return (
      32 *
      (corner(mod12[ii + perm[jj + perm[kk]]], x0, y0, z0) +
        corner(
          mod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]],
          x0 - i1 + G3,
          y0 - j1 + G3,
          z0 - k1 + G3,
        ) +
        corner(
          mod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]],
          x0 - i2 + 2 * G3,
          y0 - j2 + 2 * G3,
          z0 - k2 + 2 * G3,
        ) +
        corner(
          mod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]],
          x0 - 1 + 3 * G3,
          y0 - 1 + 3 * G3,
          z0 - 1 + 3 * G3,
        ))
    );
  };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Esfera indexada e densa: sem vértices duplicados, as normais saem lisas. */
function denseSphere(detail: number) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  geo.deleteAttribute("normal");
  geo.deleteAttribute("uv");
  const merged = mergeVertices(geo);
  geo.dispose();
  return merged;
}

/**
 * Empurra cada vértice ao longo da normal da forma lisa. Duas passadas: molda,
 * calcula normais, esculpe, calcula de novo.
 */
function sculpt(
  geo: THREE.BufferGeometry,
  shape: (v: THREE.Vector3) => void,
  carve: (v: THREE.Vector3) => { depth: number; groove: number },
) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    shape(v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();

  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const groove = new Float32Array(pos.count);
  const n = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nrm, i);
    const cut = carve(v);
    v.addScaledVector(n, cut.depth);
    pos.setXYZ(i, v.x, v.y, v.z);
    groove[i] = cut.groove;
  }

  geo.setAttribute("groove", new THREE.BufferAttribute(groove, 1));
  geo.computeVertexNormals();
  return geo;
}

function hemisphere(side: 1 | -1, noise: ReturnType<typeof simplex>, detail: number) {
  const geo = denseSphere(detail);

  return sculpt(
    geo,
    (v) => {
      const ux = v.x;
      const uy = v.y;
      const uz = v.z;
      const lateral = ux * side;

      // Face medial quase plana, voltada para o outro hemisfério.
      let x = ux * (0.15 + 0.35 * smooth(-0.4, 0.3, lateral));
      let y = uy * 0.6 * (1 - 0.08 * uz);
      const z = uz * 0.92;

      if (y < 0) y *= 0.72;
      x *= 1 - 0.1 * Math.max(0, uz);

      // Lobo temporal: volume lateral e para baixo, na metade da frente.
      const t = Math.exp(-((uz - 0.2) ** 2) / 0.1 - (uy + 0.45) ** 2 / 0.07) * Math.max(0, lateral);
      x += side * 0.07 * t;
      y -= 0.09 * t;

      v.set(x + side * 0.03, y, z);
    },
    (v) => {
      // Domínio torcido: sem isto os sulcos ficam redondos como manchas.
      const wx = noise(v.x * 1.7 + 11.1, v.y * 1.7, v.z * 1.7);
      const wy = noise(v.x * 1.7, v.y * 1.7 + 23.7, v.z * 1.7);
      const wz = noise(v.x * 1.7, v.y * 1.7, v.z * 1.7 + 41.3);
      const f = 4.6;
      const n = noise((v.x + wx * 0.16) * f, (v.y + wy * 0.16) * f, (v.z + wz * 0.16) * f);

      // Perto de zero é sulco; o resto é giro de ombro arredondado.
      const a = Math.min(1, Math.abs(n) / 0.34);
      const crest = 1 - (1 - a) * (1 - a);
      let groove = 1 - crest;

      // Fissura lateral: da frente embaixo para trás em cima.
      const lateral = (v.x - side * 0.03) * side;
      const line = -0.1 - 0.34 * v.z;
      const along = smooth(-0.45, -0.2, v.z) * (1 - smooth(0.4, 0.62, v.z));
      const fissure =
        Math.exp(-((v.y - line) ** 2) / 0.0011) * smooth(0.12, 0.3, lateral) * along;
      groove = Math.max(groove, fissure);

      // A face medial fica escondida: sulco raso poupa sombra estranha no vão.
      const medial = smooth(-0.02, 0.12, lateral);
      const depth =
        -(groove * 0.062 + fissure * 0.04) * (0.35 + 0.65 * medial) +
        noise(v.x * 16, v.y * 16, v.z * 16) * 0.004;

      return { depth, groove: groove * (0.4 + 0.6 * medial) };
    },
  );
}

function cerebellum(noise: ReturnType<typeof simplex>, detail: number) {
  return sculpt(
    denseSphere(detail),
    (v) => {
      // Duas metades com um vinco no meio, atrás e embaixo do cérebro.
      const notch = Math.exp(-(v.x * v.x) / 0.02) * Math.max(0, -v.z) * 0.12;
      v.set(v.x * 0.4, v.y * 0.24 - notch * 0.5, v.z * 0.25 - notch);
      v.add(new THREE.Vector3(0, -0.3, -0.5));
    },
    (v) => {
      // Folhas horizontais, levemente onduladas.
      const phase = (v.y + noise(v.x * 3, v.y * 3, v.z * 3) * 0.035) * 62;
      const a = Math.min(1, Math.abs(Math.sin(phase)) / 0.4);
      const groove = 1 - (1 - (1 - a) * (1 - a));
      return { depth: -groove * 0.016, groove: groove * 0.8 };
    },
  );
}

function stem() {
  const geo = new THREE.CylinderGeometry(0.07, 0.04, 0.46, 24, 4, true);
  geo.rotateX(0.32);
  geo.translate(0, -0.5, -0.24);
  geo.setAttribute("groove", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
  return geo;
}

/** Albedo por vértice: dorso do giro claro, fundo do sulco quase preto. */
function paint(geo: THREE.BufferGeometry, crest: THREE.Color, deep: THREE.Color) {
  const groove = geo.attributes.groove as THREE.BufferAttribute;
  const colors = new Float32Array(groove.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < groove.count; i++) {
    c.copy(crest).lerp(deep, Math.pow(groove.getX(i), 0.8));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

export type Brain = {
  object: THREE.Group;
  reflection: THREE.Group;
  /** Altura do centro do cérebro no mundo, em repouso. */
  height: number;
  update: (t: number) => void;
  dispose: () => void;
};

export function createBrain({
  reduced,
  lite,
  signal,
}: {
  reduced: boolean;
  /** Tela estreita: menos subdivisão, a diferença não aparece a essa distância. */
  lite: boolean;
  signal: THREE.Color;
}): Brain {
  const noise = simplex(7);
  const detail = lite ? 34 : 52;

  const geos = [
    hemisphere(1, noise, detail),
    hemisphere(-1, noise, detail),
    cerebellum(noise, Math.round(detail * 0.55)),
    stem(),
  ];

  const crest = new THREE.Color(0xb4bcc8);
  const deep = new THREE.Color(0x06080d);
  for (const g of geos) paint(g, crest, deep);

  const uniforms = {
    uTime: { value: 0 },
    uRim: { value: new THREE.Color(0x8fdcff) },
    uSignal: { value: signal.clone() },
  };

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.5,
    metalness: 0.2,
  });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float groove;\nvarying float vGroove;\nvarying vec3 vBrain;",
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGroove = groove;\nvBrain = position;");

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uTime;\nuniform vec3 uRim;\nuniform vec3 uSignal;\nvarying float vGroove;\nvarying vec3 vBrain;",
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        // Recorte: a borda da silhueta acende, e o volume se solta do fundo.
        float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        totalEmissiveRadiance += uRim * pow(1.0 - facing, 3.2) * 0.28;

        // Sinal: uma frente de onda percorre os sulcos da testa para a nuca.
        float front = sin(vBrain.z * 4.2 + uTime * 1.25 + sin(vBrain.x * 6.0 + vBrain.y * 5.0) * 0.8);
        float wave = pow(0.5 + 0.5 * front, 7.0);
        totalEmissiveRadiance += uSignal * vGroove * vGroove * (0.04 + 1.25 * wave);`,
      );
  };

  const object = new THREE.Group();
  for (const g of geos) object.add(new THREE.Mesh(g, material));

  // Reflexo: a mesma forma espelhada no piso, só com a cor, bem apagada.
  const reflectionMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.06,
    depthWrite: false,
  });
  const inner = new THREE.Group();
  for (const g of geos) inner.add(new THREE.Mesh(g, reflectionMat));
  const reflection = new THREE.Group();
  reflection.scale.set(1, -1, 1);
  reflection.add(inner);

  const SCALE = 1.8;
  const height = 2.75;
  object.scale.setScalar(SCALE);
  inner.scale.setScalar(SCALE);

  // Levemente de três quartos e inclinado: de frente perfeita parece ícone.
  const baseTilt = -0.08;

  function update(t: number) {
    uniforms.uTime.value = reduced ? 1.4 : t;
    const bob = reduced ? 0 : Math.sin(t * 0.55) * 0.09;
    const yaw = reduced ? 0.6 : 0.6 + t * 0.07;
    const roll = reduced ? 0 : Math.sin(t * 0.31) * 0.03;

    object.position.set(0, height + bob, 0);
    object.rotation.set(baseTilt, yaw, roll);

    inner.position.set(0, height + bob, 0);
    inner.rotation.copy(object.rotation);
  }

  update(0);

  return {
    object,
    reflection,
    height,
    update,
    dispose() {
      for (const g of geos) g.dispose();
      material.dispose();
      reflectionMat.dispose();
    },
  };
}
