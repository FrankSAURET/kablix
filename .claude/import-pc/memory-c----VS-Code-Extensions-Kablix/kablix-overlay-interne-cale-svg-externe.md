---
name: kablix-overlay-interne-cale-svg-externe
description: surimpression câblage interne calée sur le SVG externe (pas le corps DOM letterboxé) sinon trop grand en hauteur
metadata: 
  node_type: memory
  type: project
  originSessionId: 3a50b9e7-84d9-4776-83f6-f55321d5e6a5
---

Surimpression du câblage interne (`.part__internal`, editor.mts `renderInternalWiring`) : caler l'overlay sur le DESSIN externe réel, PAS sur `.part__body`.

**Why:** `.part__body` (offsetWidth/offsetHeight) est plus HAUT que le dessin (span d'étiquette sous le SVG) et le dessin externe garde son ratio (letterbox). Étirer l'overlay sur le corps → interne trop grand en hauteur, décalé, même quand externe/interne se superposent parfaitement dans Inkscape (mêmes viewBox). Bug résolu v2026.7.48 après plusieurs fausses pistes (compression fixe, calage 2D — tout ça côté SVG alors que le bug était côté DOM).

**How to apply:** mesurer le SVG externe (`(el.shadowRoot ?? el).querySelector('svg')` → `width/height.baseVal.value`) + sa marge de centrage (`getBoundingClientRect` vs body) ; poser left/top/width/height en JS sur l'overlay. `.part__internal` = `top/left:0` (plus `inset:0`). Repli sur `body.offsetWidth/Height` si SVG non mesurable. Même principe que `partObstacles` qui mesure déjà le SVG externe pour l'autoroutage.

Voir [[kablix-versioning-scheme]].
