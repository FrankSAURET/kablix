// Composant <kablix-araignee> : robot araignée quadrupède complet — châssis
// octogonal + 4 pattes à 2 articulations (hanche, genou), électronique
// embarquée (Pico, PCA9685, batterie) posée sur la plaque.
//
// Dessiné EN VOLUME depuis la v2026.8.22 (vue isométrique, moteur ./iso3d.mts).
// La version précédente était vue de dessus, strictement plate : le robot avait
// beau lever une patte, l'image ne changeait pas de hauteur — hanche et genou
// tournaient tous les deux dans la feuille. En volume, la hanche balaie le sol
// et le genou lève la patte, comme sur le vrai châssis à 8 servos ; l'ombre
// portée sous chaque pied donne la hauteur, que l'isométrie seule ne rend pas.
//
// Les pattes ne sont PAS redessinées ici : c'est la mécanique de <kablix-patte>
// (`legGeometry` + `legFaces`) réutilisée quatre fois, une par coin. Chaque
// patte garde donc exactement le comportement d'une patte posée seule.
//
// Électriquement, l'araignée n'expose RIEN depuis la v2026.8.24 (Frank) : elle
// porte sa propre Pico W, dessinée sur le dos du châssis, et c'est ELLE qu'on
// programme — la déposer dans l'atelier choisit la Pico W comme cible
// (catalog.mts, `board: 'picow'`). Son PCA9685 embarqué reste simulé comme une
// vraie carte PCA9685 (sim.mts) et répond sur le bus I²C interne, ses canaux
// 0..7 pilotant les 8 articulations dans l'ordre avant-gauche, avant-droite,
// arrière-gauche, arrière-droite (hanche puis genou).
import { css, html, svg, LitElement, type TemplateResult } from 'lit';
import { ElementPin } from './pin.mjs';
import {
  boxFaces, decalFaces, groundShadow, prismFaces, regularPoly, renderFaces, rotZ, shade,
  type Face, type Vec2, type Vec3,
} from './iso3d.mjs';
import { hasProfile, profile } from './profils.mjs';
import {
  COLORS, JointAnimator, LEG_SPIDER, jointTarget, legFaces, legGeometry, type LegGeometry,
} from './patte-element.mjs';

/** Feuille 400×400 : centre de la scène 3D (le châssis flotte au-dessus du
 *  sol, il faut donc de la place en haut pour lui et en bas pour les pattes). */
const ORIGIN = { x: 200, y: 205 };

/** Cotes du châssis, en unités de la feuille. */
const CHASSIS = { radius: 55, thickness: 8, height: 46 };
/** Distance du centre à chaque hanche (sur les pans coupés du châssis). */
const HIP_RADIUS = 46;
/** Le robot est présenté DE BIAIS : ses pattes partent à ±45°, or c'est
 *  exactement la direction que l'isométrie écrase sur l'axe vertical de
 *  l'écran — les pattes avant et arrière se superposaient au châssis au lieu
 *  d'en sortir. Un quart de tour de 22° les dégage toutes les quatre. */
const YAW = 22;

/** Orientation de repos de chaque patte, en degrés dans le plan du sol
 *  (0 = vers +X, 90 = vers l'arrière). L'ordre fixe l'ordre des canaux PWM :
 *  0/1 avant-gauche, 2/3 avant-droite, 4/5 arrière-gauche, 6/7 arrière-droite.
 *  `mirror` : patte montée en MIROIR (flanc droit du robot) — la même consigne
 *  de hanche la fait tourner dans l'autre sens, comme sur le vrai montage. */
const LEGS: readonly { dir: number; mirror: boolean }[] = [
  { dir: -135, mirror: false }, // avant-gauche
  { dir: -45, mirror: true }, // avant-droite
  { dir: 135, mirror: false }, // arrière-gauche
  { dir: 45, mirror: true }, // arrière-droite
];

/** Nom de la propriété d'une articulation (0..7) : `hip0`, `knee0`, `hip1`…
 *  Préfixé de `rev`, c'est celui de son sens de montage (`revhip0`). */
function jointKey(i: number): string {
  return (i % 2 === 0 ? 'hip' : 'knee') + Math.floor(i / 2);
}

/** Hanche d'une patte dans le repère monde (z = milieu de la plaque), lacet
 *  de présentation compris. */
function hipPoint(dirDeg: number): Vec3 {
  const a = ((dirDeg + YAW) * Math.PI) / 180;
  return {
    x: HIP_RADIUS * Math.cos(a),
    y: HIP_RADIUS * Math.sin(a),
    z: CHASSIS.height + CHASSIS.thickness / 2,
  };
}

/**
 * Contour de la plaque, vu de dessus : le dessin de `Composants.svg` s'il a été
 * extrait sous le nom `araignee-chassis` (mode d'emploi : docs/fr/Drawing-systems.md),
 * sinon l'octogone d'origine. Le dessin décide de la SILHOUETTE, pas des cotes :
 * il est ramené au diamètre `CHASSIS.radius` et tourné du lacet de présentation,
 * pour que hanches, pattes, cartes et bornier restent où le reste du composant
 * les attend. Le haut du dessin est l'AVANT du robot.
 */
function chassisOutline(phase: number, name = 'araignee-chassis'): { poly: Vec2[]; holes: Vec2[][] } {
  if (!hasProfile(name)) return { poly: regularPoly(8, CHASSIS.radius, phase), holes: [] };
  return flatOutline(profile(name), 2 * CHASSIS.radius, 0);
}

/**
 * Un contour dessiné (profils.mts) posé à plat sur la plaque : ramené à `size`
 * dans sa plus grande dimension, décalé de `cy` vers l'arrière, puis tourné du
 * lacet de présentation — comme tout le reste de la scène, sinon la pièce
 * resterait de face pendant que le robot est de biais.
 */
function flatOutline(
  p: { poly: Vec2[]; holes: Vec2[][]; w: number; h: number }, size: number, cy: number,
): { poly: Vec2[]; holes: Vec2[][] } {
  const k = size / Math.max(p.w, p.h);
  const turn = (r: Vec2[]): Vec2[] => r.map((q) => {
    const t = rotZ({ x: q.x * k, y: q.y * k + cy, z: 0 }, YAW);
    return { x: t.x, y: t.y };
  });
  return { poly: turn(p.poly), holes: p.holes.map(turn) };
}

/** Une pièce d'électronique posée à plat sur la plaque : son nom de profil
 *  dessiné, sa longueur (le long de X), sa largeur, son épaisseur, son décalage
 *  en Y et sa couleur. Le dessin, s'il existe, décide de la SILHOUETTE ; les
 *  cotes, elles, restent ici — c'est ce qui garde chaque carte à sa place sur
 *  la plaque quel que soit le contour retouché. */
type Board = {
  profil: string; len: number; w: number; h: number; y: number; color: string;
};

/** Cartes embarquées, dessinées seulement quand la case « électronique
 *  embarquée » est cochée. La Pico W n'est PAS dans la liste : elle est
 *  TOUJOURS dessinée (picowFaces), c'est le cerveau du robot. */
const BOARDS: readonly Board[] = [
  { profil: 'araignee-pca9685', len: 40, w: 24, h: 4, y: 4, color: '#2b6cb0' }, // PCA9685 16 servos
  { profil: 'araignee-batterie', len: 34, w: 18, h: 10, y: 30, color: '#2f3640' }, // batterie
];

/** Cotes de la carte Pico W posée sur la plaque (la vraie fait 51 × 21 mm) et
 *  couleurs de ses trois repères visibles : circuit vert, blindage du module
 *  radio, prise USB. */
const PICOW: Board = { profil: 'araignee-picow', len: 46, w: 18, h: 4, y: -22, color: '#1f6b3a' };
const PICOW_COLORS = { shield: '#b9c1c7', usb: '#d7dcdf' };

/**
 * Le corps d'une pièce d'électronique posée sur la plaque. Si son contour est
 * dessiné dans `Composants.svg` sous son nom de profil (`araignee-pca9685`,
 * `araignee-batterie`, `araignee-picow` — mode d'emploi :
 * docs/fr/Drawing-systems.md), c'est LUI qui donne la silhouette, perçages
 * compris ; sinon c'est le pavé de repli, aux mêmes cotes.
 * Retoucher une carte ne demande donc rien d'autre que de la dessiner.
 */
function boardFaces(b: Board, top: number): Face[] {
  if (!hasProfile(b.profil)) {
    const z = top + b.h / 2;
    return boxFaces(
      rotZ({ x: -b.len / 2, y: b.y, z }, YAW), rotZ({ x: b.len / 2, y: b.y, z }, YAW),
      b.w, b.h, b.color,
    );
  }
  const outline = flatOutline(profile(b.profil), b.len, b.y);
  const body = prismFaces(outline.poly, top, top + b.h, b.color);
  return [
    ...body,
    // Perçages et découpes du dessin : des décalques posés sur le dessus, comme
    // pour la plaque — les creuser ne changerait rien vu d'ici. Teinte : la
    // couleur de la carte assombrie, pour qu'un trou dans un circuit vert ne
    // soit pas de la même encre qu'un trou dans une pile.
    ...outline.holes.flatMap((h) => decalFaces(h, top + b.h, shade(b.color, 0.55), body)),
  ];
}

/**
 * La carte Pico W du robot, TOUJOURS dessinée : depuis la v2026.8.24 le robot
 * n'a plus aucune connectique, c'est cette carte qu'on programme — la voir sur
 * le dos de la bête est ce qui l'explique. Vue volontairement simpliste : le
 * circuit vert, le blindage carré du module radio et la prise USB suffisent à la
 * reconnaître à cette taille. Le contour vient du dessin s'il existe ; le
 * blindage et la prise restent posés dessus, aux mêmes places.
 */
function picowFaces(top: number): Face[] {
  const at = (x: number, y: number, zz: number): Vec3 => rotZ({ x, y: y + PICOW.y, z: zz }, YAW);
  const deck = top + PICOW.h;
  return [
    ...boardFaces(PICOW, top),
    // Blindage du module radio (côté arrière de la carte) : un carré posé à plat.
    ...boxFaces(at(6, 0, deck + 0.8), at(15, 0, deck + 0.8), 13, 1.6, PICOW_COLORS.shield),
    // Prise USB, en bout de carte et débordant un peu — c'est par là qu'on
    // téléverse, le détail parle de lui-même.
    ...boxFaces(at(-PICOW.len / 2 - 1, 0, deck + 1), at(-PICOW.len / 2 + 5, 0, deck + 1),
      8, 2.4, PICOW_COLORS.usb),
  ];
}

export class AraigneeElement extends LitElement {
  // Comme <kablix-patte> : sans ceci `:host` reste `display: inline` (boîte
  // haute d'une ligne de texte, `transform` ignoré par le navigateur).
  static get styles() {
    return css`
      :host { display: inline-block; }
    `;
  }

  /** Consigne d'angle (0-180°) des 8 articulations. 90/90 = robot debout. */
  declare hip0: number;
  declare knee0: number;
  declare hip1: number;
  declare knee1: number;
  declare hip2: number;
  declare knee2: number;
  declare hip3: number;
  declare knee3: number;
  /** Temps d'un tour complet (360°) à pleine vitesse, en secondes. 0 = instantané. */
  declare speed: number;
  /** Non vide : le PCA9685 et la batterie sont dessinés sur la plaque (la carte
   *  Pico W, elle, est TOUJOURS visible : c'est le cerveau du robot). */
  declare boards: string;
  /** Non vide : ce servo est monté à l'envers (180 − consigne). Un par
   *  articulation — sur le vrai châssis, tous ne sont pas vissés du même côté. */
  declare revhip0: string;
  declare revknee0: string;
  declare revhip1: string;
  declare revknee1: string;
  declare revhip2: string;
  declare revknee2: string;
  declare revhip3: string;
  declare revknee3: string;

  static properties = {
    hip0: {}, knee0: {},
    hip1: {}, knee1: {},
    hip2: {}, knee2: {},
    hip3: {}, knee3: {},
    revhip0: { type: String }, revknee0: { type: String },
    revhip1: { type: String }, revknee1: { type: String },
    revhip2: { type: String }, revknee2: { type: String },
    revhip3: { type: String }, revknee3: { type: String },
    speed: { type: Number },
    boards: { type: String },
    shown: { state: true },
  };

  /** Angles réellement affichés (rattrapage à vitesse limitée), 8 valeurs :
   *  [hanche0, genou0, hanche1, genou1, …] — un seul état pour un seul rendu. */
  declare shown: number[];

  private joints: JointAnimator[] = [];

  constructor() {
    super();
    this.speed = 2;
    this.boards = '';
    this.shown = new Array(8).fill(90);
    for (let i = 0; i < 8; i++) {
      (this as unknown as Record<string, string>)[`rev${jointKey(i)}`] = '';
      this.hipOrKnee(i, 90);
      // Chaque articulation recopie son angle courant dans le tableau affiché
      // (un nouveau tableau : Lit ne détecte pas la mutation d'un array).
      this.joints.push(new JointAnimator(() => {
        this.shown = this.joints.map((j) => j.shown);
      }));
    }
  }

  /** Écrit la consigne d'une articulation : i pair = hanche, impair = genou. */
  private hipOrKnee(i: number, v: number): void {
    (this as unknown as Record<string, number>)[jointKey(i)] = v;
  }

  /** Consigne courante d'une articulation (0..7), sens de montage compris. */
  private target(i: number): number {
    const self = this as unknown as Record<string, unknown>;
    return jointTarget(self[jointKey(i)], self[`rev${jointKey(i)}`]);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const j of this.joints) j.stop();
  }

  willUpdate(changed: Map<string, unknown>): void {
    if (![...changed.keys()].some((k) => /^(rev)?(hip|knee)\d$/.test(k) || k === 'speed')) return;
    const degPerSec = this.degPerSec();
    this.joints.forEach((j, i) => j.sync(this.target(i), degPerSec));
  }

  private degPerSec(): number {
    const s = Number(this.speed);
    if (!Number.isFinite(s) || s <= 0) return 0;
    return 360 / s;
  }

  /** Géométrie 3D des quatre pattes telle qu'elle est DESSINÉE — c'est ce que
   *  lisent les bancs : la position d'un pied dit tout de la cinématique, là où
   *  compter des polygones ne dirait rien. */
  get geometry(): LegGeometry[] {
    const angles = this.shown ?? new Array(8).fill(90);
    return LEGS.map((leg, i) => legGeometry(
      hipPoint(leg.dir), leg.dir + YAW, angles[i * 2] ?? 90, angles[i * 2 + 1] ?? 90, LEG_SPIDER, leg.mirror,
    ));
  }

  // AUCUNE BROCHE (Frank, v2026.8.24) : le robot porte sa propre Pico W, il n'y
  // a donc rien à câbler — ni bus I²C, ni alimentation. Le bornier à quatre
  // points et sa nappe ont disparu avec elles ; les schémas d'avant qui les
  // câblaient perdent ces fils au chargement (l'éditeur écarte un fil dont la
  // broche n'existe plus), le robot, lui, se programme directement.
  readonly pinInfo: ElementPin[] = [];

  render(): TemplateResult {
    const legs = this.geometry;
    // Un seul tas de faces pour TOUTE la scène : c'est le tri en profondeur
    // commun qui fait passer une patte arrière derrière la plaque et la patte
    // avant devant. Trier chaque pièce séparément casserait l'illusion.
    // Même lacet que les hanches, sinon la plaque et les cartes resteraient de
    // face pendant que les pattes, elles, seraient tournées.
    const phase = Math.PI / 8 + (YAW * Math.PI) / 180;
    const outline = chassisOutline(phase);
    const plate = prismFaces(outline.poly,
      CHASSIS.height, CHASSIS.height + CHASSIS.thickness, COLORS.chassis);
    const faces: Face[] = [
      ...plate,
      // Perçages et allègements du dessin : des décalques rangés devant la
      // plaque (les creuser vraiment ne changerait rien à l'image vue d'ici).
      ...outline.holes.flatMap((h) =>
        decalFaces(h, CHASSIS.height + CHASSIS.thickness, '#8fb3c4', plate)),
      ...legs.flatMap((g) => legFaces(g, LEG_SPIDER)),
      // Le cerveau, toujours visible : c'est la carte qu'on programme.
      ...picowFaces(CHASSIS.height + CHASSIS.thickness),
    ];
    if (this.boards) {
      for (const b of BOARDS) faces.push(...boardFaces(b, CHASSIS.height + CHASSIS.thickness));
    }
    return html`
      <svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
        ${/* Sous-templates en `svg` et NON en `html` : un fragment commençant
             par <g> passé à `html` est parsé en XHTML (namespace HTML), les
             pattes existent alors dans le DOM mais ne sont JAMAIS dessinées. */
          svg`<g class="araignee__shadows">
            <ellipse cx=${ORIGIN.x} cy=${ORIGIN.y} rx="72" ry="42" fill="rgba(0,0,0,0.10)" />
            ${legs.map((g) => groundShadow(g.foot, 4, ORIGIN.x, ORIGIN.y))}
          </g>`}
        <g class="araignee__solid">${renderFaces(faces, ORIGIN.x, ORIGIN.y)}</g>
      </svg>
    `;
  }
}

if (!customElements.get('kablix-araignee')) {
  customElements.define('kablix-araignee', AraigneeElement);
}
