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
