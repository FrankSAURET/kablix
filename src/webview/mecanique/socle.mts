// Socle du solveur cinématique porté de kompix-core (piste 11, lot D6a).
//
// `cinematique.mts` est une COPIE à l'identique de `kinematics.ts` de
// kompix-core (Kompix Editor v2026.10.0.18), seules ses lignes d'import
// changent : elles pointent ici. Ce module rassemble ce que la copie prenait
// ailleurs dans kompix-core — vecteurs (`montage.ts`), `axisVector`
// (`assemble.ts`), types du document (`system.ts`, ici ceux de Kablix).
// `npm run verify:cinematique` vérifie que la copie n'a pas dérivé et rejoue
// les tests du solveur de kompix-core contre elle.
//
// Module pur : ni DOM, ni `vscode`.

import type { DocumentSysteme, LiaisonSysteme, PieceSysteme } from '../../systeme.js';
import type { AssemblyPiece, Vec2 } from './modele3d.mjs';

export type Vec3 = { x: number; y: number; z: number };
export type AxisDir = 'x' | 'y' | 'z';
/** Axe nommé d'une pièce (repère local) : une droite de direction `dir`, le point est son zéro. */
export type Axis = Vec3 & { dir?: AxisDir };

// Noms des types du document dans kompix-core → types de Kablix (mêmes champs).
export type SystemDoc = DocumentSysteme;
export type SystemPiece = PieceSysteme;
export type SystemLink = LiaisonSysteme;

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/** Rotation d'une pièce : autour de X, puis de Y, puis de Z (degrés). */
export function rotXYZ(p: Vec3, r?: Vec3): Vec3 {
  if (!r || (!r.x && !r.y && !r.z)) return p;
  const rad = Math.PI / 180;
  let { x, y, z } = p;
  let c = Math.cos(r.x * rad);
  let s = Math.sin(r.x * rad);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(r.y * rad);
  s = Math.sin(r.y * rad);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(r.z * rad);
  s = Math.sin(r.z * rad);
  [x, y] = [x * c - y * s, x * s + y * c];
  return { x, y, z };
}

/** Vecteur unitaire d'une direction d'axe. */
export function axisVector(dir: AxisDir): Vec3 {
  return { x: dir === 'x' ? 1 : 0, y: dir === 'y' ? 1 : 0, z: dir === 'z' ? 1 : 0 };
}

/** Contour d'une pièce ; pièce maillée sans contour = sa boîte (copie de
 *  `pieceOutline` de `mesh.ts`, kompix-core ; sert à `montage3d.mts`, lot D6c). */
export function pieceOutline(p: AssemblyPiece): Vec2[] {
  if (p.poly.length >= 3 || !p.mesh) return p.poly;
  const x = p.w / 2, y = p.h / 2;
  return [{ x: -x, y: -y }, { x, y: -y }, { x, y }, { x: -x, y }];
}
