// Génère la variante ANODE COMMUNE des schémas 7 segments à partir des fichiers
// cathode (*.clean.svg) : retourne CHAQUE diode (échange anode/cathode) sans
// toucher au câblage. Une diode = un triangle (path fill blanc, 3 sommets) + sa
// barre de cathode (line/segment perpendiculaire, proche de l'apex). Le
// retournement = rotation 180° du triangle ET de la barre autour du milieu entre
// le centre de la base et la barre (≈ l'apex). Le conducteur patte-à-patte n'est
// pas touché. Sortie : *.anode.svg. À relancer si Frank retouche les cathodes.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INT = 'src/webview/composants/interne';
const JOBS = [
  { src: '7seg-schema.clean.svg', out: '7seg-schema.anode.svg' },
  { src: '7seg-2dig.schema.clean.svg', out: '7seg-2dig.schema.anode.svg' },
  { src: '7seg-4dig-schema.clean.svg', out: '7seg-4dig-schema.anode.svg' },
];

// --- Parsing minimal de path/line ---
const num = (s) => parseFloat(s);

/** Extrait les points d'un `d` de triangle (M x y ... L/V/H ... Z), en absolu. */
function triPoints(d) {
  const pts = [];
  const toks = d.replace(/,/g, ' ').match(/[MLHVZmlhvz]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  let i = 0, cx = 0, cy = 0, cmd = '';
  while (i < toks.length) {
    const t = toks[i];
    if (/[MLHVZmlhvz]/.test(t)) { cmd = t; i++; continue; }
    if (cmd === 'M' || cmd === 'L') { cx = num(toks[i]); cy = num(toks[i + 1]); pts.push([cx, cy]); i += 2; }
    else if (cmd === 'm' || cmd === 'l') { cx += num(toks[i]); cy += num(toks[i + 1]); pts.push([cx, cy]); i += 2; }
    else if (cmd === 'V') { cy = num(toks[i]); pts.push([cx, cy]); i += 1; }
    else if (cmd === 'v') { cy += num(toks[i]); pts.push([cx, cy]); i += 1; }
    else if (cmd === 'H') { cx = num(toks[i]); pts.push([cx, cy]); i += 1; }
    else if (cmd === 'h') { cx += num(toks[i]); pts.push([cx, cy]); i += 1; }
    else i++;
  }
  // dédoublonne les points quasi identiques
  const uniq = [];
  for (const p of pts) if (!uniq.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.01)) uniq.push(p);
  return uniq;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Apex d'un triangle = sommet le plus éloigné du milieu des 2 autres. */
function apexOf(pts) {
  let best = 0, bestD = -1;
  for (let i = 0; i < 3; i++) {
    const [a, b] = [pts[(i + 1) % 3], pts[(i + 2) % 3]];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const dd = dist(pts[i], mid);
    if (dd > bestD) { bestD = dd; best = i; }
  }
  const apex = pts[best];
  const base = [pts[(best + 1) % 3], pts[(best + 2) % 3]];
  const baseMid = [(base[0][0] + base[1][0]) / 2, (base[0][1] + base[1][1]) / 2];
  return { apex, baseMid };
}

/** Applique rotation 180° autour de (cx,cy) : p' = 2c - p. */
const rot180 = (p, c) => [2 * c[0] - p[0], 2 * c[1] - p[1]];

/** Réécrit un `d` de triangle en retournant ses points autour de center. */
function flipTri(d, center) {
  const pts = triPoints(d).map((p) => rot180(p, center));
  return `M ${pts[0][0].toFixed(3)} ${pts[0][1].toFixed(3)} L ${pts[1][0].toFixed(3)} ${pts[1][1].toFixed(3)} L ${pts[2][0].toFixed(3)} ${pts[2][1].toFixed(3)} Z`;
}

for (const job of JOBS) {
  let svg = readFileSync(join(ROOT, INT, job.src), 'utf8');

  // 1) Repère les triangles (path fill blanc, 3 points) → apex + baseMid.
  const triRe = /<path\b[^>]*\bd="([^"]+)"[^>]*>/g;
  const triangles = [];
  let m;
  while ((m = triRe.exec(svg))) {
    const tag = m[0];
    if (!/fill="#f{3,6}"|fill:#f{3,6}/i.test(tag) && !/fill="#ffffff"/i.test(tag)) continue;
    const pts = triPoints(m[1]);
    if (pts.length !== 3) continue;
    const { apex, baseMid } = apexOf(pts);
    triangles.push({ full: tag, d: m[1], apex, baseMid, start: m.index });
  }

  // 2) Repère les segments (line ou path à 2 points) — candidats barres/conducteurs.
  const segs = [];
  const lineRe = /<line\b[^>]*\bx1="([-\d.]+)"[^>]*\by1="([-\d.]+)"[^>]*\bx2="([-\d.]+)"[^>]*\by2="([-\d.]+)"[^>]*>/g;
  while ((m = lineRe.exec(svg))) segs.push({ full: m[0], a: [num(m[1]), num(m[2])], b: [num(m[3]), num(m[4])] });

  // 3) Pour chaque triangle : barre = segment le plus proche de l'apex ET
  //    à peu près perpendiculaire à l'axe (apex - baseMid). Centre de rotation =
  //    milieu entre baseMid et le centre de la barre.
  const replacements = new Map(); // full-tag original → nouveau tag
  for (const tri of triangles) {
    const axis = [tri.apex[0] - tri.baseMid[0], tri.apex[1] - tri.baseMid[1]];
    const axLen = Math.hypot(axis[0], axis[1]) || 1;
    const ax = [axis[0] / axLen, axis[1] / axLen];
    let bestSeg = null, bestScore = 1e9;
    for (const s of segs) {
      const c = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
      const dApex = dist(c, tri.apex);
      const dir = [s.b[0] - s.a[0], s.b[1] - s.a[1]];
      const dl = Math.hypot(dir[0], dir[1]) || 1;
      const dot = Math.abs((dir[0] / dl) * ax[0] + (dir[1] / dl) * ax[1]); // 0 = perpendiculaire
      const score = dApex + dot * 10; // proche de l'apex + perpendiculaire
      if (dApex < 6 && score < bestScore) { bestScore = score; bestSeg = s; }
    }
    if (!bestSeg) continue;
    const barCenter = [(bestSeg.a[0] + bestSeg.b[0]) / 2, (bestSeg.a[1] + bestSeg.b[1]) / 2];
    const center = [(tri.baseMid[0] + barCenter[0]) / 2, (tri.baseMid[1] + barCenter[1]) / 2];
    // Retourne le triangle
    replacements.set(tri.full, tri.full.replace(/\bd="[^"]+"/, `d="${flipTri(tri.d, center)}"`));
    // Retourne la barre
    const na = rot180(bestSeg.a, center), nb = rot180(bestSeg.b, center);
    const newLine = bestSeg.full
      .replace(/\bx1="[-\d.]+"/, `x1="${na[0].toFixed(3)}"`).replace(/\by1="[-\d.]+"/, `y1="${na[1].toFixed(3)}"`)
      .replace(/\bx2="[-\d.]+"/, `x2="${nb[0].toFixed(3)}"`).replace(/\by2="[-\d.]+"/, `y2="${nb[1].toFixed(3)}"`);
    replacements.set(bestSeg.full, newLine);
  }

  // 4) Applique les remplacements (uniques).
  for (const [oldT, newT] of replacements) svg = svg.replace(oldT, newT);
  writeFileSync(join(ROOT, INT, job.out), svg);
  console.log(`  ✓ ${job.out}  (${replacements.size / 2 | 0} diodes retournées)`);
}
