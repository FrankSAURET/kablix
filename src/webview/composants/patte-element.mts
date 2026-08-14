// Composant <kablix-patte> : UNE patte de robot à 2 articulations (coxa,
// patella), dessinée EN VOLUME (vue isométrique, moteur ./iso3d.mts).
//
// Depuis la v2026.8.48 c'est la MÊME patte que celles du robot : le fémur et le
// tibia sont les assemblages `araignee-patte-femur` et `araignee-patte-tibia` de
// la planche `Composants3D.svg`, montés tout nus. Plus une cote, plus un pavé
// codé en dur — redessiner la pièce dans Inkscape change la patte seule ET le
// robot. C'est ce module qui porte la cinématique commune (`legRig`, `legPose`),
// et <kablix-araignee> l'appelle quatre fois.
//
// Chaque articulation est un servo (0-180°, même formule que <kablix-servo>) :
//   • la COXA tourne la patte dans le plan du sol (balayage avant/arrière),
//     90° = direction de repos ;
//   • la PATELLA plie le tibia dans le plan vertical de la patte : 90° = la pose
//     DESSINÉE (Frank dessine son robot monté et debout), au-delà le tibia se
//     replie et le pied se lève, en deçà il se tend.
//
// À gauche de la feuille, le CONNECTEUR (./externe/connecteur-servo-patte.svg,
// dessin de Frank) : deux borniers à trois broches — violet « Coxa », vert
// « Patella » — dont les carrés dorés portent les six pastilles. Sans lui, six
// points nus alignés ne disaient pas quel fil allait où.
import { css, html, svg, LitElement, type TemplateResult } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import {
  add, articulations, assemblyFaces, assemblyVertices, groundShadow, project,
  renderFaces, rotAxis, rotZ, scale, shadowGradient, sub,
  type Assembly, type Face, type Vec2, type Vec3,
} from './iso3d.mjs';
import { assemblage, hasAssemblage } from './assemblages.mjs';
import drawing from './externe/connecteur-servo-patte.svg';

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

/** Les deux dessins qui font une patte. Frank n'en dessine qu'un exemplaire :
 *  celui du robot. */
export const LEG_FEMUR = 'araignee-patte-femur';
export const LEG_TIBIA = 'araignee-patte-tibia';

/** Consigne de patella qui rend la pose DESSINÉE : le milieu de course du servo.
 *  Le tibia descend déjà de la patella sur la planche, donc 90° ne plie rien. */
export const PATELLA_REST = 90;

/** Allègement des contours, en unités de feuille (voir `simplifyPoly`) : les
 *  tracés Inkscape portent leurs courbes en dizaines de points d'un dixième de
 *  millimètre. À 0,7 près (un demi-pixel) la silhouette est la même pour trois
 *  fois moins de polygones. */
export const SIMPLIFY = 0.7;

/** Géométrie d'une patte : les points qui comptent, pour dessiner ET pour
 *  mesurer (les bancs lisent la position du pied, pas des pixels). */
export type LegGeometry = { coxa: Vec3; patella: Vec3; foot: Vec3 };

/** Les deux pièces d'une patte et leurs points d'articulation, lus sur les
 *  pastilles rouges de la planche. Tout est en millimètres. */
export type LegRig = {
  femur: Assembly;
  tibia: Assembly;
  /** Pastilles qui s'emboîtent : coxa du fémur, patella côté fémur, patella côté
   *  tibia, et le bout du tibia (le pied, mesuré et non dessiné). */
  coxaF: Vec3;
  patellaF: Vec3;
  patellaT: Vec3;
  footT: Vec3;
  /** Cap DESSINÉ du fémur (coxa → patella) dans le plan du sol, en degrés : il
   *  dit de combien tourner la patte pour la faire partir où on veut. */
  cap: number;
};

/** Où une patte est plantée, et comment elle est présentée. `at` et `k` sont en
 *  unités de la feuille ; `present` ajoute le sol et le lacet de la vue. */
export type LegPlace = {
  k: number;
  at: Vec3;
  yaw: number;
  mirror: boolean;
  present: (p: Vec3) => Vec3;
};

/** Les deux transformations d'une patte pour une pose donnée : où tombent les
 *  points du fémur, où tombent ceux du tibia. */
export type LegPose = { femur: (p: Vec3) => Vec3; tibia: (p: Vec3) => Vec3 };

/** Le pied : le point du tibia le plus LOIN de sa patella. Le dessin n'a pas de
 *  pastille au bout de la patte (il n'y a rien à y emboîter) — c'est donc sa
 *  géométrie qui le dit, et un tibia rallongé suivra tout seul. */
function farthest(a: Assembly, from: Vec3): Vec3 {
  let best = from;
  let far = -1;
  for (const q of assemblyVertices(a)) {
    const d = Math.hypot(q.x - from.x, q.y - from.y, q.z - from.z);
    if (d > far) { far = d; best = q; }
  }
  return best;
}

let rigCache: LegRig | null | undefined;

/** La patte lue sur la planche, une seule fois. `null` si l'un des deux dessins
 *  manque (planche pas encore extraite) : le composant se dessine alors vide
 *  plutôt que faux. */
export function legRig(): LegRig | null {
  if (rigCache !== undefined) return rigCache;
  rigCache = buildRig();
  return rigCache;
}

function buildRig(): LegRig | null {
  if (!hasAssemblage(LEG_FEMUR) || !hasAssemblage(LEG_TIBIA)) return null;
  const femur = assemblage(LEG_FEMUR);
  const tibia = assemblage(LEG_TIBIA);
  const coxaF = articulations(femur).find((j) => j.famille === 'coxa')?.at;
  const patellaF = articulations(femur).find((j) => j.famille === 'patella')?.at;
  const patellaT = articulations(tibia).find((j) => j.famille === 'patella')?.at;
  if (!coxaF || !patellaF || !patellaT) return null;
  return {
    femur,
    tibia,
    coxaF,
    patellaF,
    patellaT,
    footT: farthest(tibia, patellaT),
    cap: (Math.atan2(patellaF.y - coxaF.y, patellaF.x - coxaF.x) * 180) / Math.PI,
  };
}

/**
 * Cinématique d'UNE patte. La coxa tourne la patte entière autour de l'axe
 * VERTICAL de sa pastille ; la patella ne tourne que le tibia, autour de l'axe
 * HORIZONTAL de la patella — dans le repère du fémur, donc la rotation de la
 * patella s'applique AVANT celle de la coxa (l'axe tourne avec la patte).
 * `mirror` : patte montée en miroir (flanc droit du robot, servo retourné) — la
 * même consigne la fait alors balayer dans l'autre sens.
 */
export function legPose(rig: LegRig, place: LegPlace, coxaDeg: number, patellaDeg: number): LegPose {
  const k = place.k;
  const swing = (coxaDeg - 90) * (place.mirror ? -1 : 1);
  const lacet = place.yaw + swing;
  const coxaF = scale(rig.coxaF, k);
  const patellaF = scale(rig.patellaF, k);
  const patellaT = scale(rig.patellaT, k);
  const femur = (p: Vec3): Vec3 => place.present(add(rotZ(sub(p, coxaF), lacet), place.at));
  // Axe de la patella : le X du repère du fémur (`dir: 'x'` de la pastille).
  // Consigne croissante = patella qui SE PLIE, donc pied qui SE LÈVE.
  const bend = PATELLA_REST - patellaDeg;
  const tibia = (p: Vec3): Vec3 =>
    femur(add(rotAxis(sub(p, patellaT), { x: 1, y: 0, z: 0 }, bend), patellaF));
  return { femur, tibia };
}

/** Décalage de zéro maximal, en degrés : un tour complet de chaque côté. */
export const ZERO_RANGE = 360;

/**
 * Consigne d'un servo, MONTAGE compris. Deux réglages, dans cet ordre :
 *   • `rev` non vide = servo vissé à l'envers, la même consigne le fait tourner
 *     dans l'autre sens (180 − angle) ;
 *   • `zero` = l'angle que dessine la pièce quand le programme envoie 0° —
 *     autrement dit le calage du palonnier sur l'axe (−360..+360°). Sur un vrai
 *     montage, le bras se remet en place d'un cran de cannelure à la fois : ce
 *     décalage rattrape ce que la mécanique ne sait pas faire au degré près.
 * C'est un réglage de MONTAGE, pas de programme : le code continue d'envoyer
 * « 30° » et c'est la mécanique qui décide où ça pointe.
 */
export function jointTarget(v: unknown, rev: unknown, zero?: unknown): number {
  const n = Number(v);
  const a = Number.isFinite(n) ? Math.max(0, Math.min(180, n)) : 90;
  const z = Number(zero);
  const off = Number.isFinite(z) ? Math.max(-ZERO_RANGE, Math.min(ZERO_RANGE, z)) : 0;
  return (rev ? 180 - a : a) + off;
}

/** Anime UN angle vers sa consigne à vitesse limitée (rattrapage image par
 *  image) — même mécanique que <kablix-servo>, factorisée car la patte a DEUX
 *  articulations indépendantes (coxa, patella) tournant chacune à son rythme
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

/** Feuille de la patte seule : le connecteur occupe la colonne de gauche, la
 *  mécanique tout le reste. Elle a DOUBLÉ en v2026.8.56 — à 210 × 170 la patte
 *  était un gribouillis de 3 cm, on n'y lisait ni le fémur ni le tibia. */
const SHEET = { w: 250, h: 300 };
/** Le connecteur, posé en (0, 110) : ses six carrés dorés tombent alors sur la
 *  grille de 10 px (y = 120, 130, 140 puis 160, 170, 180) et le bornier est
 *  centré sur la hauteur de la feuille. */
const PLUG = { x: 0, y: 110, w: 40, h: 80 };
/** Écart voulu entre les PASTILLES du bornier et le bord gauche de la mécanique
 *  (v2026.8.56) : centrée dans ce qui restait de la feuille, la patte partait
 *  loin du connecteur auquel elle se câble. Elle y est maintenant CALÉE. */
const PIN_GAP = 40;
/** Zone laissée à la mécanique : à droite du connecteur, marge sur les bords. */
const MARGIN = 6;
const ZONE = { x0: PLUG.x + 10 + PIN_GAP, y0: MARGIN, x1: SHEET.w - MARGIN, y1: SHEET.h - MARGIN };
/** Présentation. La patte est seule : on la veut DE PROFIL, fémur et tibia bien
 *  séparés — vue dans son axe, les deux os se confondent en un simple tube. Or
 *  l'isométrie rend HORIZONTALE la direction −45° du monde (x − y maximal,
 *  x + y nul) : c'est là que la patte se montre en entier. `YAW` est le lacet de
 *  la vue (celui du robot), `LEG_DIR` l'oriente pour compenser. */
const YAW = 22;
const LEG_DIR = -45 - YAW;
/** Ombre portée du pied : rayon au sol, étalement maximal quand le pied est
 *  levé, hauteur à laquelle elle a doublé, et le dégradé qui lui ôte son
 *  contour. */
const FOOT_SHADOW = 5;
const SHADOW_GROW = 2;
const SHADOW_REF = 130;
const OMBRE = 'patte-ombre';
const SHADOW_PAD = FOOT_SHADOW * Math.cos(Math.PI / 6) * 2 * SHADOW_GROW;

/** Le connecteur, contenu du SVG SEUL : posé dans un `<g>` translaté. Un `<svg>`
 *  imbriqué sans width/height s'étirerait à toute la feuille.
 *
 *  Les libellés GND / V+ / PWM sont ÔTÉS : imprimés en 1,3 pt le long des
 *  carrés, ils ne se lisaient pas et brouillaient le bornier. Les noms de broches
 *  les disent déjà dans la bulle d'aide de l'éditeur, en toutes lettres et
 *  traduits. « Coxa » et « Patella », eux, restent : c'est ce qui distingue les
 *  deux borniers. */
const PLUG_INNER = drawing
  .slice(drawing.indexOf('>', drawing.indexOf('<svg')) + 1)
  .replace(/<\/svg>\s*$/, '')
  .replace(/<text\b[^>]*>(?:GND|V\+|PWM)<\/text>/g, '');

/** La patte cadrée pour sa vignette : échelle, origine et hauteur du sol. Le
 *  calcul balaie tout le débattement (25 poses), ombre du pied comprise — rien
 *  n'est jamais rogné, quel que soit le dessin de Frank. */
type LegView = { rig: LegRig; k: number; origin: Vec2; yaw: number; ground: number };

let viewCache: LegView | null | undefined;

function legView(): LegView | null {
  if (viewCache !== undefined) return viewCache;
  viewCache = buildView();
  return viewCache;
}

/** L'emplacement de la patte seule : plantée à l'origine, présentée de biais. */
function placeOf(v: LegView): LegPlace {
  return {
    k: v.k,
    at: { x: 0, y: 0, z: 0 },
    yaw: v.yaw,
    mirror: false,
    present: (p: Vec3): Vec3 => rotZ({ x: p.x, y: p.y, z: p.z + v.ground }, YAW),
  };
}

function buildView(): LegView | null {
  const rig = legRig();
  if (!rig) return null;
  const v: LegView = { rig, k: 1, origin: { x: 0, y: 0 }, yaw: LEG_DIR - rig.cap, ground: 0 };
  // Le SOL : la hauteur du pied en pose de repos (90/90). La patte est remontée
  // d'autant, son ombre se colle alors dessous — et plier la patella la décolle.
  v.ground = -legPose(rig, placeOf(v), 90, 90).tibia(rig.footT).z;
  // Le CADRAGE : la boîte projetée de la patte sur tout son débattement,
  // épaisseurs comprises (`true`) — un servo posé à plat déborde de son contour.
  const bb = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  const vf = assemblyVertices(rig.femur, true);
  const vt = assemblyVertices(rig.tibia, true);
  const poses = [0, 45, 90, 135, 180];
  for (const coxa of poses) {
    for (const patella of poses) {
      const xf = legPose(rig, placeOf(v), coxa, patella);
      for (const q of vf) grow(bb, project(xf.femur(q)));
      for (const q of vt) grow(bb, project(xf.tibia(q)));
      // Et l'ombre du pied, qui tombe plus bas que le pied lui-même.
      const f = xf.tibia(rig.footT);
      grow(bb, project({ x: f.x, y: f.y, z: 0 }));
    }
  }
  const w = Math.max(bb.x1 - bb.x0, 1);
  const h = Math.max(bb.y1 - bb.y0, 1);
  // La patte est CALÉE À GAUCHE de sa zone (à `PIN_GAP` des pastilles) : l'ombre
  // ne déborde donc que du côté droit, une seule marge à réserver.
  const usableW = ZONE.x1 - ZONE.x0 - SHADOW_PAD;
  const usableH = ZONE.y1 - ZONE.y0 - 2 * SHADOW_PAD;
  v.k = Math.min(usableW / w, usableH / h);
  v.ground *= v.k;
  v.origin = {
    x: ZONE.x0 - bb.x0 * v.k,
    y: (ZONE.y0 + ZONE.y1) / 2 - ((bb.y0 + bb.y1) / 2) * v.k,
  };
  return v;
}

function grow(bb: { x0: number; x1: number; y0: number; y1: number }, q: Vec2): void {
  bb.x0 = Math.min(bb.x0, q.x);
  bb.x1 = Math.max(bb.x1, q.x);
  bb.y0 = Math.min(bb.y0, q.y);
  bb.y1 = Math.max(bb.y1, q.y);
}

/** Une broche du bornier : colonne des carrés dorés, ligne donnée par le
 *  dessin. */
function plugPin(name: string, row: number, signals: unknown[]): ElementPin {
  return { name, x: PLUG.x + 10, y: PLUG.y + row, signals } as ElementPin;
}

export class PatteElement extends LitElement {
  // Sans ceci, `:host` reste `display: inline` : la boîte du composant fait la
  // hauteur d'une ligne de texte (17 px) au lieu de celle du dessin, l'éditeur
  // ne mesure donc qu'un carré minuscule et un `transform` posé sur l'hôte (la
  // capture des fiches d'aide) est purement ignoré par le navigateur.
  static get styles() {
    return css`
      :host { display: inline-block; }
    `;
  }

  /** Consigne d'angle (0-180°) de chaque articulation. */
  declare coxaAngle: number;
  declare patellaAngle: number;
  /** Temps d'un tour complet (360°) à pleine vitesse, en secondes. 0 = instantané. */
  declare speed: number;
  /** Non vide : servo monté à l'envers, il part dans l'AUTRE sens (180 − consigne). */
  declare revcoxa: string;
  declare revpatella: string;
  /** Calage du palonnier : l'angle DESSINÉ quand le programme envoie 0° (±360°). */
  declare zerocoxa: number;
  declare zeropatella: number;

  static properties = {
    coxaAngle: {},
    patellaAngle: {},
    speed: { type: Number },
    revcoxa: { type: String },
    revpatella: { type: String },
    zerocoxa: { type: Number },
    zeropatella: { type: Number },
    coxaShown: { state: true },
    patellaShown: { state: true },
  };

  declare coxaShown: number;
  declare patellaShown: number;
  private coxa = new JointAnimator(() => { this.coxaShown = this.coxa.shown; });
  private patella = new JointAnimator(() => { this.patellaShown = this.patella.shown; });

  constructor() {
    super();
    this.coxaAngle = 90;
    this.patellaAngle = 90;
    this.speed = 2;
    this.revcoxa = '';
    this.revpatella = '';
    this.zerocoxa = 0;
    this.zeropatella = 0;
    this.coxaShown = 90;
    this.patellaShown = 90;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.coxa.stop();
    this.patella.stop();
  }

  willUpdate(changed: Map<string, unknown>): void {
    const watched = ['coxaAngle', 'patellaAngle', 'speed', 'revcoxa', 'revpatella',
      'zerocoxa', 'zeropatella'];
    if (!watched.some((k) => changed.has(k))) return;
    const degPerSec = this.degPerSec();
    this.coxa.sync(jointTarget(this.coxaAngle, this.revcoxa, this.zerocoxa), degPerSec);
    this.patella.sync(jointTarget(this.patellaAngle, this.revpatella, this.zeropatella), degPerSec);
  }

  private degPerSec(): number {
    const s = Number(this.speed);
    if (!Number.isFinite(s) || s <= 0) return 0;
    return 360 / s;
  }

  /** La pose affichée, transformations comprises. */
  private pose(): { view: LegView; xf: LegPose } | null {
    const view = legView();
    if (!view) return null;
    return {
      view,
      xf: legPose(view.rig, placeOf(view), this.coxaShown ?? 90, this.patellaShown ?? 90),
    };
  }

  /** Géométrie 3D affichée — lue telle quelle par les bancs de test : mesurer
   *  la position du pied vaut mieux que d'inspecter des polygones. Unités de la
   *  feuille, sol en z = 0. */
  get geometry(): LegGeometry {
    const p = this.pose();
    const zero: Vec3 = { x: 0, y: 0, z: 0 };
    if (!p) return { coxa: zero, patella: zero, foot: zero };
    const { rig, k } = p.view;
    return {
      coxa: p.xf.femur(scale(rig.coxaF, k)),
      patella: p.xf.femur(scale(rig.patellaF, k)),
      foot: p.xf.tibia(scale(rig.footT, k)),
    };
  }

  // Broches : les deux borniers 3 fils du dessin (coxa, patella). Leurs centres
  // tombent sur les carrés dorés du connecteur — la pastille de l'éditeur s'y
  // pose pile, et le boîtier dit à quel servo elle appartient.
  readonly pinInfo: ElementPin[] = [
    plugPin('coxa.GND', 10, [{ type: 'power', signal: 'GND' }]),
    plugPin('coxa.V+', 20, [{ type: 'power', signal: 'VCC' }]),
    plugPin('coxa.PWM', 30, [{ type: 'pwm' }]),
    plugPin('patella.GND', 50, [{ type: 'power', signal: 'GND' }]),
    plugPin('patella.V+', 60, [{ type: 'power', signal: 'VCC' }]),
    plugPin('patella.PWM', 70, [{ type: 'pwm' }]),
  ];

  render(): TemplateResult {
    const p = this.pose();
    const faces: Face[] = [];
    if (p) {
      const { rig, k } = p.view;
      // Pas de `color` : la couleur du DESSIN passe telle quelle, transparence
      // comprise — le PMMA de Frank se traverse du regard (v2026.8.56).
      const opts = { scale: k, simplify: SIMPLIFY };
      // Un seul tas de faces pour fémur ET tibia : c'est le tri en profondeur
      // commun qui fait passer le tibia devant ou derrière selon la pose.
      faces.push(...assemblyFaces(rig.femur, { ...opts, xf: p.xf.femur }));
      faces.push(...assemblyFaces(rig.tibia, { ...opts, xf: p.xf.tibia }));
    }
    const o = p?.view.origin ?? { x: (ZONE.x0 + ZONE.x1) / 2, y: (ZONE.y0 + ZONE.y1) / 2 };
    const foot = this.geometry.foot;
    // Racine en `html` (elle commence par <svg>, donc pas de piège de
    // namespace), contenu en `svg` : un fragment commençant par <g> passé à
    // `html` serait parsé en namespace HTML et jamais dessiné.
    return html`
      <svg width=${SHEET.w} height=${SHEET.h} viewBox="0 0 ${SHEET.w} ${SHEET.h}"
        xmlns="http://www.w3.org/2000/svg">
        ${svg`<defs>${shadowGradient(OMBRE)}</defs>
        <g class="leg__plug" transform=${`translate(${PLUG.x} ${PLUG.y})`}>${unsafeSVG(PLUG_INNER)}</g>
        <g class="leg__shadow">${groundShadow(foot, FOOT_SHADOW, o.x, o.y,
          { fondu: OMBRE, ref: SHADOW_REF, max: SHADOW_GROW })}</g>
        <g class="leg__solid">${renderFaces(faces, o.x, o.y)}</g>`}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-patte')) {
  customElements.define('kablix-patte', PatteElement);
}
