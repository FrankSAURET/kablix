---
name: kablix-boum-webp-anime
description: "Le feu des composants grillés est un WebP animé détouré (pas un MP4 — H.264 n'a pas d'alpha) ; recette de compression de l'alpha."
metadata: 
  node_type: memory
  type: project
  originSessionId: bcce41a1-d026-444c-96ff-c7465aac2143
  modified: 2026-07-31T07:52:55.511Z
---

v2026.7.228 : l'explosion des composants grillés n'est plus `Boum.svg` (348 Ko de
vectoriel) mais `src/webview/composants/utils/boum.webp` — boucle de 10 images,
128 px, 21,3 Ko, inlinée en data URI (`loader: { '.webp': 'dataurl' }` dans
`esbuild.js` **et dans les 36 scripts** qui bundlent des composants, sinon
`verify:all` ne compile plus).

**MP4 écarté** : H.264 n'a pas de canal alpha (celui de HEVC est réservé à
Safari) — le fond serait noir et opaque. WebP animé : vrai alpha, simple `<img>`,
et pas un décodeur vidéo par composant grillé.

**Trois pièges, tous résolus dans `scripts/make-boum-webp.py`** (régénère depuis
`Archives/images/boum.gif`) :
1. Le feu est un dessin ADDITIF sur fond noir : sa luminosité EST son opacité.
   `alpha = max(R,V,B)` + couleur dé-prémultipliée. Un « noir → transparent »
   laisserait une frange noire sur tout le halo.
2. Un WebP animé n'a qu'UN compteur de boucle : impossible de jouer une intro
   puis de boucler. D'où feu établi seul (images 8→17) rendu cyclique par fondu
   croisé circulaire, le jaillissement restant en CSS (`boum-pop`).
3. **L'alpha d'un WebP est stocké SANS perte** : le tramage du GIF y coûtait
   45 Ko à lui seul, et `quality` n'y change rien. Ce qui marche : flou 1 px +
   gamma 1,8 (resserre le halo diffus) + 14 paliers → 21 Ko. Les paliers SEULS
   font apparaître des anneaux dans le halo ; un post-flou pour les masquer
   annule tout le gain.

Aperçu du rendu : `node scripts/_view-boum.mjs` (4 composants grillés, fond clair
et sombre). Contrôles dans `scripts/verify-boum.mjs`. Voir aussi
[[kablix-webview-geometry-headless]] et [[kablix-fork-wokwi-elements]].
