/**
 * DOCUMENT SYSTÈME d'un projet (piste 11, lot D1) : le montage mécanique qui
 * accompagne le schéma électrique — pièces posées, leurs poses en 3D, les
 * liaisons entre elles.
 *
 * Il vit dans le `.projix`, à côté du schéma : `system.json` à la racine de
 * l'archive, et les fichiers qu'il désigne (maillages, contours) sous `system/`.
 * Kablix ne le fabrique pas encore : il le LIT, le contrôle contre les repères
 * du schéma et le REGRAVE tel quel à chaque enregistrement. C'est Kompix Editor
 * qui l'écrira ; le format est décrit dans `docs/format-systeme.md`.
 *
 * Conventions reprises du format `model3d.json` v2 de Kompix Editor : millimètres,
 * X à droite, Y à l'arrière, Z en haut ; rotation `{ x, y, z }` en degrés,
 * autour de X puis Y puis Z, appliquée avant la position.
 *
 * Module PUR (ni `vscode`, ni DOM) : lu par le panneau et par les bancs.
 */

/** Version courante du document (incrémenter en cas de changement incompatible). */
export const SYSTEME_VERSION = 1;

/** Nom de l'entrée dans l'archive, et dossier de ses fichiers. */
export const SYSTEME_ENTREE = 'system.json';
export const SYSTEME_DOSSIER = 'system/';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Pose d'une pièce dans le repère du système. */
export interface Pose {
  pos: Vec3;
  rot: Vec3;
  miroir?: boolean;
}

/**
 * D'où vient la forme d'une pièce :
 * - `kompix` : un composant de bibliothèque (son `type`, celui du schéma) ;
 * - `fichier` : un maillage ou un contour rangé dans l'archive sous `system/`.
 */
export type SourcePiece = { kind: 'kompix'; type: string } | { kind: 'fichier'; path: string };

export interface PieceSysteme {
  /** Identifiant unique dans le document (désigné par les liaisons). */
  id: string;
  /** Nom libre ; la convention `rôle:repère` (lot D5) y donne un rôle de simulation. */
  nom?: string;
  /** Repère du composant correspondant dans le schéma (`S1`, `M2`…). Absent =
   *  pièce purement mécanique (châssis, roue folle, décor). */
  ref?: string;
  source: SourcePiece;
  pose: Pose;
  /** Couleur d'affichage `#rrggbb`, lue dans `extra.couleur` (import STEP,
   *  lot D8a) ; seule la vue 3D s'en sert, pour les pièces `fichier`. */
  couleur?: string;
}

/** Types de liaisons prévus pour le solveur du lot D2. */
export const TYPES_LIAISON = ['encastrement', 'pivot', 'glissiere', 'engrenage', 'roue-sol'] as const;
export type TypeLiaison = (typeof TYPES_LIAISON)[number];

/** Une extrémité de liaison : une pièce, et l'un de ses axes nommés. */
export interface BoutLiaison {
  piece: string;
  axe?: string;
}

export interface LiaisonSysteme {
  id: string;
  type: TypeLiaison;
  a: BoutLiaison;
  b: BoutLiaison;
  /** Paramètres propres au type (rapport d'engrenage, bornes…) : gardés tels
   *  quels, le solveur de D2 en fixera la liste. */
  params?: Record<string, unknown>;
}

export interface DocumentSysteme {
  format: 'kablix-system';
  version: number;
  pieces: PieceSysteme[];
  liaisons: LiaisonSysteme[];
}

/** Problème trouvé à la lecture ou au contrôle. `cle` est stable (bancs,
 *  traduction côté panneau), `cible` l'identifiant ou le repère concerné. */
export interface ProblemeSysteme {
  cle:
    | 'format'
    | 'version-future'
    | 'piece-invalide'
    | 'piece-doublon'
    | 'liaison-invalide'
    | 'liaison-doublon'
    | 'liaison-piece-absente'
    | 'ref-absente'
    | 'ref-doublon'
    | 'fichier-absent'
    | CleRole;
  cible?: string;
}

// ------------------------------------------------------------ rôles (lot D5)
// Convention `rôle:repère` lue dans le nom d'une pièce. Contrat : section
// « Convention de nommage » de `docs/systeme_specification.md`. Même table et
// mêmes règles que `roles.ts` de kompix-core (Kompix Editor v2026.10.0.20) ;
// Kablix y ajoute les contrôles qui demandent le schéma.

export type CleRole =
  | 'role-inconnu'
  | 'role-sans-repere'
  | 'role-ref-different'
  | 'role-doublon'
  | 'role-type'
  | 'role-repere-absent';

export type NomRole = 'servo' | 'moteur' | 'aimant' | 'hall' | 'ultrason' | 'roue' | 'sol';
/** Propre : le repère est la pièce elle-même ; entraîné : un autre composant. */
export type SorteRole = 'propre' | 'entraine' | 'sol';

export const ROLES: Readonly<Record<NomRole, { sorte: SorteRole; types: readonly string[] }>> = {
  servo: { sorte: 'propre', types: ['servo'] },
  moteur: { sorte: 'propre', types: ['moteur-dc'] },
  aimant: { sorte: 'propre', types: ['aimant'] },
  hall: { sorte: 'propre', types: ['hall'] },
  // Télémètre HC-SR04 (D7b, Kompix Editor v2026.10.0.20) : rayon le long de l'axe `faisceau`.
  ultrason: { sorte: 'propre', types: ['hcsr04'] },
  roue: { sorte: 'entraine', types: ['moteur-dc', 'servo'] },
  sol: { sorte: 'sol', types: [] },
};

export type RoleLu = { role: NomRole; repere: string; sorte: SorteRole };

const estRole = (s: string): s is NomRole => Object.prototype.hasOwnProperty.call(ROLES, s);

/**
 * Rôle d'un nom : coupé au PREMIER `:`, espaces de bord retirés, rôle
 * insensible à la casse. `null` = pas de rôle (nom sans `:` autre que `sol`) ;
 * `{ faute }` = syntaxe fautive.
 */
export function lireRole(nom: string | undefined): RoleLu | { faute: 'role-inconnu' | 'role-sans-repere' } | null {
  if (nom === undefined) return null;
  const s = nom.trim();
  const i = s.indexOf(':');
  if (i < 0) return s.toLowerCase() === 'sol' ? { role: 'sol', repere: '', sorte: 'sol' } : null;
  const role = s.slice(0, i).trim().toLowerCase();
  const repere = s.slice(i + 1).trim();
  if (!estRole(role)) return { faute: 'role-inconnu' };
  if (role === 'sol' || !repere) return { faute: 'role-sans-repere' };
  return { role, repere, sorte: ROLES[role].sorte };
}

const estLu = (r: ReturnType<typeof lireRole>): r is RoleLu => !!r && !('faute' in r);

/** Repère effectif d'une pièce : `ref`, sinon le repère de son rôle propre. */
export function repereEffectif(p: Pick<PieceSysteme, 'nom' | 'ref'>): string | undefined {
  if (p.ref) return p.ref;
  const r = lireRole(p.nom);
  return estLu(r) && r.sorte === 'propre' ? r.repere : undefined;
}

/**
 * Rôles des pièces et avertissements (jamais bloquants ; `cible` = id de la
 * pièce). Une pièce en défaut est absente de `roles` : elle reste inerte, sauf
 * `role-ref-different` (`ref` l'emporte). `types` (repère → type du schéma) :
 * absent quand le schéma est illisible, les contrôles par le schéma sautent.
 */
export function controlerRoles(
  systeme: DocumentSysteme,
  types?: Map<string, string>
): { roles: Map<string, RoleLu>; problemes: ProblemeSysteme[] } {
  const problemes: ProblemeSysteme[] = [];
  const enDefaut = new Set<string>();
  const signaler = (cle: CleRole, id: string): void => {
    problemes.push({ cle, cible: id });
    enDefaut.add(id);
  };
  const trouves: { p: PieceSysteme; r: RoleLu }[] = [];
  for (const p of systeme.pieces) {
    const r = lireRole(p.nom);
    if (!r) continue;
    if (!estLu(r)) {
      signaler(r.faute, p.id);
      continue;
    }
    trouves.push({ p, r });
    if (r.sorte === 'propre' && p.ref && p.ref !== r.repere) problemes.push({ cle: 'role-ref-different', cible: p.id });
  }

  // Doublons : même rôle propre sur le même repère effectif, toutes les pièces en cause.
  const parCle = new Map<string, string[]>();
  for (const { p, r } of trouves) {
    if (r.sorte !== 'propre') continue;
    const cle = `${r.role}:${repereEffectif(p)}`;
    parCle.set(cle, [...(parCle.get(cle) ?? []), p.id]);
  }
  for (const ids of parCle.values()) if (ids.length > 1) for (const id of ids) signaler('role-doublon', id);

  for (const { p, r } of trouves) {
    if (r.sorte === 'sol') continue;
    const acceptes = ROLES[r.role].types;
    let mauvais = r.sorte === 'propre' && p.source.kind === 'kompix' && !acceptes.includes(p.source.type);
    if (types) {
      const type = types.get(r.sorte === 'propre' ? repereEffectif(p)! : r.repere);
      // Rôle propre hors schéma : c'est le `ref-absente` de `controlerSysteme`.
      if (type === undefined) {
        if (r.sorte === 'entraine') signaler('role-repere-absent', p.id);
      } else if (!acceptes.includes(type)) mauvais = true;
    }
    if (mauvais) signaler('role-type', p.id);
  }

  const roles = new Map<string, RoleLu>();
  for (const { p, r } of trouves) {
    if (!enDefaut.has(p.id)) roles.set(p.id, r.sorte === 'propre' ? { ...r, repere: repereEffectif(p)! } : r);
  }
  return { roles, problemes };
}

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const nombre = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const texte = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
const vec3 = (v: unknown): Vec3 => {
  const o = estObjet(v) ? v : {};
  return { x: nombre(o.x), y: nombre(o.y), z: nombre(o.z) };
};

function lireSource(v: unknown): SourcePiece | undefined {
  if (!estObjet(v)) return undefined;
  if (v.kind === 'kompix') {
    const type = texte(v.type);
    return type ? { kind: 'kompix', type } : undefined;
  }
  if (v.kind === 'fichier') {
    const path = texte(v.path);
    // Chemin relatif au dossier `system/`, sans remontée : un document venu
    // d'ailleurs ne désigne rien hors de l'archive.
    if (!path || path.includes('..') || /^[\\/]|^[a-z]:/i.test(path)) return undefined;
    return { kind: 'fichier', path: path.replace(/\\/g, '/') };
  }
  return undefined;
}

function lireBout(v: unknown): BoutLiaison | undefined {
  if (!estObjet(v)) return undefined;
  const piece = texte(v.piece);
  if (!piece) return undefined;
  const axe = texte(v.axe);
  return axe ? { piece, axe } : { piece };
}

/**
 * Lit un document système brut (JSON déjà analysé). Rend `undefined` quand
 * ce n'est pas un document système. Une pièce ou une liaison illisible est
 * écartée et signalée, le reste est gardé : un détail abîmé ne doit pas faire
 * perdre tout le montage. Les champs inconnus sont ignorés ici — mais le
 * panneau regrave le document BRUT, rien n'est perdu à l'enregistrement.
 */
export function lireSysteme(brut: unknown): { systeme?: DocumentSysteme; problemes: ProblemeSysteme[] } {
  const problemes: ProblemeSysteme[] = [];
  if (!estObjet(brut) || brut.format !== 'kablix-system') {
    return { problemes: [{ cle: 'format' }] };
  }
  const version = nombre(brut.version, 1);
  if (version > SYSTEME_VERSION) problemes.push({ cle: 'version-future', cible: String(version) });

  const pieces: PieceSysteme[] = [];
  const ids = new Set<string>();
  for (const p of Array.isArray(brut.pieces) ? brut.pieces : []) {
    const o = estObjet(p) ? p : {};
    const id = texte(o.id);
    const source = lireSource(o.source);
    if (!id || !source) {
      problemes.push({ cle: 'piece-invalide', cible: id });
      continue;
    }
    if (ids.has(id)) {
      problemes.push({ cle: 'piece-doublon', cible: id });
      continue;
    }
    ids.add(id);
    const pose = estObjet(o.pose) ? o.pose : {};
    const piece: PieceSysteme = {
      id,
      source,
      pose: { pos: vec3(pose.pos), rot: vec3(pose.rot) },
    };
    if (pose.miroir === true) piece.pose.miroir = true;
    const nom = texte(o.nom);
    if (nom) piece.nom = nom;
    const ref = texte(o.ref);
    if (ref) piece.ref = ref;
    const couleur = estObjet(o.extra) ? texte(o.extra.couleur) : undefined;
    if (couleur && /^#[0-9a-f]{6}$/i.test(couleur)) piece.couleur = couleur.toLowerCase();
    pieces.push(piece);
  }

  const liaisons: LiaisonSysteme[] = [];
  const idsL = new Set<string>();
  for (const l of Array.isArray(brut.liaisons) ? brut.liaisons : []) {
    const o = estObjet(l) ? l : {};
    const id = texte(o.id);
    const type = (TYPES_LIAISON as readonly string[]).includes(o.type as string)
      ? (o.type as TypeLiaison)
      : undefined;
    const a = lireBout(o.a);
    const b = lireBout(o.b);
    if (!id || !type || !a || !b) {
      problemes.push({ cle: 'liaison-invalide', cible: id });
      continue;
    }
    if (idsL.has(id)) {
      problemes.push({ cle: 'liaison-doublon', cible: id });
      continue;
    }
    idsL.add(id);
    for (const bout of [a, b]) {
      if (!ids.has(bout.piece)) problemes.push({ cle: 'liaison-piece-absente', cible: `${id}:${bout.piece}` });
    }
    const liaison: LiaisonSysteme = { id, type, a, b };
    if (estObjet(o.params)) liaison.params = { ...o.params };
    liaisons.push(liaison);
  }

  return { systeme: { format: 'kablix-system', version, pieces, liaisons }, problemes };
}

/**
 * Contrôle le document contre le projet : repères du schéma et fichiers
 * présents sous `system/`. Ne modifie rien.
 *  - `ref-absente` : une pièce désigne un repère que le schéma n'a pas (composant
 *    supprimé, renommé sans suivre) ;
 *  - `ref-doublon` : deux pièces pour le même repère ;
 *  - `fichier-absent` : un maillage désigné mais absent de l'archive ;
 *  - les contrôles de rôles (`controlerRoles`), avec le schéma si `types` est donné.
 * Le repère d'une pièce est son repère EFFECTIF (`ref`, sinon celui de son rôle
 * propre). Deux pièces déjà signalées `role-doublon` ne refont pas un `ref-doublon`.
 */
export function controlerSysteme(
  systeme: DocumentSysteme,
  reperes: Iterable<string>,
  fichiers: Iterable<string> = [],
  types?: Map<string, string>
): ProblemeSysteme[] {
  const problemes: ProblemeSysteme[] = [];
  const connus = new Set(reperes);
  const presents = new Set([...fichiers].map((f) => f.replace(/\\/g, '/')));
  const vus = new Set<string>();
  const roles = controlerRoles(systeme, types);
  const doublonsRole = new Set(roles.problemes.filter((p) => p.cle === 'role-doublon').map((p) => p.cible));
  for (const p of systeme.pieces) {
    const ref = repereEffectif(p);
    if (ref !== undefined) {
      if (!connus.has(ref)) problemes.push({ cle: 'ref-absente', cible: ref });
      else if (vus.has(ref) && !doublonsRole.has(p.id)) problemes.push({ cle: 'ref-doublon', cible: ref });
      vus.add(ref);
    }
    if (p.source.kind === 'fichier' && !presents.has(p.source.path)) {
      problemes.push({ cle: 'fichier-absent', cible: p.source.path });
    }
  }
  return [...problemes, ...roles.problemes];
}

/** Repère → type de composant d'un schéma, ou `null` s'il est illisible. */
export function typesDuSchema(diagram: unknown): Map<string, string> | null {
  const parts = (diagram as { parts?: unknown } | undefined)?.parts;
  if (!Array.isArray(parts)) return null;
  const types = new Map<string, string>();
  for (const p of parts) {
    const { id, type } = (p ?? {}) as { id?: unknown; type?: unknown };
    if (typeof id === 'string' && typeof type === 'string') types.set(id, type);
  }
  return types;
}

/** Repères (`id`) des composants d'un schéma, ou `null` s'il est illisible. */
export function reperesDuSchema(diagram: unknown): Set<string> | null {
  const parts = (diagram as { parts?: unknown } | undefined)?.parts;
  if (!Array.isArray(parts)) return null;
  const reperes = new Set<string>();
  for (const p of parts) {
    const id = (p as { id?: unknown } | undefined)?.id;
    if (typeof id === 'string') reperes.add(id);
  }
  return reperes;
}

/**
 * Fait suivre un renommage de repère dans le document BRUT (celui qui sera
 * regravé) : chaque pièce `ref: ancien` passe à `nouveau`. Rend le nombre de
 * pièces touchées. Le brut est modifié sur place.
 */
export function renommerRepere(brut: unknown, ancien: string, nouveau: string): number {
  if (!estObjet(brut) || !Array.isArray(brut.pieces) || ancien === nouveau) return 0;
  let n = 0;
  for (const p of brut.pieces) {
    if (estObjet(p) && p.ref === ancien) {
      p.ref = nouveau;
      n++;
    }
  }
  return n;
}
