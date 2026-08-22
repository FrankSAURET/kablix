// Source de vérité des tests testkablix : chaque entrée décrit UN test =
// un programme (.ino ou .py) + un schéma (.projix) + les vérifications attendues.
// Consommée par _generate.mjs (écrit les fichiers) et _verify.mjs (contrôle tout).
//
// Convention : la carte est toujours le composant `mcu1` ; les fils vont du
// composant vers la carte. Les couleurs suivent l'éditeur (rouge = VCC,
// noir = GND, autres couleurs libres).
import JSZip from 'jszip';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, testProjix } from './_paths.mjs';

// --- Broches connues de chaque type de composant (contrôle de validité) -------
export const PART_PINS = {
  led: ['A', 'C'],
  'rgb-led': ['R', 'COM', 'G', 'B'],
  button: ['1.l', '2.l', '1.r', '2.r'],
  'button-6mm': ['1.l', '2.l', '1.r', '2.r'],
  resistor: ['1', '2'],
  diode: ['K', 'A'],
  // Les trois condensateurs partagent les mêmes broches : changer de type dans
  // l'inspecteur ne doit jamais orphéliner un fil.
  'condo-np': ['1', '2'],
  'condo-p-1': ['1', '2'],
  'condo-p-2': ['1', '2'],
  ventilo: ['+', '-'],
  // Un moteur à courant continu n'est pas polarisé : ses deux fils sont
  // simplement numérotés (les inverser inverse son sens de rotation).
  'moteur-dc': ['1', '2'],
  // Transistors : la référence figée nomme ses pattes d'après les électrodes,
  // les prototypes génériques les numérotent (l'affectation e/b/c est une
  // propriété — changer d'affectation ne doit orphéliner aucun fil).
  // Le composant de bibliothèque garde TOUJOURS ses pattes nommées : changer de
  // référence déplace l'électrode sur une autre patte, jamais son nom. Un MOSFET
  // porte G/D/S là où un bipolaire porte E/B/C — deux jeux de noms pour le même
  // composant, selon la famille choisie dans le sélecteur.
  transistor: ['E', 'B', 'C', 'G', 'D', 'S'],
  pn2222a: ['E', 'B', 'C'],
  npn: ['1', '2', '3'],
  pnp: ['1', '2', '3'],
  // Relais : le commun sort des deux côtés du boîtier, c'est la même lame.
  relais: ['NF', 'B1', 'Com.1', 'NO', 'B2', 'Com.2'],
  buzzer: ['1', '2'],
  pot: ['GND', 'SIG', 'VCC'],
  'slide-pot': ['GND', 'SIG', 'VCC'],
  // Ajustable : le boîtier porte « 1 », « V » et « 2 », mais la netlist garde
  // les noms du modèle (comme les deux autres potentiomètres).
  'pot-rot2': ['GND', 'SIG', 'VCC'],
  // Afficheur 7 segments : les communs dépendent du nombre de chiffres. À un
  // chiffre, COM.1/COM.2 (la même patte des deux côtés du boîtier) ; à 2 ou 4
  // chiffres, un commun par chiffre (DIG1..DIG4) — c'est le multiplexage.
  '7seg': ['COM.1', 'COM.2', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP', 'DIG1', 'DIG2', 'DIG3', 'DIG4'],
  'led-bar': [
    'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10',
    'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10',
  ],
  'slide-switch': ['1', '2', '3'],
  'dip-switch': ['1a', '2a', '3a', '4a', '5a', '6a', '7a', '8a', '1b', '2b', '3b', '4b', '5b', '6b', '7b', '8b'],
  joystick: ['VCC', 'VERT', 'HORZ', 'SEL', 'GND'],
  photoresistor: ['VCC', 'GND', 'DO', 'AO'],
  pir: ['VCC', 'OUT', 'GND'],
  tilt: ['GND', 'VCC', 'OUT'],
  // Capteur à effet Hall : les NOMS des électrodes ne bougent pas, seuls leurs
  // numéros de patte changent d'une référence à l'autre (propriétés vplus/gnd/s)
  // — changer de brochage ne doit donc orphéliner aucun fil.
  hall: ['V+', 'GND', 'S'],
  servo: ['GND', 'V+', 'PWM'],
  lcd: ['GND', 'VCC', 'SDA', 'SCL'],
  'oled-ssd1306': ['SDA', 'SCL', 'SA0', 'RST', 'CS', 'VDD', 'VIN', 'GND'],
  ili9341: ['VCC', 'GND', 'CS', 'RST', 'D/C', 'MOSI', 'SCK', 'LED', 'MISO'],
  microsd: ['CD', 'DO', 'GND', 'SCK', 'VCC', 'DI', 'CS'],
  neopixel: ['VDD', 'DOUT', 'VSS', 'DIN'],
  'neopixel-matrix': ['GND', 'VCC', 'DIN', 'DOUT'],
  'led-ring': ['GND', 'VCC', 'DIN', 'DOUT'],
  'ntc-temp': ['GND', 'VCC', 'OUT'],
  // Résistances variables nues : deux pattes numérotées, sans polarité. Elles
  // ne « sortent » rien — c'est le pont diviseur qu'elles forment avec une
  // résistance fixe que l'entrée ADC lit.
  ldr: ['1', '2'],
  ntc: ['1', '2'],
  ptc: ['1', '2'],
  'gas-sensor': ['AOUT', 'DOUT', 'GND', 'VCC'],
  heartbeat: ['GND', 'VCC', 'OUT'],
  flame: ['VCC', 'GND', 'DOUT', 'AOUT'],
  sound: ['AOUT', 'DOUT', 'GND', 'VCC'],
  hcsr04: ['VCC', 'TRIG', 'ECHO', 'GND'],
  dht22: ['VCC', 'DATA', 'NC', 'GND'],
  dht11: ['VCC', 'DATA', 'NC', 'GND'],
  keypad: ['R1', 'R2', 'R3', 'R4', 'C1', 'C2', 'C3', 'C4'],
  // Module Grove PCA9685 : bus Grove + bornier alim servo + 16 colonnes servo.
  pca9685: [
    'GND', 'VCC', 'SDA', 'SCL', 'GND.2', 'V+',
    ...Array.from({ length: 16 }, (_, i) => `PWM${i}`),
    ...Array.from({ length: 16 }, (_, i) => `P${i + 1}.5V`),
    ...Array.from({ length: 16 }, (_, i) => `P${i + 1}.GND`),
  ],
  alim: ['V+', 'GND'],
  powerbank: ['V+', 'GND'],
  // Patte de robot à 2 articulations : chacune a son propre bornier 3 fils
  // (comme un servo), électriquement indépendant de l'autre.
  patte: ['coxa.GND', 'coxa.V+', 'coxa.PWM', 'patella.GND', 'patella.V+', 'patella.PWM'],
  // Robot araignée complet : PCA9685, batterie ET Pico W EMBARQUÉS. Depuis la
  // v2026.8.24 il n'a plus AUCUNE broche — rien ne sort du châssis, le robot se
  // programme directement (c'est lui, la carte).
  araignee: [],
  // --- Composants de bibliothèque (.kompix de kablix_components/) -------------
  // Ils ne sont pas au catalogue natif : le test les embarque dans son .projix
  // (champ `kompix`) et le vérificateur les enregistre avant de contrôler.
  // Carte Grove DMX512 : bornier Grove d'un côté (masse, alim, NC, signal),
  // embase XLR 3 points de l'autre (masse de blindage, Data−, Data+). Les deux
  // masses portent le même nom sur le dessin — la netlist les numérote.
  'dmx-grove': ['GND.1', 'VCC', 'NC', 'SIG', '+', '-', 'GND.2'],
  spot: ['GND', '-', '+'],
};

// --- Helpers -------------------------------------------------------------------
let wireSeq = 0;
/** Fil composant(pin) → carte/autre composant. `to` = [partId, pin]. */
function w(fromId, fromPin, toId, toPin, color) {
  wireSeq++;
  const wire = { id: `w${wireSeq}`, a: { partId: fromId, pin: fromPin }, b: { partId: toId, pin: toPin } };
  if (color) wire.color = color;
  return wire;
}

/** Fabrique un test : remet le compteur de fils à zéro pour des ids stables. */
function test(def) {
  wireSeq = 0;
  const built = typeof def.wires === 'function' ? { ...def, wires: def.wires() } : def;
  return built;
}

const MCU = (board, x = 40, y = 60) => ({ id: 'U1', type: board, x, y });

// --- Circuits intégrés logiques : UN test pour les douze références -------------
// Les douze boîtiers DIL-14 partagent les deux MÊMES entrées (une broche « A »,
// une broche « B ») et chacun renvoie ses quatre (ou six) sorties sur UNE
// broche de lecture : les sorties d'un même boîtier réalisent la même fonction
// sur les mêmes entrées, elles portent donc le même niveau et se relient sans
// conflit. Toutes les portes sont ainsi câblées et vérifiées, avec 14 broches.
const CD4000_QUAD_PINS = ['A1', 'B1', 'Q1', 'Q2', 'A2', 'B2', 'GND', 'A3', 'B3', 'Q3', 'Q4', 'A4', 'B4', 'VDD'];
const TTL_QUAD_PINS = ['A1', 'B1', 'Q1', 'A2', 'B2', 'Q2', 'GND', 'Q3', 'B3', 'A3', 'Q4', 'A4', 'B4', 'VCC'];
const TTL_NOR_PINS = ['Q1', 'A1', 'B1', 'Q2', 'A2', 'B2', 'GND', 'B3', 'A3', 'Q3', 'B4', 'A4', 'Q4', 'VCC'];
// Six inverseurs : entrée `x`, sortie `x̅` (x suivi du macron combinant U+0305).
const HEX_INV_PINS = ['a', 'a̅', 'b', 'b̅', 'c', 'c̅', 'GND', 'd̅', 'd', 'e̅', 'e', 'f̅', 'f', 'VDD'];
// Le même en série 74 : seule la patte 14 change de nom (VCC au lieu de VDD).
const HEX_INV_TTL_PINS = [...HEX_INV_PINS.slice(0, 13), 'VCC'];

/** Les quatre portes d'un boîtier quadruple. */
const QUAD_GATES = [1, 2, 3, 4].map((n) => ({ in: [`A${n}`, `B${n}`], out: `Q${n}` }));
/** Les six inverseurs. */
const HEX_GATES = ['a', 'b', 'c', 'd', 'e', 'f'].map((l) => ({ in: [l], out: `${l}̅` }));

/** Les douze références de la bibliothèque, dans l'ordre de la palette. */
const IC_CHIPS = [
  { ref: 'CD4081', op: 'and', schema: 'cd4081', pins: CD4000_QUAD_PINS, gates: QUAD_GATES, vcc: 'VDD' },
  { ref: 'CD4071', op: 'or', schema: 'cd4071', pins: CD4000_QUAD_PINS, gates: QUAD_GATES, vcc: 'VDD' },
  { ref: 'CD4070', op: 'xor', schema: 'cd4070', pins: CD4000_QUAD_PINS, gates: QUAD_GATES, vcc: 'VDD' },
  { ref: 'CD4011', op: 'nand', schema: 'cd4011', pins: CD4000_QUAD_PINS, gates: QUAD_GATES, vcc: 'VDD' },
  { ref: 'CD4001', op: 'nor', schema: 'cd4001', pins: CD4000_QUAD_PINS, gates: QUAD_GATES, vcc: 'VDD' },
  { ref: 'CD40106', op: 'not', schema: 'cd40106', pins: HEX_INV_PINS, gates: HEX_GATES, vcc: 'VDD' },
  { ref: '74xx08', op: 'and', schema: '7408', pins: TTL_QUAD_PINS, gates: QUAD_GATES, vcc: 'VCC' },
  { ref: '74xx32', op: 'or', schema: '7432', pins: TTL_QUAD_PINS, gates: QUAD_GATES, vcc: 'VCC' },
  { ref: '74xx86', op: 'xor', schema: '7486', pins: TTL_QUAD_PINS, gates: QUAD_GATES, vcc: 'VCC' },
  { ref: '74xx00', op: 'nand', schema: '7400', pins: TTL_QUAD_PINS, gates: QUAD_GATES, vcc: 'VCC' },
  { ref: '74xx02', op: 'nor', schema: '7402', pins: TTL_NOR_PINS, gates: QUAD_GATES, vcc: 'VCC' },
  { ref: '74xx14', op: 'not', schema: '7414', pins: HEX_INV_TTL_PINS, gates: HEX_GATES, vcc: 'VCC' },
];
const IC_BY_REF = new Map(IC_CHIPS.map((c) => [c.ref, c]));

// Les douze boîtiers d'un seul tenant faisaient un schéma de 170 fils étalé sur
// 1300 px : l'autoroutage y tournait des minutes (Frank, v2026.7.265). Ils sont
// répartis sur TROIS planches, chacune tenant deux fonctions avec leur jumeau
// CMOS (CD4000) et TTL (74HC) — la même fonction, deux familles, deux tensions
// d'alimentation nommées différemment (VDD / VCC).
const IC_GROUPS = {
  CI1: { fonctions: 'ET et OU', refs: ['CD4081', '74xx08', 'CD4071', '74xx32'] },
  CI2: { fonctions: 'OU EXCLUSIF et NON-ET', refs: ['CD4070', '74xx86', 'CD4011', '74xx00'] },
  CI3: { fonctions: 'NON-OU et NON', refs: ['CD4001', '74xx02', 'CD40106', '74xx14'] },
};
/** Les quatre boîtiers d'une planche, repérés U2..U5 dans l'ordre de pose. */
const icChips = (groupe) => IC_GROUPS[groupe].refs.map((r, i) => ({ ...IC_BY_REF.get(r), id: `U${i + 2}` }));

// Le brochage de chaque référence complète la table de validité des fils : le
// nom des pattes vient du schéma interne, il n'y a rien à recopier de plus.
for (const c of IC_CHIPS) PART_PINS[c.ref.toLowerCase()] = c.pins;

// Famille HC pour la série 74 : c'est la seule qui tienne de 3,3 V (Pico) à
// 5 V (Uno) — un 74LS00 ne fonctionnerait pas sur le Pico.
const IC_FAMILY = 'HC';

/** Broches de chaque carte : deux entrées, douze lectures, l'alimentation. */
const IC_BOARD = {
  uno: {
    a: '2', b: '3', vcc: '5V', gnds: ['GND.1', 'GND.2', 'GND.3'],
    reads: ['4', '5', '6', '7', '8', '9', '10', '11', '12', '13', 'A0', 'A1'],
  },
  pico: {
    a: 'GP2', b: 'GP3', vcc: '3V3', gnds: ['GND.1', 'GND.2', 'GND.3', 'GND.4', 'GND.5', 'GND.6', 'GND.7', 'GND.8'],
    reads: ['GP4', 'GP5', 'GP6', 'GP7', 'GP8', 'GP9', 'GP10', 'GP11', 'GP12', 'GP13', 'GP14', 'GP15'],
  },
};

/** Ce que doit sortir une porte : la table de vérité, écrite une seule fois. */
function icExpected(op, a, b) {
  switch (op) {
    case 'and': return a & b;
    case 'or': return a | b;
    case 'xor': return a ^ b;
    case 'nand': return 1 - (a & b);
    case 'nor': return 1 - (a | b);
    default: return 1 - a; // 'not' : l'inverseur ne regarde que A
  }
}

/** Nom de la fonction, tel qu'il s'affiche dans le moniteur série. */
const IC_FONCTION = { and: 'ET', or: 'OU', xor: 'OU EXCLUSIF', nand: 'NON-ET', nor: 'NON-OU', not: 'NON' };
/** Le même repère, côté code : un numéro en C, un mot en Python. */
const IC_NUM = { and: 0, or: 1, xor: 2, nand: 3, nor: 4, not: 5 };
const IC_MOT = { and: 'et', or: 'ou', xor: 'ouex', nand: 'nonet', nor: 'nonou', not: 'non' };
/** L'inscription du boîtier : « CD4081 » tel quel, « 74xx08 » devient « 74HC08 ». */
const icNom = (c) => c.ref.replace('xx', IC_FAMILY);

// Pose des quatre boîtiers : deux colonnes, deux rangées, posées juste à droite
// de la carte. Assez PRÈS pour des fils courts (l'autoroutage d'un schéma étalé
// coûtait des minutes), assez loin pour qu'il reste un couloir entre la carte et
// la première colonne.
const IC_GRID = {
  uno: { x: 420, y: 80, dx: 160, dy: 140 },   // la Uno occupe x 46..340, y 69..271
  pico: { x: 340, y: 60, dx: 160, dy: 140 },  // le Pico occupe x 46..255, y 69..152
};

const icParts = (board, groupe) => {
  const g = IC_GRID[board];
  return [
    MCU(board),
    ...icChips(groupe).map((c, i) => ({
      id: c.id, type: c.ref.toLowerCase(),
      x: g.x + (i % 2) * g.dx, y: g.y + Math.floor(i / 2) * g.dy,
      attrs: {
        ref: c.ref,
        family: c.ref.startsWith('74') ? IC_FAMILY : '',
        text: icNom(c),
        pinnames: c.pins.join(','),
        schema: c.schema,
        pkg: 'ic14',
      },
    })),
  ];
};

const icWires = (board, groupe) => {
  const p = IC_BOARD[board];
  return icChips(groupe).flatMap((c, i) => [
    // Alimentation : patte 14 au rail (fil rouge), patte 7 à la masse (fil noir).
    w(c.id, c.vcc, 'U1', p.vcc, 'red'),
    w(c.id, 'GND', 'U1', p.gnds[i % p.gnds.length], 'black'),
    ...c.gates.flatMap((g) => [
      w(c.id, g.in[0], 'U1', p.a, 'green'),
      ...(g.in[1] ? [w(c.id, g.in[1], 'U1', p.b, 'blue')] : []),
      w(c.id, g.out, 'U1', p.reads[i], 'orange'),
    ]),
  ]);
};

const icExpect = (board, groupe) => ({
  kind: 'logic-ic',
  reads: Object.fromEntries(icChips(groupe).map((c, i) => [c.id, IC_BOARD[board].reads[i]])),
  steps: [[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, b]) => ({
    high: [...(a ? [IC_BOARD[board].a] : []), ...(b ? [IC_BOARD[board].b] : [])],
    outputs: Object.fromEntries(icChips(groupe).map((c) => [c.id, icExpected(c.op, a, b)])),
  })),
});

/** L'en-tête commun aux six sketches, au commentaire près de la carte. */
const icEntete = (groupe, board, com) => {
  const chips = icChips(groupe);
  const p = IC_BOARD[board];
  const portes = chips.reduce((n, c) => n + c.gates.length, 0);
  const volts = board === 'uno' ? '5 V' : '3,3 V';
  const tension = board === 'uno' ? '' : `${com} Les familles CD4000 et HC acceptent cette tension ; une famille TTL
${com} (LS, ALS, F...) refuserait.\n`;
  return `${com} Test des QUATRE circuits integres logiques ${IC_GROUPS[groupe].fonctions} : chaque
${com} fonction avec son jumeau CMOS (CD4000) et son jumeau TTL (74HC). Tous sont
${com} des boitiers DIL-14 alimentes en ${volts} : patte 14 (VDD ou VCC) au rail rouge,
${com} patte 7 (GND) a la masse noire.
${tension}${com}
${com} Les quatre boitiers recoivent les MEMES deux entrees : ${p.a} (A) et ${p.b} (B). Les
${com} portes d'un meme boitier font la meme chose sur les memes entrees : elles
${com} sortent donc le meme niveau et se relient sans conflit sur UNE broche de
${com} lecture. Les ${portes} portes du montage sont ainsi toutes cablees, avec six broches.
${com}
${com}   ${p.a} = A, ${p.b} = B ; ${p.reads[0]}..${p.reads[3]} : lecture des quatre boitiers.
${com}
${com} Le programme balaye les quatre combinaisons A/B et compare chaque sortie a la
${com} table de verite : « OK » ou « ERREUR ».`;
};

/** Le sketch Arduino d'une planche : mêmes lignes pour les trois, seule la
 *  table des boîtiers change. */
const icCodeUno = (groupe) => {
  const chips = icChips(groupe);
  const p = IC_BOARD.uno;
  const noms = chips.map((c) => `  "${icNom(c).padEnd(7)} ${IC_FONCTION[c.op].padEnd(11)}",`).join('\n');
  return `${icEntete(groupe, 'uno', '//')}
const int A_PIN = ${p.a};
const int B_PIN = ${p.b};
const int NB = 4;
// Fonction : 0 ET, 1 OU, 2 OU EXCLUSIF, 3 NON-ET, 4 NON-OU, 5 NON.
const char* NOMS[NB] = {
${noms}
};
const int LECTURE[NB] = {${p.reads.slice(0, 4).join(', ')}};
const int FONCTION[NB] = {${chips.map((c) => IC_NUM[c.op]).join(', ')}};

int attendu(int fonction, int a, int b) {
  switch (fonction) {
    case 0: return a && b;
    case 1: return a || b;
    case 2: return a != b;
    case 3: return !(a && b);
    case 4: return !(a || b);
    default: return !a;   // l'inverseur ne regarde que l'entree A
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(A_PIN, OUTPUT);
  pinMode(B_PIN, OUTPUT);
  for (int i = 0; i < NB; i++) pinMode(LECTURE[i], INPUT);
  Serial.println("Portes logiques : A et B communes aux quatre boitiers.");
}

void loop() {
  for (int combo = 0; combo < 4; combo++) {
    int a = combo & 1;
    int b = (combo >> 1) & 1;
    digitalWrite(A_PIN, a);
    digitalWrite(B_PIN, b);
    delay(200);   // laisse les sorties se propager
    Serial.print("A=");
    Serial.print(a);
    Serial.print("  B=");
    Serial.println(b);
    for (int i = 0; i < NB; i++) {
      int lu = digitalRead(LECTURE[i]);
      Serial.print("  ");
      Serial.print(NOMS[i]);
      Serial.print(" = ");
      Serial.print(lu);
      Serial.println(lu == attendu(FONCTION[i], a, b) ? "   OK" : "   ERREUR");
    }
    delay(800);
  }
}
`;
};

/** Le même programme en MicroPython, pour le Pico. */
const icCodePico = (groupe) => {
  const chips = icChips(groupe);
  const p = IC_BOARD.pico;
  const gp = (nom) => nom.replace('GP', '');
  const table = chips
    .map((c, i) => `    ("${icNom(c).padEnd(7)} ${IC_FONCTION[c.op].padEnd(11)}", ${gp(p.reads[i])}, "${IC_MOT[c.op]}"),`)
    .join('\n');
  return `${icEntete(groupe, 'pico', '#')}
from machine import Pin
import time

a_pin = Pin(${gp(p.a)}, Pin.OUT)
b_pin = Pin(${gp(p.b)}, Pin.OUT)

# nom du boitier, broche de lecture, fonction logique
BOITIERS = [
${table}
]
lectures = [Pin(broche, Pin.IN) for (_, broche, _) in BOITIERS]


def attendu(fonction, a, b):
    if fonction == "et":
        return a & b
    if fonction == "ou":
        return a | b
    if fonction == "ouex":
        return a ^ b
    if fonction == "nonet":
        return 1 - (a & b)
    if fonction == "nonou":
        return 1 - (a | b)
    return 1 - a   # l'inverseur ne regarde que l'entree A


print("Portes logiques : A et B communes aux quatre boitiers.")
while True:
    for a, b in ((0, 0), (1, 0), (0, 1), (1, 1)):
        a_pin.value(a)
        b_pin.value(b)
        time.sleep(0.2)   # laisse les sorties se propager
        print("A=%d  B=%d" % (a, b))
        for i, (nom, _, fonction) in enumerate(BOITIERS):
            lu = lectures[i].value()
            etat = "OK" if lu == attendu(fonction, a, b) else "ERREUR"
            print("  %s = %d   %s" % (nom, lu, etat))
        time.sleep(0.8)
`;
};

/** Une planche de CI, côté Uno ou côté Pico : tout se déduit du groupe. */
const icTest = (groupe, board) => test({
  name: `${groupe}-${board}`, board, ext: board === 'uno' ? 'ino' : 'py',
  parts: icParts(board, groupe),
  wires: () => icWires(board, groupe),
  expect: icExpect(board, groupe),
  code: board === 'uno' ? icCodeUno(groupe) : icCodePico(groupe),
});

// ================================================================================
// Partie AVR — Arduino Uno (un test .ino par composant, dossier par sketch)
// ================================================================================
const AVR_TESTS = [
  test({
    name: 'led-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'R1', type: 'resistor', x: 480, y: 90, attrs: { value: '220' } }, { id: 'L1', type: 'led', x: 620, y: 60, attrs: { color: 'red' } }],
    wires: () => [w('R1', '1', 'U1', '13', 'green'), w('L1', 'A', 'R1', '2', 'green'), w('L1', 'C', 'U1', 'GND.1', 'black')],
    expect: { kind: 'led', partId: 'L1', mcuPin: '13' },
    code: `// Test LED : clignote sur D13 (via une résistance de 220 ohms).
void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  digitalWrite(13, HIGH);   // LED allumée
  Serial.println("LED ON");
  delay(500);
  digitalWrite(13, LOW);    // LED éteinte
  Serial.println("LED OFF");
  delay(500);
}
`,
  }),

  test({
    // Une résistance de 220 Ω par canal : les trois LED d'un boîtier RGB ne se
    // partagent PAS une résistance commune, sinon leur luminosité dépendrait
    // des couleurs allumées à côté.
    name: 'rgb-led-uno', board: 'uno', ext: 'ino',
    parts: [
      MCU('uno', 70, 150),
      { id: 'L1', type: 'rgb-led', x: 210, y: 0, attrs: { common: 'cathode' } },
      { id: 'R1', type: 'resistor', x: 180, y: 80, rotation: 90, attrs: { value: '220' } },
      { id: 'R2', type: 'resistor', x: 200, y: 80, rotation: 90, attrs: { value: '220' } },
      { id: 'R3', type: 'resistor', x: 210, y: 80, rotation: 90, attrs: { value: '220' } },
    ],
    wires: () => [
      w('L1', 'R', 'R1', '1', 'red'),
      w('L1', 'COM', 'U1', 'GND.1', 'black'),
      w('L1', 'G', 'R2', '1', 'green'),
      w('L1', 'B', 'R3', '1', 'blue'),
      w('R1', '2', 'U1', '12', 'red'),
      w('R2', '2', 'U1', '10', 'green'),
      w('R3', '2', 'U1', '9', 'blue'),
    ],
    expect: { kind: 'rgb-led', partId: 'L1', r: '12', g: '10', b: '9' },
    code: `// Test LED RGB (cathode commune) : fondu sur chaque canal PWM.
const int R = 12, G = 10, B = 9;

void setup() {
  Serial.begin(115200);
}

void fondu(int broche, const char* nom) {
  Serial.println(nom);
  for (int v = 0; v <= 255; v += 5) { analogWrite(broche, v); delay(10); }
  analogWrite(broche, 0);
}

void loop() {
  fondu(R, "Rouge");
  fondu(G, "Vert");
  fondu(B, "Bleu");
  // Blanc : les trois canaux ensemble.
  analogWrite(R, 255); analogWrite(G, 255); analogWrite(B, 255);
  Serial.println("Blanc");
  delay(800);
  analogWrite(R, 0); analogWrite(G, 0); analogWrite(B, 0);
}
`,
  }),

  test({
    name: 'button-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'BP1', type: 'button', x: 620, y: 100, attrs: { color: 'green' } }],
    wires: () => [w('BP1', '1.l', 'U1', '2', 'yellow'), w('BP1', '2.l', 'U1', 'GND.1', 'black')],
    expect: { kind: 'button', partId: 'BP1', mcuPin: '2' },
    code: `// Test bouton poussoir : appui = LOW (pull-up interne), recopié sur la LED D13.
void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  bool appuye = (digitalRead(2) == LOW);
  digitalWrite(13, appuye ? HIGH : LOW);
  Serial.println(appuye ? "APPUYE" : "relache");
  delay(200);
}
`,
  }),

  // Les tests `button-6mm-uno` et `resistor-uno` ont été retirés de la spec en
  // v2026.8.25, à la demande de Frank, après qu'il ait supprimé leurs fichiers
  // en v2026.8.3. Le bouton 6 mm reste éprouvé par `verify:button-latch` (les
  // DEUX poussoirs : souris, clavier, capuchon enfoncé, maintien Ctrl) ; la
  // résistance, elle, est en série dans la moitié des autres montages.

  test({
    name: 'buzzer-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Act1', type: 'buzzer', x: 620, y: 90 }],
    wires: () => [w('Act1', '1', 'U1', '8', 'purple'), w('Act1', '2', 'U1', 'GND.1', 'black')],
    expect: { kind: 'buzzer', partId: 'Act1', mcuPin: '8' },
    code: `// Test buzzer : niveau haut simple puis tone() (halo actif sur le buzzer).
void setup() {
  pinMode(8, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  digitalWrite(8, HIGH);           // buzzer actif (niveau haut)
  Serial.println("Buzzer ON");
  delay(400);
  digitalWrite(8, LOW);
  Serial.println("Buzzer OFF");
  delay(400);
  tone(8, 440, 300);               // la 440 Hz pendant 300 ms
  Serial.println("tone(440 Hz)");
  delay(600);
}
`,
  }),

  test({
    name: 'pot-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Pot1', type: 'pot', x: 620, y: 90, attrs: { min: '0', max: '100', value: '50' } }],
    wires: () => [
      w('Pot1', 'VCC', 'U1', '5V', 'red'),
      w('Pot1', 'SIG', 'U1', 'A0', 'green'),
      w('Pot1', 'GND', 'U1', 'GND.1', 'black'),
    ],
    expect: { kind: 'pot', partId: 'Pot1', mcuPin: 'A0' },
    code: `// Test potentiomètre : lecture analogique 0-1023 sur A0.
void setup() {
  Serial.begin(115200);
}

void loop() {
  int valeur = analogRead(A0);
  Serial.print("A0 = ");
  Serial.println(valeur);
  delay(250);
}
`,
  }),

  test({
    name: 'slide-pot-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Pot1', type: 'slide-pot', x: 600, y: 100, attrs: { min: '0', max: '100', value: '50' } }],
    wires: () => [
      w('Pot1', 'VCC', 'U1', '5V', 'red'),
      w('Pot1', 'SIG', 'U1', 'A0', 'green'),
      w('Pot1', 'GND', 'U1', 'GND.1', 'black'),
    ],
    expect: { kind: 'pot', partId: 'Pot1', mcuPin: 'A0' },
    code: `// Test potentiomètre à glissière : lecture analogique 0-1023 sur A0.
void setup() {
  Serial.begin(115200);
}

void loop() {
  int valeur = analogRead(A0);
  Serial.print("A0 = ");
  Serial.println(valeur);
  delay(250);
}
`,
  }),

  test({
    // Potentiomètre AJUSTABLE : même câblage que le rotatif (rail entre 5 V et
    // masse, curseur sur A0), mais sa valeur nominale s'écrit en code à trois
    // chiffres sur le boîtier — 104 pour les 100 kΩ demandés ici.
    name: 'pot-rot2-uno', board: 'uno', ext: 'ino',
    parts: [
      MCU('uno'),
      { id: 'Pot1', type: 'pot-rot2', x: 620, y: 90, attrs: { min: '0', max: '100', value: '50', ohms: '100000' } },
    ],
    wires: () => [
      w('Pot1', 'VCC', 'U1', '5V', 'red'),
      w('Pot1', 'SIG', 'U1', 'A0', 'green'),
      w('Pot1', 'GND', 'U1', 'GND.1', 'black'),
    ],
    expect: { kind: 'pot', partId: 'Pot1', mcuPin: 'A0' },
    code: `// Test potentiomètre ajustable (trimmer 100 kΩ) : lecture 0-1023 sur A0.
void setup() {
  Serial.begin(115200);
}

void loop() {
  int valeur = analogRead(A0);
  Serial.print("A0 = ");
  Serial.println(valeur);
  delay(250);
}
`,
  }),

  test({
    name: '7seg-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Aff1', type: '7seg', x: 620, y: 80, attrs: { color: 'red', common: 'cathode', digits: '1' } }],
    wires: () => [
      w('Aff1', 'A', 'U1', '2', 'green'),
      w('Aff1', 'B', 'U1', '3', 'green'),
      w('Aff1', 'C', 'U1', '4', 'green'),
      w('Aff1', 'D', 'U1', '5', 'green'),
      w('Aff1', 'E', 'U1', '6', 'green'),
      w('Aff1', 'F', 'U1', '7', 'green'),
      w('Aff1', 'G', 'U1', '8', 'green'),
      w('Aff1', 'DP', 'U1', '9', 'green'),
      w('Aff1', 'COM.1', 'U1', 'GND.1', 'black'),
    ],
    expect: { kind: '7seg', partId: 'Aff1', segments: { A: '2', B: '3', C: '4', D: '5', E: '6', F: '7', G: '8', DP: '9' } },
    code: `// Test afficheur 7 segments (cathode commune) : compte de 0 à 9.
// Segments A,B,C,D,E,F,G,DP sur D2..D9 ; commun COM sur GND.
const int SEGS[8] = {2, 3, 4, 5, 6, 7, 8, 9};
// Bits a..g (bit 0 = A, ... bit 6 = G) pour les chiffres 0..9.
const byte CHIFFRES[10] = {
  0b0111111, 0b0000110, 0b1011011, 0b1001111, 0b1100110,
  0b1101101, 0b1111101, 0b0000111, 0b1111111, 0b1101111,
};

void setup() {
  for (int i = 0; i < 8; i++) pinMode(SEGS[i], OUTPUT);
  Serial.begin(115200);
}

void loop() {
  for (int n = 0; n <= 9; n++) {
    for (int s = 0; s < 7; s++) digitalWrite(SEGS[s], (CHIFFRES[n] >> s) & 1);
    digitalWrite(SEGS[7], n % 2);   // point décimal sur les impairs
    Serial.println(n);
    delay(500);
  }
}
`,
  }),

  test({
    // Une résistance de 220 Ω par LED, et les broches prises À L'ENVERS : D2 en
    // bas de la carte va sur A10 en bas de la barre, D11 sur A1. Les dix fils
    // montent donc en parallèle sans se croiser. Les cathodes sont chaînées
    // entre elles et rejoignent la masse par un seul fil.
    name: 'led-bar-uno', board: 'uno', ext: 'ino',
    parts: [
      MCU('uno', 90, 190),
      { id: 'Aff1', type: 'led-bar', x: 500, y: 70, attrs: { color: 'GYR' } },
      ...Array.from({ length: 10 }, (_, i) => (
        { id: `R${i + 1}`, type: 'resistor', x: 420, y: 70 + i * 10, attrs: { value: '220' } }
      )),
    ],
    wires: () => [
      w('U1', 'GND.1', 'Aff1', 'C1', 'black'),
      ...Array.from({ length: 9 }, (_, i) => w('Aff1', `C${i + 1}`, 'Aff1', `C${i + 2}`, 'black')),
      ...Array.from({ length: 10 }, (_, i) => w('Aff1', `A${i + 1}`, `R${i + 1}`, '2', 'green')),
      ...Array.from({ length: 10 }, (_, i) => w(`R${i + 1}`, '1', 'U1', String(11 - i), 'purple')),
    ],
    // D11 pilote A1 : c'est LUI qui allume la première LED de la barre.
    expect: { kind: 'led-bar', partId: 'Aff1', firstPin: '11' },
    code: `// Test barre de 10 LED : vumètre qui monte puis descend (anodes sur D2..D11).
void setup() {
  for (int i = 2; i <= 11; i++) pinMode(i, OUTPUT);
  Serial.begin(115200);
}

void afficher(int niveau) {
  for (int i = 0; i < 10; i++) digitalWrite(2 + i, i < niveau ? HIGH : LOW);
  Serial.print("niveau = ");
  Serial.println(niveau);
}

void loop() {
  for (int n = 0; n <= 10; n++) { afficher(n); delay(150); }
  for (int n = 10; n >= 0; n--) { afficher(n); delay(150); }
}
`,
  }),

  test({
    name: 'slide-switch-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Inter1', type: 'slide-switch', x: 620, y: 100 }],
    wires: () => [
      w('Inter1', '1', 'U1', '7', 'yellow'),
      w('Inter1', '2', 'U1', 'GND.1', 'black'),
      w('Inter1', '3', 'U1', '8', 'orange'),
    ],
    expect: { kind: 'slide-switch', partId: 'Inter1', sides: { 1: '7', 3: '8' } },
    code: `// Test interrupteur à glissière : le commun (2) est à GND, les côtés 1 et 3
// sont lus en pull-up : le côté connecté passe à LOW.
void setup() {
  pinMode(7, INPUT_PULLUP);
  pinMode(8, INPUT_PULLUP);
  Serial.begin(115200);
}

void loop() {
  if (digitalRead(7) == LOW) Serial.println("Position 1");
  else if (digitalRead(8) == LOW) Serial.println("Position 3");
  else Serial.println("(milieu / non connecte)");
  delay(300);
}
`,
  }),

  test({
    name: 'dip-switch-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Inter1', type: 'dip-switch', x: 620, y: 90 }],
    wires: () => [
      ...Array.from({ length: 8 }, (_, i) => w('Inter1', `${i + 1}a`, 'U1', String(i + 2), 'yellow')),
      ...Array.from({ length: 8 }, (_, i) => w('Inter1', `${i + 1}b`, 'U1', `GND.${(i % 3) + 1}`, 'black')),
    ],
    expect: { kind: 'dip-switch', partId: 'Inter1', channels: 8 },
    code: `// Test DIP switch x8 : chaque canal fermé tire sa broche (D2..D9) à LOW.
void setup() {
  for (int i = 2; i <= 9; i++) pinMode(i, INPUT_PULLUP);
  Serial.begin(115200);
}

void loop() {
  Serial.print("Canaux : ");
  for (int i = 0; i < 8; i++) Serial.print(digitalRead(2 + i) == LOW ? "1" : "0");
  Serial.println();
  delay(400);
}
`,
  }),

  test({
    name: 'joystick-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Pot1', type: 'joystick', x: 620, y: 80 }],
    wires: () => [
      w('Pot1', 'VCC', 'U1', '5V', 'red'),
      w('Pot1', 'VERT', 'U1', 'A0', 'green'),
      w('Pot1', 'HORZ', 'U1', 'A1', 'blue'),
      w('Pot1', 'SEL', 'U1', '2', 'yellow'),
      w('Pot1', 'GND', 'U1', 'GND.1', 'black'),
    ],
    expect: { kind: 'joystick', partId: 'Pot1', vert: 'A0', horz: 'A1', sel: '2' },
    code: `// Test joystick analogique : X/Y en analogique, bouton SEL en pull-up.
void setup() {
  pinMode(2, INPUT_PULLUP);
  Serial.begin(115200);
}

void loop() {
  Serial.print("Y=");
  Serial.print(analogRead(A0));
  Serial.print("  X=");
  Serial.print(analogRead(A1));
  Serial.print("  bouton=");
  Serial.println(digitalRead(2) == LOW ? "APPUYE" : "relache");
  delay(250);
}
`,
  }),

  test({
    name: 'photoresistor-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Capt1', type: 'photoresistor', x: 620, y: 90, attrs: { sensitivity: '50' } }],
    wires: () => [
      w('Capt1', 'VCC', 'U1', '5V', 'red'),
      w('Capt1', 'GND', 'U1', 'GND.1', 'black'),
      w('Capt1', 'AO', 'U1', 'A0', 'green'),
      w('Capt1', 'DO', 'U1', '2', 'yellow'),
    ],
    expect: { kind: 'ao-do', partId: 'Capt1', analog: 'A0', digital: '2' },
    code: `// Test capteur de lumière (LDR) : sortie analogique AO + sortie numérique DO
// (DO est actif bas : LOW = seuil dépassé).
void setup() {
  pinMode(2, INPUT);
  Serial.begin(115200);
}

void loop() {
  Serial.print("AO = ");
  Serial.print(analogRead(A0));
  Serial.print("  DO = ");
  Serial.println(digitalRead(2) == LOW ? "SEUIL DEPASSE" : "sous le seuil");
  delay(300);
}
`,
  }),

  test({
    name: 'pir-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Capt1', type: 'pir', x: 620, y: 90 }],
    wires: () => [
      w('Capt1', 'VCC', 'U1', '5V', 'red'),
      w('Capt1', 'OUT', 'U1', '2', 'yellow'),
      w('Capt1', 'GND', 'U1', 'GND.1', 'black'),
    ],
    expect: { kind: 'digital-source', partId: 'Capt1', mcuPin: '2' },
    code: `// Test capteur PIR : en simulation, survoler le capteur déclenche le mouvement.
void setup() {
  pinMode(2, INPUT);
  pinMode(13, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  bool mouvement = (digitalRead(2) == HIGH);
  digitalWrite(13, mouvement ? HIGH : LOW);
  Serial.println(mouvement ? "MOUVEMENT !" : "rien");
  delay(300);
}
`,
  }),

  test({
    name: 'tilt-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Capt1', type: 'tilt', x: 620, y: 90 }],
    wires: () => [
      w('Capt1', 'VCC', 'U1', '5V', 'red'),
      w('Capt1', 'OUT', 'U1', '2', 'yellow'),
      w('Capt1', 'GND', 'U1', 'GND.1', 'black'),
    ],
    expect: { kind: 'digital-source', partId: 'Capt1', mcuPin: '2' },
    code: `// Test capteur d'inclinaison : en simulation, maintenir le clic incline le capteur.
void setup() {
  pinMode(2, INPUT);
  Serial.begin(115200);
}

void loop() {
  Serial.println(digitalRead(2) == HIGH ? "INCLINE" : "droit");
  delay(300);
}
`,
  }),

  test({
    // Capteur à effet Hall : sortie à DRAIN OUVERT, donc rappel obligatoire.
    // Côté Arduino, on le câble en externe (10 kΩ vers 5 V) — c'est le montage
    // du A3144 dans toutes ses fiches. Sans lui, la sortie ne monte jamais et
    // le moteur signale la faute.
    name: 'hall-uno', board: 'uno', ext: 'ino',
    parts: [
      MCU('uno'),
      { id: 'Capt1', type: 'hall', x: 620, y: 90, attrs: { text: 'A3144', vplus: '1', gnd: '2', s: '3' } },
      { id: 'R1', type: 'resistor', x: 500, y: 60, attrs: { value: '10000' } },
    ],
    wires: () => [
      w('Capt1', 'V+', 'U1', '5V', 'red'),
      w('Capt1', 'GND', 'U1', 'GND.1', 'black'),
      w('Capt1', 'S', 'U1', '2', 'yellow'),
      w('R1', '1', 'Capt1', 'S', 'orange'),
      w('R1', '2', 'U1', '5V', 'red'),
    ],
    expect: { kind: 'hall', partId: 'Capt1', mcuPin: '2', powered: true, pullupOhms: 10000 },
    code: `// Test capteur à effet Hall : en simulation, glisser l'aimant vers le capteur.
// Sortie à drain ouvert, ACTIVE BASSE : rappel de 10 kohms vers 5 V.
const int HALL = 2;

void setup() {
  pinMode(HALL, INPUT);
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  bool aimant = digitalRead(HALL) == LOW;
  digitalWrite(LED_BUILTIN, aimant ? HIGH : LOW);
  Serial.println(aimant ? "AIMANT" : "rien");
  delay(300);
}
`,
  }),

  test({
    name: 'servo-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Act1', type: 'servo', x: 620, y: 80, attrs: { horn: 'single', pulsemin: '500', pulsemax: '2500' } }],
    wires: () => [
      w('Act1', 'V+', 'U1', '5V', 'red'),
      w('Act1', 'GND', 'U1', 'GND.1', 'black'),
      w('Act1', 'PWM', 'U1', '9', 'orange'),
    ],
    expect: { kind: 'servo', partId: 'Act1', mcuPin: '9' },
    code: `// Test servomoteur : le bras se positionne à 0°, 90° puis 180°.
#include <Servo.h>

Servo servo;

void setup() {
  servo.attach(9);
  Serial.begin(115200);
}

void loop() {
  servo.write(0);
  Serial.println("0 degres");
  delay(1000);
  servo.write(90);
  Serial.println("90 degres");
  delay(1000);
  servo.write(180);
  Serial.println("180 degres");
  delay(1000);
}
`,
  }),

  test({
    name: 'pca9685-uno', board: 'uno', ext: 'ino',
    parts: [
      MCU('uno'),
      { id: 'Mod1', type: 'pca9685', x: 560, y: 40, attrs: { address: '0x40' } },
      { id: 'Act1', type: 'servo', x: 940, y: 40, attrs: { horn: 'single', pulsemin: '500', pulsemax: '2500' } },
      { id: 'Alim1', type: 'alim', x: 940, y: 260, attrs: { voltage: '5', maxcurrent: '1' } },
    ],
    wires: () => [
      w('Mod1', 'GND', 'U1', 'GND.1', 'black'),
      w('Mod1', 'VCC', 'U1', '5V', 'red'),
      w('Mod1', 'SDA', 'U1', 'A4', 'blue'),
      w('Mod1', 'SCL', 'U1', 'A5', 'yellow'),
      w('Act1', 'PWM', 'Mod1', 'PWM0', 'orange'),
      w('Act1', 'V+', 'Mod1', 'P1.5V', 'red'),
      w('Act1', 'GND', 'Mod1', 'P1.GND', 'black'),
      w('Alim1', 'V+', 'Mod1', 'V+', 'red'),
      w('Alim1', 'GND', 'Mod1', 'GND.2', 'black'),
    ],
    expect: { kind: 'pca9685', partId: 'Mod1', channel: 0, targetId: 'Act1', powered: true },
    code: `// Test PCA9685 : le servo branché sur P1 (canal 0) balaie 0°, 90° puis 180°.
// SANS l'alimentation de laboratoire réglée sur 5 V (courant suffisant) sur le
// bornier V+/GND du module, les sorties ne bougent pas.
#include <Wire.h>

const uint8_t PCA = 0x40;

void pcaEcrit(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(PCA);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

// Impulsion du canal : créneau démarré à 0, coupé à durée/20 ms × 4096 pas.
void pcaImpulsion(uint8_t canal, uint16_t microsecondes) {
  uint16_t off = (uint32_t)microsecondes * 4096UL / 20000UL;
  Wire.beginTransmission(PCA);
  Wire.write(0x06 + 4 * canal); // LED0_ON_L (auto-incrément)
  Wire.write(0x00); Wire.write(0x00);
  Wire.write(off & 0xFF); Wire.write(off >> 8);
  Wire.endTransmission();
}

void setup() {
  Serial.begin(115200);
  Wire.begin();
  pcaEcrit(0x00, 0x10);  // MODE1 : sleep pour régler le prescaler
  pcaEcrit(0xFE, 121);   // prescale 50 Hz (25 MHz / (4096 x 50) - 1)
  pcaEcrit(0x00, 0x20);  // MODE1 : réveil + auto-incrément
}

void loop() {
  pcaImpulsion(0, 500);  Serial.println("0 degres");   delay(1000);
  pcaImpulsion(0, 1500); Serial.println("90 degres");  delay(1000);
  pcaImpulsion(0, 2500); Serial.println("180 degres"); delay(1000);
}
`,
  }),

  test({
    // Batterie externe (Power bank) : même rôle électrique que l'alim de
    // laboratoire (kind 'psu', tension fixe), câblée ici sur un PCA9685 pour
    // alimenter un servo — le montage de base du futur banc araignée.
    name: 'powerbank-uno', board: 'uno', ext: 'ino',
    parts: [
      MCU('uno'),
      { id: 'Mod1', type: 'pca9685', x: 560, y: 40, attrs: { address: '0x40' } },
      { id: 'Act1', type: 'servo', x: 940, y: 40, attrs: { horn: 'single', pulsemin: '500', pulsemax: '2500' } },
      { id: 'Bat1', type: 'powerbank', x: 940, y: 260, attrs: { voltage: '5', maxcurrent: '2' } },
    ],
    wires: () => [
      w('Mod1', 'GND', 'U1', 'GND.1', 'black'),
      w('Mod1', 'VCC', 'U1', '5V', 'red'),
      w('Mod1', 'SDA', 'U1', 'A4', 'blue'),
      w('Mod1', 'SCL', 'U1', 'A5', 'yellow'),
      w('Act1', 'PWM', 'Mod1', 'PWM0', 'orange'),
      w('Act1', 'V+', 'Mod1', 'P1.5V', 'red'),
      w('Act1', 'GND', 'Mod1', 'P1.GND', 'black'),
      w('Bat1', 'V+', 'Mod1', 'V+', 'red'),
      w('Bat1', 'GND', 'Mod1', 'GND.2', 'black'),
    ],
    expect: { kind: 'pca9685', partId: 'Mod1', channel: 0, targetId: 'Act1', powered: true },
    code: `// Test batterie externe (Power bank) : le servo branché sur P1 (canal 0) du
// PCA9685 balaie 0°, 90° puis 180°, alimenté par la powerbank (V+/GND) au lieu
// de l'alim de laboratoire. En simulation, ses 4 LED de jauge s'allument.
#include <Wire.h>

const uint8_t PCA = 0x40;

void pcaEcrit(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(PCA);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

// Impulsion du canal : créneau démarré à 0, coupé à durée/20 ms × 4096 pas.
void pcaImpulsion(uint8_t canal, uint16_t microsecondes) {
  uint16_t off = (uint32_t)microsecondes * 4096UL / 20000UL;
  Wire.beginTransmission(PCA);
  Wire.write(0x06 + 4 * canal); // LED0_ON_L (auto-incrément)
  Wire.write(0x00); Wire.write(0x00);
  Wire.write(off & 0xFF); Wire.write(off >> 8);
  Wire.endTransmission();
}

void setup() {
  Serial.begin(115200);
  Wire.begin();
  pcaEcrit(0x00, 0x10);  // MODE1 : sleep pour régler le prescaler
  pcaEcrit(0xFE, 121);   // prescale 50 Hz (25 MHz / (4096 x 50) - 1)
  pcaEcrit(0x00, 0x20);  // MODE1 : réveil + auto-incrément
}

void loop() {
  pcaImpulsion(0, 500);  Serial.println("0 degres");   delay(1000);
  pcaImpulsion(0, 1500); Serial.println("90 degres");  delay(1000);
  pcaImpulsion(0, 2500); Serial.println("180 degres"); delay(1000);
}
`,
  }),

  test({
    // Patte de robot araignée (cf. patte-element.mts) : le fémur et le tibia
    // dessinés par Frank, vus en volume, avec un connecteur à deux borniers
    // 3 fils. 2 articulations indépendantes câblées chacune sur un canal du
    // PCA9685 (coxa → canal 0, patella → canal 1), alimentées par la powerbank.
    name: 'patte-uno', board: 'uno', ext: 'ino',
    parts: [
      MCU('uno'),
      { id: 'Mod1', type: 'pca9685', x: 560, y: 40, attrs: { address: '0x40' } },
      { id: 'Act1', type: 'patte', x: 940, y: 40, attrs: { pulsemin: '500', pulsemax: '2500' } },
      { id: 'Bat1', type: 'powerbank', x: 940, y: 260, attrs: { voltage: '5', maxcurrent: '2' } },
    ],
    wires: () => [
      w('Mod1', 'GND', 'U1', 'GND.1', 'black'),
      w('Mod1', 'VCC', 'U1', '5V', 'red'),
      w('Mod1', 'SDA', 'U1', 'A4', 'blue'),
      w('Mod1', 'SCL', 'U1', 'A5', 'yellow'),
      w('Act1', 'coxa.PWM', 'Mod1', 'PWM0', 'orange'),
      w('Act1', 'coxa.V+', 'Mod1', 'P1.5V', 'red'),
      w('Act1', 'coxa.GND', 'Mod1', 'P1.GND', 'black'),
      w('Act1', 'patella.PWM', 'Mod1', 'PWM1', 'orange'),
      w('Act1', 'patella.V+', 'Mod1', 'P2.5V', 'red'),
      w('Act1', 'patella.GND', 'Mod1', 'P2.GND', 'black'),
      w('Bat1', 'V+', 'Mod1', 'V+', 'red'),
      w('Bat1', 'GND', 'Mod1', 'GND.2', 'black'),
    ],
    expect: { kind: 'pca9685', partId: 'Mod1', channel: 0, targetId: 'Act1', targetPin: 'coxa.PWM', powered: true },
    code: `// Test patte d'araignée : coxa (canal 0) et patella (canal 1) du PCA9685
// balaient chacun 0°, 90° puis 180°, alimentés par la powerbank (V+/GND.2).
#include <Wire.h>

const uint8_t PCA = 0x40;

void pcaEcrit(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(PCA);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

// Impulsion du canal : créneau démarré à 0, coupé à durée/20 ms × 4096 pas.
void pcaImpulsion(uint8_t canal, uint16_t microsecondes) {
  uint16_t off = (uint32_t)microsecondes * 4096UL / 20000UL;
  Wire.beginTransmission(PCA);
  Wire.write(0x06 + 4 * canal); // LED0_ON_L (auto-incrément)
  Wire.write(0x00); Wire.write(0x00);
  Wire.write(off & 0xFF); Wire.write(off >> 8);
  Wire.endTransmission();
}

void setup() {
  Serial.begin(115200);
  Wire.begin();
  pcaEcrit(0x00, 0x10);  // MODE1 : sleep pour régler le prescaler
  pcaEcrit(0xFE, 121);   // prescale 50 Hz (25 MHz / (4096 x 50) - 1)
  pcaEcrit(0x00, 0x20);  // MODE1 : réveil + auto-incrément
}

void loop() {
  pcaImpulsion(0, 500);  pcaImpulsion(1, 500);  Serial.println("0 degres");   delay(1000);
  pcaImpulsion(0, 1500); pcaImpulsion(1, 1500); Serial.println("90 degres");  delay(1000);
  pcaImpulsion(0, 2500); pcaImpulsion(1, 2500); Serial.println("180 degres"); delay(1000);
}
`,
  }),

  test({
    name: 'lcd-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Aff1', type: 'lcd', x: 560, y: 60, attrs: { pins: 'i2c', address: '0x27', cols: '16', rows: '2', lcdSize: '16x2' } }],
    wires: () => [
      w('Aff1', 'GND', 'U1', 'GND.1', 'black'),
      w('Aff1', 'VCC', 'U1', '5V', 'red'),
      w('Aff1', 'SDA', 'U1', 'A4', 'blue'),
      w('Aff1', 'SCL', 'U1', 'A5', 'yellow'),
    ],
    expect: { kind: 'i2c-part', partId: 'Aff1' },
    code: `// Test LCD 16x2 en I2C (adresse 0x27) : texte + compteur.
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);
int compteur = 0;

void setup() {
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Kablix LCD I2C");
}

void loop() {
  lcd.setCursor(0, 1);
  lcd.print("compteur: ");
  lcd.print(compteur++);
  delay(500);
}
`,
  }),

  test({
    name: 'oled-ssd1306-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Aff1', type: 'oled-ssd1306', x: 600, y: 70, attrs: { pins: 'i2c' } }],
    wires: () => [
      w('Aff1', 'GND', 'U1', 'GND.1', 'black'),
      w('Aff1', 'VDD', 'U1', '3.3V', 'red'),
      w('Aff1', 'SDA', 'U1', 'A4', 'blue'),
      w('Aff1', 'SCL', 'U1', 'A5', 'yellow'),
    ],
    expect: { kind: 'i2c-part', partId: 'Aff1' },
    code: `// Test OLED SSD1306 en I2C (0x3C) : cadre, texte et diagonale.
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 ecran(128, 64, &Wire, -1);

void setup() {
  ecran.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  ecran.clearDisplay();
  ecran.drawRect(0, 0, 128, 64, SSD1306_WHITE);
  ecran.drawLine(0, 63, 127, 0, SSD1306_WHITE);
  ecran.setTextColor(SSD1306_WHITE);
  ecran.setTextSize(2);
  ecran.setCursor(16, 24);
  ecran.print("Kablix");
  ecran.display();
}

void loop() {
  delay(1000);
}
`,
  }),

  test({
    name: 'ili9341-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Aff1', type: 'ili9341', x: 560, y: 40 }],
    wires: () => [
      w('Aff1', 'VCC', 'U1', '5V', 'red'),
      w('Aff1', 'GND', 'U1', 'GND.1', 'black'),
      w('Aff1', 'CS', 'U1', '10', 'yellow'),
      w('Aff1', 'RST', 'U1', '8', 'gray'),
      w('Aff1', 'D/C', 'U1', '9', 'orange'),
      w('Aff1', 'MOSI', 'U1', '11', 'blue'),
      w('Aff1', 'SCK', 'U1', '13', 'green'),
      w('Aff1', 'MISO', 'U1', '12', 'purple'),
      w('Aff1', 'LED', 'U1', '3.3V', 'red'),
    ],
    expect: { kind: 'spi-device', partId: 'Aff1', dcPin: '9', csPin: '10' },
    code: `// Test écran TFT ILI9341 (SPI) : aplats de couleur + texte.
#include <Adafruit_ILI9341.h>

Adafruit_ILI9341 tft(10, 9, 8);   // CS, D/C, RST

void setup() {
  tft.begin();
  tft.fillScreen(ILI9341_RED);
  delay(300);
  tft.fillScreen(ILI9341_GREEN);
  delay(300);
  tft.fillScreen(ILI9341_BLUE);
  delay(300);
  tft.fillScreen(ILI9341_BLACK);
  tft.setTextColor(ILI9341_WHITE);
  tft.setTextSize(3);
  tft.setCursor(40, 140);
  tft.print("Kablix");
}

void loop() {
  delay(1000);
}
`,
  }),

  test({
    name: 'microsd-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Mod1', type: 'microsd', x: 620, y: 90 }],
    wires: () => [
      w('Mod1', 'VCC', 'U1', '5V', 'red'),
      w('Mod1', 'GND', 'U1', 'GND.1', 'black'),
      w('Mod1', 'CS', 'U1', '4', 'yellow'),
      w('Mod1', 'DI', 'U1', '11', 'blue'),
      w('Mod1', 'DO', 'U1', '12', 'purple'),
      w('Mod1', 'SCK', 'U1', '13', 'green'),
    ],
    expect: { kind: 'spi-device', partId: 'Mod1', dcPin: null, csPin: '4' },
    code: `// Test carte microSD (SPI) : SD.begin doit réussir (carte détectée).
// Note : pas de système de fichiers FAT préchargé, open() échouera — c'est normal.
#include <SD.h>

void setup() {
  Serial.begin(115200);
  if (SD.begin(4)) {
    Serial.println("Carte SD detectee : init OK");
  } else {
    Serial.println("ECHEC de l'init SD");
  }
}

void loop() {
  delay(1000);
}
`,
  }),

  test({
    name: 'neopixel-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'L1', type: 'neopixel', x: 620, y: 100 }],
    wires: () => [
      w('L1', 'VDD', 'U1', '5V', 'red'),
      w('L1', 'VSS', 'U1', 'GND.1', 'black'),
      w('L1', 'DIN', 'U1', '6', 'green'),
    ],
    expect: { kind: 'neopixel', partId: 'L1', mcuPin: '6', count: 1 },
    code: `// Test NeoPixel (1 pixel WS2812) : rouge, vert, bleu en boucle.
#include <Adafruit_NeoPixel.h>

Adafruit_NeoPixel pixel(1, 6, NEO_GRB + NEO_KHZ800);

void setup() {
  pixel.begin();
  Serial.begin(115200);
}

void couleur(uint32_t c, const char* nom) {
  pixel.setPixelColor(0, c);
  pixel.show();
  Serial.println(nom);
  delay(600);
}

void loop() {
  couleur(pixel.Color(255, 0, 0), "Rouge");
  couleur(pixel.Color(0, 255, 0), "Vert");
  couleur(pixel.Color(0, 0, 255), "Bleu");
}
`,
  }),

  test({
    name: 'neopixel-matrix-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'L1', type: 'neopixel-matrix', x: 600, y: 50, attrs: { rows: '8', cols: '8' } }],
    wires: () => [
      w('L1', 'VCC', 'U1', '5V', 'red'),
      w('L1', 'GND', 'U1', 'GND.1', 'black'),
      w('L1', 'DIN', 'U1', '6', 'green'),
    ],
    expect: { kind: 'neopixel', partId: 'L1', mcuPin: '6', count: 64 },
    code: `// Test matrice NeoPixel 8x8 (64 pixels) : diagonale + dégradé.
#include <Adafruit_NeoPixel.h>

Adafruit_NeoPixel matrice(64, 6, NEO_GRB + NEO_KHZ800);

void setup() {
  matrice.begin();
  matrice.setBrightness(60);
  for (int y = 0; y < 8; y++) {
    for (int x = 0; x < 8; x++) {
      if (x == y) matrice.setPixelColor(y * 8 + x, matrice.Color(255, 255, 255));
      else matrice.setPixelColor(y * 8 + x, matrice.Color(x * 32, 0, y * 32));
    }
  }
  matrice.show();
}

void loop() {
  delay(1000);
}
`,
  }),

  test({
    name: 'led-ring-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'L1', type: 'led-ring', x: 620, y: 60, attrs: { pixels: '16' } }],
    wires: () => [
      w('L1', 'VCC', 'U1', '5V', 'red'),
      w('L1', 'GND', 'U1', 'GND.1', 'black'),
      w('L1', 'DIN', 'U1', '6', 'green'),
    ],
    expect: { kind: 'neopixel', partId: 'L1', mcuPin: '6', count: 16 },
    code: `// Test anneau NeoPixel (16 pixels) : chenillard bleu.
#include <Adafruit_NeoPixel.h>

Adafruit_NeoPixel anneau(16, 6, NEO_GRB + NEO_KHZ800);

void setup() {
  anneau.begin();
  anneau.setBrightness(80);
}

void loop() {
  for (int i = 0; i < 16; i++) {
    anneau.clear();
    anneau.setPixelColor(i, anneau.Color(0, 80, 255));
    anneau.show();
    delay(100);
  }
}
`,
  }),

  test({
    name: 'ntc-temp-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Capt1', type: 'ntc-temp', x: 620, y: 90, attrs: { temperature: '25' } }],
    wires: () => [
      w('Capt1', 'VCC', 'U1', '5V', 'red'),
      w('Capt1', 'GND', 'U1', 'GND.1', 'black'),
      w('Capt1', 'OUT', 'U1', 'A0', 'green'),
    ],
    expect: { kind: 'analog-source', partId: 'Capt1', mcuPin: 'A0' },
    code: `// Test capteur de température NTC : lecture analogique sur A0
// (en simulation, la température se règle avec le curseur du capteur).
void setup() {
  Serial.begin(115200);
}

void loop() {
  Serial.print("A0 = ");
  Serial.println(analogRead(A0));
  delay(300);
}
`,
  }),

  // Le test `rv-uno` a été retiré de la spec en v2026.8.25, à la demande de
  // Frank, après qu'il ait supprimé ses fichiers en v2026.8.3. Les trois
  // résistances variables nues (LDR, CTN, CTP) restent éprouvées côté Pico par
  // `rv-pico` — même montage, mêmes lois — et le montage câblé à la main par
  // Frank est toujours là, intact, dans `Arduino/rv/rv.projix`.

  test({
    name: 'gas-sensor-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Capt1', type: 'gas-sensor', x: 620, y: 90, attrs: { sensitivity: '50' } }],
    wires: () => [
      w('Capt1', 'VCC', 'U1', '5V', 'red'),
      w('Capt1', 'GND', 'U1', 'GND.1', 'black'),
      w('Capt1', 'AOUT', 'U1', 'A0', 'green'),
      w('Capt1', 'DOUT', 'U1', '2', 'yellow'),
    ],
    expect: { kind: 'ao-do', partId: 'Capt1', analog: 'A0', digital: '2' },
    code: `// Test capteur de gaz (MQ) : AOUT analogique + DOUT numérique (actif bas).
void setup() {
  pinMode(2, INPUT);
  Serial.begin(115200);
}

void loop() {
  Serial.print("AOUT = ");
  Serial.print(analogRead(A0));
  Serial.print("  DOUT = ");
  Serial.println(digitalRead(2) == LOW ? "GAZ DETECTE" : "rien");
  delay(300);
}
`,
  }),

  test({
    name: 'heartbeat-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Capt1', type: 'heartbeat', x: 620, y: 90, attrs: { bpm: '72' } }],
    wires: () => [
      w('Capt1', 'VCC', 'U1', '5V', 'red'),
      w('Capt1', 'GND', 'U1', 'GND.1', 'black'),
      w('Capt1', 'OUT', 'U1', 'A0', 'green'),
    ],
    expect: { kind: 'analog-source', partId: 'Capt1', mcuPin: 'A0' },
    code: `// Test capteur de pouls : le signal analogique bat au rythme cardiaque.
void setup() {
  Serial.begin(115200);
}

void loop() {
  int v = analogRead(A0);
  Serial.print("pouls = ");
  Serial.println(v);
  delay(50);
}
`,
  }),

  test({
    name: 'flame-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Capt1', type: 'flame', x: 620, y: 90, attrs: { sensitivity: '50' } }],
    wires: () => [
      w('Capt1', 'VCC', 'U1', '5V', 'red'),
      w('Capt1', 'GND', 'U1', 'GND.1', 'black'),
      w('Capt1', 'AOUT', 'U1', 'A0', 'green'),
      w('Capt1', 'DOUT', 'U1', '2', 'yellow'),
    ],
    expect: { kind: 'ao-do', partId: 'Capt1', analog: 'A0', digital: '2' },
    code: `// Test capteur de flamme : AOUT baisse quand la flamme approche, DOUT actif bas.
void setup() {
  pinMode(2, INPUT);
  Serial.begin(115200);
}

void loop() {
  Serial.print("AOUT = ");
  Serial.print(analogRead(A0));
  Serial.print("  DOUT = ");
  Serial.println(digitalRead(2) == LOW ? "FLAMME !" : "rien");
  delay(300);
}
`,
  }),

  test({
    name: 'sound-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Capt1', type: 'sound', x: 620, y: 90, attrs: { sensitivity: '50' } }],
    wires: () => [
      w('Capt1', 'VCC', 'U1', '5V', 'red'),
      w('Capt1', 'GND', 'U1', 'GND.1', 'black'),
      w('Capt1', 'AOUT', 'U1', 'A0', 'green'),
      w('Capt1', 'DOUT', 'U1', '2', 'yellow'),
    ],
    expect: { kind: 'ao-do', partId: 'Capt1', analog: 'A0', digital: '2' },
    code: `// Test capteur de son : AOUT analogique + DOUT numérique (actif bas).
void setup() {
  pinMode(2, INPUT);
  Serial.begin(115200);
}

void loop() {
  Serial.print("AOUT = ");
  Serial.print(analogRead(A0));
  Serial.print("  DOUT = ");
  Serial.println(digitalRead(2) == LOW ? "SON DETECTE" : "silence");
  delay(300);
}
`,
  }),

  test({
    name: 'hcsr04-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Capt1', type: 'hcsr04', x: 600, y: 80, attrs: { distancemin: '2', distancemax: '400' } }],
    wires: () => [
      w('Capt1', 'VCC', 'U1', '5V', 'red'),
      w('Capt1', 'TRIG', 'U1', '2', 'yellow'),
      w('Capt1', 'ECHO', 'U1', '3', 'green'),
      w('Capt1', 'GND', 'U1', 'GND.1', 'black'),
    ],
    expect: { kind: 'ultrasonic', partId: 'Capt1', trig: '2', echo: '3' },
    code: `// Test HC-SR04 (ultrason) : impulsion TRIG puis mesure d'ECHO (~58 µs/cm).
const int TRIG = 2, ECHO = 3;

void setup() {
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  Serial.begin(115200);
}

void loop() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long duree = pulseIn(ECHO, HIGH, 30000UL);
  Serial.print("distance = ");
  Serial.print(duree / 58);
  Serial.println(" cm");
  delay(400);
}
`,
  }),

  test({
    name: 'dht22-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Capt1', type: 'dht22', x: 620, y: 90, attrs: { temperature: '22', humidity: '50' } }],
    wires: () => [
      w('Capt1', 'VCC', 'U1', '5V', 'red'),
      w('Capt1', 'DATA', 'U1', '2', 'green'),
      w('Capt1', 'GND', 'U1', 'GND.1', 'black'),
    ],
    expect: { kind: 'dht22', partId: 'Capt1', mcuPin: '2' },
    code: `// Test DHT22 : température et humidité sur la ligne DATA (1-wire).
#include <DHT.h>

DHT dht(2, DHT22);

void setup() {
  Serial.begin(115200);
  dht.begin();
}

void loop() {
  delay(2100);   // le DHT22 ne répond qu'une fois toutes les 2 s
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (isnan(t) || isnan(h)) {
    Serial.println("lecture ratee");
    return;
  }
  Serial.print("T = ");
  Serial.print(t);
  Serial.print(" C   H = ");
  Serial.print(h);
  Serial.println(" %");
}
`,
  }),

  test({
    name: 'diode-uno', board: 'uno', ext: 'ino',
    parts: [
      MCU('uno'),
      { id: 'D1', type: 'diode', x: 400, y: 60 },
      { id: 'R1', type: 'resistor', x: 500, y: 60, attrs: { value: '220' } },
      { id: 'L1', type: 'led', x: 600, y: 60, attrs: { color: 'green' } },
      { id: 'D2', type: 'diode', x: 400, y: 160 },
      { id: 'R2', type: 'resistor', x: 500, y: 160, attrs: { value: '220' } },
      { id: 'L2', type: 'led', x: 600, y: 160, attrs: { color: 'red' } },
    ],
    wires: () => [
      // Branche du haut : diode dans le bon sens (anode côté broche 8).
      w('D1', 'A', 'U1', '8', 'green'),
      w('D1', 'K', 'R1', '1', 'green'),
      w('R1', '2', 'L1', 'A', 'green'),
      w('L1', 'C', 'U1', 'GND.1', 'black'),
      // Branche du bas : diode À L'ENVERS (cathode côté broche 9) → elle bloque.
      w('D2', 'K', 'U1', '9', 'orange'),
      w('D2', 'A', 'R2', '1', 'orange'),
      w('R2', '2', 'L2', 'A', 'orange'),
      w('L2', 'C', 'U1', 'GND.2', 'black'),
    ],
    expect: { kind: 'diode', ledOn: 'L1', ledOff: 'L2', drop: 0.6 },
    code: `// Test diode : les deux broches passent au niveau haut en meme temps.
// Seule la LED verte s'allume — la diode de la branche rouge est montee a
// l'envers (cathode cote broche 9) et bloque le passage du courant.
const int BRANCHE_PASSANTE = 8;
const int BRANCHE_BLOQUEE = 9;

void setup() {
  pinMode(BRANCHE_PASSANTE, OUTPUT);
  pinMode(BRANCHE_BLOQUEE, OUTPUT);
}

void loop() {
  digitalWrite(BRANCHE_PASSANTE, HIGH);
  digitalWrite(BRANCHE_BLOQUEE, HIGH);
  delay(1000);
  digitalWrite(BRANCHE_PASSANTE, LOW);
  digitalWrite(BRANCHE_BLOQUEE, LOW);
  delay(1000);
}
`,
  }),

  // Trois branches RC EN PARALLÈLE sur la même broche de commande : un
  // condensateur n'est pas une arête résistive, chaque branche est donc un nœud
  // indépendant et la tension d'une armature ne peut pas fuir vers la voisine.
  // Seule la constante de temps change (0,1 s / 0,33 s / 1 s) — c'est la
  // démonstration : trois exponentielles étagées sur le même graphe.
  test({
    name: 'condo-uno', board: 'uno', ext: 'ino',
    parts: [
      MCU('uno'),
      { id: 'R1', type: 'resistor', x: 420, y: 60, attrs: { value: '100000' } },
      { id: 'C1', type: 'condo-np', x: 560, y: 60, attrs: { ctype: 'np', value: '1e-6', vmax: '63' } },
      { id: 'R2', type: 'resistor', x: 420, y: 180, attrs: { value: '33000' } },
      { id: 'C2', type: 'condo-np', x: 560, y: 180, attrs: { ctype: 'p', value: '1e-5', vmax: '16' } },
      { id: 'R3', type: 'resistor', x: 420, y: 300, attrs: { value: '10000' } },
      { id: 'C3', type: 'condo-np', x: 560, y: 300, attrs: { ctype: 'chem', value: '1e-4', vmax: '16' } },
    ],
    wires: () => [
      w('R1', '1', 'U1', '8', 'green'),
      w('R1', '2', 'C1', '1', 'green'),
      w('C1', '1', 'U1', 'A0', 'blue'),
      w('C1', '2', 'U1', 'GND.1', 'black'),
      w('R2', '1', 'U1', '8', 'green'),
      w('R2', '2', 'C2', '1', 'green'),
      w('C2', '1', 'U1', 'A1', 'blue'),
      w('C2', '2', 'U1', 'GND.2', 'black'),
      w('R3', '1', 'U1', '8', 'green'),
      w('R3', '2', 'C3', '1', 'green'),
      w('C3', '1', 'U1', 'A2', 'blue'),
      w('C3', '2', 'U1', 'GND.3', 'black'),
    ],
    // RC = R × C, la sortie du MCU ajoutant ses 25 Ω : 0,1 s / 0,33 s / 1 s.
    // Charge pleine à 5 RC, soit 5 s pour la plus lente des trois.
    expect: {
      kind: 'capacitor', drivePin: '8', drive: 'high', volts: 5,
      caps: [
        { partId: 'C1', target: 5, tau: 0.1, mcuPins: ['A0'] },
        { partId: 'C2', target: 5, tau: 0.33, mcuPins: ['A1'] },
        { partId: 'C3', target: 5, tau: 1, mcuPins: ['A2'] },
      ],
    },
    code: `// Trois circuits RC sur la MEME broche de commande. Seule la constante de
// temps RC change : 100 kOhm x 1 uF = 0,1 s (film), 33 kOhm x 10 uF = 0,33 s
// (tantale), 10 kOhm x 100 uF = 1 s (chimique). A un RC la tension a fait
// 63 % du chemin, a 5 RC la charge est pleine — d'ou les 5 s par phase.
//
// Le TRACEUR DE COURBES affiche les trois exponentielles SANS une seule ligne
// de code : la tension du condensateur est posee sur A0, A1 et A2, et toute
// tension posee sur une entree analogique est tracee par une sonde interne.
// Le moniteur serie ne sert ici qu'a relire les memes valeurs en clair.
const int CHARGE = 8;
const int MESURE[3] = { A0, A1, A2 };

void phase(int niveau, const char *nom) {
  digitalWrite(CHARGE, niveau);
  for (int i = 0; i < 10; i++) {   // 10 x 500 ms = 5 s = 5 RC du plus lent
    delay(500);
    Serial.print(nom);
    for (int c = 0; c < 3; c++) {
      Serial.print("   ");
      Serial.print(analogRead(MESURE[c]) * 5.0 / 1023.0, 2);
      Serial.print(" V");
    }
    Serial.println();
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(CHARGE, OUTPUT);
  Serial.println("          film(A0) tantale(A1) chimique(A2)");
}

void loop() {
  phase(HIGH, "charge  ");
  phase(LOW, "decharge");
}
`,
  }),

  test({
    name: 'dht11-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Capt1', type: 'dht11', x: 620, y: 90, attrs: { temperature: '22', humidity: '50' } }],
    wires: () => [
      w('Capt1', 'VCC', 'U1', '5V', 'red'),
      w('Capt1', 'DATA', 'U1', '2', 'green'),
      w('Capt1', 'GND', 'U1', 'GND.1', 'black'),
    ],
    expect: { kind: 'dht22', partId: 'Capt1', mcuPin: '2', model: 'dht11' },
    code: `// Test DHT11 : meme protocole 1-wire que le DHT22, mais des valeurs ENTIERES
// (pas de dixieme), 20 a 90 % HR et 0 a 50 degres C.
#include <DHT.h>

DHT dht(2, DHT11);

void setup() {
  Serial.begin(115200);
  dht.begin();
}

void loop() {
  delay(1100);   // le DHT11 ne repond qu'une fois par seconde
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (isnan(t) || isnan(h)) {
    Serial.println("lecture ratee");
    return;
  }
  Serial.print("T = ");
  Serial.print(t);
  Serial.print(" C   H = ");
  Serial.print(h);
  Serial.println(" %");
}
`,
  }),

  test({
    name: 'ventilo-uno', board: 'uno', ext: 'ino',
    parts: [
      MCU('uno'),
      { id: 'Alim1', type: 'alim', x: 620, y: 300, attrs: { voltage: '5', maxcurrent: '1' } },
      { id: 'Act1', type: 'ventilo', x: 620, y: 40, attrs: { voltage: '5', current: '0.85' } },
      { id: 'Act2', type: 'ventilo', x: 900, y: 40, attrs: { voltage: '5', current: '0.85' } },
    ],
    wires: () => [
      // Alimente par l'alim de laboratoire (5 V, 1 A) : il tourne.
      w('Act1', '+', 'Alim1', 'V+', 'red'),
      w('Act1', '-', 'Alim1', 'GND', 'black'),
      // Alimente par une sortie Arduino (40 mA) : il ne demarre jamais.
      w('Act2', '+', 'U1', '9', 'orange'),
      w('Act2', '-', 'U1', 'GND.2', 'black'),
    ],
    expect: { kind: 'fan', spins: 'Act1', starved: 'Act2' },
    code: `// Test ventilateur. Le premier tourne : il est branche sur l'alimentation de
// laboratoire (5 V, 1 A), qui fournit largement ses 850 mA.
// Le second est cable sur la broche 9 en PWM : il ne demarre JAMAIS, une sortie
// Arduino ne debite que 40 mA. En vrai comme en simulation, il faut un
// transistor (ou un MOSFET) commande par la broche pour piloter un moteur.
const int COMMANDE = 9;

void setup() {
  Serial.begin(115200);
  pinMode(COMMANDE, OUTPUT);
  Serial.println("Le ventilateur de la broche 9 ne tournera pas : courant insuffisant.");
}

void loop() {
  for (int v = 0; v <= 255; v += 5) {
    analogWrite(COMMANDE, v);
    delay(40);
  }
  for (int v = 255; v >= 0; v -= 5) {
    analogWrite(COMMANDE, v);
    delay(40);
  }
}
`,
  }),

  test({
    name: 'moteur-dc-uno', board: 'uno', ext: 'ino',
    parts: [
      MCU('uno'),
      { id: 'Alim1', type: 'alim', x: 620, y: 460, attrs: { voltage: '5', maxcurrent: '1' } },
      { id: 'R1', type: 'resistor', x: 300, y: 180, attrs: { value: '1000' } },
      { id: 'T1', type: 'pn2222a', x: 440, y: 200 },
      { id: 'D1', type: 'diode', x: 620, y: 180, attrs: { vf: '0.6' } },
      { id: 'Act1', type: 'moteur-dc', x: 620, y: 40, attrs: { voltage: '5', current: '0.1' } },
      { id: 'Act2', type: 'moteur-dc', x: 1160, y: 40, attrs: { voltage: '5', current: '0.1' } },
      { id: 'R2', type: 'resistor', x: 300, y: 300, attrs: { value: '1000' } },
      { id: 'T2', type: 'pn2222a', x: 880, y: 200 },
      { id: 'Act3', type: 'moteur-dc', x: 900, y: 40, attrs: { voltage: '5', current: '0.1' } },
    ],
    wires: () => [
      // Montage correct : broche 9 -> base, moteur sur l'alim, diode de roue
      // libre en travers (cathode au +). Il tourne.
      w('R1', '1', 'U1', '9', 'green'),
      w('R1', '2', 'T1', 'B', 'green'),
      w('T1', 'E', 'U1', 'GND.1', 'black'),
      w('T1', 'C', 'Act1', '2', 'blue'),
      w('Act1', '1', 'Alim1', 'V+', 'red'),
      w('Alim1', 'GND', 'U1', 'GND.2', 'black'),
      w('D1', 'K', 'Act1', '1', 'purple'),
      w('D1', 'A', 'Act1', '2', 'purple'),
      // Moteur branche EN DIRECT sur une broche : 40 mA contre 100 mA demandes.
      w('Act2', '1', 'U1', '11', 'orange'),
      w('Act2', '2', 'U1', 'GND.3', 'black'),
      // Meme montage que le premier, mais SANS diode de roue libre : c'est le
      // transistor qui explose a la coupure.
      w('R2', '1', 'U1', '10', 'orange'),
      w('R2', '2', 'T2', 'B', 'orange'),
      w('T2', 'E', 'Alim1', 'GND', 'black'),
      w('T2', 'C', 'Act3', '2', 'blue'),
      w('Act3', '1', 'Alim1', 'V+', 'red'),
    ],
    expect: {
      kind: 'motor',
      steps: [
        {
          high: ['9', '10'],
          motors: {
            Act1: { fault: 'none', spins: true },
            Act2: { fault: 'starved' },
            Act3: { fault: 'no-diode', blownTransistorId: 'T2' },
          },
        },
        { high: [], motors: { Act1: { powered: false }, Act3: { powered: false } } },
      ],
    },
    code: `// Test moteur a courant continu. Trois moteurs 5 V / 100 mA :
//   - broche 9  : commande par un PN2222A, alimentation de laboratoire et diode
//     de roue libre en travers du moteur -> il tourne, tout est correct ;
//   - broche 11 : moteur branche EN DIRECT sur la broche. Une sortie Arduino ne
//     debite que 40 mA contre les 100 mA demandes : il ne demarre JAMAIS ;
//   - broche 10 : meme montage que le premier mais SANS diode de roue libre.
//     Un moteur est une bobine : couper son courant renvoie une surtension qui
//     detruit le transistor. Kablix le fait exploser.
const int BON = 9;
const int SANS_DIODE = 10;
const int EN_DIRECT = 11;

void setup() {
  Serial.begin(115200);
  pinMode(BON, OUTPUT);
  pinMode(SANS_DIODE, OUTPUT);
  pinMode(EN_DIRECT, OUTPUT);
  Serial.println("Broche 11 : moteur en direct, courant insuffisant.");
  Serial.println("Broche 10 : pas de diode de roue libre, le transistor va lacher.");
}

void loop() {
  // Montee et descente en PWM : la vitesse suit le rapport cyclique.
  for (int v = 0; v <= 255; v += 5) {
    analogWrite(BON, v);
    analogWrite(EN_DIRECT, v);
    delay(40);
  }
  for (int v = 255; v >= 0; v -= 5) {
    analogWrite(BON, v);
    analogWrite(EN_DIRECT, v);
    delay(40);
  }
  // Tout ou rien sur la branche sans diode : c'est la COUPURE qui tue.
  digitalWrite(SANS_DIODE, HIGH);
  delay(1000);
  digitalWrite(SANS_DIODE, LOW);
  delay(1000);
}
`,
  }),

  test({
    name: 'pn2222a-uno', board: 'uno', ext: 'ino',
    parts: [
      MCU('uno'),
      { id: 'Alim1', type: 'alim', x: 620, y: 380, attrs: { voltage: '5', maxcurrent: '1' } },
      { id: 'R1', type: 'resistor', x: 300, y: 180, attrs: { value: '1000' } },
      { id: 'T1', type: 'pn2222a', x: 440, y: 200 },
      { id: 'Act1', type: 'ventilo', x: 620, y: 40, attrs: { voltage: '5', current: '0.12' } },
      { id: 'R2', type: 'resistor', x: 300, y: 280, attrs: { value: '10000' } },
      { id: 'T2', type: 'pn2222a', x: 880, y: 200 },
      { id: 'Act2', type: 'ventilo', x: 900, y: 40, attrs: { voltage: '5', current: '0.12' } },
    ],
    wires: () => [
      // Base bien attaquee (1 kOhm) : Ib = 4,3 mA, donc Ic max = 35 x 4,3 = 150 mA.
      w('R1', '1', 'U1', '9', 'green'),
      w('R1', '2', 'T1', 'B', 'green'),
      w('T1', 'E', 'U1', 'GND.1', 'black'),
      w('T1', 'C', 'Act1', '-', 'blue'),
      w('Act1', '+', 'Alim1', 'V+', 'red'),
      w('Alim1', 'GND', 'U1', 'GND.2', 'black'),
      // Base a peine attaquee (10 kOhm) : Ic max = 15 mA, le ventilateur cale.
      w('R2', '1', 'U1', '10', 'orange'),
      w('R2', '2', 'T2', 'B', 'orange'),
      w('T2', 'E', 'U1', 'GND.3', 'black'),
      w('T2', 'C', 'Act2', '-', 'blue'),
      w('Act2', '+', 'Alim1', 'V+', 'red'),
    ],
    expect: {
      kind: 'transistor',
      steps: [
        { high: ['9', '10'], on: { T1: 0.1505, T2: 0.01505 }, fanAmps: 0.12, fanSpins: ['Act1'], fanStalls: ['Act2'] },
        { high: [], off: ['T1', 'T2'], fanAmps: 0.12, fanStalls: ['Act1'] },
      ],
    },
    code: `// Test transistor PN2222A : le meme ventilateur 5 V / 120 mA sur les deux
// branches, commande par la broche 9 (base via 1 kOhm) et par la broche 10
// (base via 10 kOhm). Le transistor ne transmet que Gain x Ib :
//   broche 9  : Ib = (5 - 0,7) / 1000  = 4,3 mA  -> Ic max = 35 x 4,3  = 150 mA
//   broche 10 : Ib = (5 - 0,7) / 10000 = 0,43 mA -> Ic max = 35 x 0,43 = 15 mA
// Le premier ventilateur tourne, le second ne demarre JAMAIS : on vise la
// SATURATION, sinon le montage aval ne marche pas.
const int SATURE = 9;
const int PAS_SATURE = 10;

void setup() {
  Serial.begin(115200);
  pinMode(SATURE, OUTPUT);
  pinMode(PAS_SATURE, OUTPUT);
  Serial.println("Broche 10 : base sous-attaquee, son ventilateur ne tournera pas.");
}

void loop() {
  digitalWrite(SATURE, HIGH);
  digitalWrite(PAS_SATURE, HIGH);
  delay(2000);
  digitalWrite(SATURE, LOW);
  digitalWrite(PAS_SATURE, LOW);
  delay(1000);
}
`,
  }),

  test({
    name: 'transistor-uno', board: 'uno', ext: 'ino',
    parts: [
      MCU('uno'),
      { id: 'Alim1', type: 'alim', x: 620, y: 380, attrs: { voltage: '5', maxcurrent: '1' } },
      { id: 'R1', type: 'resistor', x: 300, y: 180, attrs: { value: '10000' } },
      // Deux modeles choisis dans le selecteur : meme boitier, meme cablage par
      // NOM (E/B/C), mais brochages opposes — le BC547 est C-B-E, le 2N3904
      // E-B-C. Seul le GAIN change ce que le montage sait faire.
      {
        id: 'T1', type: 'transistor', x: 440, y: 200,
        attrs: {
          pkg: 'to92', symbol: 'npn', text: 'BC\n547', named: '1', ref: 'BC547',
          e: '3', b: '2', c: '1', gain: '200', vcemax: '45', icmax: '0.1',
        },
      },
      { id: 'Act1', type: 'ventilo', x: 620, y: 40, attrs: { voltage: '5', current: '0.06' } },
      { id: 'R2', type: 'resistor', x: 300, y: 280, attrs: { value: '10000' } },
      {
        id: 'T2', type: 'transistor', x: 880, y: 200,
        attrs: {
          pkg: 'to92', symbol: 'npn', text: '2N\n3904', named: '1', ref: '2N3904',
          e: '1', b: '2', c: '3', gain: '100', vcemax: '40', icmax: '0.2',
        },
      },
      { id: 'Act2', type: 'ventilo', x: 900, y: 40, attrs: { voltage: '5', current: '0.06' } },
      // Troisieme branche : la moitie PNP du selecteur (8 references sur 16), que
      // les deux NPN ne montraient pas. Emetteur au +, LED sous le collecteur,
      // base tiree vers le BAS pour conduire — logique inversee.
      { id: 'R3', type: 'resistor', x: 300, y: 560, attrs: { value: '4700' } },
      {
        id: 'T3', type: 'transistor', x: 440, y: 580,
        attrs: {
          pkg: 'to92', symbol: 'pnp', text: 'BC\n557', named: '1', ref: 'BC557',
          e: '3', b: '2', c: '1', gain: '200', vcemax: '45', icmax: '0.1',
        },
      },
      { id: 'L1', type: 'led', x: 620, y: 580, attrs: { color: 'yellow' } },
      { id: 'R4', type: 'resistor', x: 760, y: 580, attrs: { value: '220' } },
      // Quatrieme branche : DARLINGTON. Meme ventilateur, mais une resistance de
      // base DIX FOIS plus grande (100 kOhm) — un NPN ordinaire n'y arriverait
      // pas, son gain de 30 000 si.
      { id: 'R5', type: 'resistor', x: 300, y: 760, attrs: { value: '100000' } },
      {
        id: 'T4', type: 'transistor', x: 440, y: 780,
        attrs: {
          pkg: 'to92', symbol: 'darlington-npn', schema: 'darlington-npn',
          text: 'BC\n517', named: '1', ref: 'BC517',
          e: '3', b: '2', c: '1', gain: '30000', vcemax: '30', icmax: '0.4',
        },
      },
      { id: 'Act3', type: 'ventilo', x: 620, y: 740, attrs: { voltage: '5', current: '0.06' } },
      // Cinquieme branche : MOSFET canal N, commande en TENSION. Sa grille est
      // isolee : elle se cable DIRECTEMENT sur la broche, sans resistance.
      {
        id: 'T5', type: 'transistor', x: 880, y: 780,
        attrs: {
          pkg: 'to92', symbol: 'nmos', schema: 'nmos-d',
          text: 'BS\n170', named: '1', ref: 'BS170',
          s: '3', g: '2', d: '1', gain: '0', rdson: '2.5', vcemax: '60', icmax: '0.5',
        },
      },
      { id: 'L2', type: 'led', x: 1040, y: 780, attrs: { color: 'green' } },
      { id: 'R6', type: 'resistor', x: 1180, y: 780, attrs: { value: '220' } },
    ],
    wires: () => [
      // BC547 (gain 200) : Ib = 0,43 mA, donc Ic max = 200 x 0,43 = 86 mA.
      w('R1', '1', 'U1', '9', 'green'),
      w('R1', '2', 'T1', 'B', 'green'),
      w('T1', 'E', 'U1', 'GND.1', 'black'),
      w('T1', 'C', 'Act1', '-', 'blue'),
      w('Act1', '+', 'Alim1', 'V+', 'red'),
      w('Alim1', 'GND', 'U1', 'GND.2', 'black'),
      // 2N3904 (gain 100) : meme base, moitie moins de courant — 43 mA.
      w('R2', '1', 'U1', '10', 'orange'),
      w('R2', '2', 'T2', 'B', 'orange'),
      w('T2', 'E', 'U1', 'GND.3', 'black'),
      w('T2', 'C', 'Act2', '-', 'blue'),
      w('Act2', '+', 'Alim1', 'V+', 'red'),
      // BC557 (PNP, C-B-E comme le BC547) : emetteur au 5 V, LED a la masse.
      w('T3', 'E', 'U1', '5V', 'red'),
      w('R3', '1', 'U1', '11', 'purple'),
      w('R3', '2', 'T3', 'B', 'purple'),
      w('T3', 'C', 'L1', 'A', 'blue'),
      w('L1', 'C', 'R4', '1', 'blue'),
      w('R4', '2', 'Alim1', 'GND', 'black'),
      // BC517 (darlington, gain 30 000) : Ib = (5 - 1,4) / 100k = 36 uA, donc
      // Ic max = 1,08 A — le ventilateur demarre malgre la base tres peu attaquee.
      w('R5', '1', 'U1', '6', 'brown'),
      w('R5', '2', 'T4', 'B', 'brown'),
      w('T4', 'E', 'Alim1', 'GND', 'black'),
      w('T4', 'C', 'Act3', '-', 'blue'),
      w('Act3', '+', 'Alim1', 'V+', 'red'),
      // BS170 (MOSFET) : grille DIRECTEMENT sur la broche, aucun courant n'y entre.
      w('T5', 'G', 'U1', '5', 'gray'),
      w('T5', 'S', 'Alim1', 'GND', 'black'),
      w('T5', 'D', 'L2', 'C', 'blue'),
      w('L2', 'A', 'R6', '1', 'green'),
      w('R6', '2', 'Alim1', 'V+', 'red'),
    ],
    expect: {
      kind: 'transistor',
      steps: [
        {
          high: ['9', '10', '6', '5'],
          on: { T1: 0.086, T2: 0.043, T3: 0.183, T4: 1.08, T5: 0.5 },
          ledOn: ['L1', 'L2'], fanAmps: 0.06,
          // Act3 tourne, mais sous 4,1 V : le darlington perd 0,9 V.
          fanSpins: ['Act1'], fanSlow: ['Act3'], fanStalls: ['Act2'],
        },
        {
          high: ['11'], off: ['T1', 'T2', 'T3', 'T4', 'T5'],
          ledOff: ['L1', 'L2'], fanAmps: 0.06, fanStalls: ['Act1', 'Act3'],
        },
      ],
    },
    code: `// Test du composant « Transistor » : un seul item de bibliotheque, le modele
// se choisit dans les proprietes. Ici cinq references du selecteur, une par
// famille. Les deux premieres commandent le MEME ventilateur 5 V / 60 mA a
// travers la MEME resistance de base 10 kOhm.
//   broche 9  : BC547  (NPN, gain 200)        -> Ic max = 200 x 0,43 mA = 86 mA
//   broche 10 : 2N3904 (NPN, gain 100)        -> Ic max = 100 x 0,43 mA = 43 mA
//   broche 11 : BC557  (PNP, gain 200)        -> LED cote HAUT, logique INVERSEE
//   broche 6  : BC517  (darlington, β 30 000) -> base 100 kOhm et pourtant 1,08 A
//   broche 5  : BS170  (MOSFET canal N)       -> grille DIRECTE, sans resistance
// Le premier ventilateur tourne, le second ne demarre JAMAIS : a montage egal,
// c'est le gain qui decide. Le troisieme tourne avec DIX FOIS moins de courant
// de base : c'est tout l'interet du darlington.
//
// Les transistors n'ont PAS le meme brochage (BC547 et BC557 = C-B-E, 2N3904 =
// E-B-C), et pourtant les fils sont identiques : les broches gardent toujours
// les noms E, B et C, seule la patte qui les porte change. Le MOSFET, lui,
// porte G, D et S : il se commande en TENSION, sa grille ne consomme rien.
const int FORT = 9;
const int FAIBLE = 10;
const int INVERSE = 11;   // PNP : conduit quand la broche est a LOW
const int DARLINGTON = 6; // base 100 kOhm : un NPN ordinaire ne suivrait pas
const int GRILLE = 5;     // MOSFET : commande en tension, sans resistance

void setup() {
  Serial.begin(115200);
  pinMode(FORT, OUTPUT);
  pinMode(FAIBLE, OUTPUT);
  pinMode(INVERSE, OUTPUT);
  pinMode(DARLINGTON, OUTPUT);
  pinMode(GRILLE, OUTPUT);
  Serial.println("Broche 10 : gain deux fois plus faible, son ventilateur ne tournera pas.");
  Serial.println("Broche 11 : PNP, sa LED s'allume quand les ventilateurs sont commandes.");
  Serial.println("Broche 6 : darlington, base 100 kOhm, son ventilateur tourne quand meme.");
}

void loop() {
  digitalWrite(FORT, HIGH);
  digitalWrite(FAIBLE, HIGH);
  digitalWrite(INVERSE, LOW);    // base tiree en bas : PNP sature, LED allumee
  digitalWrite(DARLINGTON, HIGH);
  digitalWrite(GRILLE, HIGH);    // canal ouvert : LED verte allumee
  delay(2000);
  digitalWrite(FORT, LOW);
  digitalWrite(FAIBLE, LOW);
  digitalWrite(INVERSE, HIGH);   // base au 5 V : PNP bloque, LED eteinte
  digitalWrite(DARLINGTON, LOW);
  digitalWrite(GRILLE, LOW);
  delay(1000);
}
`,
  }),

  test({
    name: 'npn-uno', board: 'uno', ext: 'ino',
    parts: [
      MCU('uno'),
      { id: 'R1', type: 'resistor', x: 300, y: 180, attrs: { value: '4700' } },
      // Prototype generique : les pattes sont numerotees, l'affectation des
      // electrodes est une propriete — ici B sur 1, C sur 2, E sur 3.
      { id: 'T1', type: 'npn', x: 440, y: 200, attrs: { text: '2N\n2222', b: '1', c: '2', e: '3', gain: '100' } },
      { id: 'R2', type: 'resistor', x: 620, y: 60, attrs: { value: '220' } },
      { id: 'L1', type: 'led', x: 760, y: 60, attrs: { color: 'yellow' } },
    ],
    wires: () => [
      w('R1', '1', 'U1', '7', 'green'),
      w('R1', '2', 'T1', '1', 'green'),
      w('T1', '3', 'U1', 'GND.1', 'black'),
      w('T1', '2', 'L1', 'C', 'blue'),
      w('L1', 'A', 'R2', '2', 'red'),
      w('R2', '1', 'U1', '5V', 'red'),
    ],
    expect: {
      kind: 'transistor',
      steps: [
        { high: ['7'], on: { T1: 0.0915 }, ledOn: ['L1'] },
        { high: [], off: ['T1'], ledOff: ['L1'] },
      ],
    },
    code: `// Test transistor NPN generique (prototype de l'editeur de composant) :
// commande cote BAS. La LED est cablee au 5 V par sa resistance, le transistor
// ferme le circuit vers la masse quand la broche 7 passe au niveau haut.
// Les pattes du prototype sont numerotees : ici la base est sur la patte 1, le
// collecteur sur la 2 et l'emetteur sur la 3 (proprietes b / c / e).
const int COMMANDE = 7;

void setup() {
  pinMode(COMMANDE, OUTPUT);
}

void loop() {
  digitalWrite(COMMANDE, HIGH);   // transistor sature : LED allumee
  delay(800);
  digitalWrite(COMMANDE, LOW);    // transistor bloque : LED eteinte
  delay(800);
}
`,
  }),

  test({
    name: 'pnp-uno', board: 'uno', ext: 'ino',
    parts: [
      MCU('uno'),
      { id: 'R1', type: 'resistor', x: 300, y: 180, attrs: { value: '4700' } },
      { id: 'T1', type: 'pnp', x: 440, y: 200, attrs: { text: '2N\n2907', e: '1', b: '2', c: '3', gain: '100' } },
      { id: 'R2', type: 'resistor', x: 760, y: 60, attrs: { value: '220' } },
      { id: 'L1', type: 'led', x: 620, y: 60, attrs: { color: 'blue' } },
    ],
    wires: () => [
      // Emetteur au +, la LED pend sous le collecteur : commande cote HAUT.
      w('T1', '1', 'U1', '5V', 'red'),
      w('R1', '1', 'U1', '8', 'green'),
      w('R1', '2', 'T1', '2', 'green'),
      w('T1', '3', 'L1', 'A', 'blue'),
      w('L1', 'C', 'R2', '1', 'blue'),
      w('R2', '2', 'U1', 'GND.1', 'black'),
    ],
    expect: {
      kind: 'transistor',
      steps: [
        { high: [], on: { T1: 0.0915 }, ledOn: ['L1'] },
        { high: ['8'], off: ['T1'], ledOff: ['L1'] },
      ],
    },
    code: `// Test transistor PNP generique (prototype de l'editeur de composant) :
// commande cote HAUT. L'emetteur est au 5 V, la LED pend sous le collecteur.
// Un PNP conduit quand sa base est TIREE VERS LE BAS : la LED s'allume quand la
// broche 8 est a LOW et s'eteint quand elle passe a HIGH — logique inversee.
const int COMMANDE = 8;

void setup() {
  pinMode(COMMANDE, OUTPUT);
  digitalWrite(COMMANDE, LOW);    // au repos : base tiree en bas, LED allumee
}

void loop() {
  digitalWrite(COMMANDE, LOW);    // transistor sature : LED allumee
  delay(800);
  digitalWrite(COMMANDE, HIGH);   // base au +5 V : transistor bloque
  delay(800);
}
`,
  }),

  test({
    name: 'relais-uno', board: 'uno', ext: 'ino',
    parts: [
      MCU('uno'),
      { id: 'R1', type: 'resistor', x: 300, y: 280, attrs: { value: '1000' } },
      { id: 'T1', type: 'pn2222a', x: 440, y: 300 },
      { id: 'D1', type: 'diode', x: 620, y: 140 },
      { id: 'Rl1', type: 'relais', x: 620, y: 220, attrs: { voltage: '5' } },
      { id: 'R2', type: 'resistor', x: 860, y: 120, attrs: { value: '220' } },
      { id: 'L1', type: 'led', x: 1000, y: 120, attrs: { color: 'green' } },
      { id: 'Rl2', type: 'relais', x: 620, y: 420, attrs: { voltage: '5' } },
      { id: 'Rl3', type: 'relais', x: 620, y: 580, attrs: { voltage: '5' } },
      { id: 'D2', type: 'diode', x: 860, y: 580 },
      { id: 'Rl4', type: 'relais', x: 620, y: 740, attrs: { voltage: '12' } },
      { id: 'D3', type: 'diode', x: 860, y: 740 },
    ],
    wires: () => [
      // Rl1 : cablage CORRECT — bobine commandee par un transistor sature,
      // diode de roue libre cathode vers le + (broche B1).
      w('R1', '1', 'U1', '8', 'green'),
      w('R1', '2', 'T1', 'B', 'green'),
      w('T1', 'E', 'U1', 'GND.1', 'black'),
      w('T1', 'C', 'Rl1', 'B2', 'blue'),
      w('Rl1', 'B1', 'U1', '5V', 'red'),
      w('D1', 'K', 'Rl1', 'B1', 'red'),
      w('D1', 'A', 'Rl1', 'B2', 'blue'),
      // Contact de travail : la LED est alimentee quand le relais colle.
      w('Rl1', 'Com.1', 'U1', '5V', 'red'),
      w('Rl1', 'NO', 'R2', '1', 'green'),
      w('R2', '2', 'L1', 'A', 'green'),
      w('L1', 'C', 'U1', 'GND.2', 'black'),
      // Rl2 : bobine directement sur une broche, SANS diode de roue libre.
      w('Rl2', 'B1', 'U1', '7', 'orange'),
      w('Rl2', 'B2', 'U1', 'GND.3', 'black'),
      // Rl3 : diode montee A L'ENVERS (anode vers le +).
      w('Rl3', 'B1', 'U1', '4', 'yellow'),
      w('Rl3', 'B2', 'U1', 'GND.3', 'black'),
      w('D2', 'A', 'Rl3', 'B1', 'yellow'),
      w('D2', 'K', 'Rl3', 'B2', 'black'),
      // Rl4 : relais 12 V alimente en 5 V — tension de commande insuffisante.
      w('Rl4', 'B1', 'U1', '5V', 'red'),
      w('Rl4', 'B2', 'U1', 'GND.3', 'black'),
      w('D3', 'K', 'Rl4', 'B1', 'red'),
      w('D3', 'A', 'Rl4', 'B2', 'black'),
    ],
    expect: {
      kind: 'relay',
      steps: [
        {
          high: ['8', '7', '4'],
          relays: {
            Rl1: { commanded: true, closed: true, fault: 'none' },
            Rl2: { commanded: true, closed: false, fault: 'no-diode' },
            Rl3: { commanded: true, closed: false, fault: 'reversed-diode' },
            Rl4: { commanded: true, closed: false, fault: 'weak' },
          },
          ledOn: ['L1'],
        },
        {
          high: [],
          relays: { Rl1: { commanded: false, closed: false }, Rl2: { commanded: false } },
          ledOff: ['L1'],
        },
      ],
    },
    code: `// Test relais OMRON G5V. Quatre cablages sur la meme carte :
//   Rl1 : CORRECT — bobine commandee par un PN2222A sature (base via 1 kOhm),
//         diode de roue libre entre B1 et B2, cathode vers le +. Il colle et
//         allume la LED cablee sur son contact de travail (NO).
//   Rl2 : bobine sur la broche 7 SANS diode de roue libre -> interdit.
//   Rl3 : diode montee a l'envers (anode vers le +) -> interdit aussi.
//   Rl4 : relais 12 V alimente en 5 V -> tension de commande insuffisante.
// Une bobine est une self : a la coupure elle renvoie une surtension qui detruit
// le transistor de commande. La diode de roue libre l'absorbe — elle n'est pas
// facultative.
const int COMMANDE = 8;          // Rl1, via le transistor
const int SANS_DIODE = 7;        // Rl2
const int DIODE_INVERSEE = 4;    // Rl3

void setup() {
  Serial.begin(115200);
  pinMode(COMMANDE, OUTPUT);
  pinMode(SANS_DIODE, OUTPUT);
  pinMode(DIODE_INVERSEE, OUTPUT);
}

void loop() {
  digitalWrite(COMMANDE, HIGH);
  digitalWrite(SANS_DIODE, HIGH);
  digitalWrite(DIODE_INVERSEE, HIGH);
  Serial.println("Seul Rl1 colle : les autres sont mal cables.");
  delay(1500);
  digitalWrite(COMMANDE, LOW);
  digitalWrite(SANS_DIODE, LOW);
  digitalWrite(DIODE_INVERSEE, LOW);
  delay(1500);
}
`,
  }),

  test({
    name: 'keypad-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'Cl1', type: 'keypad', x: 560, y: 40, attrs: { columns: '4' } }],
    wires: () => [
      w('Cl1', 'R1', 'U1', '2', 'yellow'),
      w('Cl1', 'R2', 'U1', '3', 'yellow'),
      w('Cl1', 'R3', 'U1', '4', 'yellow'),
      w('Cl1', 'R4', 'U1', '5', 'yellow'),
      w('Cl1', 'C1', 'U1', '6', 'green'),
      w('Cl1', 'C2', 'U1', '7', 'green'),
      w('Cl1', 'C3', 'U1', '8', 'green'),
      w('Cl1', 'C4', 'U1', '9', 'green'),
    ],
    expect: { kind: 'keypad', partId: 'Cl1', rows: ['2', '3', '4', '5'], cols: ['6', '7', '8', '9'] },
    code: `// Test clavier matriciel 4x4 : affiche la touche pressée.
#include <Keypad.h>

const byte LIGNES = 4, COLONNES = 4;
char touches[LIGNES][COLONNES] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'},
};
byte brochesLignes[LIGNES] = {2, 3, 4, 5};
byte brochesColonnes[COLONNES] = {6, 7, 8, 9};
Keypad clavier(makeKeymap(touches), brochesLignes, brochesColonnes, LIGNES, COLONNES);

void setup() {
  Serial.begin(115200);
}

void loop() {
  char touche = clavier.getKey();
  if (touche) {
    Serial.print("Touche : ");
    Serial.println(touche);
  }
}
`,
  }),

  icTest('CI1', 'uno'),
  icTest('CI2', 'uno'),
  icTest('CI3', 'uno'),

  // Liaison DMX512 : les deux composants de bibliothèque à la suite. La carte
  // Grove-DMX512 convertit l'UART de la carte en ligne différentielle, le
  // projecteur PAR 38 est branché au bout du câble XLR. Le test contrôle la
  // liaison simulée (quel projecteur écoute quelle broche, à quelle adresse),
  // la CONTINUITÉ du câblage et la compilation du programme.
  test({
    name: 'dmx-uno', board: 'uno', ext: 'ino',
    kompix: ['dmx-grove', 'spot'],
    // Schéma retouché par Frank (v2026.8.91) : la spec suit SON montage —
    // identifiants (Mod1 = projecteur, Mod2 = carte Grove), emplacements et
    // masse prise sur GND.3 de la Uno.
    parts: [
      MCU('uno'),
      { id: 'Mod1', type: 'spot', x: 650, y: 140 },
      { id: 'Mod2', type: 'dmx-grove', x: 260, y: 280 },
    ],
    wires: () => [
      w('Mod2', 'VCC', 'U1', '5V', 'red'),
      w('Mod2', 'GND.1', 'U1', 'GND.3', 'black'),
      w('Mod2', 'SIG', 'U1', '1', 'green'),        // TX de l'UART matériel
      w('Mod1', '+', 'Mod2', '+', 'purple'),       // XLR 3 = Data+
      w('Mod1', '-', 'Mod2', '-', 'blue'),         // XLR 2 = Data−
      w('Mod1', 'GND', 'Mod2', 'GND.2', 'black'),  // XLR 1 = blindage
    ],
    expect: {
      kind: 'dmx', partId: 'Mod1', mcuPin: '1', address: 1, channels: 3,
      nets: [
        ['Mod2/VCC', 'U1/5V'],
        ['Mod2/GND.1', 'U1/GND.3'],
        ['Mod2/SIG', 'U1/1'],
        ['Mod1/+', 'Mod2/+'],
        ['Mod1/-', 'Mod2/-'],
        ['Mod1/GND', 'Mod2/GND.2'],
      ],
    },
    code: `// Test DMX512 : la carte Grove-DMX512 transforme l'UART matériel en ligne
// DMX, le projecteur PAR 38 prend la couleur envoyée sur ses trois canaux.
// Adresse du projecteur : 1 → canal 1 = rouge, 2 = vert, 3 = bleu.
#define ADRESSE 1
#define CANAUX 512
#define BROCHE_TX 1

// Octet de départ (0 = éclairage) puis les 512 canaux.
uint8_t trame[CANAUX + 1];

// Une trame DMX ne commence pas par un octet : le récepteur attend d'abord un
// BREAK (ligne au repos bas, au moins 88 us) puis un MAB (marque, au moins
// 8 us). L'UART ne sait pas les produire — on le coupe le temps de tenir la
// broche TX à la main, puis on le relance pour envoyer la trame.
void envoyer() {
  Serial.flush();
  Serial.end();
  pinMode(BROCHE_TX, OUTPUT);
  digitalWrite(BROCHE_TX, LOW);
  delayMicroseconds(120);   // BREAK
  digitalWrite(BROCHE_TX, HIGH);
  delayMicroseconds(12);    // MAB
  Serial.begin(250000, SERIAL_8N2);   // 250 kbauds, 8 bits, 2 stops : DMX512
  Serial.write(trame, sizeof(trame));
}

void setup() {
  Serial.begin(250000, SERIAL_8N2);
  memset(trame, 0, sizeof(trame));
}

void loop() {
  static const uint8_t COULEURS[3][3] = {{255, 0, 0}, {0, 255, 0}, {0, 0, 255}};
  for (uint8_t i = 0; i < 3; i++) {
    trame[ADRESSE] = COULEURS[i][0];
    trame[ADRESSE + 1] = COULEURS[i][1];
    trame[ADRESSE + 2] = COULEURS[i][2];
    envoyer();
    delay(1000);
  }
}
`,
  }),
];

// ================================================================================
// Cartes seules : blink de la LED embarquée (une carte de dev par projix)
// ================================================================================
const BOARD_TESTS = [
  test({
    name: 'blink-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno', 200, 80)],
    wires: () => [],
    expect: { kind: 'board-only' },
    code: `// Test carte Arduino Uno : la LED embarquée (D13, marquée L) clignote.
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(115200);
  Serial.println("blink Uno");
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
}
`,
  }),

  test({
    name: 'blink-nano', board: 'nano', ext: 'ino',
    parts: [MCU('nano', 240, 120)],
    wires: () => [],
    expect: { kind: 'board-only' },
    code: `// Test carte Arduino Nano : la LED embarquée (D13) clignote.
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(115200);
  Serial.println("blink Nano");
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
}
`,
  }),

  test({
    // La Mega porte une LED EXTERNE en parallèle de sa LED embarquée : D13 est
    // la seule broche que le sketch pilote, on voit donc clignoter les deux.
    name: 'blink-mega', board: 'mega', ext: 'ino',
    parts: [
      MCU('mega', 150, 90),
      { id: 'L1', type: 'led', x: 270, y: 10, attrs: { color: 'red' } },
      { id: 'R1', type: 'resistor', x: 290, y: 40, attrs: { value: '220' } },
    ],
    wires: () => [
      w('L1', 'A', 'R1', '1', 'orange'),
      w('L1', 'C', 'U1', 'GND.1', 'black'),
      w('R1', '2', 'U1', '13', 'yellow'),
    ],
    expect: { kind: 'led', partId: 'L1', mcuPin: '13' },
    code: `// Test carte Arduino Mega 2560 : la LED embarquée (D13) clignote.
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(115200);
  Serial.println("blink Mega");
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
}
`,
  }),

  test({
    name: 'blink-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico', 160, 100)],
    wires: () => [],
    expect: { kind: 'board-only' },
    code: `# Test carte Raspberry Pi Pico : la LED embarquée (GP25) clignote.
from machine import Pin
import time

led = Pin(25, Pin.OUT)
while True:
    led.toggle()
    print("LED", "ON" if led.value() else "OFF")
    time.sleep(0.5)
`,
  }),

  test({
    name: 'blink-picow', board: 'picow', ext: 'py',
    parts: [MCU('picow', 160, 100)],
    wires: () => [],
    expect: { kind: 'board-only' },
    code: `# Test carte Raspberry Pi Pico W : la LED embarquée clignote.
# Sur une vraie carte, cette LED est câblée sur la puce Wi-Fi et s'adresse par
# son nom : Pin("LED"). Kablix la simule sur GP25 (la puce Wi-Fi n'est pas
# émulée) et accepte les DEUX écritures — c'est le code habituel qui doit
# marcher tel quel.
from machine import Pin
import time

led = Pin("LED", Pin.OUT)
while True:
    led.toggle()
    print("LED", "ON" if led.value() else "OFF")
    time.sleep(0.5)
`,
  }),

  test({
    name: 'blink-pico2', board: 'pico2', ext: 'py',
    parts: [MCU('pico2', 160, 100)],
    wires: () => [],
    expect: { kind: 'board-only' },
    code: `# Test carte Raspberry Pi Pico 2 : la LED embarquee (GP25) clignote.
# Meme code que sur la Pico : c'est la PUCE qui change (RP2350, deux coeurs
# Cortex-M33 a 150 MHz au lieu du RP2040 a 125). machine.freq() le montre.
from machine import Pin
import machine
import time

print("FREQ", machine.freq())
led = Pin(25, Pin.OUT)
while True:
    led.toggle()
    print("LED", "ON" if led.value() else "OFF")
    time.sleep(0.5)
`,
  }),

  test({
    name: 'blink-pico2w', board: 'pico2w', ext: 'py',
    parts: [MCU('pico2w', 160, 100)],
    wires: () => [],
    expect: { kind: 'board-only' },
    code: `# Test carte Raspberry Pi Pico 2 W : la LED embarquee clignote.
# Comme sur la Pico W, cette LED est cablee sur la puce Wi-Fi de la vraie carte
# et s'adresse par son nom : Pin("LED"). Kablix la simule sur GP25 (la puce
# Wi-Fi n'est pas emulee) et accepte les DEUX ecritures.
from machine import Pin
import machine
import time

print("FREQ", machine.freq())
led = Pin("LED", Pin.OUT)
while True:
    led.toggle()
    print("LED", "ON" if led.value() else "OFF")
    time.sleep(0.5)
`,
  }),
];

// ================================================================================
// Partie RP2040 — Raspberry Pi Pico (MicroPython, .py + .projix côte à côte)
// ================================================================================
const PICO_TESTS = [
  test({
    name: 'led-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'R1', type: 'resistor', x: 560, y: 90, attrs: { value: '220' } }, { id: 'L1', type: 'led', x: 680, y: 60, attrs: { color: 'red' } }],
    wires: () => [w('R1', '1', 'U1', 'GP15', 'green'), w('L1', 'A', 'R1', '2', 'green'), w('L1', 'C', 'U1', 'GND.5', 'black')],
    expect: { kind: 'led', partId: 'L1', mcuPin: 'GP15' },
    code: `# Test LED : clignote sur GP15 (via une résistance de 220 ohms).
from machine import Pin
import time

led = Pin(15, Pin.OUT)
while True:
    led.value(1)
    print("LED ON")
    time.sleep(0.5)
    led.value(0)
    print("LED OFF")
    time.sleep(0.5)
`,
  }),

  test({
    name: 'rgb-led-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico'),
      { id: 'R1', type: 'resistor', x: 500, y: 60, attrs: { value: '120' } },
      { id: 'R2', type: 'resistor', x: 500, y: 100, attrs: { value: '120' } },
      { id: 'R3', type: 'resistor', x: 500, y: 140, attrs: { value: '120' } },
      { id: 'L1', type: 'rgb-led', x: 680, y: 80, attrs: { common: 'cathode' } },
    ],
    wires: () => [
      w('U1', 'GP13', 'R1', '1', 'orange'),
      w('R1', '2', 'L1', 'R', 'orange'),
      w('U1', 'GP14', 'R2', '1', 'green'),
      w('R2', '2', 'L1', 'G', 'green'),
      w('U1', 'GP15', 'R3', '1', 'blue'),
      w('R3', '2', 'L1', 'B', 'blue'),
      w('L1', 'COM', 'U1', 'GND.5', 'black'),
    ],
    expect: { kind: 'rgb-led', partId: 'L1', r: 'GP13', g: 'GP14', b: 'GP15' },
    code: `# Test LED RGB (cathode commune) : fondu PWM sur chaque canal.
from machine import Pin, PWM
import time

canaux = {"Rouge": PWM(Pin(13)), "Vert": PWM(Pin(14)), "Bleu": PWM(Pin(15))}
for p in canaux.values():
    p.freq(1000)
    p.duty_u16(0)

while True:
    for nom, pwm in canaux.items():
        print(nom)
        for v in range(0, 65536, 4096):
            pwm.duty_u16(v)
            time.sleep(0.02)
        pwm.duty_u16(0)
`,
  }),

  test({
    name: 'button-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'BP1', type: 'button', x: 680, y: 100, attrs: { color: 'green' } }],
    wires: () => [w('BP1', '1.l', 'U1', 'GP14', 'yellow'), w('BP1', '2.l', 'U1', 'GND.5', 'black')],
    expect: { kind: 'button', partId: 'BP1', mcuPin: 'GP14' },
    code: `# Test bouton poussoir : appui = 0 (pull-up interne), recopié sur la LED GP25.
from machine import Pin
import time

bouton = Pin(14, Pin.IN, Pin.PULL_UP)
led = Pin(25, Pin.OUT)
while True:
    appuye = bouton.value() == 0
    led.value(1 if appuye else 0)
    print("APPUYE" if appuye else "relache")
    time.sleep(0.2)
`,
  }),

  // Le test `button-6mm-pico` a été retiré de la spec en v2026.8.10, à la
  // demande de Frank, après qu'il ait supprimé ses fichiers ; `button-6mm-uno`
  // l'a suivi en v2026.8.25. Le bouton 6 mm n'a donc plus de test testkablix :
  // son comportement est identique à celui du poussoir standard (couvert sur
  // les deux cartes) et `verify:button-latch` éprouve les DEUX poussoirs.

  test({
    name: 'buzzer-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'Act1', type: 'buzzer', x: 680, y: 90 }],
    wires: () => [w('Act1', '1', 'U1', 'GP16', 'purple'), w('Act1', '2', 'U1', 'GND.6', 'black')],
    expect: { kind: 'buzzer', partId: 'Act1', mcuPin: 'GP16' },
    code: `# Test buzzer : niveau haut simple puis « bip » en PWM.
from machine import Pin, PWM
import time

broche = Pin(16, Pin.OUT)
while True:
    broche.value(1)
    print("Buzzer ON")
    time.sleep(0.4)
    broche.value(0)
    print("Buzzer OFF")
    time.sleep(0.4)
    bip = PWM(Pin(16))
    bip.freq(440)
    bip.duty_u16(32768)
    print("bip 440 Hz")
    time.sleep(0.3)
    bip.deinit()
    broche = Pin(16, Pin.OUT)
    time.sleep(0.3)
`,
  }),

  test({
    name: 'pot-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'Pot1', type: 'pot', x: 680, y: 90, attrs: { min: '0', max: '100', value: '50' } }],
    wires: () => [
      w('Pot1', 'VCC', 'U1', '3V3', 'red'),
      w('Pot1', 'SIG', 'U1', 'GP26', 'green'),
      w('Pot1', 'GND', 'U1', 'GND.7', 'black'),
    ],
    expect: { kind: 'pot', partId: 'Pot1', mcuPin: 'GP26' },
    code: `# Test potentiomètre : lecture analogique 0-65535 sur GP26 (ADC0).
from machine import ADC
import time

pot = ADC(26)
while True:
    print("ADC0 =", pot.read_u16())
    time.sleep(0.25)
`,
  }),

  test({
    name: 'slide-pot-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico', 296.75, 203.6),
      { id: 'Pot1', type: 'slide-pot', x: 380, y: 161.25, attrs: { min: '0', max: '100', value: '50', ohms: '10000' } },
    ],
    wires: () => [
      w('Pot1', 'VCC', 'U1', '3V3', 'red'),
      w('Pot1', 'SIG', 'U1', 'GP27', 'green'),
      w('Pot1', 'GND', 'U1', 'GND.7', 'black'),
    ],
    expect: { kind: 'pot', partId: 'Pot1', mcuPin: 'GP27' },
    code: `# Test potentiomètre à glissière : lecture analogique sur GP27 (ADC1).
from machine import ADC
import time

pot = ADC(27)
while True:
    print("ADC1 =", pot.read_u16())
    time.sleep(0.25)
`,
  }),

  test({
    // Ajustable réglé au tournevis : rail entre 3V3 et masse, curseur sur GP28
    // (ADC2). Boîtier de 100 kΩ, donc « 104 » écrit dessus.
    name: 'pot-rot2-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico'),
      { id: 'Pot1', type: 'pot-rot2', x: 680, y: 90, attrs: { min: '0', max: '100', value: '50', ohms: '100000' } },
    ],
    wires: () => [
      w('Pot1', 'VCC', 'U1', '3V3', 'red'),
      w('Pot1', 'SIG', 'U1', 'GP28', 'green'),
      w('Pot1', 'GND', 'U1', 'GND.7', 'black'),
    ],
    expect: { kind: 'pot', partId: 'Pot1', mcuPin: 'GP28' },
    code: `# Test potentiomètre ajustable (trimmer 100 kΩ) : lecture sur GP28 (ADC2).
from machine import ADC
import time

pot = ADC(28)
while True:
    print("ADC2 =", pot.read_u16())
    time.sleep(0.25)
`,
  }),

  test({
    // Afficheur à QUATRE chiffres, donc MULTIPLEXÉ : aucun commun à la masse,
    // ce sont les broches DIG1..DIG4 qui allument un chiffre à la fois. Les huit
    // segments passent chacun par une résistance de 100 Ω ; les quatre communs
    // vont directement sur GP10..GP13 (le programme les bat à ~2 ms).
    // Retouché à la main par Frank après génération : le script .py est celui du
    // dépôt, pas celui d'ici — `verify:7seg-mux` l'éprouve en simulation.
    name: '7seg-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico', 106.75, 113.6),
      { id: 'Aff1', type: '7seg', x: 110, y: 330, attrs: { color: 'red', common: 'cathode', digits: '4' } },
      { id: 'R1', type: 'resistor', x: 220, y: 240, attrs: { value: '100' } },
      { id: 'R2', type: 'resistor', x: 210, y: 250, attrs: { value: '100' } },
      { id: 'R3', type: 'resistor', x: 200, y: 260, attrs: { value: '100' } },
      { id: 'R4', type: 'resistor', x: 190, y: 270, attrs: { value: '100' } },
      { id: 'R5', type: 'resistor', x: 80, y: 240, attrs: { value: '100' } },
      { id: 'R6', type: 'resistor', x: 90, y: 250, attrs: { value: '100' } },
      { id: 'R7', type: 'resistor', x: 100, y: 260, attrs: { value: '100' } },
      { id: 'R8', type: 'resistor', x: 110, y: 270, attrs: { value: '100' } },
    ],
    wires: () => [
      w('R1', '1', 'U1', 'GP9', 'orange'),
      w('R2', '1', 'U1', 'GP8', 'yellow'),
      w('R3', '1', 'U1', 'GP7', 'green'),
      w('R4', '1', 'U1', 'GP6', 'blue'),
      w('R8', '2', 'U1', 'GP5', 'purple'),
      w('R5', '2', 'U1', 'GP2', 'gray'),
      w('R7', '2', 'U1', 'GP4', 'fuchsia'),
      w('R6', '2', 'U1', 'GP3', 'brown'),
      w('Aff1', 'A', 'R5', '1', 'orange'),
      w('Aff1', 'B', 'R6', '1', 'yellow'),
      w('Aff1', 'C', 'R7', '1', 'green'),
      w('Aff1', 'D', 'R8', '1', 'blue'),
      w('Aff1', 'E', 'R4', '2', 'purple'),
      w('Aff1', 'F', 'R3', '2', 'gray'),
      w('Aff1', 'G', 'R2', '2', 'fuchsia'),
      w('Aff1', 'DP', 'R1', '2', 'brown'),
      w('U1', 'GP10', 'Aff1', 'DIG1', 'orange'),
      w('U1', 'GP11', 'Aff1', 'DIG2', 'yellow'),
      w('U1', 'GP12', 'Aff1', 'DIG3', 'green'),
      w('U1', 'GP13', 'Aff1', 'DIG4', 'blue'),
    ],
    expect: {
      kind: '7seg-mux', partId: 'Aff1', digits: 4,
      segments: { A: 'GP2', B: 'GP3', C: 'GP4', D: 'GP5', E: 'GP6', F: 'GP7', G: 'GP8', DP: 'GP9' },
      digitPins: ['GP10', 'GP11', 'GP12', 'GP13'],
    },
    code: `# Test afficheur 7 segments multiplexe.
# Segments A..G sur GP2..GP8.
# Digits 1..4 sur GP10..GP13.
from machine import Pin
import time

K = 1  # Cathode commune : segment allumé à 1.
A = 0  # Anode commune : segment allumé à 0.
COMMUNE = K  # Remplacer par A pour un afficheur à anode commune.

NB_DIGITS = 1 # Mettre 1, 2 ou 4 selon l'afficheur câblé.

SEGS = [Pin(n, Pin.OUT) for n in range(2, 9)]
DIGITS = [Pin(n, Pin.OUT) for n in range(10, 14)]
# Bits A..G : bit 0 = A, ..., bit 6 = G.
CHIFFRES = (0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F)

SEG_ON = COMMUNE
SEG_OFF = 1 - COMMUNE
DIGIT_ON = 1 - COMMUNE
DIGIT_OFF = COMMUNE
DELAIS=100



def eteindre_tous_les_digits():
    for digit in DIGITS:
        digit.value(DIGIT_OFF)


def afficher_segments(motif):
    for segment in range(7):
        SEGS[segment].value(((motif >> segment) & 1) == SEG_ON)


def afficher_un_digit(index_digit, valeur):
    eteindre_tous_les_digits()
    if valeur is None:
        afficher_segments(0)
    else:
        afficher_segments(CHIFFRES[valeur])
    DIGITS[index_digit].value(DIGIT_ON)
    time.sleep(0.002)
    DIGITS[index_digit].value(DIGIT_OFF)


def afficher_nombre(nombre):
    limite = 10 ** NB_DIGITS
    valeur = nombre % limite
    chiffres = [None] * NB_DIGITS

    for index in range(NB_DIGITS - 1, -1, -1):
        chiffres[index] = valeur % 10
        valeur //= 10

    for index_digit, chiffre in enumerate(chiffres):
        afficher_un_digit(index_digit, chiffre)


eteindre_tous_les_digits()

while True:
    for nombre in range(10 ** NB_DIGITS):
        debut = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), debut) < DELAIS:
            afficher_nombre(nombre)
        print(nombre)
`,
  }),

  test({
    // Barre couchée (tournée d'un quart de tour) et broches prises à l'envers,
    // comme côté Arduino : GP2 va sur A10, GP11 sur A1. Une résistance de 100 Ω
    // par LED (3,3 V au lieu de 5 V), cathodes chaînées jusqu'à la masse.
    name: 'led-bar-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico'),
      { id: 'Aff1', type: 'led-bar', x: 118.5, y: 228.5, rotation: 90, attrs: { color: 'GYR' } },
      ...Array.from({ length: 10 }, (_, i) => (
        { id: `R${i + 1}`, type: 'resistor', x: 60 + i * 10, y: 220, rotation: 90, attrs: { value: '100' } }
      )),
    ],
    wires: () => [
      ...Array.from({ length: 10 }, (_, i) => w(`R${i + 1}`, '2', 'Aff1', `A${10 - i}`, 'orange')),
      w('U1', 'GND.8', 'Aff1', 'C1', 'black'),
      ...Array.from({ length: 9 }, (_, i) => w('Aff1', `C${i + 1}`, 'Aff1', `C${i + 2}`, 'black')),
      ...Array.from({ length: 10 }, (_, i) => w('U1', `GP${i + 2}`, `R${i + 1}`, '1', 'green')),
    ],
    // GP11 pilote A1 : c'est LUI qui allume la première LED de la barre.
    expect: { kind: 'led-bar', partId: 'Aff1', firstPin: 'GP11' },
    code: `# Test barre de 10 LED : vumètre qui monte puis descend (anodes sur GP2..GP11).
from machine import Pin
import time

leds = [Pin(n, Pin.OUT) for n in range(2, 12)]

def afficher(niveau):
    for i, led in enumerate(leds):
        led.value(1 if i < niveau else 0)
    print("niveau =", niveau)

while True:
    for n in range(11):
        afficher(n)
        time.sleep(0.15)
    for n in range(10, -1, -1):
        afficher(n)
        time.sleep(0.15)
`,
  }),

  test({
    name: 'slide-switch-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'Inter1', type: 'slide-switch', x: 680, y: 100 }],
    wires: () => [
      w('Inter1', '1', 'U1', 'GP14', 'yellow'),
      w('Inter1', '2', 'U1', 'GND.5', 'black'),
      w('Inter1', '3', 'U1', 'GP13', 'orange'),
    ],
    expect: { kind: 'slide-switch', partId: 'Inter1', sides: { 1: 'GP14', 3: 'GP13' } },
    code: `# Test interrupteur à glissière : le commun (2) est à GND, le côté connecté = 0.
from machine import Pin
import time

cote1 = Pin(14, Pin.IN, Pin.PULL_UP)
cote3 = Pin(13, Pin.IN, Pin.PULL_UP)
while True:
    if cote1.value() == 0:
        print("Position 1")
    elif cote3.value() == 0:
        print("Position 3")
    else:
        print("(milieu / non connecte)")
    time.sleep(0.3)
`,
  }),

  test({
    name: 'dip-switch-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'Inter1', type: 'dip-switch', x: 680, y: 90 }],
    wires: () => [
      ...Array.from({ length: 8 }, (_, i) => w('Inter1', `${i + 1}a`, 'U1', `GP${i + 2}`, 'yellow')),
      ...Array.from({ length: 8 }, (_, i) => w('Inter1', `${i + 1}b`, 'U1', `GND.${(i % 4) + 1}`, 'black')),
    ],
    expect: { kind: 'dip-switch', partId: 'Inter1', channels: 8 },
    code: `# Test DIP switch x8 : chaque canal fermé tire sa broche (GP2..GP9) à 0.
from machine import Pin
import time

canaux = [Pin(n, Pin.IN, Pin.PULL_UP) for n in range(2, 10)]
while True:
    etat = "".join("1" if c.value() == 0 else "0" for c in canaux)
    print("Canaux :", etat)
    time.sleep(0.4)
`,
  }),

  test({
    name: 'joystick-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico', 226.75, 283.6),
      { id: 'Pot1', type: 'joystick', x: 270, y: 100 },
    ],
    wires: () => [
      w('Pot1', 'VCC', 'U1', '3V3', 'red'),
      w('Pot1', 'HORZ', 'U1', 'GP26', 'fuchsia'),
      w('Pot1', 'SEL', 'U1', 'GP22', 'yellow'),
      w('Pot1', 'GND', 'U1', 'GND.3', 'black'),
      w('Pot1', 'VERT', 'U1', 'GP27', 'orange'),
    ],
    expect: { kind: 'joystick', partId: 'Pot1', vert: 'GP27', horz: 'GP26', sel: 'GP22' },
    code: `# Test joystick analogique : X/Y sur les ADC, bouton SEL en pull-up.
from machine import ADC, Pin
import time

axe_y = ADC(27)
axe_x = ADC(26)
bouton = Pin(22, Pin.IN, Pin.PULL_UP)
while True:
    b = "APPUYE" if bouton.value() == 0 else "relache"
    print("Y =", axe_y.read_u16(), " X =", axe_x.read_u16(), " bouton =", b)
    time.sleep(0.25)
`,
  }),

  test({
    name: 'photoresistor-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'Capt1', type: 'photoresistor', x: 680, y: 90, attrs: { sensitivity: '50' } }],
    wires: () => [
      w('Capt1', 'VCC', 'U1', '3V3', 'red'),
      w('Capt1', 'GND', 'U1', 'GND.7', 'black'),
      w('Capt1', 'AO', 'U1', 'GP26', 'green'),
      w('Capt1', 'DO', 'U1', 'GP14', 'yellow'),
    ],
    expect: { kind: 'ao-do', partId: 'Capt1', analog: 'GP26', digital: 'GP14' },
    code: `# Test capteur de lumière (LDR) : AO analogique + DO numérique (actif bas).
from machine import ADC, Pin
import time

ao = ADC(26)
do = Pin(14, Pin.IN)
while True:
    seuil = "SEUIL DEPASSE" if do.value() == 0 else "sous le seuil"
    print("AO =", ao.read_u16(), " DO =", seuil)
    time.sleep(0.3)
`,
  }),

  test({
    name: 'pir-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'Capt1', type: 'pir', x: 680, y: 90 }],
    wires: () => [
      w('Capt1', 'VCC', 'U1', '3V3', 'red'),
      w('Capt1', 'OUT', 'U1', 'GP14', 'yellow'),
      w('Capt1', 'GND', 'U1', 'GND.5', 'black'),
    ],
    expect: { kind: 'digital-source', partId: 'Capt1', mcuPin: 'GP14' },
    code: `# Test capteur PIR : en simulation, survoler le capteur déclenche le mouvement.
from machine import Pin
import time

pir = Pin(14, Pin.IN)
led = Pin(25, Pin.OUT)
while True:
    mouvement = pir.value() == 1
    led.value(1 if mouvement else 0)
    print("MOUVEMENT !" if mouvement else "rien")
    time.sleep(0.3)
`,
  }),

  test({
    name: 'tilt-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico', 356.75, 213.6),
      { id: 'Capt1', type: 'tilt', x: 290, y: 140 },
    ],
    wires: () => [
      w('Capt1', 'VCC', 'U1', '3V3', 'red'),
      w('Capt1', 'GND', 'U1', 'GND.4', 'black'),
      w('Capt1', 'OUT', 'U1', 'GP26', 'orange'),
    ],
    expect: { kind: 'digital-source', partId: 'Capt1', mcuPin: 'GP26' },
    code: `# Test capteur d'inclinaison : maintenir le clic incline le capteur.
from machine import Pin
import time

tilt = Pin(26, Pin.IN)
while True:
    print("INCLINE" if tilt.value() == 1 else "droit")
    time.sleep(0.3)
`,
  }),

  test({
    // Même capteur, l'autre façon de le rappeler : PAS de résistance externe,
    // c'est le rappel INTERNE du Pico (`Pin.PULL_UP`) qui tient la sortie
    // haute. Le moteur le relit à chaque frame — c'est le programme qui l'arme.
    name: 'hall-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico', 356.75, 213.6),
      { id: 'Capt1', type: 'hall', x: 290, y: 140, attrs: { text: 'A3144', vplus: '1', gnd: '2', s: '3' } },
    ],
    wires: () => [
      w('Capt1', 'V+', 'U1', '3V3', 'red'),
      w('Capt1', 'GND', 'U1', 'GND.4', 'black'),
      w('Capt1', 'S', 'U1', 'GP16', 'yellow'),
    ],
    expect: { kind: 'hall', partId: 'Capt1', mcuPin: 'GP16', powered: true, pullupOhms: null },
    code: `# Test capteur à effet Hall : en simulation, glisser l'aimant vers le capteur.
# Sortie à drain ouvert, ACTIVE BASSE : ici c'est le rappel interne du Pico.
from machine import Pin
import time

hall = Pin(16, Pin.IN, Pin.PULL_UP)
led = Pin(25, Pin.OUT)
while True:
    aimant = hall.value() == 0
    led.value(1 if aimant else 0)
    print("AIMANT" if aimant else "rien")
    time.sleep(0.3)
`,
  }),

  // Le test `servo-pico` a été retiré de la spec en v2026.8.25, à la demande de
  // Frank, après qu'il ait supprimé ses fichiers en v2026.8.2. Le servomoteur
  // reste éprouvé côté Arduino (`servo-uno`), et côté Pico par les montages qui
  // s'en servent : `powerbank-pico`, `patte-pico` et le schéma « 16 servo +
  // alim » — tous pilotés par PCA9685, ce qui est l'usage réel sur Pico.

  test({
    // Batterie externe (Power bank) : même rôle électrique que l'alim de
    // laboratoire (kind 'psu', tension fixe), câblée ici sur un PCA9685 pour
    // alimenter un servo — le montage de base du futur banc araignée.
    name: 'powerbank-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico'),
      { id: 'Mod1', type: 'pca9685', x: 620, y: 40, attrs: { address: '0x40' } },
      { id: 'Act1', type: 'servo', x: 940, y: 40, attrs: { horn: 'single', pulsemin: '500', pulsemax: '2500' } },
      { id: 'Bat1', type: 'powerbank', x: 940, y: 260, attrs: { voltage: '5', maxcurrent: '2' } },
    ],
    wires: () => [
      w('Mod1', 'GND', 'U1', 'GND.1', 'black'),
      w('Mod1', 'VCC', 'U1', 'VBUS', 'red'),
      w('Mod1', 'SDA', 'U1', 'GP0', 'blue'),
      w('Mod1', 'SCL', 'U1', 'GP1', 'yellow'),
      w('Act1', 'PWM', 'Mod1', 'PWM0', 'orange'),
      w('Act1', 'V+', 'Mod1', 'P1.5V', 'red'),
      w('Act1', 'GND', 'Mod1', 'P1.GND', 'black'),
      w('Bat1', 'V+', 'Mod1', 'V+', 'red'),
      w('Bat1', 'GND', 'Mod1', 'GND.2', 'black'),
    ],
    expect: { kind: 'pca9685', partId: 'Mod1', channel: 0, targetId: 'Act1', powered: true },
    code: `# Test batterie externe (Power bank) : le servo branche sur P1 (canal 0) du
# PCA9685 balaie 0, 90 puis 180 degres, alimente par la powerbank (V+/GND) au
# lieu de l'alim de laboratoire. En simulation, ses 4 LED de jauge s'allument.
from machine import Pin, I2C
import time

i2c = I2C(0, sda=Pin(0), scl=Pin(1), freq=400000)
PCA = 0x40

def pca_ecrit(reg, val):
    i2c.writeto_mem(PCA, reg, bytes([val]))

# Impulsion du canal : creneau demarre a 0, coupe a duree/20 ms x 4096 pas.
def pca_impulsion(canal, microsecondes):
    off = microsecondes * 4096 // 20000
    i2c.writeto_mem(PCA, 0x06 + 4 * canal, bytes([0x00, 0x00, off & 0xFF, off >> 8]))

pca_ecrit(0x00, 0x10)  # MODE1 : sleep pour regler le prescaler
pca_ecrit(0xFE, 121)   # prescale 50 Hz (25 MHz / (4096 x 50) - 1)
pca_ecrit(0x00, 0x20)  # MODE1 : reveil + auto-increment

while True:
    pca_impulsion(0, 500);  print("0 degres");   time.sleep(1)
    pca_impulsion(0, 1500); print("90 degres");  time.sleep(1)
    pca_impulsion(0, 2500); print("180 degres"); time.sleep(1)
`,
  }),

  test({
    // Patte de robot araignée (cf. patte-element.mts) : le fémur et le tibia
    // dessinés par Frank, vus en volume, avec un connecteur à deux borniers
    // 3 fils. 2 articulations indépendantes câblées chacune sur un canal du
    // PCA9685 (coxa → canal 0, patella → canal 1), alimentées par la powerbank.
    name: 'patte-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico'),
      { id: 'Mod1', type: 'pca9685', x: 620, y: 40, attrs: { address: '0x40' } },
      { id: 'Act1', type: 'patte', x: 940, y: 40, attrs: { pulsemin: '500', pulsemax: '2500' } },
      { id: 'Bat1', type: 'powerbank', x: 940, y: 260, attrs: { voltage: '5', maxcurrent: '2' } },
    ],
    wires: () => [
      w('Mod1', 'GND', 'U1', 'GND.1', 'black'),
      w('Mod1', 'VCC', 'U1', 'VBUS', 'red'),
      w('Mod1', 'SDA', 'U1', 'GP0', 'blue'),
      w('Mod1', 'SCL', 'U1', 'GP1', 'yellow'),
      w('Act1', 'coxa.PWM', 'Mod1', 'PWM0', 'orange'),
      w('Act1', 'coxa.V+', 'Mod1', 'P1.5V', 'red'),
      w('Act1', 'coxa.GND', 'Mod1', 'P1.GND', 'black'),
      w('Act1', 'patella.PWM', 'Mod1', 'PWM1', 'orange'),
      w('Act1', 'patella.V+', 'Mod1', 'P2.5V', 'red'),
      w('Act1', 'patella.GND', 'Mod1', 'P2.GND', 'black'),
      w('Bat1', 'V+', 'Mod1', 'V+', 'red'),
      w('Bat1', 'GND', 'Mod1', 'GND.2', 'black'),
    ],
    expect: { kind: 'pca9685', partId: 'Mod1', channel: 0, targetId: 'Act1', targetPin: 'coxa.PWM', powered: true },
    code: `# Test patte d'araignee : coxa (canal 0) et patella (canal 1) du PCA9685
# balaient chacun 0, 90 puis 180 degres, alimentes par la powerbank (V+/GND.2).
from machine import Pin, I2C
import time

i2c = I2C(0, sda=Pin(0), scl=Pin(1), freq=400000)
PCA = 0x40

def pca_ecrit(reg, val):
    i2c.writeto_mem(PCA, reg, bytes([val]))

# Impulsion du canal : creneau demarre a 0, coupe a duree/20 ms x 4096 pas.
def pca_impulsion(canal, microsecondes):
    off = microsecondes * 4096 // 20000
    i2c.writeto_mem(PCA, 0x06 + 4 * canal, bytes([0x00, 0x00, off & 0xFF, off >> 8]))

pca_ecrit(0x00, 0x10)  # MODE1 : sleep pour regler le prescaler
pca_ecrit(0xFE, 121)   # prescale 50 Hz (25 MHz / (4096 x 50) - 1)
pca_ecrit(0x00, 0x20)  # MODE1 : reveil + auto-increment

while True:
    pca_impulsion(0, 500);  pca_impulsion(1, 500);  print("0 degres");   time.sleep(1)
    pca_impulsion(0, 1500); pca_impulsion(1, 1500); print("90 degres");  time.sleep(1)
    pca_impulsion(0, 2500); pca_impulsion(1, 2500); print("180 degres"); time.sleep(1)
`,
  }),

  test({
    // Robot araignée complet (cf. araignee-element.mts) : châssis, 4 pattes
    // (8 articulations), PCA9685, batterie ET Pico W EMBARQUÉS. Depuis la
    // v2026.8.24 il n'a plus aucune broche : le schéma est le robot SEUL, il
    // EST la carte (board picow) et son bus I²C interne relie sa Pico W à son
    // PCA9685. Depuis la v2026.8.68 le câblage des servos n'a PLUS de valeur par
    // défaut : le schéma déclare les huit canaux (0..7, coxa puis patella des
    // pattes avant-gauche, avant-droite, arrière-gauche, arrière-droite), ceux
    // que le programme pilote. Les inversions et le placement sont ceux de
    // Frank, relevés sur son schéma retouché — ne pas les redisposer.
    name: 'araignee-pico', board: 'picow', ext: 'py',
    parts: [
      {
        id: 'Act1', type: 'araignee', x: 1620, y: 720,
        attrs: {
          address: '0x7F', speed: '2',
          ad0: '1', ad1: '1', ad2: '1', ad3: '1', ad4: '1', ad5: '1',
          chcoxa0: '0', chpatella0: '1', chcoxa1: '2', chpatella1: '3',
          chcoxa2: '4', chpatella2: '5', chcoxa3: '6', chpatella3: '7',
          revcoxa2: '1', revcoxa3: '1',
        },
      },
    ],
    wires: () => [],
    expect: { kind: 'i2c-part', partId: 'Act1' },
    code: `# Test robot araignee : les 8 articulations (4 pattes) sont pilotees par le
# PCA9685 embarque a l'adresse 0x7F (pads AD0..AD5 tous ponte'es, reglage par
# defaut du robot). Canaux 0/1 = coxa/patella avant-gauche, 2/3 avant-droite,
# 4/5 arriere-gauche, 6/7 arriere-droite. Le bus est INTERNE au robot : la Pico W
# du chassis y parle par I2C0, il n'y a rien a cabler dehors.
from machine import Pin, I2C
import time

i2c = I2C(0, sda=Pin(0), scl=Pin(1), freq=400000)
PCA = 0x7F

def pca_ecrit(reg, val):
    i2c.writeto_mem(PCA, reg, bytes([val]))

# Impulsion du canal : creneau demarre a 0, coupe a duree/20 ms x 4096 pas.
def pca_impulsion(canal, microsecondes):
    off = microsecondes * 4096 // 20000
    i2c.writeto_mem(PCA, 0x06 + 4 * canal, bytes([0x00, 0x00, off & 0xFF, off >> 8]))

# 500 us = 0 degre, 1500 us = 90 (patte tendue), 2500 us = 180.
def impulsion(degres):
    return 500 + degres * 2000 // 180

# Pose complete : le meme angle de coxa et de patella pour les 4 pattes.
def pose(coxa, patella):
    for patte in range(4):
        pca_impulsion(2 * patte, impulsion(coxa))
        pca_impulsion(2 * patte + 1, impulsion(patella))

pca_ecrit(0x00, 0x10)  # MODE1 : sleep pour regler le prescaler
pca_ecrit(0xFE, 121)   # prescale 50 Hz (25 MHz / (4096 x 50) - 1)
pca_ecrit(0x00, 0x20)  # MODE1 : reveil + auto-increment

while True:
    pose(90, 90);   print("Debout");
    time.sleep(1)
    pose(90, 130);  print("pattes levées");
    time.sleep(1)
    pose(16, 130);  print("pattes sur le côté");    time.sleep(1)
    pose(125, 130); print("pattes avant arrière");  time.sleep(5)
`,
  }),

  test({
    name: 'lcd-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'Aff1', type: 'lcd', x: 620, y: 60, attrs: { pins: 'i2c', address: '0x27', cols: '16', rows: '2', lcdSize: '16x2' } }],
    wires: () => [
      w('Aff1', 'GND', 'U1', 'GND.1', 'black'),
      w('Aff1', 'VCC', 'U1', 'VBUS', 'red'),
      w('Aff1', 'SDA', 'U1', 'GP0', 'blue'),
      w('Aff1', 'SCL', 'U1', 'GP1', 'yellow'),
    ],
    expect: { kind: 'i2c-part', partId: 'Aff1' },
    code: `# Test LCD 16x2 en I2C (PCF8574 à l'adresse 0x27) : pilote HD44780 4 bits inline.
from machine import Pin, I2C
import time

i2c = I2C(0, sda=Pin(0), scl=Pin(1), freq=100000)
ADRESSE = 0x27
RETRO = 0x08   # bit P3 = rétroéclairage

def quartet(nib, rs):
    octet = (nib << 4) | RETRO | (0x01 if rs else 0x00)
    i2c.writeto(ADRESSE, bytes([octet | 0x04]))   # E haut
    i2c.writeto(ADRESSE, bytes([octet]))          # E bas : le quartet est validé

def commande(c):
    quartet(c >> 4, False)
    quartet(c & 0x0F, False)

def donnee(c):
    quartet(c >> 4, True)
    quartet(c & 0x0F, True)

# Initialisation 4 bits (séquence HD44780)
time.sleep_ms(50)
quartet(0x03, False); time.sleep_ms(5)
quartet(0x03, False); quartet(0x03, False); quartet(0x02, False)
commande(0x28)   # 4 bits, 2 lignes
commande(0x0C)   # affichage ON, curseur OFF
commande(0x06)   # incrémentation
commande(0x01)   # effacement
time.sleep_ms(2)

for c in "Kablix LCD I2C":
    donnee(ord(c))
commande(0x80 | 0x40)   # début de la 2e ligne
for c in "sur Pico !":
    donnee(ord(c))
print("Texte envoye au LCD")
`,
  }),

  test({
    name: 'oled-ssd1306-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'Aff1', type: 'oled-ssd1306', x: 660, y: 70, attrs: { pins: 'i2c' } }],
    wires: () => [
      w('Aff1', 'GND', 'U1', 'GND.1', 'black'),
      w('Aff1', 'VDD', 'U1', '3V3', 'red'),
      w('Aff1', 'SDA', 'U1', 'GP0', 'blue'),
      w('Aff1', 'SCL', 'U1', 'GP1', 'yellow'),
    ],
    expect: { kind: 'i2c-part', partId: 'Aff1' },
    code: `# Test OLED SSD1306 en I2C (0x3C) : cadre + damier, pilote minimal inline.
from machine import Pin, I2C
import time

i2c = I2C(0, sda=Pin(0), scl=Pin(1), freq=400000)
ADRESSE = 0x3C

def cmd(*octets):
    i2c.writeto(ADRESSE, bytes([0x00]) + bytes(octets))

# Initialisation classique 128x64
for c in (0xAE, 0xD5, 0x80, 0xA8, 0x3F, 0xD3, 0x00, 0x40, 0x8D, 0x14,
          0x20, 0x00, 0xA1, 0xC8, 0xDA, 0x12, 0x81, 0xCF, 0xD9, 0xF1,
          0xDB, 0x40, 0xA4, 0xA6, 0xAF):
    cmd(c)
cmd(0x21, 0, 127)   # colonnes 0..127
cmd(0x22, 0, 7)     # pages 0..7

# Tampon : cadre + damier central
tampon = bytearray(1024)
for x in range(128):
    tampon[x] |= 0x01          # ligne du haut
    tampon[896 + x] |= 0x80    # ligne du bas
for page in range(8):
    tampon[page * 128] = 0xFF        # bord gauche
    tampon[page * 128 + 127] = 0xFF  # bord droit
for page in range(2, 6):
    for x in range(32, 96):
        if (x // 8 + page) % 2 == 0:
            tampon[page * 128 + x] = 0xFF

# Envoi de la mémoire vidéo par paquets de 16 octets
for i in range(0, 1024, 16):
    i2c.writeto(ADRESSE, bytes([0x40]) + bytes(tampon[i:i + 16]))
print("Dessin envoye a l'OLED")
`,
  }),

  test({
    name: 'ili9341-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'Aff1', type: 'ili9341', x: 620, y: 40 }],
    wires: () => [
      w('Aff1', 'VCC', 'U1', '3V3', 'red'),
      w('Aff1', 'GND', 'U1', 'GND.1', 'black'),
      w('Aff1', 'CS', 'U1', 'GP17', 'yellow'),
      w('Aff1', 'RST', 'U1', 'GP21', 'gray'),
      w('Aff1', 'D/C', 'U1', 'GP20', 'orange'),
      w('Aff1', 'MOSI', 'U1', 'GP19', 'blue'),
      w('Aff1', 'SCK', 'U1', 'GP18', 'green'),
      w('Aff1', 'MISO', 'U1', 'GP16', 'purple'),
      w('Aff1', 'LED', 'U1', '3V3', 'red'),
    ],
    expect: { kind: 'spi-device', partId: 'Aff1', dcPin: 'GP20', csPin: 'GP17' },
    code: `# Test écran TFT ILI9341 (SPI) : init registres bruts + carré rouge 100x100.
from machine import Pin, SPI
import time

cs = Pin(17, Pin.OUT, value=1)
dc = Pin(20, Pin.OUT, value=0)
rst = Pin(21, Pin.OUT, value=1)
spi = SPI(0, baudrate=10_000_000, sck=Pin(18), mosi=Pin(19), miso=Pin(16))

def commande(c, donnees=b""):
    cs.value(0)
    dc.value(0)
    spi.write(bytes([c]))
    if donnees:
        dc.value(1)
        spi.write(donnees)
    cs.value(1)

# Reset matériel puis réveil
rst.value(0); time.sleep_ms(10); rst.value(1); time.sleep_ms(10)
commande(0x01); time.sleep_ms(5)    # soft reset
commande(0x11); time.sleep_ms(5)    # sortie de veille
commande(0x3A, b"\\x55")             # format de pixel RGB565
commande(0x29)                       # affichage ON

# Fenêtre 100x100 en haut à gauche puis remplissage rouge
commande(0x2A, b"\\x00\\x00\\x00\\x63")   # colonnes 0..99
commande(0x2B, b"\\x00\\x00\\x00\\x63")   # lignes 0..99
cs.value(0)
dc.value(0)
spi.write(b"\\x2C")                  # RAMWR
dc.value(1)
ligne = b"\\xF8\\x00" * 100           # rouge RGB565, une ligne
for _ in range(100):
    spi.write(ligne)
cs.value(1)
print("Carre rouge envoye au TFT")
`,
  }),

  test({
    name: 'microsd-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'Mod1', type: 'microsd', x: 680, y: 90 }],
    wires: () => [
      w('Mod1', 'VCC', 'U1', '3V3', 'red'),
      w('Mod1', 'GND', 'U1', 'GND.1', 'black'),
      w('Mod1', 'CS', 'U1', 'GP17', 'yellow'),
      w('Mod1', 'DI', 'U1', 'GP19', 'blue'),
      w('Mod1', 'DO', 'U1', 'GP16', 'purple'),
      w('Mod1', 'SCK', 'U1', 'GP18', 'green'),
    ],
    expect: { kind: 'spi-device', partId: 'Mod1', dcPin: null, csPin: 'GP17' },
    code: `# Test carte microSD (SPI) : initialisation protocole brut (CMD0/CMD8/ACMD41).
from machine import Pin, SPI
import time

cs = Pin(17, Pin.OUT, value=1)
spi = SPI(0, baudrate=400_000, sck=Pin(18), mosi=Pin(19), miso=Pin(16))

def cmd(index, argument, crc):
    trame = bytes([
        0x40 | index,
        (argument >> 24) & 0xFF, (argument >> 16) & 0xFF,
        (argument >> 8) & 0xFF, argument & 0xFF, crc,
    ])
    spi.write(trame)
    for _ in range(8):
        r = spi.read(1, 0xFF)[0]
        if r != 0xFF:
            return r
    return 0xFF

spi.write(b"\\xFF" * 10)      # 80 coups d'horloge, CS haut : mode SPI
cs.value(0)
r0 = cmd(0, 0, 0x95)          # CMD0 : retour à l'état idle (attendu 0x01)
r8 = cmd(8, 0x1AA, 0x87)      # CMD8 : tension + motif (attendu 0x01)
spi.read(4, 0xFF)             # fin de la réponse R7
resultat = 0xFF
for _ in range(200):
    cmd(55, 0, 0x65)          # CMD55 : préfixe de commande applicative
    resultat = cmd(41, 0x40000000, 0x77)   # ACMD41 : init (attendu 0x00)
    if resultat == 0:
        break
cs.value(1)
print("CMD0 =", r0, " CMD8 =", r8)
print("Carte SD detectee : init OK" if resultat == 0 else "ECHEC de l'init SD")
`,
  }),

  test({
    name: 'neopixel-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'L1', type: 'neopixel', x: 680, y: 100 }],
    wires: () => [
      w('L1', 'VDD', 'U1', 'VBUS', 'red'),
      w('L1', 'VSS', 'U1', 'GND.1', 'black'),
      w('L1', 'DIN', 'U1', 'GP0', 'green'),
    ],
    expect: { kind: 'neopixel', partId: 'L1', mcuPin: 'GP0', count: 1 },
    code: `# Test NeoPixel (1 pixel WS2812) : rouge, vert, bleu en boucle.
from machine import Pin
import neopixel
import time

pixel = neopixel.NeoPixel(Pin(0), 1)
couleurs = [("Rouge", (255, 0, 0)), ("Vert", (0, 255, 0)), ("Bleu", (0, 0, 255))]
while True:
    for nom, rgb in couleurs:
        pixel[0] = rgb
        pixel.write()
        print(nom)
        time.sleep(0.6)
`,
  }),

  test({
    name: 'neopixel-matrix-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'L1', type: 'neopixel-matrix', x: 660, y: 50, attrs: { rows: '8', cols: '8' } }],
    wires: () => [
      w('L1', 'VCC', 'U1', 'VBUS', 'red'),
      w('L1', 'GND', 'U1', 'GND.1', 'black'),
      w('L1', 'DIN', 'U1', 'GP0', 'green'),
    ],
    expect: { kind: 'neopixel', partId: 'L1', mcuPin: 'GP0', count: 64 },
    code: `# Test matrice NeoPixel 8x8 (64 pixels) : diagonale blanche + dégradé.
from machine import Pin
import neopixel
import time

matrice = neopixel.NeoPixel(Pin(0), 64)
for y in range(8):
    for x in range(8):
        if x == y:
            matrice[y * 8 + x] = (255, 255, 255)
        else:
            matrice[y * 8 + x] = (x * 32, 0, y * 32)
matrice.write()
print("Matrice remplie")
`,
  }),

  test({
    name: 'led-ring-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico', 136.75, 213.6),
      { id: 'L1', type: 'led-ring', x: 90, y: 30, attrs: { pixels: '16' } },
    ],
    wires: () => [
      w('L1', 'VCC', 'U1', 'VBUS', 'red'),
      w('L1', 'GND', 'U1', 'GND.1', 'black'),
      w('L1', 'DIN', 'U1', 'GP28', 'green'),
    ],
    expect: { kind: 'neopixel', partId: 'L1', mcuPin: 'GP28', count: 16 },
    code: `# Test anneau NeoPixel (16 pixels) : chenillard bleu.
from machine import Pin
import neopixel
import time

anneau = neopixel.NeoPixel(Pin(28), 16)
while True:
    for i in range(16):
        anneau.fill((0, 0, 0))
        anneau[i] = (0, 80, 255)
        anneau.write()
        time.sleep(0.1)
`,
  }),

  test({
    name: 'ntc-temp-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'Capt1', type: 'ntc-temp', x: 680, y: 90, attrs: { temperature: '25' } }],
    wires: () => [
      w('Capt1', 'VCC', 'U1', '3V3', 'red'),
      w('Capt1', 'GND', 'U1', 'GND.7', 'black'),
      w('Capt1', 'OUT', 'U1', 'GP26', 'green'),
    ],
    expect: { kind: 'analog-source', partId: 'Capt1', mcuPin: 'GP26' },
    code: `# Test capteur de température NTC : lecture analogique sur GP26 (ADC0).
from machine import ADC
import time

capteur = ADC(26)
while True:
    print("ADC0 =", capteur.read_u16())
    time.sleep(0.3)
`,
  }),

  // Même montage que `rv-uno`, sur les trois entrées ADC du Pico (GP26/27/28).
  test({
    name: 'rv-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico'),
      { id: 'Rv1', type: 'ldr', x: 680, y: 90, attrs: { lux: '500', r1lx: '50000', gamma: '0.7' } },
      { id: 'Rv2', type: 'ntc', x: 780, y: 90, attrs: { temperature: '25', r25: '10000', beta: '3950', tmin: '-55', tmax: '125' } },
      { id: 'Rv3', type: 'ptc', x: 880, y: 90, attrs: { temperature: '25', r25: '2000', tc: '0.79', tmin: '-55', tmax: '125' } },
      { id: 'R1', type: 'resistor', x: 680, y: 200, attrs: { value: '50000' } },
      { id: 'R2', type: 'resistor', x: 780, y: 200, attrs: { value: '10000' } },
      { id: 'R3', type: 'resistor', x: 880, y: 200, attrs: { value: '2000' } },
    ],
    wires: () => [
      w('Rv1', '1', 'U1', '3V3', 'red'),
      w('Rv2', '1', 'Rv1', '1', 'red'),
      w('Rv3', '1', 'Rv2', '1', 'red'),
      w('Rv1', '2', 'U1', 'GP26', 'green'),
      w('Rv2', '2', 'U1', 'GP27', 'green'),
      w('Rv3', '2', 'U1', 'GP28', 'green'),
      w('R1', '1', 'Rv1', '2', 'blue'),
      w('R2', '1', 'Rv2', '2', 'blue'),
      w('R3', '1', 'Rv3', '2', 'blue'),
      w('R1', '2', 'U1', 'GND.7', 'black'),
      w('R2', '2', 'R1', '2', 'black'),
      w('R3', '2', 'R2', '2', 'black'),
    ],
    expect: {
      kind: 'variable-resistor',
      repos: { GP26: 0.98725, GP27: 0.5, GP28: 0.5 },
      pousse: { lux: 5000, celsius: 80 },
      pousses: { GP26: 0.99743, GP27: 0.88732, GP28: 0.41076 },
    },
    code: `# Test des trois résistances variables nues : chacune forme un pont
# diviseur avec une résistance fixe de sa valeur de repos.
#   ADC0/GP26 : LDR 50 kΩ à 1 lx + 50 kΩ   (curseur = éclairement)
#   ADC1/GP27 : CTN 10 kΩ à 25 °C + 10 kΩ  (curseur = température)
#   ADC2/GP28 : CTP 2 kΩ à 25 °C + 2 kΩ    (curseur = température)
# En simulation : éclairer la LDR et chauffer la CTN FAIT MONTER la lecture,
# chauffer la CTP la fait descendre.
from machine import ADC
import time

ldr = ADC(26)
ctn = ADC(27)
ctp = ADC(28)

while True:
    print("LDR ADC0 =", ldr.read_u16(),
          "| CTN ADC1 =", ctn.read_u16(),
          "| CTP ADC2 =", ctp.read_u16())
    time.sleep(0.3)
`,
  }),

  test({
    name: 'gas-sensor-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'Capt1', type: 'gas-sensor', x: 680, y: 90, attrs: { sensitivity: '50' } }],
    wires: () => [
      w('Capt1', 'VCC', 'U1', '3V3', 'red'),
      w('Capt1', 'GND', 'U1', 'GND.7', 'black'),
      w('Capt1', 'AOUT', 'U1', 'GP26', 'green'),
      w('Capt1', 'DOUT', 'U1', 'GP14', 'yellow'),
    ],
    expect: { kind: 'ao-do', partId: 'Capt1', analog: 'GP26', digital: 'GP14' },
    code: `# Test capteur de gaz (MQ) : AOUT analogique + DOUT numérique (actif bas).
from machine import ADC, Pin
import time

aout = ADC(26)
dout = Pin(14, Pin.IN)
while True:
    etat = "GAZ DETECTE" if dout.value() == 0 else "rien"
    print("AOUT =", aout.read_u16(), " DOUT =", etat)
    time.sleep(0.3)
`,
  }),

  test({
    name: 'heartbeat-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'Capt1', type: 'heartbeat', x: 680, y: 90, attrs: { bpm: '72' } }],
    wires: () => [
      w('Capt1', 'VCC', 'U1', '3V3', 'red'),
      w('Capt1', 'GND', 'U1', 'GND.7', 'black'),
      w('Capt1', 'OUT', 'U1', 'GP26', 'green'),
    ],
    expect: { kind: 'analog-source', partId: 'Capt1', mcuPin: 'GP26' },
    code: `# Test capteur de pouls : le signal analogique bat au rythme cardiaque.
from machine import ADC
import time

pouls = ADC(26)
while True:
    print("pouls =", pouls.read_u16())
    time.sleep(0.05)
`,
  }),

  test({
    name: 'flame-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico', 296.75, 123.6),
      { id: 'Capt1', type: 'flame', x: 112.75, y: 64.8, attrs: { sensitivity: '50' } },
    ],
    wires: () => [
      w('Capt1', 'VCC', 'U1', '3V3', 'red'),
      w('Capt1', 'GND', 'U1', 'GND.3', 'black'),
      w('Capt1', 'AOUT', 'U1', 'GP26', 'green'),
      w('Capt1', 'DOUT', 'U1', 'GP21', 'yellow'),
    ],
    expect: { kind: 'ao-do', partId: 'Capt1', analog: 'GP26', digital: 'GP21' },
    code: `# Test capteur de flamme : AOUT baisse quand la flamme approche, DOUT actif bas.
from machine import ADC, Pin
import time

aout = ADC(26)
dout = Pin(21, Pin.IN)
while True:
    etat = "FLAMME !" if dout.value() == 0 else "rien"
    print("AOUT =", aout.read_u16(), " DOUT =", etat)
    time.sleep(0.3)
`,
  }),

  test({
    name: 'sound-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'Capt1', type: 'sound', x: 680, y: 90, attrs: { sensitivity: '50' } }],
    wires: () => [
      w('Capt1', 'VCC', 'U1', '3V3', 'red'),
      w('Capt1', 'GND', 'U1', 'GND.7', 'black'),
      w('Capt1', 'AOUT', 'U1', 'GP26', 'green'),
      w('Capt1', 'DOUT', 'U1', 'GP14', 'yellow'),
    ],
    expect: { kind: 'ao-do', partId: 'Capt1', analog: 'GP26', digital: 'GP14' },
    code: `# Test capteur de son : AOUT analogique + DOUT numérique (actif bas).
from machine import ADC, Pin
import time

aout = ADC(26)
dout = Pin(14, Pin.IN)
while True:
    etat = "SON DETECTE" if dout.value() == 0 else "silence"
    print("AOUT =", aout.read_u16(), " DOUT =", etat)
    time.sleep(0.3)
`,
  }),

  test({
    name: 'dht22-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'Capt1', type: 'dht22', x: 680, y: 90, attrs: { temperature: '22', humidity: '50' } }],
    wires: () => [
      w('Capt1', 'VCC', 'U1', '3V3', 'red'),
      w('Capt1', 'DATA', 'U1', 'GP14', 'green'),
      w('Capt1', 'GND', 'U1', 'GND.5', 'black'),
    ],
    expect: { kind: 'dht22', partId: 'Capt1', mcuPin: 'GP14' },
    code: `# Test DHT22 : température et humidité via le module dht de MicroPython.
from machine import Pin
import dht
import time

capteur = dht.DHT22(Pin(14))
while True:
    time.sleep(2.1)   # le DHT22 ne répond qu'une fois toutes les 2 s
    try:
        capteur.measure()
        print("T =", capteur.temperature(), "C   H =", capteur.humidity(), "%")
    except OSError as e:
        print("lecture ratee :", e)
`,
  }),

  test({
    name: 'diode-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico'),
      { id: 'D1', type: 'diode', x: 400, y: 60 },
      { id: 'R1', type: 'resistor', x: 500, y: 60, attrs: { value: '220' } },
      { id: 'L1', type: 'led', x: 600, y: 60, attrs: { color: 'green' } },
      { id: 'D2', type: 'diode', x: 400, y: 160 },
      { id: 'R2', type: 'resistor', x: 500, y: 160, attrs: { value: '220' } },
      { id: 'L2', type: 'led', x: 600, y: 160, attrs: { color: 'red' } },
    ],
    wires: () => [
      w('D1', 'A', 'U1', 'GP15', 'green'),
      w('D1', 'K', 'R1', '1', 'green'),
      w('R1', '2', 'L1', 'A', 'green'),
      w('L1', 'C', 'U1', 'GND.5', 'black'),
      // Diode à l'envers : la branche rouge ne s'allume jamais.
      w('D2', 'K', 'U1', 'GP14', 'orange'),
      w('D2', 'A', 'R2', '1', 'orange'),
      w('R2', '2', 'L2', 'A', 'orange'),
      w('L2', 'C', 'U1', 'GND.3', 'black'),
    ],
    expect: { kind: 'diode', ledOn: 'L1', ledOff: 'L2', drop: 0.6 },
    code: `# Test diode : les deux broches passent au niveau haut en meme temps.
# Seule la LED verte s'allume — la diode de la branche rouge est montee a
# l'envers (cathode cote GP14) et bloque le passage du courant.
from machine import Pin
import time

passante = Pin(15, Pin.OUT)
bloquee = Pin(14, Pin.OUT)

while True:
    passante.value(1)
    bloquee.value(1)
    time.sleep(1)
    passante.value(0)
    bloquee.value(0)
    time.sleep(1)
`,
  }),

  // Même montage que `condo-uno` sous 3,3 V (mais trois fois plus vif), avec les
  // trois ADC du RP2040. Les
  // condensateurs sont posés ici avec leurs types HISTORIQUES (`condo-p-1`,
  // `condo-p-2`) : ils ont quitté la palette en v2026.7.232 mais restent des
  // types valides — un projet enregistré avant ne doit jamais cesser de s'ouvrir.
  test({
    name: 'condo-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico'),
      { id: 'R1', type: 'resistor', x: 480, y: 60, attrs: { value: '33000' } },
      { id: 'C1', type: 'condo-np', x: 620, y: 60, attrs: { ctype: 'np', value: '1e-6', vmax: '63' } },
      { id: 'R2', type: 'resistor', x: 480, y: 180, attrs: { value: '10000' } },
      { id: 'C2', type: 'condo-p-1', x: 620, y: 180, attrs: { ctype: 'p', value: '1e-5', vmax: '16' } },
      { id: 'R3', type: 'resistor', x: 480, y: 300, attrs: { value: '3300' } },
      { id: 'C3', type: 'condo-p-2', x: 620, y: 300, attrs: { ctype: 'chem', value: '1e-4', vmax: '16' } },
    ],
    wires: () => [
      w('R1', '1', 'U1', 'GP15', 'green'),
      w('R1', '2', 'C1', '1', 'green'),
      w('C1', '1', 'U1', 'GP26', 'blue'),
      w('C1', '2', 'U1', 'GND.5', 'black'),
      w('R2', '1', 'U1', 'GP15', 'green'),
      w('R2', '2', 'C2', '1', 'green'),
      w('C2', '1', 'U1', 'GP27', 'blue'),
      w('C2', '2', 'U1', 'GND.6', 'black'),
      w('R3', '1', 'U1', 'GP15', 'green'),
      w('R3', '2', 'C3', '1', 'green'),
      w('C3', '1', 'U1', 'GP28', 'blue'),
      w('C3', '2', 'U1', 'GND.7', 'black'),
    ],
    // RC = R × C, la sortie du RP2040 ajoutant ses 25 Ω : 33 ms / 0,1 s / 0,33 s.
    // Les trois RC ont été DIVISÉS PAR 3 en v2026.8.4 (retour de Frank : « courbe
    // très longue et affichage aussi ») : la décade 1 / 3,3 / 10 est intacte, mais
    // un cycle charge + décharge dure 2 s au lieu de 6.
    expect: {
      kind: 'capacitor', drivePin: 'GP15', drive: 'high', volts: 3.3,
      caps: [
        { partId: 'C1', target: 3.3, tau: 0.033, mcuPins: ['GP26'] },
        { partId: 'C2', target: 3.3, tau: 0.1, mcuPins: ['GP27'] },
        { partId: 'C3', target: 3.3, tau: 0.33, mcuPins: ['GP28'] },
      ],
    },
    code: `# Trois circuits RC sur la MEME broche de commande. Seule la constante de
# temps RC change : 33 kOhm x 1 uF = 33 ms (film), 10 kOhm x 10 uF = 0,1 s
# (tantale), 3,3 kOhm x 100 uF = 0,33 s (chimique). A un RC la tension a fait
# 63 % du chemin, a 3 RC elle est a 95 % : la courbe est deja plate, d'ou 1 s
# par phase (un cycle charge + decharge dure 2 s).
#
# Le TRACEUR DE COURBES affiche les trois exponentielles SANS une seule ligne
# de code : la tension du condensateur est posee sur ADC0/1/2 (GP26, GP27,
# GP28), et toute tension posee sur une entree analogique est tracee par une
# sonde interne. La console ne sert qu'a relire les valeurs en clair : elle
# n'imprime qu'une mesure sur deux (la courbe, elle, reste continue).
from machine import ADC, Pin
import time

charge = Pin(15, Pin.OUT, value=0)
mesure = [ADC(Pin(26)), ADC(Pin(27)), ADC(Pin(28))]

def phase(niveau, nom):
    charge.value(niveau)
    for i in range(8):                # 8 x 125 ms = 1 s = 3 RC du plus lent
        time.sleep_ms(125)
        if i % 2 == 0:                # la premiere mesure tombe des 125 ms
            volts = ["%.2f V" % (a.read_u16() * 3.3 / 65535) for a in mesure]
            print(nom, "   ".join(volts))

print("          film(GP26) tantale(GP27) chimique(GP28)")
while True:
    phase(1, "charge  ")
    phase(0, "decharge")
`,
  }),

  test({
    name: 'dht11-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico', 66.75, 143.6),
      { id: 'Capt1', type: 'dht11', x: 160, y: 30, attrs: { temperature: '22', humidity: '50' } },
    ],
    wires: () => [
      w('Capt1', 'VCC', 'U1', '3V3', 'red'),
      w('Capt1', 'DATA', 'U1', 'GP22', 'green'),
      w('Capt1', 'GND', 'U1', 'GND.3', 'black'),
    ],
    expect: { kind: 'dht22', partId: 'Capt1', mcuPin: 'GP22', model: 'dht11' },
    code: `# Test DHT11 : meme module MicroPython que le DHT22, mais des valeurs
# ENTIERES (pas de dixieme), 20 a 90 % HR et 0 a 50 degres C.
from machine import Pin
import dht
import time

capteur = dht.DHT11(Pin(22))
while True:
    time.sleep(1.1)   # le DHT11 ne repond qu'une fois par seconde
    try:
        capteur.measure()
        print("T =", capteur.temperature(), "C   H =", capteur.humidity(), "%")
    except OSError as e:
        print("lecture ratee :", e)
`,
  }),

  test({
    name: 'ventilo-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico'),
      { id: 'Alim1', type: 'alim', x: 620, y: 300, attrs: { voltage: '5', maxcurrent: '1' } },
      { id: 'Act1', type: 'ventilo', x: 620, y: 40, attrs: { voltage: '5', current: '0.85' } },
      { id: 'Act2', type: 'ventilo', x: 900, y: 40, attrs: { voltage: '5', current: '0.85' } },
    ],
    wires: () => [
      w('Act1', '+', 'Alim1', 'V+', 'red'),
      w('Act1', '-', 'Alim1', 'GND', 'black'),
      w('Act2', '+', 'U1', 'GP15', 'orange'),
      w('Act2', '-', 'U1', 'GND.5', 'black'),
    ],
    expect: { kind: 'fan', spins: 'Act1', starved: 'Act2' },
    code: `# Test ventilateur. Le premier tourne : il est branche sur l'alimentation de
# laboratoire (5 V, 1 A), qui fournit largement ses 850 mA.
# Le second est cable sur GP15 en PWM : il ne demarre JAMAIS, une sortie du Pico
# ne debite que quelques milliamperes. En vrai comme en simulation, il faut un
# transistor (ou un MOSFET) commande par la broche pour piloter un moteur.
from machine import Pin, PWM
import time

commande = PWM(Pin(15))
commande.freq(1000)
print("Le ventilateur de GP15 ne tournera pas : courant insuffisant.")

while True:
    for v in range(0, 65536, 1024):
        commande.duty_u16(v)
        time.sleep(0.04)
    for v in range(65535, -1, -1024):
        commande.duty_u16(max(0, v))
        time.sleep(0.04)
`,
  }),

  test({
    name: 'moteur-dc-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico'),
      { id: 'Alim1', type: 'alim', x: 620, y: 460, attrs: { voltage: '5', maxcurrent: '1' } },
      { id: 'R1', type: 'resistor', x: 300, y: 180, attrs: { value: '470' } },
      { id: 'T1', type: 'pn2222a', x: 440, y: 200 },
      { id: 'D1', type: 'diode', x: 620, y: 180, attrs: { vf: '0.6' } },
      { id: 'Act1', type: 'moteur-dc', x: 620, y: 40, attrs: { voltage: '5', current: '0.1' } },
      { id: 'Act2', type: 'moteur-dc', x: 1160, y: 40, attrs: { voltage: '5', current: '0.1' } },
      { id: 'R2', type: 'resistor', x: 300, y: 300, attrs: { value: '470' } },
      { id: 'T2', type: 'pn2222a', x: 880, y: 200 },
      { id: 'Act3', type: 'moteur-dc', x: 900, y: 40, attrs: { voltage: '5', current: '0.1' } },
    ],
    wires: () => [
      // Sortie a 3,3 V : base plus attaquee qu'en 5 V (470 ohms).
      w('R1', '1', 'U1', 'GP15', 'green'),
      w('R1', '2', 'T1', 'B', 'green'),
      w('T1', 'E', 'U1', 'GND.5', 'black'),
      w('T1', 'C', 'Act1', '2', 'blue'),
      w('Act1', '1', 'Alim1', 'V+', 'red'),
      w('Alim1', 'GND', 'U1', 'GND.4', 'black'),
      w('D1', 'K', 'Act1', '1', 'purple'),
      w('D1', 'A', 'Act1', '2', 'purple'),
      // Moteur branche EN DIRECT sur une broche du Pico : quelques milliamperes.
      w('Act2', '1', 'U1', 'GP13', 'orange'),
      w('Act2', '2', 'U1', 'GND.3', 'black'),
      // Sans diode de roue libre : le transistor explose a la coupure.
      w('R2', '1', 'U1', 'GP14', 'orange'),
      w('R2', '2', 'T2', 'B', 'orange'),
      w('T2', 'E', 'Alim1', 'GND', 'black'),
      w('T2', 'C', 'Act3', '2', 'blue'),
      w('Act3', '1', 'Alim1', 'V+', 'red'),
    ],
    expect: {
      kind: 'motor',
      steps: [
        {
          high: ['GP15', 'GP14'],
          motors: {
            Act1: { fault: 'none', spins: true },
            Act2: { fault: 'starved' },
            Act3: { fault: 'no-diode', blownTransistorId: 'T2' },
          },
        },
        { high: [], motors: { Act1: { powered: false }, Act3: { powered: false } } },
      ],
    },
    code: `# Test moteur a courant continu. Trois moteurs 5 V / 100 mA :
#   - GP15 : commande par un PN2222A, alimentation de laboratoire et diode de
#     roue libre en travers du moteur -> il tourne, tout est correct ;
#   - GP13 : moteur branche EN DIRECT sur la broche. Une sortie du Pico ne
#     debite que quelques milliamperes contre les 100 mA demandes : il ne
#     demarre JAMAIS ;
#   - GP14 : meme montage que le premier mais SANS diode de roue libre. Un
#     moteur est une bobine : couper son courant renvoie une surtension qui
#     detruit le transistor. Kablix le fait exploser.
from machine import Pin, PWM
import time

bon = PWM(Pin(15))
bon.freq(1000)
en_direct = PWM(Pin(13))
en_direct.freq(1000)
sans_diode = Pin(14, Pin.OUT)

print("GP13 : moteur en direct, courant insuffisant.")
print("GP14 : pas de diode de roue libre, le transistor va lacher.")

while True:
    # Montee et descente en PWM : la vitesse suit le rapport cyclique.
    for v in range(0, 65536, 1024):
        bon.duty_u16(v)
        en_direct.duty_u16(v)
        time.sleep(0.04)
    for v in range(65535, -1, -1024):
        bon.duty_u16(max(0, v))
        en_direct.duty_u16(max(0, v))
        time.sleep(0.04)
    # Tout ou rien sur la branche sans diode : c'est la COUPURE qui tue.
    sans_diode.value(1)
    time.sleep(1)
    sans_diode.value(0)
    time.sleep(1)
`,
  }),

  test({
    name: 'pn2222a-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico'),
      { id: 'Alim1', type: 'alim', x: 620, y: 380, attrs: { voltage: '5', maxcurrent: '1' } },
      { id: 'R1', type: 'resistor', x: 300, y: 180, attrs: { value: '470' } },
      { id: 'T1', type: 'pn2222a', x: 440, y: 200 },
      { id: 'Act1', type: 'ventilo', x: 620, y: 40, attrs: { voltage: '5', current: '0.12' } },
      { id: 'R2', type: 'resistor', x: 300, y: 280, attrs: { value: '10000' } },
      { id: 'T2', type: 'pn2222a', x: 880, y: 200 },
      { id: 'Act2', type: 'ventilo', x: 900, y: 40, attrs: { voltage: '5', current: '0.12' } },
    ],
    wires: () => [
      // Sortie a 3,3 V : il faut une base plus attaquee qu'en 5 V (470 ohms).
      w('R1', '1', 'U1', 'GP15', 'green'),
      w('R1', '2', 'T1', 'B', 'green'),
      w('T1', 'E', 'U1', 'GND.5', 'black'),
      w('T1', 'C', 'Act1', '-', 'blue'),
      w('Act1', '+', 'Alim1', 'V+', 'red'),
      w('Alim1', 'GND', 'U1', 'GND.4', 'black'),
      w('R2', '1', 'U1', 'GP14', 'orange'),
      w('R2', '2', 'T2', 'B', 'orange'),
      w('T2', 'E', 'U1', 'GND.3', 'black'),
      w('T2', 'C', 'Act2', '-', 'blue'),
      w('Act2', '+', 'Alim1', 'V+', 'red'),
    ],
    expect: {
      kind: 'transistor',
      steps: [
        { high: ['GP15', 'GP14'], on: { T1: 0.1936, T2: 0.0091 }, fanAmps: 0.12, fanSpins: ['Act1'], fanStalls: ['Act2'] },
        { high: [], off: ['T1', 'T2'], fanAmps: 0.12, fanStalls: ['Act1'] },
      ],
    },
    code: `# Test transistor PN2222A : le meme ventilateur 5 V / 120 mA sur les deux
# branches, commande par GP15 (base via 470 ohms) et par GP14 (base via
# 10 kOhms). Le transistor ne transmet que Gain x Ib :
#   GP15 : Ib = (3,3 - 0,7) / 470   = 5,5 mA  -> Ic max = 35 x 5,5  = 194 mA
#   GP14 : Ib = (3,3 - 0,7) / 10000 = 0,26 mA -> Ic max = 35 x 0,26 = 9 mA
# Le premier ventilateur tourne, le second ne demarre JAMAIS : on vise la
# SATURATION, sinon le montage aval ne marche pas.
from machine import Pin
import time

sature = Pin(15, Pin.OUT)
pas_sature = Pin(14, Pin.OUT)
print("GP14 : base sous-attaquee, son ventilateur ne tournera pas.")

while True:
    sature.value(1)
    pas_sature.value(1)
    time.sleep(2)
    sature.value(0)
    pas_sature.value(0)
    time.sleep(1)
`,
  }),

  test({
    name: 'transistor-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico'),
      { id: 'Alim1', type: 'alim', x: 620, y: 380, attrs: { voltage: '5', maxcurrent: '1' } },
      { id: 'R1', type: 'resistor', x: 300, y: 180, attrs: { value: '10000' } },
      // Memes deux modeles qu'en Arduino, mais attaques en 3,3 V : le courant de
      // base tombe a 0,26 mA, et avec lui tout ce que le montage peut commander.
      {
        id: 'T1', type: 'transistor', x: 440, y: 200,
        attrs: {
          pkg: 'to92', symbol: 'npn', text: 'BC\n547', named: '1', ref: 'BC547',
          e: '3', b: '2', c: '1', gain: '200', vcemax: '45', icmax: '0.1',
        },
      },
      { id: 'Act1', type: 'ventilo', x: 620, y: 40, attrs: { voltage: '5', current: '0.04' } },
      { id: 'R2', type: 'resistor', x: 300, y: 280, attrs: { value: '10000' } },
      {
        id: 'T2', type: 'transistor', x: 880, y: 200,
        attrs: {
          pkg: 'to92', symbol: 'npn', text: '2N\n3904', named: '1', ref: '2N3904',
          e: '1', b: '2', c: '3', gain: '100', vcemax: '40', icmax: '0.2',
        },
      },
      { id: 'Act2', type: 'ventilo', x: 900, y: 40, attrs: { voltage: '5', current: '0.04' } },
      // Troisieme branche : la moitie PNP du selecteur (8 references sur 16), que
      // les deux NPN ne montraient pas. Emetteur au 3,3 V, LED sous le
      // collecteur, base tiree vers le BAS pour conduire — logique inversee.
      { id: 'R3', type: 'resistor', x: 300, y: 560, attrs: { value: '4700' } },
      {
        id: 'T3', type: 'transistor', x: 440, y: 580,
        attrs: {
          pkg: 'to92', symbol: 'pnp', text: 'BC\n557', named: '1', ref: 'BC557',
          e: '3', b: '2', c: '1', gain: '200', vcemax: '45', icmax: '0.1',
        },
      },
      { id: 'L1', type: 'led', x: 620, y: 580, attrs: { color: 'yellow' } },
      { id: 'R4', type: 'resistor', x: 760, y: 580, attrs: { value: '220' } },
      // Quatrieme branche : DARLINGTON. Meme ventilateur, mais une resistance de
      // base DIX FOIS plus grande (100 kOhm) — sous 3,3 V un NPN ordinaire n'y
      // arriverait pas, son gain de 30 000 si.
      { id: 'R5', type: 'resistor', x: 300, y: 760, attrs: { value: '100000' } },
      {
        id: 'T4', type: 'transistor', x: 440, y: 780,
        attrs: {
          pkg: 'to92', symbol: 'darlington-npn', schema: 'darlington-npn',
          text: 'BC\n517', named: '1', ref: 'BC517',
          e: '3', b: '2', c: '1', gain: '30000', vcemax: '30', icmax: '0.4',
        },
      },
      { id: 'Act3', type: 'ventilo', x: 620, y: 740, attrs: { voltage: '5', current: '0.04' } },
      // Cinquieme branche : MOSFET canal N, commande en TENSION. Sa grille est
      // isolee : elle se cable DIRECTEMENT sur la broche, sans resistance.
      {
        id: 'T5', type: 'transistor', x: 880, y: 780,
        attrs: {
          pkg: 'to92', symbol: 'nmos', schema: 'nmos-d',
          text: 'BS\n170', named: '1', ref: 'BS170',
          s: '3', g: '2', d: '1', gain: '0', rdson: '2.5', vcemax: '60', icmax: '0.5',
        },
      },
      { id: 'L2', type: 'led', x: 1040, y: 780, attrs: { color: 'green' } },
      { id: 'R6', type: 'resistor', x: 1180, y: 780, attrs: { value: '220' } },
    ],
    wires: () => [
      w('R1', '1', 'U1', 'GP15', 'green'),
      w('R1', '2', 'T1', 'B', 'green'),
      w('T1', 'E', 'U1', 'GND.5', 'black'),
      w('T1', 'C', 'Act1', '-', 'blue'),
      w('Act1', '+', 'Alim1', 'V+', 'red'),
      w('Alim1', 'GND', 'U1', 'GND.4', 'black'),
      w('R2', '1', 'U1', 'GP14', 'orange'),
      w('R2', '2', 'T2', 'B', 'orange'),
      w('T2', 'E', 'U1', 'GND.3', 'black'),
      w('T2', 'C', 'Act2', '-', 'blue'),
      w('Act2', '+', 'Alim1', 'V+', 'red'),
      // BC557 (PNP, C-B-E comme le BC547) : emetteur au 3,3 V, LED a la masse.
      w('T3', 'E', 'U1', '3V3', 'red'),
      w('R3', '1', 'U1', 'GP13', 'purple'),
      w('R3', '2', 'T3', 'B', 'purple'),
      w('T3', 'C', 'L1', 'A', 'blue'),
      w('L1', 'C', 'R4', '1', 'blue'),
      w('R4', '2', 'Alim1', 'GND', 'black'),
      // BC517 (darlington, gain 30 000) : Ib = (3,3 - 1,4) / 100k = 19 uA, donc
      // Ic max = 0,57 A — le ventilateur demarre malgre la base tres peu attaquee.
      w('R5', '1', 'U1', 'GP12', 'brown'),
      w('R5', '2', 'T4', 'B', 'brown'),
      w('T4', 'E', 'Alim1', 'GND', 'black'),
      w('T4', 'C', 'Act3', '-', 'blue'),
      w('Act3', '+', 'Alim1', 'V+', 'red'),
      // BS170 (MOSFET) : grille DIRECTEMENT sur la broche, aucun courant n'y entre.
      w('T5', 'G', 'U1', 'GP11', 'gray'),
      w('T5', 'S', 'Alim1', 'GND', 'black'),
      w('T5', 'D', 'L2', 'C', 'blue'),
      w('L2', 'A', 'R6', '1', 'green'),
      w('R6', '2', 'Alim1', 'V+', 'red'),
    ],
    expect: {
      kind: 'transistor',
      steps: [
        {
          high: ['GP15', 'GP14', 'GP12', 'GP11'],
          on: { T1: 0.052, T2: 0.026, T3: 0.1106, T4: 0.57, T5: 0.5 },
          ledOn: ['L1', 'L2'], fanAmps: 0.04,
          // Act3 tourne, mais sous 4,1 V : le darlington perd 0,9 V.
          fanSpins: ['Act1'], fanSlow: ['Act3'], fanStalls: ['Act2'],
        },
        {
          high: ['GP13'], off: ['T1', 'T2', 'T3', 'T4', 'T5'],
          ledOff: ['L1', 'L2'], fanAmps: 0.04, fanStalls: ['Act1', 'Act3'],
        },
      ],
    },
    code: `# Test du composant « Transistor » : un seul item de bibliotheque, le modele
# se choisit dans les proprietes. Ici cinq references du selecteur, une par
# famille. Les deux premieres commandent le MEME ventilateur 5 V / 40 mA a
# travers la MEME resistance de base 10 kOhm.
#   GP15 : BC547  (NPN, gain 200)        -> Ic max = 200 x 0,26 mA = 52 mA
#   GP14 : 2N3904 (NPN, gain 100)        -> Ic max = 100 x 0,26 mA = 26 mA
#   GP13 : BC557  (PNP, gain 200)        -> LED cote HAUT, logique INVERSEE
#   GP12 : BC517  (darlington, β 30 000) -> base 100 kOhm et pourtant 0,57 A
#   GP11 : BS170  (MOSFET canal N)       -> grille DIRECTE, sans resistance
# Le premier ventilateur tourne, le second ne demarre JAMAIS : a montage egal,
# c'est le gain qui decide. Le troisieme tourne avec DIX FOIS moins de courant
# de base : c'est tout l'interet du darlington.
#
# Les transistors n'ont PAS le meme brochage (BC547 et BC557 = C-B-E, 2N3904 =
# E-B-C), et pourtant les fils sont identiques : les broches gardent toujours
# les noms E, B et C, seule la patte qui les porte change. Le MOSFET, lui,
# porte G, D et S : il se commande en TENSION, sa grille ne consomme rien.
from machine import Pin
import time

fort = Pin(15, Pin.OUT)
faible = Pin(14, Pin.OUT)
inverse = Pin(13, Pin.OUT, value=1)   # PNP : conduit quand la broche est a 0
darlington = Pin(12, Pin.OUT)         # base 100 kOhm : un NPN ne suivrait pas
grille = Pin(11, Pin.OUT)             # MOSFET : commande en tension
print("GP14 : gain deux fois plus faible, son ventilateur ne tournera pas.")
print("GP13 : PNP, sa LED s'allume quand les ventilateurs sont commandes.")
print("GP12 : darlington, base 100 kOhm, son ventilateur tourne quand meme.")

while True:
    fort.value(1)
    faible.value(1)
    inverse.value(0)   # base tiree en bas : PNP sature, LED allumee
    darlington.value(1)
    grille.value(1)    # canal ouvert : LED verte allumee
    time.sleep(2)
    fort.value(0)
    faible.value(0)
    inverse.value(1)   # base au 3,3 V : PNP bloque, LED eteinte
    darlington.value(0)
    grille.value(0)
    time.sleep(1)
`,
  }),

  test({
    name: 'npn-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico'),
      { id: 'R1', type: 'resistor', x: 300, y: 180, attrs: { value: '4700' } },
      // Prototype generique : pattes numerotees, electrodes affectees dans
      // l'inspecteur — ici B sur 1, C sur 2, E sur 3.
      { id: 'T1', type: 'npn', x: 440, y: 200, attrs: { text: '2N\n2222', b: '1', c: '2', e: '3', gain: '100' } },
      { id: 'R2', type: 'resistor', x: 620, y: 60, attrs: { value: '220' } },
      { id: 'L1', type: 'led', x: 760, y: 60, attrs: { color: 'yellow' } },
    ],
    wires: () => [
      w('R1', '1', 'U1', 'GP16', 'green'),
      w('R1', '2', 'T1', '1', 'green'),
      w('T1', '3', 'U1', 'GND.5', 'black'),
      w('T1', '2', 'L1', 'C', 'blue'),
      w('L1', 'A', 'R2', '2', 'red'),
      w('R2', '1', 'U1', '3V3', 'red'),
    ],
    expect: {
      kind: 'transistor',
      steps: [
        { high: ['GP16'], on: { T1: 0.0553 }, ledOn: ['L1'] },
        { high: [], off: ['T1'], ledOff: ['L1'] },
      ],
    },
    code: `# Test transistor NPN generique (prototype de l'editeur de composant) :
# commande cote BAS. La LED est cablee au 3,3 V par sa resistance, le transistor
# ferme le circuit vers la masse quand GP16 passe au niveau haut.
# Les pattes du prototype sont numerotees : ici la base est sur la patte 1, le
# collecteur sur la 2 et l'emetteur sur la 3 (proprietes b / c / e).
from machine import Pin
import time

commande = Pin(16, Pin.OUT)

while True:
    commande.value(1)   # transistor sature : LED allumee
    time.sleep(0.8)
    commande.value(0)   # transistor bloque : LED eteinte
    time.sleep(0.8)
`,
  }),

  test({
    name: 'pnp-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico'),
      { id: 'R1', type: 'resistor', x: 300, y: 180, attrs: { value: '4700' } },
      { id: 'T1', type: 'pnp', x: 440, y: 200, attrs: { text: '2N\n2907', e: '1', b: '2', c: '3', gain: '100' } },
      { id: 'R2', type: 'resistor', x: 760, y: 60, attrs: { value: '220' } },
      { id: 'L1', type: 'led', x: 620, y: 60, attrs: { color: 'blue' } },
    ],
    wires: () => [
      w('T1', '1', 'U1', '3V3', 'red'),
      w('R1', '1', 'U1', 'GP17', 'green'),
      w('R1', '2', 'T1', '2', 'green'),
      w('T1', '3', 'L1', 'A', 'blue'),
      w('L1', 'C', 'R2', '1', 'blue'),
      w('R2', '2', 'U1', 'GND.5', 'black'),
    ],
    expect: {
      kind: 'transistor',
      steps: [
        { high: [], on: { T1: 0.0553 }, ledOn: ['L1'] },
        { high: ['GP17'], off: ['T1'], ledOff: ['L1'] },
      ],
    },
    code: `# Test transistor PNP generique (prototype de l'editeur de composant) :
# commande cote HAUT. L'emetteur est au 3,3 V, la LED pend sous le collecteur.
# Un PNP conduit quand sa base est TIREE VERS LE BAS : la LED s'allume quand
# GP17 est a 0 et s'eteint quand il passe a 1 — logique inversee.
from machine import Pin
import time

commande = Pin(17, Pin.OUT, value=0)   # au repos : base en bas, LED allumee

while True:
    commande.value(0)   # transistor sature : LED allumee
    time.sleep(0.8)
    commande.value(1)   # base au 3,3 V : transistor bloque
    time.sleep(0.8)
`,
  }),

  test({
    name: 'relais-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico'),
      { id: 'Alim1', type: 'alim', x: 300, y: 700, attrs: { voltage: '5', maxcurrent: '1' } },
      { id: 'R1', type: 'resistor', x: 300, y: 280, attrs: { value: '470' } },
      { id: 'T1', type: 'pn2222a', x: 440, y: 300 },
      { id: 'D1', type: 'diode', x: 620, y: 140 },
      { id: 'Rl1', type: 'relais', x: 620, y: 220, attrs: { voltage: '5' } },
      { id: 'R2', type: 'resistor', x: 860, y: 120, attrs: { value: '220' } },
      { id: 'L1', type: 'led', x: 1000, y: 120, attrs: { color: 'green' } },
      { id: 'Rl2', type: 'relais', x: 620, y: 420, attrs: { voltage: '5' } },
      { id: 'Rl3', type: 'relais', x: 620, y: 580, attrs: { voltage: '5' } },
      { id: 'D2', type: 'diode', x: 860, y: 580 },
    ],
    wires: () => [
      // Rl1 : bobine 5 V prise sur l'alim de laboratoire (le 3,3 V du Pico ne
      // ferait pas coller un G5V), commandee par un PN2222A sature.
      w('R1', '1', 'U1', 'GP15', 'green'),
      w('R1', '2', 'T1', 'B', 'green'),
      w('T1', 'E', 'U1', 'GND.5', 'black'),
      w('T1', 'C', 'Rl1', 'B2', 'blue'),
      w('Rl1', 'B1', 'Alim1', 'V+', 'red'),
      w('Alim1', 'GND', 'U1', 'GND.4', 'black'),
      w('D1', 'K', 'Rl1', 'B1', 'red'),
      w('D1', 'A', 'Rl1', 'B2', 'blue'),
      w('Rl1', 'Com.1', 'Alim1', 'V+', 'red'),
      w('Rl1', 'NO', 'R2', '1', 'green'),
      w('R2', '2', 'L1', 'A', 'green'),
      w('L1', 'C', 'U1', 'GND.3', 'black'),
      // Rl2 : bobine directement sur GP13, SANS diode de roue libre.
      w('Rl2', 'B1', 'U1', 'GP13', 'orange'),
      w('Rl2', 'B2', 'U1', 'GND.2', 'black'),
      // Rl3 : diode montee A L'ENVERS (anode vers le +).
      w('Rl3', 'B1', 'U1', 'GP12', 'yellow'),
      w('Rl3', 'B2', 'U1', 'GND.2', 'black'),
      w('D2', 'A', 'Rl3', 'B1', 'yellow'),
      w('D2', 'K', 'Rl3', 'B2', 'black'),
    ],
    expect: {
      kind: 'relay',
      steps: [
        {
          high: ['GP15', 'GP13', 'GP12'],
          relays: {
            Rl1: { commanded: true, closed: true, fault: 'none' },
            Rl2: { commanded: true, closed: false, fault: 'no-diode' },
            Rl3: { commanded: true, closed: false, fault: 'reversed-diode' },
          },
          ledOn: ['L1'],
        },
        {
          high: [],
          relays: { Rl1: { commanded: false, closed: false }, Rl2: { commanded: false } },
          ledOff: ['L1'],
        },
      ],
    },
    code: `# Test relais OMRON G5V. Trois cablages sur la meme carte :
#   Rl1 : CORRECT — bobine 5 V prise sur l'alimentation de laboratoire (une
#         sortie du Pico ne sort que 3,3 V, un G5V 5 V ne collerait pas) et
#         commandee par un PN2222A sature, diode de roue libre entre B1 et B2,
#         cathode vers le +. Il colle et allume la LED cablee sur NO.
#   Rl2 : bobine sur GP13 SANS diode de roue libre -> interdit.
#   Rl3 : diode montee a l'envers (anode vers le +) -> interdit aussi.
# Une bobine est une self : a la coupure elle renvoie une surtension qui detruit
# le transistor de commande. La diode de roue libre l'absorbe — elle n'est pas
# facultative.
from machine import Pin
import time

commande = Pin(15, Pin.OUT)          # Rl1, via le transistor
sans_diode = Pin(13, Pin.OUT)        # Rl2
diode_inversee = Pin(12, Pin.OUT)    # Rl3

while True:
    commande.value(1)
    sans_diode.value(1)
    diode_inversee.value(1)
    print("Seul Rl1 colle : les autres sont mal cables.")
    time.sleep(1.5)
    commande.value(0)
    sans_diode.value(0)
    diode_inversee.value(0)
    time.sleep(1.5)
`,
  }),

  test({
    name: 'keypad-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'Cl1', type: 'keypad', x: 620, y: 40, attrs: { columns: '4' } }],
    wires: () => [
      w('Cl1', 'R1', 'U1', 'GP2', 'yellow'),
      w('Cl1', 'R2', 'U1', 'GP3', 'yellow'),
      w('Cl1', 'R3', 'U1', 'GP4', 'yellow'),
      w('Cl1', 'R4', 'U1', 'GP5', 'yellow'),
      w('Cl1', 'C1', 'U1', 'GP6', 'green'),
      w('Cl1', 'C2', 'U1', 'GP7', 'green'),
      w('Cl1', 'C3', 'U1', 'GP8', 'green'),
      w('Cl1', 'C4', 'U1', 'GP9', 'green'),
    ],
    expect: { kind: 'keypad', partId: 'Cl1', rows: ['GP2', 'GP3', 'GP4', 'GP5'], cols: ['GP6', 'GP7', 'GP8', 'GP9'] },
    code: `# Test clavier matriciel 4x4 : balayage des lignes, colonnes en pull-up.
from machine import Pin
import time

lignes = [Pin(n, Pin.OUT, value=1) for n in (2, 3, 4, 5)]
colonnes = [Pin(n, Pin.IN, Pin.PULL_UP) for n in (6, 7, 8, 9)]
touches = [
    ["1", "2", "3", "A"],
    ["4", "5", "6", "B"],
    ["7", "8", "9", "C"],
    ["*", "0", "#", "D"],
]

while True:
    for i, ligne in enumerate(lignes):
        ligne.value(0)
        for j, colonne in enumerate(colonnes):
            if colonne.value() == 0:
                print("Touche :", touches[i][j])
        ligne.value(1)
    time.sleep(0.05)
`,
  }),

  icTest('CI1', 'pico'),
  icTest('CI2', 'pico'),
  icTest('CI3', 'pico'),

  // Même liaison DMX512 que `dmx-uno`, côté Pico : UART0 sur GP0, et la carte
  // Grove-DMX512 alimentée en 3,3 V (son SP3485 l'accepte).
  test({
    name: 'dmx-pico', board: 'pico', ext: 'py',
    kompix: ['dmx-grove', 'spot'],
    // Schéma retouché par Frank (v2026.8.91) : Mod1 = carte Grove, Mod2 =
    // projecteur, aux emplacements de SON montage.
    parts: [
      MCU('pico'),
      { id: 'Mod1', type: 'dmx-grove', x: 180, y: 160 },
      { id: 'Mod2', type: 'spot', x: 620, y: 20 },
    ],
    wires: () => [
      w('Mod1', 'VCC', 'U1', '3V3', 'red'),
      w('Mod1', 'GND.1', 'U1', 'GND.3', 'black'),
      w('Mod1', 'SIG', 'U1', 'GP0', 'green'),    // UART0 TX
      w('Mod2', '+', 'Mod1', '+', 'green'),
      w('Mod2', '-', 'Mod1', '-', 'blue'),
      w('Mod2', 'GND', 'Mod1', 'GND.2', 'black'),
    ],
    expect: {
      kind: 'dmx', partId: 'Mod2', mcuPin: 'GP0', address: 1, channels: 3,
      nets: [
        ['Mod1/VCC', 'U1/3V3'],
        ['Mod1/GND.1', 'U1/GND.3'],
        ['Mod1/SIG', 'U1/GP0'],
        ['Mod2/+', 'Mod1/+'],
        ['Mod2/-', 'Mod1/-'],
        ['Mod2/GND', 'Mod1/GND.2'],
      ],
    },
    code: `# Test DMX512 : la carte Grove-DMX512 transforme l'UART0 (GP0) en ligne DMX,
# le projecteur PAR 38 prend la couleur envoyée sur ses trois canaux.
# Adresse du projecteur : 1 -> canal 1 = rouge, 2 = vert, 3 = bleu.
from machine import UART, Pin
import time

ADRESSE = 1
CANAUX = 512

# 250 kbauds, 8 bits, sans parité, 2 bits de stop : c'est la trame DMX512.
uart = UART(0, baudrate=250000, bits=8, parity=None, stop=2, tx=Pin(0))
trame = bytearray(CANAUX + 1)   # trame[0] = octet de départ, 0 pour l'éclairage


def envoyer():
    # Une trame DMX s'ouvre par un BREAK (ligne basse >= 88 us) puis un MAB
    # (marque >= 8 us) : ce n'est pas un octet, l'UART ne le produit qu'avec
    # sendbreak().
    uart.sendbreak()
    time.sleep_us(12)
    uart.write(trame)


COULEURS = ((255, 0, 0), (0, 255, 0), (0, 0, 255))
while True:
    for rouge, vert, bleu in COULEURS:
        trame[ADRESSE] = rouge
        trame[ADRESSE + 1] = vert
        trame[ADRESSE + 2] = bleu
        envoyer()
        print("Couleur envoyée :", rouge, vert, bleu)
        time.sleep(1)
`,
  }),
];

// ================================================================================
// Partie RP2350 — chaque banc Pico a son jumeau Pico 2
// ================================================================================
// Frank veut « un projix pico2 ou 2w pour chaque projix pico existant », avec le
// MÊME programme de test. Deux choix en découlent, et ils ne sont pas neutres :
//
// 1. Le montage est repris du `.projix` DU DÉPÔT, pas des `parts`/`wires`
//    ci-dessus. Frank a redisposé et recâblé la plupart des bancs à la main
//    (deux boutons au lieu d'un, trois NeoPixel en chaîne, l'inverseur DIP
//    entièrement retourné…) : dériver de la spec donnerait un jumeau qui n'est
//    plus le banc qu'il ouvre.
// 2. Le programme n'est pas recopié, il est PARTAGÉ (`codeFrom`). Le jumeau
//    pointe le `.py` de son aîné : c'est le même fichier, il ne peut donc pas
//    s'en écarter au premier correctif — et treize de ces programmes ont déjà
//    été retouchés à la main (le pilote ILI9341 fait 7 ko, la spec 1).
//
// Le reste — attentes de vérification, composants de bibliothèque embarqués —
// est repris tel quel de l'aîné : c'est le même montage, sur l'autre puce.

/** Carte RP2350 correspondant à une carte RP2040. */
const JUMEAU_RP2350 = { pico: 'pico2', picow: 'pico2w' };

// Tracés des fils, calculés par l'autoroutage du VRAI éditeur (Chrome headless)
// et rangés là pour être versionnés :
//     node scripts/_router-jumeaux-pico2.mjs
// Sans ce fichier, les fils repartent en diagonale — les points de passage de
// l'aîné, tracés autour d'une carte PAYSAGE, traverseraient la carte portrait.
const FICHIER_ROUTAGE = join(HERE, 'pico2', '_routage.json');
const ROUTAGE = existsSync(FICHIER_ROUTAGE)
  ? JSON.parse(readFileSync(FICHIER_ROUTAGE, 'utf8'))
  : {};

// La Pico 2 est dessinée en PORTRAIT (90 × 220) là où la Pico est en paysage
// (208 × 83) : posée au même endroit, elle passerait SOUS les composants que
// Frank a serrés contre elle. On garde donc le montage tel qu'il est — c'est lui
// qui a un sens — et on le translate en bloc à droite de la carte. Une
// translation ne change ni les distances, ni les alignements, ni les angles.
const CARTE_2 = { x: 40, y: 60 };    // coin de la carte, comme la plupart des bancs
const MONTAGE_2 = { x: 200, y: 60 }; // coin du montage, dégagé des 90 px de carte

/** Construit le jumeau Pico 2 d'un banc Pico, à partir de son `.projix`. */
async function jumeauPico2(t) {
  const fichier = testProjix(t);
  const zip = await JSZip.loadAsync(readFileSync(fichier));
  const diagram = JSON.parse(await zip.file('diagram.json').async('string'));
  const carte = diagram.parts.find((p) => p.id === 'U1');
  if (!carte) throw new Error(`${t.name} : pas de carte U1 dans ${fichier}`);
  const autres = diagram.parts.filter((p) => p !== carte);
  // Pas de 10 px pour la translation : les composants gardent leur place sur la
  // grille (et donc leurs pastilles alignées entre elles).
  const pas = (v) => Math.round(v / 10) * 10;
  const dx = autres.length ? pas(MONTAGE_2.x - Math.min(...autres.map((p) => p.x))) : 0;
  const dy = autres.length ? pas(MONTAGE_2.y - Math.min(...autres.map((p) => p.y))) : 0;
  const { code, ...reste } = t; // le programme est partagé, pas recopié
  const name = `${t.name.replace(/-picow?$/, '')}-${JUMEAU_RP2350[t.board]}`;
  // Les points de passage de l'aîné ont été tracés autour d'une carte PAYSAGE :
  // les garder ferait entrer les fils DANS la carte portrait. On leur substitue
  // le tracé calculé par l'autoroutage (_routage.json), retrouvé par ses
  // EXTRÉMITÉS — les repères de fils, eux, changent à chaque ouverture.
  const traces = new Map((ROUTAGE[name] ?? []).map((w) => [w.cle, w.points]));
  return {
    ...reste,
    name,
    board: JUMEAU_RP2350[t.board],
    codeFrom: t.name,
    parts: [
      { ...carte, type: JUMEAU_RP2350[t.board], x: CARTE_2.x, y: CARTE_2.y },
      ...autres.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
    ],
    wires: diagram.wires.map(({ points, ...w }) => ({
      ...w,
      points: traces.get(`${w.a.partId}/${w.a.pin}—${w.b.partId}/${w.b.pin}`) ?? [],
    })),
  };
}

const PICO2_TESTS = [];
for (const t of PICO_TESTS) {
  // L'araignée n'a pas de carte à remplacer : sa Pico W est DANS le châssis,
  // et Frank n'a pas dessiné de robot à Pico 2 W. Rien à dériver ici.
  if (!JUMEAU_RP2350[t.board] || !t.parts.some((p) => p.id === 'U1')) continue;
  PICO2_TESTS.push(await jumeauPico2(t));
}

export const TESTS = [...BOARD_TESTS, ...AVR_TESTS, ...PICO_TESTS, ...PICO2_TESTS];
