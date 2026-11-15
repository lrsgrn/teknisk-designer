/* Trin 1: tegningskontrol.
   Reglerne er et lille udvalg, som er INSPIRERET af Vejdirektoratets Modelstandard og
   Tegningsstandard (digitalvej.vejdirektoratet.dk). Laglisten er demoens egen og er ikke
   DDA-lagstrukturen. Filnavnssyntaksen følger siden "Modelnavngivning" i Modelstandarden,
   her med .dxf i stedet for .dgn. */
(function (root) {
  'use strict';
  const VD = (root.VD = root.VD || {});

  // rolle: bruges af trin 2. area = skal være lukket polylinje.
  const LAYERS = {
    'V-KOEREBANE': { label: 'Kørebane', role: 'road', area: true },
    'V-MODKOERENDE': { label: 'Kørebane for modkørende', role: 'oncoming', area: true },
    'V-OVERKOERSEL': { label: 'Overkørselsareal', role: 'overrun', area: true },
    'V-FORTOV': { label: 'Fortov', role: 'soft', area: true },
    'V-CYKELSTI': { label: 'Cykelsti', role: 'soft', area: true },
    'V-HELLE': { label: 'Helle', role: 'island', area: true },
    'V-KANTSTEN': { label: 'Kantsten', role: 'curb' },
    'V-AFMAERKNING': { label: 'Kørebaneafmærkning', role: 'marking' },
    'U-TAVLE': { label: 'Tavle', role: 'object', attribs: ['TYPE-ID', 'ID'] },
    'U-MAST': { label: 'Mast', role: 'object', attribs: ['TYPE-ID', 'ID'] },
    'A-KOERESPOR': { label: 'Kørespor (foraksel)', role: 'path' },
    'T-TEGNINGSHOVED': { label: 'Tegningshoved', role: 'title' },
    'T-TEKST': { label: 'Tekst', role: 'text' },
  };

  const ROLE_HINTS = [
    [/modk/i, 'oncoming'], [/overk/i, 'overrun'], [/k(oe|ø|o)re?bane|vejbane|asfalt/i, 'road'],
    [/fortov|cykel|sti\b/i, 'soft'], [/helle/i, 'island'], [/kantsten|kant/i, 'curb'],
    [/tavle|skilt|mast|stander/i, 'object'], [/spor|path|tracking/i, 'path'], [/hoved|title/i, 'title'],
  ];
  function guessRole(name) {
    if (LAYERS[name]) return LAYERS[name].role;
    for (const [re, role] of ROLE_HINTS) if (re.test(name)) return role;
    return 'none';
  }
  function suggestLayer(name) {
    const role = guessRole(name);
    if (role === 'none') return null;
    const up = name.toUpperCase();
    let best = null;
    for (const k of Object.keys(LAYERS)) {
      if (LAYERS[k].role !== role) continue;
      const tail = k.split('-')[1];
      if (up.includes(tail.slice(0, 5))) return k;
      best = best || k;
    }
    return best;
  }

  const FASER = ['ff', 'uf', 'f1', 'f2', 'f3', 'f3l', 'f3d', 'f4', 'f5'];
  function checkFileName(name) {
    // [Projektnr]_[Status]_[evt. fritekst]_[evt. infix]_[Fase].[Disciplin].dxf
    const m = /^(.+)\.([a-z0-9]+)\.(dxf|dgn)$/i.exec(name);
    if (!m) return 'Filnavnet mangler disciplin som ekstension, fx "…_f3.fv.dxf".';
    const parts = m[1].split('_');
    if (parts.length < 3) return 'Filnavnet skal have mindst projektnr., status og fase adskilt af "_".';
    if (!/^\d+$/.test(parts[0])) return `Første led "${parts[0]}" er ikke et projektnummer.`;
    if (!/^[EIP]$/.test(parts[1])) return `Status "${parts[1]}" skal være E, I eller P.`;
    const fase = parts[parts.length - 1];
    if (!FASER.includes(fase)) return `Fase "${fase}" skal være en af: ${FASER.join(', ')}.`;
    return null;
  }

  const r3 = (v) => Math.round(v * 1000);
  function signature(e) {
    switch (e.type) {
      case 'LINE': {
        const a = e.pts.map((q) => r3(q[0]) + ',' + r3(q[1]));
        return 'L:' + a.slice().sort().join('|');
      }
      case 'LWPOLYLINE': {
        const a = e.verts.map((v) => r3(v.x) + ',' + r3(v.y) + ',' + r3(v.bulge || 0));
        const fwd = a.join('|');
        const rev = a.slice().reverse().join('|');
        return 'P' + (e.closed ? 'c' : 'o') + ':' + (fwd < rev ? fwd : rev);
      }
      case 'CIRCLE': return 'C:' + r3(e.c[0]) + ',' + r3(e.c[1]) + ',' + r3(e.r);
      case 'ARC': return 'A:' + [e.c[0], e.c[1], e.r, e.a0, e.a1].map(r3).join(',');
      case 'INSERT': return 'I:' + e.block + ':' + r3(e.c[0]) + ',' + r3(e.c[1]);
      case 'TEXT': return 'T:' + e.text + ':' + r3(e.c[0]) + ',' + r3(e.c[1]);
      default: return e.type + ':' + r3(e.c[0]) + ',' + r3(e.c[1]);
    }
  }
  function where(e) {
    let q = e.c || (e.pts && e.pts[0]) || (e.verts && e.verts.length && [e.verts[0].x, e.verts[0].y]) || [0, 0];
    return [q[0], q[1]];
  }

  /* Returnerer afvigelsesliste. grad: 'fejl' | 'advarsel' | 'info' */
  function check(doc, fileName) {
    const out = [];
    const add = (regel, grad, tekst, e, forslag) =>
      out.push({ nr: out.length + 1, regel, grad, tekst, lag: e ? e.layer : '', id: e ? e.id : null, pos: e ? where(e) : null, forslag: forslag || '' });

    // R1 Filnavn
    const fn = checkFileName(fileName || '');
    if (fn) add('R1 Filnavn', 'advarsel', fn, null, 'Syntaks: [Projektnr]_[Status]_[fritekst]_[Fase].[Disciplin].dxf');

    // R2 Enheder
    const u = doc.header.$INSUNITS;
    if (u === undefined) add('R2 Enheder', 'advarsel', 'Filen angiver ikke enhed ($INSUNITS). Demoen antager meter.', null, 'Gem med enhed = meter.');
    else if (String(u) !== '6') add('R2 Enheder', 'fejl', `Enheden er ikke meter ($INSUNITS = ${u}).`, null, 'Skalér tegningen til meter før screening.');

    // R3 Lagnavne
    const unknown = {};
    for (const e of doc.entities) {
      if (e.layer === '0' || /^defpoints$/i.test(e.layer)) {
        add('R3 Lag', 'fejl', `${e.type} ligger på lag "${e.layer}".`, e, 'Flyt objektet til et lag fra lagstrukturen.');
      } else if (!LAYERS[e.layer]) {
        (unknown[e.layer] = unknown[e.layer] || []).push(e);
      }
    }
    for (const name of Object.keys(unknown)) {
      const s = suggestLayer(name);
      add('R3 Lag', 'fejl', `Laget "${name}" findes ikke i lagstrukturen (${unknown[name].length} objekt${unknown[name].length > 1 ? 'er' : ''}).`, unknown[name][0], s ? `Ligner ${s}.` : 'Vælg et lag fra lagstrukturen.');
    }
    for (const name of Object.keys(doc.layers)) {
      if (name !== '0' && doc.layers[name].count === 0) add('R3 Lag', 'info', `Laget "${name}" er tomt.`, null, 'Slet tomme lag før aflevering.');
    }

    // R4 Dubletter
    const seen = new Map();
    for (const e of doc.entities) {
      const s = signature(e);
      const prev = seen.get(s);
      if (prev) {
        if (prev.layer === e.layer) add('R4 Dubletter', 'fejl', `${e.type} er identisk med objekt nr. ${prev.id} på samme lag.`, e, 'Slet den ene.');
        else add('R4 Dubletter', 'advarsel', `${e.type} har samme geometri som objekt nr. ${prev.id} på laget "${prev.layer}".`, e, 'Kontrollér, om begge skal findes.');
      } else seen.set(s, e);
    }

    // R5 Geometri: arealer skal være lukkede, ingen nul-længder
    for (const e of doc.entities) {
      const def = LAYERS[e.layer];
      if (e.type === 'LWPOLYLINE') {
        if (e.verts.length < 2) add('R5 Geometri', 'fejl', 'Polylinje med færre end to punkter.', e, 'Slet objektet.');
        else if (def && def.area && !e.closed) {
          const a = e.verts[0];
          const b = e.verts[e.verts.length - 1];
          const gap = Math.hypot(a.x - b.x, a.y - b.y);
          add('R5 Geometri', 'advarsel', `Areal på "${e.layer}" er ikke en lukket polylinje (afstand mellem ender ${gap.toFixed(3).replace(".", ",")} m).`, e, 'Luk polylinjen. Demoen lukker den selv i trin 2.');
        }
      }
      if (e.type === 'LINE' && Math.hypot(e.pts[0][0] - e.pts[1][0], e.pts[0][1] - e.pts[1][1]) < 1e-4) add('R5 Geometri', 'fejl', 'Linje uden længde.', e, 'Slet objektet.');
      if (def && def.area && e.type !== 'LWPOLYLINE') add('R5 Geometri', 'advarsel', `${e.type} på areallaget "${e.layer}" kan ikke bruges som areal.`, e, 'Tegn arealer som lukkede polylinjer.');
    }

    // R6 Attributter
    for (const e of doc.entities) {
      if (e.type !== 'INSERT') continue;
      const def = LAYERS[e.layer];
      if (def && def.attribs) {
        for (const k of def.attribs) {
          if (!e.attribs[k] || !e.attribs[k].trim()) add('R6 Attributter', 'fejl', `${def.label} (blok "${e.block}") mangler attributten ${k}.`, e, 'Udfyld attributten.');
        }
      }
    }
    // R7 Tegningshoved
    const heads = doc.entities.filter((e) => e.type === 'INSERT' && LAYERS[e.layer] && LAYERS[e.layer].role === 'title');
    if (!heads.length) add('R7 Tegningshoved', 'advarsel', 'Tegningen har intet tegningshoved.', null, 'Indsæt tegningshoved med tegningsnummer.');
    for (const h of heads) {
      const a = h.attribs;
      if (!a.TEGNINGSNR || !a.TEGNINGSNR.trim()) add('R7 Tegningshoved', 'fejl', 'Tegningsnummer mangler.', h, 'Alle tegninger skal have et tegningsnummer.');
      if (a.REVISION && a.REVISION.trim() && !/^[A-Z]$/.test(a.REVISION.trim())) add('R7 Tegningshoved', 'fejl', `Revision "${a.REVISION}" er ikke et bogstav.`, h, 'Første revision er A.');
      for (const k of ['DATO', 'MAALESTOK']) if (!a[k] || !a[k].trim()) add('R7 Tegningshoved', 'advarsel', `Feltet ${k} er tomt.`, h, 'Udfyld feltet.');
      if (!a.GODKENDT || !a.GODKENDT.trim()) add('R7 Tegningshoved', 'info', 'Feltet GODKENDT er tomt. Tegningen er et foreløbigt tryk.', h, 'Udfyldes efter egenkontrol og KS.');
    }

    // R8 Ikke understøttede objekter
    for (const t of Object.keys(doc.unsupported)) add('R8 Objekttyper', 'info', `${doc.unsupported[t]} objekt(er) af typen ${t} læses ikke af demoen.`, null, '');

    return out;
  }

  const RULES = [
    ['R1 Filnavn', 'Filnavnet følger syntaksen [Projektnr]_[Status]_[fritekst]_[Fase].[Disciplin]. Status er E, I eller P.'],
    ['R2 Enheder', 'Tegningen er i meter.'],
    ['R3 Lag', 'Alle objekter ligger på et lag fra lagstrukturen. Intet ligger på lag 0. Ingen tomme lag.'],
    ['R4 Dubletter', 'Ingen objekter med identisk geometri (tolerance 1 mm).'],
    ['R5 Geometri', 'Arealer er lukkede polylinjer. Ingen objekter uden længde.'],
    ['R6 Attributter', 'Tavler og master har TYPE-ID og ID.'],
    ['R7 Tegningshoved', 'Tegningsnummer er udfyldt. Revision er et bogstav (første revision er A). Uden godkendelse er tegningen et foreløbigt tryk.'],
    ['R8 Objekttyper', 'Objekttyper, som demoen ikke læser, bliver nævnt.'],
  ];

  VD.rules = { LAYERS, RULES, check, guessRole, checkFileName };
})(typeof window !== 'undefined' ? window : globalThis);
