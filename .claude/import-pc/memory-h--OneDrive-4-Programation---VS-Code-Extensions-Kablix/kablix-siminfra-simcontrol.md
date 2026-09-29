---
name: kablix-siminfra-simcontrol
description: "Infra Kablix des contrôles de simulation (curseur/bouton) dans un composant, visibles seulement en simulation"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4399a11b-7840-485c-9d88-83dc00070382
---

Infra ajoutée v2026.7.50 (ultrason) puis réutilisée (tilt v51, flamme/gaz/son/lumière/temp…). Pattern pour rendre un composant **interactif pendant la simulation** avec un contrôle affiché sur le composant lui-même.

**Déclaration** : dans catalog.mts, `simControl: true` sur le PartDef.

**Activation** : depuis v2026.7.97, editor.mts `setLocked(locked)` pose l'attribut `simulating` sur **TOUS** les composants (les non-déclarants l'ignorent ; le 7 segments s'en sert pour assombrir ses segments éteints). Seule la classe z-index `part--sim-active` reste réservée aux `simControl`.

**Hors flux obligatoire** (v2026.7.98) : le bloc `.sim-control` est en `position: absolute; top: 100%` sous le dessin (`:host` relative, centralisé dans `sim-control-styles.mts`). S'il participait au flux, la boîte grandissait au lancement et le centre de rotation de `.part__body` (transform-origin center d'applyRotation) bougeait → tout composant tourné se décalait (115 px sur un DHT22 à 180°). Garde-fou : `verify:simshift`. Même famille que la note du buzzer v2026.7.93 : rien d'ajouté au flux d'un composant.

**Composant** : props `simulating` (Boolean) + les props d'état ; `render()` affiche le curseur/bouton seulement si `this.simulating`. À chaque changement, met à jour sa/ses prop(s) d'état et émet `new Event('input')`.

**Binding moteur** (sim.mts, dans bindInputs) : `const el = editor.elementOf(partId)`, lire `el.<prop>` en direct, `apply()` immédiat + `el.addEventListener('input', apply)` avec `inputRemovers.push(() => el.removeEventListener(...))`. Pour l'ultrason, on mute un objet sensor par référence (avr.mts relit distanceCm à chaque TRIG).

**Why:** l'item demandait des contrôles « à côté du composant en simulation », pas dans l'inspecteur. Décisions de comportement : [[kablix-capteurs-sim-decisions]].
