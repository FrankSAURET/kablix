// Côté page de la vue 3D du montage (piste 11, lot D6c).
//
// Le bouton « 3D » de la barre n'apparaît que pour un projet qui a un
// `system.json`. Au clic, la page envoie le schéma courant à l'extension
// (`vue3dDemande`) ; l'extension rend le document lu, ses volumes et ses
// problèmes (`vue3d`). Le paquet `dist/vue3d.js` (three.js, ~600 Ko) n'est
// chargé qu'à ce moment, une seule fois, par une balise <script> à nonce.

import { t } from './i18n.mjs';
import type { DonneesVue3D } from './mecanique/vue3d-donnees.mjs';
import type { EtatSimulation } from './mecanique/pilotage.mjs';
import type { TextesVue, VueOuverte } from './vue3d.mjs';

declare global {
  interface Window {
    KABLIX_VUE3D_URL?: string;
    KablixVue3D?: { ouvrir(conteneur: HTMLElement, donnees: DonneesVue3D, textes: TextesVue): Promise<VueOuverte> };
  }
}

/** Libellés des codes de défaut (document, rôles, volumes, solveur). */
function textesDefauts(): Record<string, string> {
  return {
    'format': t('Unreadable assembly file'),
    'version-future': t('Assembly file from a newer version'),
    'piece-invalide': t('Invalid part'),
    'piece-doublon': t('Duplicate part ID'),
    'liaison-invalide': t('Invalid joint'),
    'liaison-piece-absente': t('Joint to a missing part'),
    'liaison-doublon': t('Duplicate joint ID'),
    'ref-absente': t('Reference missing from the schematic'),
    'ref-doublon': t('Reference used twice'),
    'fichier-absent': t('Missing file'),
    'role-inconnu': t('Unknown role'),
    'role-sans-repere': t('Role without reference'),
    'role-ref-different': t('Role and reference disagree'),
    'role-doublon': t('Role given twice'),
    'role-type': t('Role does not fit the component'),
    'role-repere-absent': t('Role reference missing from the schematic'),
    'paquet-absent': t('Component package missing'),
    'paquet-sans-volume': t('Component has no 3D model'),
    'maillage-illisible': t('Unreadable mesh'),
    'boucle-fermee': t('Closed loop of joints'),
    'axe-absent': t('Joint axis missing'),
    'engrenage-sans-pivot': t('Gear without a pivot'),
    'couplage-cycle': t('Coupling cycle'),
    'roue-sans-rayon': t('Wheel without a radius'),
    'roue-sans-pivot': t('Wheel without a pivot'),
    'roues-incompatibles': t('Incompatible wheels'),
    'parametre-invalide': t('Invalid joint parameter'),
    'type-inconnu': t('Unknown joint type'),
    'variable-menee': t('Driven variable set by hand'),
  };
}

let chargement: Promise<void> | undefined;
/** Charge `dist/vue3d.js` une fois (script à nonce : la CSP l'exige). */
function chargerPaquet(): Promise<void> {
  if (window.KablixVue3D) return Promise.resolve();
  chargement ??= new Promise<void>((resolve, reject) => {
    const url = window.KABLIX_VUE3D_URL;
    if (!url) return reject(new Error('KABLIX_VUE3D_URL absent'));
    const s = document.createElement('script');
    if (window.KABLIX_NONCE) s.nonce = window.KABLIX_NONCE;
    s.src = url;
    s.onload = () => resolve();
    s.onerror = () => {
      chargement = undefined; // réessayer au prochain clic
      reject(new Error(`chargement de ${url} impossible`));
    };
    document.head.append(s);
  });
  return chargement;
}

export interface Vue3DPage {
  /** Projet chargé : montre le bouton s'il a un montage, ferme la vue sinon. */
  projet(aSysteme: boolean): void;
  /** Réponse `vue3d` de l'extension. */
  recevoir(donnees: DonneesVue3D): Promise<void>;
  fermer(): void;
  /** Vue ouverte : la simulation peut la piloter. */
  ouverte(): boolean;
  /** Image de simulation (lot D6d) ; sans effet si la vue est fermée. */
  simuler(etat: EtatSimulation, dt: number): void;
  /** Fin de simulation : la vue revient à la pose du document. */
  arreter(): void;
}

/** Branche le bouton et le panneau. `schema()` rend le schéma courant. */
export function brancherVue3D(poster: (msg: unknown) => void, schema: () => unknown): Vue3DPage {
  const bouton = document.getElementById('view-3d') as HTMLButtonElement | null;
  const panneau = document.getElementById('vue3d') as HTMLElement | null;
  const scene = document.getElementById('vue3d-scene') as HTMLElement | null;
  const croix = document.getElementById('vue3d-close') as HTMLButtonElement | null;
  let ouverte: VueOuverte | undefined;
  let jeton = 0; // une réponse tardive d'un ancien projet ne rouvre rien

  const fermer = (): void => {
    jeton++;
    ouverte?.fermer();
    ouverte = undefined;
    if (panneau) panneau.hidden = true;
  };
  bouton?.addEventListener('click', () => {
    if (panneau && !panneau.hidden) return fermer();
    poster({ type: 'vue3dDemande', diagram: schema() });
  });
  croix?.addEventListener('click', fermer);

  return {
    projet(aSysteme) {
      fermer();
      if (bouton) bouton.hidden = !aSysteme;
    },
    async recevoir(donnees) {
      if (!panneau || !scene) return;
      fermer();
      const moi = jeton;
      panneau.hidden = false;
      try {
        await chargerPaquet();
        if (moi !== jeton || !window.KablixVue3D) return;
        const vue = await window.KablixVue3D.ouvrir(scene, donnees, {
          role: t('role'),
          repere: t('reference'),
          mecanique: t('mechanical part'),
          sansWebgl: t('3D view unavailable: WebGL is disabled.'),
          butee: t('End stop'),
          sansSource: t('Not driven by the simulation'),
          defauts: textesDefauts(),
        });
        if (moi !== jeton) vue.fermer();
        else ouverte = vue;
      } catch (e) {
        console.error('Vue 3D :', e);
        const p = document.createElement('p');
        p.className = 'vue3d__message';
        p.textContent = t('3D view unavailable: WebGL is disabled.');
        scene.replaceChildren(p);
      }
    },
    fermer,
    ouverte: () => ouverte !== undefined,
    simuler(etat, dt) {
      ouverte?.simuler(etat, dt);
    },
    arreter() {
      ouverte?.arreter();
    },
  };
}
