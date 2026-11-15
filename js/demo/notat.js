/* Skabelon til udkast til screeningsnotat. Bygges i browseren, ingen server. */
(function () {
  'use strict';
  const VD = window.VD;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (v, d) => (v === null || v === undefined ? '–' : v.toFixed(d === undefined ? 2 : d).replace('.', ','));

  function size(c) {
    if (c.dybde !== undefined) return `op til ${fmt(c.dybde)} m fra kørebanekant`;
    if (c.afstand !== undefined) return `${fmt(Math.max(0, c.afstand))} m`;
    if (c.areal) return `${fmt(c.areal, 1)} m²`;
    return '';
  }
  function vurdering(S) {
    const res = S.res;
    const V = S.vehicle;
    const nFejl = S.deviations.filter((x) => x.grad === 'fejl').length;
    const kon = res ? res.conflicts.filter((c) => c.grad === 'konflikt') : [];
    let t;
    if (!res) t = 'Screeningen er ikke gennemført, fordi tegningen mangler kørebane eller kørespor.';
    else if (kon.length) t = `Screeningen finder ${kon.length} konflikt${kon.length > 1 ? 'er' : ''} for ${V.kort.toLowerCase()} med det viste kørespor. Krydset kan ikke uden videre anbefales til køretøjet. Konflikterne bør efterprøves i AutoTURN, før der tages stilling til ombygning.`;
    else t = `Screeningen finder ingen konflikter for ${V.kort.toLowerCase()} med de valgte regler og det viste kørespor. Resultatet bør bekræftes i AutoTURN.`;
    if (nFejl) t += ` Tegningskontrollen fandt ${nFejl} fejl, som bør rettes, før tegningen bruges som grundlag.`;
    return t;
  }

  function build(S, imgs, propText) {
    const img = imgs.plan;
    const V = S.vehicle;
    const dato = new Date().toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' });
    const dev = S.deviations;
    const nd = { fejl: 0, advarsel: 0, info: 0 };
    dev.forEach((x) => nd[x.grad]++);
    const res = S.res;
    const kon = res ? res.conflicts.filter((c) => c.grad === 'konflikt') : [];
    const vurderingTxt = vurdering(S);

    const roles = Object.keys(S.roles).filter((k) => S.doc.layers[k].count > 0 && !VD.rules.LAYERS[k] && S.roles[k] !== 'none');
    const enheder = V.enheder.map((u) => `<tr><td>${u.navn}</td><td>${fmt(u.L, 2)}</td><td>${fmt(u.foran, 2)}</td><td>${fmt(u.bag, 2)}</td><td>${fmt(u.kobling, 2)}</td></tr>`).join('');

    const t1 = dev.length
      ? '<table><thead><tr><th>Nr.</th><th>Regel</th><th>Grad</th><th>Afvigelse</th><th>Lag</th><th>Forslag</th></tr></thead><tbody>' +
        dev.map((x) => `<tr><td>${x.nr}</td><td>${esc(x.regel)}</td><td>${x.grad}</td><td>${esc(x.tekst)}</td><td>${esc(x.lag)}</td><td>${esc(x.forslag)}</td></tr>`).join('') + '</tbody></table>'
      : '<p>Ingen afvigelser.</p>';
    const t2 = res && res.conflicts.length
      ? '<table><thead><tr><th>Nr.</th><th>Regel</th><th>Resultat</th><th>Beskrivelse</th><th>Størrelse</th><th>Sted (x ; y)</th></tr></thead><tbody>' +
        res.conflicts.map((c) => {
          return `<tr><td>${c.nr}</td><td>${esc(c.regel)}</td><td>${c.grad}</td><td>${esc(c.tekst)}</td><td>${size(c)}</td><td>${c.pos ? fmt(c.pos[0], 1) + ' ; ' + fmt(c.pos[1], 1) : ''}</td></tr>`;
        }).join('') + '</tbody></table>'
      : '<p>Ingen konflikter.</p>';

    return `
<header class="n-head">
  <div class="n-stamp">Udkast. Prototype.</div>
  <h3>Screeningsnotat: ${esc(V.kort.toLowerCase())} i kryds</h3>
  <dl>
    <div><dt>Tegning</dt><dd>${esc(S.fileName)}</dd></div>
    <div><dt>Dato</dt><dd>${dato}</dd></div>
    <div><dt>Udarbejdet af</dt><dd>Prototype udviklet af Lars Haugen Grenaker med AI</dd></div>
    <div><dt>Status</dt><dd>Ikke gennemgået. Til gennemgang af ingeniør.</dd></div>
  </dl>
</header>
<p class="n-warn">Prototype til tidlig screening. Erstatter ikke AutoTURN eller faglig vurdering. Værktøjet er ikke udviklet eller godkendt af Vejdirektoratet.</p>

<h4>1. Sammenfatning</h4>
<p>${vurderingTxt}</p>

<h4>2. Forudsætninger</h4>
<ul>
  <li>Køretøj: ${V.navn}. Længde ${fmt(VD.mvt.vehicleLength(V), 2)} m, bredde ${fmt(V.bredde, 2)} m.</li>
  <li>Køremåde A, 15 km/t. Hastigheden indgår kun som forudsætning for lavhastighedsmodellen.</li>
  <li>Kørespor for forakslens midtpunkt${S.isExample || S.drawn.length ? '' : ' fra tegningens lag for kørespor'}. Skarpe knæk er afrundet med radius ${fmt(S.radius, 1)} m.</li>
  <li>Arealtillæg ${fmt(VD.mvt.TILLAEG, 1)} m på hjul og karosseri. Mindste bredde af overkørselsareal ${fmt(VD.mvt.MIN_OVERKOERSEL, 1)} m.</li>
  ${res ? `<li>Arealbehovet er rasteret med celler på ${fmt(res.cell * 100, 0)} cm. Mål i notatet har den nøjagtighed.</li>` : ''}
  ${roles.length ? `<li>Lag uden for lagstrukturen er medtaget efter gæt på navnet: ${roles.map((k) => esc(k)).join(', ')}.</li>` : ''}
</ul>
<table class="n-small"><thead><tr><th>Enhed</th><th>Kobling til akselgruppe (m)</th><th>Overhæng foran (m)</th><th>Overhæng bag (m)</th><th>Kobling foran aksel (m)</th></tr></thead><tbody>${enheder}</tbody></table>
<p class="n-note">Køretøjets mål er antagelser valgt til prototypen. De er ikke Vejdirektoratets typekøretøjer og skal erstattes, før resultatet bruges.</p>

<h4>3. Trin 1: tegningskontrol</h4>
<p>${S.doc.entities.length} objekter på ${Object.keys(S.doc.layers).length} lag. ${nd.fejl} fejl, ${nd.advarsel} advarsler, ${nd.info} info.</p>
${t1}

<h4>4. Trin 2: screening for ${esc(V.kort.toLowerCase())}</h4>
${res ? `<p>Kørt strækning ${fmt(res.stats.straekning, 0)} m. Største indersporing af bageste akselgruppe ca. ${fmt(res.stats.indersporing, 1)} m. Arealbehov inkl. tillæg ca. ${fmt(res.stats.arealbehov, 0)} m².</p>` : ''}
${img ? `<figure><img src="${img}" alt="Plan med arealbehov og nummererede konflikter"><figcaption>Blå: arealbehov for hjul og karosseri inkl. tillæg. Rød: hjul uden for tilladt areal. Orange: kørebane for modkørende. Numrene henviser til tabellen.</figcaption></figure>` : ''}
${t2}

${S.prop && !S.prop.none ? `<h4>5. Forslag til videre vurdering</h4>
<p>${propText}</p>
<p>Konflikter før: ${S.prop.foer}. Konflikter efter: ${S.prop.efter}. Ombygning ca. ${fmt(S.prop.areal + S.prop.narrowArea, 0)} m².${S.prop.flyt.length ? ' Skal flyttes: ' + esc(S.prop.flyt.join(', ')) + '.' : ''}${S.prop.rest.length ? ' Løses ikke af forslaget: ' + esc(S.prop.rest.join(' ')) : ''}</p>
${imgs.efter ? `<figure><img src="${imgs.efter}" alt="Plan efter foreslået tilpasning"><figcaption>Grøn: foreslået udvidelse af kørebanen. Screeningen er kørt igen med den ændrede geometri.</figcaption></figure>` : ''}
<p class="n-note">Forslaget følger arealbehovet fra den forenklede model og er ikke en projekteret geometri. Arealet er et groft skøn. Afvanding, belægning, ledninger og arealerhvervelse er ikke vurderet.</p>` : ''}
<h4>${S.prop && !S.prop.none ? 6 : 5}. Regler i prototypen</h4>
<table class="n-small"><tbody>
${VD.rules.RULES.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}
${VD.mvt.SCREEN_RULES.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}
</tbody></table>
<p class="n-note">Tegningsreglerne er et udvalg inspireret af Vejdirektoratets Modelstandard og Tegningsstandard (digitalvej.vejdirektoratet.dk). Laglisten er prototypens egen.</p>

<h4>${S.prop && !S.prop.none ? 7 : 6}. Begrænsninger</h4>
<ul>
  <li>Sporkurven er en forenklet kinematisk model uden dækudskridning, styrevinkelgrænser og styrende aksler.</li>
  <li>Kun ét kørespor og én svingbevægelse er undersøgt. Længdeprofil, tværfald og frihøjde indgår ikke.</li>
  <li>Sigtforhold, signalanlæg og afmærkning er ikke vurderet.</li>
</ul>

<h4>${S.prop && !S.prop.none ? 8 : 7}. Gennemgang</h4>
<table class="n-sign"><tbody>
  <tr><td>Gennemgået af</td><td></td><td>Dato</td><td></td></tr>
  <tr><td>Efterprøvet i AutoTURN</td><td>☐ Ja &nbsp; ☐ Nej</td><td>Bemærkninger</td><td></td></tr>
</tbody></table>`;
  }

  const CSS = `body{font:14px/1.5 system-ui,Segoe UI,Arial,sans-serif;color:#16181c;max-width:820px;margin:32px auto;padding:0 20px}
h3{font-size:22px;margin:.2em 0}h4{font-size:15px;margin:1.6em 0 .4em;border-bottom:1px solid #16181c;padding-bottom:3px}
table{border-collapse:collapse;width:100%;font-size:12px;margin:.6em 0}th,td{border:1px solid #9aa0a6;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#eceae4}dl{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin:8px 0}dl div{display:flex;gap:8px}dt{color:#5f6368;min-width:96px}dd{margin:0}
.n-stamp{font-weight:600;font-size:12px;color:#b3261e}.n-warn{border:1.5px solid #b3261e;padding:8px 10px;font-weight:600}
.n-note{font-size:12px;color:#5f6368}figure{margin:1em 0}img{max-width:100%;border:1px solid #9aa0a6}figcaption{font-size:12px;color:#5f6368}
.n-sign td{height:34px}@media print{body{margin:0}}`;

  function standalone(inner) {
    return `<!doctype html><html lang="da"><head><meta charset="utf-8"><title>Udkast til screeningsnotat</title><style>${CSS}</style></head><body>${inner}</body></html>`;
  }
  function download(name, content, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  VD.notat = { build, standalone, download, size, vurdering };
})();
