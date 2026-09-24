1. Publication de 2026.9.5 faite.
1. J'ai modifié readme en fr et en tu pars de ceux là maintenant
1. J'ai à nouveau eu la duplication des propriétés en 4 exemplaires dans la fenêtre de propriété à la pause d'une sonde logique (dans dht22-pico2). je ne vosi qu'une sonde et si je la déplace il ni en a qu'une. Les propriétés sont toutes les 4 pour SD1. Si j'agis sur une propriété celles dupliqués disparaissent. La duplication se produit au moment de la connexion à une patte. Si je pose une sonde dans le vide pas de duplication
1.  **À trancher par Frank** : garder `CANAUX = 3` dans `dmx-pico.py` → On garde
1.  Tous les Fichiers sont à commiter et pusher, notamment  : `Todo temp.md`, `testkablix/Arduino/sonde-logique-uno/sonde-logique-uno.projix`, `testkablix/dmx-pico.projix`, `testkablix/dmx-pico.py`, `testkablix/sonde-logique-pico2.projix`, `testkablix/sonde-logique-pico.projix`, `testkablix/dht22-pico2.
1. Analyseur logique
    1. j'ai toujours le pb, si je change le déclenchement, la courbe disparait pour ne plus réapparaitre. Elle réapparait maintenant sur relancement de la simulation. Il faut indiquer que pour que le changement de déclenchement sois pris en compte il faut relancer la simulation.
    1. **Défaut repéré, NON corrigé (hors périmètre, à trancher)** : `AnalyseurJournal.nettoyerOrphelins()`, appelé à l'activation, efface TOUS les journaux du dossier temporaire qui ne sont pas à lui. Deux fenêtres VS Code avec Kablix : l'ouverture de la seconde efface le journal vivant de la première. La suite de la mesure se réécrit dans un fichier sans en-tête, et l'export perd le début. Piste : un sous-dossier par processus (`kablix-analyseur/<pid>/`), et ne balayer que ceux dont le processus est mort. Corrige ce pb.
    1. Change l'affichage des états à gauche de la courbe gras et 0 en rouge et 1 en Vert.
    1. Au lancement de la simulation, s'il y a un analyseur logique on replie aussi le panneau variables.
    1. Le texte d'aide gris sur la courbe peut passer sur 2 lignes automatiquement si la fenêtre est trop petite
    1. Il faut grossir le texte sous les courbes et le mettre en gras
    1. les annotations des décodeurs sont écrites en dur EN FRANÇAIS (`DÉPART`, `PRÉSENT`, `cadrage`, `parité`, `tronqué`, `START rép.`…) : il faut les passer par `t()` avec une clé anglaise.
    1. Change repos haut en Inverser.
    1. A quoi servent Bauds et Tolérance. 
    1. DMX :
        1. je voudrais voir ; BREAK, MAB, Start, la valeur de l'octet en hexa, STOP, PAUSE, MBB et aussi en début de trame le START code. Start matérialisé par une coloration en vert sur la durée du bit et stop par une coloration en rouge sur la durée des 2 bits (et ceci vaudra pour tous les types de décodage (i2c, uart etc.)). Ces mots ne seront pas traduits.
        1. Je voudrais pourvoir faire le déclenchement sur start code (premier 0x00).
        1. aucun signal n'est produit en sorie de Mod1. Pourquoi ? Peut on le faire ?  Si oui fait -le.
    1. Sonde-logique-uno :
        1. j'ai front descendant sur horloge mais le permier front descendant n'apparait qu'au bout de 2 ms. Si je passe à front montant ou aucun, pas de changement. Le déclenchement est ignoré. Su sonde-logique-pico ça change qqc mais le front apparait sur 1ms et pas  0.
    1. ds18b20-pico2
        1. proposer à la sélection du protocole un affichage decimal ou hexadecimal sous la courbe
    1. DHT11/dht22 :
        1. Matérialise chaque octet par un trait séparateur vertical et ça valeur en en hexa dedans
        1. Sur une deuxième ligne tu mets la valeur (50% HR et 22,0 °C et somme avec la coche)