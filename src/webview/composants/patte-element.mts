// Composant <kablix-patte> : patte de robot à 2 articulations (hanche, genou),
// dessinée EN VOLUME (vue isométrique, moteur ./iso3d.mts) depuis la v2026.8.22.
// Chaque articulation est un servo interne (0-180°, même formule que
// <kablix-servo>) :
//   • la HANCHE tourne la patte dans le plan du sol (balayage avant/arrière),
//     90° = direction de repos ;
//   • le GENOU lève ou baisse le tibia dans le plan vertical de la patte :
//     90° = tibia VERTICAL (robot debout), 180° = tendu à l'horizontale (ventre
//     au sol), 0° = replié sous le corps.
// C'est la mécanique réelle d'un quadrupède à 8 servos, celle du robot araignée.
// Le dessin plat d'avant (./externe/patte.svg) ne montrait aucun relief : les
// deux rotations se faisaient dans la feuille, donc « lever la patte » et « la
// tourner » donnaient la même image.
import { css, html, LitElement, type TemplateResult } from 'lit';
import { ElementPin } from './pin.mjs';
import {
  add, boxFaces, extrudeProfile, groundShadow, renderFaces, scale, shadowGradient,
  type Face, type Vec3,
} from './iso3d.mjs';
import { hasProfile, profile } from './profils.mjs';

/** Extrait le groupe `<g id="ID" …> … </g>` complet (gère l'imbrication).
 *  Gardé ici : d'autres forks s'en servent pour découper un SVG retouché. */
export function extractGroup(svgText: string, id: string): string {
  const open = new RegExp(`<g\\s+id="${id}"[^>]*>`);
  const m = open.exec(svgText);
  if (!m) return '';
  const start = m.index;
  let depth = 0;
  const tag = /<g\b[^>]*?(\/?)>|<\/g\s*>/g;
  tag.lastIndex = start;
  let t: RegExpExecArray | null;
  while ((t = tag.exec(svgText))) {
    if (t[0].startsWith('</g')) {
      depth--;
      if (depth === 0) return svgText.slice(start, t.index + t[0].length);
    } else if (t[1] !== '/') {
      depth++;
    }
  }
  return '';
}

/** Couleurs de la mécanique — reprises du dessin plat pour ne pas dépayser :
 *  châssis PMMA bleuté, os d'aluminium clair, servos noirs, visserie dorée. */
export const COLORS = {
  chassis: '#bcdff0',
  bone: '#c9d6de',
  servo: '#2f3640',
  brass: '#c8ad63',
};

/** Cotes d'une patte, en unités de la feuille du composant. La patte seule est
 *  un peu plus courte que celles du robot : elle doit tenir dans une vignette
 *  de 140×90, pattes tendues comme repliées. */
export type LegSize = { coxa: number; tibia: number; bone: number };
export const LEG_ALONE: LegSize = { coxa: 16, tibia: 28, bone: 6 };
export const LEG_SPIDER: LegSize = { coxa: 30, tibia: 45, bone: 8 };

/** Géométrie d'une patte : les points qui comptent, pour dessiner ET pour
 *  mesurer (les bancs lisent la position du pied, pas des pixels). */
export type LegGeometry = { hip: Vec3; knee: Vec3; foot: Vec3 };

/**
 * Cinématique d'UNE patte. `dirDeg` est la direction de repos dans le plan du
 * sol (0 = vers +X). `mirror` : patte montée en MIROIR (flanc droit du robot,
 * servo retourné) — la même consigne de hanche la fait alors tourner dans
 * l'autre sens, exactement comme sur le vrai châssis.
 */
export function legGeometry(
  hip: Vec3, dirDeg: number, hipAngle: number, kneeAngle: number, size: LegSize, mirror = false,
): LegGeometry {
  const swing = (hipAngle - 90) * (mirror ? -1 : 1);
  const dir = ((dirDeg + swing) * Math.PI) / 180;
  const u: Vec3 = { x: Math.cos(dir), y: Math.sin(dir), z: 0 };
  const knee = add(hip, scale(u, size.coxa));
  // Élévation du tibia mesurée depuis la verticale descendante : 90° = tibia
  // vertical (le robot est debout sur ses quatre pattes).
  const e = ((kneeAngle - 90) * Math.PI) / 180;
  const foot = add(knee, {
    x: u.x * Math.sin(e) * size.tibia,
    y: u.y * Math.sin(e) * size.tibia,
    z: -Math.cos(e) * size.tibia,
  });
  return { hip, knee, foot };
}

/**
 * Un OS de la patte, de `a` à `b`, épaisseur `t`. Le contour dessiné dans
 * `Composants.svg` (`patte-femur`, `patte-tibia`) est utilisé s'il a été extrait
 * — mode d'emploi : docs/fr/Drawing-systems.md. Sans dessin, on garde le pavé :
 * le composant reste complet tant que la pièce n'est pas tracée.
 */
function bone(name: string, a: Vec3, b: Vec3, t: number): Face[] {
  if (!hasProfile(name)) return boxFaces(a, b, t, t, COLORS.bone);
  const p = profile(name);
  return extrudeProfile(p, a, b, t, COLORS.bone, p.holes);
}

/** Faces d'une patte : équerre de hanche, fémur, bloc de genou, tibia, pied. */
export function legFaces(g: LegGeometry, size: LegSize): Face[] {
  const b = size.bone;
  return [
    // Servo de hanche : un bloc posé à l'aplomb de l'articulation.
    ...boxFaces(add(g.hip, { x: 0, y: 0, z: -b * 0.9 }), add(g.hip, { x: 0, y: 0, z: b * 0.9 }), b * 1.4, b * 1.4, COLORS.servo),
    ...bone('patte-femur', g.hip, g.knee, b),
    // Servo de genou, aligné sur le fémur.
    ...boxFaces(add(g.knee, { x: 0, y: 0, z: -b * 0.8 }), add(g.knee, { x: 0, y: 0, z: b * 0.8 }), b * 1.4, b * 1.4, COLORS.servo),
    ...bone('patte-tibia', g.knee, g.foot, b * 0.8),
    // Embout caoutchouc : un petit cube au bout du tibia.
    ...boxFaces(add(g.foot, { x: 0, y: 0, z: -b * 0.35 }), add(g.foot, { x: 0, y: 0, z: b * 0.35 }), b * 0.9, b * 0.9, COLORS.servo),
  ];
}

/**
 * Consigne d'un servo, sens de montage compris : `rev` non vide = servo vissé à
 * l'envers, la même consigne le fait tourner dans l'autre sens (180 − angle).
 * C'est un réglage de MONTAGE, pas de programme : le code continue d'envoyer
 * « 30° » et c'est la mécanique qui décide de quel côté ça part.
 */
export function jointTarget(v: unknown, rev: unknown): number {
  const n = Number(v);
  const a = Number.isFinite(n) ? Math.max(0, Math.min(180, n)) : 90;
  return rev ? 180 - a : a;
}

/** Anime UN angle vers sa consigne à vitesse limitée (rattrapage image par
 *  image) — même mécanique que <kablix-servo>, factorisée car la patte a DEUX
 *  articulations indépendantes (hanche, genou) tournant chacune à son rythme
 *  (et l'araignée en a huit). */
export class JointAnimator {
  shown = 90;
  private target = 90;
  private degPerSec = 0;
  private raf = 0;
  private timer = 0;
  private last = 0;

  constructor(private onFrame: () => void) {}

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.timer) clearTimeout(this.timer);
    this.raf = 0;
    this.timer = 0;
  }

  sync(target: number, degPerSec: number): void {
    this.target = target;
    this.degPerSec = degPerSec;
    if (degPerSec <= 0) {
      this.stop();
      this.shown = target;
      // Notifier MÊME sans animation : sans ce rappel, un composant réglé sur
      // « rotation instantanée » (speed = 0) gardait à l'écran l'angle initial,
      // l'angle affiché n'étant recopié que par les images d'animation.
      this.onFrame();
      return;
    }
    if (Math.abs(target - this.shown) < 0.01 || this.raf || this.timer) return;
    this.last = performance.now();
    this.schedule();
  }

  private schedule(): void {
    this.raf = requestAnimationFrame(this.frame);
    this.timer = window.setTimeout(this.frame, 32);
  }

  private frame = (): void => {
    this.stop();
    const now = performance.now();
    const dt = Math.max(0, (now - this.last) / 1000);
    this.last = now;
    const delta = this.target - this.shown;
    const maxStep = this.degPerSec * dt;
    if (Math.abs(delta) <= maxStep) {
      this.shown = this.target;
    } else {
      this.shown += Math.sign(delta) * maxStep;
      this.schedule();
    }
    this.onFrame();
  };
}

/** Feuille de la patte seule et centre de sa scène 3D. La hanche est PERCHÉE à
 *  z = tibia : genou à 90° (patte droite), le pied tombe alors pile sur le sol
 *  (z = 0) et son ombre se colle dessous — c'est la patte qui porte le robot.
 *  Le centre est décalé à droite pour laisser la colonne des broches (x = 10)
 *  hors du dessin, et la feuille couvre TOUTES les poses (hanche 0..180 ×
 *  genou 0..180, ombre au sol comprise) : rien n'est jamais rogné, verify:araignee
 *  le repasse en revue pose par pose. */
const ALONE_SHEET = { w: 130, h: 95 };
const ALONE_ORIGIN = { x: 70, y: 58 };

export class PatteElement extends LitElement {
  // Sans ceci, `:host` reste `display: inline` : la boîte du composant fait la
  // hauteur d'une ligne de texte (17 px) au lieu des 90 px du dessin, l'éditeur
  // ne mesure donc qu'un carré minuscule et un `transform` posé sur l'hôte (la
  // capture des fiches d'aide) est purement ignoré par le navigateur.
  static get styles() {
    return css`
      :host { display: inline-block; }
    `;
  }

  /** Consigne d'angle (0-180°) de chaque articulation. */
  declare hipAngle: number;
  declare kneeAngle: number;
  /** Temps d'un tour complet (360°) à pleine vitesse, en secondes. 0 = instantané. */
  declare speed: number;
  /** Non vide : servo monté à l'envers, il part dans l'AUTRE sens (180 − consigne). */
  declare revhip: string;
  declare revknee: string;

  static properties = {
    hipAngle: {},
    kneeAngle: {},
    speed: { type: Number },
    revhip: { type: String },
    revknee: { type: String },
    hipShown: { state: true },
    kneeShown: { state: true },
  };

  declare hipShown: number;
  declare kneeShown: number;
  private hip = new JointAnimator(() => { this.hipShown = this.hip.shown; });
  private knee = new JointAnimator(() => { this.kneeShown = this.knee.shown; });

  constructor() {
    super();
    this.hipAngle = 90;
    this.kneeAngle = 90;
    this.speed = 2;
    this.revhip = '';
    this.revknee = '';
    this.hipShown = 90;
    this.kneeShown = 90;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.hip.stop();
    this.knee.stop();
  }

  willUpdate(changed: Map<string, unknown>): void {
    const watched = ['hipAngle', 'kneeAngle', 'speed', 'revhip', 'revknee'];
    if (!watched.some((k) => changed.has(k))) return;
    const degPerSec = this.degPerSec();
    this.hip.sync(jointTarget(this.hipAngle, this.revhip), degPerSec);
    this.knee.sync(jointTarget(this.kneeAngle, this.revknee), degPerSec);
  }

  private degPerSec(): number {
    const s = Number(this.speed);
    if (!Number.isFinite(s) || s <= 0) return 0;
    return 360 / s;
  }

  /** Géométrie 3D affichée — lue telle quelle par les bancs de test : mesurer
   *  la position du pied vaut mieux que d'inspecter des polygones. */
  get geometry(): LegGeometry {
    const hip: Vec3 = { x: 0, y: 0, z: LEG_ALONE.tibia };
    return legGeometry(hip, 0, this.hipShown ?? 90, this.kneeShown ?? 90, LEG_ALONE);
  }

  // Broches : 2 connecteurs 3 fils (hanche, genou), calés en dehors de la zone
  // mécanique (colonne x=10, grille 10 px). Non dessinées dans le SVG (comme la
  // diode) : la pastille est posée génériquement par l'éditeur.
  readonly pinInfo: ElementPin[] = [
    { name: 'hanche.GND', x: 10, y: 10, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'hanche.V+', x: 10, y: 20, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'hanche.PWM', x: 10, y: 30, signals: [{ type: 'pwm' }] },
    { name: 'genou.GND', x: 10, y: 55, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'genou.V+', x: 10, y: 65, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'genou.PWM', x: 10, y: 75, signals: [{ type: 'pwm' }] },
  ];

  render(): TemplateResult {
    // Racine en `html` (elle commence par <svg>, donc pas de piège de
    // namespace), contenu en `svg` : les polygones viennent de `renderFaces`.
    const g = this.geometry;
    return html`
      <svg width=${ALONE_SHEET.w} height=${ALONE_SHEET.h}
        viewBox="0 0 ${ALONE_SHEET.w} ${ALONE_SHEET.h}" xmlns="http://www.w3.org/2000/svg">
        <defs>${shadowGradient('patte-ombre')}</defs>
        <g class="leg__shadow">${groundShadow(g.foot, 3.5, ALONE_ORIGIN.x, ALONE_ORIGIN.y,
          { fondu: 'patte-ombre' })}</g>
        <g class="leg__solid">${renderFaces(legFaces(g, LEG_ALONE), ALONE_ORIGIN.x, ALONE_ORIGIN.y)}</g>
      </svg>
    `;
  }
}

if (!customElements.get('kablix-patte')) {
  customElements.define('kablix-patte', PatteElement);
}
