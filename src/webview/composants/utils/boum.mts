// Explosion « Boum » (svg/Boum.svg, dessin vectoriel de Frank) : remplace la
// flamme SVG des composants grillés. Un seul module partagé = une seule copie
// du dessin dans le bundle. SVG carré ~402.5 x 403.98.
//
// Animation « au moment où ça grille » : jaillissement (scale 0 → dépassement →
// 1) puis pulsation/vacillement infini léger. Tout est en <style> inline dans le
// fragment pour vivre dans le shadow DOM de chaque composant, sans dépendre de
// leurs styles. `unsafeSVG` injecte le <svg> source complet ; imbriqué dans un
// <g> scalé il garde son propre viewBox et se dimensionne au facteur du <g>.
//
// Le dessin porte 262 ids référencés par 264 url(#…) (gradients/masks) : deux
// composants grillés dans le même document dupliqueraient ces ids et
// mélangeraient les rendus. On préfixe donc ids ET références par instance.
import { svg } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import boumDrawing from '../../../../svg/Boum.svg';

const BOUM_VB = 402.5; // côté du viewBox source (carré)

let seq = 0; // suffixe d'instance unique (ids + animation)

/** Réécrit tous les ids internes du dessin avec un suffixe unique. */
function scopeIds(src: string, suffix: string): string {
  return src
    .replace(/id="([^"]+)"/g, (_m, id) => `id="${id}__${suffix}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id) => `url(#${id}__${suffix})`);
}

/** Rend l'explosion centrée en (cx, cy), taille = `size` px (côté). Animée. */
export function boumSVG(cx: number, cy: number, size: number) {
  const k = size / BOUM_VB;
  const suffix = `b${seq++}`;
  const drawing = scopeIds(boumDrawing, suffix);
  return svg`
    <g transform="translate(${cx} ${cy}) scale(${k}) translate(${-BOUM_VB / 2} ${-BOUM_VB / 2})">
      <style>
        /* État de REPOS visible (scale 1, opaque) : si les animations ne
           tournent pas (webview sans compositing SVG, prefers-reduced-motion,
           rendu headless…), l'explosion reste affichée pleine taille au lieu
           de rester coincée à scale(0). L'animation ne fait que « jaillir » ;
           elle n'est jamais la condition de visibilité. */
        .anim-${suffix} {
          transform-box: fill-box;
          transform-origin: 50% 50%;
          transform: scale(1);
          opacity: 1;
          animation: pop-${suffix} 0.32s cubic-bezier(0.2, 1.4, 0.4, 1) 1,
                     pulse-${suffix} 0.5s ease-in-out 0.32s infinite alternate;
        }
        @keyframes pop-${suffix} {
          0%   { transform: scale(0.2); opacity: 0.3; }
          60%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes pulse-${suffix} {
          from { transform: scale(1); }
          to   { transform: scale(1.06); opacity: 0.9; }
        }
        @media (prefers-reduced-motion: reduce) {
          .anim-${suffix} { animation: none; transform: scale(1); opacity: 1; }
        }
      </style>
      <g class="anim-${suffix}">${unsafeSVG(drawing)}</g>
    </g>`;
}
