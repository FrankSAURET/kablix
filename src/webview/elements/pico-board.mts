// Élément visuel maison <kablix-pico-board> : Raspberry Pi Pico W. Le dessin et
// les 40 broches (deux rangées verticales, pas de 10 px) proviennent de la
// bibliothèque de composants — parts/picow-module.kablix-part.json — qui est
// elle-même générée depuis media/parts/. @wokwi/elements ne fournit AUCUN
// élément Pico : c'est donc ce dessin qui sert pour Pico et Pico W.
//
// La LED embarquée GP25 (pilotable via la propriété `ledPower`) est ajoutée en
// surimpression. L'élément expose `pinInfo` comme les éléments @wokwi/elements.

import picowPart from '../../../parts/picow-module.kablix-part.json';

const PICOW = picowPart as unknown as {
  svg: string;
  pins: Array<{ name: string; x: number; y: number }>;
};

export interface PinInfo {
  name: string;
  x: number;
  y: number;
  signals: unknown[];
}

// Repère de la LED GP25 (en haut à gauche, dans la marge hors des broches).
const LED_PAD = { name: 'GP25', x: 10, y: 15 };

/**
 * Construit la liste des broches à partir du dessin importé : les broches GND y
 * sont toutes nommées « GND », or l'éditeur indexe les pastilles par nom → on
 * les numérote GND.1, GND.2… pour les garder distinctes (la simulation ignore
 * de toute façon le nom des masses). La pastille GP25 (LED) est ajoutée à la fin.
 */
function buildPins(): PinInfo[] {
  let gnd = 0;
  const pins = PICOW.pins.map((p) => ({
    name: p.name === 'GND' ? `GND.${++gnd}` : p.name,
    x: p.x,
    y: p.y,
    signals: [] as unknown[],
  }));
  pins.push({ ...LED_PAD, signals: [] });
  return pins;
}

export class PicoBoardElement extends HTMLElement {
  readonly pinInfo: PinInfo[] = buildPins();

  private ledEl: SVGElement | null = null;
  private ledValue = false;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    const wrap = document.createElement('div');
    wrap.style.lineHeight = '0';
    wrap.innerHTML = PICOW.svg;
    const svg = wrap.querySelector('svg');
    if (svg) this.ledEl = this.addLed(svg);
    shadow.appendChild(wrap);
  }

  /** Ajoute la pastille LED GP25 en surimpression du dessin. */
  private addLed(svg: SVGSVGElement): SVGElement {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('id', 'led-gp25');
    c.setAttribute('cx', String(LED_PAD.x));
    c.setAttribute('cy', String(LED_PAD.y));
    c.setAttribute('r', '4');
    c.setAttribute('fill', '#3a4a3a');
    c.setAttribute('stroke', '#222');
    c.setAttribute('stroke-width', '0.6');
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = 'GP25 (LED)';
    c.appendChild(title);
    svg.appendChild(c);
    return c;
  }

  /** Allume/éteint la LED embarquée (GP25). */
  set ledPower(value: boolean) {
    if (value === this.ledValue) return;
    this.ledValue = value;
    if (!this.ledEl) return;
    this.ledEl.setAttribute('fill', value ? '#8cff5a' : '#3a4a3a');
    this.ledEl.style.filter = value ? 'drop-shadow(0 0 3px #8cff5a)' : 'none';
  }

  get ledPower(): boolean {
    return this.ledValue;
  }
}

if (!customElements.get('kablix-pico-board')) {
  customElements.define('kablix-pico-board', PicoBoardElement);
}
