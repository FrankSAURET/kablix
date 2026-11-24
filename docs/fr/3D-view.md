# Vue 3D du montage (Béta)

La vue 3D montre le **montage mécanique** d'un projet : châssis, moteurs, roues, servo, aimant… Pendant la simulation, les pièces bougent avec les composants du schéma : le palonnier suit l'angle du servo, les roues tournent avec leur moteur et le robot roule sur le sol.

> Fonction **Béta**, comme les composants mécaniques qu'elle affiche. Elle ne fait que de la cinématique : ni masse, ni frottement, ni glissement des roues.

## Ouvrir la vue

Le bouton **3D** de la barre n'apparaît que si le projet `.projix` emporte un montage mécanique (fichier `system.json`, créé avec Kompix Editor). Un clic ouvre un panneau flottant, à déplacer et redimensionner comme les autres panneaux.

| Geste | Effet |
| --- | --- |
| Glisser (bouton gauche) | tourner autour du montage |
| Glisser (bouton droit) | déplacer la vue |
| Molette | zoomer |
| Survol d'une pièce | bulle : rôle, repère, défauts |

Changer de projet ferme la vue.

## Les pièces et leur rôle

Chaque pièce vient d'un **composant 3D** de la bibliothèque (paquet `.kompix`) ou d'un fichier maillé (STL, glTF) rangé dans le projet. Une pièce dont le composant n'est pas dans la bibliothèque apparaît comme une **boîte rouge**.

Le **nom** d'une pièce lui donne son rôle, sous la forme `rôle:repère`, où le repère est celui du composant dans le schéma :

| Nom | La pièce… |
| --- | --- |
| `servo:Act1` | tourne ce qui est monté sur son palonnier selon l'angle du servo `Act1` |
| `moteur:Act1` | fait tourner ce qui est monté sur son arbre selon la vitesse du moteur `Act1` |
| `roue:Act1` | tourne avec le moteur `Act1` ; posée sur le sol, elle fait rouler le châssis |
| `aimant:A1` | représente l'aimant `A1` du schéma |
| `sol` | le sol sur lequel roulent les roues |

Une pièce sans rôle (châssis, décor) suit les pièces auxquelles elle est fixée, sans être pilotée.

## Pendant la simulation

- **Servo** : la pièce montée sur le palonnier prend l'angle du servo, de 0 à 180°.
- **Moteur à courant continu** : la vitesse du moteur fait tourner son arbre ; à pleine vitesse, 200 tours par minute (motoréducteur jaune courant). Un moteur grillé s'arrête.
- **Deux roues sur le même axe** : vitesses égales, le robot va tout droit ; vitesses différentes, il tourne.
- **Capteur à effet Hall** (pièce nommée `hall:U1`) : il détecte l'aimant le plus proche du montage (pièce `aimant:A1`) quand l'écart entre les deux pièces ne dépasse pas son seuil de déclenchement (10 mm par défaut, propriété du capteur dans le schéma). Tant que la vue est ouverte, c'est la scène 3D qui décide : l'aimant de la feuille et l'aimant glissant ne comptent plus pour ce capteur. Vue fermée, il revient à la feuille.
- **Capteur à ultrasons HC-SR04** (pièce nommée `ultrason:U4`) : il mesure la distance jusqu'à la première pièce du montage devant ses transducteurs, sol compris. Cette distance règle le curseur du capteur dans le schéma, dans les bornes de sa plage (2 à 400 cm par défaut) ; sans rien devant lui, il lit sa distance maximale. Le programme la lit comme d'habitude, par TRIG et ECHO. Vue fermée, la dernière distance reste et le curseur reprend la main.

Un encart au bas de la vue signale ce qui cloche : pièce **en butée** (angle hors des bornes de sa liaison), pièce **non pilotée par la simulation** (son composant n'est pas dans le schéma), défaut du montage. À l'arrêt de la simulation, toutes les pièces reviennent à leur position de départ.

## Pièces en rouge

Une pièce en défaut s'affiche en **rouge** ; la bulle de survol dit pourquoi :

- repère absent du schéma (composant supprimé ou renommé) ;
- rôle inconnu, rôle qui ne correspond pas au composant, rôle donné deux fois ;
- composant 3D absent de la bibliothèque, fichier maillé absent du projet ;
- liaison impossible (boucle fermée, axe introuvable…).

Une pièce en défaut reste immobile en simulation ; le reste du montage fonctionne.

## Projets d'exemple

Deux projets démonstrateurs sont fournis dans le dépôt de Kablix, dossier `docs/exemples/mecanique/` :

- **bras-servo-aimant** : un servo fait tourner un aimant devant un capteur à effet Hall ; dans la vue 3D, l'aimant tourne avec le palonnier.
- **robot-deux-roues** : deux moteurs, chacun commandé par un transistor PN2222A avec sa diode de roue libre ; dans la vue 3D, le robot roule tout droit puis tourne.

Leurs pièces sont les composants mécaniques de Kompix Editor (`servo`, `aimant`, `moteur-dc`, `roue`, `chassis-2-roues`) : déposez-les dans la bibliothèque de composants (**Kablix : Ouvrir la bibliothèque de composants**) avant d'ouvrir la vue, sinon les pièces restent des boîtes rouges.
