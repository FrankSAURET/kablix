# MicroSim-VSCode

Extension VS Code de simulation de microcontrôleurs (**Arduino Uno** / **Raspberry Pi Pico**), fonctionnant **100% offline**.

La simulation s'appuie sur deux moteurs open-source embarqués dans l'extension :
[avr8js](https://github.com/wokwi/avr8js) (ATmega328P) et
[rp2040js](https://github.com/wokwi/rp2040js) (RP2040), tous deux sous licence MIT.
Aucun service en ligne n'est requis.

## Fonctionnalités (v0.2.0)

- ✅ **Deux cartes** : Arduino Uno (ATmega328P) et Raspberry Pi Pico (RP2040)
- ✅ **Compilation du code réel** : compile le fichier C/C++ actif avec une
  toolchain locale (`arduino-cli` ou `avr-gcc` pour l'AVR, `arm-none-eabi-gcc`
  pour le RP2040) puis l'exécute dans le simulateur
- ✅ **Composants** : plusieurs LEDs, bouton poussoir interactif, **moniteur
  série** (USART)
- ✅ **Programmes de démonstration** intégrés (compilés et embarqués)
- ✅ **Empaquetage `.vsix`** prêt à installer

Tout le pipeline (toolchain → émulateur → affichage) est couvert par des tests
automatisés.

## Utilisation

1. Palette de commandes (`Ctrl+Shift+P`) → **« MicroSim : Ouvrir le simulateur »**.
2. Choisir la carte dans la barre d'outils. La démo intégrée se charge ; cliquer
   sur **▶ Démarrer**.
3. Pour exécuter votre propre code : ouvrir un fichier (voir `examples/`),
   sélectionner la carte, puis **« ⚙ Compiler & exécuter le fichier actif »**
   (bouton dans le simulateur ou commande **« MicroSim : Compiler & exécuter le
   fichier actif »**).

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
npm run verify         # teste les moteurs avec les démos
npm run verify:compiler# teste le service de compilation sur examples/
npm run package        # génère le .vsix
```

Dans VS Code, **F5** (« Lancer l'extension ») ouvre une fenêtre de développement.

## Architecture

| Fichier | Rôle |
| --- | --- |
| `src/extension.ts` | Point d'entrée : commandes |
| `src/panel.ts` | Panneau webview (HTML, CSP, messagerie) |
| `src/compiler.ts` | Détection de toolchain + compilation (hôte) |
| `src/webview/sim.mts` | Contrôleur UI + sélection du moteur |
| `src/webview/engines/avr.mts` | Moteur ATmega328P (avr8js) |
| `src/webview/engines/pico.mts` | Moteur RP2040 (rp2040js) |
| `src/webview/programs/*.mjs` | Firmwares de démo compilés (générés) |
| `firmware/` | Sources C des démos + linker RP2040 |
| `scripts/build-firmware.mjs` | Compile les démos → modules embarqués |
| `scripts/verify-sim.mjs` | Test des moteurs |
| `scripts/verify-compiler.mjs` | Test du service de compilation |

## Licence

MIT
