// Composant <kablix-araignee> : robot araignée quadrupède complet — corps en
// sandwich + 4 pattes à 2 articulations (hanche, genou), électronique embarquée
// (Pico W, PCA9685, batterie) prise dans le corps.
//
// Dessiné EN VOLUME depuis la v2026.8.22 (vue isométrique, moteur ./iso3d.mts),
// et DESSINÉ PAR FRANK depuis la v2026.8.44 : plus une seule cote n'est écrite
// ici. Le corps, le fémur et le tibia sont les trois assemblages de la planche
// `Composants3D.svg` (`araignee-corps`, `araignee-patte-femur`,
// `araignee-patte-tibia`, rangés dans ./assemblages.mts), et ce sont leurs
// PASTILLES ROUGES qui donnent les articulations :
//   • les quatre `hanche…` du corps → quatre pattes, chacune tournant autour de
//     l'axe VERTICAL de sa pastille (c'est le servo de hanche) ;
//   • `genou-f` sur le fémur et `genou-t` sur le tibia → le tibia pivote autour
//     de l'axe HORIZONTAL du genou, dans le plan vertical de la patte.
// Redessiner une pièce dans Inkscape puis `npm run assemblage araignee-…` suffit
// donc à changer le robot : ni cote, ni contour, ni point de pivot ici.
//
// Électriquement, l'araignée n'expose RIEN depuis la v2026.8.24 (Frank) : elle
// porte sa propre Pico W, dessinée dans le corps, et c'est ELLE qu'on programme
// — la déposer dans l'atelier choisit la Pico W comme cible (catalog.mts,
// `board: 'picow'`). Son PCA9685 embarqué reste simulé comme une vraie carte
// PCA9685 (sim.mts) et répond sur le bus I²C interne, ses canaux 0..7 pilotant
// les 8 articulations dans l'ordre avant-gauche, avant-droite, arrière-gauche,
// arrière-droite (hanche puis genou).
import { css, html, svg, LitElement, type TemplateResult } from 'lit';
import { ElementPin } from './pin.mjs';
import {
  MATIERES, add, articulations, assemblyFaces, assemblyVertices, groundShadow, project,
  renderFaces, rotAxis, rotZ, scale, sub,
  type Assembly, type AssemblyPiece, type Face, type Vec2, type Vec3,
} from './iso3d.mjs';
import { assemblage, hasAssemblage } from './assemblages.mjs';
import { JointAnimator, jointTarget, type LegGeometry } from './patte-element.mjs';

/** Les trois dessins qui font le robot. Le corps porte les hanches, le fémur
 *  porte le genou, le tibia porte le pied. */
const CORPS = 'araignee-corps';
const FEMUR = 'araignee-patte-femur';
const TIBIA = 'araignee-patte-tibia';

/** Feuille carrée du composant, et marge gardée sur ses quatre bords : le robot
 *  y tient dans TOUTES ses poses, pattes tendues comme repliées. */
const SHEET = 400;
const MARGIN = 8;

/** Rayon de l'ombre d'un pied, et la place qu'elle prend une fois écrasée par
 *  l'isométrie (`groundShadow` étire le rayon en x). Le cadrage doit la réserver :
 *  l'ombre d'un pied tendu tombait hors de la feuille alors que le pied, lui,
 *  tenait dedans. */
const FOOT_SHADOW = 5;
const SHADOW_PAD = FOOT_SHADOW * Math.cos(Math.PI / 6) * 2;

/** Le robot est présenté DE BIAIS : ses pattes partent à ±45°, or c'est
 *  exactement la direction que l'isométrie écrase sur l'axe vertical de
 *  l'écran — les pattes avant et arrière se superposaient au corps au lieu d'en
 *  sortir. Un quart de tour de 22° les dégage toutes les quatre. */
const YAW = 22;

/** Allègement des contours, en unités de la feuille (voir `simplifyPoly`). Le
 *  tracé Inkscape porte ses courbes en dizaines de points d'un dixième de
 *  millimètre : gardés tels quels, le robot sort à 2 900 polygones et 26 ms par
 *  image — injouable pour un composant redessiné à chaque pas de la marche. À
 *  0,7 unité près (un demi-pixel à l'écran) la silhouette est la même, et il en
 *  reste 900 pour 7 ms. */
const SIMPLIFY = 0.7;

/** Pièces du dessin que la case « électronique embarquée » montre ou cache. Ce
 *  sont les noms des groupes de la planche ; le `picow`, lui, est TOUJOURS
 *  dessiné : c'est la carte qu'on programme, la voir explique le robot. */
const EMBARQUE = ['pca9685', 'batterie'];

/** La couleur du dessin, rendue OPAQUE. Frank dessine son PMMA translucide, et
 *  c'est juste : dans la fenêtre de montage on veut voir le servo à travers le
 *  flanc. Mais une pièce translucide est dessinée SANS liseré (sinon la
 *  triangulation se voit en toile d'araignée), et sur une patte découpée en
 *  dizaines de triangles il reste alors une couture blanche à chaque arête — sur
 *  la vignette de l'atelier, longue de 3 cm, le robot en devient grillagé.
 *  Opaque, le liseré revient et la silhouette est nette. */
function opaque(fill: string | undefined): string | undefined {
  if (!fill) return fill;
  const m = /^(#[0-9a-f]{6})[0-9a-f]{2}$/i.exec(fill);
  return m ? m[1] : fill;
}

/** Angle de genou où le tibia est dans le PROLONGEMENT du fémur — la pose
 *  dessinée à plat, celle de la découpe laser. 90° plie donc le genou d'un quart
 *  de tour et met le tibia à la verticale : le robot est debout. */
const KNEE_FLAT = 180;

/** Nom de la propriété d'une articulation (0..7) : `hip0`, `knee0`, `hip1`…
 *  Préfixé de `rev`, c'est celui de son sens de montage (`revhip0`). */
function jointKey(i: number): string {
  return (i % 2 === 0 ? 'hip' : 'knee') + Math.floor(i / 2);
}

/** Le robot lu sur la planche : les trois dessins, les articulations qu'ils
 *  portent, et le cadrage qui en découle. Tout est en millimètres sauf `k`
 *  (millimètres → unités de la feuille), `ground` et `origin`. */
type Robot = {
  corps: Assembly;
  femur: Assembly;
  tibia: Assembly;
  /** Les quatre hanches du corps, rangées avant-gauche, avant-droite,
   *  arrière-gauche, arrière-droite — l'ordre des canaux PWM. */
  hips: Vec3[];
  /** Lacet de repos de chaque patte : elle part vers l'extérieur, du côté où sa
   *  hanche se trouve déjà sur le corps. */
  yaw: number[];
  /** Patte montée en MIROIR (flanc droit) : la même consigne de hanche la fait
   *  tourner dans l'autre sens, comme sur le vrai châssis. */
  mirror: boolean[];
  /** Les pastilles qui s'emboîtent : hanche du fémur, genou côté fémur, genou
   *  côté tibia, et le bout du tibia (le pied). */
  hipF: Vec3;
  kneeF: Vec3;
  kneeT: Vec3;
  footT: Vec3;
  k: number;
  origin: Vec2;
  /** Hauteur dont le robot est remonté pour que ses pieds touchent le sol
   *  (z = 0) en pose de repos : c'est là que les ombres portées se collent. */
  ground: number;
  /** L'ombre du CORPS, mesurée sur le dessin (centre et rayons en unités de la
   *  feuille) : c'est elle qui pose le robot au sol. Un corps redessiné plus
   *  large traîne une ombre plus large, sans rien à retoucher ici. */
  shadow: { c: Vec2; rx: number; ry: number };
};

const degXY = (v: Vec2): number => (Math.atan2(v.y, v.x) * 180) / Math.PI;

/** Centre des pièces d'un assemblage dans le plan X/Y : il dit où est « dehors »,
 *  donc de quel côté chaque patte s'écarte. */
function centerXY(a: Assembly): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of a.pieces) {
    x += p.pos.x;
    y += p.pos.y;
  }
  const n = Math.max(a.pieces.length, 1);
  return { x: x / n, y: y / n };
}

/** Le pied : le point du tibia le plus LOIN de son genou. Le dessin n'a pas de
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

/** Les deux transformations d'une patte pour une pose donnée, en unités de la
 *  feuille : où tombent les points du fémur, où tombent ceux du tibia. La hanche
 *  tourne la patte entière autour de l'axe vertical de sa pastille ; le genou ne
 *  tourne que le tibia, autour de l'axe horizontal du genou — dans le repère du
 *  fémur, donc la rotation du genou s'applique AVANT celle de la hanche. */
function legXf(r: Robot, i: number, hipDeg: number, kneeDeg: number): {
  femur: (p: Vec3) => Vec3; tibia: (p: Vec3) => Vec3;
} {
  const k = r.k;
  const swing = (hipDeg - 90) * (r.mirror[i] ? -1 : 1);
  const lacet = r.yaw[i] + swing;
  const hipW = scale(r.hips[i], k);
  const hipF = scale(r.hipF, k);
  const kneeF = scale(r.kneeF, k);
  const kneeT = scale(r.kneeT, k);
  const present = (p: Vec3): Vec3 => rotZ({ x: p.x, y: p.y, z: p.z + r.ground }, YAW);
  const femur = (p: Vec3): Vec3 => present(add(rotZ(sub(p, hipF), lacet), hipW));
  // Axe du genou : le X du repère du fémur (`dir: 'x'` de la pastille) — il
  // tourne avec la patte, c'est tout l'intérêt de l'appliquer ici.
  const axis: Vec3 = { x: 1, y: 0, z: 0 };
  const bend = KNEE_FLAT - kneeDeg;
  const tibia = (p: Vec3): Vec3 => femur(add(rotAxis(sub(p, kneeT), axis, bend), kneeF));
  return { femur, tibia };
}

/** Le robot lu et cadré, construit une seule fois (le calcul balaie les poses
 *  extrêmes de chaque patte). `null` si l'un des trois dessins manque. */
let cached: Robot | null | undefined;

export function robot(): Robot | null {
  if (cached !== undefined) return cached;
  cached = build();
  return cached;
}

function build(): Robot | null {
  if (!hasAssemblage(CORPS) || !hasAssemblage(FEMUR) || !hasAssemblage(TIBIA)) return null;
  const corps = assemblage(CORPS);
  const femur = assemblage(FEMUR);
  const tibia = assemblage(TIBIA);
  // Les hanches : les pastilles de famille « hanche » du corps, rangées avant →
  // arrière puis gauche → droite (y croissant = vers l'arrière, x croissant =
  // vers la droite). C'est l'ordre des canaux du PCA9685.
  const hips = articulations(corps).filter((j) => j.famille === 'hanche')
    .sort((a, b) => (a.at.y - b.at.y) || (a.at.x - b.at.x))
    .slice(0, 4)
    .map((j) => j.at);
  const hipF = articulations(femur).find((j) => j.famille === 'hanche')?.at;
  const kneeF = articulations(femur).find((j) => j.famille === 'genou')?.at;
  const kneeT = articulations(tibia).find((j) => j.famille === 'genou')?.at;
  if (!hips.length || !hipF || !kneeF || !kneeT) return null;

  // Lacet de repos : la patte part du centre du corps vers sa hanche, et le
  // fémur est dessiné dans le sens hanche → genou. La même règle que le monteur
  // de `montage()`, appliquée aux quatre pastilles.
  const c = centerXY(corps);
  const cap = degXY({ x: kneeF.x - hipF.x, y: kneeF.y - hipF.y });
  const r: Robot = {
    corps,
    femur,
    tibia,
    hips,
    yaw: hips.map((h) => degXY({ x: h.x - c.x, y: h.y - c.y }) - cap),
    mirror: hips.map((h) => h.x > 0),
    hipF,
    kneeF,
    kneeT,
    footT: farthest(tibia, kneeT),
    k: 1,
    origin: { x: SHEET / 2, y: SHEET / 2 },
    ground: 0,
    shadow: { c: { x: 0, y: 0 }, rx: 0, ry: 0 },
  };
  // Le SOL : la hauteur des pieds en pose de repos (90/90). Le robot est remonté
  // d'autant, ses ombres se collent alors sous ses pieds — et lever une patte la
  // décolle vraiment.
  const rest = r.hips.map((_, i) => legXf(r, i, 90, 90).tibia(r.footT).z);
  r.ground = -Math.min(...rest);
  // Le CADRAGE : la boîte projetée du corps et de chaque patte sur tout son
  // débattement. Les pattes sont indépendantes, il suffit donc de balayer une
  // patte à la fois — l'enveloppe est la même, pour 25 poses au lieu de 390 625.
  const bb = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  const eat = (p: Vec3): void => {
    const q = project(rotZ({ x: p.x, y: p.y, z: p.z + r.ground }, YAW));
    bb.x0 = Math.min(bb.x0, q.x);
    bb.x1 = Math.max(bb.x1, q.x);
    bb.y0 = Math.min(bb.y0, q.y);
    bb.y1 = Math.max(bb.y1, q.y);
  };
  // Épaisseurs comprises (`true`) : un servo de 24,5 mm posé à plat déborde de
  // 12 mm de son contour, et c'est exactement ce qui sortait de la feuille.
  const sb = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const p of assemblyVertices(corps, true)) {
    eat(p);
    // L'ombre du corps, du même coup : le dessin projeté sur le sol, à la place
    // de l'ovale de convention qu'il a fallu régler à la main pendant deux
    // versions.
    const w = rotZ({ x: p.x, y: p.y, z: p.z + r.ground }, YAW);
    grow(sb, project({ x: w.x, y: w.y, z: 0 }));
  }
  grow(bb, { x: sb.x0, y: sb.y0 });
  grow(bb, { x: sb.x1, y: sb.y1 });
  const vf = assemblyVertices(femur, true);
  const vt = assemblyVertices(tibia, true);
  const poses = [0, 45, 90, 135, 180];
  for (let i = 0; i < r.hips.length; i++) {
    for (const hip of poses) {
      for (const knee of poses) {
        // `legXf` travaille en unités de feuille : à k = 1 ce sont les
        // millimètres, et `present` y ajoute déjà le sol et le lacet — d'où la
        // projection directe, sans repasser par `eat`.
        const xf = legXf(r, i, hip, knee);
        for (const q of vf) grow(bb, project(xf.femur(q)));
        for (const q of vt) grow(bb, project(xf.tibia(q)));
        // Et l'ombre du pied, qui tombe plus bas que le pied lui-même.
        const f = xf.tibia(r.footT);
        grow(bb, project({ x: f.x, y: f.y, z: 0 }));
      }
    }
  }
  const w = Math.max(bb.x1 - bb.x0, 1);
  const h = Math.max(bb.y1 - bb.y0, 1);
  // La feuille garde en plus de quoi loger le rayon des ombres de pied, qui
  // s'ajoute à la position du pied et non à celle du dessin.
  const usable = SHEET - 2 * (MARGIN + SHADOW_PAD);
  r.k = Math.min(usable / w, usable / h);
  r.ground *= r.k;
  r.origin = {
    x: SHEET / 2 - ((bb.x0 + bb.x1) / 2) * r.k,
    y: SHEET / 2 - ((bb.y0 + bb.y1) / 2) * r.k,
  };
  r.shadow = {
    c: { x: ((sb.x0 + sb.x1) / 2) * r.k, y: ((sb.y0 + sb.y1) / 2) * r.k },
    rx: ((sb.x1 - sb.x0) / 2) * r.k,
    ry: ((sb.y1 - sb.y0) / 2) * r.k,
  };
  return r;
}

function grow(bb: { x0: number; x1: number; y0: number; y1: number }, q: Vec2): void {
  bb.x0 = Math.min(bb.x0, q.x);
  bb.x1 = Math.max(bb.x1, q.x);
  bb.y0 = Math.min(bb.y0, q.y);
  bb.y1 = Math.max(bb.y1, q.y);
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
  /** Non vide : le PCA9685 et la batterie sont dessinés dans le corps (la carte
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

  /** Les transformations des quatre pattes dans la pose affichée. */
  private legs(): { femur: (p: Vec3) => Vec3; tibia: (p: Vec3) => Vec3 }[] {
    const r = robot();
    if (!r) return [];
    const a = this.shown ?? new Array(8).fill(90);
    return r.hips.map((_, i) => legXf(r, i, a[i * 2] ?? 90, a[i * 2 + 1] ?? 90));
  }

  /** Géométrie 3D des quatre pattes telle qu'elle est DESSINÉE — c'est ce que
   *  lisent les bancs : la position d'un pied dit tout de la cinématique, là où
   *  compter des polygones ne dirait rien. Unités de la feuille, sol en z = 0. */
  get geometry(): LegGeometry[] {
    const r = robot();
    if (!r) return [];
    return this.legs().map((xf) => ({
      hip: xf.femur(scale(r.hipF, r.k)),
      knee: xf.femur(scale(r.kneeF, r.k)),
      foot: xf.tibia(scale(r.footT, r.k)),
    }));
  }

  // AUCUNE BROCHE (Frank, v2026.8.24) : le robot porte sa propre Pico W, il n'y
  // a donc rien à câbler — ni bus I²C, ni alimentation. Le bornier à quatre
  // points et sa nappe ont disparu avec elles ; les schémas d'avant qui les
  // câblaient perdent ces fils au chargement (l'éditeur écarte un fil dont la
  // broche n'existe plus), le robot, lui, se programme directement.
  readonly pinInfo: ElementPin[] = [];

  render(): TemplateResult {
    const r = robot();
    const legs = this.legs();
    const faces: Face[] = [];
    if (r) {
      // Un seul tas de faces pour TOUTE la scène : c'est le tri en profondeur
      // commun qui fait passer une patte arrière derrière le corps et la patte
      // avant devant. Trier chaque pièce séparément casserait l'illusion.
      const corps: Assembly = this.boards ? r.corps
        : { ...r.corps, pieces: r.corps.pieces.filter((p) => !EMBARQUE.includes(p.name)) };
      const opts = {
        scale: r.k,
        simplify: SIMPLIFY,
        color: (p: AssemblyPiece): string => opaque(p.fill) ?? MATIERES[p.mat] ?? MATIERES.pmma,
      };
      faces.push(...assemblyFaces(corps, {
        ...opts,
        xf: (p: Vec3) => rotZ({ x: p.x, y: p.y, z: p.z + r.ground }, YAW),
      }));
      for (const xf of legs) {
        faces.push(...assemblyFaces(r.femur, { ...opts, xf: xf.femur }));
        faces.push(...assemblyFaces(r.tibia, { ...opts, xf: xf.tibia }));
      }
    }
    const o = r?.origin ?? { x: SHEET / 2, y: SHEET / 2 };
    const feet = this.geometry.map((g) => g.foot);
    return html`
      <svg width=${SHEET} height=${SHEET} viewBox="0 0 ${SHEET} ${SHEET}"
        xmlns="http://www.w3.org/2000/svg">
        ${/* Sous-templates en `svg` et NON en `html` : un fragment commençant
             par <g> passé à `html` est parsé en XHTML (namespace HTML), les
             pattes existent alors dans le DOM mais ne sont JAMAIS dessinées. */
          svg`<g class="araignee__shadows">
            <ellipse cx=${(o.x + (r?.shadow.c.x ?? 0)).toFixed(2)}
              cy=${(o.y + (r?.shadow.c.y ?? 0)).toFixed(2)}
              rx=${(r?.shadow.rx ?? 0).toFixed(2)} ry=${(r?.shadow.ry ?? 0).toFixed(2)}
              fill="rgba(0,0,0,0.10)" />
            ${feet.map((f) => groundShadow(f, FOOT_SHADOW, o.x, o.y))}
          </g>`}
        <g class="araignee__solid">${renderFaces(faces, o.x, o.y)}</g>
      </svg>
    `;
  }
}

if (!customElements.get('kablix-araignee')) {
  customElements.define('kablix-araignee', AraigneeElement);
}
