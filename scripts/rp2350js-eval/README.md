# Évaluation de `c1570/rp2350js` — bancs et correctifs (21-22 août 2026)

Matériel de la piste 7/8 de [`roadmap.md`](../../roadmap.md). Verdict détaillé :
[`vitesse-pico.md`](../vitesse-pico.md) §15. Rien ici n'est branché dans
`verify:all` — ce sont des bancs à rejouer **hors de Kablix**, contre un clone du
fork, le jour où l'on re-sonde le projet.

## ⚠️ Ne JAMAIS mesurer la vitesse sous `tsx`

`tsx` transpile module par module et garde les noms de fonctions : sur le
Cortex-M33, dont l'exécution est éclatée en fichiers importés, V8 renonce à
l'inlining et le cœur perd **un facteur 8** (0,8-1,2 Minstr/s au lieu de 8,3).
Le M0+, tenu dans un seul fichier, n'est pas touché — le piège est invisible si
l'on ne compare pas. Le premier verdict de la piste 7 est tombé dedans.

Pour la vitesse, passer par `banc-compile.mjs` / `mesure-finale.mjs`, qui
bundlent avec esbuild (`keepNames: false`) comme le fait la webview Kablix.
`tsx` reste bon pour les tests fonctionnels de `kablix-eval.ts`.

## ⚠️ Un rapport ne se mesure qu'en ENTRELACÉ

La machine dérive de **±40 % d'une fenêtre à l'autre** (le même banc Kablix a rendu
×0,156, ×0,204 puis ×0,256 dans la même soirée). Comparer deux bundles mesurés à
dix minutes d'écart ne mesure que la machine : deux chiffres publiés ont dû être
corrigés pour ça (cache RISC-V ×1,93 → **×1,44**, table Thumb-16 ×1,43 → **×1,03**).
**Toujours `ab.mjs`** : deux bundles figés, relancés en alternance, 3 passes
chacun, meilleure de chaque côté.

```sh
node ab.mjs ./bench-avant.cjs ./bench-apres.cjs avant apres [arm|riscv|rp2040]
node croise.mjs        # même principe, contre le banc Kablix
```

## Rejouer

```sh
git clone https://github.com/c1570/rp2350js && cd rp2350js && npm i
git apply chemin/vers/correctifs-rp2350js.patch      # les deux bugs trouvés ici
cp chemin/vers/*.ts .                                 # les trois bancs
# firmwares officiels MicroPython dans ./demo/ :
#   RPI_PICO2-20260406-v1.28.0.uf2, RPI_PICO2-RISCV-…, RPI_PICO-…
npx tsx kablix-eval.ts --target=arm|riscv|rp2040     # 10 tests fonctionnels + vitesse
npx tsx vitesse.ts arm|riscv|rp2040 [--n=400000]     # vitesse seule (REPL non pollué)
npx tsx diag2.ts i2c|neopixel                        # pourquoi un bloc fige (CSR, PC, mcause)

cp chemin/vers/*.mjs .                                # les bancs de vitesse
node mesure-finale.mjs        # les 3 cœurs + le miroir Kablix, 3 passes, meilleure retenue
node banc-compile.mjs arm rp2040 riscv   # une passe par cœur, JS compilé
node mesure-cache.mjs         # RISC-V cache de décodage coupé : combien il rapporte
node croise.mjs               # Kablix vs M33 entrelacés (dérive machine neutralisée)
node profil.mjs arm 40000     # profil self-time, sans tsx
```

`mesure-finale.mjs` et `croise.mjs` lancent aussi le banc Kablix : ils contiennent
le chemin du projet en dur (`const KABLIX = …`), à ajuster.

Le miroir côté Kablix — **même charge, même méthode, notre `rp2040js` patché** —
est [`_banc-rp2040js-nu.mjs`](../_banc-rp2040js-nu.mjs), à lancer depuis la racine
du projet. Sans lui, les chiffres du fork ne se comparent à rien.

## Ce que couvre `kablix-eval.ts`

Les dépendances réelles de Kablix, pilotées au REPL MicroPython par USB CDC :
identité/fréquence, `sleep_ms` (alarme TIMER), fronts GPIO vus **côté JS**
(`gpio[n].addListener`, le chemin de nos composants), `machine.Timer` périodique,
`Pin.irq`, PWM, ADC, NeoPixel (PIO), scan I²C, puis un calcul pur pour la vitesse.
Tout est synchrone : `mcu.step()` rappelle CDC et GPIO dans la foulée, donc une
simple boucle suffit et la mesure n'est pas polluée par une boucle d'événements.

## `optim-thumb16-table.patch` — le cache de décodage M33, essayé

Produit par [`transforme-thumb16.py`](transforme-thumb16.py), qui réécrit
mécaniquement `execute-thumb16.ts` : cascade de 74 `else if` → classification pure
+ table `Uint8Array(65536)` bâtie au chargement + `switch` dense (saut de table
V8). Correct (898 tests verts, banc fonctionnel identique), **et il ne rapporte que
×1,03** : décoder du Thumb est bon marché par nature, contrairement au RISC-V dont
les immédiats éclatés justifient leur cache. Gardé comme acquis sans risque, pas
comme une piste.

## `correctifs-rp2350js.patch`

Deux bugs du fork, trouvés et corrigés pendant l'évaluation (non proposés en amont
à ce jour) :

1. **IRQ GPIO morte sur RP2350**, les deux cœurs (`io_rp2350.ts`) : le portage
   depuis le RP2040 a gardé un décodage de registre en `% 0x18` qui ne retombe
   jamais sur `INTR0`/`PROC0_INTE0`/… — écrire l'activation d'IRQ ne faisait rien,
   lire l'état rendait toujours 0. Deux lignes. `Pin.irq` fonctionne après.
2. **Compteurs de cycles absents côté RISC-V** (`riscv/cpu.ts`) : `mcycle` (CSR
   0xB00) et ses voisins tombaient dans le cas « CSR inconnu » et rendaient 0 en
   boucle — mesuré 14,3 millions de lectures pendant un `NeoPixel.write()`, qui
   figeait pour de bon. ~15 lignes. Le NeoPixel passe après.

Reste ouvert : le **scan I²C fige sur RISC-V** (boucle d'attente dans le pilote
MicroPython, `mcause` = interruption externe machine ; le M33 et leur RP2040 s'en
sortent). Non élucidé — ce n'était plus nécessaire au verdict.

## Chiffres de référence (22/08/2026, Ryzen 5 2600, JS compilé, meilleure de 3)

| Moteur | Minstr/s | Régime |
|---|---|---|
| Kablix — `rp2040js` patché | 12,24 | ×0,156 |
| `rp2350js` RP2040 (M0+) | 11,34 | ×0,149 |
| `rp2350js` RISC-V | 10,96 | ×0,107 |
| `rp2350js` Cortex-M33 | 8,04 | ×0,109 |
| `rp2350js` RISC-V, cache de décodage coupé | 5,69 | ×0,056 |

**Ces régimes absolus ne valent que pour leur fenêtre de mesure** (la même machine
a rendu ×0,204 puis ×0,256 pour Kablix dans la même soirée), et le tableau n'est
pas entrelacé : ne pas en tirer de rapports. Les seuls rapports fiables, mesurés
en alternance :

| Comparaison entrelacée | Rapport |
|---|---|
| M33 contre le moteur Kablix | **60-70 %** (deux fenêtres) |
| cache de décodage RISC-V, branché contre coupé | **×1,44** |
| table de décodage Thumb-16 sur le M33 | **×1,03** |
