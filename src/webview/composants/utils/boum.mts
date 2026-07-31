// Explosion « Boum » des composants grillés : boucle de feu animée (boum.webp,
// 10 images, 128 px, ~21 Ko) inlinée en data URI par le loader esbuild
// `{ '.webp': 'dataurl' }`. Elle remplace le dessin vectoriel Boum.svg (348 Ko,
// écarté dans « A Examiner/svg/ ») : plus léger, vraie animation de flammes.
// Le fichier est régénéré depuis Archives/images/boum.gif par
// `python scripts/make-boum-webp.py` (détourage du fond noir + mise en boucle).
//
// RENDU EN OVERLAY HTML (pas dans le <svg> du composant) : l'explosion est un
// <span> positionné en absolu, centré sur le composant, dimensionné en PIXELS.
// Ainsi sa taille écran est FIXE (~50 px) et identique pour tous les composants,
// quel que soit le viewBox/échelle de chacun ; et elle n'est jamais clippée par
// le viewport du composant (un <svg> hôte à `width="30"` coupait l'explosion à
// ~13 px). Le composant doit juste être `position: relative`.
//
// Animation : le WebP fournit le feu qui crépite (boucle de 1 s, sans raccord
// visible) ; le CSS ajoute le jaillissement initial (grossissement avec léger
// dépassement, ~0.9 s). Tout est en <style> inline pour vivre dans le shadow DOM
// de chaque composant.
//
// Le suffixe d'instance sur la classe reste nécessaire : les keyframes sont
// nommées par instance, et le banc scripts/verify-boum.mjs s'en sert pour
// détecter qu'un re-render ne recrée PAS l'overlay (l'animation repartirait).
import { html } from 'lit';
import boumFire from './boum.webp';

let seq = 0; // suffixe d'instance unique (classe + keyframes)

/**
 * Overlay d'explosion, centré sur le composant grillé, taille écran fixe.
 * À placer dans un conteneur `position: relative` (le composant lui-même).
 * @param sizePx côté de l'explosion en pixels écran (défaut 50).
 */
export function boumOverlay(sizePx = 50) {
  const suffix = `b${seq++}`;
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
          /* Repos visible plein (au cas où l'animation ne tournerait pas). */
          transform: scale(1);
          animation: boum-pop-${suffix} 0.9s cubic-bezier(0.18, 1.3, 0.35, 1) 1;
        }
        .boum-${suffix} img {
          display: block;
          width: 100%;
          height: 100%;
        }
        /* Jaillissement : dépassement → tassement → 1. Démarre à 0.6 (pas 0) pour
           qu'un re-render qui relancerait l'animation ne rende JAMAIS l'explosion
           minuscule — elle reste toujours ≥ 60 % de sa taille. */
        @keyframes boum-pop-${suffix} {
          0%   { transform: scale(0.6); opacity: 0.6; }
          55%  { transform: scale(1.18); opacity: 1; }
          75%  { transform: scale(0.94); }
          100% { transform: scale(1); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .boum-${suffix} { animation: none; transform: scale(1); opacity: 1; }
        }
      </style>
      <img src="${boumFire}" alt="" />
    </span>`;
}
