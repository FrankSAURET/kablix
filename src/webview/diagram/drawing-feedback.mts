// Retour visuel de simulation sur le DESSIN retouché (board-drawing) d'un
// composant dynamique. Comme l'élément @wokwi est masqué (visibility:hidden), son
// rendu animé (LED allumée, buzzer actif…) n'est plus visible : on reproduit ce
// retour en agissant sur les sous-éléments CONSERVÉS dans le dessin (le SVG
// retouché garde la structure Wokwi : groupe `.light` du LED, etc.).

// Couleur pastel du halo selon la couleur du LED (cf. wokwi led-element).
const LIGHT_COLORS: Record<string, string> = {
  red: '#ff8080',
  green: '#80ff80',
  blue: '#8080ff',
  yellow: '#ffff80',
  orange: '#ffcf80',
  white: '#ffffff',
  purple: '#ff80ff',
};

/**
 * LED allumée/éteinte : affiche le groupe `.light` du dessin (les trois cercles
 * de halo, présents mais masqués dans le SVG capté) et teinte le halo coloré
 * selon la couleur du LED. Réplique le `display` du `<g class="light">` Wokwi.
 */
export function reflectLed(svg: SVGElement, on: boolean, color?: string): void {
  const light = svg.querySelector('.light') as SVGElement | null;
  if (!light) {
    // Pas de groupe lumineux dans le dessin → repli sur un halo global.
    reflectGlow(svg, on, color ? LIGHT_COLORS[color.toLowerCase()] ?? color : undefined);
    return;
  }
  light.style.display = on ? '' : 'none';
  if (on && color) {
    // Premier cercle/ellipse du groupe = halo coloré (les suivants sont blancs).
    const glow = light.querySelector('circle, ellipse') as SVGElement | null;
    if (glow) glow.setAttribute('fill', LIGHT_COLORS[color.toLowerCase()] ?? color);
  }
}

/**
 * Halo lumineux générique autour du dessin (composant actif sans groupe `.light`
 * propre : buzzer…). Reproduit le `drop-shadow` de kablix-custom-part.
 */
export function reflectGlow(svg: SVGElement, on: boolean, color = 'rgba(255,230,80,0.95)'): void {
  svg.style.filter = on ? `drop-shadow(0 0 6px ${color})` : '';
}

/**
 * Afficheur 7 segments (1, 2 ou 4 chiffres) : allume chaque segment selon
 * `values` (8 valeurs par chiffre, ordre Wokwi A,B,C,D,E,F,G,DP). Les segments
 * sont les `<polygon>` du dessin, groupés par chiffre dans l'ordre DOM (7 par
 * chiffre, A→G validé vs Wokwi) ; les points décimaux sont les `<circle>` /
 * `<ellipse>` hors `<defs>`, un par chiffre dans l'ordre DOM (gauche→droite).
 * Couleur allumée = `color` (attribut du composant) ; éteinte = la couleur
 * d'origine du dessin, mémorisée au premier passage.
 */
export function reflectSevenSeg(
  svg: SVGElement,
  values: number[],
  color = 'red',
  digits = 1
): void {
  const polys = svg.querySelectorAll('polygon');
  if (polys.length < digits * 7) return;
  const dps = [...svg.querySelectorAll('circle, ellipse')].filter((c) => !c.closest('defs'));
  const setSeg = (el: SVGElement, lit: boolean) => {
    const e = el as SVGElement & { dataset: DOMStringMap };
    if (e.dataset.off === undefined) e.dataset.off = el.style.fill || el.getAttribute('fill') || '#444';
    el.style.fill = lit ? color : e.dataset.off;
  };
  for (let d = 0; d < digits; d++) {
    for (let s = 0; s < 7; s++) setSeg(polys[d * 7 + s] as SVGElement, !!values[d * 8 + s]);
    if (dps[d]) setSeg(dps[d] as SVGElement, !!values[d * 8 + 7]);
  }
}

type Rgb = { r: number; g: number; b: number };

/**
 * Colore un pixel WS2812 d'après `c` (composantes 0..255). Deux structures de
 * dessin : groupe Wokwi (matrice/anneau matrice : `<circle>` R/G/B + diffuseur,
 * tous à opacité 0) → on teinte le diffuseur (plus grand rayon) ; pixel feuille
 * (anneau à `<rect>`) → on colore le rectangle (éteint = gris sombre).
 */
function colorPixel(host: SVGElement, c: Rgb): void {
  const on = c.r || c.g || c.b;
  const circles = [...host.querySelectorAll('circle, ellipse')].filter((e) => !e.closest('defs'));
  if (circles.length > 0) {
    const diff = circles.sort(
      (a, b) => Number(b.getAttribute('r') ?? 0) - Number(a.getAttribute('r') ?? 0)
    )[0] as SVGElement;
    diff.setAttribute('fill', `rgb(${c.r},${c.g},${c.b})`);
    diff.setAttribute('opacity', on ? '0.9' : '0');
    return;
  }
  host.setAttribute('fill', on ? `rgb(${c.r},${c.g},${c.b})` : '#141414');
}

/**
 * Chaîne NeoPixel (WS2812) sur le dessin. Matrice / anneau : chaque pixel est un
 * élément `class="pixel"` (ordre DOM = ordre de la chaîne) coloré par `colors`
 * (composantes 0..255). NeoPixel simple (1 LED, pas de `.pixel`) : on teinte le
 * diffuseur central de tout le dessin.
 */
export function reflectNeopixel(svg: SVGElement, colors: Rgb[]): void {
  const pixels = svg.querySelectorAll('.pixel');
  if (pixels.length > 0) {
    for (let i = 0; i < pixels.length; i++) colorPixel(pixels[i] as SVGElement, colors[i] ?? { r: 0, g: 0, b: 0 });
    return;
  }
  colorPixel(svg, colors[0] ?? { r: 0, g: 0, b: 0 });
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

/**
 * Zone d'écran d'un dessin = le plus grand `<rect>` non rempli d'un motif
 * (`url(...)`). Sert d'ancrage au canvas superposé (OLED, TFT).
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

/** Écran TFT couleur (ILI9341) : image RGBA décodée → canvas superposé. */
export function reflectTft(
  svg: SVGElement,
  dev: { width: number; height: number; data: Uint8ClampedArray | Uint8Array }
): void {
  const ctx = screenCtx(svg, dev.width, dev.height);
  if (!ctx) return;
  const img = ctx.createImageData(dev.width, dev.height);
  img.data.set(dev.data);
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
 * par ligne) sur la zone des caractères du dessin. Le texte est rendu dans un
 * `<foreignObject>` en police à chasse fixe, aligné en grille (cols×rows), taille
 * ajustée à la zone. Le motif de caractères factices d'origine est masqué.
 */
export function reflectLcd(svg: SVGElement, lines: string[], cols: number, rows: number): void {
  const zone = lcdCharRectOf(svg);
  if (!zone || zone.w <= 0 || zone.h <= 0) return;
  zone.el.style.opacity = '0'; // masque les caractères factices Wokwi

  let fo = svg.querySelector('foreignObject.lcd-overlay') as SVGForeignObjectElement | null;
  let grid: HTMLElement;
  if (!fo) {
    fo = document.createElementNS(SVG_NS, 'foreignObject') as SVGForeignObjectElement;
    fo.setAttribute('class', 'lcd-overlay');
    grid = document.createElementNS(XHTML_NS, 'div') as HTMLElement;
    grid.style.width = '100%';
    grid.style.height = '100%';
    grid.style.display = 'flex';
    grid.style.flexDirection = 'column';
    grid.style.justifyContent = 'center';
    grid.style.alignItems = 'center';
    grid.style.fontFamily = 'monospace';
    grid.style.fontWeight = 'bold';
    grid.style.lineHeight = '1';
    grid.style.whiteSpace = 'pre';
    grid.style.color = '#0b1405'; // caractères sombres sur rétroéclairage
    grid.style.overflow = 'hidden';
    fo.appendChild(grid);
    svg.appendChild(fo);
  } else {
    grid = fo.firstChild as HTMLElement;
  }
  fo.setAttribute('x', String(zone.x));
  fo.setAttribute('y', String(zone.y));
  fo.setAttribute('width', String(zone.w));
  fo.setAttribute('height', String(zone.h));
  // Taille de police : borne par la hauteur (rows lignes) et la largeur (cols
  // caractères, avance ≈ 0,6 em en chasse fixe), avec une petite marge.
  const fs = Math.min(zone.h / rows, zone.w / (cols * 0.62)) * 0.88;
  grid.style.fontSize = `${fs}px`;
  // Réutilise les lignes existantes, en crée/supprime au besoin.
  while (grid.childElementCount > lines.length) grid.lastElementChild?.remove();
  while (grid.childElementCount < lines.length) grid.appendChild(document.createElementNS(XHTML_NS, 'div'));
  for (let i = 0; i < lines.length; i++) {
    (grid.children[i] as HTMLElement).textContent = lines[i];
  }
}

// Palettes de couleurs des barres LED (cf. wokwi led-bar-graph).
const BAR_PALETTES: Record<string, string[]> = {
  GYR: ['#9eff3c', '#9eff3c', '#9eff3c', '#9eff3c', '#9eff3c', '#f1d73c', '#f1d73c', '#f1d73c', '#dc012d', '#dc012d'],
  BCYR: ['#2c95fa', '#6cf9dc', '#6cf9dc', '#6cf9dc', '#6cf9dc', '#f1d73c', '#f1d73c', '#f1d73c', '#dc012d', '#dc012d'],
};

/**
 * Barregraphe à LED : allume chaque barre selon `values` (index 0 = barre du
 * haut). Les 10 barres sont les `<rect>` du dessin dont le remplissage n'est pas
 * un motif (`url(...)` = le fond). Couleur allumée = palette GYR/BCYR ou couleur
 * unique ; éteinte = couleur d'origine du dessin (mémorisée au 1er passage).
 */
export function reflectLedBar(svg: SVGElement, values: number[], color = 'GYR'): void {
  const palette = BAR_PALETTES[color];
  const bars = [...svg.querySelectorAll('rect')].filter(
    (r) => !/url/.test((r as SVGElement).style.fill || r.getAttribute('fill') || '')
  );
  if (bars.length < 10) return;
  for (let i = 0; i < 10; i++) {
    const el = bars[i] as SVGElement & { dataset: DOMStringMap };
    if (el.dataset.off === undefined) el.dataset.off = el.style.fill || el.getAttribute('fill') || '#444';
    el.style.fill = values[i] ? palette?.[i] ?? color : el.dataset.off;
  }
}

/**
 * LED RGB : reproduit le rendu Wokwi sur le dessin (canaux 0..1). Les sous-
 * éléments conservés du SVG capté : `circle35/36/37` (halos R/G/B + filtres de
 * flou `feGaussianBlur33/34/35`), `circle38` (diffuseur central, couleur mêlée)
 * et `circle39` (anneau). Tous à `opacity:0` au repos.
 */
export function reflectRgbLed(svg: SVGElement, r: number, g: number, b: number): void {
  const brightness = Math.max(r, g, b);
  const op = brightness ? 0.2 + brightness * 0.6 : 0;
  const set = (id: string, attrs: Record<string, string | number>) => {
    const el = svg.querySelector('#' + id) as SVGElement | null;
    if (el) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  };
  set('feGaussianBlur33', { stdDeviation: r * 3 });
  set('feGaussianBlur34', { stdDeviation: g * 3 });
  set('feGaussianBlur35', { stdDeviation: b * 3 });
  set('circle35', { r: r * 5 + 2, opacity: Math.min(r * 20, 0.3) });
  set('circle36', { r: g * 5 + 2, opacity: Math.min(g * 20, 0.3) });
  set('circle37', { r: b * 5 + 2, opacity: Math.min(b * 20, 0.3) });
  set('circle38', { fill: `rgb(${r * 255}, ${g * 255 + b * 90}, ${b * 255})`, opacity: op });
  set('circle39', { opacity: op });
}

/**
 * Servo : oriente le palonnier (horn) selon `angle` (0–180°). Le palonnier est
 * le seul `<path>` couleur `#ccc` (hornColor Wokwi) hors `<defs>` ; l'axe de
 * rotation est le centre des cercles concentriques de l'arbre. On reproduit la
 * transformation `rotate` du rendu Wokwi (le dessin est capté à 0°).
 */
export function reflectServo(svg: SVGElement, angle: number): void {
  const horn = [...svg.querySelectorAll('path')].find(
    (p) => !p.closest('defs') && /^#(ccc|cccccc)$/i.test((p.getAttribute('fill') || p.style.fill || '').trim())
  ) as SVGElement | undefined;
  if (!horn) return;
  // Axe = cercles partageant le même centre (l'arbre = 3 cercles concentriques).
  const circles = [...svg.querySelectorAll('circle')].filter((c) => !c.closest('defs'));
  const groups = new Map<string, { cx: number; cy: number; n: number }>();
  for (const c of circles) {
    const cx = Number(c.getAttribute('cx') ?? 0);
    const cy = Number(c.getAttribute('cy') ?? 0);
    const k = `${Math.round(cx * 10)},${Math.round(cy * 10)}`;
    const e = groups.get(k) ?? { cx, cy, n: 0 };
    e.n++;
    groups.set(k, e);
  }
  let hub: { cx: number; cy: number; n: number } | undefined;
  for (const e of groups.values()) if (!hub || e.n > hub.n) hub = e;
  if (!hub || hub.n < 2) return;
  horn.setAttribute(
    'transform',
    `translate(${hub.cx} ${hub.cy}) rotate(${angle}) translate(${-hub.cx} ${-hub.cy})`
  );
}
