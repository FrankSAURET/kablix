// Volume et axes nommés de chaque pièce d'un document système (piste 11, lot D6b).
//
// Une pièce `kompix` prend son volume :
//   1. dans le paquet `.kompix` de la bibliothèque (`model3d.json`, ou le
//      `model3d` rendu par son `shape.mjs`), MÊME quand un élément intégré de
//      Kablix porte le même type (`servo`, `moteur-dc`, `aimant` : l'élément
//      intégré n'a qu'un dessin à plat, règle du lot D3) ;
//   2. à défaut, dans les assemblages intégrés de Kablix (`assemblages.mts`,
//      même format que `model3d.json`), par la table `INTEGRES`.
// Une pièce `fichier` n'a qu'un maillage (STL/glTF sous `system/`) : pas
// d'axe nommé, elle ne peut être que le côté `a` d'une liaison ou un
// encastrement.
//
// Les paquets sont lus côté extension (`src/systemeVolumes.ts`, ZIP et
// `node:vm`) et arrivent ici déjà dépliés : ce module est pur (ni DOM, ni
// `vscode`) et sert aussi bien la vue 3D (D6c) que les bancs.

import type { Assembly, Axis } from '../composants/iso3d.mjs';
import { assemblage, hasAssemblage } from '../composants/assemblages.mjs';
import type { DocumentSysteme, PieceSysteme } from '../../systeme.js';
import { buildKinematics, type KinProblem, type KinTree } from './cinematique.mjs';

/** Contenu de `model3d.json` (format v2 de Kompix Editor, celui d'iso3d). Les
 *  champs v2 d'une pièce (`rot`, `mesh`, `meshScale`, `meshUp`…) passent tels
 *  quels : la vue 3D (D6c) les lira, les axes n'en dépendent pas. */
export interface Model3D {
  assemblies: Record<string, Assembly>;
  width?: number;
}

/** Un paquet `.kompix` déplié par l'extension, réduit à ce que la 3D lit. */
export interface VolumePaquet {
  type: string;
  /** Volume, absent si le paquet n'en a pas (composant à plat) ou en erreur. */
  model?: Model3D;
  /** D'où vient le volume. */
  origine?: 'model3d' | 'shape';
  /** Fichiers maillés désignés par les pièces `mesh` du volume, en base64. */
  maillages?: Record<string, string>;
  /** Raison d'un volume absent alors que le paquet en annonce un. */
  erreur?: string;
}

/** Maillage d'une pièce `fichier`, lu sous `system/` du `.projix`. */
export interface MaillageFichier {
  format: 'stl' | 'glb' | 'gltf';
  /** Octets du fichier, en base64. */
  base64: string;
}

/** Tout ce que l'extension envoie pour un document. */
export interface VolumesSysteme {
  /** Paquets de bibliothèque, par type. */
  paquets: Record<string, VolumePaquet>;
  /** Maillages des pièces `fichier`, par chemin sous `system/`. */
  fichiers: Record<string, MaillageFichier>;
}

/**
 * Éléments intégrés de Kablix qui ont un volume : type → assemblages.
 * Mêmes noms que les constantes des éléments (`araignee-element.mts`,
 * `patte-element.mts`).
 */
const INTEGRES: Record<string, readonly string[]> = {
  araignee: ['araignee-corps', 'araignee-patte-femur', 'araignee-patte-tibia'],
  patte: ['araignee-patte-femur', 'araignee-patte-tibia'],
};

/** Volume d'un élément intégré, ou `undefined` s'il n'est pas dessiné. */
export function modeleIntegre(type: string): Model3D | undefined {
  const noms = (INTEGRES[type] ?? []).filter((n) => hasAssemblage(n));
  if (!noms.length) return undefined;
  const assemblies: Record<string, Assembly> = {};
  for (const n of noms) if (hasAssemblage(n)) assemblies[n] = assemblage(n);
  return { assemblies };
}

/**
 * Axes nommés d'un volume, tous ensembles confondus : un nom présent dans deux
 * ensembles garde le premier. Copie de `modelAxes` de kompix-core (`model3d.ts`).
 */
export function axesDuModele(model: Model3D | undefined): Record<string, Axis> {
  const out: Record<string, Axis> = {};
  for (const a of Object.values(model?.assemblies ?? {})) {
    for (const [name, axis] of Object.entries(a.axes ?? {})) if (!(name in out)) out[name] = { ...axis };
  }
  return out;
}

/**
 * Pièce en `miroir` : son reflet par le plan X = 0 de SON repère (la roue
 * gauche faite de la droite). Le point d'un axe change de côté ; sa direction,
 * un nom sans signe (`x`/`y`/`z`), ne change pas. Convention choisie au lot
 * D6b, à confirmer par Frank (le format ne dit pas l'axe du miroir).
 */
export function axesEnMiroir(axes: Record<string, Axis>): Record<string, Axis> {
  const out: Record<string, Axis> = {};
  for (const [nom, a] of Object.entries(axes)) out[nom] = { ...a, x: a.x === 0 ? 0 : -a.x };
  return out;
}

/** D'où vient le volume d'une pièce. */
export type SourceVolume =
  | { de: 'paquet'; model: Model3D }
  | { de: 'integre'; model: Model3D }
  | { de: 'fichier'; maillage: MaillageFichier }
  | { de: 'aucun'; raison: 'paquet-absent' | 'paquet-sans-volume' | 'fichier-absent'; detail?: string };

/** Volume d'une pièce : paquet d'abord, élément intégré ensuite, fichier. */
export function volumeDePiece(p: PieceSysteme, v: VolumesSysteme): SourceVolume {
  if (p.source.kind === 'fichier') {
    const m = v.fichiers[p.source.path];
    return m ? { de: 'fichier', maillage: m } : { de: 'aucun', raison: 'fichier-absent' };
  }
  const paquet = v.paquets[p.source.type];
  if (paquet?.model) return { de: 'paquet', model: paquet.model };
  const integre = modeleIntegre(p.source.type);
  if (integre) return { de: 'integre', model: integre };
  return paquet
    ? { de: 'aucun', raison: 'paquet-sans-volume', detail: paquet.erreur }
    : { de: 'aucun', raison: 'paquet-absent' };
}

/** Axes nommés d'une pièce dans son repère local, miroir appliqué. */
export function axesDePiece(p: PieceSysteme, v: VolumesSysteme): Record<string, Axis> | undefined {
  const s = volumeDePiece(p, v);
  if (s.de !== 'paquet' && s.de !== 'integre') return undefined;
  const axes = axesDuModele(s.model);
  return p.pose.miroir ? axesEnMiroir(axes) : axes;
}

/** Problème de volume d'une pièce (avertissement, la pièce reste au montage). */
export type ProblemeVolume = { code: 'paquet-absent' | 'paquet-sans-volume' | 'fichier-absent'; target: string; detail?: string };

/** Pièces sans volume : elles n'apparaîtront pas dans la vue 3D. */
export function problemesVolumes(doc: DocumentSysteme, v: VolumesSysteme): ProblemeVolume[] {
  const out: ProblemeVolume[] = [];
  for (const p of doc.pieces) {
    const s = volumeDePiece(p, v);
    if (s.de === 'aucun') out.push({ code: s.raison, target: p.id, ...(s.detail ? { detail: s.detail } : {}) });
  }
  return out;
}

/** Arbre cinématique du document, axes nommés pris dans les volumes. */
export function montageCinematique(doc: DocumentSysteme, v: VolumesSysteme): { tree: KinTree; problems: KinProblem[] } {
  return buildKinematics(doc, (p) => axesDePiece(p, v));
}
