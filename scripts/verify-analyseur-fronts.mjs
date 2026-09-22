// UNE PINCE POSÉE SUR UN BUS BIDIRECTIONNEL VOIT LES DEUX CÔTÉS DU DIALOGUE.
//
// LE DÉFAUT MESURÉ (22/09, sur `ds18b20-pico2.projix`). La pince de l'analyseur
// était bien accrochée et bien résolue vers GP14, et la capture enregistrée
// était pourtant VIDE. Cause : `noteScopeEdge` n'avait qu'un seul appelant par
// moteur, `samplePulses()`, qui lit l'état vu du MAÎTRE. Les réponses du capteur
// arrivent par `setInput()`, qui ne notifiait rien. Pire : en ENTRÉE, l'état de
// broche ne rend pas un niveau mais un MODE (`Input`, `InputPullUp` côté Pico ;
// `PinState.Input` côté AVR) — jamais « haut ». Donc sur 1-Wire, sur le DHT, et
// sur toute carte qui répond, seule la moitié du dialogue entrait au journal.
//
// CE QUE CE BANC PROUVE, ET POURQUOI IL FALLAIT UN BANC. Le correctif touche le
// cœur des deux moteurs : on ne le livre pas sur une lecture. Le banc fait
// dialoguer un vrai DS18B20 avec un vrai moteur, une pince posée sur le fil,
// puis compte les fronts journalisés en les TRIANT selon qui les a posés :
//   - fronts du maître  : le fil descend pendant que le MCU tient sa sortie basse ;
//   - fronts du capteur : le fil bouge alors que le MCU a relâché la ligne.
// Un journal sans fronts du capteur = le défaut est là. C'est cette séparation
// qui fait la preuve, pas le simple fait que le journal soit non vide.
//
// CONTRE-ÉPREUVE (obligatoire, cf. CLAUDE.md). Jamais par `git stash` : on
// inverse la condition DANS LE SOURCE, on relance, le banc DOIT échouer, puis on
// la remet. Fait le 22/09 en neutralisant `noterFrontEntree()` dans les deux
// moteurs — résultat attendu : zéro front capteur des deux côtés.
//
// LES DEUX MOTEURS SONT COUVERTS : `ds18b20-pico2.projix`, le fichier de Frank
// qui a révélé le défaut, tourne sur le Pico ; le banc 1-Wire existant
// (`verify-ds18b20-moteur.mjs`) est AVR. Un correctif sur un seul moteur aurait
// laissé l'autre muet.
//
// Usage : node scripts/verify-analyseur-fronts.mjs
import esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-fronts-'));
async function load(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)],
    outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

/**
 * Trie les fronts d'un journal selon qui les a posés.
 *
 * On ne peut pas le savoir après coup en relisant le journal : il ne contient
 * que des couples [ms, niveau]. On le sait en revanche À L'INSTANT du front, en
 * regardant si le maître tenait alors sa sortie. Le banc échantillonne donc le
 * journal au fil du dialogue, en notant à chaque fois l'état du maître.
 */
class Trieur {
  constructor(eng, pin, maitreTientLeBas) {
    this.eng = eng;
    this.pin = pin;
    this.maitreTientLeBas = maitreTientLeBas;
    this.maitre = 0;
    this.capteur = 0;
    this.total = 0;
  }

  /** Vide le journal du moteur et classe ce qu'il contenait. */
  recolter() {
    const edges = this.eng.drainScopeEdges();
    const log = edges[this.pin];
    if (!log) return;
    const tenu = this.maitreTientLeBas();
    for (let i = 0; i < log.length; i += 2) {
      this.total++;
      if (tenu) this.maitre++;
      else this.capteur++;
    }
  }
}

// =============================================================================
// 1. MOTEUR AVR — DS18B20 sur D2, pince logique posée sur la même broche
// =============================================================================
{
  const { AvrEngine } = await load('src/webview/engines/avr.mts', 'avr.mjs');

  const PIND = 0x29, DDRD = 0x2a, PORTD = 0x2b, BIT = 2, CYCLES_PER_US = 16;
  const eng = new AvrEngine(new Uint16Array(4096), null, 'avr328');
  eng.setDs18b20([{ id: 'part-1', pin: '2', temperatureC: 25 }]);
  // LA PINCE. C'est elle qui fait naître le journal : sans sonde déclarée,
  // `noteScopeEdge` n'enregistre rien, et le banc ne prouverait rien.
  eng.setLogicProbes(['2']);

  const cpu = eng.cpu;
  const tientLeBas = () => (cpu.data[DDRD] & (1 << BIT)) !== 0 && (cpu.data[PORTD] & (1 << BIT)) === 0;
  const tri = new Trieur(eng, '2', tientLeBas);

  const avancer = (us) => {
    const pas = Math.round((us * CYCLES_PER_US) / 2);
    for (let i = 0; i < pas; i++) {
      cpu.cycles += 2;
      eng.fireScheduled();
    }
    tri.recolter();
  };
  // LA RÉCOLTE PASSE AVANT L'ÉCRITURE. Le trieur classe d'après l'état du
  // maître à l'instant où il vide le journal : si on changeait cet état
  // d'abord, tous les fronts accumulés seraient classés du mauvais côté.
  const tirerBas = () => {
    tri.recolter();
    cpu.writeData(PORTD, cpu.data[PORTD] & ~(1 << BIT));
    cpu.writeData(DDRD, cpu.data[DDRD] | (1 << BIT));
  };
  const relacher = () => {
    tri.recolter();
    cpu.writeData(DDRD, cpu.data[DDRD] & ~(1 << BIT));
    cpu.writeData(PORTD, cpu.data[PORTD] | (1 << BIT));
  };
  const lireFil = () => ((cpu.data[PIND] >> BIT) & 1) === 1;

  relacher();
  avancer(100);

  // RESET : le maître tire 500 µs, relâche, et le capteur répond par une
  // impulsion de présence. C'est le premier front que SEUL le capteur pose.
  tirerBas();
  avancer(500);
  relacher();
  avancer(70);
  const presence = !lireFil();
  avancer(430);

  check('AVR — le capteur répond au RESET (impulsion de présence)', presence);
  check('AVR — le journal de la pince contient des fronts',
    tri.total > 0, 'journal vide : la pince n\'enregistre rien');
  check('AVR — le RESET fait entrer des fronts CAPTEUR au journal',
    tri.capteur > 0,
    `${tri.capteur} front(s) capteur sur ${tri.total} — la moitié esclave du dialogue manque`);

  // Un dialogue complet : SKIP ROM puis READ SCRATCHPAD. La lecture des 9 octets
  // est presque entièrement parlée par le capteur : c'est le cas le plus dur.
  const ecrireBit = (bit) => {
    tirerBas(); avancer(bit ? 6 : 65);
    relacher(); avancer(bit ? 64 : 5); avancer(2);
  };
  const ecrireOctet = (o) => { for (let i = 0; i < 8; i++) ecrireBit((o >> i) & 1); };
  const lireBit = () => {
    tirerBas(); avancer(3);
    relacher(); avancer(10);
    const bas = !lireFil();
    avancer(57);
    return bas ? 0 : 1;
  };
  const lireOctet = () => { let o = 0; for (let i = 0; i < 8; i++) o |= lireBit() << i; return o & 0xff; };

  const avantLecture = tri.capteur;
  ecrireOctet(0xcc); // SKIP ROM
  ecrireOctet(0xbe); // READ SCRATCHPAD
  const octets = []; for (let i = 0; i < 9; i++) octets.push(lireOctet());
  const brut = octets[0] | (octets[1] << 8);
  const tempLue = (brut > 0x7fff ? brut - 0x10000 : brut) / 16;

  check('AVR — la température lue est la bonne (dialogue réel, pas du bruit)',
    Math.abs(tempLue - 25) < 0.1, `lu ${tempLue} °C au lieu de 25`);
  check('AVR — la lecture du scratchpad ajoute des fronts capteur',
    tri.capteur > avantLecture,
    `${tri.capteur - avantLecture} front(s) ajouté(s) pendant la lecture`);
  // Contrôlé APRÈS le dialogue complet : le seul RESET se termine ligne
  // relâchée, et tous ses fronts sont alors classés côté capteur. C'est
  // l'écriture des commandes qui fait apparaître les fronts du maître.
  check('AVR — les fronts DU MAÎTRE sont journalisés eux aussi',
    tri.maitre > 0, `${tri.maitre} front(s) maître sur ${tri.total}`);
  check('AVR — le dialogue est journalisé des DEUX côtés, à peu près à parité',
    tri.maitre > tri.total * 0.2 && tri.capteur > tri.total * 0.2,
    `${tri.maitre} maître / ${tri.capteur} capteur sur ${tri.total}`);

  console.log(`   ℹ️  AVR : ${tri.total} fronts — ${tri.maitre} maître, ${tri.capteur} capteur.`);
}

// =============================================================================
// 2. MOTEUR PICO — le moteur du fichier de Frank qui a révélé le défaut
// =============================================================================
{
  const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

  // Côté Pico on ne passe pas par des registres : le banc pilote la broche par
  // l'API du GPIO, comme le fait le firmware MicroPython. `setDs18b20` déclare
  // le capteur, la pince fait naître le journal, et `sampleDs18b20` est appelé
  // par la boucle du moteur — qu'on actionne ici à la main pour maîtriser le
  // temps simulé sans lancer un vrai programme.
  // Image RAM vide : le processeur ne tourne jamais dans ce banc, on actionne
  // la broche à la main. Charger un vrai micrologiciel (ce que fait
  // `verify-ds18b20-e2e.mjs`) coûterait des secondes pour ne rien prouver de
  // plus sur le chaînon qui nous occupe.
  const eng = new PicoEngine({ kind: 'ram', image: new Uint8Array(256) });
  const PIN = 'GP14';
  const idx = 14;

  eng.setDs18b20([{ id: 'part-1', pin: PIN, temperatureC: 25 }]);
  eng.setLogicProbes([PIN]);

  const gpio = eng.mcu.gpio[idx];
  const tientLeBas = () => gpio.outputEnable && !gpio.outputValue;
  const tri = new Trieur(eng, PIN, tientLeBas);

  const ok = typeof eng.mcu?.gpio?.[idx]?.setInputValue === 'function';
  check('Pico — le moteur expose la broche GP14', ok);

  if (ok) {
    // On ne rejoue pas le protocole complet côté Pico : le banc 1-Wire du Pico
    // existe déjà. Ce qu'il faut prouver ici, c'est le CHAÎNON : un front posé
    // par l'extérieur via `setInput()` entre-t-il au journal ?
    eng.setInput(PIN, true);
    tri.recolter();
    const apresRepos = tri.total;

    eng.setInput(PIN, false); // le capteur tire la ligne : front descendant
    tri.recolter();
    const apresDescente = tri.total;

    eng.setInput(PIN, false); // même valeur : AUCUN front ne doit s'ajouter
    tri.recolter();
    const apresRepetition = tri.total;

    eng.setInput(PIN, true); // relâche : front montant
    tri.recolter();

    check('Pico — un front posé par le capteur entre au journal',
      apresDescente > apresRepos,
      'setInput() ne notifie pas l\'analyseur : la moitié esclave est perdue');
    check('Pico — une valeur répétée n\'invente pas de front',
      apresRepetition === apresDescente,
      `${apresRepetition - apresDescente} front(s) fantôme(s) — le journal serait noyé`);
    check('Pico — la remontée est journalisée elle aussi',
      tri.total > apresRepetition, 'front montant manquant');
    check('Pico — ces fronts sont bien classés CAPTEUR (le MCU ne tient pas la ligne)',
      tri.capteur === tri.total && tri.maitre === 0,
      `${tri.maitre} classé(s) maître sur ${tri.total}`);

    // Une broche NON sondée ne doit rien journaliser : sinon toute entrée de
    // clavier ou de capteur remplirait la mémoire pour rien.
    eng.setInput('GP15', false);
    eng.setInput('GP15', true);
    const autres = eng.drainScopeEdges();
    check('Pico — une broche sans pince reste hors du journal',
      autres['GP15'] === undefined, 'journal ouvert sur une broche non sondée');

    console.log(`   ℹ️  Pico : ${tri.total} fronts — ${tri.maitre} maître, ${tri.capteur} capteur.`);
  }
}

console.log(failures
  ? `analyseur-fronts : ${failures} échec(s).`
  : `analyseur-fronts : 13 contrôles OK — la pince voit les deux côtés du dialogue.`);
process.exit(failures ? 1 : 0);
