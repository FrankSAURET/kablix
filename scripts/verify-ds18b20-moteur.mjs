// Le DS18B20 branché au MOTEUR AVR répond vraiment sur la broche.
//
// CE QUE CE BANC AJOUTE À `verify-ds18b20.mjs`. L'autre éprouve le module de
// protocole tout seul, en appelant ses méthodes. Celui-ci éprouve le
// BRANCHEMENT : le moteur voit-il les fronts que le MCU pose sur la broche,
// rend-il la main à l'automate, et l'impulsion qu'il programme ressort-elle
// bien sur le fil, au bon instant ? Un module parfait mal raccordé donnerait un
// capteur muet, et le premier banc resterait vert.
//
// COMME POUR LE DHT22 (verify-dht22.mjs), aucun sketch compilé : le banc joue le
// MCU en écrivant vraiment DDRD/PORTD, exactement ce que fait la bibliothèque
// OneWire, et relit PIND. C'est le protocole qui est mis à l'épreuve, pas la
// chaîne de compilation.
//
// POURQUOI LE MOTEUR AVR N'A PAS EU BESOIN DU CORRECTIF DU PICO (v2026.9.4.111).
// Côté Pico, l'impulsion du capteur devait être posée SANS passer par la file
// d'actions programmées, cette file n'étant vidée qu'entre deux lots
// d'instructions — bien après les ~6 µs d'un créneau de lecture. Ici, `avr.mts`
// appelle `fireScheduled()` après CHAQUE instruction, soit une finesse de
// ~0,06 µs : l'impulsion sort à temps par la file. Mesuré en faisant varier
// artificiellement le pas : juste jusqu'à ~5 µs, faux à 20 µs. Conclusion :
// ne pas « corriger » `avr.mts` sur le modèle de `pico.mts` — il n'a pas le
// défaut. Seul le SEARCH ROM manquait, et il vit dans le module partagé
// `ds18b20.mts` : la section 9 ci-dessous le prouve côté Arduino.
//
// Usage : node scripts/verify-ds18b20-moteur.mjs
import esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-ds18-'));
async function load(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)],
    outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

const { AvrEngine } = await load('src/webview/engines/avr.mts', 'avr.mjs');
const M = await load('src/webview/engines/ds18b20.mts', 'ds18b20.mjs');

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

// ATmega328P : D2 = PORTD bit 2.
const PIND = 0x29, DDRD = 0x2a, PORTD = 0x2b, BIT = 2, CYCLES_PER_US = 16;

/**
 * Le MAÎTRE 1-Wire, écrit contre le VRAI moteur.
 *
 * Deux différences avec le banc du module, et ce sont elles qui font l'intérêt
 * de ce fichier : on passe par les registres du MCU (donc par le listener de
 * port, qui est ce qui déclenche `sampleDs18b20`), et on lit l'état du fil dans
 * PIND, donc après tout le trajet moteur → file d'actions programmées.
 */
class Maitre {
  constructor(eng) {
    this.eng = eng;
    this.cpu = eng.cpu;
  }

  /** Avance le temps simulé en servant les actions programmées, comme la boucle. */
  avancer(us) {
    const pas = Math.round((us * CYCLES_PER_US) / 2);
    for (let i = 0; i < pas; i++) {
      this.cpu.cycles += 2;
      this.eng.fireScheduled();
    }
  }

  /** Tire la ligne BAS (sortie à 0), comme `digitalWrite(pin, LOW)` en sortie. */
  tirerBas() {
    const c = this.cpu;
    c.writeData(PORTD, c.data[PORTD] & ~(1 << BIT));
    c.writeData(DDRD, c.data[DDRD] | (1 << BIT));
  }

  /** Relâche la ligne (entrée + tirage), comme `pinMode(pin, INPUT_PULLUP)`. */
  relacher() {
    const c = this.cpu;
    c.writeData(DDRD, c.data[DDRD] & ~(1 << BIT));
    c.writeData(PORTD, c.data[PORTD] | (1 << BIT));
  }

  /** L'état du fil vu par le MCU. */
  lireFil() {
    return ((this.cpu.data[PIND] >> BIT) & 1) === 1;
  }

  reset() {
    this.tirerBas();
    this.avancer(500);
    this.relacher();
    // La présence se lit ~70 µs après la relâche : le creux du vrai composant.
    this.avancer(70);
    const presence = !this.lireFil();
    this.avancer(430);
    return presence;
  }

  ecrireBit(bit) {
    this.tirerBas();
    this.avancer(bit ? 6 : 65);
    this.relacher();
    this.avancer(bit ? 64 : 5);
    this.avancer(2);
  }

  ecrireOctet(o) {
    for (let i = 0; i < 8; i++) this.ecrireBit((o >> i) & 1);
  }

  /**
   * Lit un bit. Le maître ouvre par un BAS très court puis relâche, et regarde
   * le fil ~13 µs après le front : dans cette fenêtre, un « 0 » du capteur tient
   * encore la ligne basse, un « 1 » l'a déjà laissée remonter.
   */
  lireBit() {
    this.tirerBas();
    this.avancer(3);
    this.relacher();
    this.avancer(10);
    const bas = !this.lireFil();
    this.avancer(57);
    return bas ? 0 : 1;
  }

  lireOctet() {
    let o = 0;
    for (let i = 0; i < 8; i++) o |= this.lireBit() << i;
    return o & 0xff;
  }

  lireOctets(n) {
    const r = [];
    for (let i = 0; i < n; i++) r.push(this.lireOctet());
    return r;
  }
}

/** Un moteur AVR avec un capteur déclaré sur D2, prêt à dialoguer. */
const monter = (tempC, id = 'part-1') => {
  const eng = new AvrEngine(new Uint16Array(4096), null, 'avr328');
  eng.setDs18b20([{ id, pin: '2', temperatureC: tempC }]);
  const m = new Maitre(eng);
  m.relacher(); // ligne au repos HAUT (résistance de tirage)
  m.avancer(100);
  return { eng, m };
};

/** Le parcours d'une bibliothèque Arduino : conversion puis lecture. */
const lireScratchpad = (m) => {
  m.reset();
  m.ecrireOctet(M.CMD_SKIP_ROM);
  m.ecrireOctet(M.CMD_CONVERT_T);
  m.avancer(1000);
  m.reset();
  m.ecrireOctet(M.CMD_SKIP_ROM);
  m.ecrireOctet(M.CMD_READ_SCRATCHPAD);
  return m.lireOctets(9);
};

// --- 1. Le capteur est là ----------------------------------------------------
{
  const { m } = monter(25);
  check('RESET sur la broche du MCU : l\'impulsion de présence arrive', m.reset());
}

// --- 2. Le dialogue complet, à travers le moteur -----------------------------
{
  const { m } = monter(23.5);
  const sp = lireScratchpad(m);
  check('le scratchpad traverse le moteur (9 octets, pas un fil mort)',
    sp.some((o) => o !== 0xff), sp.join());
  check('le CRC du scratchpad lu sur la broche est juste',
    M.crc8Dallas(sp.slice(0, 8)) === sp[8],
    `calculé 0x${M.crc8Dallas(sp.slice(0, 8)).toString(16)}, reçu 0x${(sp[8] ?? 0).toString(16)}`);
  check('la température lue par le MCU est celle du curseur',
    Math.abs(M.ds18b20Lire(sp[0], sp[1]) - 23.5) < 0.07,
    `${M.ds18b20Lire(sp[0], sp[1])} °C au lieu de 23,5`);
}

// --- 3. Une négative, jusque sur la broche -----------------------------------
{
  const { m } = monter(-12.5);
  const sp = lireScratchpad(m);
  check('une température négative arrive intacte sur la broche',
    Math.abs(M.ds18b20Lire(sp[0], sp[1]) + 12.5) < 0.07,
    `${M.ds18b20Lire(sp[0], sp[1])} °C au lieu de −12,5`);
}

// --- 4. READ ROM : l'adresse d'usine ----------------------------------------
{
  const { m } = monter(25, 'part-7');
  m.reset();
  m.ecrireOctet(M.CMD_READ_ROM);
  const lu = m.lireOctets(8);
  const attendu = M.ds18b20Rom('part-7');
  check('READ ROM à travers le moteur : l\'adresse est rendue exactement',
    lu.join() === attendu.join(), `lu ${lu.join()}, attendu ${attendu.join()}`);
}

// --- 5. Deuxième lecture : le piège qui avait mordu le DHT22 -----------------
// Le DHT22 ne répondait qu'à la PREMIÈRE lecture (v205). Le même défaut ici
// (état non rendu au repos, broche laissée tenue) ne se verrait pas autrement.
{
  const { m } = monter(30);
  const a = lireScratchpad(m);
  m.avancer(2_000_000); // 2 s plus tard, comme une boucle de sketch
  const b = lireScratchpad(m);
  check('2e lecture (2 s plus tard) : le capteur répond ENCORE',
    b.some((o) => o !== 0xff), 'le capteur est resté muet après la 1re lecture');
  check('2e lecture : la même température qu\'à la première',
    M.ds18b20Lire(a[0], a[1]) === M.ds18b20Lire(b[0], b[1]),
    `${M.ds18b20Lire(a[0], a[1])} puis ${M.ds18b20Lire(b[0], b[1])}`);
}

// --- 6. Le curseur bougé PENDANT que la simulation tourne --------------------
// C'est l'usage réel : l'élève déplace le curseur et regarde la valeur suivre.
{
  const { eng, m } = monter(20);
  const avant = lireScratchpad(m);
  eng.setDs18b20([{ id: 'part-1', pin: '2', temperatureC: 45 }]);
  const apres = lireScratchpad(m);
  check('curseur bougé en cours de simulation : la lecture suivante suit',
    Math.abs(M.ds18b20Lire(apres[0], apres[1]) - 45) < 0.07,
    `${M.ds18b20Lire(avant[0], avant[1])} puis ${M.ds18b20Lire(apres[0], apres[1])} au lieu de 45`);
}

// --- 7. Deux capteurs sur le MÊME fil ----------------------------------------
// L'intérêt du 1-Wire. Chacun doit répondre à SON adresse et se taire à l'autre ;
// c'est ce que fait `search()` puis `getTempC(adresse)` côté Arduino.
{
  const eng = new AvrEngine(new Uint16Array(4096), null, 'avr328');
  eng.setDs18b20([
    { id: 'part-a', pin: '2', temperatureC: 10 },
    { id: 'part-b', pin: '2', temperatureC: 40 },
  ]);
  const m = new Maitre(eng);
  m.relacher();
  m.avancer(100);
  const parAdresse = (id) => {
    m.reset();
    m.ecrireOctet(M.CMD_MATCH_ROM);
    for (const o of M.ds18b20Rom(id)) m.ecrireOctet(o);
    m.ecrireOctet(M.CMD_READ_SCRATCHPAD);
    const sp = m.lireOctets(9);
    return M.ds18b20Lire(sp[0], sp[1]);
  };
  const a = parAdresse('part-a');
  const b = parAdresse('part-b');
  check('deux capteurs sur un fil : chacun rend SA température',
    Math.abs(a - 10) < 0.07 && Math.abs(b - 40) < 0.07,
    `part-a ${a} (attendu 10), part-b ${b} (attendu 40)`);
}

// --- 8. Sans capteur déclaré, personne ne pose rien sur le fil ---------------
// GARDE-FOU. Sans lui, les contrôles ci-dessus pourraient être verts en mesurant
// autre chose que le capteur.
//
// Attention à la façon de le poser : sur un moteur AVR nu, PIND vaut 0 même au
// repos — la résistance de tirage interne n'est pas modélisée tant que rien ne
// force la broche. Lire « ligne basse = présence » rendrait donc ce contrôle
// rouge alors que rien ne répond (mesuré). Ce qu'il faut mesurer, c'est si
// QUELQU'UN A POSÉ quelque chose sur le fil : la file d'actions programmées du
// moteur est vide s'il n'y a pas de capteur, et remplie s'il y en a un.
{
  const nu = new AvrEngine(new Uint16Array(4096), null, 'avr328');
  const mNu = new Maitre(nu);
  mNu.relacher();
  mNu.avancer(100);
  mNu.tirerBas();
  mNu.avancer(500);
  mNu.relacher();
  mNu.avancer(10);
  const poseSansCapteur = nu.scheduled.length;

  const { eng, m } = monter(25);
  m.tirerBas();
  m.avancer(500);
  m.relacher();
  m.avancer(10);
  const poseAvecCapteur = eng.scheduled.length;

  check('aucun capteur déclaré : rien n\'est posé sur le fil',
    poseSansCapteur === 0, `${poseSansCapteur} action(s) programmée(s)`);
  check('un capteur déclaré : l\'impulsion de présence EST posée sur le fil',
    poseAvecCapteur > 0, 'le capteur n\'a rien posé — les contrôles ci-dessus mesurent autre chose');
}

// --- 9. SEARCH ROM : la DÉCOUVERTE des adresses ------------------------------
// LE TROU QUE CE BANC AVAIT. Le cas 7 interroge deux capteurs par MATCH ROM,
// mais avec des adresses qu'il connaît d'avance : il ne prouve rien sur la façon
// dont une bibliothèque les TROUVE. Or c'est là que tout se jouait côté Pico —
// `scan()` rendait une liste vide et le programme annonçait « 0 capteur » — sans
// qu'aucun banc ne rougisse.
//
// L'algorithme est celui de toute bibliothèque 1-Wire : pour chacun des 64 bits
// d'adresse, le maître ouvre TROIS créneaux — il lit le bit, lit son complément,
// puis écrit celui qu'il retient. Deux capteurs qui divergent rendent 0 ET 0 (le
// « conflit ») ; le maître choisit 0, note le rang, et repassera par là pour
// prendre 1. Un capteur dont le bit diffère du choix se tait jusqu'au reset.
/**
 * Énumère le fil comme le ferait `OneWire::search()`.
 *
 * @returns la liste des adresses trouvées, chacune en 8 octets.
 */
const chercherAdresses = (m) => {
  const trouvees = [];
  let dernierConflit = -1;
  // Garde-fou : un automate cassé pourrait faire tourner la boucle sans fin.
  for (let tour = 0; tour < 8; tour++) {
    if (!m.reset()) break;
    m.ecrireOctet(M.CMD_SEARCH_ROM);
    const rom = new Array(8).fill(0);
    let conflit = -1;
    let abandon = false;
    for (let i = 0; i < 64; i++) {
      const bit = m.lireBit();
      const complement = m.lireBit();
      let choix;
      if (bit !== complement) {
        choix = bit; // tout le monde est d'accord
      } else if (bit === 1) {
        abandon = true; // 1 et 1 : plus personne ne répond
        break;
      } else if (i < dernierConflit) {
        choix = (rom[i >> 3] >> (i & 7)) & 1; // on refait le même chemin
      } else if (i === dernierConflit) {
        choix = 1; // la branche qu'on avait laissée de côté
      } else {
        choix = 0;
        conflit = i; // à explorer au tour suivant
      }
      if (choix) rom[i >> 3] |= 1 << (i & 7);
      m.ecrireBit(choix);
    }
    if (abandon) break;
    trouvees.push(rom);
    dernierConflit = conflit;
    if (conflit < 0) break; // plus aucune branche en attente
  }
  return trouvees;
};

{
  const { m } = monter(25, 'part-9');
  const trouvees = chercherAdresses(m);
  const attendu = M.ds18b20Rom('part-9');
  check('SEARCH ROM sur la broche : le capteur seul est TROUVÉ',
    trouvees.length === 1, `${trouvees.length} adresse(s) trouvée(s) au lieu de 1`);
  check('SEARCH ROM : l\'adresse découverte est bien la sienne',
    trouvees[0]?.join() === attendu.join(),
    `trouvé ${trouvees[0]?.join() ?? '(rien)'}, attendu ${attendu.join()}`);
  check('SEARCH ROM : l\'adresse porte le code famille 0x28',
    trouvees[0]?.[0] === 0x28, `0x${(trouvees[0]?.[0] ?? 0).toString(16)}`);
}

// Deux capteurs : c'est le cas qui met l'algorithme à l'épreuve, puisqu'il
// faut démêler les deux adresses bit à bit sur un seul fil.
{
  const eng = new AvrEngine(new Uint16Array(4096), null, 'avr328');
  eng.setDs18b20([
    { id: 'part-c', pin: '2', temperatureC: 10 },
    { id: 'part-d', pin: '2', temperatureC: 40 },
  ]);
  const m = new Maitre(eng);
  m.relacher();
  m.avancer(100);
  const trouvees = chercherAdresses(m).map((r) => r.join());
  const attendues = [M.ds18b20Rom('part-c').join(), M.ds18b20Rom('part-d').join()];
  check('SEARCH ROM : DEUX capteurs sur un fil sont démêlés',
    trouvees.length === 2, `${trouvees.length} adresse(s) au lieu de 2`);
  check('SEARCH ROM : les deux adresses trouvées sont les bonnes',
    attendues.every((a) => trouvees.includes(a)),
    `trouvé [${trouvees.join(' | ')}], attendu [${attendues.join(' | ')}]`);
}

console.log(failures
  ? `ds18b20-moteur : ${failures} échec(s).`
  : `ds18b20-moteur : 17 contrôles OK — le capteur répond sur la broche du MCU.`);
process.exit(failures ? 1 : 0);
