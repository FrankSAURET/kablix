// Élément visuel maison <kablix-sonde-logique> : la sonde de l'analyseur
// logique — une pince crocodile de mesure (« grip-fil ») dessinée par Frank
// (./externe/grip-fil.svg, 80×80 px), volontairement PETITE pour ne pas
// encombrer la planche.
//
// LE GESTE, pas une liste à cocher : l'élève POSE la pastille de la sonde
// par-dessus la pastille d'une broche d'un autre composant. Aucun fil n'est
// tiré — c'est une superposition. L'éditeur résout l'accrochage au lâcher
// (nearestPin) et l'écrit dans l'attribut `accroche` ; le modèle en déduit la
// broche MCU à capturer. C'est la différence avec l'oscilloscope, qui lui
// passe par les nets d'un vrai câblage.
//
// LA COULEUR est l'identité de la voie : la pince bleue sur la planche est la
// voie bleue dans l'analyseur. Elle est attribuée À LA POSE par l'éditeur
// (première teinte libre), jamais recyclée dans la session, et stockée dans
// l'attribut `voie` (l'indice, pas la teinte — le thème clair/sombre change
// les valeurs, pas l'identité). Le dessin de Frank est vert : ses huit teintes
// vertes sont donc RETEINTÉES à l'affichage.
//
// L'ÉTIQUETTE (attribut `etiquette`, objet texte `#etiquette` du dessin) donne
// son nom à la voie. Vide, le nom par défaut est dérivé de la broche accrochée
// — c'est l'analyseur qui le compose, pas le dessin.
import { couleurVoie, themeSombre } from '../voies-couleurs.mjs';
import drawing from './externe/grip-fil.svg';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const SONDE_W = 80;
export const SONDE_H = 80;

/** Centre de la pastille du dessin (pointe de la pince) : c'est CE point que
 *  l'élève pose sur la broche à écouter. (10,70) est un croisement de la grille
 *  de 10 px — c'est la contrainte dure, elle ne se négocie pas. */
export const SONDE_PIN = { x: 10, y: 70 };

/**
 * Recalage du dessin importé, en unités de viewBox.
 *
 * Mesuré (lot .97) : la pointe de la mâchoire du dessin de Frank tombe en
 * (10,73 ; 69,25), pas en (10 ; 70). Un écart de trois quarts d'unité — moins
 * d'un dixième de carreau, invisible isolément, mais assez pour que la pince
 * DESSINÉE pince visiblement à côté du croisement où le fil, lui, se raccorde.
 * C'est le « sa connection n'est toujours pas exactement à l'intersection de la
 * grille » de Frank (17/09).
 *
 * On déplace le DESSIN, jamais la pastille : `SONDE_PIN` doit rester sur un
 * croisement, sinon plus rien ne s'accroche. Le crochet, lui, est tracé par
 * `remonterTige()` dans le repère du SVG hôte à partir de `SONDE_PIN` : il ne
 * subit pas ce décalage, et c'est ainsi que dessin et point de connexion se
 * retrouvent enfin au même endroit.
 */
const RECALAGE = { x: 0.5, y: 0 };

/**
 * Les huit teintes VERTES du dessin de Frank, et leur rôle dans la pince.
 * Reteinter à l'aveugle tout ce qui est vert écraserait les nuances : chaque
 * teinte garde donc son écart au corps (`delta` en pourcentage de luminosité),
 * pour que la pince reste lisible en rouge, en bleu ou en gris.
 *
 * `#4d6928` (la petite vis sombre) et les gris du câble ne sont PAS dans la
 * liste : ils ne portent pas la couleur de voie.
 */
const TEINTES_VERTES: Array<{ hex: string; delta: number }> = [
  { hex: '#a4de63', delta: 0 },     // corps de la pince (référence)
  { hex: '#8ac847', delta: -12 },   // contour du corps
  { hex: '#88c543', delta: -14 },   // rivets et stries
  { hex: '#94d04e', delta: -6 },    // embase
  { hex: '#b0e770', delta: +8 },    // mâchoire
  { hex: '#c3f488', delta: +18 },   // reflet de la mâchoire
];

/** Teinte du corps quand la sonde n'est posée nulle part. */
const GRIS_INERTE = '#9e9e9e';

/*
 * Il n'y a plus de longueur « vers l'extérieur » (l'ancien `CROCHET`, 2,2 puis
 * 1,1) : depuis le 18/09 le crochet ne dépasse PLUS la pastille, il s'y arrête.
 * Frank : « son extrémité (bas gauche) doit être sur une intersection de la
 * grille. La connection c'est bien l'extrémité du crochet. » Le trait part donc
 * de `SONDE_PIN` et ne file que vers l'intérieur (`CROCHET_DEDANS`).
 */

/**
 * Longueur du crochet VERS L'INTÉRIEUR du corps. Il file sous le plastique de
 * la pince, où il est masqué : c'est ce qui donne l'impression que l'ergot
 * ENTRE dans la pince au lieu d'être posé dessus. Plus long que la partie
 * visible, comme sur une vraie pince où la lame se prolonge dans le manche.
 */
const CROCHET_DEDANS = 6;

/**
 * Épaisseur du crochet. Élargie au lot .97 (Frank : « pas assez large ») : à
 * 1,3 le trait faisait maigre à côté de la mâchoire, et sur la grille de 10 px
 * il se lisait comme un cheveu. 2,2 lui donne la carrure d'un ergot métallique
 * tout en laissant voir la pastille rouge de connexion sous lui.
 */
const CROCHET_EP = 2.2;

/** Pile de repli de la police du dessin (Arial Rounded MT Bold n'existe pas
 *  partout : sans repli, l'étiquette tombait sur une police à empattements). */
const FONT_ETIQUETTE = "'Arial Rounded MT Bold', 'Trebuchet MS', 'Segoe UI', sans-serif";

export interface PinInfo {
  name: string;
  x: number;
  y: number;
  signals: unknown[];
}

/** Une pièce du dessin qui porte une teinte de voie, avec sa valeur d'ORIGINE :
 *  c'est d'elle qu'on repart à chaque reteinte, jamais de la couleur en place. */
interface Piece {
  el: SVGElement;
  attr: 'fill' | 'stroke' | 'style';
  delta: number;
  origine: string;
}

/** #rrggbb → [r,g,b] (0..255). */
function hexRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** [r,g,b] → #rrggbb, composantes bornées. */
function rgbHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/**
 * Décale une teinte vers le blanc (delta > 0) ou vers le noir (delta < 0), en
 * pourcentage. Un simple facteur multiplicatif noircissait sans jamais
 * éclaircir : les reflets de la mâchoire auraient disparu.
 */
function nuance(hex: string, delta: number): string {
  const [r, g, b] = hexRgb(hex);
  const k = delta / 100;
  return k >= 0
    ? rgbHex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k)
    : rgbHex(r * (1 + k), g * (1 + k), b * (1 + k));
}

export class SondeLogiqueElement extends HTMLElement {
  // Unique pastille : la pointe de la pince. Aucun signal déclaré — une sonde
  // n'impose rien au circuit, elle écoute (impédance infinie, comme un
  // voltmètre parfait : elle ne doit JAMAIS changer ce qu'elle mesure).
  readonly pinInfo: PinInfo[] = [
    { name: 'G', x: SONDE_PIN.x, y: SONDE_PIN.y, signals: [] },
  ];

  static get observedAttributes(): string[] {
    return ['voie', 'etiquette', 'accroche', 'relie', 'simulating'];
  }

  private root: ShadowRoot;
  private rendered = false;
  private themeObs: MutationObserver | undefined;
  /** Relevé des pièces à reteinter, avec leur teinte d'ORIGINE (voir
   *  `relevePieces`). Indéfini tant que le dessin n'a pas été relevé. */
  private pieces: Piece[] | undefined;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  /** Indice de voie (0-based). -1 = aucune (sonde posée dans le vide). */
  get voie(): number {
    const v = Number.parseInt(this.getAttribute('voie') ?? '', 10);
    return Number.isInteger(v) && v >= 0 ? v : -1;
  }

  /**
   * Vrai quand la pince mesure vraiment quelque chose, par l'un OU l'autre des
   * deux gestes que Frank demande (17/09) :
   *
   *  - POSÉE sur une pastille — l'éditeur écrit `accroche` au lâcher ;
   *  - RELIÉE par un fil à son crochet — rien n'est posé sur rien, c'est le
   *    câblage qui branche la sonde. Le schéma seul le sait : `sim.mts` pose
   *    alors l'attribut `relie` (voir `colorerSondesReliees`).
   *
   * Dans les deux cas la pince prend sa couleur de voie, et la perd dès qu'on
   * la décroche ou qu'on retire le fil.
   */
  get branchee(): boolean {
    return (this.getAttribute('accroche') ?? '').trim() !== ''
      || (this.getAttribute('relie') ?? '').trim() !== '';
  }

  /**
   * Teinte courante. GRISE tant que la pince n'est accrochée à rien — c'est
   * l'état qu'on voit sur la paillasse : une pince qui pend ne mesure rien.
   * Elle ne reprend sa couleur qu'une fois posée sur une pastille.
   *
   * L'indice de voie, lui, SURVIT au décrochage (il reste dans l'attribut
   * `voie`) : la même pince reposée retrouve exactement la même teinte, et
   * l'élève ne perd pas le repère qu'il vient de se construire.
   */
  get couleur(): string {
    const v = this.voie;
    return v < 0 || !this.branchee ? GRIS_INERTE : couleurVoie(v, themeSombre());
  }

  connectedCallback(): void {
    if (!this.rendered) this.render();
    // Le thème VS Code change en direct (classe du <body>) : la pince doit
    // suivre, comme les puces du traceur.
    if (!this.themeObs) {
      this.themeObs = new MutationObserver(() => this.updateCouleur());
      this.themeObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
  }

  disconnectedCallback(): void {
    this.themeObs?.disconnect();
    this.themeObs = undefined;
  }

  attributeChangedCallback(name: string): void {
    if (!this.rendered) return;
    if (name === 'voie' || name === 'accroche' || name === 'relie') this.updateCouleur();
    if (name === 'etiquette') this.updateEtiquette();
  }

  private render(): void {
    this.rendered = true;
    const wrap = document.createElement('div');
    wrap.style.lineHeight = '0';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', String(SONDE_W));
    svg.setAttribute('height', String(SONDE_H));
    svg.setAttribute('viewBox', `0 0 ${SONDE_W} ${SONDE_H}`);

    const doc = new DOMParser().parseFromString(drawing.slice(drawing.indexOf('<svg')), 'image/svg+xml');
    if (doc.documentElement.nodeName.toLowerCase() === 'svg') {
      const inner = document.importNode(doc.documentElement, true) as unknown as SVGElement;
      inner.setAttribute('x', String(RECALAGE.x));
      inner.setAttribute('y', String(RECALAGE.y));
      inner.setAttribute('width', String(SONDE_W));
      inner.setAttribute('height', String(SONDE_H));
      svg.appendChild(inner);
    }

    wrap.appendChild(svg);
    this.root.replaceChildren(wrap);

    this.remonterTige();
    this.updateCouleur();
    this.updateEtiquette();
  }

  /**
   * Remet la TIGE MÉTALLIQUE en vue (`#path944`, le seul trait du dessin à
   * porter le dégradé argenté) et lui donne une VRAIE longueur.
   *
   * Deux défauts mesurés dans la planche, l'un après l'autre :
   *
   *  1. Frank l'a dessinée EN PREMIER dans son groupe : la lame verte passait
   *     par-dessus et la recouvrait — le segment ressortait vert plein. Elle
   *     est donc remontée en DERNIER enfant de son parent (peint en dernier).
   *  2. Remontée, elle restait invisible pour une raison de GÉOMÉTRIE : mesurée
   *     dans le repère du viewBox, elle va de (10,0 ; 69,9) à (13,2 ; 66,7),
   *     soit 4,5 px en diagonale — et la mâchoire verte (`path14-32`) occupe
   *     cette même diagonale à partir de (11,0 ; 65,4). Il n'en dépassait
   *     qu'un millimètre de dessin, à la taille d'un carreau de grille.
   *
   * D'où le CROCHET redessiné ici, dont le point de connexion reste le centre
   * de la pastille de Frank, `SONDE_PIN`.
   *
   * REPRISE DU 17/09 (lot .97). Frank demande un ergot, pas une aiguille :
   * court, large, et qui donne l'impression d'ENTRER dans la pince. Le trait
   * est donc inséré AVANT le corps coloré au lieu d'être peint en dernier : le
   * plastique recouvre sa partie intérieure, exactement comme une lame qui se
   * prolonge dans un manche.
   *
   * REPRISE DU 18/09 : il ne dépasse plus la pastille, et son bout garde son
   * ARRONDI — c'est le centre de cet arrondi qui tombe sur le croisement de la
   * grille, pas son bord. Détail de la mesure dans `remonterTige()`.
   *
   * Corrigé ICI et non dans le SVG : `externe/grip-fil.svg` est extrait de
   * `Composants2D.svg` (`_extract-composants.mjs`) — une retouche du fichier
   * serait perdue à la prochaine extraction. Le dessin de Frank reste intact.
   */
  private remonterTige(): void {
    const tige = this.root.querySelector('#path944') as SVGElement | null;
    if (!tige) return;

    // La tige d'origine vit dans un groupe tourné de 45° et mis à l'échelle
    // (`matrix(3.78,…,-850,-760)`), avec en plus une transformation à elle.
    // La rallonger DANS ce repère serait illisible et fragile : on la sort donc
    // au niveau du SVG qui porte le viewBox 0..80, où le crochet s'écrit en
    // coordonnées lisibles — et où, dernier enfant, il est peint par-dessus la
    // mâchoire verte qui le masquait.
    const hote = this.root.querySelector('svg > svg') ?? this.root.querySelector('svg');
    if (!hote) return;
    // PREMIER enfant, donc peint EN DESSOUS de tout le reste : la partie du
    // crochet qui rentre dans le corps disparaît sous le plastique, et seul
    // l'ergot — qui sort du côté opposé, là où il n'y a rien — reste visible.
    hote.insertBefore(tige, hote.firstChild);
    tige.removeAttribute('transform');
    const { x, y } = SONDE_PIN;
    // La diagonale va du bas-gauche (l'ergot, dehors) au haut-droit (la partie
    // enfouie). Le facteur 0,7071 ramène les longueurs à la vraie distance le
    // long du trait : sans lui, une diagonale de « 2,2 » mesurerait 3,1.
    const k = Math.SQRT1_2;
    // REPRISE DU 18/09 — LE BOUT DU CROCHET EST LE POINT DE CONNEXION. Le lot
    // .97 avait calé la MÂCHOIRE verte, qui tombe bien sur (10 ; 70) ; l'ergot
    // métallique, lui, n'avait jamais été mesuré. Frank : « son extrémité (bas
    // gauche) doit être sur une intersection de la grille. La connection c'est
    // bien l'extrémité du crochet. »
    //
    // Le trait DÉPASSAIT la pastille de 2,2 unités vers le bas-gauche — il
    // traversait le croisement au lieu de s'y arrêter. Il part maintenant DE la
    // pastille et ne file que vers l'intérieur du corps. Mesuré avant : bout en
    // (7,71 ; 72,31), soit 2,3 unités hors du croisement.
    //
    // SECONDE REPRISE DU 18/09 — L'ARRONDI RESTE ARRONDI. Une première passe
    // avait conclu que `stroke-linecap:round` mettait le crochet à côté, parce
    // que son demi-disque déborde du nœud dans toutes les directions : le bord
    // peint tombait en (9,27 ; 70,75) pour un nœud pile sur (10 ; 70), et la
    // terminaison était passée à `butt` pour couper le trait net au croisement.
    //
    // C'était lire la demande de travers. Frank (18/09) : « je l'ai dessiné
    // arrondi et je souhaite qu'il le reste avec le CENTRE DE L'ARRONDI sur une
    // intersection de grille. » Ce n'est donc pas le bord peint qui doit tomber
    // sur le croisement, c'est le centre du demi-disque — et c'est exactement ce
    // que `round` donne quand le nœud est sur (10 ; 70). Le débordement de 1,1
    // unité tout autour n'est pas un défaut d'alignement : c'est le rayon de
    // l'arrondi, et il est symétrique, donc centré sur le croisement.
    //
    // `butt` coupait le métal au carré : alignement juste au sens strict, dessin
    // faux au sens de Frank. On revient à `round`, le nœud restant sur la
    // pastille — les deux exigences tiennent ensemble.
    tige.setAttribute(
      'd',
      `M ${x} ${y}`
      + ` L ${x + CROCHET_DEDANS * k} ${y - CROCHET_DEDANS * k}`,
    );
    tige.setAttribute(
      'style',
      'fill:none;stroke:url(#linearGradient996);'
      + `stroke-width:${CROCHET_EP};stroke-linecap:round;stroke-opacity:1`,
    );

    // Le dégradé de Frank est calé (`userSpaceOnUse`) sur la position d'ORIGINE
    // de la tige, à l'autre bout du repère : laissé tel quel, le trait déplacé
    // tomberait hors de sa plage et sortirait d'une seule teinte plate. On le
    // recale en travers du nouveau segment — c'est ce travers qui donne le
    // reflet d'un métal cylindrique.
    const grad = this.root.querySelector('#linearGradient996') as SVGElement | null;
    if (grad) {
      // En TRAVERS du trait : le segment descend vers le bas-gauche, le dégradé
      // le coupe donc perpendiculairement (haut-gauche → bas-droit).
      grad.setAttribute('x1', String(x - CROCHET_EP / 2));
      grad.setAttribute('y1', String(y - CROCHET_EP / 2));
      grad.setAttribute('x2', String(x + CROCHET_EP / 2));
      grad.setAttribute('y2', String(y + CROCHET_EP / 2));
      // `gradientTransform` est HÉRITÉ de `linearGradient427` via xlink:href :
      // l'enlever ne suffit pas, il faut poser l'identité par-dessus. Sans ça
      // l'échelle (2,13 × 0,47) de la planche s'appliquerait encore et le
      // dégradé repartirait à des centaines d'unités du trait.
      grad.setAttribute('gradientTransform', 'translate(0,0)');
    }
  }

  /**
   * Relève UNE FOIS quelles pièces du dessin portent une teinte verte, et où
   * (attribut `fill`, `stroke`, ou dans le texte d'un `style` — Inkscape mêle
   * les trois). Le texte d'origine du `style` est gardé tel quel.
   *
   * Sans ce relevé, la reteinte était à SENS UNIQUE : elle cherchait les
   * teintes vertes de la planche, or dès le premier passage il n'y en a plus
   * une seule dans le dessin. Un deuxième appel ne trouvait donc rien et la
   * pince restait figée sur sa première couleur — visible dès qu'on décroche
   * la pince (retour au gris) ou qu'on bascule le thème.
   */
  private relevePieces(): void {
    const pieces: Piece[] = [];
    for (const { hex, delta } of TEINTES_VERTES) {
      for (const el of this.root.querySelectorAll<SVGElement>(`[fill="${hex}"]`)) {
        pieces.push({ el, attr: 'fill', delta, origine: hex });
      }
      for (const el of this.root.querySelectorAll<SVGElement>(`[stroke="${hex}"]`)) {
        pieces.push({ el, attr: 'stroke', delta, origine: hex });
      }
    }
    // Les `style` sont relevés à part : une même règle peut porter plusieurs
    // teintes, et c'est son texte ENTIER qu'il faut garder pour rejouer les
    // remplacements à chaque changement de couleur.
    const vus = new Set<SVGElement>();
    for (const el of this.root.querySelectorAll<SVGElement>('[style]')) {
      const st = el.getAttribute('style') ?? '';
      const bas = st.toLowerCase();
      if (vus.has(el) || !TEINTES_VERTES.some(({ hex }) => bas.includes(hex))) continue;
      vus.add(el);
      pieces.push({ el, attr: 'style', delta: 0, origine: st });
    }
    this.pieces = pieces;
  }

  /**
   * Reteinte les pièces vertes du dessin avec la couleur de la voie, à partir
   * du relevé d'origine (voir `relevePieces`).
   */
  private updateCouleur(): void {
    if (!this.pieces) this.relevePieces();
    const base = this.couleur;
    for (const p of this.pieces ?? []) {
      const cible = nuance(base, p.delta);
      if (p.attr === 'style') {
        // Une même règle `style` peut porter DEUX teintes vertes (fill et
        // stroke) : on repart du texte d'origine et on les remplace toutes,
        // chacune avec son propre écart.
        let st = p.origine;
        for (const { hex, delta } of TEINTES_VERTES) {
          st = st.replace(new RegExp(hex, 'gi'), nuance(base, delta));
        }
        p.el.setAttribute('style', st);
      } else {
        p.el.setAttribute(p.attr, cible);
      }
    }
    // L'étiquette se lit sur le fond de la planche, pas sur la pince : elle
    // prend la couleur de la voie, en plus foncé pour rester lisible en clair.
    const txt = this.root.querySelector('#etiquette') as SVGElement | null;
    if (txt) {
      const encre = base === GRIS_INERTE ? GRIS_INERTE : nuance(base, themeSombre() ? +25 : -25);
      txt.setAttribute('fill', encre);
      for (const sp of txt.querySelectorAll<SVGElement>('tspan')) sp.setAttribute('fill', encre);
    }
  }

  /**
   * Texte de l'étiquette. Vide → le bloc texte est MASQUÉ (et non rempli d'un
   * nom deviné) : le nom par défaut d'une voie sans étiquette est composé par
   * l'analyseur, qui seul connaît la broche accrochée.
   */
  private updateEtiquette(): void {
    const txt = this.root.querySelector('#etiquette') as SVGElement | null;
    if (!txt) return;
    const val = (this.getAttribute('etiquette') ?? '').trim();
    txt.style.display = val ? '' : 'none';
    if (!val) return;
    txt.style.fontFamily = FONT_ETIQUETTE;
    const sp = txt.querySelector('tspan');
    if (sp) {
      sp.textContent = val;
      (sp as SVGElement).style.fontFamily = FONT_ETIQUETTE;
    } else {
      txt.textContent = val;
    }
  }
}

if (!customElements.get('kablix-sonde-logique')) {
  customElements.define('kablix-sonde-logique', SondeLogiqueElement);
}
