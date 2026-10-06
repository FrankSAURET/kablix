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

## Scénario 4 : Piloter des servomoteur

1. Créer un montage Arduino Uno avec deux servomoteurs.
2. Relier l'alimentation et la masse de chaque servomoteur, puis leurs fils de commande à deux sorties PWM.
3. Ajouter un programme Arduino qui déplace les servomoteurs entre plusieurs angles.
4. Lancer la simulation et observer le déplacement des bras des servomoteurs.
5. Modifier les angles ou les temporisations dans le programme, puis relancer pour montrer l'effet immédiat.
6. Débrancher volontairement un fil de commande et montrer la différence de comportement.

## Scénario 5 : debogage

1. Reprendre le montage de LED et introduire une erreur simple : connecter la LED à une mauvaise broche.
2. Lancer la simulation et constater que le comportement attendu ne se produit pas.
3. Inspecter les connexions depuis la carte et suivre le fil jusqu'à la LED.
4. Afficher les broches impliquées et comparer avec le numéro défini dans le programme.
5. Corriger le câblage ou le programme.
6. Relancer la simulation pour confirmer la correction.

## Scénario 6 : appareil de mesure

1. Reprendre un montage qui produit un signal numérique, comme le clignotement de LED.
2. Ajouter les appareils de mesure disponibles sur le fil à observer.
3. Lancer la simulation et afficher la tension ou l'état logique en direct.
4. Modifier la fréquence du signal dans le programme.
5. Vérifier que les mesures et les courbes suivent la nouvelle fréquence.
6. Utiliser les mesures pour expliquer le lien entre le programme, le câblage et le signal observé.

## Scénario 7 : Importer un composant Kablix

1. Ouvrir un montage existant avec une carte et de la place sur le plan de câblage.
2. Ouvrir la bibliothèque de composants Kablix.
3. Rechercher un composant par son nom ou parcourir les catégories.
4. Ouvrir sa fiche d'aide pour vérifier ses broches, ses propriétés et son exemple de câblage.
5. Ajouter le composant au montage.
6. Le positionner, le raccorder à la carte et régler ses propriétés.
7. Adapter le programme si nécessaire.
8. Lancer la simulation pour valider son intégration.
