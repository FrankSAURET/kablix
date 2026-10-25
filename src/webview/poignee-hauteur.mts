// Poignées à 3 points (.vsplit) au-dessus de la console et du traceur : tirer vers
// le haut agrandit la zone de sortie (console : le <pre> ; traceur : .plotter__wrap).
// Module à part pour que le banc à vraie souris (verify-souris.mjs) le monte seul.

/** Branche chaque `.vsplit` de `racine` ; `zone` rend l'élément dont on règle la hauteur. */
export function brancherPoignees(
  racine: ParentNode,
  stage: HTMLElement,
  zone: (cible: string | undefined) => HTMLElement | null
): void {
  racine.querySelectorAll<HTMLElement>('.vsplit').forEach((grip) => {
    grip.addEventListener('pointerdown', (e) => {
      const cible = zone(grip.dataset.target);
      if (!cible) return;
      e.preventDefault();
      const y0 = e.clientY;
      // Hauteur calculée (et non le rectangle) : `style.height` règle la boîte de
      // contenu, le rectangle compterait en plus les marges intérieures.
      const h0 = parseFloat(getComputedStyle(cible).height) || cible.getBoundingClientRect().height;
      grip.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent): void => {
        const max = Math.max(80, stage.clientHeight - 160);
        cible.style.height = `${Math.round(Math.min(max, Math.max(60, h0 + (y0 - ev.clientY))))}px`;
      };
      const stop = (): void => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', stop);
        grip.removeEventListener('pointercancel', stop);
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', stop);
      grip.addEventListener('pointercancel', stop);
    });
  });
}
