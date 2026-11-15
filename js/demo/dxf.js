/* Minimal ASCII-DXF-læser til prototypen.
   Understøtter: HEADER ($INSUNITS), LAYER-tabel, LINE, LWPOLYLINE (med bulge),
   POLYLINE/VERTEX, CIRCLE, ARC, POINT, TEXT, MTEXT, INSERT med ATTRIB.
   Alt andet tælles som "ikke understøttet" og rapporteres. */
(function (root) {
  'use strict';
  const VD = (root.VD = root.VD || {});

  function pairs(text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const code = parseInt(lines[i].trim(), 10);
      if (Number.isNaN(code)) continue;
      out.push([code, lines[i + 1].trim()]);
    }
    return out;
  }

  function parse(text) {
    const p = pairs(text);
    const doc = { header: {}, layers: {}, entities: [], unsupported: {}, blocks: [] };
    let section = null;
    let i = 0;
    const n = p.length;

    function readEntity(start) {
      // Samler alle par frem til næste kode 0.
      const type = p[start][1];
      const g = [];
      let j = start + 1;
      while (j < n && p[j][0] !== 0) {
        g.push(p[j]);
        j++;
      }
      return { type, g, next: j };
    }
    const first = (g, code, def) => {
      for (const [c, v] of g) if (c === code) return v;
      return def;
    };
    const num = (g, code, def = 0) => {
      const v = first(g, code, null);
      return v === null ? def : parseFloat(v);
    };

    while (i < n) {
      const [code, val] = p[i];
      if (code === 0 && val === 'SECTION') {
        section = p[i + 1] ? p[i + 1][1] : null;
        i += 2;
        continue;
      }
      if (code === 0 && val === 'ENDSEC') {
        section = null;
        i++;
        continue;
      }
      if (section === 'HEADER') {
        if (code === 9 && p[i + 1]) doc.header[val] = p[i + 1][1];
        i++;
        continue;
      }
      if (section === 'TABLES') {
        if (code === 0 && val === 'LAYER') {
          const e = readEntity(i);
          const name = first(e.g, 2, '');
          if (name) doc.layers[name] = { name, color: num(e.g, 62, 7), count: 0 };
          i = e.next;
          continue;
        }
        i++;
        continue;
      }
      if (section === 'BLOCKS') {
        if (code === 0 && val === 'BLOCK') {
          const e = readEntity(i);
          doc.blocks.push(first(e.g, 2, ''));
          i = e.next;
          continue;
        }
        i++;
        continue;
      }
      if (section === 'ENTITIES' && code === 0) {
        const e = readEntity(i);
        const g = e.g;
        const layer = first(g, 8, '0');
        let ent = null;
        switch (e.type) {
          case 'LINE':
            ent = { type: 'LINE', layer, pts: [[num(g, 10), num(g, 20)], [num(g, 11), num(g, 21)]] };
            break;
          case 'LWPOLYLINE': {
            const verts = [];
            let cur = null;
            for (const [c, v] of g) {
              if (c === 10) {
                cur = { x: parseFloat(v), y: 0, bulge: 0 };
                verts.push(cur);
              } else if (c === 20 && cur) cur.y = parseFloat(v);
              else if (c === 42 && cur) cur.bulge = parseFloat(v);
            }
            ent = { type: 'LWPOLYLINE', layer, closed: (num(g, 70) & 1) === 1, verts };
            break;
          }
          case 'POLYLINE': {
            const closed = (num(g, 70) & 1) === 1;
            const verts = [];
            let j = e.next;
            while (j < n && p[j][0] === 0 && p[j][1] === 'VERTEX') {
              const v = readEntity(j);
              verts.push({ x: num(v.g, 10), y: num(v.g, 20), bulge: num(v.g, 42) });
              j = v.next;
            }
            if (j < n && p[j][1] === 'SEQEND') j = readEntity(j).next;
            ent = { type: 'LWPOLYLINE', layer, closed, verts };
            e.next = j;
            break;
          }
          case 'CIRCLE':
            ent = { type: 'CIRCLE', layer, c: [num(g, 10), num(g, 20)], r: num(g, 40) };
            break;
          case 'ARC':
            ent = { type: 'ARC', layer, c: [num(g, 10), num(g, 20)], r: num(g, 40), a0: num(g, 50), a1: num(g, 51) };
            break;
          case 'POINT':
            ent = { type: 'POINT', layer, c: [num(g, 10), num(g, 20)] };
            break;
          case 'TEXT':
          case 'MTEXT':
            ent = { type: 'TEXT', layer, c: [num(g, 10), num(g, 20)], h: num(g, 40, 1), text: first(g, 1, '') };
            break;
          case 'INSERT': {
            const attribs = {};
            let j = e.next;
            if (num(g, 66) === 1) {
              while (j < n && p[j][0] === 0 && p[j][1] === 'ATTRIB') {
                const a = readEntity(j);
                attribs[first(a.g, 2, '')] = first(a.g, 1, '');
                j = a.next;
              }
              if (j < n && p[j][1] === 'SEQEND') j = readEntity(j).next;
            }
            ent = { type: 'INSERT', layer, block: first(g, 2, ''), c: [num(g, 10), num(g, 20)], attribs };
            e.next = j;
            break;
          }
          case 'ENDSEC':
          case 'EOF':
            break;
          default:
            doc.unsupported[e.type] = (doc.unsupported[e.type] || 0) + 1;
        }
        if (ent) {
          ent.id = doc.entities.length + 1;
          doc.entities.push(ent);
          if (!doc.layers[layer]) doc.layers[layer] = { name: layer, color: 7, count: 0, implicit: true };
          doc.layers[layer].count++;
        }
        i = e.next;
        continue;
      }
      i++;
    }
    return doc;
  }

  /* Polylinje med bulge -> punktliste. Buer opdeles i korte stykker. */
  function polyPoints(verts, closed, maxSeg) {
    const seg = maxSeg || 0.25;
    const pts = [];
    const m = verts.length;
    const last = closed ? m : m - 1;
    for (let k = 0; k < last; k++) {
      const a = verts[k];
      const b = verts[(k + 1) % m];
      pts.push([a.x, a.y]);
      if (a.bulge) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const chord = Math.hypot(dx, dy);
        if (chord < 1e-9) continue;
        const theta = 4 * Math.atan(a.bulge);
        const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
        const h = r * Math.cos(Math.abs(theta) / 2) * (a.bulge > 0 ? 1 : -1);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const cx = mx - (dy / chord) * h;
        const cy = my + (dx / chord) * h;
        const a0 = Math.atan2(a.y - cy, a.x - cx);
        const steps = Math.max(2, Math.ceil((Math.abs(theta) * r) / seg));
        for (let s = 1; s < steps; s++) {
          const t = a0 + (theta * s) / steps;
          pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
        }
      }
    }
    if (!closed && m) pts.push([verts[m - 1].x, verts[m - 1].y]);
    return pts;
  }

  /* ---------- DXF-skriver (bruges til det indbyggede eksempel) ---------- */
  function writer() {
    const L = [];
    const w = (c, v) => L.push(String(c), String(v));
    const f = (v) => (Math.round(v * 1000) / 1000).toString();
    return {
      w,
      header(units) {
        w(0, 'SECTION'); w(2, 'HEADER');
        w(9, '$ACADVER'); w(1, 'AC1015');
        w(9, '$INSUNITS'); w(70, units);
        w(0, 'ENDSEC');
      },
      layers(list) {
        w(0, 'SECTION'); w(2, 'TABLES');
        w(0, 'TABLE'); w(2, 'LAYER'); w(70, list.length);
        for (const [name, color] of list) {
          w(0, 'LAYER'); w(2, name); w(70, 0); w(62, color); w(6, 'CONTINUOUS');
        }
        w(0, 'ENDTAB'); w(0, 'ENDSEC');
      },
      beginEntities() { w(0, 'SECTION'); w(2, 'ENTITIES'); },
      poly(layer, pts, closed) {
        w(0, 'LWPOLYLINE'); w(8, layer); w(90, pts.length); w(70, closed ? 1 : 0);
        for (const q of pts) { w(10, f(q[0])); w(20, f(q[1])); if (q[2]) w(42, q[2]); }
      },
      line(layer, a, b) {
        w(0, 'LINE'); w(8, layer); w(10, f(a[0])); w(20, f(a[1])); w(11, f(b[0])); w(21, f(b[1]));
      },
      circle(layer, c, r) { w(0, 'CIRCLE'); w(8, layer); w(10, f(c[0])); w(20, f(c[1])); w(40, f(r)); },
      text(layer, c, h, s) { w(0, 'TEXT'); w(8, layer); w(10, f(c[0])); w(20, f(c[1])); w(40, f(h)); w(1, s); },
      insert(layer, block, c, attribs) {
        const keys = Object.keys(attribs || {});
        w(0, 'INSERT'); w(8, layer); w(2, block); w(10, f(c[0])); w(20, f(c[1]));
        if (keys.length) {
          w(66, 1);
          for (const k of keys) { w(0, 'ATTRIB'); w(8, layer); w(10, f(c[0])); w(20, f(c[1])); w(40, 0.5); w(1, attribs[k]); w(2, k); }
          w(0, 'SEQEND');
        }
      },
      end() { w(0, 'ENDSEC'); w(0, 'EOF'); return L.join('\n') + '\n'; },
    };
  }

  VD.dxf = { parse, polyPoints, writer };
  if (typeof module !== 'undefined') module.exports = VD;
})(typeof window !== 'undefined' ? window : globalThis);
