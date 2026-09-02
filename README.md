![Kablix](https://raw.githubusercontent.com/FrankSAURET/kablix/main/media/accroche.webp)

*[English version](README.en.md)*

> Extension en cours de developpement. Et si vous trouvez que j'écris comme une IA c'est surement parce qu'il y a du vrai.

> Attention Nouveauté : Les nouveaux composants sont téléchargeables via le bouton « gérer  les composants ».

# Kablix

Une application **Gauloise** de simulation de microcontrôleurs (**Arduino Uno/Raspberry Pi Pico**) directement dans VS Code,

- **100 % Offline**
- **100 % Gratuit**
- **100 % Libre**
- **100 % Sans télémétrie**

La simulation s’appuie sur trois moteurs open-sources embarqués dans l’extension :  
[avr8js](https://github.com/wokwi/avr8js) (ATmega328P),  
[rp2040js](https://github.com/wokwi/rp2040js) (RP2040) et  
[rp2350js](https://github.com/c1570/rp2350js) (RP2350), tous sous licence MIT.

## Tests

Ma bilothèque de test est disponible : [TestKablix](https://github.com/FrankSAURET/kablix/tree/main/testkablix)

## Utilisation

1. Pour démarrer, cliquer sur l’icône ![Kablix](https://raw.githubusercontent.com/FrankSAURET/kablix/main/media/KNB.webp) dans la barre d’activité à gauche ;
  - Ou dans un dossier de projet, double cliquer sur un fichier projix ;
    - Ou si vous avez fait l’association, dans l’explorateur Windows double cliquer sur un fichier projix.

![alt text](https://raw.githubusercontent.com/FrankSAURET/kablix/main/media/demarrer.gif)

1. **Construire son montage** : Glisser/poser un composant à partir de la bibliothèque à gauche. Relier les broches en direct et clique sur le bouton autoroutage (route les composants sélectionnés ou tout le montage si aucun n’est sélectionné).

![alt text](https://raw.githubusercontent.com/FrankSAURET/kablix/main/media/dessiner.gif)

1. **Exécuter son code** : Associer un fichier de code (attention les codes ino doivent être dans un dossier de même nom) puis **▶ « démarrer»** :
  - `.ino`/`.c`/`.cpp` → compilation via la toolchain locale ;
  - `.py` → MicroPython sur le Pico simulé (firmware `.uf2` requis, voir ci-dessous) ;
  - `.hex` / `.uf2`/`.elf` / `.bin` → chargé directement sans compilation.
2. **Enregistrer son montage** : « Kablix : Enregistrer le projet (.projix) » ;
  un `.projix` se rouvre ensuite d’un double-clic dans l’explorateur.  
   Import/export au format Wokwi (`diagram.json`) également disponibles.

![alt text](https://raw.githubusercontent.com/FrankSAURET/kablix/main/media/simuler.gif)

## Fonctionnalités

- ✅ **Atelier visuel** : routage automatique. 
- ✅ **Créateur de composants** : Possibilité de créer des composant « Perso » via ce créateur ou mieux,  faire un fork, utiliser la [doc](docs/fr/Creating-components.md) pour ajouter le composant et faire une PR (demande de publication) il sera dans la version suivante pour tout le monde et merci de fournir aussi le fichier de test (pico + arduino).
- ✅ **Export SVG**.
- ✅ **Bibliothèque de 74 composants** rangés par familles, chacun avec sa fiche d’aide illustrée (bouton ❔) et ses deux montages de test, Arduino et Pico — [liste complète](#bibliothèque-de-composants).
- ✅ **Gestionnaire de composants** (bouton ⚙ en bas de la palette) : un composant tient dans un seul fichier `.kompix` — dessin, brochage, simulation et fiche d’aide comprises. Installez-le d’un clic depuis un dépôt, ou déposez le fichier dans le dossier du projet.
- ✅ **Éclairage DMX512** : univers décodé depuis l’UART matériel **ou** depuis une broche bit-bangée (DmxSimple), projecteurs pilotés en direct.
- ✅ **Cartes de développements prises en charge** : Arduino Uno, Nano, Mega 2560 et Raspberry Pi Pico/Pico W/Pico 2/Pico 2 W, enfichables sur platine d’essai.
- ✅ **Flash RP2040 réel**.
- ✅ **Chargement direct d’artefacts** : `.hex`, `.uf2`, `.elf`, `.bin` compilés ailleurs, chargés sans recompilation
- ✅ **Compilation du code réel C/C++**
- ✅ **Moniteur série bidirectionnel** : sortie temps réel + champ d’envoi vers le microcontrôleur.
- ✅ **Traceur de courbes** : tracé en direct, plus des **sondes** posées sur une broche pour visualiser sa tension
- ✅ **Simulation physique** : luminosité selon la résistance série, les LED sans résistance grillent, les servomoteurs ne démarrent pas, l’alimentation tient compte du courant…
- ✅ **Capteurs interactifs** : curseurs et boutons pour flamme, gaz, son, lumière, température et mouvement, pilotant l’entrée du montage en direct.
- ✅ **Intégrable à Windows**.

> 📖 **Guide complet** : [docs/fr/USAGE.md](docs/fr/USAGE.md) (français)/  
> [docs/en/USAGE.md](docs/en/USAGE.md) (English) — interface, câblage, création  
> de composants personnalisés (avec prompt IA), format `.kompix`,  
> gestionnaire de composants, sources de composants existants.
> **Ajouter un composant à Kablix** (contributeurs, sur GitHub uniquement) :  
> [docs/fr/Creating-components.md](docs/fr/Creating-components.md) (français) /  
> [docs/en/Creating-components.md](docs/en/Creating-components.md) (English) —  
> du dessin dans `Composants2D.svg` au composant simulé, testé et documenté,  
> à la main ou avec une IA.
> **Dessiner les systèmes en volume** (araignée, pattes — contributeurs, sur GitHub uniquement) :  
> [docs/fr/Drawing-systems.md](docs/fr/Drawing-systems.md) (français) /  
> [docs/en/Drawing-systems.md](docs/en/Drawing-systems.md) (English) —  
> vous tracez le contour d’une pièce, le moteur isométrique la met en volume.
> 🌍 **Interface bilingue** : français si VS Code est en français, anglais sinon.  
> Le mécanisme est extensible à d’autres langues — voir [Internationalisation](#internationalisation).

## Bibliothèque de composants

**74 composants** posables à la souris, rangés dans l’ordre de la palette (plus leurs variantes : condensateur polarisé, transistors PN2222A/NPN/PNP, claviers 3×4 et 4×4, platines d’essai mini/half/full…). Chacun a sa **fiche d’aide illustrée** (bouton ❔ de l’inspecteur, hors-ligne, FR et EN) et **deux montages de test** prêts à simuler dans [testkablix](https://github.com/FrankSAURET/kablix/tree/main/testkablix) — un en C sur Arduino, un en MicroPython sur Pico.

| Catégorie                              | Composants                                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cartes et supports** (10)            | Arduino Uno · Arduino Nano · Arduino Mega 2560 · Raspberry Pi Pico · Raspberry Pi Pico W · Raspberry Pi Pico 2 · Raspberry Pi Pico 2 W · Grove Shield (Pico) · Platine d’essai · Batterie externe                                                                                                                              |
| **Passifs et semi-conducteurs** (10)   | Résistance · Condensateur (polarisé ou non) · Diode · Transistor (PN2222A, NPN, PNP — boîtier TO-92) · Thermistance CTN · Thermistance CTP · Capteur de température CTN · Photorésistance (LDR) · Photodiode · Phototransistor                                                                                                                |
| **Voyants et afficheurs** (10)         | LED · LED RGB · Barre de 10 LED · Afficheur 7 segments (1 à 4 digits) · NeoPixel · Matrice NeoPixel · Anneau NeoPixel · LCD texte 16×2 / 20×4 (I²C ou parallèle) · Écran OLED SSD1306 · Écran TFT ILI9341 (SPI)                                                                                                |
| **Entrées** (9)                        | Bouton poussoir · Bouton poussoir 6 mm · Interrupteur à glissière · Interrupteur DIP ×8 · Clavier matriciel 3×4 / 4×4 · Potentiomètre · Potentiomètre à glissière · Potentiomètre ajustable · Joystick analogique                                                                                              |
| **Capteurs** (11)                      | Capteur de lumière · Capteur de gaz (MQ) · Capteur de flamme · Capteur de son · Détecteur de mouvement PIR · Capteur d’inclinaison · Capteur à effet Hall · Capteur de pouls · Capteur à ultrason (HC-SR04) · Température/humidité DHT22 · Température/humidité DHT11                                          |
| **Actionneurs et puissance** (7)       | Buzzer · Servomoteur · Ventilateur · Moteur à courant continu · Relais OMRON G5V · Pilote PWM 16 canaux (PCA9685) · Carte microSD (SPI)                                                                                                                                                                        |
| **Logique (boîtiers DIP)** (12)        | **CMOS 4000** : CD4081 (4 × ET) · CD4071 (4 × OU) · CD4070 (4 × OU exclusif) · CD4011 (4 × NON-ET) · CD4001 (4 × NON-OU) · CD40106 (6 × NON, trigger de Schmitt) — **TTL/HC 74** : 74xx08 · 74xx32 · 74xx86 · 74xx00 · 74xx02 · 74xx14 (mêmes fonctions, la famille choisie décide de la plage d’alimentation) |
| **Mécanique** (2)                      | Robot araignée · Patte d’araignée                                                                                                                                                                                                                                                                             |
| **Appareils de mesure** (3)            | Alimentation de laboratoire · Multimètre de table · Oscilloscope de table                                                                                                                                                                                                                                     |

À quoi s’ajoutent les **composants de bibliothèque** (`.kompix`), installés par le gestionnaire ou déposés dans le dossier du projet, et les **composants personnalisés** dessinés dans le créateur intégré.

## Internationalisation

L’interface suit la langue de VS Code (`vscode.env.language`) : **français si elle commence par `fr`, anglais sinon** (langue de repli). La traduction repose sur trois registres indépendants, parce qu’ils traduisent des choses de nature différente :

| Quoi                                                                    | Fichier                                                    | Forme                                                                                                                         |
| ----------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Chaînes de la webview (barre d’outils, palette, inspecteur, catalogue…) | `src/webview/i18n.mts`                                     | dictionnaire **clé (anglais) → traduction** (`DICTS`) ; `t()` retombe sur la clé anglaise si absente                          |
| Chaînes de l’extension (commandes, notifications, dialogues)            | `package.nls.<lang>.json` + `l10n/bundle.l10n.<lang>.json` | mécanisme natif VS Code (`%clé%` dans `package.json`, `vscode.l10n.t()` dans le code) ; le fichier sans suffixe est l’anglais |
| Aide : guide utilisateur (❔) et fiches de composants                    | `docs/<lang>/*.md` et `docs/<lang>/composants/*.md`        | **Markdown versionné**, rendu hors-ligne dans une webview (`src/markdown.ts` → `src/guide.ts` / `src/partHelp.ts`)            |

L’aide n’est plus une copie HTML figée dans le code : c’est **le guide lui-même** qui  
s’affiche, images comprises — donc jamais en retard sur la documentation. Les captures  
lourdes (GIF de démo, logo) restent hors du `.vsix` et sont servies depuis GitHub ;  
toutes les autres sont embarquées, donc lisibles sans connexion.

Les trois registres utilisent la même résolution : le **code base** de la langue  
(`fr-FR` → `fr`) sélectionne l’entrée correspondante, et l’anglais sert de repli quand  
elle est absente.

### Ajouter une langue (ex. allemand, `de`)

À faire aux **trois** registres — une langue déclarée à un seul endroit ne sera traduite  
qu’en partie :

1. **Webview** — dans [`src/webview/i18n.mts`](src/webview/i18n.mts) : créer le
  dictionnaire `const DE = { … }` (mêmes clés anglaises que `FR`) puis l’ajouter à  
   `DICTS` → `{ fr : FR, de : DE }`. Les clés non traduites retombent automatiquement  
   sur l’anglais.
2. **Extension** — copier `package.nls.json` en `package.nls.de.json` et
  `l10n/bundle.l10n.fr.json` en `l10n/bundle.l10n.de.json`, puis traduire les valeurs  
   (les clés restent identiques). VS Code choisit le fichier tout seul.
3. **Aide** — créer `docs/de/` : le guide `USAGE.md` et le dossier `composants/`
  (mêmes NOMS de fichiers que `docs/fr/`, seul le contenu est traduit ; les images sont  
   mutualisées dans `docs/img/`). Élargir ensuite `docLang()` dans  
   [`src/guide.ts`](src/guide.ts) et [`src/partHelp.ts`](src/partHelp.ts) — une fiche  
   absente retombe déjà sur une autre langue.

Aucune autre modification de logique n’est nécessaire : la sélection et le repli sont  
gérés par `initLocale()` (webview) et `docLang()` (aide). `npm run verify:docs` contrôle  
que les guides et les fiches restent complets, illustrés et embarqués dans le paquet.

## Crédits

Kablix est développé par **[Frank SAURET](https://electropol.fr)** et s’appuie sur les bibliothèques open sources suivantes :

| Bibliothèque                                                                  | Rôle                                                                  | Licence                                     |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------- |
| [avr8js](https://github.com/wokwi/avr8js)                                     | Moteur de simulation ATmega328P (Arduino Uno)                         | MIT                                         |
| [rp2040js](https://github.com/wokwi/rp2040js)                                 | Moteur de simulation RP2040 (Raspberry Pi Pico)                       | MIT                                         |
| [rp2350js](https://github.com/c1570/rp2350js)                                 | Moteur de simulation RP2350 (Raspberry Pi Pico 2)                     | MIT                                         |
| [@wokwi/elements](https://github.com/wokwi/wokwi-elements)                    | Composants visuels (cartes, LED, capteurs…)                           | MIT                                         |
| [JSZip](https://stuk.github.io/jszip/)                                        | Lecture/écriture des archives `.projix`                               | MIT/GPLv3                                   |
| Bootrom B1 du RP2040                                                          | Démarrage du RP2040 simulé                                            | © Raspberry Pi (Trading) Ltd — BSD-3-Clause |
| Visuels officiels des cartes Raspberry Pi                                     | Dessins des cartes Pico, Pico W, Pico 2 et Pico 2 W                    | © Raspberry Pi Ltd                          |
| MicroPython                                                                   | Firmware `.uf2` exécuté sur le Pico simulé (fourni par l’utilisateur) | MIT                                         |
| Police [LED Board-7](http://www.styleseven.com) © Sizenko Alexander (Style-7) | Texte façon afficheur LED des écrans LCD simulés                      | Freeware (usage libre, crédit requis)       |

Le format de projet et les composants importés sont compatibles avec [Wokwi](https://wokwi.com) (format ouvert `diagram.json`).

## Licence

MIT — le bootrom RP2040 embarqué est © Raspberry Pi (Trading) Ltd, licence BSD-3-Clause.
