Nouveau todo.md, j'ai archivé le précédant (todo - v2026.7.144.md).
# À faire
1. **Autoroutage (fichier de test "testkablix\16 servo + alim.svg")**
    1. Prends aussi en compte le point 3 de autoroutage qui décrit un bon tracé.
    1. les 3 flèches de `svg\voeux routage.png`** (gauche = voulu, droite = obtenu) :
        1. Flèche rouge : les fils d'une même équipotentielle alignés au maximum
        2. Flèche bleue : départ à 90° pour éviter de passer sur des broches
        3. Flèche et ellipse vertes : fils espacés de 5 px par défaut, avec un minimum de coudes
        - ⚠️ Le VRAI montage de Frank est maintenant fourni (`testkablix/16 servo + alim.projix`) : mesurer sur lui, plus sur un cas inventé.
    1. Lorsqu'on lance un autoroutage on ne rajoute pas de coude à un fil bien tracé c'est à dire : 
        - Il est droit, horizontal ou vertical et ne survole aucun composant. Il ne survole pas non plus un autre fil.
        - Il a 4 coudes ou moins est composé de segments  horizontaux ou verticaux et ne survole aucun composant. Aucun segment ne survole pas un autre segment.
        - Il ne masque ni ses broches ni celles des autres composants
    1. Aprés routage tu fais une passe d'optimisation et tu supprimes les coudes intermédiaires si 3 points sont alignés (points de connexions du cable compris) tu n'en laisse que 2. éventuellement récursif. et bien sûr sur un même cable.

# v2026.7.145
1. ✅ Afficheur : 2-points d'horloge (`colon`) rendus FONCTIONNELS et réservés au 4 chiffres. La propriété n'apparaît dans l'inspecteur QUE pour l'afficheur 4 chiffres (nouveau `PropDef.showIf` + `propVisible` ; l'inspecteur se reconstruit dès qu'un attribut déclencheur change). Active, elle MASQUE les 4 DP et affiche 2 points centraux (`#colon-4dig` ajouté au dessin `7seg-4dig.svg`, entre chiffres 2 et 3, x≈119) qui s'allument dès qu'UN dp est piloté (peu importe lequel : cathode ou anode commune) — format 88:88. Preview Chrome headless validée (12:34, 2 points rouges centrés, DP éteints).
1. ✅ Point noir « non enregistré » = APRÈS le nom, et PLUS GROS, aux deux endroits. Barre Kablix : `— MonProjet.Projix ⬤` (span `.dirty-dot`, 1.15em) au lieu de `— ● MonProjet` (point avant). Onglet du simulateur : `Kablix — Simulator — MonProjet.Projix ⬤` (le nom du projet ajouté au titre + gros glyphe U+2B24 ; le titre d'onglet est du texte brut, d'où un glyphe plus large plutôt que du CSS). `updateTitle` rappelé à chaque changement de nom (`postProjectName`).
1. ✅ Broche recouverte : seuls le ROND de sélection + la bulle passent au-dessus, plus le corps entier. `.part--pin-reachable` : z-index 40 → **4** (au-dessus des corps voisins, mais SOUS les fils z=5) — le dessin ne masque plus les autres fils. Le rond de sélection jaune de la broche visée est dessiné dans une nouvelle couche `pin-hoist-layer` (z=46, au-dessus des fils), retiré dès qu'on s'éloigne / au câblage / en simulation. La vraie pastille reste cliquable (hissage du container au-dessus des corps voisins).
1. ✅ `verify:selection` : 88 → **97 contrôles** (+2 broche recouverte : corps hissé SOUS les fils, rond de sélection au-dessus des fils puis retiré ; +5 afficheur colon : prop proposée à 4 chiffres, masquée à 1 chiffre, groupe 2-points affiché, DP masqués, 2 points allumés par un dp, DP de retour quand colon OFF). typecheck + build + verify:all OK.
