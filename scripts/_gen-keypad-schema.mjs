// TEMP — génère les bases de retouche du SCHÉMA INTERNE du clavier (3 et 4 col).
// Repère = celui de l'overlay interne (mm × 96/25.4 px). Corps + guides de touches
// (gris clair) + pastilles rouges des broches R/C du connecteur (à router).
// À supprimer après usage.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'svg');
const S = 96 / 25.4;
const r2 = (n) => Math.round(n * 100) / 100;

// Touches (mm) : cellule 11.2 × 11, pas 15 (x) / 14.3 (y).
const KEY_W = 11.2, KEY_H = 11;
const TX4 = [7, 22, 37, 52], TX3 = [7, 22, 37];
const TY = [10.7, 25, 39.3, 53.6];

const VARIANTS = [
  {
    file: 'keypad-schema.edit.svg', label: '4 colonnes (4×4)',
    wmm: 70.336, tx: TX4,
    pins: { R1: 100, R2: 110, R3: 119.5, R4: 129, C1: 138.5, C2: 148, C3: 157.75, C4: 167.5 },
  },
  {
    file: 'keypad-3col-schema.edit.svg', label: '3 colonnes (3×4)',
    wmm: 55.336, tx: TX3,
    pins: { R1: 76.5, R2: 86, R3: 95.75, R4: 105.25, C1: 115, C2: 124.5, C3: 134 },
  },
];

for (const v of VARIANTS) {
  const W = r2(v.wmm * S), H = r2(91 * S);
  const kw = r2(KEY_W * S), kh = r2(KEY_H * S);

  const keys = [];
  TY.forEach((ty) =>
    v.tx.forEach((tx) =>
      keys.push(`    <rect x="${r2(tx * S)}" y="${r2(ty * S)}" width="${kw}" height="${kh}" rx="3" ry="3"/>`)
    )
  );

  const pins = Object.entries(v.pins).map(([name, x], i) => {
    const cx = r2(x), cy = 338, ty = cy - (i % 2 ? 12 : 5); // étage les libellés (broches serrées)
    const isRow = name[0] === 'R';
    return (
      `    <g>\n` +
      `      <circle cx="${cx}" cy="${cy}" r="2.5" fill="${isRow ? '#c00' : '#06c'}" stroke="none"/>\n` +
      `      <text x="${cx}" y="${ty}" font-size="6" fill="${isRow ? '#c00' : '#06c'}" text-anchor="middle" font-family="sans-serif">${name}</text>\n` +
      `    </g>`
    );
  });

  const svg =
`<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" version="1.1">
  <!-- ====================================================================
       BASE DE RETOUCHE — schéma interne du clavier ${v.label}
       Repère interne (px) = mm de l'élément × 96/25,4. Broches = pinInfo Wokwi.
       À DESSINER : matrice 4 lignes (R) × ${v.tx.length} colonnes (C).
         - 1 poussoir (interrupteur) par croisement, posé sur un guide de touche.
         - bus de ligne horizontal -> pastille Ri ; bus de colonne vertical -> Cj.
       Le corps (#body) et les guides (#key-guides) et les repères (#pins-reference)
       NE SONT PAS exportés : ils servent juste au calage. Garder un groupe #schema
       (trait noir) qui sera repris dans internal-wiring.mts (keypad).
       ==================================================================== -->
  <rect id="body" x="0" y="0" width="${W}" height="${H}" rx="6" ry="6" fill="rgba(255,255,255,0.8)" stroke="#bbb" stroke-width="0.5"/>
  <g id="key-guides" fill="none" stroke="#ccc" stroke-width="0.6">
${keys.join('\n')}
  </g>
  <!-- ===== À ÉDITER : tracés noirs (matrice + bus) ===== -->
  <g id="schema" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- dessiner ici -->
  </g>
  <!-- ===== Repères de broches (R rouge, C bleu) : NE PAS exporter ===== -->
  <g id="pins-reference">
${pins.join('\n')}
  </g>
</svg>
`;
  writeFileSync(join(OUT, v.file), svg);
  console.log(`  ✓ svg/${v.file}  (${W}×${H})`);
}
console.log('Terminé.');
