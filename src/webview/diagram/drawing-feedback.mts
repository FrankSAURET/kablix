// Retour visuel de simulation sur le DESSIN retouché (board-drawing) des
// composants INTERACTIFS restants (bouton, DIP switch, joystick) : l'élément
// Lit reste actif par-dessus le dessin (transparent, calé sur les broches) et
// on répercute ici son état sur les sous-éléments CONSERVÉS dans le dessin
// (le SVG retouché garde la structure Wokwi : `.button-active-circle`, etc.).
// Les composants à écran/texte (OLED, LCD) dessinent et animent désormais leur
// propre affichage nativement dans leur fork (cf. ssd1306-element.mts,
// lcd1602-element.mts).

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
