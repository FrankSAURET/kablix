// Fork local de @wokwi/elements v1.9.2 (MIT © Wokwi) — led-ring-element.ts.
// Balise <kablix-led-ring> (ex <wokwi-led-ring>). Licence d'origine : LICENSE-wokwi.md (même dossier).
// Adaptations Kablix : sans décorateurs (static properties + declare + constructeur),
// imports relatifs .mjs ; DESSIN remplacé par la version retouchée (./externe/led-ring.svg,
// capturée à la taille par défaut 16 pixels — pixels/pixelSpacing/background ne sont pas
// exposés dans l'inspecteur, cf. catalog.mts, donc pas de perte de fonctionnalité). Broches
// recalées sur la grille de 10 px. Pixels pilotés nativement via les 16 `rect.pixel` déjà
// présents dans le dessin importé (même ordre DOM que l'ancien rendu procédural).
// LED éteinte : BLANCHE (fill du dessin rétabli) et non plus noire ; LED allumée :
// halo `drop-shadow` de sa couleur, d'autant plus large que la LED est lumineuse.
import { html, LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import { RGB } from './types/rgb.mjs';
import drawing from './externe/led-ring.svg';

/** Seuil de « LED allumée » (sous ce niveau : éteinte, donc blanche et sans halo). */
const PIXEL_LIT = 0.004;

export class LEDRingElement extends LitElement {
  declare pixels: number;
  declare animation: boolean;

  /** Propriétés réactives lit (remplace les décorateurs @property du code d'origine). */
  static properties = {
    pixels: {},
    animation: {},
  };

  constructor() {
    super();
    this.pixels = 16;
    this.animation = false;
  }

  private pixelElements: SVGRectElement[] | null = null;

  /** Dernier style écrit par pixel (cf. applyStyle) : évite de repeindre pour rien. */
  private lastStyle: string[] = [];

  private animationFrame: number | null = null;

  // Broches recalées sur grille 10 px (surcharges pin-overrides.mts « led-ring »).
  readonly pinInfo: ElementPin[] = [
    { name: 'GND', x: 60, y: 160, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'VCC', x: 70, y: 160, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'DIN', x: 80, y: 160, signals: [] },
    { name: 'DOUT', x: 90, y: 160, signals: [] },
  ];

  private getPixelElements() {
    if (!this.pixelElements) {
      this.pixelElements = Array.from(this.renderRoot.querySelectorAll('rect.pixel'));
    }
    return this.pixelElements;
  }

  setPixel(pixel: number, { r, g, b }: RGB) {
    const pixelElements = this.getPixelElements();
    if (pixel < 0 || pixel >= pixelElements.length) {
      return;
    }
    const lum = Math.max(r, g, b);
    if (lum <= PIXEL_LIT) {
      // LED éteinte = BLANCHE (couleur du dessin retouché) : `rgb(0,0,0)`
      // noircissait tout l'anneau au repos, comme s'il était grillé.
      this.applyStyle(pixel, '', '');
      return;
    }
    // Boîtier BLANC teinté, pas la couleur brute : le corps d'une WS2812 diffuse
    // la lumière, il ne devient jamais sombre. `rgb(r,g,b)` tel quel donnait un
    // pixel presque noir dès que la luminosité baissait (bleu à 10 % = rgb(0,0,26)),
    // alors que la LED réelle reste blanche légèrement bleutée. On sépare donc la
    // TEINTE (ramenée à pleine échelle) de l'INTENSITÉ, et on fond la teinte vers
    // le blanc à mesure que la LED faiblit (racine carrée : la teinte reste lisible
    // à basse luminosité, comme à l'œil).
    const hue = { r: (r / lum) * 255, g: (g / lum) * 255, b: (b / lum) * 255 };
    const tint = Math.sqrt(lum);
    const mix = (c: number) => Math.round(255 + (c - 255) * tint);
    const fill = `rgb(${mix(hue.r)},${mix(hue.g)},${mix(hue.b)})`;
    // Halo de LED allumée : deux flous concentriques, rayons en unités du dessin
    // (le groupe #board les agrandit ×3,937 à l'écran) et intensité suivant la
    // luminosité de la LED. Il porte la teinte pure, atténuée par l'opacité —
    // c'est lui qui rend l'intensité, le boîtier ne fait que la couleur.
    const glow = `rgba(${Math.round(hue.r)},${Math.round(hue.g)},${Math.round(hue.b)},${lum.toFixed(2)})`;
    const filter =
      `drop-shadow(0 0 ${(0.8 + lum * 0.7).toFixed(2)}px ${glow})` +
      ` drop-shadow(0 0 ${(2 + lum * 2).toFixed(2)}px ${glow})`;
    this.applyStyle(pixel, fill, filter);
  }

  /**
   * Écrit le style d'un pixel SEULEMENT s'il change. La simulation repose les 16
   * couleurs à chaque frame ; réécrire `fill` et `filter` à l'identique invalide
   * quand même la peinture des 16 rects et de leurs halos `drop-shadow` — un
   * coût permanent, y compris sur un anneau qui ne bouge pas.
   */
  private applyStyle(pixel: number, fill: string, filter: string): void {
    const style = `${fill}|${filter}`;
    if (this.lastStyle[pixel] === style) return;
    this.lastStyle[pixel] = style;
    const el = this.getPixelElements()[pixel];
    el.style.fill = fill;
    el.style.filter = filter;
  }

  /**
   * Resets all the pixels to off state (r=0, g=0, b=0).
   */
  reset() {
    for (let pixel = 0; pixel < this.getPixelElements().length; pixel++) {
      this.applyStyle(pixel, '', '');
    }
  }

  private animateStep = () => {
    const time = new Date().getTime();
    const { pixels } = this;
    const pixelValue = (n: number) => (n % 2000 > 1000 ? 1 - (n % 1000) / 1000 : (n % 1000) / 1000);
    for (let pixel = 0; pixel < pixels; pixel++) {
      this.setPixel(pixel, {
        r: pixelValue(pixel * 100 + time),
        g: pixelValue(pixel * 100 + time + 200),
        b: pixelValue(pixel * 100 + time + 400),
      });
    }
    this.animationFrame = requestAnimationFrame(this.animateStep);
  };

  updated(changed: PropertyValues) {
    super.updated(changed);
    // Le gabarit vient d'être (re)rendu : les rects peuvent être neufs, donc sans
    // style — le souvenir de applyStyle ne vaut plus rien.
    this.pixelElements = null;
    this.lastStyle = [];
    if (this.animation && !this.animationFrame) {
      this.animationFrame = requestAnimationFrame(this.animateStep);
    } else if (!this.animation && this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  render() {
    return html`
      <svg width="150" height="165" viewBox="0 0 150 165" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-led-ring')) {
  customElements.define('kablix-led-ring', LEDRingElement);
}
