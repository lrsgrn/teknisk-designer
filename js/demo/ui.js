/* Brugerflade til demoen "Fra tegning til screening". */
(function () {
  'use strict';
  const VD = window.VD;
  const $ = (id) => document.getElementById(id);
  const fmt = (v, d) => (v === null || v === undefined ? '–' : v.toFixed(d === undefined ? 2 : d).replace('.', ','));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const ROLE_LABEL = {
    road: 'Kørebane', oncoming: 'Kørebane for modkørende', overrun: 'Overkørselsareal', soft: 'Fortov / cykelsti',
    island: 'Helle', curb: 'Kantsten (kun visning)', marking: 'Afmærkning (kun visning)', object: 'Fast genstand',
    path: 'Kørespor', title: 'Tegningshoved', text: 'Tekst', none: 'Bruges ikke',
  };

  const S = {
    doc: null, fileName: '', isExample: false, roles: {}, deviations: [], scene: null,
    pathPts: null, radius: 14, entryX: 2, exitY: -2.25, sim: null, res: null, vehicle: VD.mvt.VEHICLES[0],
    pos: 0, playing: false, drawing: false, drawn: [], view: null, viewAll: null, selDev: null, selConf: null, prop: null,
  };
  VD.state = S;
  const maxPixels = () => (window.innerWidth < 700 ? 1000 : 1500);
  const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  /* ---------- indlæsning ---------- */
  function load(text, fileName, isExample) {
    S.doc = VD.dxf.parse(text);
    S.fileName = fileName;
    S.isExample = !!isExample;
    S.roles = {};
    for (const name of Object.keys(S.doc.layers)) S.roles[name] = VD.rules.guessRole(name);
    S.deviations = VD.rules.check(S.doc, fileName);
    S.drawn = []; S.drawing = false; S.pos = 0; S.selDev = null; S.selConf = null;
    $('demo-file').textContent = fileName + (isExample ? ' (indbygget eksempel)' : '');
    $('example-controls').hidden = !isExample;
    $('btn-draw').hidden = isExample;
    renderStep1();
    rebuild();
  }

  function buildScene() {
    const zones = { road: [], oncoming: [], overrun: [], soft: [], island: [] };
    const lines = { curb: [], marking: [] };
    const other = [];
    const objects = [];
    let path = null;
    for (const e of S.doc.entities) {
      const role = S.roles[e.layer] || 'none';
      if (zones[role] && e.type === 'LWPOLYLINE' && e.verts.length >= 3) zones[role].push(VD.dxf.polyPoints(e.verts, true));
      else if (lines[role] && (e.type === 'LWPOLYLINE' || e.type === 'LINE')) lines[role].push(entPts(e));
      else if (role === 'object' && (e.type === 'INSERT' || e.type === 'CIRCLE' || e.type === 'POINT')) {
        const def = VD.rules.LAYERS[e.layer];
        const id = e.attribs && e.attribs.ID ? ' ' + e.attribs.ID : '';
        objects.push({ c: e.c, r: e.r || 0.1, label: ((def && def.label) || e.layer).toLowerCase() + id });
      } else if (role === 'path' && e.type === 'LWPOLYLINE') { if (!path) path = VD.dxf.polyPoints(e.verts, false); }
      else other.push(e);
    }
    return { zones, lines, objects, path, other };
  }
  function entPts(e) {
    if (e.type === 'LWPOLYLINE') return VD.dxf.polyPoints(e.verts, e.closed).concat(e.closed && e.verts.length ? [[e.verts[0].x, e.verts[0].y]] : []);
    if (e.type === 'LINE') return e.pts;
    return null;
  }

  function rebuild() {
    S.scene = buildScene();
    let pts = S.scene.path;
    if (S.isExample) pts = VD.example.path(S.entryX, S.exitY);
    if (S.drawn.length >= 2) pts = S.drawn;
    S.pathPts = pts;
    $('t2-msg').textContent = '';
    S.sim = null; S.res = null; S.path = null; S.prop = null; S.selConf = null;
    if (!S.scene.zones.road.length) $('t2-msg').textContent = 'Ingen lag er valgt som kørebane. Vælg roller for lagene under trin 1.';
    else if (!pts) $('t2-msg').textContent = 'Tegningen har intet kørespor. Tryk "Tegn kørespor" og klik punkterne ind i planen.';
    else {
      const path = VD.mvt.buildPath(pts, S.radius, 0.1);
      if (path.length > 20) {
        S.sim = VD.mvt.simulate(path, S.vehicle);
        S.path = path;
        S.res = VD.mvt.analyse(S.scene, S.sim, { vehicle: S.vehicle, maxPixels: maxPixels(), makeCanvas });
        S.pos = Math.min(S.pos, S.sim.poses.length - 1);
      }
    }
    fitViews();
    renderStep2();
    renderProposal();
    drawAll();
    renderNotat();
  }

  /* ---------- trin 1 ---------- */
  function renderStep1() {
    const d = S.deviations;
    const n = { fejl: 0, advarsel: 0, info: 0 };
    d.forEach((x) => n[x.grad]++);
    $('t1-summary').innerHTML =
      `<strong class="${n.fejl ? 'bad' : 'ok'}">${n.fejl} fejl</strong>, ${n.advarsel} ${n.advarsel === 1 ? 'advarsel' : 'advarsler'} og ${n.info} info i ${S.doc.entities.length} objekter på ${Object.keys(S.doc.layers).length} lag. <span class="muted">Klik på en række for at se objektet i tegningen.</span>`;
    $('t1-table').innerHTML = d.length
      ? '<table><thead><tr><th>Nr.</th><th>Regel</th><th>Grad</th><th>Afvigelse</th><th>Lag</th><th>Forslag</th></tr></thead><tbody>' +
        d.map((x) => `<tr data-dev="${x.nr}" class="${x.pos ? 'click' : ''}" ${x.pos ? 'tabindex="0"' : ''}><td>${x.nr}</td><td>${esc(x.regel)}</td><td><span class="tag tag-${x.grad}">${x.grad}</span></td><td>${esc(x.tekst)}</td><td class="mono">${esc(x.lag)}</td><td>${esc(x.forslag)}</td></tr>`).join('') +
        '</tbody></table>'
      : '<p>Ingen afvigelser fundet.</p>';
    $('t1-table').querySelectorAll('tr.click').forEach((tr) => {
      const pick = () => selectDev(parseInt(tr.dataset.dev, 10), 'row');
      tr.addEventListener('click', pick);
      tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
    });
    const names = Object.keys(S.doc.layers).filter((k) => S.doc.layers[k].count > 0);
    $('t1-layers').innerHTML = names.map((name) => {
      const known = !!VD.rules.LAYERS[name];
      const opts = Object.keys(ROLE_LABEL).map((r) => `<option value="${r}"${S.roles[name] === r ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`).join('');
      return `<label class="layer-row${known ? '' : ' unknown'}"><span class="mono">${esc(name)}</span><span class="muted">${S.doc.layers[name].count}</span><select data-layer="${esc(name)}">${opts}</select></label>`;
    }).join('');
    $('t1-layers').querySelectorAll('select').forEach((sel) => sel.addEventListener('change', () => { S.roles[sel.dataset.layer] = sel.value; rebuild(); }));
  }
  function selectDev(nr, from) {
    S.selDev = S.selDev === nr && from === 'row' ? null : nr;
    $('t1-table').querySelectorAll('tr').forEach((tr) => tr.classList.toggle('sel', parseInt(tr.dataset.dev, 10) === S.selDev));
    drawPlan($('plan1'), plan1Opts());
    if (S.selDev === null) return;
    if (from === 'row') $('plan1').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    else { const tr = $('t1-table').querySelector(`tr[data-dev="${nr}"]`); if (tr) tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }

  /* ---------- trin 2 ---------- */
  function renderStep2() {
    const V = S.vehicle;
    $('veh').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === V.id)));
    $('veh-note').textContent = `${V.navn}. Længde ${fmt(VD.mvt.vehicleLength(V), 2)} m, bredde ${fmt(V.bredde, 2)} m. Målene er mine antagelser, ikke Vejdirektoratets typekøretøjer.`;
    const r = S.res;
    if (!r) { $('t2-summary').innerHTML = ''; $('t2-table').innerHTML = ''; $('res-sum').textContent = ''; return; }
    const k = r.conflicts.filter((c) => c.grad === 'konflikt').length;
    const b = r.conflicts.filter((c) => c.grad === 'bemærkning').length;
    $('t2-summary').innerHTML =
      `<strong class="${k ? 'bad' : 'ok'}">${k} ${k === 1 ? 'konflikt' : 'konflikter'}</strong> og ${b} ${b === 1 ? 'bemærkning' : 'bemærkninger'}. <span class="muted">Indersporing ca. ${fmt(r.stats.indersporing, 1)} m, arealbehov ca. ${fmt(r.stats.arealbehov, 0)} m², rastercelle ${fmt(r.cell * 100, 0)} cm.</span>`;
    $('t2-table').innerHTML = r.conflicts.length
      ? '<table><thead><tr><th>Nr.</th><th>Regel</th><th>Resultat</th><th>Beskrivelse</th><th>Størrelse</th></tr></thead><tbody>' +
        r.conflicts.map((c) => `<tr data-conf="${c.nr}" class="click" tabindex="0"><td>${c.nr}</td><td>${esc(c.regel)}</td><td><span class="tag tag-${c.grad}">${c.grad}</span></td><td>${esc(c.tekst)}</td><td>${VD.notat.size(c)}</td></tr>`).join('') + '</tbody></table>'
      : '<p>Ingen konflikter fundet med de valgte regler.</p>';
    $('t2-table').querySelectorAll('tr.click').forEach((tr) => {
      const pick = () => selectConf(parseInt(tr.dataset.conf, 10), 'row');
      tr.addEventListener('click', pick);
      tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
    });
    $('sl-pos').max = S.sim.poses.length - 1;
    $('sl-pos').value = S.pos;
    $('res-sum').textContent = VD.notat.vurdering(S);
  }
  function selectConf(nr, from) {
    S.selConf = S.selConf === nr && from === 'row' ? null : nr;
    $('t2-table').querySelectorAll('tr').forEach((tr) => tr.classList.toggle('sel', parseInt(tr.dataset.conf, 10) === S.selConf));
    draw();
    if (S.selConf === null) return;
    if (from === 'row') $('plan').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    else { const tr = $('t2-table').querySelector(`tr[data-conf="${nr}"]`); if (tr) tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }

  /* ---------- forslag til tilpasning ---------- */
  function propose() {
    const r = S.res;
    if (!r) return;
    const N = r.w * r.h, w = r.w;
    const off = r.masks.off;
    const extra = new Uint8Array(N);
    let n = 0, depth = 0;
    for (let i = 0; i < N; i++) {
      if (off[i] || (i % w > 0 && off[i - 1]) || (i % w < w - 1 && off[i + 1]) || (i >= w && off[i - w]) || (i < N - w && off[i + w])) { extra[i] = 1; n++; }
      if (off[i] && r.masks.dtRoad[i] > depth) depth = r.masks.dtRoad[i];
    }
    const narrow = (S.scene.zones.overrun || []).filter((p) => VD.mvt.bandWidth(p) < VD.mvt.MIN_OVERKOERSEL - 0.01);
    const narrowArea = narrow.reduce((s, p) => s + VD.mvt.polyArea(p), 0);
    if (!n && !narrow.length) { S.prop = { none: true }; renderProposal(); return; }
    const res2 = VD.mvt.analyse(S.scene, S.sim, { vehicle: S.vehicle, maxPixels: maxPixels(), makeCanvas, extraRoad: extra, absorbNarrowOverrun: true });
    const img = makeCanvas(r.w, r.h);
    const ctx = img.getContext('2d');
    const id = ctx.createImageData(r.w, r.h);
    for (let i = 0, j = 0; i < N; i++, j += 4) if (extra[i]) { id.data[j] = 46; id.data[j + 1] = 125; id.data[j + 2] = 70; id.data[j + 3] = 170; }
    ctx.putImageData(id, 0, 0);
    const kon = (x) => x.conflicts.filter((c) => c.grad === 'konflikt');
    const rest = kon(res2);
    S.prop = {
      res2, extraImg: img, narrow, areal: n * r.cell * r.cell, narrowArea, depth,
      foer: kon(r).length, efter: rest.length,
      flyt: rest.filter((c) => c.afstand !== undefined).map((c) => c.objekt),
      rest: rest.filter((c) => c.afstand === undefined).map((c) => c.tekst),
    };
    renderProposal();
    renderNotat();
  }
  function proposalText(p) {
    const parts = [];
    if (p.areal > 0.05) parts.push(`Flyt kantstenen i svingets inderside op til ca. ${fmt(p.depth, 1)} m, så kørebanen udvides med ca. ${fmt(p.areal, 0)} m².`);
    if (p.narrow.length) parts.push(`Det smalle overkørselsareal (ca. ${fmt(p.narrowArea, 0)} m²) lægges ind i kørebanen.`);
    return parts.join(' ');
  }
  function renderProposal() {
    const box = $('proposal');
    const p = S.prop;
    $('btn-propose').disabled = !S.res;
    if (!p) { box.hidden = true; return; }
    box.hidden = false;
    if (p.none) { box.innerHTML = '<p>Der er ingen konflikter med kantsten eller overkørselsareal at tilpasse for dette køretøj og kørespor.</p>'; return; }
    box.innerHTML = `
      <h4>Forslag til videre vurdering</h4>
      <p class="lead">${proposalText(p)}</p>
      <div class="ba">
        <figure><canvas id="prop-before" width="700" height="500"></canvas><figcaption><strong>Før:</strong> ${p.foer} ${p.foer === 1 ? 'konflikt' : 'konflikter'}</figcaption></figure>
        <figure><canvas id="prop-after" width="700" height="500"></canvas><figcaption><strong>Efter:</strong> ${p.efter} ${p.efter === 1 ? 'konflikt' : 'konflikter'}. Grøn: ca. ${fmt(p.areal + p.narrowArea, 0)} m² ombygning</figcaption></figure>
      </div>
      ${p.flyt.length ? `<p><strong>Skal flyttes:</strong> ${esc(p.flyt.join(', '))}.</p>` : ''}
      ${p.rest.length ? `<p><strong>Løses ikke af forslaget:</strong> ${esc(p.rest.join(' '))}</p>` : ''}
      <p class="muted small">Forslaget følger arealbehovet fra den forenklede model celle for celle. Det er ikke en projekteret geometri, og arealet er et groft skøn. Afvanding, belægning, ledninger og arealerhvervelse er ikke vurderet.</p>`;
    drawPlan($('prop-before'), { px: 1, noVehicle: true, noSel: true });
    drawPlan($('prop-after'), { px: 1, noVehicle: true, noSel: true, res: p.res2, prop: p });
  }

  /* ---------- tegning af plan ---------- */
  function fitViews() {
    const box = () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
    const grow = (b, q) => { b.x0 = Math.min(b.x0, q[0]); b.y0 = Math.min(b.y0, q[1]); b.x1 = Math.max(b.x1, q[0]); b.y1 = Math.max(b.y1, q[1]); };
    const all = box();
    for (const e of S.doc.entities) {
      const p = entPts(e);
      if (p) p.forEach((q) => grow(all, q)); else if (e.c) grow(all, e.c);
    }
    if (!isFinite(all.x0)) Object.assign(all, { x0: -50, y0: -50, x1: 50, y1: 50 });
    const pad = (b, m) => ({ x0: b.x0 - m, y0: b.y0 - m, x1: b.x1 + m, y1: b.y1 + m });
    S.viewAll = pad(all, 2);
    if (S.pathPts && S.pathPts.length) {
      const b = box();
      S.pathPts.forEach((q) => grow(b, q));
      S.view = { x0: Math.max(all.x0 - 2, b.x0 - 14), y0: Math.max(all.y0 - 2, b.y0 - 6), x1: Math.min(all.x1 + 2, b.x1 + 6), y1: Math.min(all.y1 + 2, b.y1 + 14) };
    } else S.view = S.viewAll;
  }

  function drawPlan(cv, opts) {
    opts = opts || {};
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const v = opts.view || S.view;
    const res = opts.res || (opts.mode === 'drawing' ? null : S.res);
    const sc = Math.min(W / (v.x1 - v.x0), H / (v.y1 - v.y0));
    const ox = (W - (v.x1 - v.x0) * sc) / 2, oy = (H - (v.y1 - v.y0) * sc) / 2;
    const T = (q) => [ox + (q[0] - v.x0) * sc, oy + (v.y1 - q[1]) * sc];
    cv._inv = (px, py) => [v.x0 + (px - ox) / sc, v.y1 - (py - oy) / sc];
    cv._marks = [];
    const trace = (p, close) => { ctx.beginPath(); p.forEach((q, i) => { const t = T(q); if (i) ctx.lineTo(t[0], t[1]); else ctx.moveTo(t[0], t[1]); }); if (close) ctx.closePath(); };
    const px = opts.px || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#f4f5f6'; ctx.fillRect(0, 0, W, H);
    if (!S.scene) return;
    const z = S.scene.zones;
    const fill = (list, color) => { ctx.fillStyle = color; for (const p of list) { trace(p, true); ctx.fill(); } };
    fill(z.soft, '#dfe7d6'); fill(z.road, '#d5d2ca'); fill(z.overrun, '#c9ab7c'); fill(z.island, '#b9c7ae');
    if (opts.prop) fill(opts.prop.narrow, '#d5d2ca');
    ctx.strokeStyle = 'rgba(180,110,20,.55)'; ctx.setLineDash([4 * px, 4 * px]); ctx.lineWidth = px;
    for (const p of z.oncoming) { trace(p, true); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.strokeStyle = '#8a958a'; ctx.lineWidth = 0.8 * px;
    for (const p of z.soft) { trace(p, true); ctx.stroke(); }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2 * px; ctx.setLineDash([8 * px, 8 * px]);
    for (const p of S.scene.lines.marking) { trace(p, false); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.strokeStyle = '#3b3f45'; ctx.lineWidth = 1.4 * px;
    for (const p of S.scene.lines.curb) { trace(p, false); ctx.stroke(); }

    const imgAt = (img, b) => { const a = T([b.x0, b.y1]), c = T([b.x1, b.y0]); ctx.drawImage(img, a[0], a[1], c[0] - a[0], c[1] - a[1]); };
    if (opts.prop) { imgAt(opts.prop.extraImg, res.bounds); ctx.fillStyle = 'rgba(46,125,70,.65)'; for (const p of opts.prop.narrow) { trace(p, true); ctx.fill(); } }
    if (res) imgAt(res.overlay, res.bounds);

    if (opts.mode === 'drawing') {
      // øvrige objekter i tegningen: løse streger, tekst, tegningshoved
      ctx.strokeStyle = '#3b3f45'; ctx.fillStyle = '#3b3f45'; ctx.lineWidth = px;
      ctx.font = `${10 * px}px "Segoe UI", system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      for (const e of S.scene.other) {
        const p = entPts(e);
        if (p) { trace(p, false); ctx.stroke(); }
        else if (e.type === 'TEXT') { const t = T(e.c); ctx.fillText(e.text, t[0], t[1]); }
        else if (e.type === 'INSERT' && e.c) {
          const t = T(e.c);
          if (/HOVED/i.test(e.block)) { ctx.strokeRect(t[0], t[1] - 9 * sc, 20 * sc, 9 * sc); ctx.fillText(e.attribs.TEGNINGSNR || 'Tegningshoved', t[0] + 4 * px, t[1] - 4 * px); }
          else ctx.strokeRect(t[0] - 3 * px, t[1] - 3 * px, 6 * px, 6 * px);
        } else if (e.type === 'CIRCLE') { const t = T(e.c); ctx.beginPath(); ctx.arc(t[0], t[1], Math.max(2 * px, e.r * sc), 0, 7); ctx.stroke(); }
      }
    }
    const pathLine = opts.mode === 'drawing' ? S.scene.path : S.path;
    if (pathLine) {
      ctx.strokeStyle = '#7a1f5c'; ctx.lineWidth = 1.2 * px; ctx.setLineDash([6 * px, 4 * px]);
      trace(pathLine, false); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const o of S.scene.objects) {
      const t = T(o.c);
      ctx.fillStyle = '#16181c'; ctx.beginPath(); ctx.arc(t[0], t[1], Math.max(3 * px, o.r * sc), 0, 7); ctx.fill();
    }
    if (S.sim && !opts.noVehicle && opts.mode !== 'drawing') {
      const pose = S.sim.poses[Math.max(0, Math.min(S.sim.poses.length - 1, Math.round(S.pos) || 0))];
      ctx.fillStyle = '#16181c';
      for (const r of VD.mvt.wheelRects(pose, S.vehicle)) { trace(r, true); ctx.globalAlpha = 0.35; ctx.fill(); }
      ctx.globalAlpha = 1; ctx.strokeStyle = '#0d3b66'; ctx.lineWidth = 1.8 * px; ctx.fillStyle = 'rgba(255,255,255,.55)';
      for (const r of VD.mvt.bodyRects(pose, S.vehicle)) { trace(r, true); ctx.fill(); ctx.stroke(); }
    }
    if (S.drawn.length && opts.mode !== 'drawing') {
      ctx.strokeStyle = '#7a1f5c'; ctx.fillStyle = '#7a1f5c'; ctx.lineWidth = 1.5 * px;
      trace(S.drawn, false); ctx.stroke();
      for (const q of S.drawn) { const t = T(q); ctx.beginPath(); ctx.arc(t[0], t[1], 4 * px, 0, 7); ctx.fill(); }
    }

    // nummererede markører
    const badge = (t, nr, color, sel, key) => {
      const r = (sel ? 12 : 9) * px;
      if (sel) { ctx.strokeStyle = color; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.arc(t[0], t[1], r + 5 * px, 0, 7); ctx.stroke(); }
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(t[0], t[1], r, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * px; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `600 ${11 * px}px "Segoe UI", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(nr), t[0], t[1] + 0.5 * px);
      cv._marks.push({ x: t[0], y: t[1], nr: key });
    };
    if (opts.mode === 'drawing' && !opts.noMarkers) {
      const used = [];
      for (const d of S.deviations) {
        if (!d.pos) continue;
        const sel = !opts.noSel && S.selDev === d.nr;
        if (sel) {
          const e = S.doc.entities.find((x) => x.id === d.id);
          const p = e && entPts(e);
          if (p) { ctx.strokeStyle = '#b3261e'; ctx.lineWidth = 3.5 * px; trace(p, false); ctx.stroke(); }
        }
        const t = T(d.pos);
        while (used.some((u) => Math.hypot(u[0] - t[0], u[1] - t[1]) < 20 * px)) t[0] += 22 * px;
        used.push(t);
        badge(t, d.nr, d.grad === 'fejl' ? '#b3261e' : d.grad === 'advarsel' ? '#8a5a00' : '#5f6368', sel, d.nr);
      }
    } else if (res && opts.mode !== 'drawing' && !opts.noMarkers) {
      for (const c of res.conflicts) {
        if (!c.pos) continue;
        badge(T(c.pos), c.nr, c.grad === 'konflikt' ? '#b3261e' : c.grad === 'ok' ? '#2e6b3a' : '#5f6368', !opts.noSel && !opts.res && S.selConf === c.nr, c.nr);
      }
    }
    if (opts.plain) return;
    // målestok og nordpil
    const bar = 10 * sc;
    ctx.strokeStyle = '#16181c'; ctx.fillStyle = '#16181c'; ctx.lineWidth = 1.5 * px;
    ctx.beginPath(); ctx.moveTo(14 * px, H - 14 * px); ctx.lineTo(14 * px + bar, H - 14 * px); ctx.moveTo(14 * px, H - 19 * px); ctx.lineTo(14 * px, H - 9 * px); ctx.moveTo(14 * px + bar, H - 19 * px); ctx.lineTo(14 * px + bar, H - 9 * px); ctx.stroke();
    ctx.font = `${11 * px}px "Segoe UI", system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('10 m', 14 * px, H - 22 * px);
    ctx.textAlign = 'center'; ctx.fillText('N', W - 22 * px, 30 * px);
    ctx.beginPath(); ctx.moveTo(W - 22 * px, 32 * px); ctx.lineTo(W - 27 * px, 48 * px); ctx.lineTo(W - 17 * px, 48 * px); ctx.closePath(); ctx.fill();
  }

  function sizeCanvas(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    return dpr;
  }
  const plan1Opts = () => ({ px: Math.min(2, window.devicePixelRatio || 1), mode: 'drawing', view: S.viewAll });
  function draw() { drawPlan($('plan'), { px: sizeCanvas($('plan')) }); }
  function drawAll() {
    sizeCanvas($('plan1'));
    drawPlan($('plan1'), plan1Opts());
    draw();
    drawPlan($('th-1'), { mode: 'drawing', view: S.viewAll, noMarkers: true, plain: true, px: 0.8 });
    drawPlan($('th-2'), { mode: 'drawing', view: S.viewAll, noSel: true, plain: true, px: 0.8 });
    drawPlan($('th-3'), { noVehicle: true, noSel: true, plain: true, px: 0.8 });
  }
  function planImage(opts) {
    const cv = makeCanvas(1400, 1000);
    drawPlan(cv, Object.assign({ px: 1.6, noVehicle: true, noSel: true }, opts || {}));
    return cv.toDataURL('image/png');
  }

  /* ---------- animation ---------- */
  let last = 0;
  function tick(t) {
    if (!S.playing || !S.sim) return;
    const dt = Math.max(0, Math.min(0.1, (t - last) / 1000)); last = t;
    S.pos += (15 / 3.6) * 2 * dt * 10; // 15 km/t, vist i dobbelt hastighed, 10 stillinger pr. meter
    if (S.pos >= S.sim.poses.length - 1) { S.pos = S.sim.poses.length - 1; S.playing = false; $('btn-play').textContent = 'Kør igen'; }
    $('sl-pos').value = S.pos;
    draw();
    if (S.playing) requestAnimationFrame(tick);
  }

  function renderNotat() {
    const imgs = { plan: S.res ? planImage() : null };
    if (S.prop && !S.prop.none) imgs.efter = planImage({ res: S.prop.res2, prop: S.prop });
    $('notat').innerHTML = VD.notat.build(S, imgs, S.prop && !S.prop.none ? proposalText(S.prop) : '');
  }

  function markClick(cv, ev, fn) {
    const r = cv.getBoundingClientRect();
    const k = cv.width / r.width;
    const x = (ev.clientX - r.left) * k, y = (ev.clientY - r.top) * k;
    let best = null, bd = 18 * k;
    for (const m of cv._marks || []) { const d = Math.hypot(m.x - x, m.y - y); if (d < bd) { bd = d; best = m; } }
    if (best) fn(best.nr);
    return [x, y];
  }

  /* ---------- hændelser ---------- */
  function init() {
    if (!$('demo')) return;
    $('veh').innerHTML = VD.mvt.VEHICLES.map((v) => `<button type="button" data-id="${v.id}" aria-pressed="false">${v.kort}</button>`).join('');
    $('veh').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { S.vehicle = VD.mvt.VEHICLES.find((v) => v.id === b.dataset.id); S.pos = 0; rebuild(); }));
    $('btn-example').addEventListener('click', () => load(VD.example.build(), VD.example.fileName, true));
    $('dxf-file').addEventListener('change', (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try { load(String(rd.result), f.name, false); }
        catch (err) { $('t2-msg').textContent = 'Filen kunne ikke læses som ASCII-DXF: ' + err.message; }
      };
      rd.readAsText(f);
    });
    $('btn-example-dl').addEventListener('click', () => VD.notat.download(VD.example.fileName, VD.example.build(), 'application/dxf'));
    let timer = 0;
    const later = () => { clearTimeout(timer); timer = setTimeout(rebuild, 120); };
    const bind = (id, key, out, unit, d) => {
      const el = $(id);
      const show = () => ($(out).textContent = fmt(parseFloat(el.value), d) + unit);
      el.addEventListener('input', () => { S[key] = parseFloat(el.value); show(); later(); });
      show();
    };
    bind('sl-radius', 'radius', 'out-radius', ' m', 1);
    bind('sl-entry', 'entryX', 'out-entry', ' m', 2);
    bind('sl-exit', 'exitY', 'out-exit', ' m', 2);
    $('sl-pos').addEventListener('input', (e) => { S.pos = parseFloat(e.target.value); S.playing = false; $('btn-play').textContent = 'Kør'; draw(); });
    $('btn-play').addEventListener('click', () => {
      if (!S.sim) return;
      if (S.playing) { S.playing = false; $('btn-play').textContent = 'Kør'; return; }
      if (S.pos >= S.sim.poses.length - 2) S.pos = 0;
      S.playing = true; $('btn-play').textContent = 'Pause'; last = performance.now(); requestAnimationFrame(tick);
    });
    $('btn-draw').addEventListener('click', () => {
      S.drawing = !S.drawing;
      $('btn-draw').textContent = S.drawing ? 'Færdig med kørespor' : 'Tegn kørespor';
      $('plan').classList.toggle('drawing', S.drawing);
      if (S.drawing) { S.drawn = []; S.sim = null; S.res = null; S.path = null; S.view = S.viewAll; draw(); }
      else rebuild();
    });
    $('plan').addEventListener('click', (ev) => {
      const cv = $('plan');
      const p = markClick(cv, ev, (nr) => { if (!S.drawing) selectConf(nr, 'plan'); });
      if (S.drawing) { S.drawn.push(cv._inv(p[0], p[1])); draw(); }
    });
    $('plan1').addEventListener('click', (ev) => markClick($('plan1'), ev, (nr) => selectDev(nr, 'plan')));
    $('btn-propose').addEventListener('click', propose);
    $('btn-pdf').addEventListener('click', () => {
      // Udskriv kun notatet: læg det i en skjult ramme og åbn browserens udskriftsdialog ("Gem som PDF").
      const old = $('print-frame');
      if (old) old.remove();
      const fr = document.createElement('iframe');
      fr.id = 'print-frame';
      fr.setAttribute('aria-hidden', 'true');
      fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      document.body.appendChild(fr);
      fr.srcdoc = VD.notat.standalone($('notat').innerHTML);
      fr.onload = () => setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); }, 150);
    });
    $('btn-html').addEventListener('click', () => VD.notat.download('screeningsnotat-udkast.html', VD.notat.standalone($('notat').innerHTML), 'text/html'));
    window.addEventListener('resize', () => { if (S.doc) drawAll(); });
    load(VD.example.build(), VD.example.fileName, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
