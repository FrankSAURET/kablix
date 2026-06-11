 <img src="Kablix.png" alt="Kablix" width="200" />

# Kablix

Extension VS Code de simulation de microcontrôleurs (**Arduino Uno** / **Raspberry Pi Pico**), fonctionnant **100% offline**.

La simulation s'appuie sur deux moteurs open-source embarqués dans l'extension :
[avr8js](https://github.com/wokwi/avr8js) (ATmega328P) et
[rp2040js](https://github.com/wokwi/rp2040js) (RP2040), tous deux sous licence MIT.
Aucun service en ligne n'est requis.

## Fonctionnalités (v0.4.0)

- ✅ **Atelier visuel** : palette de composants, placement, déplacement et
  **câblage broche-à-broche** sur un canvas (composants SVG réalistes
  [@wokwi/elements](https://github.com/wokwi/wokwi-elements), MIT)
- ✅ **Carte Raspberry Pi Pico** : élément SVG maison (`<kablix-pico-board>`)
  avec les 40 broches colorées (GP = or, GND = gris, alimentation = rouge),
  la **LED embarquée GP25** qui clignote visuellement, le connecteur USB et le
  chip RP2040 — plus une pastille GP25 câblable
- ✅ **Composants** : Arduino Uno, Raspberry Pi Pico, LED, **LED RGB**, bouton
  poussoir, résistance, **buzzer** (note animée quand actif), **potentiomètre**
  (entrée analogique interactive : A0–A5 sur Uno, GP26–GP28 sur Pico), reliés
  par une **netlist** qui pilote la simulation
- ✅ **Sélecteur de carte** Arduino Uno / Raspberry Pi Pico dans la barre
  d'outils, avec schéma de démarrage automatique pour chaque carte
  (Uno : LED D13 + bouton D2 ; Pico : LED GP25 + bouton GP13)
- ✅ **Flash RP2040 réel** : parseur **UF2** intégré, bootrom B1 embarqué,
  firmware programmé en flash et démarré comme sur la vraie carte
  (compatible pico-sdk) ; **USB-CDC et UART0** reliés au moniteur série
- ✅ **MicroPython** : ouvrez un fichier `.py`, Kablix charge le firmware
  `micropython*.uf2` du workspace (ou du réglage `kablix.micropythonUf2`) et
  **exécute votre script** via le raw REPL — `print()` et le REPL interactif
  fonctionnent dans le moniteur série
- ✅ **Chargement direct d'artefacts** : `.hex` (Uno), `.uf2` / `.elf` / `.bin`
  (Pico) ; bouton **↑ Charger workspace** et commande « Kablix : Charger
  l'artefact compilé du workspace » (détection du `.hex` le plus récent via
  `.vscode/arduino.json` ou scan, et du `.uf2` dans `build/` pour
  pico-vscode/cmake)
- ✅ **Compilation du code réel** : compile le fichier C/C++ actif avec une
  toolchain locale (`arduino-cli` ou `avr-gcc` pour l'AVR, `arm-none-eabi-gcc`
  pour le RP2040) puis l'exécute dans le simulateur
- ✅ **Moniteur série bidirectionnel** : sortie temps réel + champ d'envoi vers
  le microcontrôleur (USART Uno, USB-CDC/UART0 Pico — utilisable comme REPL
  MicroPython)
- ✅ **Empaquetage `.vsix`** prêt à installer

Tout le pipeline (netlist → émulateur → affichage, parseurs UF2/ELF, exécution
MicroPython de bout en bout) est couvert par des tests automatisés.

## Utilisation

1. Palette de commandes (`Ctrl+Shift+P`) → **« Kablix : Ouvrir le simulateur »**.
2. Choisir la carte (**Arduino Uno** ou **Raspberry Pi Pico**) dans la barre
   d'outils : un schéma de démarrage est posé sur le canvas. Cliquer
   **▶ Démarrer** : la LED clignote, le bouton est interactif, la série s'affiche.
3. **Construire son montage** : cliquer un composant de la palette pour le poser,
   le déplacer par son bandeau, et **relier deux broches** en cliquant
   successivement sur leurs pastilles. Cliquer un fil pour le supprimer.
4. **Exécuter son propre code** : ouvrir un fichier (voir `examples/`) puis
   **« ⚙ Compiler & exécuter le fichier actif »** :
   - `.ino` / `.c` / `.cpp` → compilation via la toolchain locale ;
   - `.py` → MicroPython sur le Pico simulé (firmware `.uf2` requis, voir
     ci-dessous) ;
   - `.hex` / `.uf2` / `.elf` / `.bin` → chargé directement sans compilation.
5. **Récupérer la sortie d'un autre outil** : bouton **↑ Charger workspace**
   (ou commande « Kablix : Charger l'artefact compilé du workspace ») pour
   lancer le dernier `.hex` (Arduino) ou `.uf2` (`build/`, pico-sdk/cmake).

### MicroPython sur le Pico simulé

1. Télécharger le firmware officiel sur
   [micropython.org/download/RPI_PICO](https://micropython.org/download/RPI_PICO/).
2. Le placer dans le workspace (n'importe quel dossier) **ou** renseigner son
   chemin dans le réglage **`kablix.micropythonUf2`**.
3. Ouvrir un fichier `.py` puis « ⚙ Compiler & exécuter le fichier actif » :
   le script est injecté via le raw REPL au démarrage du firmware. Le champ du
   moniteur série permet ensuite de dialoguer avec le REPL.

### Toolchains requises pour compiler votre code C/C++

| Carte | Compilateurs reconnus |
| --- | --- |
| Arduino Uno | `arduino-cli` (sketch Arduino complet) **ou** `avr-gcc` + `avr-objcopy` (C/C++ avr-libc) |
| Raspberry Pi Pico | `arm-none-eabi-gcc` + `arm-none-eabi-objcopy` (bare-metal RAM, voir `examples/blink_pico.c`) — ou tout projet **pico-sdk** : compilez avec cmake puis « ↑ Charger workspace » |

## Développement

```bash
npm install              # dépendances
npm run build            # compile extension + webview dans dist/
npm run watch            # recompilation continue
npm run typecheck        # vérification des types (tsc)
npm run build:firmware   # recompile les démos embarquées (nécessite les toolchains)
npm run verify:all       # moteurs + netlist + parseurs UF2/ELF (+ compilation si toolchains)
npm run verify:micropython # test bout en bout MicroPython (firmware dans test-assets/)
npm run package          # génère le .vsix
```

Dans VS Code, **F5** (« Lancer l'extension ») ouvre une fenêtre de développement.

## Architecture

| Fichier | Rôle |
| --- | --- |
| `src/extension.ts` | Point d'entrée : commandes |
| `src/panel.ts` | Panneau webview (HTML, CSP, messagerie, artefacts workspace) |
| `src/compiler.ts` | Toolchains + compilation + chargement d'artefacts (hôte) |
| `src/shared/uf2.ts` | Parseur UF2 (blocs → segments flash) |
| `src/shared/elf.ts` | Parseur ELF32 minimal (PT_LOAD) |
| `src/webview/sim.mts` | Contrôleur : atelier + simulation + série |
| `src/webview/diagram/catalog.mts` | Catalogue de composants + rôles des broches Uno/Pico |
| `src/webview/diagram/model.mts` | Netlist (pure) + résolution LED/RGB/buzzer/bouton/potentiomètre |
| `src/webview/diagram/editor.mts` | Éditeur DOM : palette, placement, câblage |
| `src/webview/elements/pico-board.mts` | Élément SVG maison `<kablix-pico-board>` |
| `src/webview/engines/avr.mts` | Moteur ATmega328P (avr8js) : GPIO, ADC, USART |
| `src/webview/engines/pico.mts` | Moteur RP2040 (rp2040js) : RAM/flash, bootrom, USB-CDC, UART0, raw REPL |
| `src/webview/engines/bootrom-b1.mts` | Bootrom B1 du RP2040 (binaire officiel, BSD-3-Clause) |
| `src/webview/programs/*.mjs` | Firmwares de démo compilés (générés) |
| `firmware/` | Sources C des démos + linker RP2040 |
| `scripts/verify-*.mjs` | Tests automatisés (moteurs, netlist, parseurs, compilation, MicroPython) |

## Licence

MIT — le bootrom RP2040 embarqué est © Raspberry Pi (Trading) Ltd, licence BSD-3-Clause.
