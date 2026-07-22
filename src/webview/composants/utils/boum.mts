// Explosion « Boum » (svg/Boum.svg, dessin vectoriel de Frank) : remplace la
// flamme SVG des composants grillés. Un seul module partagé = une seule copie
// du dessin dans le bundle. viewBox source ~402.5 x 403.98.
//
// RENDU EN OVERLAY HTML (pas dans le <svg> du composant) : l'explosion est un
// <span> positionné en absolu, centré sur le composant, contenant SON PROPRE
// <svg> dimensionné en PIXELS. Ainsi sa taille écran est FIXE (~50 px) et
// identique pour tous les composants, quel que soit le viewBox/échelle de
// chacun ; et elle n'est jamais clippée par le viewport du composant (un
// <svg> hôte à `width="30"` coupait l'explosion à ~13 px — cause du « minuscule
// et à peine visible »). Le composant doit juste être `position: relative`.
//
// Animation : jaillissement LENT (grossissement + léger dépassement, ~0.9 s)
// puis vibration PERMANENTE jamais fixe (translation + micro-scale + micro-
// rotation, cycle court infini). Tout est en <style> inline pour vivre dans le
// shadow DOM de chaque composant. `unsafeSVG` injecte le <svg> source.
//
// Le dessin porte 262 ids référencés par 264 url(#…) (gradients/masks) : deux
// composants grillés dans le même document dupliqueraient ces ids et
// mélangeraient les rendus. On préfixe donc ids ET références par instance.
import { html } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import boumDrawing from '../../../../svg/Boum.svg';

let seq = 0; // suffixe d'instance unique (ids + animation)

/** Réécrit tous les ids internes du dessin avec un suffixe unique. */
function scopeIds(src: string, suffix: string): string {
  return src
    .replace(/id="([^"]+)"/g, (_m, id) => `id="${id}__${suffix}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id) => `url(#${id}__${suffix})`);
}

/** Retire le prolog <?xml …?> (nœud invalide en SVG inline). */
function stripProlog(src: string): string {
  return src.replace(/<\?xml[^>]*\?>\s*/g, '');
}

/**
 * Overlay d'explosion, centré sur le composant grillé, taille écran fixe.
 * À placer dans un conteneur `position: relative` (le composant lui-même).
 * @param sizePx côté de l'explosion en pixels écran (défaut 50).
 */
export function boumOverlay(sizePx = 50) {
  const suffix = `b${seq++}`;
  const drawing = stripProlog(scopeIds(boumDrawing, suffix));
  return html`
    <span class="boum-${suffix}">
      <style>
        .boum-${suffix} {
          position: absolute;
          left: 50%;
          top: 50%;
          width: ${sizePx}px;
          height: ${sizePx}px;
          margin-left: ${-sizePx / 2}px;
          margin-top: ${-sizePx / 2}px;
          pointer-events: none;
          z-index: 3;
          transform-origin: 50% 50%;
          /* Repos visible plein (au cas où les animations ne tournent pas). */
          transform: scale(1);
          opacity: 1;
          animation: boum-pop-${suffix} 0.9s cubic-bezier(0.18, 1.3, 0.35, 1) 1,
                     boum-shake-${suffix} 0.2s linear 0.9s infinite;
        }
        .boum-${suffix} svg {
          display: block;
          width: 100%;
          height: 100%;
          overflow: visible;
        }
        /* Jaillissement lent : petit → dépassement → tassement → 1. */
        @keyframes boum-pop-${suffix} {
          0%   { transform: scale(0.05); opacity: 0.4; }
          55%  { transform: scale(1.18); opacity: 1; }
          75%  { transform: scale(0.94); }
          100% { transform: scale(1); opacity: 1; }
        }
        /* Vibration : jamais deux images identiques, jamais au repos. */
        @keyframes boum-shake-${suffix} {
          0%   { transform: translate(-1.2px, 0.8px) scale(1.02) rotate(-1.2deg); }
          25%  { transform: translate(1px, -1px)    scale(0.99) rotate(1deg); }
          50%  { transform: translate(-0.8px, -1px) scale(1.03) rotate(0.6deg); }
          75%  { transform: translate(1.2px, 0.9px) scale(0.98) rotate(-0.8deg); }
          100% { transform: translate(-1.2px, 0.8px) scale(1.02) rotate(-1.2deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .boum-${suffix} { animation: none; transform: scale(1); opacity: 1; }
        }
      </style>
      ${unsafeSVG(drawing)}
    </span>`;
}
