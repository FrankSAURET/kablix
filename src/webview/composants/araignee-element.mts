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
// Électriquement, l'araignée n'expose que son bus I²C (SCL, SDA, V+, GND) : le
// PCA9685 embarqué est simulé comme une vraie carte PCA9685 (sim.mts), ses
// canaux 0..7 pilotant les 8 articulations dans l'ordre
// avant-gauche, avant-droite, arrière-gauche, arrière-droite (hanche puis genou).
import { css, html, svg, LitElement, type TemplateResult } from 'lit';
import { ElementPin } from './pin.mjs';
import {
  boxFaces, decalFaces, groundShadow, prismFaces, regularPoly, renderFaces, rotZ,
  type Face, type Vec2, type Vec3,
} from './iso3d.mjs';
import { hasProfile, profile } from './profils.mjs';
import {
  COLORS, JointAnimator, LEG_SPIDER, legFaces, legGeometry, type LegGeometry,
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
  const p = profile(name);
  const k = 2 * CHASSIS.radius / Math.max(p.w, p.h);
  const turn = (r: Vec2[]): Vec2[] => r.map((q) => {
    const t = rotZ({ x: q.x * k, y: q.y * k, z: 0 }, YAW);
    return { x: t.x, y: t.y };
  });
  return { poly: turn(p.poly), holes: p.holes.map(turn) };
}

/** Cartes embarquées, posées à plat sur la plaque : longueur (le long de X),
 *  largeur, épaisseur, décalage en Y, couleur. */
const BOARDS: readonly { len: number; w: number; h: number; y: number; color: string }[] = [
  { len: 46, w: 18, h: 4, y: -22, color: '#1f6b3a' }, // Raspberry Pi Pico
  { len: 40, w: 24, h: 4, y: 4, color: '#2b6cb0' }, // PCA9685 16 servos
  { len: 34, w: 18, h: 10, y: 30, color: '#2f3640' }, // batterie
];

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
  /** Non vide : l'électronique embarquée est dessinée sur la plaque. */
  declare boards: string;

  static properties = {
    hip0: {}, knee0: {},
    hip1: {}, knee1: {},
    hip2: {}, knee2: {},
    hip3: {}, knee3: {},
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
    const leg = Math.floor(i / 2);
    const key = (i % 2 === 0 ? 'hip' : 'knee') + leg;
    (this as unknown as Record<string, number>)[key] = v;
  }

  /** Consigne courante d'une articulation (0..7). */
  private target(i: number): number {
    const leg = Math.floor(i / 2);
    const key = (i % 2 === 0 ? 'hip' : 'knee') + leg;
    const n = Number((this as unknown as Record<string, unknown>)[key]);
    return Number.isFinite(n) ? Math.max(0, Math.min(180, n)) : 90;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const j of this.joints) j.stop();
  }

  willUpdate(changed: Map<string, unknown>): void {
    if (![...changed.keys()].some((k) => k.startsWith('hip') || k.startsWith('knee') || k === 'speed')) return;
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

  // Broches : le seul câblage extérieur est le bus I²C (le reste est embarqué).
  // Connecteur 4 points sur le bord gauche du châssis, grille 10 px. Ces
  // coordonnées sont FIGÉES : les schémas déjà câblés en dépendent.
  readonly pinInfo: ElementPin[] = [
    { name: 'SCL', x: 110, y: 170, signals: [{ type: 'i2c', signal: 'SCL', bus: 0 }] },
    { name: 'SDA', x: 110, y: 190, signals: [{ type: 'i2c', signal: 'SDA', bus: 0 }] },
    { name: 'V+', x: 110, y: 210, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'GND', x: 110, y: 230, signals: [{ type: 'power', signal: 'GND' }] },
  ];

  /** Le bornier I²C reste dessiné À PLAT, vu de face : ses quatre pastilles
   *  doivent tomber exactement sur `pinInfo` (colonne x=110, pas de 20 px) pour
   *  que les fils s'y accrochent — une barrette projetée en isométrie n'aurait
   *  jamais aligné ses points sur une colonne verticale. Une nappe le relie au
   *  coin gauche de la plaque : c'est aussi ce qu'on voit sur le robot. */
  private connector(): TemplateResult {
    return svg`
      <g class="araignee__connector">
        <path d="M126 176 C 140 172, 146 168, 152 163" fill="none" stroke="#9aa5ad" stroke-width="2" />
        <path d="M126 224 C 142 220, 150 210, 156 196" fill="none" stroke="#9aa5ad" stroke-width="2" />
        <rect x="104" y="160" width="22" height="82" rx="4" fill="#2f3640" stroke="#1b1f24" stroke-width="1" />
        ${[170, 190, 210, 230].map((y) => svg`
          <rect x="106" y=${y - 4} width="18" height="8" rx="2" fill=${COLORS.brass} stroke="#8a7433" stroke-width="1" />
        `)}
      </g>
    `;
  }

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
    ];
    if (this.boards) {
      const top = CHASSIS.height + CHASSIS.thickness;
      for (const b of BOARDS) {
        faces.push(...boxFaces(
          rotZ({ x: -b.len / 2, y: b.y, z: top + b.h / 2 }, YAW),
          rotZ({ x: b.len / 2, y: b.y, z: top + b.h / 2 }, YAW),
          b.w, b.h, b.color,
        ));
      }
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
        ${this.connector()}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-araignee')) {
  customElements.define('kablix-araignee', AraigneeElement);
}
