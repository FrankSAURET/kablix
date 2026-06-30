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
 * Afficheur 7 segments (1 chiffre) : allume chaque segment selon `values`
 * (ordre Wokwi A,B,C,D,E,F,G,DP). Les 7 segments sont les 7 `<polygon>` du
 * dessin (ordre DOM = A→G, validé vs le rendu Wokwi), le point décimal le
 * `<circle>` hors `<defs>`. Couleur allumée = `color` (attribut du composant) ;
 * éteinte = la couleur d'origine du dessin, mémorisée au premier passage.
 */
export function reflectSevenSeg(svg: SVGElement, values: number[], color = 'red'): void {
  const polys = svg.querySelectorAll('polygon');
  if (polys.length < 7) return;
  const setSeg = (el: SVGElement, lit: boolean) => {
    const e = el as SVGElement & { dataset: DOMStringMap };
    if (e.dataset.off === undefined) e.dataset.off = el.style.fill || el.getAttribute('fill') || '#444';
    el.style.fill = lit ? color : e.dataset.off;
  };
  for (let i = 0; i < 7; i++) setSeg(polys[i] as SVGElement, !!values[i]);
  const dp = [...svg.querySelectorAll('circle')].find((c) => !c.closest('defs'));
  if (dp) setSeg(dp as SVGElement, !!values[7]);
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
