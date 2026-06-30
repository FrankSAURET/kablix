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
