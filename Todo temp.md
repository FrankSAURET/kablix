1. Dans l'aide la partie avec collapse all, expand all et recherche ne doit plus sortir de la fenêtre (figée en haut)
1. Affine l'aide sur les propriété (dans le panneau propriété) d'un fil notamment en précisant ou on fait contrôle et le mouvement des segments.
1. **Deux idées à verser à [Pistes.md](Pistes.md)**, coût S chacune, prises chez Wokwi : un **mode confidentiel** pour projeter en classe (`wokwi.hidePersonalInfo` chez eux) et **voir le `.projix` en texte** (ils ouvrent leur `diagram.json` dans l'éditeur). Explique moi ça plus en détail.
1. le débogueur **AVR ne montre que les globales scalaires** corrige ça.
1. Comment s'assurer qu'on importe bien les fichiers wokwi ainsi que leur composants. La suppression de l'ANCIEN import de composant par fichier `.json` ne bloque telle pas cette fonctionnalité ?



5. ✅ **Ordre proposé** : verrou de schéma → locales AVR → linter électronique et pièges à code → analyseur logique → consommation puis batterie → thermique en appoint. Le linter est l'atout que personne d'autre ne peut avoir : Kablix voit **le code ET le circuit**, un compilateur ne voit jamais le circuit.