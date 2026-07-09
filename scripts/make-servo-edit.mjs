// Génère externe/servo.edit.svg (retouchable par Frank) : corps du servo (sans
// l'ancien long palonnier path49) + 3 palonniers dessinés (groupes horn-single/
// double/cross, centrés sur le moyeu) + grille 10 px + pastilles de positionnement
// des broches (ronds rouges pin-GND/pin-V+/pin-PWM, à recaler sur les croisements).
// Boîte agrandie 170×125 (comme le composant actuel).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, 'src/webview/composants/externe');

const src = readFileSync(join(EXT, 'servo.svg'), 'utf8');

// Extrait le contenu interne du <svg> d'origine, retire l'ancien palonnier path49.
const inner = src
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace(/<path[^>]*\bid="path49"[^>]*><\/path>/, '<!-- ancien palonnier path49 retiré -->');

// Moyeu d'origine dans le dessin.
const HUB_SRC = { x: 114.85249, y: 80.182098 };
// Boîte 170×125 : on RECENTRE le servo (corps + palonniers) pour que l'axe (moyeu)
// tombe au centre de la boîte. Décalage appliqué à tout le dessin.
const W = 170, H = 125;
const HUB = { x: W / 2, y: H / 2 }; // axe recentré (85 ; 62.5)
const SHIFT = { x: HUB.x - HUB_SRC.x, y: HUB.y - HUB_SRC.y };
const L = 34; // longueur de bras (rayon)
const W2 = 6; // demi-largeur
const REND = 5; // embout

// Un bras (capsule + embout), angle a en degrés (0 = vers le haut).
function arm(a) {
  const rad = ((a - 90) * Math.PI) / 180;
  const ex = (HUB.x + L * Math.cos(rad)).toFixed(2);
  const ey = (HUB.y + L * Math.sin(rad)).toFixed(2);
  return (
    `<line x1="${HUB.x}" y1="${HUB.y}" x2="${ex}" y2="${ey}" stroke="#cccccc" stroke-width="${W2 * 2}" stroke-linecap="round"/>` +
    `<circle cx="${ex}" cy="${ey}" r="${REND}" fill="#888888"/>`
  );
}
function hornGroup(id, angles) {
  return (
    `  <g id="${id}">\n` +
    `    ${angles.map(arm).join('\n    ')}\n` +
    `    <circle cx="${HUB.x}" cy="${HUB.y}" r="9" fill="#cccccc" stroke="#999999" stroke-width="0.8"/>\n` +
    `    <circle cx="${HUB.x}" cy="${HUB.y}" r="2" fill="#666666"/>\n` +
    `  </g>`
  );
}

// Grille 10 px (croisements foncés tous les 50 px), boîte 170×125.
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
  { name: 'GND', x: 10, y: 60 },
  { name: 'V+', x: 10, y: 70 },
  { name: 'PWM', x: 10, y: 80 },
];
function pins() {
  return PINS.map((p) =>
    `<circle id="pin-${p.name}" cx="${p.x}" cy="${p.y}" r="3.2" fill="#ee0000" fill-opacity="0.85" stroke="#770000" stroke-width="0.5"/>` +
    `<text x="${p.x}" y="${(p.y - 5).toFixed(1)}" font-size="5" fill="#aa0000" text-anchor="middle" font-family="sans-serif">${p.name}</text>`
  ).join('');
}

const out = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Servo Kablix, retouchable (Frank). Boite 170x125.
     Groupes : body (corps du servo, sans l'ancien palonnier) ; horn-single /
     horn-double / horn-cross (palonniers, centres sur le moyeu ${HUB.x} ; ${HUB.y}) ;
     grid et pins (REPERES retires par le composant).
     Le code affiche body + le bon horn-* et le fait tourner autour du moyeu.
     Pastilles rouges pin-GND / pin-V+ / pin-PWM : a recaler sur les croisements,
     EN FACE des fils, puis reporter x/y dans servo-element.mts (pinInfo). -->
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" version="1.1"
   xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <g id="grid">${grid()}</g>
  <g id="body" transform="translate(${SHIFT.x.toFixed(3)},${SHIFT.y.toFixed(3)})">${inner}</g>
${hornGroup('horn-single', [0])}
${hornGroup('horn-double', [0, 180])}
${hornGroup('horn-cross', [0, 90, 180, 270])}
  <g id="pins">${pins()}</g>
</svg>
`;

writeFileSync(join(EXT, 'servo.edit.svg'), out);
console.log('écrit : externe/servo.edit.svg (boîte', W + '×' + H + ', moyeu', HUB.x, HUB.y + ')');
