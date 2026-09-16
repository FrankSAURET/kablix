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
 *  l'élève pose sur la broche à écouter. */
export const SONDE_PIN = { x: 10, y: 70 };

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

/** Teinte du corps quand la sonde n'a pas encore de voie (posée nulle part). */
const GRIS_INERTE = '#9e9e9e';

/** Pile de repli de la police du dessin (Arial Rounded MT Bold n'existe pas
 *  partout : sans repli, l'étiquette tombait sur une police à empattements). */
const FONT_ETIQUETTE = "'Arial Rounded MT Bold', 'Trebuchet MS', 'Segoe UI', sans-serif";

export interface PinInfo {
  name: string;
  x: number;
  y: number;
  signals: unknown[];
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
    return ['voie', 'etiquette', 'accroche', 'simulating'];
  }

  private root: ShadowRoot;
  private rendered = false;
  private themeObs: MutationObserver | undefined;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  /** Indice de voie (0-based). -1 = aucune (sonde posée dans le vide). */
  get voie(): number {
    const v = Number.parseInt(this.getAttribute('voie') ?? '', 10);
    return Number.isInteger(v) && v >= 0 ? v : -1;
  }

  /** Teinte courante de la voie, ou le gris inerte si la sonde n'en a pas. */
  get couleur(): string {
    const v = this.voie;
    return v < 0 ? GRIS_INERTE : couleurVoie(v, themeSombre());
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
    if (name === 'voie' || name === 'accroche') this.updateCouleur();
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
      inner.setAttribute('x', '0');
      inner.setAttribute('y', '0');
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
   * porter le dégradé argenté). Dans la planche, Frank l'a dessinée EN PREMIER
   * dans son groupe : la lame verte passait donc par-dessus et la recouvrait
   * entièrement — mesuré, le segment (10,70)→(13,67) ressortait vert plein,
   * plus la moindre trace de gris. On la remonte donc en DERNIER enfant de son
   * parent, et on l'épaissit : à 0,53 mm de trait, le peu qui dépassait était
   * déjà de la couleur de la grille.
   *
   * Corrigé ICI et non dans le SVG : `externe/grip-fil.svg` est extrait de
   * `Composants2D.svg` (`_extract-composants.mjs`) — une retouche du fichier
   * serait perdue à la prochaine extraction. Le dessin de Frank reste intact.
   */
  private remonterTige(): void {
    const tige = this.root.querySelector('#path944') as SVGElement | null;
    const parent = tige?.parentNode;
    if (!tige || !parent) return;
    parent.appendChild(tige); // dernier enfant = peint en dernier, donc visible
    const st = tige.getAttribute('style') ?? '';
    // Trait plus épais (la tige d'une sonde se voit) et fond transparent : le
    // blanc à 15 % ne servait qu'à voiler ce qui passait dessous.
    tige.setAttribute(
      'style',
      st
        .replace(/stroke-width:[^;]*/i, 'stroke-width:0.95')
        .replace(/fill-opacity:[^;]*/i, 'fill-opacity:0'),
    );
  }

  /**
   * Reteinte les pièces vertes du dessin avec la couleur de la voie. Les
   * teintes sont posées en `fill` ou dans `style` selon la pièce (Inkscape
   * mélange les deux) : les deux cas sont traités, sinon la moitié de la pince
   * restait verte.
   */
  private updateCouleur(): void {
    const base = this.couleur;
    for (const { hex, delta } of TEINTES_VERTES) {
      const cible = nuance(base, delta);
      for (const el of this.root.querySelectorAll<SVGElement>(`[fill="${hex}"]`)) {
        el.setAttribute('fill', cible);
      }
      // Même teinte écrite dans un `style` (fill: ou stroke:).
      for (const el of this.root.querySelectorAll<SVGElement>('[style]')) {
        const st = el.getAttribute('style') ?? '';
        if (st.toLowerCase().includes(hex)) {
          el.setAttribute('style', st.replace(new RegExp(hex, 'gi'), cible));
        }
      }
      // Contours posés en attribut `stroke`.
      for (const el of this.root.querySelectorAll<SVGElement>(`[stroke="${hex}"]`)) {
        el.setAttribute('stroke', cible);
      }
    }
    // L'étiquette se lit sur le fond de la planche, pas sur la pince : elle
    // prend la couleur de la voie, en plus foncé pour rester lisible en clair.
    const txt = this.root.querySelector('#etiquette') as SVGElement | null;
    if (txt) {
      const encre = this.voie < 0 ? GRIS_INERTE : nuance(base, themeSombre() ? +25 : -25);
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
