# Plan — Mode débogage simple (pas à pas + lecture des variables)

> Document de conception. Rien n'est encore implémenté ; ce plan découpe le
> chantier en étapes livrables indépendamment, de la plus simple à la plus
> ambitieuse.

## Objectif pédagogique

Permettre à un élève de :

1. **mettre en pause** la simulation ;
2. avancer **pas à pas** (ligne de code source, pas instruction machine) ;
3. **lire les variables** de son programme à chaque pause ;
4. poser un **point d'arrêt** sur une ligne.

Deux langages visés : **C/C++ (Arduino Uno, avr8js)** et
**MicroPython (Pico, rp2040js)**.

## Ce qui existe déjà dans Kablix

| Brique | État |
| --- | --- |
| Exécution contrôlée AVR (`AvrEngine.loop`) | boucle 60 fps, facile à suspendre — `avrInstruction()` s'appelle une instruction à la fois |
| Exécution contrôlée RP2040 (`PicoEngine`) | rp2040js expose `executeInstruction()` et les registres |
| Lecture mémoire | `cpu.data` (SRAM AVR), `rp2040.readUint32()` |
| Parseur ELF maison (`src/shared/elf.ts`) | sections + symboles, mais **pas DWARF** |
| Injection de script MicroPython | le .py de l'élève est injecté dans la flash |

## Étape 1 — Pause / reprise / vitesse (commun, ~1 jour)

Sans aucune information de débogage :

- boutons **⏸ Pause** / **▶ Reprendre** / **🐢 Ralenti** dans la barre d'outils ;
- `SimEngine` gagne `pause()`, `resume()`, `setSpeed(fraction)` ;
- en pause, l'inspecteur affiche **PC, registres, broches** (déjà accessibles).

Livrable utile seul : observer l'état des broches gelé.

## Étape 2 — Pas à pas et variables en C (AVR)

Le pas à pas **source** exige la correspondance PC ↔ ligne, donc **DWARF**.

1. **Compiler avec `-g`** et conserver l'**ELF** (le pipeline actuel ne garde
   que le .hex) — modification de `compiler.ts`.
2. **Parser DWARF** :
   - `.debug_line` (table PC → fichier/ligne) : machine à états documentée,
     ~400 lignes de TS ; c'est le gros morceau ;
   - `.debug_info` + `.debug_loc` pour les variables : commencer par les
     **variables globales/statiques** (adresse fixe, lisible dans `cpu.data`),
     les locales (pile/registres) en dernier.
   - Alternative sans parseur : exécuter `avr-objdump --dwarf=decodedline` et
     `avr-nm` à la compilation (côté extension, les outils sont déjà dans la
     toolchain Arduino) et embarquer le résultat en JSON dans le message
     `runProgram`. **Recommandé : commencer par là.**
3. **Pas à pas** : en pause, exécuter des instructions jusqu'à ce que la ligne
   source associée au PC change. Point d'arrêt = table ligne → PC, test du PC
   à chaque instruction (coût négligeable au rythme avr8js).
4. **Variables** : panneau listant les globales (nom, type simple, valeur lue
   en SRAM), rafraîchi à chaque pause.

## Étape 3 — Pas à pas et variables en MicroPython (Pico)

Le firmware officiel n'active **pas** `sys.settrace`
(`MICROPY_PY_SYS_SETTRACE=0`). Deux options :

- **Option A (recommandée) : instrumentation du source.** Avant l'injection
  du .py, l'extension insère après chaque ligne « pas-à-pasable » un appel
  `__kx(no_ligne, globals())` ; cette fonction, ajoutée en préambule :
  - envoie `no_ligne` + le `repr()` des variables globales sur une **seconde
    interface série virtuelle** (ou un préfixe spécial sur l'USB CDC,
    ex. `\x1bKX{...}\n`, filtré avant affichage dans le moniteur) ;
  - en mode pas à pas, **bloque** en attendant un caractère de contrôle
    (`stdin`) envoyé par le bouton « Pas suivant ».
  - Limites assumées : pas de variables locales de fonction (sauf à passer
    `locals()`, partiel en MicroPython), instrumentation ligne à ligne
    naïve (on instrumente uniquement les lignes de niveau d'indentation
    complet, pas les expressions multilignes).
- **Option B : firmware maison** compilé avec `MICROPY_PY_SYS_SETTRACE=1`,
  livré dans `firmware/`. Plus propre (vraie trace, locales), mais impose de
  maintenir un build MicroPython dédié (~+90 Ko) et d'abandonner le firmware
  officiel de l'utilisateur.

## Interface (les 3 étapes partagent la même UI)

```
[▶] [⏸] [⏭ Pas] [● Arrêts]      Variables ──────────────
                                  compteur   int    42
  (canvas, l'exécution est        etat       bool   True
   figée, LED gelées)             seuil      float  3.14
```

- Panneau « Variables » : colonne dans l'inspecteur quand la simulation est
  en pause.
- Points d'arrêt : gouttière de l'éditeur VS Code → l'extension envoie les
  lignes cochées à la webview (`postMessage`), pas besoin du protocole DAP
  pour cette version « simple ».

## Découpage proposé

| Lot | Contenu | Effort estimé |
| --- | --- | --- |
| 1 | Pause/reprise/ralenti + état des broches | 1 j |
| 2a | ELF conservé, `objdump --dwarf=decodedline` → table des lignes, pas à pas C | 2–3 j |
| 2b | Globales C via `avr-nm` + lecture SRAM | 1–2 j |
| 3 | Instrumentation MicroPython (option A) | 3–4 j |
| 4 | Points d'arrêt depuis la gouttière VS Code | 1–2 j |
