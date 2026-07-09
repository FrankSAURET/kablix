// Génère externe/servo.edit.svg (retouchable par Frank).
// Structure « un seul bras » : le composant duplique/pivote ce bras pour faire
// 1 / 2 / 4 branches (single / double / cross) et tourne l'ensemble autour de l'axe.
// Groupes du fichier :
//   - body    : corps du servo (dessin d'origine, sans l'ancien long palonnier).
//   - horn-arm: UN SEUL bras, pointant vers le HAUT depuis l'axe. Frank le retouche ;
//               le code le duplique à 0/90/180/270°.
//   - axis    : marqueur (croix rouge) = centre de rotation. Frank le pose sur le
//               vrai axe du servo ; le code lit sa position.
//   - grid / pins : repères (grille + pastilles pin-*), retirés par le composant.
// Feuille agrandie (assez pour une rotation complète du bras autour de l'axe).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, 'src/webview/composants/externe');

const src = readFileSync(join(EXT, 'servo.svg'), 'utf8');

// Contenu interne du <svg> d'origine, sans l'ancien palonnier path49.
const inner = src
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace(/<path[^>]*\bid="path49"[^>]*><\/path>/, '<!-- ancien palonnier path49 retire -->');

const HUB_SRC = { x: 114.85249, y: 80.182098 }; // moyeu dans le dessin d'origine
const L = 34; // longueur d'un bras (rayon)

// Feuille : carrée autour de l'axe, avec marge > L pour la rotation complète.
const AXIS = { x: 90, y: 90 };
const W = 180, H = 180;
const SHIFT = { x: AXIS.x - HUB_SRC.x, y: AXIS.y - HUB_SRC.y }; // recentre le corps sur l'axe

// Un seul bras, vers le HAUT depuis l'axe (capsule + embout).
const armEndY = (AXIS.y - L).toFixed(2);
const hornArm =
  `  <g id="horn-arm">\n` +
  `    <line x1="${AXIS.x}" y1="${AXIS.y}" x2="${AXIS.x}" y2="${armEndY}" stroke="#cccccc" stroke-width="12" stroke-linecap="round"/>\n` +
  `    <circle cx="${AXIS.x}" cy="${armEndY}" r="5" fill="#888888"/>\n` +
  `    <circle cx="${AXIS.x}" cy="${AXIS.y}" r="9" fill="#cccccc" stroke="#999999" stroke-width="0.8"/>\n` +
  `    <circle cx="${AXIS.x}" cy="${AXIS.y}" r="2" fill="#666666"/>\n` +
  `  </g>`;

// Marqueur d'axe (croix rouge) — Frank le pose sur le vrai axe du servo.
const axisMark =
  `  <g id="axis">\n` +
  `    <circle cx="${AXIS.x}" cy="${AXIS.y}" r="2.2" fill="none" stroke="#ff00ff" stroke-width="0.6"/>\n` +
  `    <line x1="${AXIS.x - 4}" y1="${AXIS.y}" x2="${AXIS.x + 4}" y2="${AXIS.y}" stroke="#ff00ff" stroke-width="0.6"/>\n` +
  `    <line x1="${AXIS.x}" y1="${AXIS.y - 4}" x2="${AXIS.x}" y2="${AXIS.y + 4}" stroke="#ff00ff" stroke-width="0.6"/>\n` +
  `  </g>`;

function grid() {
  const lines = [];
  for (let x = 0; x <= W; x += 10) {
    const dark = x % 50 === 0;
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${dark ? '#7fb0ff' : '#dceaff'}" stroke-width="${dark ? 0.6 : 0.35}"/>`);
  }
  for (let y = 0; y <= H; y += 10) {
    const dark = y % 50 === 0;
    lines.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${dark ? '#7fb0ff' : '#dceaff'}" stroke-width="${dark ? 0.6 : 0.35}"/>`);
  }
  return lines.join('');
}

// Pastilles de positionnement des broches (repère du composant, grille 10 px).
const PINS = [
  { name: 'GND', x: 20, y: 80 },
  { name: 'V+', x: 20, y: 90 },
  { name: 'PWM', x: 20, y: 100 },
];
function pins() {
  return PINS.map((p) =>
    `<circle id="pin-${p.name}" cx="${p.x}" cy="${p.y}" r="3.2" fill="#ee0000" fill-opacity="0.85" stroke="#770000" stroke-width="0.5"/>` +
    `<text x="${p.x}" y="${(p.y - 5).toFixed(1)}" font-size="5" fill="#aa0000" text-anchor="middle" font-family="sans-serif">${p.name}</text>`
  ).join('');
}

const out = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Servo Kablix, retouchable (Frank). Feuille ${W}x${H} (marge pour rotation complete).
     Groupes : body (corps) ; horn-arm (UN SEUL bras vers le haut, duplique par le
     code en 1/2/4 branches) ; axis (croix magenta = centre de rotation, a poser sur
     le vrai axe) ; grid et pins (reperes retires par le composant).
     Ajuster la feuille (width/height/viewBox) pour permettre juste la rotation.
     Pastilles rouges pin-* : a recaler EN FACE des fils, puis reporter dans
     servo-element.mts (pinInfo). -->
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" version="1.1"
   xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <g id="grid">${grid()}</g>
  <g id="body" transform="translate(${SHIFT.x.toFixed(3)},${SHIFT.y.toFixed(3)})">${inner}</g>
${hornArm}
${axisMark}
  <g id="pins">${pins()}</g>
</svg>
`;

writeFileSync(join(EXT, 'servo.edit.svg'), out);
console.log('ecrit : externe/servo.edit.svg (feuille', W + 'x' + H + ', axe', AXIS.x, AXIS.y + ')');
