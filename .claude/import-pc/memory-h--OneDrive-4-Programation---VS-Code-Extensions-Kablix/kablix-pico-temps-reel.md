---
name: kablix-pico-temps-reel
description: v2026.7.65/86 — tempête IRQ USB-CDC (NAK 1 ms), cadencement temps réel, cycles avancés pendant WFE ; v86 = clock.tick PAR INSTRUCTION (SysTick/bitstream) + alarmes simultanées FIFO (SPI+DMA)
metadata: 
  node_type: memory
  type: project
  originSessionId: 7e2113cb-0891-4359-a407-ec33c06d9d8a
---

Simulation Pico (v2026.7.65, juillet 2026) — trois mécanismes liés dans `pico.mts`, à ne pas défaire :

1. **Tempête IRQ USB-CDC** : quand la FIFO hôte→Pico est vide, rp2040js répond au endpoint OUT du CDC « transfert vide » en 10 µs et TinyUSB réarme aussitôt → IRQ toutes les ~25 µs qui avorte chaque WFE. `time.sleep()` devenait une boucle chaude (20 000 réveils/0,5 s, ~4× le temps réel). Correctif : wrapper de `usb.onEndpointRead` qui répond en 1 ms (cadence trame USB full-speed) quand la FIFO est vide.
2. **Cadencement temps réel** (`KablixSimulator.execute`) : ancre `paceWall`/`paceSim` ; avance > 8 ms → nap `setTimeout` ; retard > 50 ms → ré-ancrage SANS dette (un rattrapage escamoterait les sleep suivants — c'est voulu que le code calculatoire reste sous le temps réel, plafond interpréteur rp2040js ≈ 20-25 MHz effectifs).
3. **`core.cycles` avance pendant les sauts WFE** (bump AVANT `clock.tick`) : toute l'instrumentation Kablix (servo `samplePulses`, `readPwmDuty`, WS2812) est horodatée en `core.cycles`, qui sinon gèle pendant les sauts → mesures fausses pendant les sleep.
4. **`clock.tick()` PAR INSTRUCTION dans le lot** (v2026.7.86) : un tick une-fois-par-lot gelait `SYST_CVR` (Timer32 dérivé de `clock.nanos`) pendant ≤ 1 ms simulée → `machine.bitstream` (NeoPixel), qui busy-wait SysTick à 0,4-0,9 µs près, sortait des durées HAUT toutes identiques (« interpréteur ARM infidèle » de v2026.7.82 = faux diagnostic). Ne PAS re-grouper le tick pour optimiser — régressions : `verify:neopixel`, `verify:spi`.
5. **Alarmes simultanées en FIFO** (patch rp2040js v2026.7.86, `simulation-clock.js`) : le `<` LIFO d'origine laissait le canal DMA TX (reschedule à échéance 0) doubler éternellement l'alarme du canal RX → rxFIFO SPI en overrun, `machine.SPI` ≥ 32 octets (chemin DMA firmware) bloqué à jamais sur `dma_channel_is_busy`.

**Comment vérifier** : repro node qui charge le vrai UF2 (globalStorage franksauret.kablix) via le pattern de `scripts/verify-micropython.mjs`, marqueurs série + `Date.now()` ; compter les réveils en enveloppant `core.waiting` par `defineProperty`. `machine.lightsleep` = référence du saut parfait (1 réveil).

Voir aussi [[kablix-pico-lib-injection]], [[kablix-siminfra-simcontrol]].
