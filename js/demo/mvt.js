/* Trin 2: forenklet sporkurvemodel for modulvogntog.
   Kinematisk lavhastighedsmodel: forakslens midtpunkt følger køresporet, og hver
   efterfølgende akselgruppe trækkes efter sit koblingspunkt (traktrix, trin 0,1 m).
   Ingen dækudskridning, ingen styrevinkelbegrænsning, ingen styrende bagaksler.
   Arealbehovet findes ved at rastere alle stillinger og sammenligne med tegningens arealer. */
(function (root) {
  'use strict';
  const VD = (root.VD = root.VD || {});

  /* MVT type 3 efter bekendtgørelsen om modulvogntog: lastbil - linktrailer - sættevogn.
     Målene herunder er ANTAGELSER valgt til demoen, så den samlede længde bliver 25,25 m.
     De er ikke Vejdirektoratets typekøretøj. Alle mål i meter. */
  const VEHICLE = {
    id: 'mvt3', kort: 'Modulvogntog type 3', mvt: true,
    navn: 'EMS1 modulvogntog, type 3 (lastbil, linktrailer, sættevogn)',
    bredde: 2.55,
    enheder: [
      // L = afstand fra koblingspunkt (eller foraksel) til akselgruppens midte
      { navn: 'Lastbil', L: 4.1, foran: 1.45, bag: 0.9, kobling: 0.5, aksler: [{ pos: 4.1, len: 1.0 }, { pos: 0, len: 2.35 }] },
      { navn: 'Linktrailer', L: 8.2, foran: 1.0, bag: 2.0, kobling: 0, aksler: [{ pos: 0, len: 3.6 }] },
      { navn: 'Sættevogn', L: 7.9, foran: 1.6, bag: 4.1, kobling: 0, aksler: [{ pos: 0, len: 3.6 }] },
    ],
  };
  /* Øvrige køretøjer til sammenligning. Også her er målene antagelser. */
  const VEHICLES = [
    VEHICLE,
    { id: 'svt', kort: 'Sættevognstog', navn: 'Sættevognstog (trækker og sættevogn)', bredde: 2.55, enheder: [
      { navn: 'Trækker', L: 3.8, foran: 1.4, bag: 0.9, kobling: 0.6, aksler: [{ pos: 3.8, len: 1.0 }, { pos: 0, len: 1.0 }] },
      { navn: 'Sættevogn', L: 7.75, foran: 1.65, bag: 4.15, kobling: 0, aksler: [{ pos: 0, len: 3.6 }] },
    ] },
    { id: 'lastbil', kort: 'Lastbil', navn: 'Lastbil, 12 m', bredde: 2.55, enheder: [
      { navn: 'Lastbil', L: 6.6, foran: 1.5, bag: 3.9, kobling: 0, aksler: [{ pos: 6.6, len: 1.0 }, { pos: 0, len: 2.35 }] },
    ] },
    { id: 'bus', kort: 'Bus', navn: 'Bus, 12 m', bredde: 2.55, enheder: [
      { navn: 'Bus', L: 6.0, foran: 2.7, bag: 3.3, kobling: 0, aksler: [{ pos: 6.0, len: 1.0 }, { pos: 0, len: 1.0 }] },
    ] },
  ];
  function vehicleLength(v) {
    const u = v.enheder;
    if (u.length === 1) return u[0].foran + u[0].L + u[0].bag;
    let len = u[0].foran + u[0].L - u[0].kobling;
    for (let i = 1; i < u.length; i++) len += i < u.length - 1 ? u[i].L - u[i].kobling : u[i].L + u[i].bag;
    return len;
  }

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const len = (a) => Math.hypot(a[0], a[1]);
  const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };

  /* Afrund skarpe knæk med cirkelbuer og udtag punkter for hver ds meter. */
  function buildPath(pts, radius, ds) {
    ds = ds || 0.1;
    const dense = [];
    const n = pts.length;
    if (n < 2) return [];
    let prevEnd = pts[0];
    for (let i = 1; i < n - 1; i++) {
      const a = unit(sub(pts[i], pts[i - 1]));
      const b = unit(sub(pts[i + 1], pts[i]));
      const cross = a[0] * b[1] - a[1] * b[0];
      const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]));
      const ang = Math.acos(dot);
      if (ang < (5 * Math.PI) / 180 || !radius) { dense.push(prevEnd); prevEnd = pts[i]; continue; }
      let t = radius * Math.tan(ang / 2);
      const maxT = Math.min(len(sub(pts[i], prevEnd)), len(sub(pts[i + 1], pts[i])) / (i === n - 2 ? 1 : 2)) * 0.98;
      let r = radius;
      if (t > maxT) { t = maxT; r = t / Math.tan(ang / 2); }
      const p1 = [pts[i][0] - a[0] * t, pts[i][1] - a[1] * t];
      const s = cross > 0 ? 1 : -1;
      const c = [p1[0] - a[1] * r * s, p1[1] + a[0] * r * s];
      dense.push(prevEnd, p1);
      const a0 = Math.atan2(p1[1] - c[1], p1[0] - c[0]);
      const steps = Math.max(2, Math.ceil((ang * r) / ds));
      for (let k = 1; k <= steps; k++) {
        const th = a0 + (s * ang * k) / steps;
        dense.push([c[0] + r * Math.cos(th), c[1] + r * Math.sin(th)]);
      }
      prevEnd = dense.pop();
    }
    dense.push(prevEnd, pts[n - 1]);
    // ensartet inddeling
    const out = [dense[0]];
    let carry = 0;
    for (let i = 1; i < dense.length; i++) {
      const d = sub(dense[i], dense[i - 1]);
      const l = len(d);
      if (l < 1e-9) continue;
      let pos = ds - carry;
      while (pos <= l) {
        out.push([dense[i - 1][0] + (d[0] * pos) / l, dense[i - 1][1] + (d[1] * pos) / l]);
        pos += ds;
      }
      carry = l - (pos - ds);
    }
    return out;
  }

  /* Returnerer en stilling pr. punkt på køresporet. */
  function simulate(path, v) {
    v = v || VEHICLE;
    const U = v.enheder;
    const h0 = unit(sub(path[1], path[0]));
    // start: hele vogntoget ligger på linje bag første punkt
    const ax = [];
    let ref = path[0];
    for (let i = 0; i < U.length; i++) {
      const a = [ref[0] - h0[0] * U[i].L, ref[1] - h0[1] * U[i].L];
      ax.push(a);
      ref = [a[0] + h0[0] * U[i].kobling, a[1] + h0[1] * U[i].kobling];
    }
    const poses = [];
    let maxOff = 0;
    for (let k = 0; k < path.length; k++) {
      let pull = path[k];
      const pose = [];
      for (let i = 0; i < U.length; i++) {
        const h = unit(sub(pull, ax[i]));
        ax[i] = [pull[0] - h[0] * U[i].L, pull[1] - h[1] * U[i].L];
        pose.push({ a: ax[i], h });
        pull = [ax[i][0] + h[0] * U[i].kobling, ax[i][1] + h[1] * U[i].kobling];
      }
      poses.push(pose);
    }
    // maks. indersporing: største afstand fra bageste akselgruppe til køresporet
    const last = U.length - 1;
    const warm = Math.round(vehicleLength(v) * 10) + 30; // først når hele køretøjet er inde på sporet
    for (let k = 0; k < poses.length; k += 5) {
      const a = poses[k][last].a;
      let best = Infinity;
      for (let j = Math.max(0, k - 400); j <= k; j += 2) {
        const d = Math.hypot(path[j][0] - a[0], path[j][1] - a[1]);
        if (d < best) best = d;
      }
      if (k > warm && best > maxOff) maxOff = best;
    }
    return { poses, maxOff, length: (path.length - 1) * 0.1 };
  }

  function rect(a, h, front, rear, half) {
    const nx = -h[1], ny = h[0];
    const f = [a[0] + h[0] * front, a[1] + h[1] * front];
    const r = [a[0] - h[0] * rear, a[1] - h[1] * rear];
    return [
      [f[0] + nx * half, f[1] + ny * half], [f[0] - nx * half, f[1] - ny * half],
      [r[0] - nx * half, r[1] - ny * half], [r[0] + nx * half, r[1] + ny * half],
    ];
  }
  function bodyRects(pose, v) {
    v = v || VEHICLE;
    return pose.map((p, i) => rect(p.a, p.h, v.enheder[i].L + v.enheder[i].foran, v.enheder[i].bag, v.bredde / 2));
  }
  function wheelRects(pose, v) {
    v = v || VEHICLE;
    const out = [];
    pose.forEach((p, i) => {
      for (const ak of v.enheder[i].aksler) out.push(rect(p.a, p.h, ak.pos + ak.len / 2, -(ak.pos - ak.len / 2), v.bredde / 2));
    });
    return out;
  }

  /* ---------- Rasteranalyse (kræver canvas) ---------- */
  function polyArea(p) {
    let s = 0;
    for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; s += p[i][0] * q[1] - q[0] * p[i][1]; }
    return Math.abs(s) / 2;
  }
  function polyPerimeter(p) {
    let s = 0;
    for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; s += Math.hypot(p[i][0] - q[0], p[i][1] - q[1]); }
    return s;
  }
  // Bredde af et langt, smalt areal: A = w * L og P = 2L + 2w
  function bandWidth(p) {
    const A = polyArea(p), P = polyPerimeter(p);
    const disc = P * P - 16 * A;
    return disc <= 0 ? Math.sqrt(A) : (P - Math.sqrt(disc)) / 4;
  }

  function chamfer(mask, w, h, cell) {
    // afstand (m) til nærmeste celle, hvor mask = 1
    const d = new Float32Array(w * h);
    const INF = 1e9, A = 1, B = Math.SQRT2;
    for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; let v = d[i];
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + A);
      if (y > 0) { v = Math.min(v, d[i - w] + A); if (x > 0) v = Math.min(v, d[i - w - 1] + B); if (x < w - 1) v = Math.min(v, d[i - w + 1] + B); }
      d[i] = v;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x; let v = d[i];
      if (v === 0) continue;
      if (x < w - 1) v = Math.min(v, d[i + 1] + A);
      if (y < h - 1) { v = Math.min(v, d[i + w] + A); if (x < w - 1) v = Math.min(v, d[i + w + 1] + B); if (x > 0) v = Math.min(v, d[i + w - 1] + B); }
      d[i] = v;
    }
    for (let i = 0; i < d.length; i++) d[i] *= cell;
    return d;
  }

  function components(mask, w, h, minCells) {
    const lab = new Int32Array(w * h);
    const out = [];
    const stack = [];
    for (let s = 0; s < mask.length; s++) {
      if (!mask[s] || lab[s]) continue;
      const id = out.length + 1;
      const c = { id, n: 0, sx: 0, sy: 0, cells: [] };
      stack.push(s); lab[s] = id;
      while (stack.length) {
        const i = stack.pop();
        const x = i % w, y = (i - x) / w;
        c.n++; c.sx += x; c.sy += y; c.cells.push(i);
        if (x > 0 && mask[i - 1] && !lab[i - 1]) { lab[i - 1] = id; stack.push(i - 1); }
        if (x < w - 1 && mask[i + 1] && !lab[i + 1]) { lab[i + 1] = id; stack.push(i + 1); }
        if (y > 0 && mask[i - w] && !lab[i - w]) { lab[i - w] = id; stack.push(i - w); }
        if (y < h - 1 && mask[i + w] && !lab[i + w]) { lab[i + w] = id; stack.push(i + w); }
      }
      if (c.n >= minCells) out.push(c);
    }
    return out;
  }

  const TILLAEG = 0.3;
  const MIN_OVERKOERSEL = 1.0;

  /* scene: { zones: {road:[poly], oncoming:[], overrun:[], soft:[], island:[]}, objects:[{c,r,label}], softLabels }
     sim: resultat af simulate(). makeCanvas(w,h) -> canvas. */
  function analyse(scene, sim, opts) {
    opts = opts || {};
    const v = opts.vehicle || VEHICLE;
    const makeCanvas = opts.makeCanvas;
    // udstrækning
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (q) => { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; };
    for (const k of Object.keys(scene.zones)) for (const p of scene.zones[k]) p.forEach(grow);
    // Kun tegningens eget område vurderes. Den del af vogntoget, der ved start og slut
    // rækker ud over tegningen, indgår ikke.
    x0 -= 1.5; y0 -= 1.5; x1 += 1.5; y1 += 1.5;
    const maxDim = Math.max(x1 - x0, y1 - y0);
    const scale = Math.max(4, Math.min(16, (opts.maxPixels || 1300) / maxDim));
    const cell = 1 / scale;
    const w = Math.ceil((x1 - x0) * scale), h = Math.ceil((y1 - y0) * scale);
    const cv = makeCanvas(w, h);
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const tx = (q) => [(q[0] - x0) * scale, (y1 - q[1]) * scale];
    const tracePoly = (p) => { ctx.beginPath(); p.forEach((q, i) => { const t = tx(q); if (i) ctx.lineTo(t[0], t[1]); else ctx.moveTo(t[0], t[1]); }); ctx.closePath(); };
    const grab = () => {
      const d = ctx.getImageData(0, 0, w, h).data;
      const m = new Uint8Array(w * h);
      for (let i = 0, j = 3; i < m.length; i++, j += 4) m[i] = d[j] > 127 ? 1 : 0;
      ctx.clearRect(0, 0, w, h);
      return m;
    };
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round';
    const zoneMask = (list) => { for (const p of list || []) { tracePoly(p); ctx.fill(); } return grab(); };
    const narrow = (p) => bandWidth(p) < MIN_OVERKOERSEL - 0.01;
    const absorb = !!opts.absorbNarrowOverrun;
    const overrunPolys = (scene.zones.overrun || []).filter((p) => !(absorb && narrow(p)));
    const road = zoneMask((scene.zones.road || []).concat(absorb ? (scene.zones.overrun || []).filter(narrow) : []));
    const oncoming = zoneMask(scene.zones.oncoming);
    const overrun = zoneMask(overrunPolys);
    const soft = zoneMask(scene.zones.soft);
    if (opts.extraRoad && opts.extraRoad.length === road.length) {
      for (let i = 0; i < road.length; i++) if (opts.extraRoad[i]) { road[i] = 1; soft[i] = 0; }
    }
    const island = zoneMask(scene.zones.island);

    const sweep = (rectsOf, extra) => {
      ctx.lineWidth = 2 * extra * scale;
      for (let k = 0; k < sim.poses.length; k += 2) {
        for (const r of rectsOf(sim.poses[k], v)) { tracePoly(r); ctx.fill(); if (extra > 0) ctx.stroke(); }
      }
      return grab();
    };
    const wheels = sweep(wheelRects, 0);
    const wheelsT = sweep(wheelRects, TILLAEG);
    const body = sweep(bodyRects, 0);
    const bodyT = sweep(bodyRects, TILLAEG);

    const N = w * h;
    const edge = Math.ceil(1.5 * scale) + 1;
    const cSoft = new Uint8Array(N), cIsland = new Uint8Array(N), cOut = new Uint8Array(N), cOff = new Uint8Array(N), cOnc = new Uint8Array(N), cOver = new Uint8Array(N), cHang = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (wheelsT[i]) {
        // helle og modkørende ligger oven på kørebanen og vurderes først
        if (island[i]) cIsland[i] = 1;
        else if (overrun[i]) cOver[i] = 1;
        else if (road[i]) { if (oncoming[i]) cOnc[i] = 1; }
        else if (soft[i]) { cSoft[i] = 1; cOff[i] = 1; }
        else {
          // uden for tegningens arealer: kun inden for tegningens udstrækning tæller det som fund
          const cx = i % w, cy = (i - cx) / w;
          if (cx > edge && cx < w - edge && cy > edge && cy < h - edge) { cOut[i] = 1; cOff[i] = 1; }
        }
      } else if (bodyT[i] && soft[i]) cHang[i] = 1;
    }
    const drivable = new Uint8Array(N);
    for (let i = 0; i < N; i++) drivable[i] = road[i] && !island[i] ? 1 : 0;
    const dtRoad = chamfer(drivable, w, h, cell);
    const dtBody = chamfer(body, w, h, cell);
    const minCells = Math.max(4, Math.round(0.05 / (cell * cell)));
    const world = (c) => [x0 + (c.sx / c.n + 0.5) * cell, y1 - (c.sy / c.n + 0.5) * cell];
    const conflicts = [];
    const push = (regel, grad, tekst, c, extra) => conflicts.push(Object.assign({ regel, grad, tekst, pos: c ? world(c) : null, areal: c ? c.n * cell * cell : null }, extra || {}));
    const depth = (c) => { let m = 0; for (const i of c.cells) if (dtRoad[i] > m) m = dtRoad[i]; return m; };

    // hjul uden for kørebane og overkørselsareal: ét fund pr. sammenhængende område
    for (const c of components(cOff, w, h, minCells)) {
      let nSoft = 0;
      for (const i of c.cells) if (cSoft[i]) nSoft++;
      if (nSoft * cell * cell >= 0.05) push('S2 Kantsten', 'konflikt', `Hjul (inkl. ${TILLAEG.toFixed(1).replace('.', ',')} m) krydser kantsten ind på fortov eller cykelsti, hvor bløde trafikanter færdes.`, c, { dybde: depth(c) });
      else push('S1 Arealtillæg', 'konflikt', 'Hjul (inkl. arealtillæg) er uden for kørebane og overkørselsareal.', c, { dybde: depth(c) });
    }
    for (const c of components(cIsland, w, h, minCells)) push('S2 Kantsten', 'konflikt', 'Hjul (inkl. arealtillæg) kører over helle.', c, {});
    for (const c of components(cOnc, w, h, minCells)) push('S4 Køremåde A', 'konflikt', 'Arealbehovet berører kørebane for modkørende.', c, {});
    for (const c of components(cHang, w, h, minCells * 4)) push('S1 Arealtillæg', 'bemærkning', `Karosseri (inkl. ${TILLAEG.toFixed(1).replace('.', ',')} m) hænger ud over fortov eller cykelsti.`, c, {});

    // overkørselsarealer: bredde og brug
    const overrunInfo = [];
    overrunPolys.forEach((p, idx) => {
      const bw = bandWidth(p);
      // bruges arealet af hjulene?
      const m = (() => { tracePoly(p); ctx.fill(); return grab(); })();
      let used = 0, sx = 0, sy = 0, n = 0;
      for (let i = 0; i < N; i++) if (m[i]) { n++; sx += i % w; sy += (i - (i % w)) / w; if (wheelsT[i]) used++; }
      const pos = [x0 + (sx / n + 0.5) * cell, y1 - (sy / n + 0.5) * cell];
      overrunInfo.push({ idx: idx + 1, bredde: bw, brugt: used * cell * cell, pos });
      if (bw < MIN_OVERKOERSEL - 0.01) conflicts.push({ regel: 'S3 Overkørselsareal', grad: used > 0 ? 'konflikt' : 'bemærkning', tekst: `Overkørselsareal er ca. ${bw.toFixed(2).replace('.', ',')} m bredt. Kravet er mindst ${MIN_OVERKOERSEL.toFixed(1).replace('.', ',')} m.`, pos, areal: polyArea(p), bredde: bw });
      else if (used > 0) conflicts.push({ regel: 'S3 Overkørselsareal', grad: 'ok', tekst: `Overkørselsareal på ca. ${bw.toFixed(2).replace('.', ',')} m benyttes af hjulene.`, pos, areal: used * cell * cell, bredde: bw });
    });

    // faste genstande: afstand til karosseri
    for (const o of scene.objects || []) {
      const p = tx(o.c);
      const ix = Math.round(p[0]), iy = Math.round(p[1]);
      if (ix < 0 || iy < 0 || ix >= w || iy >= h) continue;
      const clear = dtBody[iy * w + ix] - (o.r || 0.1);
      if (clear < TILLAEG) conflicts.push({ regel: 'S1 Arealtillæg', grad: 'konflikt', tekst: clear <= 0 ? `Karosseri rammer ${o.label}.` : `Afstand fra karosseri til ${o.label} er ca. ${clear.toFixed(2).replace('.', ',')} m. Kravet er ${TILLAEG.toFixed(1).replace('.', ',')} m.`, pos: o.c, areal: null, afstand: clear, objekt: o.label });
      else o.afstand = clear;
    }
    conflicts.sort((a, b) => (a.grad === b.grad ? 0 : a.grad === 'konflikt' ? -1 : b.grad === 'konflikt' ? 1 : a.grad === 'bemærkning' ? -1 : 1));
    conflicts.forEach((c, i) => (c.nr = i + 1));

    // overlejring til visning
    const img = ctx.createImageData(w, h);
    const px = img.data;
    for (let i = 0, j = 0; i < N; i++, j += 4) {
      let r = 0, g = 0, b = 0, a = 0;
      if (cSoft[i] || cIsland[i] || cOut[i]) { r = 200; g = 40; b = 30; a = 190; }
      else if (cOnc[i]) { r = 214; g = 120; b = 20; a = 150; }
      else if (wheels[i]) { r = 20; g = 70; b = 130; a = 120; }
      else if (wheelsT[i]) { r = 20; g = 70; b = 130; a = 70; }
      else if (body[i]) { r = 20; g = 70; b = 130; a = 40; }
      else if (bodyT[i]) { r = 20; g = 70; b = 130; a = 22; }
      px[j] = r; px[j + 1] = g; px[j + 2] = b; px[j + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
    let swept = 0;
    for (let i = 0; i < N; i++) if (bodyT[i]) swept++;
    return {
      conflicts, overrunInfo, overlay: cv, bounds: { x0, y0, x1, y1 }, cell, w, h,
      masks: { off: cOff, soft: cSoft, dtRoad },
      stats: { celle: cell, arealbehov: swept * cell * cell, indersporing: sim.maxOff, straekning: sim.length },
    };
  }

  const SCREEN_RULES = [
    ['S1 Arealtillæg', `${TILLAEG.toFixed(1).replace('.', ',')} m arealtillæg på hjul og karosseri. Hjul med tillæg skal blive på kørebane eller overkørselsareal. Karosseri med tillæg må ikke ramme faste genstande.`],
    ['S2 Kantsten', 'Ingen overkørsel af kantsten ved fortov, cykelsti og heller.'],
    ['S3 Overkørselsareal', `Overkørselsarealer skal være mindst ${MIN_OVERKOERSEL.toFixed(1).replace('.', ',')} m brede.`],
    ['S4 Køremåde A', 'Arealbehovet må ikke berøre kørebane for modkørende.'],
  ];

  VD.mvt = { VEHICLE, VEHICLES, vehicleLength, buildPath, simulate, bodyRects, wheelRects, analyse, bandWidth, polyArea, SCREEN_RULES, TILLAEG, MIN_OVERKOERSEL };
})(typeof window !== 'undefined' ? window : globalThis);
