# MicroSim-VSCode

Extension VS Code de simulation de microcontrôleurs (**Arduino Uno** / **Raspberry Pi Pico**), fonctionnant **100% offline**.

La simulation s'appuie sur deux moteurs open-source embarqués dans l'extension :
[avr8js](https://github.com/wokwi/avr8js) (ATmega328P) et
[rp2040js](https://github.com/wokwi/rp2040js) (RP2040), tous deux sous licence MIT.
Aucun service en ligne n'est requis.

## Fonctionnalités (v0.3.0)

- ✅ **Atelier visuel** : palette de composants, placement, déplacement et
  **câblage broche-à-broche** sur un canvas (composants SVG réalistes
  [@wokwi/elements](https://github.com/wokwi/wokwi-elements), MIT)
- ✅ **Composants** : Arduino Uno, LED, bouton poussoir, résistance, reliés par
  une **netlist** qui pilote la simulation (une LED câblée sur une broche
  s'allume réellement, un bouton tire la broche à la masse)
- ✅ **Compilation du code réel** : compile le fichier C/C++ actif avec une
  toolchain locale (`arduino-cli` ou `avr-gcc` pour l'AVR, `arm-none-eabi-gcc`
  pour le RP2040) puis l'exécute dans le simulateur
- ✅ **Moniteur série** (USART) et **deux moteurs** : Arduino Uno (avr8js) et
  Raspberry Pi Pico (rp2040js)
- ✅ **Empaquetage `.vsix`** prêt à installer

Tout le pipeline (netlist → émulateur → affichage) est couvert par des tests
automatisés.

> **En cours / à venir** : le visuel de la carte Raspberry Pi Pico (absent de
> @wokwi/elements, nécessite un SVG maison MIT) n'est pas encore dans l'atelier ;
> le moteur Pico fonctionne et est testé. Voir la feuille de route plus bas.

## Feuille de route

- **Phase A — Atelier visuel** *(en cours)* : composants + câblage. ✅ Uno ;
  🔜 carte Pico (SVG maison), plus de composants (breadboard, capteurs…).
- **Phase B — Moteur Pico « flash »** : chargement bootrom + image flash
  (UF2/ELF) pour exécuter le C/C++ réel du Pico.
- **Phase C — Intégration extensions** : détecter la sortie de
  [Arduino-VsCode-IDE](https://github.com/FrankSAURET/Arduino-VsCode-IDE) et de
  [pico-vscode](https://github.com/raspberrypi/pico-vscode).
- **Phase D — MicroPython** sur Pico (firmware + LittleFS + `main.py`).

## Utilisation

1. Palette de commandes (`Ctrl+Shift+P`) → **« MicroSim : Ouvrir le simulateur »**.
2. Un schéma de démarrage (Arduino Uno + LED sur D13 + bouton sur D2) est posé
   sur le canvas. Cliquer **▶ Démarrer** : la LED clignote, le bouton est
   interactif, la série s'affiche.
3. **Construire son montage** : cliquer un composant de la palette pour le poser,
   le déplacer par son bandeau, et **relier deux broches** en cliquant
   successivement sur leurs pastilles. Cliquer un fil pour le supprimer.
4. **Exécuter son propre code** : ouvrir un fichier (voir `examples/`) puis
   **« ⚙ Compiler & exécuter le fichier actif »** (bouton du simulateur ou
   commande **« MicroSim : Compiler & exécuter le fichier actif »**).

### Toolchains requises pour compiler votre code

| Carte | Compilateurs reconnus |
| --- | --- |
| Arduino Uno | `arduino-cli` (sketch Arduino complet) **ou** `avr-gcc` + `avr-objcopy` (C/C++ avr-libc) |
| Raspberry Pi Pico | `arm-none-eabi-gcc` + `arm-none-eabi-objcopy` |

> Le code Pico est compilé en **bare-metal exécuté en RAM** (table de vecteurs
> fournie par le programme, édition de liens via le linker embarqué). Voir
> `examples/blink_pico.c`. Le support des sketches Pico via le SDK/flash est une
> évolution prévue.

## Développement

```bash
npm install            # dépendances
npm run build          # compile extension + webview dans dist/
npm run watch          # recompilation continue
npm run typecheck      # vérification des types (tsc)
npm run build:firmware # recompile les démos embarquées (nécessite les toolchains)
npm run verify:all     # teste moteurs + compilation + netlist de l'atelier
npm run package        # génère le .vsix
```

Dans VS Code, **F5** (« Lancer l'extension ») ouvre une fenêtre de développement.

## Architecture

| Fichier | Rôle |
| --- | --- |
| `src/extension.ts` | Point d'entrée : commandes |
| `src/panel.ts` | Panneau webview (HTML, CSP, messagerie) |
| `src/compiler.ts` | Détection de toolchain + compilation (hôte) |
| `src/webview/sim.mts` | Contrôleur : atelier + simulation |
| `src/webview/diagram/catalog.mts` | Catalogue de composants + broches Uno |
| `src/webview/diagram/model.mts` | Netlist (pure) + résolution LED/bouton |
| `src/webview/diagram/editor.mts` | Éditeur DOM : palette, placement, câblage |
| `src/webview/engines/avr.mts` | Moteur ATmega328P (avr8js) |
| `src/webview/engines/pico.mts` | Moteur RP2040 (rp2040js) |
| `src/webview/programs/*.mjs` | Firmwares de démo compilés (générés) |
| `firmware/` | Sources C des démos + linker RP2040 |
| `scripts/verify-sim.mjs` | Test des moteurs |
| `scripts/verify-compiler.mjs` | Test du service de compilation |
| `scripts/verify-diagram.mjs` | Test de la netlist de l'atelier |

## Licence

MIT
