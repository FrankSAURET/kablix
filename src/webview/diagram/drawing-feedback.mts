// Retour visuel de simulation sur le DESSIN retouché (board-drawing) d'un
// composant dynamique. Comme l'élément Lit est masqué (visibility:hidden), son
// rendu animé (LED allumée, buzzer actif…) n'est plus visible : on reproduit ce
// retour en agissant sur les sous-éléments CONSERVÉS dans le dessin (le SVG
// retouché garde la structure Wokwi : groupe `.light` du LED, etc.).

const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

/**
 * Zone d'écran d'un dessin = le plus grand `<rect>` non rempli d'un motif
 * (`url(...)`). Sert d'ancrage au canvas superposé (OLED).
 */
function screenRectOf(svg: SVGElement): { x: number; y: number; w: number; h: number } | null {
  let best: { x: number; y: number; w: number; h: number } | null = null;
  for (const r of svg.querySelectorAll('rect')) {
    const fill = (r.getAttribute('fill') || (r as SVGElement).style.fill || '').toLowerCase();
    if (fill.includes('url')) continue;
    const w = Number(r.getAttribute('width') ?? 0);
    const h = Number(r.getAttribute('height') ?? 0);
    if (!best || w * h > best.w * best.h) {
      best = { x: Number(r.getAttribute('x') ?? 0), y: Number(r.getAttribute('y') ?? 0), w, h };
    }
  }
  return best;
}

/**
 * Canvas superposé à la zone écran du dessin (créé/redimensionné au besoin). Le
 * canvas garde la résolution native du composant (`nw`×`nh`) et est étiré à la
 * zone écran par CSS, via un `<foreignObject>` posé aux coordonnées du viewBox.
 */
function screenCtx(svg: SVGElement, nw: number, nh: number): CanvasRenderingContext2D | null {
  const rect = screenRectOf(svg);
  if (!rect) return null;
  let fo = svg.querySelector('foreignObject.screen-overlay') as SVGForeignObjectElement | null;
  let canvas: HTMLCanvasElement;
  if (!fo) {
    fo = document.createElementNS(SVG_NS, 'foreignObject') as SVGForeignObjectElement;
    fo.setAttribute('class', 'screen-overlay');
    canvas = document.createElementNS(XHTML_NS, 'canvas') as HTMLCanvasElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    fo.appendChild(canvas);
    svg.appendChild(fo);
  } else {
    canvas = fo.firstChild as HTMLCanvasElement;
  }
  fo.setAttribute('x', String(rect.x));
  fo.setAttribute('y', String(rect.y));
  fo.setAttribute('width', String(rect.w));
  fo.setAttribute('height', String(rect.h));
  if (canvas.width !== nw) canvas.width = nw;
  if (canvas.height !== nh) canvas.height = nh;
  return canvas.getContext('2d');
}

/** Écran OLED monochrome (SSD1306) : tampon décodé → canvas superposé (blanc sur noir). */
export function reflectOled(
  svg: SVGElement,
  dev: { width: number; height: number; pixelOn(x: number, y: number): boolean }
): void {
  const ctx = screenCtx(svg, dev.width, dev.height);
  if (!ctx) return;
  const img = ctx.createImageData(dev.width, dev.height);
  const d = img.data;
  for (let y = 0; y < dev.height; y++) {
    for (let x = 0; x < dev.width; x++) {
      const on = dev.pixelOn(x, y) ? 255 : 0;
      const i = (y * dev.width + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = on;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Zone des caractères d'un dessin de LCD texte = le `<rect>` rempli par le motif
 * de caractères Wokwi (`fill="url(#characters)"` ou un motif `url(#pattern…)`).
 * C'est là qu'on superpose le texte décodé. `el` sert à masquer le motif de
 * remplacement (caractères factices) pendant la simulation.
 */
function lcdCharRectOf(
  svg: SVGElement
): { x: number; y: number; w: number; h: number; el: SVGElement } | null {
  for (const r of svg.querySelectorAll('rect')) {
    const fill = `${r.getAttribute('fill') || ''} ${(r as SVGElement).style.fill || ''}`;
    if (!/url\(#characters|url\(#pattern/.test(fill)) continue;
    return {
      x: Number(r.getAttribute('x') ?? 0),
      y: Number(r.getAttribute('y') ?? 0),
      w: Number(r.getAttribute('width') ?? 0),
      h: Number(r.getAttribute('height') ?? 0),
      el: r as SVGElement,
    };
  }
  return null;
}

/**
 * Afficheur LCD texte (HD44780) : superpose le texte décodé (`lines`, une chaîne
 * par ligne) sur la zone des caractères du dessin. Rendu en `<text>` SVG natif
 * (un par ligne, police LED « LED Board-7 ») plutôt qu'en `<foreignObject>` :
 * le SVG se repeint de façon fiable à chaque changement (un `<foreignObject>`
 * HTML n'était rafraîchi qu'à l'arrêt de la simulation). Chaque ligne est étirée
 * sur toute la largeur (`textLength`) → grille régulière de `cols` cases. Le
 * motif de caractères factices d'origine est masqué.
 */
// --- Réglages du texte LCD (ajustables) -------------------------------------
// Décalage vertical du texte, en fraction de la hauteur d'une ligne (0 = centré).
// Positif = descend, négatif = monte. Normalement 0 : le texte est centré sur la
// zone des caractères du dessin (transforms des groupes pris en compte).
const LCD_TEXT_VSHIFT = 0;
// Hauteur d'un caractère, en fraction de la hauteur d'une ligne (marge verticale).
const LCD_TEXT_HEIGHT = 0.82;

export function reflectLcd(svg: SVGElement, lines: string[], _cols: number, rows: number): void {
  const zone = lcdCharRectOf(svg);
  if (!zone || zone.w <= 0 || zone.h <= 0) return;
  zone.el.style.opacity = '0'; // masque les caractères factices Wokwi

  let group = svg.querySelector('g.lcd-overlay') as SVGGElement | null;
  if (!group) {
    group = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    group.setAttribute('class', 'lcd-overlay');
    // Placé dans le MÊME parent que la zone des caractères : il hérite ainsi des
    // mêmes `transform` de groupe (les dessins parallèles imbriquent la zone dans
    // des `<g transform="translate(...)">` — sans ça le texte tombait trop bas).
    (zone.el.parentNode ?? svg).appendChild(group);
  }
  const rowH = zone.h / rows;
  const fs = rowH * LCD_TEXT_HEIGHT; // hauteur d'un caractère LED
  // Réutilise les <text> existants, en crée/supprime au besoin.
  while (group.childElementCount > lines.length) group.lastElementChild?.remove();
  while (group.childElementCount < lines.length) {
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('text-anchor', 'start');
    t.setAttribute('dominant-baseline', 'central');
    t.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    t.setAttribute('fill', '#0b1405'); // caractères sombres sur rétroéclairage
    t.style.fontFamily = "'LED Board-7', monospace";
    t.style.whiteSpace = 'pre';
    group.appendChild(t);
  }
  for (let i = 0; i < lines.length; i++) {
    const t = group.children[i] as SVGTextElement;
    t.setAttribute('x', String(zone.x));
    t.setAttribute('y', String(zone.y + (i + 0.5 + LCD_TEXT_VSHIFT) * rowH));
    t.setAttribute('textLength', String(zone.w));
    t.setAttribute('font-size', String(fs));
    t.textContent = lines[i];
  }
}

/**
 * Couleur du capuchon d'un bouton (`color`, propriété statique choisie dans
 * l'inspecteur, ex. kablix-pushbutton). Le dessin capté fige la couleur du
 * moment de la retouche (dégradés `grad-up/down-pushbutton0` + le cercle/
 * ellipse plein hors dégradé) : on la retouche comme le fait le composant
 * Wokwi d'origine (`stop-color`, `fill`) à chaque changement.
 */
export function reflectButtonColor(svg: SVGElement, color: string): void {
  for (const g of svg.querySelectorAll('linearGradient')) {
    const stops = g.querySelectorAll('stop');
    stops[1]?.setAttribute('stop-color', color);
    stops[2]?.setAttribute('stop-color', color);
  }
  // Le cercle/ellipse plein (couleur du capuchon) suit toujours immédiatement
  // `.button-active-circle` dans le même groupe (ordre Wokwi : dégradé haut,
  // dégradé bas, plein). Chercher par « pas d'url » dans tout le SVG accroche à
  // tort les points de fixation des coins (fill hérité, pas d'attribut propre).
  const active = svg.querySelector('.button-active-circle');
  const cap = active?.nextElementSibling;
  if (cap && (cap.tagName === 'circle' || cap.tagName === 'ellipse')) {
    cap.setAttribute('fill', color);
  }
}

/**
 * Retour visuel des composants INTERACTIFS à dessin retouché (bouton, DIP
 * switch, joystick). L'élément Lit reste actif par-dessus le dessin
 * (transparent, calé sur les broches) : il capte les clics et émet ses
 * événements ; on répercute ici son état sur le dessin, qui garde la structure
 * du rendu Wokwi (`.button-active-circle`, `use #switch`, `#knob`).
 */
export function attachInteractiveFeedback(
  type: string,
  el: HTMLElement & { values?: unknown; xValue?: unknown; yValue?: unknown },
  svg: SVGElement
): void {
  if (type === 'button' || type === 'button-6mm') {
    // Couleur du capuchon (attribut statique, cf. reflectButtonColor) : appliquée
    // une première fois ici (création), puis rafraîchie par updatePartAttr.
    reflectButtonColor(svg, el.getAttribute('color') || 'red');
    // Capuchon enfoncé : le dessin capté montre l'état « down » (le style Wokwi
    // qui le masquait vit dans le shadow DOM, pas dans le SVG) → on le masque au
    // repos et on le révèle pendant l'appui (Ctrl+clic : pas de relâchement).
    const active = svg.querySelector('.button-active-circle') as SVGElement | null;
    if (!active) return;
    active.style.display = 'none';
    el.addEventListener('button-press', () => (active.style.display = ''));
    el.addEventListener('button-release', () => (active.style.display = 'none'));
    return;
  }
  if (type === 'dip-switch') {
    // Chaque levier est un `use #switch` : y = -7.2 (ON) / 0 (OFF), comme dans
    // le rendu Wokwi (l'offset est en unités locales, les transforms du dessin
    // s'appliquent par-dessus). Ordre gauche→droite = ordre des canaux.
    const levers = [...svg.querySelectorAll('use')]
      .filter((u) => (u.getAttribute('xlink:href') ?? u.getAttribute('href')) === '#switch')
      .sort((a, b) => Number(a.getAttribute('x') ?? 0) - Number(b.getAttribute('x') ?? 0));
    if (levers.length === 0) return;
    const apply = (): void => {
      const values = (el.values as number[]) ?? [];
      levers.forEach((u, i) => u.setAttribute('y', values[i] ? '-7.2' : '0'));
    };
    apply();
    el.addEventListener('switch-change', apply);
    return;
  }
  if (type === 'joystick') {
    // Manche : décalé de 2,5 unités Wokwi × valeur d'axe (comme l'élément),
    // converties en px du dessin via l'échelle du transform du `#knob` capté.
    const knob = svg.querySelector('#knob') as SVGElement | null;
    if (!knob) return;
    const base = knob.getAttribute('transform') ?? '';
    const s = Number(/matrix\(\s*([-\d.]+)/.exec(base)?.[1] ?? 96 / 25.4);
    const move = (): void => {
      const dx = -2.5 * Number(el.xValue ?? 0) * s;
      const dy = -2.5 * Number(el.yValue ?? 0) * s;
      knob.setAttribute('transform', `translate(${dx} ${dy}) ${base}`);
    };
    el.addEventListener('input', move);
    // Appui SEL : le petit cercle central (r = 3 unités) passe en blanc.
    const sel = [...svg.querySelectorAll('circle')].find(
      (c) => !c.closest('defs') && c !== knob && Math.abs(Number(c.getAttribute('r') ?? 0) - 3 * s) < 1
    ) as SVGElement | undefined;
    if (sel) {
      const off = sel.style.fill || sel.getAttribute('fill') || '#aaa';
      el.addEventListener('button-press', () => (sel.style.fill = '#fff'));
      el.addEventListener('button-release', () => (sel.style.fill = off));
    }
  }
}
