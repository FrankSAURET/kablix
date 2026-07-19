// Aligne les connecteurs Grove du SVG selon les 4 lignes avec espacement 10px
// Usage : node scripts/align-connectors.mjs <path/to/file.svg>
import { readFileSync, writeFileSync } from 'node:fs';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node align-connectors.mjs <file.svg>');
  process.exit(1);
}

let svg = readFileSync(filePath, 'utf8');

// Définitions des lignes
const LINES = [
  { name: 'ligne1', nums: Array.from({ length: 20 }, (_, i) => i), yRef: 0 },       // 0-19
  { name: 'ligne2', nums: Array.from({ length: 20 }, (_, i) => 40 + i), yRef: 1 },   // 40-59
  { name: 'ligne3', nums: Array.from({ length: 20 }, (_, i) => 39 - i), yRef: 2 },   // 39-20
  { name: 'ligne4', nums: Array.from({ length: 20 }, (_, i) => 79 - i), yRef: 3 },   // 79-60
];

// 1. Extraire les centres des bases actuels
console.log('Lecture des positions actuelles...');
const baseCenters = {};
for (let num = 0; num <= 79; num++) {
  // Regex multiline : match id="connectorXbase" suivi de d= même sur plusieurs lignes
  const idRegex = new RegExp(`id="connector${num}base"[\\s\\S]*?d="M\\s+([-\\d.]+),([-\\d.]+)`, '');
  const match = svg.match(idRegex);
  if (match) {
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    baseCenters[num] = { x, y };
    if ([0, 19, 20, 39, 40, 59, 60, 79].includes(num)) {
      console.log(`  connector${num}: (${x.toFixed(1)}, ${y.toFixed(1)})`);
    }
  }
}

// 2. Déterminer les y pour les 4 lignes
const yValues = {
  0: baseCenters[0]?.y,
  1: (baseCenters[0]?.y ?? 0) + 10,  // Ligne 2 : ligne1 + 10
  2: baseCenters[39]?.y,
  3: (baseCenters[39]?.y ?? 0) + 10,  // Ligne 4 : ligne3 + 10
};
console.log('Y initiaux des lignes 1 et 3:', { ligne1: baseCenters[0]?.y, ligne3: baseCenters[39]?.y });
console.log('Y calculés pour les 4 lignes:', yValues);

// 3. Calculer les nouvelles positions
const newPositions = {};
let xStart = null;

for (const line of LINES) {
  const yLine = yValues[line.yRef];
  
  // Pour chaque connecteur de la ligne
  for (let posIdx = 0; posIdx < line.nums.length; posIdx++) {
    const num = line.nums[posIdx];
    
    // Première ligne : déterminer xStart à partir du premier connecteur
    if (line.yRef === 0 && posIdx === 0 && baseCenters[num]) {
      xStart = baseCenters[num].x;
    }
    
    const xPos = xStart + posIdx * 10;
    newPositions[num] = { x: xPos, y: yLine };
  }
}

console.log('Nouvelles positions (exemples):', {
  connector0: newPositions[0],
  connector19: newPositions[19],
  connector40: newPositions[40],
  connector39: newPositions[39],
});

// 4. Appliquer les déplacements
let updatedBases = 0;
let updatedGroups = 0;

for (const [numStr, newPos] of Object.entries(newPositions)) {
  const num = parseInt(numStr);
  const oldCenter = baseCenters[num];
  if (!oldCenter) continue;

  const dx = newPos.x - oldCenter.x;
  const dy = newPos.y - oldCenter.y;

  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue; // Pas de déplacement

  // Mettre à jour la base (path): M x,y H x2 V y2 H x3
  const baseRegex = new RegExp(`(id="connector${num}base"[\\s\\S]*?d=")M\\s+([-\\d.]+),([-\\d.]+)\\s+H\\s+([-\\d.]+)\\s+V\\s+([-\\d.]+)\\s+H\\s+([-\\d.]+)`, '');
  svg = svg.replace(baseRegex, (match, prefix, x1s, y1s, x2s, y2s, x3s) => {
    const x1 = parseFloat(x1s) + dx;
    const y1 = parseFloat(y1s) + dy;
    const x2 = parseFloat(x2s) + dx;
    const y2 = parseFloat(y2s) + dy;
    const x3 = parseFloat(x3s) + dx;
    updatedBases++;
    return `${prefix}M ${x1},${y1} H ${x2} V ${y2} H ${x3}`;
  });

  // Mettre à jour le groupe connecteur (transform matrix)
  const groupRegex = new RegExp(`(id="connector${num}"[\\s\\S]*?transform=")matrix\\(([-\\d.]+),([-\\d.]+),([-\\d.]+),([-\\d.]+),([-\\d.]+),([-\\d.]+)\\)`, '');
  svg = svg.replace(groupRegex, (match, prefix, a, b, c, d, es, fs) => {
    const e = (parseFloat(es) + dx).toString();
    const f = (parseFloat(fs) + dy).toString();
    updatedGroups++;
    return `${prefix}matrix(${a},${b},${c},${d},${e},${f})`;
  });
}

writeFileSync(filePath, svg, 'utf8');

console.log(`✓ Alignement terminé (${updatedBases} bases, ${updatedGroups} groupes)`);
for (const line of LINES) {
  const nums = line.nums;
  console.log(`  ${line.name}: ${nums[0]}-${nums[nums.length - 1]} (${nums.length} connecteurs)`);
}
