# Scenarii de démonstration

## Sommaire

1. [Publier une vidéo sur YouTube](#publier-une-vidéo-sur-youtube)
2. [Premier circuit : LED clignotante](#premier-circuit--led-clignotante)
3. [Mesurer la température](#mesurer-la-température)
4. [Demo analyseur logique](#demo-analyseur-logique)
5. [Piloter des servomoteur](#piloter-des-servomoteur)
6. [Debogage](#debogage)
7. [Appareil de mesure](#appareil-de-mesure)
8. [Importer un composant Kablix](#importer-un-composant-kablix)

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

### Ajouter des sous-titres traduisibles

1. Préparer un fichier de sous-titres français au format `.srt`, avec texte et horodatages.
2. Dans YouTube Studio, ouvrir **Contenu**, choisir la vidéo, puis ouvrir l'onglet **Sous-titres**.
3. Ajouter le français comme langue des sous-titres.
4. Cliquer sur **Importer un fichier**, puis choisir le fichier `.srt` avec horodatages.
5. Relire chaque ligne dans l'éditeur et corriger les termes techniques : Kablix, Arduino, Pico, DHT22 et noms des broches.
6. Publier la piste de sous-titres française.
7. Vérifier la vidéo sur YouTube : activer le bouton **Sous-titres**, puis choisir **Traduction automatique** dans les réglages du lecteur pour tester une langue cible.
8. Ajouter plus tard une piste révisée dans chaque langue importante depuis le même onglet, plutôt que de dépendre uniquement de la traduction automatique.

## Premier circuit : LED clignotante

1. Créer un projet avec un Arduino Uno.
2. Placer une LED et une résistance sur le plan de câblage.
3. Relier la sortie numérique D13 à la résistance, puis à l'anode de la LED. Relier la cathode au GND.
4. Montrer les broches mises en évidence lors du raccordement et la création des fils.
5. Coller un programme Arduino qui alterne `HIGH` et `LOW` sur D13 toutes les secondes.
6. Lancer la simulation et observer le clignotement de la LED.
7. Passer la LED en vue schématique, puis revenir à sa vue externe.
8. Passer la carte Uno en vue schématique et constater que les connexions sont conservées.
9. Ouvrir l'aide intégrée de Kablix pour présenter les commandes et la documentation du composant.

## Mesurer la température

1. Créer un projet avec un Raspberry Pi Pico.
2. Placer un DHT22 et le relier à l'alimentation, au GND et à une broche numérique du Pico.
3. Ajouter le programme MicroPython qui initialise le capteur et écrit température et humidité sur le port série.
4. Lancer la simulation et ouvrir le port série.
5. Modifier la température et l'humidité dans les propriétés du DHT22.
6. Montrer les nouvelles mesures affichées par le programme.
7. Ouvrir la fiche d'aide du DHT22 pour présenter ses broches, ses propriétés et un exemple de code.

## Demo analyseur logique

1. Reprendre le montage DHT22 et son programme MicroPython.
2. Ajouter des sondes logiques sur l'alimentation, la masse et le fil de données du capteur.
3. Lancer la simulation et attendre plusieurs acquisitions.
4. Ouvrir l'analyseur logique et localiser les trames échangées avec le DHT22.
5. Régler le décodage adapté au protocole du capteur.
6. Comparer les octets décodés aux valeurs de température et d'humidité affichées sur le port série.

## Piloter des servomoteur

1. Créer un montage Arduino Uno avec deux servomoteurs.
2. Relier l'alimentation et la masse de chaque servomoteur, puis leurs fils de commande à deux sorties PWM.
3. Ajouter un programme Arduino qui déplace les servomoteurs entre plusieurs angles.
4. Lancer la simulation et observer le déplacement des bras des servomoteurs.
5. Modifier les angles ou les temporisations dans le programme, puis relancer pour montrer l'effet immédiat.
6. Débrancher volontairement un fil de commande et montrer la différence de comportement.

## debogage

1. Reprendre le montage de LED et introduire une erreur simple : connecter la LED à une mauvaise broche.
2. Lancer la simulation et constater que le comportement attendu ne se produit pas.
3. Inspecter les connexions depuis la carte et suivre le fil jusqu'à la LED.
4. Afficher les broches impliquées et comparer avec le numéro défini dans le programme.
5. Corriger le câblage ou le programme.
6. Relancer la simulation pour confirmer la correction.

## appareil de mesure

1. Reprendre un montage qui produit un signal numérique, comme le clignotement de LED.
2. Ajouter les appareils de mesure disponibles sur le fil à observer.
3. Lancer la simulation et afficher la tension ou l'état logique en direct.
4. Modifier la fréquence du signal dans le programme.
5. Vérifier que les mesures et les courbes suivent la nouvelle fréquence.
6. Utiliser les mesures pour expliquer le lien entre le programme, le câblage et le signal observé.

## Importer un composant Kablix

1. Ouvrir un montage existant avec une carte et de la place sur le plan de câblage.
2. Ouvrir la bibliothèque de composants Kablix.
3. Rechercher un composant par son nom ou parcourir les catégories.
4. Ouvrir sa fiche d'aide pour vérifier ses broches, ses propriétés et son exemple de câblage.
5. Ajouter le composant au montage.
6. Le positionner, le raccorder à la carte et régler ses propriétés.
7. Adapter le programme si nécessaire.
8. Lancer la simulation pour valider son intégration.


