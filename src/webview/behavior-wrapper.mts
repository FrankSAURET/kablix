/**
 * Emballage d'un `behavior.mjs` de composant .kompix pour son exécution dans la
 * webview.
 *
 * La spécification (docs/kompix_specification.md) demande un VRAI module ES :
 *
 *     export function init(context) {}
 *     export function tick(context) {}
 *     export function destroy(context) {}
 *
 * Or un `<script>` classique refuse `export` (erreur de syntaxe) : le script
 * doit donc partir dans un `<script type="module">`. Mais un module écrit en
 * ligne n'a aucun importateur, donc ses exports sont inatteignables — d'où la
 * queue ajoutée ici, qui republie les liaisons sur `window.__kx_behaviors`.
 *
 * `typeof f === 'function'` ne lève pas sur un nom absent : un composant qui
 * n'exporte que `tick` passe sans erreur.
 *
 * Isolé dans son propre module pour que le banc puisse l'évaluer sans
 * navigateur (voir scripts/verify-kompix.mjs).
 */
export const BEHAVIOR_REGISTRY = '__kx_behaviors';

export function wrapBehaviorModule(componentType: string, script: string): string {
  // Le type vient d'un manifeste téléchargé : jamais concaténé brut dans du code.
  const key = JSON.stringify(componentType);
  return `${script}
;globalThis.${BEHAVIOR_REGISTRY} = globalThis.${BEHAVIOR_REGISTRY} || {};
globalThis.${BEHAVIOR_REGISTRY}[${key}] = {
  init: typeof init === 'function' ? init : undefined,
  tick: typeof tick === 'function' ? tick : undefined,
  destroy: typeof destroy === 'function' ? destroy : undefined,
};
`;
}
