# Scenarii de démonstration

## Sommaire

- [Publier une vidéo sur YouTube](#publier-une-vidéo-sur-youtube)

Scénarios :

1. [Premier projet arduino : LED clignotante](#scénario-1--premier-projet-arduino--led-clignotante)
2. [Mesurer la température](#scénario-2--mesurer-la-température)
3. [Demo analyseur logique](#scénario-3--demo-analyseur-logique)
4. [Piloter des servomoteur](#scénario-4--piloter-des-servomoteur)
5. [debogage](#scénario-5--debogage)
6. [appareil de mesure](#scénario-6--appareil-de-mesure)
7. [Importer un composant Kablix](#scénario-7--importer-un-composant-kablix)

## Publier une vidéo sur YouTube

### Créer un compte et une chaîne

1. Ouvrir [youtube.com](https://www.youtube.com) et cliquer sur **Se connecter**.
2. Créer un compte Google, ou se connecter avec un compte existant.
3. Cliquer sur la photo de profil, puis choisir **Créer une chaîne**.
4. Choisir le nom de la chaîne, par exemple `Kablix`.
5. Ajouter une image de profil et une bannière quand elles seront prêtes.
6. Ouvrir [YouTube Studio](https://studio.youtube.com) pour gérer les vidéos de la chaîne.

### Préparer la première vidéo

1. Enregistrer la démonstration dans une définition lisible, idéalement 1080p.
2. Prévoir une introduction courte : objectif du scénario et résultat attendu.
3. Garder le curseur visible et éviter les actions trop rapides.
4. Terminer par le résultat de la simulation et l'adresse du projet Kablix.
5. Exporter la vidéo au format MP4.
6. Préparer une miniature claire, avec le montage ou le résultat visible.

### Ajouter des sous-titres traduisibles

1. Préparer un fichier de sous-titres français au format `.srt`, avec texte et horodatages.
2. Dans YouTube Studio, ouvrir **Contenu**, choisir la vidéo, puis ouvrir l'onglet **Sous-titres**.
3. Ajouter le français comme langue des sous-titres.
4. Cliquer sur **Importer un fichier**, puis choisir le fichier `.srt` avec horodatages.
5. Relire chaque ligne dans l'éditeur et corriger les termes techniques : Kablix, Arduino, Pico, DHT22 et noms des broches.
6. Publier la piste de sous-titres française.
7. Vérifier la vidéo sur YouTube : activer le bouton **Sous-titres**, puis choisir **Traduction automatique** dans les réglages du lecteur pour tester une langue cible.
8. Ajouter plus tard une piste révisée dans chaque langue importante depuis le même onglet, plutôt que de dépendre uniquement de la traduction automatique.

### Mettre la vidéo en ligne

1. Dans YouTube Studio, cliquer sur **Créer**, puis **Mettre en ligne une vidéo**.
2. Sélectionner le fichier MP4.
3. Écrire un titre explicite, par exemple `Kablix : faire clignoter une LED avec Arduino`.
4. Ajouter une description : objectif, composants utilisés, lien vers Kablix et liens utiles.
5. Importer la miniature préparée.
6. Indiquer que la vidéo n'est pas conçue pour les enfants, sauf si c'est réellement le cas.
7. Dans les paramètres supplémentaires, choisir la langue française de la vidéo.
8. Vérifier les droits, la visibilité et les éventuelles alertes avant publication.
9. Choisir **Non répertoriée** pour une relecture, puis passer à **Publique** après vérification.

## Scénario 1 : Premier projet arduino : LED clignotante

Tu travail dans V:\DemoKablix

1. Créer un projet avec un Arduino Uno.
  1. Arduino impose de mettre le fichier .ino dans un dossier du même nom. La méthode la plus simple est donc de créer un nouveau projet
  2. Clique sur arduino vscode ide
  3. Valider l'instalation de arduino cli et de c/ c++ extension
  4. ajouter un projet l'appeler "ledClignotante" (noter le nom dans les sous titres)
2. Lancer kablix en cliquant sur son icône dans la barre d'activité.
3. Valider l'installation du theme arduino puis cliquer dans le code .ino pour qu'il s'active
4. Stocker la position des boutons et leurs rôles (marquer cette partie pour la supprimer à la fin) de même que toute séquence de repérage
5. Dans kablix mettre le zoom à 120% ne plus chabger le zoom
6. Placer une arduino UNO en bas à gauche de la zone de dessin, une résistance, 3 carreaux de la grille au dessus avec sa patte gauche au dessus de la patte 13 et une LED, 3 carreaux à droite de la gauche de la résistance.
7. Relier la sortie numérique D13 à la résistance, puis la résistances à l'anode de la LED. Relier la cathode au GND.
8. Cliquer sur le bouton autoroutage.
9. Montrer les broches mises en évidence lors du raccordement et la création des fils.
10. Coller un programme Arduino qui alterne `HIGH` et `LOW` sur D13 -> fréquence 1s.
11. Sur le schéma passer en zoom 100% et mettre la carte à gauche de la vue visible et au milieu (haut/bas)
12. Lancer la simulation et observer le clignotement de la LED.
13. Passer la LED en vue schématique,
14. Passer la carte Uno en vue schématique.
15. Ouvrir l'aide de la led documentation du composant. La refermer
16. Cliquer sur le bouton réarranger les fenêtres
17. Modifier le programme en declarant une broche 14 (pinMode(14, OUTPUT);) en plus de la 13 (juste la déclarer sans l'utiliser). Changer la valeur de la résistance en 10 ohms
18. Indiquer les erreurs, les lire et les mettre dans les sous titres

## Scénario 2 : Mesurer la température

1. Tu travail dans V:\DemoKablix.
2. Ouvrir le dossier V:\DemoKablix
3. Approuver ce dossier
4. Créer un fichier [MesureTemp.py](http://MesureTemp.py)
5. Lancer kablix avec l'icone de la barre d'activité.
6. Créer un projet kablix avec un Raspberry Pi Pico.
7. zoom à 161% avec ctrl molette visible.
8. Placer un DHT22 3 carreaux au dessus de la pico pi. Le relier à l'alimentation (3,3v), au GND (entre GP17 et GP18)  et à GP22 du Pico.
9. Faire "autororoutage"
10. Ajouter le programme MicroPython qui initialise le capteur et écrit température et humidité sur le port série. temperature et humidité formatés à 1 chiffre après la virgule
11. Associer le programme [MesureTemp.py](http://MesureTemp.py)
12. Cliquer sur l'icône enregistrer et valider le nom par défaut. Legende : Le nom par défaut est celui du programme associé.
13. Afficher la console en cliquant sur le bouton  "moniteur série"
14. Lancer la simulation.
15. Valider l'installation du firmware.
16. Modifier la température et l'humidité dans les propriétés du DHT22.
17. Montrer les nouvelles mesures affichées par le programme.
18. Ouvrir la fiche d'aide du DHT22 pour présenter ses broches et ses propriétés .
19. La refermer
20. Stopper la simulation
21. Noter le time code de fin mais ne pas arrêter de filmer

## Scénario 3 : Demo analyseur logique

1. On continue sur le même.
2. Ajouter une sonde logique le fil de données du capteur. Légende : Une sonde bien posée change de couleur
3. Lancer la simulation et attendre 10 secondes.
4. Stopper la simulation.
5. Clic droit sur l'onglet analyseur et "déplacer dans une nouvelle fenêtre". Légende : "déplacer dans une nouvelle fenêtre"
6. Régler le décodage adapté au protocole du capteur. Clic sur le P  à gauche
7. Clic sur le même bouton devenu DHT montrer qu'on peut sélectionner DHT11 ou DHT22 et cocher Bits
8. Clic sur le bouton T à gauche et choisir "début de trame". Légende : "début de trame"
9. Montrer le zoom (CTRL + molette)
10. Montrer le déplacement (clic sur la courbe et glisser gauche droite
11. Zoomer et déplacer pour afficher entre 17,5ms et 22ms à peut prêt
12. Déplacer la souris vers 18 ms pour faire apparaitre la bulle "présent" (zone violette) : Légende "Présent"
13. Déplacer les curseurs M1 à 18,193 ms et M2 à 19,692ms
14. Arrêter de filmer
15. fermer vscode et keyviz.
16. Séparer les 2 vidéos et les traiter comme le scenario1

## Scénario 5 : debogage

1. on utilisera le fichier V:\DemoKablix\8Servos.projix
2. Hors enregistrement ouvrir le fichier Zoom à 100% dans kablix
3. Fermer le moniteur série maintenant et quand il s'ouvre
4. N'oublie pas keyviz
5. &gt;>> Lancer l'enregistrement
6. Lancer une simulation qui montre le fonctionnement
7. Placer un point d'arret ligne 49 en cliquant dans la gouttière légende : je place un point d'arrêt
8. Lancer la simulation. Quand il s'arrête légende : Le programme s'arrête au point d'arrêt
9. Utiliser le mode pas à pas en cliquant sur le bouton de kablix. Légende : on peut avancer le programme pas à pas
10. cliquer 9 fois sur le bouton pas à pas pour voir avancer le programme (pas trop vite)
11. Stopper la simulation
12. Légende : Kablix supporte les points d'arrêt de VsCode
13. Ajouter un point d'arrêt conditionnel expression avec l'espression ch>4 > Légende : on  ajoute un point d'arrêt conditionel qui arrêtera le programme quand ch sera supérieur à 4.
14. Lancer la simulation. Quand la simulation s'arrète, montrer ch dans les variable . Légende : arrêt de la simulation quand ch=5.
15. Retirer le point d'arrêt
16. Ajouter un point d'arrêt conditionnel nombre d'accés et mettre 3. 
17. Lancer la simulation. 
18. Montre ch. Légende : le programme s'arrête avant d'éxécuter la ligne 
19. Montrer ch. Légende ch=2
20. Retirer le point d'arrêt
21. Ajouter un point d'arrêt de journalisation ch={ch}
22. LA fenetre de sortie s'ouvre 
23. Laisser le programme se terminer
24. Fin de ce scenario

## Scénario 6 : appareil de mesure

1. on utilisera le fichier V:\DemoKablix\mesure.projix
2. Hors enregistrement ouvrir le fichier Zoom à 100% dans kablix
3. Fermer le moniteur série maintenant et quand il s'ouvre
4. &gt;>> début du scenario
5. Lancer la simulation
6. Poser un multimetre au bornes de la diode et un autre aux bornes de la résistance. LEs 2 alignés horizontalement et au dessus de résistance et led
7. Colorer les fils de noeud 2 en jaune (clic sur un fil du noeud, puis clic que le nom du noeud dans le propriété puis jaune.
8. Autoroutage
9. Lancer la simulation
10. Le pauser à un moment ou les 2 voltmètres affichent une tension
11. stopper la simulation
12. Ajouter en dessous un autre muiltimetre en ampermetre (propriété courant continue)
13. supprimer le fil de masse GND.4
14. Relier la borne rouge de lamperemetre à k de la diode et la noier à la masse.
15. Passser noeud 3 en violet
16. Lancer la simulation
17. Le pauser à un moment ou les 2 voltmètres affichent une tension
18. stopper la simulation
19. Ajouter un oscilloscope à droite de la carte pico pi et cliquer sur ajuster la vue
20. Relier le + à noeud 1 et GND à la masse du montage
21. Autoroutage
22. Lancer la simulation
23. Laisser la courbe remplire l'oscillo puis ajuster la tension  volts/div sur 2 V
24. Ajuster s/div à 500ms/div
25. Basculer le déclenchement sur front descendant
26. Bouger la fleche de déclenchement vers le bas pour la sortir de la courbe
27. stopper la simulation
28. Supprimer tous les appareils de mseure
29. rebrancher la masse de la LED à GND.4
30. Par un  clic droit et glisser, sélectionner la led et la résistance
31. CTRL+C pour copier et CTRL V pour coller 
32. Déplacer le groupe à droite de la carte pico pi/
33. Poser au dessus un  GBF
34. Relier le + à R2.1 et la masse à LED2.K
35. Lancer la simulation
36. Mettre la fréquence à 1Hz sur le GBF
37. Changer la forme, triangle puis carré
38. Changer le rapport cyclique à 20% puiis 80 %
39. stopper la simulation
40. Fin de ce scenario

## Scénario 7 : Importer un composant Kablix

1. on utilisera le fichier V:\DemoKablix\DMX\DMX.projix
2. Hors enregistrement ouvrir le fichier Zoom à 100% dans kablix
3. Fermer le moniteur série maintenant et quand il s'ouvre
4. &gt;>> début du scenario
5. Ouvrir la bibliothèque en cliquant sur Gérer les composants
6. sélectionner Grove DMX512 et Projecteur DMX PAR 38 puis télécharger.
7. Fermer l'onglet bibliothèque
8. cliquer dans la barre d'activité sur Arduino
9. Dans le panneau qui s'ouvre, cliquer sur le bouton gestionnaire de bibliothèque
10. dans le filtre de recherche tapper dmx
11. Montrer que DmxSimple est installé. Légende : on vérifie que la bibliothèque est installé et on peut dirtectement l'inclure dans le programme
12. Fermer l'ongle bibliothèque et réduire l'explorateur
13. En haut du programme montrer la ligne #include &lt;DmxSimple.h>
14. Posser en dessous de la carte arduino une carte grove DMX512 et un projecteur à sa droite
15. Relier la carte grove au projecteur et à la carte arduino masse; vcc et sig sur gpio3
16. Autoroutage
17. Recentrage
18. Lancer la simulation
19. Laisser le programme se terminer
20. stopper la simulation
21. Fin de ce scenario
22. Artêter l'enregistrement et procéder au découpage et à la mise en forme
