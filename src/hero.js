/* Forside: en plantegning af en vej, som rejser sig til en enkel 3D-model, når man ruller.
   Bygges til js/hero.bundle.js med esbuild (se README). */
import {
  Scene, PerspectiveCamera, WebGLRenderer, BufferGeometry, Float32BufferAttribute, LineSegments, LineBasicMaterial,
  Mesh, MeshLambertMaterial, HemisphereLight, DirectionalLight, InstancedMesh, ConeGeometry, BoxGeometry, Object3D,
  Color, DoubleSide, Vector3, Group, LineDashedMaterial, Line,
} from 'three';

const hero = document.querySelector('.hero');
const canvas = document.getElementById('hero-canvas');

function start() {
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (e) {
    return;
  }
  document.documentElement.classList.add('has-webgl');
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

  const INK = new Color('#0d3b66');
  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 1, 2000);
  scene.add(new HemisphereLight(0xffffff, 0xb9b4a6, 1.15));
  const sun = new DirectionalLight(0xffffff, 1.1);
  sun.position.set(-80, 140, 60);
  scene.add(sun);

  // --- vejens linjeføring (S-kurve) og terræn ---
  const W = 260, D = 180, NX = 104, NZ = 72, ROAD = 5.2;
  const cz = (x) => 26 * Math.sin((x / W) * Math.PI * 1.6) - 6; // vejmidte z som funktion af x
  const roadY = (x) => 5 + 4 * Math.sin((x / W) * Math.PI + 0.6);
  const hill = (x, z) => 9 * Math.sin(x * 0.028 + 1.2) * Math.cos(z * 0.035) + 6 * Math.sin(x * 0.011 - z * 0.05) + 8 * Math.exp(-((x - 60) ** 2 + (z + 55) ** 2) / 1800) + 7;
  function height(x, z) {
    const d = Math.abs(z - cz(x));
    const t = Math.min(1, Math.max(0, (d - ROAD - 2) / 22));
    const s = t * t * (3 - 2 * t);
    return roadY(x) * (1 - s) + hill(x, z) * s - (d < ROAD + 2 ? 0 : 0.4 * (1 - s));
  }

  const world = new Group();
  scene.add(world);

  const pos = [], idx = [];
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const x = (i / NX - 0.5) * W, z = (j / NZ - 0.5) * D;
    pos.push(x, height(x, z), z);
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const tg = new BufferGeometry();
  tg.setAttribute('position', new Float32BufferAttribute(pos, 3));
  tg.setIndex(idx);
  tg.computeVertexNormals();
  const terrainMat = new MeshLambertMaterial({ color: 0xcfd6bf, transparent: true, opacity: 0, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  world.add(new Mesh(tg, terrainMat));

  // net som "tegning": hver 4. linje
  const lp = [];
  const P = (i, j) => { const k = (j * (NX + 1) + i) * 3; return [pos[k], pos[k + 1], pos[k + 2]]; };
  for (let j = 0; j <= NZ; j += 4) for (let i = 0; i < NX; i++) lp.push(...P(i, j), ...P(i + 1, j));
  for (let i = 0; i <= NX; i += 4) for (let j = 0; j < NZ; j++) lp.push(...P(i, j), ...P(i, j + 1));
  const lg = new BufferGeometry();
  lg.setAttribute('position', new Float32BufferAttribute(lp, 3));
  const gridMat = new LineBasicMaterial({ color: INK, transparent: true, opacity: 0.22 });
  world.add(new LineSegments(lg, gridMat));

  // vej: flade + kantlinjer + stiplet midte
  const rp = [], ri = [], e1 = [], e2 = [], mid = [];
  const RN = 160;
  for (let i = 0; i <= RN; i++) {
    const x = (i / RN - 0.5) * W;
    const dz = (cz(x + 0.5) - cz(x - 0.5));
    const l = Math.hypot(1, dz);
    const nx = -dz / l, nz = 1 / l;
    const y = roadY(x) + 0.12;
    rp.push(x + nx * ROAD, y, cz(x) + nz * ROAD, x - nx * ROAD, y, cz(x) - nz * ROAD);
    e1.push(new Vector3(x + nx * ROAD, y + 0.05, cz(x) + nz * ROAD));
    e2.push(new Vector3(x - nx * ROAD, y + 0.05, cz(x) - nz * ROAD));
    mid.push(new Vector3(x, y + 0.05, cz(x)));
    if (i < RN) { const a = i * 2; ri.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const rg = new BufferGeometry();
  rg.setAttribute('position', new Float32BufferAttribute(rp, 3));
  rg.setIndex(ri);
  rg.computeVertexNormals();
  const roadMat = new MeshLambertMaterial({ color: 0x4a4f57, transparent: true, opacity: 0.12, side: DoubleSide });
  world.add(new Mesh(rg, roadMat));
  const edgeMat = new LineBasicMaterial({ color: INK });
  world.add(new Line(new BufferGeometry().setFromPoints(e1), edgeMat), new Line(new BufferGeometry().setFromPoints(e2), edgeMat));
  const midLine = new Line(new BufferGeometry().setFromPoints(mid), new LineDashedMaterial({ color: INK, dashSize: 4, gapSize: 3 }));
  midLine.computeLineDistances();
  world.add(midLine);

  // træer: i plan ses de som cirkler, i model som kegler
  const treeMat = new MeshLambertMaterial({ color: 0x5f7f5a, transparent: true, opacity: 0.25 });
  const N = 150;
  const trees = new InstancedMesh(new ConeGeometry(2.6, 1, 10), treeMat, N);
  const spots = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  while (spots.length < N) {
    const x = (rnd() - 0.5) * W * 0.96, z = (rnd() - 0.5) * D * 0.96;
    if (Math.abs(z - cz(x)) < ROAD + 9) continue;
    spots.push([x, z, 0.7 + rnd() * 0.9]);
  }
  world.add(trees);

  // modulvogntog: tre kasser på vejen
  const truckMat = new MeshLambertMaterial({ color: 0xc8442b, transparent: true, opacity: 0.3 });
  const truck = new InstancedMesh(new BoxGeometry(1, 1, 1), truckMat, 3);
  world.add(truck);
  const units = [[5.5, -30], [7.4, -37.2], [11.6, -47.4]]; // længde, x-midte

  const dummy = new Object3D();
  const ease = (t) => t * t * (3 - 2 * t);
  let p = -1;

  function layout(e) {
    world.scale.set(1, 0.001 + e * 0.999, 1);
    terrainMat.opacity = e * 0.95;
    roadMat.opacity = 0.12 + e * 0.88;
    gridMat.opacity = 0.22 - e * 0.1;
    treeMat.opacity = 0.25 + e * 0.75;
    truckMat.opacity = 0.3 + e * 0.7;
    spots.forEach((s, i) => {
      const h = 7 * s[2];
      dummy.position.set(s[0], height(s[0], s[1]) + h / 2, s[1]);
      dummy.scale.set(s[2], h, s[2]);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      trees.setMatrixAt(i, dummy.matrix);
    });
    trees.instanceMatrix.needsUpdate = true;
    units.forEach((u, i) => {
      const x = u[1];
      dummy.position.set(x, roadY(x) + 0.3 + 1.7, cz(x) - 2.4);
      dummy.rotation.set(0, -Math.atan(cz(x + 0.5) - cz(x - 0.5)), 0);
      dummy.scale.set(u[0], 3.4, 2.5);
      dummy.updateMatrix();
      truck.setMatrixAt(i, dummy.matrix);
    });
    truck.instanceMatrix.needsUpdate = true;
  }

  function render(force) {
    const r = hero.getBoundingClientRect();
    const span = Math.max(1, r.height - window.innerHeight);
    const np = Math.min(1, Math.max(0, -r.top / span));
    if (!force && Math.abs(np - p) < 0.0005) return;
    p = np;
    const e = ease(Math.min(1, p / 0.8));
    hero.classList.toggle('is-model', e > 0.35);
    layout(e);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const portrait = h > w;
    const polar = 0.02 + e * 1.02; // fra lodret plan til skrå vinkel
    const azim = -0.15 + e * 0.75;
    const dist = (portrait ? 520 : 330) - e * (portrait ? 120 : 70);
    const tx = portrait ? -10 : 18;
    camera.position.set(tx + dist * Math.sin(polar) * Math.sin(azim), dist * Math.cos(polar), dist * Math.sin(polar) * Math.cos(azim));
    camera.up.set(0, 1, 0);
    camera.lookAt(tx, 4 * e, 0);
    renderer.render(scene, camera);
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render(true);
  }
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; render(false); });
  }, { passive: true });
  window.addEventListener('resize', resize);
  resize();
}

if (hero && canvas) start();
