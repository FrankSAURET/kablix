// Vue 3D du montage (piste 11, lot D6c) : paquet À PART, `dist/vue3d.js`.
//
// three.js pèse ~600 Ko : il n'entre pas dans `dist/webview.js`. La page le
// charge au premier clic sur « Vue 3D » (balise <script> à nonce) ; ce paquet
// range alors `ouvrir` dans `globalThis.KablixVue3D`.
//
// Le montage à la pose du document, caméra orbitale (glisser = tourner, clic
// droit = déplacer, molette = zoom), rôle et repère dans une bulle au survol,
// pièces en défaut en rouge. Rendu à la demande (au geste, au
// redimensionnement, à chaque image de simulation) : aucune boucle
// d'animation propre. Pendant une simulation (lot D6d), `simuler` pose les
// pièces d'après les servos et moteurs (`pilotage.mts`) ; `arreter` les
// ramène à la pose du document.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { bulleDePiece, vue3D, type DonneesVue3D, type TextesBulle } from './mecanique/vue3d-donnees.mjs';
import { construireScene, matricePiece, type SceneMontage } from './mecanique/scene3d.mjs';
import { montageCinematique } from './mecanique/volumes.mjs';
import { Pilotage, type EtatSimulation, type ImagePilotee, type PiecePilotee } from './mecanique/pilotage.mjs';

/** Défauts qui rendent une pièce inerte (lot D5) : son rôle est ignoré. */
const INERTE = new Set(['role-inconnu', 'role-sans-repere', 'role-doublon', 'role-type', 'role-repere-absent', 'ref-absente']);

export interface TextesVue extends TextesBulle {
  /** Message quand WebGL manque. */
  sansWebgl: string;
  /** Liaison arrêtée à une borne (suivi de l'id de la liaison). */
  butee: string;
  /** Liaison dont le composant n'est pas simulé (suivi de l'id). */
  sansSource: string;
}

export interface VueOuverte {
  fermer(): void;
  /** Pour les bancs : état lisible sans WebGL interne. */
  etat(): { pieces: number; enDefaut: string[]; camera: [number, number, number]; cible: [number, number, number] };
  /** Pour les bancs : pièce sous un point de la page (coordonnées client), ou null. */
  pieceSous(x: number, y: number): string | null;
  /** Une image de simulation : `dt` secondes depuis la précédente. */
  simuler(etat: EtatSimulation, dt: number): void;
  /** Fin de simulation : retour à la pose du document. */
  arreter(): void;
  /** Pour les bancs : position monde d'une pièce et lignes d'état affichées. */
  pose(id: string): [number, number, number] | null;
  lignesEtat(): string[];
}

/** Ouvre la vue dans `conteneur` (vidé). Rend une poignée pour la fermer. */
export async function ouvrir(conteneur: HTMLElement, donnees: DonneesVue3D, textes: TextesVue): Promise<VueOuverte> {
  conteneur.replaceChildren();
  const vue = vue3D(donnees);
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    const p = document.createElement('p');
    p.className = 'vue3d__message';
    p.textContent = textes.sansWebgl;
    conteneur.append(p);
    return {
      fermer: () => conteneur.replaceChildren(),
      etat: () => ({ pieces: 0, enDefaut: [], camera: [0, 0, 0], cible: [0, 0, 0] }),
      pieceSous: () => null,
      simuler: () => undefined,
      arreter: () => undefined,
      pose: () => null,
      lignesEtat: () => [],
    };
  }
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.domElement.className = 'vue3d__canvas';
  conteneur.append(renderer.domElement);

  const bulle = document.createElement('div');
  bulle.className = 'vue3d__bulle';
  bulle.hidden = true;
  conteneur.append(bulle);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
  const soleil = new THREE.DirectionalLight(0xffffff, 1.8);
  soleil.position.set(1, -1.5, 2);
  scene.add(soleil);

  const montage: SceneMontage = await construireScene(vue);
  scene.add(montage.racine);

  // Cadrage : boîte du montage, sol sous elle, caméra en trois quarts avant.
  const boite = new THREE.Box3().setFromObject(montage.racine);
  if (boite.isEmpty()) boite.set(new THREE.Vector3(-50, -50, 0), new THREE.Vector3(50, 50, 50));
  const centre = boite.getCenter(new THREE.Vector3());
  const rayon = Math.max(boite.getSize(new THREE.Vector3()).length() / 2, 10);
  const pas = 10 ** Math.floor(Math.log10(rayon / 2));
  const cote = Math.ceil((rayon * 4) / pas) * pas;
  const grille = new THREE.GridHelper(cote, Math.round(cote / pas), 0x888888, 0x555555);
  grille.rotateX(Math.PI / 2); // GridHelper est en XZ ; le sol de Kablix est XY (Z en haut)
  grille.position.set(centre.x, centre.y, boite.min.z);
  (grille.material as THREE.Material).transparent = true;
  (grille.material as THREE.Material).opacity = 0.45;
  scene.add(grille);

  const camera = new THREE.PerspectiveCamera(40, 1, rayon / 100, rayon * 100);
  camera.up.set(0, 0, 1);
  const recul = rayon / Math.sin(THREE.MathUtils.degToRad(20)) * 1.1;
  camera.position.copy(centre).add(new THREE.Vector3(0.55, -0.75, 0.45).normalize().multiplyScalar(recul));
  const controles = new OrbitControls(camera, renderer.domElement);
  controles.target.copy(centre);
  controles.update();

  const rendre = (): void => renderer.render(scene, camera);
  controles.addEventListener('change', rendre);

  const taille = (): void => {
    const w = Math.max(conteneur.clientWidth, 1);
    const h = Math.max(conteneur.clientHeight, 1);
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    rendre();
  };
  const observateur = new ResizeObserver(taille);
  observateur.observe(conteneur);
  taille();

  // Survol : pièce touchée par le rayon, bulle près du pointeur.
  const rayonSouris = new THREE.Raycaster();
  const parId = new Map(vue.pieces.map((p) => [p.id, p]));
  const pieceSous = (x: number, y: number): string | null => {
    const r = renderer.domElement.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    rayonSouris.setFromCamera(ndc, camera);
    const touche = rayonSouris.intersectObjects(montage.objets, false)[0];
    return (touche?.object.userData as { piece?: string } | undefined)?.piece ?? null;
  };
  const survol = (e: PointerEvent): void => {
    if (e.buttons) {
      bulle.hidden = true; // pendant une orbite, la bulle gênerait
      return;
    }
    const id = pieceSous(e.clientX, e.clientY);
    const p = id ? parId.get(id) : undefined;
    if (!p) {
      bulle.hidden = true;
      delete bulle.dataset.piece;
      return;
    }
    bulle.replaceChildren(...bulleDePiece(p, textes).map((l, i) => {
      const d = document.createElement('div');
      d.textContent = l;
      if (i === 0) d.className = 'vue3d__bulle-titre';
      else if (l.startsWith('⚠')) d.className = 'vue3d__bulle-defaut';
      return d;
    }));
    bulle.dataset.piece = p.id;
    const r = conteneur.getBoundingClientRect();
    bulle.style.left = `${e.clientX - r.left + 14}px`;
    bulle.style.top = `${e.clientY - r.top + 14}px`;
    bulle.hidden = false;
  };
  const quitter = (): void => {
    bulle.hidden = true;
  };
  renderer.domElement.addEventListener('pointermove', survol);
  renderer.domElement.addEventListener('pointerleave', quitter);

  // Pilotage par la simulation : arbre du solveur, rôles des pièces.
  const etatSim = document.createElement('div');
  etatSim.className = 'vue3d__etat';
  etatSim.hidden = true;
  conteneur.append(etatSim);
  const { tree } = montageCinematique(donnees.doc, donnees.volumes);
  const pilotables: PiecePilotee[] = vue.pieces.map((p) => ({
    id: p.id,
    ...(p.role ? { role: p.role } : {}),
    ...(p.repere ? { repere: p.repere } : {}),
    inerte: p.defauts.some((c) => INERTE.has(c)),
  }));
  const pilotage = new Pilotage(tree, pilotables);
  const parIdVue = new Map(vue.pieces.map((p) => [p.id, p]));
  let lignes: string[] = [];
  const appliquer = (image: ImagePilotee, enCours: boolean): void => {
    for (const [id, pose] of Object.entries(image.solution.poses)) {
      const g = montage.pieces.get(id);
      const p = parIdVue.get(id);
      if (g && p) g.matrix.copy(matricePiece({ matrice: pose.matrix, miroir: p.miroir }));
    }
    montage.racine.updateMatrixWorld(true);
    // Cadres rouges : ils suivent leur pièce.
    for (const id of montage.enDefaut) {
      const aide = montage.racine.getObjectByName(`defaut:${id}`) as THREE.Box3Helper | undefined;
      const g = montage.pieces.get(id);
      if (aide && g) aide.box.setFromObject(g);
    }
    lignes = enCours
      ? [
          ...Object.keys(image.saturees).map((l) => `${textes.butee} : ${l}`),
          ...image.problemes.map((pb) => `⚠ ${textes.defauts[pb.code] ?? pb.code}${pb.target ? ` (${pb.target})` : ''}`),
          ...image.sansSource.map((l) => `${textes.sansSource} : ${l}`),
        ]
      : [];
    const texte = lignes.join('|');
    if (etatSim.dataset.texte !== texte) {
      etatSim.dataset.texte = texte;
      etatSim.replaceChildren(...lignes.map((l) => {
        const d = document.createElement('div');
        d.textContent = l;
        return d;
      }));
      etatSim.hidden = lignes.length === 0;
    }
    rendre();
  };

  return {
    fermer() {
      observateur.disconnect();
      renderer.domElement.removeEventListener('pointermove', survol);
      renderer.domElement.removeEventListener('pointerleave', quitter);
      controles.dispose();
      montage.dispose();
      grille.geometry.dispose();
      (grille.material as THREE.Material).dispose();
      renderer.dispose();
      conteneur.replaceChildren();
    },
    etat: () => ({
      pieces: montage.pieces.size,
      enDefaut: [...montage.enDefaut],
      camera: [camera.position.x, camera.position.y, camera.position.z],
      cible: [controles.target.x, controles.target.y, controles.target.z],
    }),
    pieceSous,
    simuler: (etat, dt) => appliquer(pilotage.pas(etat, dt), true),
    arreter: () => appliquer(pilotage.remettre(), false),
    pose: (id) => {
      const g = montage.pieces.get(id);
      if (!g) return null;
      const v = new THREE.Vector3().setFromMatrixPosition(g.matrixWorld);
      return [v.x, v.y, v.z];
    },
    lignesEtat: () => [...lignes],
  };
}

(globalThis as { KablixVue3D?: unknown }).KablixVue3D = { ouvrir };
