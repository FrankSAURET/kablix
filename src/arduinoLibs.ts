/**
 * Bibliothèque Arduino manquante : la reconnaître dans la sortie du compilateur,
 * retrouver dans l'index Arduino la bibliothèque qui fournit l'en-tête, et
 * l'installer avec le même arduino-cli que celui qui compile.
 *
 * Origine (Frank, 03/11/2026) : sur certains postes d'élèves, « Servo.h: No such
 * file or directory ». Servo n'est PAS dans le cœur `arduino:avr` : Arduino IDE 2
 * l'installe au premier lancement, pour chaque utilisateur, dans le carnet de
 * croquis — un poste où l'IDE n'a jamais été ouvert sous ce compte (ou un profil
 * réinitialisé à chaque session) ne l'a donc pas, et réinstaller la carte n'y
 * change rien.
 *
 * Les fonctions de reconnaissance et de classement sont PURES (testées par
 * scripts/verify-arduinolibs.mjs) ; seules `chercherBibliotheques` et
 * `installerBibliotheque` lancent arduino-cli.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// gcc : « servo-uno.ino:1:10: fatal error: Servo.h: No such file or directory ».
// avr-gcc reste en anglais quelle que soit la langue du système.
const EN_TETE_MANQUANT = /fatal error:\s*([^\s:]+\.(?:h|hh|hpp|hxx)):\s*No such file or directory/i;

/** En-tête introuvable (« Servo.h ») cité par le compilateur, ou undefined. */
export function enTeteManquant(sortie: string): string | undefined {
  const m = EN_TETE_MANQUANT.exec(sortie);
  // `#include <dossier/x.h>` : seul le dernier segment sert à la recherche.
  return m ? m[1].split(/[\\/]/).pop() : undefined;
}

/**
 * En-têtes dont la bibliothèque porte un nom SANS rapport avec le fichier :
 * la recherche par nom ne les trouverait pas. Seulement des cas courants en
 * classe et vérifiés dans l'index Arduino — le reste passe par le classement.
 */
export const BIBLIOTHEQUE_DE: Readonly<Record<string, string>> = {
  'dht.h': 'DHT sensor library',
  'dht_u.h': 'DHT sensor library',
  'adafruit_sensor.h': 'Adafruit Unified Sensor',
  'adafruit_gfx.h': 'Adafruit GFX Library',
  'u8g2lib.h': 'U8g2',
  'u8x8lib.h': 'U8g2',
};

/**
 * Bibliothèques « de base » d'Arduino (Servo, Stepper, LiquidCrystal…). Arduino
 * IDE 2 les installe au premier lancement en posant la méta-bibliothèque
 * `Arduino_BuiltIn`, qui les tire toutes en dépendances. arduino-cli, lui, ne
 * l'a jamais fait : un poste équipé par le seul CLI (installation initiale de
 * l'extension sœur, élève sans Arduino IDE) n'a donc pas Servo.h — constaté le
 * 13/11/2026 sur le poste de Frank lui-même. Pour un de ces en-têtes, on pose
 * tout le lot d'un coup : le Stepper.h de la séance suivante est déjà là.
 */
export const BIBLIOTHEQUES_DE_BASE = 'Arduino_BuiltIn';
const EN_TETES_DE_BASE = new Set([
  'servo.h', 'stepper.h', 'liquidcrystal.h', 'ethernet.h', 'keyboard.h',
  'mouse.h', 'tft.h', 'sd.h', 'firmata.h',
]);

/** Vrai si l'en-tête est fourni par le lot `Arduino_BuiltIn`. */
export function fourniParLaBase(enTete: string): boolean {
  return EN_TETES_DE_BASE.has(enTete.toLowerCase());
}

/** Bibliothèque telle que la décrit `arduino-cli lib search --format json`. */
export interface BibliothequeIndex {
  name: string;
  latest?: {
    version?: string;
    author?: string;
    sentence?: string;
    types?: string[];
    architectures?: string[];
    provides_includes?: string[];
  };
}

/** Candidat retenu, avec son score (plus haut = plus probable). */
export interface Candidat {
  nom: string;
  version?: string;
  auteur?: string;
  phrase?: string;
  score: number;
}

/** « Adafruit_NeoPixel » et « Adafruit NeoPixel » se valent. */
const normaliser = (s: string): string => s.toLowerCase().replace(/[\s_\-.]+/g, '');

/** Nom de fichier sans extension : « Servo.h » → « Servo ». */
const racine = (enTete: string): string => enTete.replace(/\.[^.]+$/, '');

/** Terme passé à `arduino-cli lib search` pour un en-tête donné. */
export function termeDeRecherche(enTete: string): string {
  return BIBLIOTHEQUE_DE[enTete.toLowerCase()] ?? racine(enTete).replace(/_/g, ' ');
}

/**
 * Classe les bibliothèques de l'index pour un en-tête : ne garde que celles qui
 * le fournissent vraisemblablement ET qui tournent sur AVR (Kablix ne compile un
 * .ino que pour l'Uno/Mega), la meilleure en tête.
 */
export function classerCandidats(enTete: string, index: BibliothequeIndex[]): Candidat[] {
  const h = enTete.toLowerCase();
  const nomConnu = BIBLIOTHEQUE_DE[h];
  const cle = normaliser(racine(enTete));
  const out: Candidat[] = [];
  for (const lib of index) {
    const r = lib.latest ?? {};
    const archis = (r.architectures ?? ['*']).map((a) => a.toLowerCase());
    if (!archis.includes('*') && !archis.includes('avr')) continue;
    let score = 0;
    if (nomConnu && lib.name.toLowerCase() === nomConnu.toLowerCase()) score += 100;
    if (normaliser(lib.name) === cle) score += 80;
    if ((r.provides_includes ?? []).some((p) => p.toLowerCase() === h)) score += 50;
    if (score === 0) continue;
    // Départage : bibliothèque officielle Arduino d'abord.
    if ((r.types ?? []).includes('Arduino')) score += 10;
    out.push({ nom: lib.name, version: r.version, auteur: r.author, phrase: r.sentence, score });
  }
  return out.sort((a, b) => b.score - a.score || a.nom.localeCompare(b.nom));
}

/**
 * Vrai si le premier candidat s'impose (nom exact ou correspondance connue, sans
 * ex æquo) : on l'installe sans faire choisir l'élève.
 */
export function candidatEvident(candidats: Candidat[]): Candidat | undefined {
  const [a, b] = candidats;
  if (!a || a.score < 80) return undefined;
  return !b || b.score < a.score ? a : undefined;
}

async function cli(chemin: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(chemin, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    throw new Error([e.stderr, e.stdout].filter((s) => s?.trim()).join('\n') || e.message || String(err));
  }
}

/**
 * Cherche dans l'index Arduino les bibliothèques qui fournissent `enTete`.
 * Index vide ou jamais téléchargé (poste neuf) : on le met à jour une fois.
 */
export async function chercherBibliotheques(cheminCli: string, enTete: string): Promise<Candidat[]> {
  const chercher = async (): Promise<BibliothequeIndex[]> => {
    const sortie = await cli(cheminCli, [
      'lib', 'search', termeDeRecherche(enTete), '--format', 'json', '--omit-releases-details',
    ]);
    return (JSON.parse(sortie || '{}') as { libraries?: BibliothequeIndex[] }).libraries ?? [];
  };
  let index: BibliothequeIndex[] = [];
  try {
    index = await chercher();
  } catch {
    index = [];
  }
  if (index.length === 0) {
    await cli(cheminCli, ['lib', 'update-index']);
    index = await chercher();
  }
  return classerCandidats(enTete, index);
}

/**
 * Installe une bibliothèque (et ses dépendances) dans le carnet de croquis.
 * Index jamais téléchargé (poste neuf) : `lib install` ne trouve rien, on le
 * met à jour puis on réessaie une fois.
 */
export async function installerBibliotheque(cheminCli: string, nom: string): Promise<void> {
  try {
    await cli(cheminCli, ['lib', 'install', nom]);
  } catch {
    await cli(cheminCli, ['lib', 'update-index']);
    await cli(cheminCli, ['lib', 'install', nom]);
  }
}
