# Change Log

Format Calver : **ANNÉE.MOIS.incrément**, l'incrément repartant à 0 chaque mois.

[Voir en ligne](https://github.com/FrankSAURET/kablix/blob/main/CHANGELOG.md) · [View online](https://github.com/FrankSAURET/kablix/blob/main/CHANGELOG.md)

## 2026.10.1 (prochaine publication)

### Nouveauté

**Succès (badges)**

- **16 badges** dans un panneau 🏅 (entrée « Succès » du menu hamburger, qui ne liste que les badges obtenus), en deux familles. *Preuve de maîtrise* : Loi d'Ohm, Niveau logique (capteur 5 V lu par une carte 3,3 V à travers un pont diviseur), Bus maîtrisé (trame I²C décodée), Sans attendre (pas de `delay()`), Interruption, Économe (moins de 1 mA), Le bon calibre (moteur par transistor), Trois protocoles. *Effort et processus* : Premier nuage de fumée, Deux fois vaut mieux, Chercheur de panne, Au pas à pas, À l'instrument, Persévérant, Au propre, Documenté. Chacun dit ce qu'il atteste ; une annonce s'affiche à l'obtention, puis disparaît au bout de 5 secondes ou au premier clic.
- **Jamais pour du temps passé** : un badge se décerne sur un fait mesuré dans la simulation. Ils suivent l'élève d'un projet à l'autre.

**Linter électronique**

- **Le code est relu face au schéma** à chaque ▶ : `analogWrite` sur une broche sans PWM, broche lue sans `pinMode`, broche lue ou pilotée alors que rien n'y est branché, composant câblé sur une broche que le code n'utilise jamais. Fonctionne en Arduino et en MicroPython. Le constat entoure en rouge la carte (ou le composant), avec une étiquette qui explique, et la console cite la ligne. La simulation n'est jamais bloquée. En cas de doute (numéro de broche calculé, bibliothèque tierce, shield, platine), Kablix se tait.
- **Réglage `kablix.lintCode`** : coupe la relecture (activée par défaut).

- **Broche en l'air visible** : une entrée lue sans rien de branché oscille au hasard pendant la simulation, comme une vraie broche flottante. L'élève voit le défaut au lieu de le lire.
- **Boucle bloquante signalée** : `while (digitalRead(2) == LOW);` (ou `while b.value() == 0: pass`) dont la broche reste 3 secondes simulées au niveau qui retient la boucle, sans rien d'autre qui bouge, entoure la carte en rouge et renvoie vers les interruptions. Seules les boucles à corps vide sont examinées.


**Résistances**

- **La résistance rougit avant de griller** : dès que la puissance dissipée dépasse la moitié de ce que son boîtier admet, le corps se colore et se pare d'un halo, de plus en plus fort jusqu'à la limite. Le seuil suit la propriété puissance (une ¼ W à 0,2 W est rouge, une 10 W dans le même montage reste froide). Indicateur « puissance dissipée / admissible », pas une thermique détaillée.

### Modification

**Linter électronique**

- Une broche analogique est nommée par son numéro puis son nom : « broche 14 (A0) » au lieu de « broche A0 » seul (« 54 (A0) » sur un Mega).

### Correction

**Linter électronique**

- **La broche en cause est signalée** : une pastille rouge pulse sur la broche de la carte visée par le constat (y compris la boucle bloquante), même quand le cadre rouge entoure le composant câblé.

**Simulation**

- Un petit pavé jaune vide n'apparaît plus au démarrage (zone d'annonce des badges).
- L'explication d'un défaut ne recouvre plus la broche en cause : elle se replace une fois le schéma affiché.

**Compilation**

- Le résumé de la première erreur du compilateur affiche le bon nom de fichier quel que soit le style du chemin (Windows ou Linux).

## 2026.10.0 (3 octobre 2026)

### Nouveauté

**Piles, batteries et autonomie**

- **Piles dans la bibliothèque** : 4 × AA, 9 V, CR2032 et LiPo 1S, à installer depuis **⚙ Gérer les composants**. Capacité réglable, tension qui baisse avec la charge (courbe au traceur). Elles ont leur propre catégorie dans la palette, **Piles / Batteries**, avec le Power bank. Elles sont validées : plus de statut expérimental.
- **Le Power bank a une capacité et se vide** : il alimente la carte par 5V, VSYS ou VBUS, sa jauge suit la charge, le traceur montre sa charge et son autonomie. Vide, il éteint la carte et la barre d'état dit au bout de combien de temps. Sa capacité par défaut est de 5000 mAh (une vraie batterie externe Li-ion 5 V / 2,1 A), et il se vide un peu plus vite que le courant délivré ne le laisse penser : la conversion de tension a une perte.
- **Le robot araignée a sa propre batterie** : elle se vide de sa consommation (Pico W, PCA9685, servos), comme un Power bank. Rien à câbler, elle n'alimente que le robot.
- **Alerte de charge basse** : sous 15 % de charge restante, le Power bank ou la batterie du robot araignée le signale dans la barre d'état.
- **Une alimentation inadaptée est refusée** : hors de la plage de l'entrée (VIN 6,2 à 20 V, 5V 4,5 à 5,5 V, VSYS et VBUS 1,8 à 5,5 V), la carte ne démarre pas et la barre d'état dit pourquoi. Une CR2032 ne fait pas tourner une Uno, une LiPo ne passe pas le régulateur de VIN. Une pile qui s'use sous le seuil éteint la carte en route.
- **Une pile 9 V grille la Pico** : VSYS et VBUS n'ont pas de régulateur protecteur, contrairement à VIN et 5V. Une pile 9 V dessus détruit la carte pour de bon au lieu de simplement refuser de démarrer.
- **Pile ou batterie en court-circuit : elle explose, et une mise en garde s'ouvre** : la simulation s'arrête, la pile (ou le Power bank) explose sur le montage, et une page de mise en garde sur les piles et batteries recouvre l'écran à chaque fois ; elle ne se ferme qu'après 15 secondes de lecture.

**Consommation et veille**

- **Consommation de la carte au traceur** : deux courbes à chaque lancement, sans une ligne de code : le courant de la carte (mA) et la charge consommée (mAh). C'est la carte réelle qui est mesurée : une Uno endormie garde 31 mA, une Pico en `lightsleep()` descend à 1,3 mA.
- **La mise en veille d'un µc est prise en compte** : `sleep_cpu()` ou *LowPower* sur Arduino (power-down, power-save, standby), `machine.lightsleep()` sur Pico. `delay()` et `time.sleep()` laissent la puce éveillée, comme en vrai.
- **Tests `consommation-uno` et `consommation-pico**` : une carte qui alterne veille et réveil, sur une batterie d'1 mAh.

**Traceur**

- **Fenêtre et vitesse libres** : la fenêtre se tape en heures, minutes, secondes (`1h30`), la vitesse de simulation se tape en % (jusqu'à 10 000 %), et les graduations de temps du traceur suivent le temps simulé du montage, accélération comprise. De quoi suivre une pile qui se vide.

**Simulation**

- **Simulation sans code** : ▶ lance le montage même sans fichier de code ni éditeur ouvert. Le microcontrôleur tourne à vide, le reste (alimentations, piles, multimètre, composants passifs) se simule. Sans carte posée sur le schéma, la simulation démarre aussi.

**Composants**

- **Trois MOSFET « niveau logique »** : IRL540N (100 V, 0,044 Ω, 30 A), IRLZ34N (55 V, 0,035 Ω, 30 A) et IRL1004 (40 V, 0,0065 Ω, 130 A), en TO-220, Vgs(th) maximal 2 V. Ils s'ouvrent sous les 3,3 V d'une sortie de Pico, là où l'IRF530 (3,5 V) reste bloqué.

### Modification

**Transistors**

- **Vgs(th) max et puissance maximale** : la liste du sélecteur et la ligne du modèle posé donnent la tension de seuil de grille maximale (MOSFET) et la puissance maximale dissipée (tous), avec une propriété « Puissance max » à régler. Le BS170 passe à 3 V et l'IRF530 à 4 V, valeurs maximales de leurs fiches.

**Gestionnaire de composants**

- **« Béta » remplace « expérimental »** sur la pastille des composants pas encore validés.

**Chargement**

- **L'atelier et l'analyseur logique s'ouvrent plus légers** : seules les traductions de la langue de VS Code sont chargées, et non plus celles des quatre langues.

### Correction

**Affichage et analyseur logique**

- **Symétrie horizontale** : les écritures gravées sur un composant (noms de broches, touches…) restaient inversées après un retournement, même quand le composant lui-même redevenait lisible.
- **Analyseur logique : la bulle de survol revient** : un décodage replié (`0xF0` pour `0xF0 SEARCH ROM`, `0x48` pour `adr 0x48 W`) ou sans place pour s'écrire donne son texte entier au survol, pour tous les protocoles.

**Pico 2**

- **Un programme chargé en mémoire vive ne plante plus la Pico 2**, programme de démonstration compris.

## 2026.9.7 (29 septembre 2026)

### Nouveauté

- **Kablix parle espagnol et chinois simplifié** : interface, messages, réglages, aide des composants, guide d'utilisation et README. La langue suit celle de VS Code. Les composants de la bibliothèque sont traduits aussi : mettez-les à jour depuis **⚙ Gérer les composants**.
- **Signal des composants au démarrage** : une notification prévient quand un composant installé a une version plus récente dans le dépôt, ou quand de nouveaux composants y sont apparus.
- **Le projecteur DMX PAR 38 lit son quatrième canal**.
- **Bouton Analyseur dans la barre de simulation** : il rouvre l'onglet de l'analyseur logique après une fermeture, avec sa dernière mesure. Il n'apparaît que si une pince est posée sur le schéma et que l'onglet est fermé.
- **Tensions dans la marge de l'analyseur logique** : face aux deux niveaux de chaque courbe.
- **Marqueurs M1 et M2 dans l'analyseur logique** : ils attendent à gauche de la barre de temps. Glissés sur les courbes, ils se collent au front le plus proche et tracent un trait de leur couleur. Posés tous les deux, une flèche donne la durée qui les sépare.
- **Bouton de rappel des marqueurs M1 et M2** : une flèche tout à gauche de leur marge les ramène à leur place de départ, quand un zoom les a fait sortir de la vue.
- **Marqueurs de fenêtre F1 et F2 dans l'analyseur logique** : Sous M1 et M2, avec leur flèche de rappel. Posés, ils tracent entre eux un cadre vide qui couvre toutes les courbes. Le cadre se règle par rapport au déclenchement : ⏮ ⏭ le posent au même endroit de la trame atteinte, même après avoir fait glisser la courbe. On vérifie ainsi le même endroit d'une trame à l'autre.
- **Les commandes 1-Wire ont leur couleur dans l'analyseur logique** : la commande ROM (`MATCH ROM`, `SKIP ROM`…) et la commande de fonction (`CONVERT T`, `READ SCRATCHPAD`…) s'écrivent sur fond rose, à part des octets d'adresse et de données, en bleu.
- **Bulles d'aide dans la marge de l'analyseur logique** : la pastille, les boutons T et P et les marqueurs disent ce qu'ils font au survol. T et P disent aussi leur réglage.
- **Courbes de l'analyseur en image SVG** : le menu ☰ de l'onglet les copie au presse-papier en image, à coller dans Word comme dans Inkscape (« Copie SVG »), ou les enregistre dans un fichier (« Exporter SVG »), au zoom affiché. M1 et M2 posés, l'image va de l'un à l'autre.
- **Flèches ⏮ ⏭ dans l'analyseur logique** : elles amènent le début de la trame décodée précédente ou suivante au bord gauche, sans changer le zoom. Les trames répétées à l'identique sont sautées.
- **Profondeur de capture réglable dans l'analyseur logique** : 5 k, 15 k, 60 k, 250 k ou 1 M fronts par voie, avec la durée couverte estimée à côté de chaque choix. Le projet garde le réglage.
- **Bouton ↻ Relancer la capture dans l'analyseur logique** : il efface la mesure et repart à zéro sans arrêter la simulation, déclenchement réarmé.
- **Déclenchement sur début de trame pour tous les protocoles** : sur une voie décodée, le menu T propose `Frame start`.
- **Octets en hexadécimal ou en décimal** : le panneau de décodage de l'analyseur propose le choix, pour tous les protocoles. L'hexadécimal reste le défaut.
- **Affichage binaire dans l'analyseur logique** : la case `Bits` du panneau de décodage écrit chaque bit (`0` ou `1`) sous le créneau qui le porte, séparé du suivant par un trait pointillé posé sur les fronts. Elle vaut pour tous les protocoles.
- **Le décodage DMX512 détaille chaque trame** : `BREAK`, `MAB`, `START code`, puis pour chaque canal son `Start`, sa valeur en hexadécimal (`c1=0xC8`) et son `STOP`, avec les `PAUSE` et le `MBB` entre les créneaux.

### Modification

- **Grove DMX512 (composant 2026.9.2) : une pince posée sur `−` montre le signal inversé**. Cocher « Inverser » sur cette voie la remet à l'endroit pour la décoder.
- **Grove DMX512 (composant 2026.9.3) : les voies `+` et `−` de l'analyseur affichent `3,7 V` et `1,1 V**`, les tensions de sortie de l'émetteur de ligne SN75176A. La voie `SIG` garde celles de la carte.
- **L'export CSV de l'analyseur passe dans le menu ☰ de l'onglet**, à côté de la copie et de l'export SVG. M1 et M2 posés, il ne garde que la mesure comprise entre eux, encadrée par le niveau de chaque voie à M1 et à M2.
- **L'export CSV donne une colonne par voie**, toutes les pinces comprises, lues comme à l'écran. Chaque front tient sur deux lignes au même instant : un tableur trace des créneaux droits.
- **Le panneau Variables se replie au lancement quand un analyseur logique s'ouvre**, se déplie à chaque pause du débogage, et se rouvre à l'arrêt.
- **« Repos haut » devient « Inverser »** dans le menu d'une voie de l'analyseur.
- **Capture pleine : l'analyseur dit la durée gardée**, avec la profondeur, et non plus l'heure de la simulation. Une capture relancée plus tard annonce la même durée.
- **Analyseur logique : sans déclenchement, un décodage pose la vue sur la première trame.** Elle n'en bouge plus pendant la capture, au lieu de courir après la fin d'un bus qui parle sans arrêt (DS18B20 lu en boucle). Rien n'est enregistré dans le projet : régler un déclenchement reprend la main.
- **L'infobulle « Échantillonnage » précise** qu'il ne change pas la durée de la capture.
- **Les niveaux 0 et 1 à gauche des courbes de l'analyseur logique sont en gras**, 0 en rouge et 1 en vert (le vert des départs de décodage).
- **Le message gris sur les courbes passe à la ligne** quand l'onglet est étroit.
- **Le texte sous les courbes de l'analyseur est plus grand et en gras.**
- **Le départ est en vert et l'arrêt en rouge sous les courbes de l'analyseur**, pour tous les protocoles. Les données passent au bleu et les erreurs au magenta.
- **Un caractère UART se découpe comme sur le fil** : `Start`, valeur, `STOP`. Une erreur de parité ou de cadrage se pose sur le bit fautif, et la valeur reste affichée.
- **Le décodage DHT11/DHT22 s'écrit sur deux lignes** : les cinq octets, chacun dans sa case, puis l'humidité, la température et la somme cochée sous leurs octets. La température du DHT11 s'écrit au dixième (`22,0 °C`).
- **Les bits 1-Wire de l'analyseur vont d'un créneau au suivant** : avec la case `Bits`, chaque bit occupe tout son slot, jusqu'au creux du bit suivant, sans trou entre deux bits. Le dernier bit d'une salve garde les 60 µs de la norme.
- **Simulation du Pico : moteur rp2040js 1.4.0.** Les horloges du processeur et des périphériques suivent les réglages du programme.

### Correction

- **L'icône des fichiers `.projix` n'a plus de fond vert** dans l'Explorateur Windows. Une icône déjà installée est remplacée au lancement suivant de Kablix.
- **Les variables Arduino sont de nouveau visibles en pause de débogage.**
- **Le pas à pas Arduino ne saute plus de lignes.** Au début de `loop()`, tout le corps de la fonction passait d'un coup. Une pause pendant un `delay()` montre la ligne qui l'appelle.
- **Pico : `machine.freq()` ne dérègle plus la PWM.** Un servomoteur réglé après un changement de fréquence prenait une mauvaise position.
- **L'UART du Pico tourne à la vitesse réglée par le programme MicroPython.** Les octets partaient plus de deux fois trop vite.
- **Pico 2 : les créneaux 1-Wire gardent leur durée.** Pendant l'écriture d'un octet, certains « 1 » du programme duraient 22 à 50 µs au lieu de 10 : le capteur les lisait « 0 ». La capture de l'analyseur logique montre maintenant les mêmes créneaux que sur le Pico 1.
- **Les propriétés d'une sonde logique ne s'affichent plus en plusieurs exemplaires** quand on la pose sur une patte. Même correction pour l'interrupteur 3V3/5V du Grove Shield et les bascules dessinées sur les composants.
- **Plusieurs pinces sur un même signal tracent toutes.** Sur une carte DMX, les pinces posées sur `SIG`, `+` et `−` remontent à la même broche : seule la dernière montrait la trame, les autres restaient plates.
- **Pico : une trame DMX s'affiche avec ses vrais canaux.** Sous plusieurs pinces reliées à la même broche, chaque octet était compté plusieurs fois : 4 canaux devenaient 17, dans le désordre.
- **Le DMX de la bibliothèque DmxSimple se décode trame par trame.** Son `BREAK`, plus court que la norme, n'était pas reconnu et toutes les trames se fondaient en une seule. Il est lu et l'étiquette donne sa durée (`BREAK 76,6 µs < 88 µs`).
- **Le DMX d'un Pico programmé sans bibliothèque se décode canal par canal.** L'analyseur n'y voyait que des pauses et des erreurs de cadrage.
- **Le décodage 1-Wire nomme la réponse du capteur au `RESET` (`PRÉSENT`).** Elle s'affichait en erreur « 1 bits » juste après le `RESET`.
- **Le décodage 1-Wire lit juste la réponse du DS18B20.** Ses bits à 0 passaient pour des 1 : la température lue était fausse et le CRC en erreur.
- **Le décodage 1-Wire nomme les commandes après `SKIP ROM` ou `MATCH ROM**` : `CONVERT T`, `READ SCRATCHPAD`…
- **Le décodage 1-Wire ne change plus quand on fait glisser la courbe.** Dès que le début d'une transaction sortait à gauche, les octets devenaient faux et `READ SCRATCHPAD` disparaissait.
- **Changer le déclenchement de l'analyseur ne fait plus disparaître la courbe**.
- **La vue de l'analyseur ne saute plus pendant la capture** quand son onglet s'ouvre avec la simulation : elle se pose sur le déclenchement et y reste.
- **Le déclenchement tombe sur un front affiché** quand l'analyseur échantillonne. Il était posé sur le front réel, parfois plusieurs millisecondes avant le front dessiné, et « montant » ou « descendant » semblait sans effet.
- **Déplacer l'onglet de l'analyseur vers une autre fenêtre (un second écran) ne fait plus disparaître les courbes.**
- **L'analyseur garde son zoom** quand on déplace son onglet ou qu'on change un réglage (déclenchement, protocole…).
- **L'analyseur logique ne se fige plus** sur une longue capture décodée vue en entier : zoom, marqueurs et déclenchement restaient bloqués jusqu'à la réouverture de l'onglet.
- **L'instant lu au curseur de l'analyseur reste lisible sur la barre de temps**.
- **La barre de temps de l'analyseur suit le zoom.** Zoomé loin dans une longue capture, toutes les graduations s'écrivaient `12,346 s`. Elles passent en millisecondes ou en microsecondes ; la première donne l'instant entier, les suivantes leur écart (`+50 µs`). L'instant lu au réticule garde tous ses chiffres utiles.
- **Rouvrir un projet avec l'analyseur ouvert ne double plus sa capture.**
- **Ouvrir une deuxième fenêtre de VS Code n'efface plus la mesure de l'analyseur logique en cours dans la première.** L'export CSV restait incomplet.

## 2026.9.5 (24 septembre 2026)

### Nouveauté

- **Un analyseur logique.** Une nouvelle **sonde logique** — un petit grip-fil — se **pose** sur la pastille d'une broche, éventuellement sans aucun fil, ou s'y relie par un cordon. L'analyseur **décode l'I²C (TWI), le SPI, l'UART, le 1-Wire, les capteurs DHT11/DHT22 et le DMX512** — octets et repères de trame s'écrivent sous les créneaux. L'analyseur logique est pour l'instant **expérimental** : son interface et ses décodages peuvent encore changer.
- **La mesure de l'analyseur logique s'exporte en CSV.** Le bouton « Export CSV » de l'onglet enregistre tous les fronts mesurés depuis le lancement : temps, voie, broche, nom et niveau. Il marche aussi en pleine simulation.
- **Une ligne « Paramètres » dans le menu hamburger** : elle ouvre les réglages de Kablix.
- **L'aide a un sommaire** et **un moteur de recherche**. **Les sections de l'aide se replient**.
- **La bibliothèque et le panneau Propriétés/Variables se replient** par la petite flèche de leur bord.
- **La bibliothèque se replie au démarrage de la simulation** et se rouvre à l'arrêt. Un réglage désactive ce comportement.
- **Un générateur BF.** Il sort un **sinus**, un **triangle** ou un **carré**, de **1 Hz à 1 MHz**, jusqu'à **10 V** de crête, avec **décalage continu** de −5 à +5 V et **rapport cyclique** de 0 à 100 %. Le rapport cyclique déforme le carré **et** le triangle, jusqu'à la dent de scie.
- **La platine d'essai montre ses liaisons internes.** Le bouton « K » d'une platine dévoile les lamelles de cuivre cachées sous les trous.
- **Un capteur de température DS18B20**, à télécharger dans la bibliothèque de composants, en deux versions : le boîtier TO-92 et la sonde étanche sur câble. Un curseur règle la température de −55 à +125 °C, et le capteur répond pour de bon en 1-Wire : plusieurs capteurs se branchent sur le même fil, chacun avec son adresse.
- **La valeur d'un curseur de simulation se tape au clavier.** Un double-clic sur le curseur, ou sur le nombre affiché à côté, ouvre un champ : le point et la virgule y valent pareil. Un curseur de 44 px ne permettait pas de viser 25,5 °C sur une course de 180 degrés.
- **L'analyseur logique se parcourt aux flèches.** Les boutons ◀ ▶ de la barre, ou les touches ← →, reculent ou avancent d'une demi-fenêtre sans changer le zoom.
- **Une voie masquée de l'analyseur se réaffiche.** Un bouton de la barre, avec le nombre de voies masquées, les fait toutes revenir.

### Modification

- **Le gestionnaire de composants montre les images en entier**.
- **Kablix retrouve l'arduino-cli installé par l'extension Arduino VS Code IDE**.
- **Une commande « Kablix : Détecter à nouveau arduino-cli »** relance la recherche sans redémarrer l'éditeur. Quand rien n'est trouvé, le message liste les emplacements consultés.
- **Le panneau Variables montre les tableaux, les structures et les pointeurs** en C/Arduino. Chaque case et chaque champ a sa ligne, nommée comme on l'écrit (`notes[0]`, `p1.x`). Seules les variables simples apparaissaient jusqu'ici.
- **Le panneau Variables montre aussi les variables `static` déclarées dans une fonction**, sous le nom `loop::memo`. Elles n'apparaissaient pas du tout auparavant.
- **Les variables qu'on ne peut pas suivre sont nommées** sous le panneau, avec la raison et le remède, au lieu d'être simplement absentes. Elles s'écrivent maintenant **une par ligne**, la variable d'abord et sa fonction ensuite (`valeurCtn -> loop()`), suivies du remède en clair.
- **Un segment de fil se déplace au glisser**, perpendiculairement à sa direction. Les segments voisins suivent, le reste du tracé ne bouge pas.
- **L'aide d'un fil sélectionné détaille le glissement d'un segment** et ce que Ctrl y change.
- **Le tableau des composants du README suit les catégories de la palette**.
- **La liste des composants téléchargeables est illustrée**.
- **Le projecteur DMX PAR 38 montre son bloc de LED éteint.** La face était transparente et ses LED presque invisibles ; elle reçoit un fond blanc grisé et les LED s'y dessinent en gris clair bombé. Allumées, elles prennent toujours la couleur reçue.
- **Une voie de l'analyseur posée sur une broche Arduino numérotée s'appelle « Broche 9 »**, et non plus « 9 ».
- **Le choix de couleur des voies de l'analyseur est retiré.** Chaque voie garde la couleur de sa pince.
- **L'analyseur logique est en français** : barre d'outils, menus des voies, messages et noms de voie. La sonde logique et ses couleurs aussi.
- **Les annotations des décodeurs suivent la langue de VS Code.** Elles restaient en français pour tout le monde. Les mesures du DHT22 s'écrivent avec une virgule en français (`56,7 %HR`).

### Correction

- **Les composants de la bibliothèque officielle ne demandent plus votre autorisation.** La question « ce composant exécute du code d'une source distante » était posée pour les composants publiés avec Kablix, au même titre que ceux d'un dépôt inconnu. Elle reste posée, elle, pour toute autre source.
- **Un composant posé depuis la bibliothèque en pose un seul.** Un clic un peu vif, ou deux clics de suite, en déposait parfois deux ou trois exactement l'un sur l'autre : on n'en voyait qu'un, mais les propriétés affichées étaient celles d'un autre. Deux composants posés sans bouger la souris se rangent maintenant en escalier.
- **Une carte attaquée au-dessus de sa tension d'entrée grille**, explosion et explication à l'appui : 3,6 V pour un Pico, dont les GPIO ne tolèrent pas le 5 V, 5,5 V pour un Arduino. Le sommet **et** le creux du signal comptent. Un pont diviseur, lui, ne grille rien — c'est justement la bonne façon d'attaquer un Pico en 5 V.
- **Un projet rouvert utilise la version installée de ses composants de bibliothèque**, et non plus la copie, parfois ancienne, enregistrée avec lui.

## 2026.9.4 (13 septembre 2026)

### Nouveauté

- **Deux résistances de puissance.** Un **boîtier aluminium à ailettes** et un **boîtier céramique**, 10 W chacun, se choisissent dans les propriétés de la résistance. À cette taille la valeur est **écrite** dessus, puissance en tête : `10W 4R7`.
- **Une résistance peut partir en fumée.** Nouvelle propriété **puissance** — ¼ W pour la petite, 10 W pour les deux boîtiers. Au-delà, elle explose et l'étiquette dit quoi corriger.

### Modification

- **Un double-clic sur une étiquette la rouvre en écriture**, sans passer par la barre d'outils.
- **Les étiquettes se sélectionnent au rectangle**, comme les composants, et tout ce qui est pris se déplace ensemble.
- **Un clic droit quitte l'outil étiquette.**
- **Les schémas internes de cinq composants corigés** : photodiode, LED, les trois afficheurs 7 segments, la barre de LED et le potentiomètre à glissière.

### Correction

- **Copier depuis une étiquette de texte fonctionne.** Ctrl+C copie la sélection, ou toute la ligne si rien n'est sélectionné ; Ctrl+X copie et efface.
- **Une résistance qui grille montre son explosion**, dimensionnée selon le boîtier.

## 2026.9.3 (10 septembre 2026)

### Modification

- **Le montage entier se mesure enfin au voltmètre.** Plusieurs composants existaient à l'écran sans exister dans le circuit : posez un voltmètre dessus, il lisait zéro. C'est fini pour le **potentiomètre** (les trois modèles : rotatif, glissière, ajustable — un pont de 10 kΩ sur 5 V donne 0 V, 1,25 V, 2,5 V, 5 V selon la position), le **ventilateur** et le **moteur à courant continu**. Un même modèle sert désormais la mesure et l'animation : la vitesse affichée et la tension mesurée ne peuvent plus se contredire.
- **Un transistor passant n'est plus un fil.** Ce qui reste à ses bornes dépend maintenant de sa nature : **chute fixe** pour un bipolaire saturé (nouvelle propriété **Vce(sat)**, de 0,2 à 0,7 V selon la référence, 0,9 V pour un darlington), **résistance** pour un canal MOSFET ouvert (**Rds(on)**, la chute suit donc le courant). Les 26 références du catalogue portent leur valeur de fiche technique.
- **La grille d'un MOSFET se juge en tension, plus en niveau logique** (nouvelle propriété **Vgs(th)**). Un pont diviseur ou une sortie 3,3 V donnent un « 1 » logique franc **sans** ouvrir un MOSFET de puissance — le piège que Kablix ignorait. Un IRF530 dont la grille est sur le curseur d'un potentiomètre s'allume désormais au bon endroit de la course, et pas avant.
- **Un variateur PWM à transistor donne enfin ses vraies mesures.** Jusqu'ici le rapport cyclique se perdait dès qu'un transistor s'interposait entre la broche et la charge — c'est-à-dire dans le seul montage réaliste. Le voltmètre lit maintenant la **valeur moyenne** exacte (0 %, 25 %, 50 %, 75 %, 100 % → 0 V, 1,11 V, 2,22 V, 3,33 V, 4,44 V), l'ampèremètre ne perd plus la mesure, et l'oscilloscope garde toute la hauteur du créneau : le multimètre moyenne, l'oscilloscope montre. Le **hachage d'un PNP par le haut** est traité aussi, commande active basse comprise.
- **Une carte n'a pas un seul rail** : un Pico donne 3,3 V sur 3V3 et 5 V sur VBUS, chaque broche d'alimentation porte la sienne. Et la **masse vaut zéro** — elle flottait de quelques millivolts, ce qui produisait des Vce négatifs et des tensions fausses un peu partout. Les appareils lisent maintenant juste : 5,000 V sur une alimentation de 5 V, 0,200 V de Vce sur un bipolaire, 3,300 V sur un rail 3,3 V.
- **Un moteur qui cale le dit.** Le seuil de démarrage descend à 15 % de la tension nominale, et sous ce seuil le moteur s'arrête en annonçant pourquoi — sauf en commande hachée, où passer par le bas de l'échelle est normal. Surtout, **le message accuse la bonne pièce** : un transistor qui sature (il ne transmet que gain × courant de base) n'est plus rangé avec « l'alimentation ne fournit pas assez ». Le moteur continue de tourner au ralenti sur ce courant plafonné, comme sur un vrai banc.
- **Un défaut corrigé s'efface de l'écran.** Un cadre rouge posé sur un moteur y restait à vie, même après que la cause avait disparu : remontez le bouton de l'alimentation, le message part maintenant avec le défaut. Un composant grillé, lui, garde bien son cadre.
- **Écrire sur la feuille : le mode texte.** Nouveau bouton « **T** » dans la barre : un clic sur la feuille pose une **étiquette** libre — titre de montage, remarque, nom d'une zone —, sur plusieurs lignes, déplaçable comme un composant, avec un curseur en T pour rappeler le mode actif. Une étiquette sélectionnée se règle dans l'inspecteur : **couleur du texte**, **couleur du fond**, **transparence du fond** (jusqu'à zéro, le texte reste seul sur la feuille), **taille** et **police**. Copier / coller acceptés, le texte arrivant toujours en clair. La simulation les ignore ; l'export SVG les emporte, réglages compris.
- **Ctrl + clic sur le bouton d'autoroutage = retracé complet** : les coudes sont effacés et le tracé repart de zéro. Le clic simple continue de **préserver** un fil déjà propre.
- **Une étiquette libre sur le multimètre et l'oscilloscope** (comme l'adhésif qu'on colle sur un appareil de banc) : elle s'affiche seule, sans passer par le menu Noms, et **reste visible pendant la simulation** — c'est justement là qu'on lit les mesures.
- **Le multimètre devient vert en ampèremètre** (bleu en voltmètre) : le calibre se lit à la couleur de la coque, sans regarder l'écran ni le levier.
- **Le bandeau de nom se cale sur le dessin, plus sur sa boîte** : il ne flotte plus au-dessus du vide sur un ventilateur ou une carte Uno, et il prend la largeur de son texte au lieu de celle du composant.
- **Un projet rouvert ne vire plus au gris** : l'atelier lu sur le disque n'est plus recouvert par un état plus ancien resté en mémoire.
- **Un projet n'emporte plus la bibliothèque entière** : un `.projix` ne grave que les composants qu'il pose. Les fichiers de mesure passent ainsi de 94 ko à 4 ko, à contenu identique.

## 2026.9.2 (6 septembre 2026)

- **Le poster de brochage de l'Uno retouché** : il devient cohérent avec ceux des autres cartes Arduino (source Arduino).
- **L'ouverture intempestive de la fenêtre de sortie** à l'ouverture d'une carte Arduino est corrigée (nécessite une mise à jour de l'extension Arduino pour VS Code).

## 2026.9.1 (3 septembre 2026)

- **Les LED comptent dans les calculs électriques** : une LED n'est plus un simple interrupteur pour le reste du montage, sa chute de tension et son courant entrent dans le calcul.
- **L'ampèremètre n'est plus un fil parfait** : il insère sa **résistance interne de 0,1 Ω**, comme un vrai appareil avec son shunt. La chute à ses bornes existe donc et se mesure au voltmètre, sans changer le courant du montage de façon visible. Posé en travers d'une alimentation, il reste détecté comme court-circuit.
- **Un bouton se câble dans les deux sens** : branché vers le plus ou vers la masse, il appuie dans les deux cas.
- **Plus rien n'est souligné en rouge dans le code.** Kablix déclare le croquis ouvert à l'extension Arduino et montre à Pylance les déclarations MicroPython de MicroPico. Nouvelle commande dans la palette — **Kablix : réparer l'analyse du code pour cette carte** — qui refait le travail à la demande et **dit ce qui manque** (extension à installer, croquis `.ino` à ouvrir, ou fenêtre à recharger).
- **Deux fils ne peuvent plus se recouvrir.**
- **Un quart de tour par clic** sur les deux boutons de rotation : quatre clics font le tour. Le pas fin de 45° reste sous les touches **+** et **−**.
- **Plus de point jaune sous la poignée d'un fil sélectionné** : on ne voit plus que le point blanc qu'on vient attraper. Le repère reste allumé pendant un câblage en cours, là où il sert.
- **Un atelier vierge ne réclame plus d'enregistrement.** 
- **Dessin de la carte Uno retouché** (décalages de texte repris à la main) et **`avr8js` en 0.21.1**.

## 2026.9.0 (2 septembre 2026)

- **Deux cartes de plus : Raspberry Pi Pico 2 et Pico 2 W.** Elles se choisissent dans la barre d'outils, se posent, se simulent et s'enregistrent comme les autres, avec leur dessin officiel et leur poster de brochage. Un **troisième moteur** est embarqué pour elles (`rp2350js`, cœurs Cortex-M33), à côté d'`avr8js` et de `rp2040js`.
- **Le Pico W fait serveur web** : la carte se déclare en point d'accès, sert une page ALLUMER/ÉTEINDRE, et **un téléphone du réseau allume la LED**. Le pont réseau accepte désormais les connexions entrantes, sans jamais interpréter ce qui passe : c'est le programme qui parle HTTP, exactement comme sur le matériel réel.
- **Un multimètre de table**, à brancher comme le vrai : deux prises banane, un levier pour choisir **tension continue** (en parallèle) ou **courant continu** (en série). Un ampèremètre posé en parallèle d'une alimentation est un court-circuit — Kablix le dit au lieu de le simuler en silence. Sur un signal haché, l'écran donne la **valeur moyenne**, comme un vrai appareil.
- **Un oscilloscope de table** qui dessine ce que le multimètre chiffre. Base de temps, volts par division, **déclenchement** sur front montant ou descendant avec son curseur de niveau.
- **Quatre composants de plus au catalogue** : **photodiode** et **phototransistor** (curseur de luminosité, et Kablix prévient quand la résistance de charge manque), plus les deux appareils de mesure — nouvelle famille **Appareils de mesure** dans la palette. La palette passe à **74 composants**.
- **Cinq composants de plus dans la bibliothèque téléchargeable** : **barrière optique infrarouge**, **carte fille Grove pour Uno** (seize prises, interrupteur 3,3 V / 5 V, emboîtement automatique sur la carte), **capteur d'humidité du sol**, **capteur de lumière Grove** (curseur en lux, pleine échelle réglable) et **lecteur de badges RFID 125 kHz** (cavalier UART ou Wiegand, badge qui entre et sort de la boucle d'antenne).

## 2026.8.99 (2026-08-21)

- **Les composants se téléchargent** : nouveau bouton **⚙ Gérer les composants** en bas de la palette. Il liste ce que proposent les dépôts (**Nouveaux**), ce qui est réellement installé (**Installés**) ou **Tous**, installe d'un clic et désinstalle avec confirmation. Un composant installé quitte aussitôt la palette ET les schémas ouverts. Le dossier est **partagé par tous les projets** de la machine, et le réglage *Kablix › Components Folder* affiche enfin son chemin par défaut.
- **Un composant tient dans UN fichier `.kompix**` : dessin externe, schéma interne, brochage, vignette, code de simulation et **fiche d'aide illustrée** voyagent ensemble dans le paquet. Déposé dans le dossier du projet, il est reconnu tout seul. Le bouton **❔ Aide du composant** ouvre la fiche embarquée — en français, en anglais, ou dans la première langue disponible.
- **Éclairage DMX512** : deux composants publiés dans la bibliothèque publique, la carte **Grove DMX512** (embase XLR 3 points) et le **projecteur PAR 38** à LED. L'univers est décodé depuis l'**UART matériel** (`SERIAL_8N2` à 250 kbit/s) **ou** depuis une broche **pilotée en logiciel** — un croquis `DmxSimple` fonctionne sans être modifié. L'adresse DMX se règle dans l'inspecteur, plusieurs projecteurs partagent la même paire, et les LED s'allument bombées, avec leur halo. Le trafic DMX n'inonde pas le moniteur série.
- **Envoyer le programme sur une vraie carte Pico** : bouton **⬆** dans la barre d'onglet d'un fichier `.py`. La carte est détectée toute seule sur l'USB, le programme part **renommé `main.py**` (il redémarre donc à chaque mise sous tension), et **seuls les modules réellement importés** l'accompagnent — la même liste que celle du simulateur. Un fichier inchangé n'est pas réécrit (comparaison sur l'empreinte, pas sur la date). Pour **Arduino**, la même fonction existe à condition d'installer mon extension Arduino-VsCode-IDE.
- **Un croquis inchangé ne se recompile plus** : le résultat d'une compilation est gardé sur le disque, classé sur l'empreinte du **contenu** des sources. Relancer un croquis inchangé dure donc quelques dizaines de millisecondes au lieu de plusieurs secondes.
- **« Enregistrer sous » ne perd plus rien** : les composants de bibliothèque sont regravés dans la nouvelle archive (le montage s'ouvre entier sur une machine qui ne les a pas installés) et le programme adopté est celui qui porte le nom du projet, à côté de lui.
- **Correctif `machine.UART` (Pico)** : la classe était inutilisable en MicroPython simulé. Corrigé dans le moteur — tout programme Pico qui ouvre un port série en bénéficie, pas seulement le DMX.
- **Un composant à comportement distant demande confiance** avant de s'exécuter, et un composant fraîchement téléchargé n'est plus considéré comme « local, donc approuvé d'office ».

## 2026.8.74 (2026-08-16)

- **Catégorie systéme fonctionnelle** avec une patte et un **robot araignée** : quadrupède à 8 servomoteurs, avec sa **Pico W, son PCA9685 et sa batterie embarqués** — rien à câbler, c'est LUI qu'on programme. Chaque servo se règle comme sur le vrai modèle : canal PCA9685 où il est branché, sens de montage, calage du zéro, largeur d'impulsion.
- Ajout d'**outil de dessin de systéme 3D** (en réalité 2d isométrique) : Dessin 2 D d'assemblages (svg) et viewer 3D iso.
- **Simulation en arrière-plan, activée par défaut** : déplacement, zoom et édition restent fluides pendant qu'un programme tourne, et une page chargée ne fait plus prendre de retard à l'horloge simulée. 
- **Deux nouveaux composants** : **potentiomètre ajustable** (la vis se tourne, la valeur s'écrit toute seule) et **capteur à effet Hall** (l'aimant se fait glisser). La bibliothèque passe à **73 composants**, toujours en 10 catégories, chacun avec sa fiche d'aide illustrée (FR + EN).
- **Résistance montée debout**, comme sur une vraie platine.
- **Démarrage deux fois plus rapide** : la bibliothèque de compression n'est chargée qu'à l'ouverture d'un projet.
- **Atelier** : la feuille a des bords des quatre côtés, la molette et le bouton *ajuster la vue* cadrent le **dessin** et non les cadres invisibles des composants, les trous de la platine s'allument avant la pose, la bibliothèque se cherche, et les composants très réglables rangent leurs propriétés en tiroirs repliables (en accordéon).
- **Corrections** : le bouton ferme éléctriquement le circuit, le REPL ne prend plus le firmware du Pico W quelle que soit la carte, `rp2040js` 1.3.3 (correction DMA).
- **Interface et aide entièrement traduites** en français et en anglais.

## 2026.8.22 (2026-08-08)

- **Bibliothèque de 71 composants** en 10 catégories, chacun avec sa fiche d'aide illustrée (FR + EN) et ses deux montages de test (Arduino et Pico disponibles uniquement su github).
- Nouvelle catégorie **Système** (en cours de développement) : ensembles déjà assemblés — patte articulée et robot araignée quadrupède, dessinés en volume.
- **Pico à l'heure** : émulateur ARM accéléré de 30 %, temps perdu rattrapé, chronomètre et vitesse réelle affichés sur le canvas.
- Simulation physique (résistance série des LED, courant débité, démarrage des servomoteurs), traceur de courbes avec sondes de tension, moniteur série bidirectionnel.
- Autoroutage des fils avec barre d'avancement et annulation, export SVG, import/export Wokwi.
- Créateur de composants intégré et format ouvert `.kablix-part.json`.

## 2026.7.226 (2026-07-30)

- publication initiale
