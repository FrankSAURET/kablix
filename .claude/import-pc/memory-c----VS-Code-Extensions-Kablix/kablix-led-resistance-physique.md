---
name: kablix-led-resistance-physique
description: "Physique LED/résistance série (v2026.7.99) : ledSeriesOhms (Dijkstra sur netlist non fusionnée) + ledElectrical (seuils 35 mA flamme / 10 mA plein / 0,2 mA éteinte) — à étendre à RGB/7seg/barre"
metadata: 
  node_type: memory
  type: project
  originSessionId: 095cfc0c-a023-4dfd-979a-32774ff5eea7
---

v2026.7.99 (LED simple). Dans model.mts :
- `buildNets(diagram, joinResistors=false)` : netlist où chaque résistance garde ses 2 nets — les autres usages passent `true` (défaut, comportement historique « résistance = fil »).
- `ledSeriesOhms(diagram, ledId)` : Dijkstra nets→nets, arêtes = résistances (attr `value`), chemin min broche source (MCU digital/VCC) → anode PLUS cathode → GND. 0 = direct, null = ouvert, parallèle = chemin min (pire cas).
- `ledElectrical(ohms, vsupply, color)` : I=(Vs−Vf)/R, `LED_FORWARD_V` par couleur (red 1.8 … blue 3.0, white 3.2). Seuils : >35 mA = `overCurrent` (grillée), lum=1 dès 10 mA, proportionnel dessous, 0 sous 0,2 mA.
- sim.mts : `burnedLeds` (Set, vidé au startRun — ▶/⟲ « remplacent » la LED), flamme = prop `burned` du fork led-element (flamme animée + verre #3a3a3a + halo off). Le duty PWM ne protège PAS du courant de crête.

**Why:** item Frank « résistance trop faible → flamme, trop forte → LED sombre, valable pour tous les composants à résistance indispensable ».

**How to apply:** pour étendre à la LED RGB / 7 segments / barre LED (item resté en tête de todo) : réutiliser `ledSeriesOhms` par canal/segment (anode = broche R/G/B ou segment, masse/commun selon `common`), garde-fou existant `verify:led`. Liens : [[kablix-siminfra-simcontrol]].

v2026.7.102 — LDR/CTN/CTP nues (types `ldr`/`ntc`/`ptc`, kind `resistor`) : `variableResistorOhms` (caractéristiques R(x)), `resistiveGraph(diagram, liveOhms?)` (valeur courante du curseur + partId par arête), `adcDividerLevels` = pont diviseur vu par chaque ADC (Dijkstra vers VCC et GND avec `avoid` = rail opposé — un rail n'est PAS un conducteur de passage) ; garde-fou `verify:divider` (32 contrôles). Étendu = même modèle pour tout futur composant résistif variable.
