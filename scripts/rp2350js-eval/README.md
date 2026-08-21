# Évaluation de `c1570/rp2350js` — bancs et correctifs (21 août 2026)

Matériel de la piste 7/8 de [`roadmap.md`](../../roadmap.md). Verdict détaillé :
[`vitesse-pico.md`](../vitesse-pico.md) §15. Rien ici n'est branché dans
`verify:all` — ce sont des bancs à rejouer **hors de Kablix**, contre un clone du
fork, le jour où l'on re-sonde le projet.

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
```

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
