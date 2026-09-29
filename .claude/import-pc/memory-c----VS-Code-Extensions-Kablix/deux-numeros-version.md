---
name: deux-numeros-version
description: "Frank sépare version publique (calver AAAA.MM.inc, = celle DÉJÀ en ligne, levée au moment même de publier) et version interne développeur (champ buildNumber, 4e segment, ne repart jamais à zéro)."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d1965aad-ecec-452e-993e-37963fc5fa20
  modified: 2026-08-27T17:05:47.168Z
---

Décision du 21 août 2026, valable sur TOUS les projets de Frank : deux numéros de version distincts.

- **Version publique** : calver `AAAA.MM.incrément` (ex. `2026.8.102`). **Depuis le 27 août 2026**, c'est le numéro de la **dernière publication faite** : le manifeste porte la version EN LIGNE, et on l'incrémente **au moment même de publier** (calver du mois du jour). Avant cette date, il portait déjà la version suivante. L'incrément repart à 0 au changement de mois. Voir [[calver-partout]].
- **Version interne (dev)** : la publique suivie d'un 4e segment, `2026.8.102.7`, stocké dans un champ **`buildNumber`** du manifeste (le champ `version` reste semver-compatible : npm/vsce refusent 4 segments). Ce compteur démarre à 1 et **ne se remet JAMAIS à 0** — ni au changement de mois, ni au bump du public. Pas de zéro à gauche. Visible des développeurs et des visiteurs du dépôt seulement.
- **L'interface affiche les 4 segments uniquement hors production** ; un utilisateur d'une version publiée ne voit que `2026.8.102`.

**Why:** les utilisateurs ne doivent pas voir défiler 100 versions entre deux publications ; les développeurs ont besoin d'un identifiant unique par lot livré pour repérer un état exact du dépôt.

**How to apply:** à chaque lot (todo.md + commit + push), incrémenter **`buildNumber`**, pas `version`. La version publique ne bouge qu'au moment de publier — on la lève JUSTE AVANT l'envoi, en appliquant alors le calver du mois du jour (prochaine publication de Kablix : `2026.8.103`). Dans Kablix : `src/version.ts` — `versionAffichee()` (badge de l'atelier, 4 segments si `extensionMode !== Production`) et `versionPublique()` (champ `app` du manifeste .projix, fichier utilisateur). Point de départ : `2026.8.102` + `buildNumber: 1`.
