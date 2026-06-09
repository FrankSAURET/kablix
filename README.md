# MicroSim-VSCode

Extension VS Code de simulation de microcontrôleurs (**Arduino Uno** / **Raspberry Pi Pico**), fonctionnant **100% offline**.

La simulation s'appuie sur le moteur open-source [avr8js](https://github.com/wokwi/avr8js) (MIT) embarqué dans l'extension : aucun service en ligne n'est requis.

## État actuel (v0.1.0)

Premier incrément — fondations et démo fonctionnelle :

- ✅ Squelette d'extension VS Code (TypeScript + build esbuild)
- ✅ Commande **« MicroSim : Ouvrir le simulateur »**
- ✅ Webview avec carte Arduino Uno virtuelle, LED sur la broche 13, boutons Démarrer/Arrêter
- ✅ Moteur de simulation ATmega328P (avr8js) exécuté dans la webview
- ✅ Programme de démonstration *Blink* (LED clignotante), validé par un test automatisé
- 🔜 Raspberry Pi Pico (RP2040)
- 🔜 Compilation de code Arduino/C++ de l'utilisateur
- 🔜 Composants supplémentaires (boutons, résistances, capteurs…)

## Développement

```bash
npm install        # installe les dépendances
npm run build      # compile extension + webview dans dist/
npm run watch      # recompilation continue
npm run typecheck  # vérification des types (tsc)
npm run verify     # valide le programme Blink contre avr8js
```

Puis, dans VS Code, appuyez sur **F5** (« Lancer l'extension ») pour ouvrir une
fenêtre de développement, puis lancez la commande
**« MicroSim : Ouvrir le simulateur »** depuis la palette (`Ctrl+Shift+P`).

## Architecture

| Fichier | Rôle |
| --- | --- |
| `src/extension.ts` | Point d'entrée : enregistre la commande |
| `src/panel.ts` | Gère le panneau webview (HTML + CSP) |
| `src/webview/sim.mts` | Simulation avr8js + pilotage de la LED (s'exécute dans la webview) |
| `src/webview/blink-program.mjs` | Programme Blink ATmega328P pré-assemblé |
| `esbuild.js` | Build des deux bundles (`dist/extension.js`, `dist/webview.js`) |
| `scripts/verify-blink.mjs` | Test : vérifie que la broche 13 bascule |

## Licence

MIT
