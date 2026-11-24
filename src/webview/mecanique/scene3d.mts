// Le montage d'un document système en objets three.js (piste 11, lot D6c).
//
// Chaque pièce du document devient un groupe posé par sa matrice monde
// (`vue3d-donnees.mts`) ; dedans, son volume :
//   • paquet ou élément intégré : les pièces du `model3d`, posées par
//     `placements` (copie de kompix-core, `montage3d.mts`) et extrudées comme
//     dans la visionneuse de Kompix Editor (`scene.ts`, adapté ici) ;
//   • pièce `fichier` ou pièce `mesh` d'un paquet : le maillage STL/glTF, lu
//     comme `mesh-geometry.ts` de Kompix Editor (centré sur sa boîte) ;
//   • pas de volume : une boîte rouge en fil de fer, pour que l'absence se voie.
// Pièce en défaut : teinte rouge et boîte englobante rouge.
//
// Sans DOM : se construit sous Node (bancs) comme dans la webview.

import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PLANES, cross, pieceColor, placements, type Placement } from './montage3d.mjs';
import type { AssemblyPiece, Model3D, Vec3 } from './modele3d.mjs';
import type { Mat } from './cinematique.mjs';
import type { PieceVue, Vue3D } from './vue3d-donnees.mjs';

/** Couleur des pièces en défaut et des volumes absents. */
export const ROUGE_DEFAUT = 0xe53935;

/** Matrice three.js d'une transformation du solveur (rotation en lignes + translation). */
export function matrice4(m: Mat): THREE.Matrix4 {
  const r = m.r;
  return new THREE.Matrix4().set(
    r[0], r[1], r[2], m.t.x,
    r[3], r[4], r[5], m.t.y,
    r[6], r[7], r[8], m.t.z,
    0, 0, 0, 1,
  );
}

/** Matrice monde d'une pièce, miroir compris (reflet par le plan X = 0 local). */
export function matricePiece(p: Pick<PieceVue, 'matrice' | 'miroir'>): THREE.Matrix4 {
  const m = matrice4(p.matrice);
  return p.miroir ? m.multiply(new THREE.Matrix4().makeScale(-1, 1, 1)) : m;
}

// ---------------------------------------------- pièces d'un model3d (scene.ts)

function planeBasis(piece: AssemblyPiece): THREE.Matrix4 {
  const { u, v } = PLANES[piece.plan];
  const n = cross(u, v);
  return new THREE.Matrix4().makeBasis(
    new THREE.Vector3(u.x, u.y, u.z),
    new THREE.Vector3(v.x, v.y, v.z),
    new THREE.Vector3(n.x, n.y, n.z),
  );
}

/** Rotation v2 : X, puis Y, puis Z (donc Rz · Ry · Rx). */
function pieceRotation(r: Vec3 | undefined): THREE.Matrix4 {
  if (!r) return new THREE.Matrix4();
  const d = THREE.MathUtils.DEG2RAD;
  return new THREE.Matrix4().makeRotationZ(r.z * d)
    .multiply(new THREE.Matrix4().makeRotationY(r.y * d))
    .multiply(new THREE.Matrix4().makeRotationX(r.x * d));
}

/** Matrice d'un exemplaire de pièce dans le repère du composant. */
function placementMatrix(pl: Placement): THREE.Matrix4 {
  const { inst, center } = pl;
  return new THREE.Matrix4().makeTranslation(inst.pos.x, inst.pos.y, inst.pos.z)
    .multiply(new THREE.Matrix4().makeRotationZ(inst.lacet * THREE.MathUtils.DEG2RAD))
    .multiply(new THREE.Matrix4().makeTranslation(center.x, center.y, center.z))
    .multiply(pieceRotation(pl.rot))
    .multiply(planeBasis(pl.piece));
}

/** Plaque extrudée dans le repère du dessin, épaisseur centrée. */
function pieceGeometry(piece: AssemblyPiece): THREE.BufferGeometry | null {
  if (piece.poly.length < 3) return null;
  const shape = new THREE.Shape(piece.poly.map((q) => new THREE.Vector2(q.x, q.y)));
  for (const h of piece.holes ?? []) {
    if (h.length >= 3) shape.holes.push(new THREE.Path(h.map((q) => new THREE.Vector2(q.x, q.y))));
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: piece.ep, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -piece.ep / 2);
  return geo;
}

// ---------------------------------------------- maillages (mesh-geometry.ts)

type FormatMaillage = 'stl' | 'glb' | 'gltf';

const octetsDe = (base64: string): Uint8Array => {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const tampon = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

/** Format d'un chemin de maillage, d'après son extension. */
export function formatDe(chemin: string): FormatMaillage | undefined {
  const m = /\.(stl|glb|gltf)$/i.exec(chemin);
  return m ? (m[1].toLowerCase() as FormatMaillage) : undefined;
}

/** Lit un maillage, le met en mm, Z en haut, centre de sa boîte à l'origine
 *  (`recentrer`, pièce `mesh` d'un model3d). Une pièce `fichier` du document
 *  garde ses coordonnées : son repère est celui du fichier (import STEP en
 *  coordonnées globales, pose nulle, lot D8). */
export async function geometrieMaillage(base64: string, format: FormatMaillage, echelle = 1, haut: 'y' | 'z' = 'z', recentrer = true): Promise<THREE.BufferGeometry> {
  const octets = octetsDe(base64);
  let geo: THREE.BufferGeometry;
  if (format === 'stl') {
    const g = new STLLoader().parse(tampon(octets));
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', g.getAttribute('position'));
    if (g.hasAttribute('color')) geo.setAttribute('color', g.getAttribute('color'));
  } else {
    const data = format === 'glb' ? tampon(octets) : new TextDecoder().decode(octets);
    const gltf = await new GLTFLoader().parseAsync(data, '');
    gltf.scene.updateMatrixWorld(true);
    const morceaux: THREE.BufferGeometry[] = [];
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', src.getAttribute('position'));
      g.applyMatrix4(mesh.matrixWorld);
      const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
      const c = mat?.color ?? new THREE.Color(0xb0b0b0);
      const n = g.getAttribute('position').count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      morceaux.push(g);
      src.dispose();
    });
    if (!morceaux.length) throw new Error('glTF: no mesh in the file');
    geo = morceaux.length === 1 ? morceaux[0] : mergeGeometries(morceaux, false)!;
  }
  if ((geo.getAttribute('position')?.count ?? 0) < 3) throw new Error('empty mesh');
  if (haut === 'y') geo.rotateX(Math.PI / 2);
  geo.scale(echelle, echelle, echelle);
  if (recentrer) {
    geo.computeBoundingBox();
    const c = geo.boundingBox!.getCenter(new THREE.Vector3());
    geo.translate(-c.x, -c.y, -c.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------- scène

const matiere = (couleur: THREE.ColorRepresentation, alpha = 1, colore = false, metal = 0.05): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color: colore ? 0xffffff : couleur, vertexColors: colore, roughness: 0.65, metalness: metal,
    transparent: alpha < 1, opacity: alpha, depthWrite: alpha >= 1, side: THREE.DoubleSide,
  });

/** Maillage d'une pièce de la vue : `userData.piece` = id de la pièce du document. */
export type ObjetPiece = THREE.Mesh & { userData: { piece: string } };

/** Volume d'un model3d, dans le repère du composant. */
async function volumeDuModele(model: Model3D, maillages: Record<string, string>, id: string, objets: ObjetPiece[]): Promise<THREE.Group> {
  const g = new THREE.Group();
  for (const pl of placements(model)) {
    const piece = pl.piece;
    let geo: THREE.BufferGeometry | null = null;
    let colore = false;
    if (piece.mesh) {
      const b64 = maillages[piece.mesh];
      const fmt = formatDe(piece.mesh);
      if (b64 && fmt) {
        try {
          geo = await geometrieMaillage(b64, fmt, piece.meshScale ?? 1, piece.meshUp ?? 'z');
          colore = geo.hasAttribute('color');
        } catch {
          geo = null;
        }
      }
      // Maillage illisible ou absent : une boîte grise de la même taille.
      geo ??= new THREE.BoxGeometry(piece.w || 1, piece.h || 1, piece.ep || 1);
    } else geo = pieceGeometry(piece);
    if (!geo) continue;
    const { rgb, alpha } = pieceColor(piece);
    const mesh = new THREE.Mesh(geo, matiere(rgb, alpha, colore, piece.mat === 'alu' ? 0.35 : 0.05)) as unknown as ObjetPiece;
    mesh.userData = { piece: id };
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(placementMatrix(pl));
    g.add(mesh);
    objets.push(mesh);
  }
  return g;
}

export interface SceneMontage {
  racine: THREE.Group;
  /** Groupe de chaque pièce du document, par id. */
  pieces: Map<string, THREE.Group>;
  /** Maillages touchables (survol). */
  objets: ObjetPiece[];
  /** Pièces marquées en défaut. */
  enDefaut: Set<string>;
  dispose(): void;
}

/** Construit tout le montage, à la pose du document. */
export async function construireScene(vue: Vue3D): Promise<SceneMontage> {
  const racine = new THREE.Group();
  racine.name = 'kablix-montage';
  const pieces = new Map<string, THREE.Group>();
  const objets: ObjetPiece[] = [];
  const enDefaut = new Set<string>();

  for (const p of vue.pieces) {
    const g = new THREE.Group();
    g.name = p.id;
    g.matrixAutoUpdate = false;
    g.matrix.copy(matricePiece(p));
    const s = p.source;
    if (s.de === 'paquet' || s.de === 'integre') {
      g.add(await volumeDuModele(s.model as unknown as Model3D, p.maillages ?? {}, p.id, objets));
    } else if (s.de === 'fichier') {
      let geo: THREE.BufferGeometry;
      try {
        geo = await geometrieMaillage(s.maillage.base64, s.maillage.format, 1, 'z', false);
      } catch {
        geo = new THREE.BoxGeometry(10, 10, 10);
        p.defauts.push('maillage-illisible');
      }
      // Couleur des sommets (STL coloré, glTF) d'abord, puis `extra.couleur`.
      const mesh = new THREE.Mesh(geo, matiere(p.couleur ?? 0xb0b0b0, 1, geo.hasAttribute('color'))) as unknown as ObjetPiece;
      mesh.userData = { piece: p.id };
      g.add(mesh);
      objets.push(mesh);
    } else {
      // Pas de volume : une boîte de 20 mm en fil de fer, touchable elle aussi.
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(20, 20, 20),
        new THREE.MeshBasicMaterial({ color: ROUGE_DEFAUT, wireframe: true }),
      ) as unknown as ObjetPiece;
      mesh.userData = { piece: p.id };
      g.add(mesh);
      objets.push(mesh);
    }
    racine.add(g);
    pieces.set(p.id, g);
  }
  racine.updateMatrixWorld(true);

  // Défauts : teinte rouge sur les maillages de la pièce, boîte englobante rouge.
  for (const p of vue.pieces) {
    if (!p.defauts.length) continue;
    enDefaut.add(p.id);
    const g = pieces.get(p.id)!;
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && 'emissive' in m) {
        m.emissive.setHex(ROUGE_DEFAUT);
        m.emissiveIntensity = 0.55;
      }
    });
    const boite = new THREE.Box3().setFromObject(g);
    if (!boite.isEmpty()) {
      const aide = new THREE.Box3Helper(boite, ROUGE_DEFAUT);
      aide.name = `defaut:${p.id}`;
      racine.add(aide);
    }
  }

  return {
    racine,
    pieces,
    objets,
    enDefaut,
    dispose() {
      racine.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
    },
  };
}
