/* Indbygget eksempel: et firbenet kryds, 8 m kørebaner, hjørneradius 12 m.
   Geometrien er opdigtet til demoen og viser ikke et virkeligt kryds.
   Filen indeholder med vilje nogle fejl, som tegningskontrollen skal finde. */
(function (root) {
  'use strict';
  const VD = (root.VD = root.VD || {});

  const HW = 4; // halv kørebanebredde
  const RC = 12; // hjørneradius, kantsten
  const E = 45; // tegningens udstrækning fra krydsets midte
  const WO = 1.5; // bredde af overkørselsareal i sydøstligt hjørne
  const WO_NE = 0.6; // overkørselsareal i nordøst, bevidst under 1,0 m
  const FW = 2.5; // fortovsbredde

  function arc(cx, cy, r, a0, a1, step) {
    const pts = [];
    const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / (step || 0.4)));
    for (let i = 0; i <= n; i++) {
      const t = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
      pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
    return pts;
  }

  // Kantstenslinje og fortov i én kvadrant. sx, sy = fortegn. wo = bredde af overkørselsareal
  // foran kantstenen. ext = hvor langt overkørselsarealet fortsætter ad de lige stræk.
  function quadrant(sx, sy, wo, ext) {
    ext = ext || 0;
    const cx = sx * (HW + RC);
    const cy = sy * (HW + RC);
    const r1 = RC - wo;
    const r2 = r1 - FW;
    // vinkel fra centrum mod den nord-syd-gående vej og mod den øst-vest-gående vej
    const aNS = sx > 0 ? 180 : 0;
    const aEW = sy > 0 ? 270 : 90;
    const a0 = aNS;
    let a1 = aEW;
    if (Math.abs(a1 - a0) > 180) a1 += a1 < a0 ? 360 : -360;
    const T = HW + RC; // tangentpunkt
    const curb = [[sx * HW, sy * E], [sx * HW, sy * (T + ext)]];
    if (wo > 0) curb.push([sx * (HW + wo), sy * (T + ext)], [sx * (HW + wo), sy * T]);
    curb.push(...arc(cx, cy, r1, a0, a1));
    if (wo > 0) curb.push([sx * T, sy * (HW + wo)], [sx * (T + ext), sy * (HW + wo)], [sx * (T + ext), sy * HW]);
    curb.push([sx * E, sy * HW]);
    const back = [[sx * E, sy * (HW + FW)], [sx * T, sy * (HW + FW)]];
    back.push(...arc(cx, cy, r2, a1, a0));
    back.push([sx * (HW + FW), sy * T], [sx * (HW + FW), sy * E]);
    let overrun = null;
    if (wo > 0) {
      overrun = [[sx * HW, sy * (T + ext)], ...arc(cx, cy, RC, a0, a1), [sx * (T + ext), sy * HW],
        [sx * (T + ext), sy * (HW + wo)], ...arc(cx, cy, r1, a1, a0), [sx * (HW + wo), sy * (T + ext)]];
    }
    return { curb, fortov: [...curb, ...back], overrun, c: [cx, cy], r1 };
  }

  function build() {
    const W = VD.dxf.writer();
    W.header(6); // 6 = meter
    W.layers([
      ['0', 7], ['V-KOEREBANE', 8], ['V-MODKOERENDE', 9], ['V-OVERKOERSEL', 30], ['V-FORTOV', 3],
      ['V-CYKELSTI', 5], ['V-HELLE', 2], ['V-KANTSTEN', 7], ['V-AFMAERKNING', 7], ['U-TAVLE', 1],
      ['U-MAST', 1], ['A-KOERESPOR', 6], ['T-TEGNINGSHOVED', 7], ['T-TEKST', 7], ['Fortov_ny', 3],
    ]);
    W.beginEntities();

    // Kørebane: kryds med fire afrundede hjørner (bulge = tan(-90°/4))
    const b = -Math.tan(Math.PI / 8);
    W.poly('V-KOEREBANE', [
      [HW, -E], [HW, -(HW + RC), b], [HW + RC, -HW], [E, -HW], [E, HW], [HW + RC, HW, b], [HW, HW + RC],
      [HW, E], [-HW, E], [-HW, HW + RC, b], [-(HW + RC), HW], [-E, HW], [-E, -HW], [-(HW + RC), -HW, b],
      [-HW, -(HW + RC)], [-HW, -E],
    ], true);

    // Kørebaneareal for modkørende på de to ben, som svinget berører
    W.poly('V-MODKOERENDE', [[HW + RC, 0], [E, 0], [E, HW], [HW + RC, HW]], true);
    W.poly('V-MODKOERENDE', [[-HW, -E], [0, -E], [0, -(HW + RC)], [-HW, -(HW + RC)]], true);

    const q = {
      se: quadrant(1, -1, WO, 14),
      ne: quadrant(1, 1, WO_NE),
      nw: quadrant(-1, 1, 0),
      sw: quadrant(-1, -1, 0),
    };
    W.poly('V-OVERKOERSEL', q.se.overrun, true);
    W.poly('V-OVERKOERSEL', q.ne.overrun, true);
    W.poly('V-FORTOV', q.se.fortov, true);
    W.poly('V-FORTOV', q.sw.fortov, true);
    // FEJL (bevidst): fortov i nordøst er ikke lukket
    W.poly('V-FORTOV', [...q.ne.fortov, q.ne.fortov[0]], false);
    // FEJL (bevidst): fortov i nordvest ligger på et lag, der ikke findes i lagstrukturen
    W.poly('Fortov_ny', q.nw.fortov, true);

    for (const k of ['se', 'ne', 'nw', 'sw']) W.poly('V-KANTSTEN', q[k].curb, false);
    // FEJL (bevidst): samme kantsten tegnet to gange
    W.poly('V-KANTSTEN', q.sw.curb, false);

    // Helle på østbenet med tavle
    const hx0 = 20, hx1 = 30, hh = 0.5;
    W.poly('V-HELLE', [[hx0, -hh], [hx1, -hh, 1], [hx1, hh], [hx0, hh, 1]], true);
    W.poly('V-KANTSTEN', [[hx0, -hh], [hx1, -hh, 1], [hx1, hh], [hx0, hh, 1], [hx0, -hh]], false);

    // Midterlinjer
    W.line('V-AFMAERKNING', [0, -E], [0, -(HW + RC)]);
    W.line('V-AFMAERKNING', [0, E], [0, HW + RC]);
    W.line('V-AFMAERKNING', [-E, 0], [-(HW + RC), 0]);
    W.line('V-AFMAERKNING', [HW + RC, 0], [hx0 - hh, 0]);
    W.line('V-AFMAERKNING', [hx1 + hh, 0], [E, 0]);
    // FEJL (bevidst): løs streg på lag 0
    W.line('0', [-30, -20], [-24, -20]);

    // Faste genstande
    const d = (q.se.r1 - 0.5) * Math.SQRT1_2;
    W.insert('U-MAST', 'MAST', [q.se.c[0] - d, q.se.c[1] + d], { 'TYPE-ID': 'SIG-M1', ID: 'M-001' });
    W.insert('U-TAVLE', 'TAVLE', [HW + 0.8, -24], { 'TYPE-ID': 'B11', ID: 'T-001' });
    // FEJL (bevidst): tavle på hellen mangler TYPE-ID
    W.insert('U-TAVLE', 'TAVLE', [(hx0 + hx1) / 2, 0], { 'TYPE-ID': '', ID: 'T-002' });

    // Kørespor for forakslens midtpunkt: højresving fra syd mod øst
    W.poly('A-KOERESPOR', [[2, -44], [2, -2.25], [44, -2.25]], false);

    // Tegningshoved. FEJL (bevidst): revision er et tal, ikke et bogstav. GODKENDT er tom.
    W.insert('T-TEGNINGSHOVED', 'TEGNINGSHOVED', [E - 22, -E + 2], {
      TEGNINGSNR: '12345-1001', REVISION: '1', DATO: '11.11.2026', MAALESTOK: '1:250',
      EMNE: 'Kryds, eksempel til prototype', GODKENDT: '',
    });
    W.text('T-TEKST', [-E + 2, E - 4], 1.2, 'EKSEMPEL - OPDIGTET KRYDS');
    return W.end();
  }

  VD.example = {
    fileName: '12345_P_kryds-eksempel_f3.fv.dxf',
    build,
    // skydere i demoen: kørespor som tre punkter med variabel ind- og udkørsel
    path(entryX, exitY) {
      return [[entryX, -44], [entryX, exitY], [44, exitY]];
    },
    defaults: { entryX: 2, exitY: -2.25, radius: 14 },
  };
})(typeof window !== 'undefined' ? window : globalThis);
