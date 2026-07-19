// Génère des composants Kablix partageables (.kablix-part.json) à partir des
// dessins SVG déposés dans media/parts/. Pour chaque composant :
//   - le dessin de l'utilisateur sert de corps (nettoyé des métadonnées Inkscape
//     et normalisé en coordonnées px = taille de rendu, pour que x/y des broches
//     coïncident avec le SVG) ;
//   - une rangée de pastilles de broche ÉTIQUETÉES est dessinée par-dessus, sur
//     la grille de 10 px (pas réel 0,1") ; les broches logiques pointent
//     exactement sur ces pastilles → elles tombent toujours pile sur la grille.
// Les fichiers produits dans parts/ s'importent via « ⇪ Importer (.json) ».
//
// Usage : node scripts/build-parts.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'media', 'parts');
const OUT = join(ROOT, 'parts');
mkdirSync(OUT, { recursive: true });

const GRID = 10; // pas de la grille Kablix (= 0,1" entre pattes)
const PAD_R = 3; // rayon visuel d'une pastille de broche

// Spécifications par composant. `pinRoles` mappe le rôle du modèle de simulation
// au nom de broche ; `pins` liste les broches dans l'ordre, regroupées par bord.
// Brochages issus des fiches techniques (PCA9685, HC-SR04, LCD I2C PCF8574,
// Grove Shield for Pi Pico, Raspberry Pi Pico W).
const SPECS = [
  // NOTE : le « 16-Channel PWM Driver(PCA9685).svg » n'est PLUS généré ici —
  // c'est un composant NATIF depuis v2026.7.116 (<kablix-pca9685>, catégorie
  // Divers : src/webview/composants/pca9685-element.mts, pastilles
  // connectorNNterminal de Frank).
  {
    file: 'HC-SR04.svg',
    type: 'hc-sr04',
    label: 'HC-SR04 (ultrason)',
    kind: 'ultrasonic', // simulé : impulsion TRIG → ECHO (largeur = distance × 58 µs)
    pinRoles: { TRIG: 'Trig', ECHO: 'Echo' },
    attrs: { distance: '20' }, // distance simulée en cm (modifiable dans le .json)
    padLabels: false, // les noms VCC/Trig/Echo/GND sont déjà sérigraphiés sur le dessin
    edges: { bottom: ['VCC', 'Trig', 'Echo', 'GND'] },
  },
  {
    file: 'LCD_16x2_I2C.svg',
    type: 'lcd1602-i2c',
    label: 'LCD 16×2 I2C',
    kind: 'i2c-lcd', // simulé : I²C (PCF8574 + HD44780) → texte affiché
    attrs: { address: '0x27', cols: '16', rows: '2' },
    // Zone écran (fraction du corps) où le texte est superposé ; ajustable ensuite.
    screenFrac: { x: 0.16, y: 0.12, w: 0.68, h: 0.5 },
    edges: { left: ['GND', 'VCC', 'SDA', 'SCL'] },
  },
  // NOTE : le « Grove pour Pico Pi.svg » n'est PLUS généré ici — c'est un
  // composant NATIF depuis v2026.7.114 (<kablix-grove-pico>, enfichage de la
  // Pico + switch 3V3/5V : src/webview/composants/grove-shield-element.mts).
  {
    file: 'Raspberry Pi Pico W h.svg',
    type: 'picow-module',
    label: 'Pico W (dessin, non simulé)',
    kind: 'passive',
    // Brochage physique Pico W (colonnes gauche/droite, de haut en bas).
    edges: {
      left: ['GP0', 'GP1', 'GND', 'GP2', 'GP3', 'GP4', 'GP5', 'GND', 'GP6', 'GP7',
        'GP8', 'GP9', 'GND', 'GP10', 'GP11', 'GP12', 'GP13', 'GND', 'GP14', 'GP15'],
      right: ['VBUS', 'VSYS', 'GND', '3V3_EN', '3V3', 'ADC_VREF', 'GP28', 'GND', 'GP27', 'GP26',
        'RUN', 'GP22', 'GND', 'GP21', 'GP20', 'GP19', 'GP18', 'GND', 'GP17', 'GP16'],
    },
  },
];

/** Dimension px d'une longueur SVG (mm/in/px) au rendu navigateur (96 dpi). */
function toPx(value) {
  const m = /^([0-9.]+)\s*(mm|in|px|cm)?$/.exec(value.trim());
  if (!m) return 0;
  const n = parseFloat(m[1]);
  switch (m[2]) {
    case 'mm': return (n * 96) / 25.4;
    case 'cm': return (n * 96) / 2.54;
    case 'in': return n * 96;
    default: return n; // px (ou sans unité)
  }
}

/** Allège un SVG Inkscape : métadonnées, commentaires, namedview, espaces. */
function stripSvg(svg) {
  return svg
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/g, '')
    .replace(/<sodipodi:namedview[\s\S]*?(?:\/>|<\/sodipodi:namedview>)/g, '')
    .replace(/\s+(inkscape|sodipodi):[\w-]+="[^"]*"/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}

/** Extrait le contenu interne du <svg> racine et son viewBox / dimensions. */
function parseSvg(svg) {
  const open = svg.match(/<svg[\s\S]*?>/i)[0];
  const inner = svg.slice(svg.indexOf(open) + open.length, svg.lastIndexOf('</svg>'));
  const vb = /viewBox="([^"]*)"/i.exec(open);
  const w = /\swidth="([^"]*)"/i.exec(open);
  const h = /\sheight="([^"]*)"/i.exec(open);
  const viewBox = vb ? vb[1].trim().split(/[\s,]+/).map(Number) : null;
  let pw = w ? toPx(w[1]) : viewBox ? viewBox[2] : 100;
  let ph = h ? toPx(h[1]) : viewBox ? viewBox[3] : 100;
  // width="0" (Inkscape capricieux) : on retombe sur le viewBox.
  if (!pw && viewBox) pw = viewBox[2];
  if (!ph && viewBox) ph = viewBox[3];
  return { inner, viewBox: viewBox ?? [0, 0, pw, ph], pw, ph };
}

/** Positions des broches d'un bord, centrées et alignées sur la grille de 10 px. */
function layout(names, axisLen, fixed, axis) {
  const span = (names.length - 1) * GRID;
  let start = Math.round((axisLen - span) / 2 / GRID) * GRID;
  if (start < GRID) start = GRID;
  return names.map((name, i) => {
    const along = start + i * GRID;
    return axis === 'x' ? { name, x: along, y: fixed } : { name, x: fixed, y: along };
  });
}

const MARGIN = 20; // bande autour du dessin pour loger les pastilles + étiquettes

for (const spec of SPECS) {
  const raw = stripSvg(readFileSync(join(SRC, spec.file), 'utf8'));
  const { inner, viewBox, pw, ph } = parseSvg(raw);
  // Corps dessiné dans une boîte px nette, décalé de MARGIN pour la zone broches.
  const bodyW = Math.max(40, Math.round(pw));
  const bodyH = Math.max(40, Math.round(ph));
  const W = bodyW + 2 * MARGIN;
  const H = bodyH + 2 * MARGIN;

  const pins = [];
  for (const [edge, names] of Object.entries(spec.edges ?? {})) {
    if (!names || names.length === 0) continue;
    if (edge === 'left') pins.push(...layout(names, H, MARGIN - PAD_R, 'y'));
    else if (edge === 'right') pins.push(...layout(names, H, W - (MARGIN - PAD_R), 'y'));
    else if (edge === 'top') pins.push(...layout(names, W, MARGIN - PAD_R, 'x'));
    else pins.push(...layout(names, W, H - (MARGIN - PAD_R), 'x')); // bottom
  }
  // Alignement final strict sur la grille (sécurité).
  for (const p of pins) {
    p.x = Math.round(p.x / GRID) * GRID;
    p.y = Math.round(p.y / GRID) * GRID;
  }

  // Pastilles + étiquettes superposées. `padLabels: false` n'affiche que la
  // pastille (sans nom) quand le dessin sérigraphie déjà les broches (HC-SR04).
  const showLabels = spec.padLabels !== false;
  const pads = pins
    .map((p) => {
      const onLeft = p.x <= MARGIN;
      const onRight = p.x >= W - MARGIN;
      const anchor = onLeft ? 'start' : onRight ? 'end' : 'middle';
      const tx = onLeft ? p.x + PAD_R + 2 : onRight ? p.x - PAD_R - 2 : p.x;
      const ty = onLeft || onRight ? p.y + 3 : p.y > H / 2 ? p.y - PAD_R - 3 : p.y + PAD_R + 9;
      const pad = `<circle cx="${p.x}" cy="${p.y}" r="${PAD_R}" fill="#d4a017" stroke="#5a4500" stroke-width="0.6"/>`;
      const label = showLabels
        ? `<text x="${tx}" y="${ty}" font-size="7" font-family="sans-serif" fill="#222" text-anchor="${anchor}">${p.name}</text>`
        : '';
      return pad + label;
    })
    .join('');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<svg x="${MARGIN}" y="${MARGIN}" width="${bodyW}" height="${bodyH}" ` +
    `viewBox="${viewBox.join(' ')}" preserveAspectRatio="xMidYMid meet">${inner}</svg>` +
    pads +
    `</svg>`;

  // Zone écran (LCD) convertie en px du repère du composant (corps décalé de MARGIN).
  const attrs = { ...(spec.attrs ?? {}) };
  if (spec.screenFrac) {
    const f = spec.screenFrac;
    attrs.sx = String(Math.round(MARGIN + bodyW * f.x));
    attrs.sy = String(Math.round(MARGIN + bodyH * f.y));
    attrs.sw = String(Math.round(bodyW * f.w));
    attrs.sh = String(Math.round(bodyH * f.h));
  }

  const part = {
    type: spec.type,
    label: spec.label,
    kind: spec.kind,
    svg,
    pins,
    ...(spec.pinRoles ? { pinRoles: spec.pinRoles } : {}),
    ...(Object.keys(attrs).length ? { attrs } : {}),
  };
  const outPath = join(OUT, `${spec.type}.kablix-part.json`);
  writeFileSync(outPath, JSON.stringify(part, null, 2));
  console.log(`  ✓ ${spec.label} → parts/${spec.type}.kablix-part.json (${pins.length} broches, ${(svg.length / 1024).toFixed(0)} Ko)`);
}

console.log('Terminé.');
