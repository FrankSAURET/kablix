# Vitesse du simulateur Pico — état des mesures (7 août 2026)

Machine de référence : Ryzen 5 2600 (6 cœurs, 3,85 GHz, 2018), Windows 11, Node 22
et Chromium 140. Sketch de référence : `testkablix/Horloge.py`, firmware
`RPI_PICO-20230426-v1.20.0.uf2` sauf mention contraire.

Outils : `_mesure-regime-pico.mjs`, `_mesure-pico-chromium.mjs`,
`_mesure-firmware-pico.mjs`, `_mesure-instr-firmware.mjs`, `_diag-alarmes-pico.mjs`,
`_ab-boucle-pico.mjs`, `_ab-rattrapage-pico.mjs`, `_mesure-debit-pico.mjs`.

> **Piège de mesure.** Un moteur `stop()` continue de faire tourner ses
> périphériques : mesurer plusieurs variantes dans un même processus divise par
> deux tout ce qui suit la première. Tous les bancs relancent désormais un
> processus par variante. Sans ça, on « prouve » n'importe quoi — le 7 août 2026,
> MicroPython ≥ 1.22 a semblé deux fois plus lent : c'était l'artefact.

## 1. Ce qui n'est PAS en cause

| Hypothèse | Mesure | Verdict |
| --- | --- | --- |
| Le moteur a régressé depuis v2026.8.12 | régime **1,00** hors webview | non |
| La webview (Chromium) est plus lente que Node | 1,00 / 67 % contre 1,00 / 82 % | non |
| La version du firmware | 1.20, 1.22.2, 1.24.1, 1.28.0, W 1.20, W 1.28 → **0,99-1,00** | non |
| La variante Pico W (CYW43 + lwIP) | idem, 1,00 | non |
| Le latch 7 segments à chaque front GPIO | `--latch` : régime inchangé | non |
| Les réveils d'alarme (USB-CDC) | 1,4 alarme par ms simulée, 91 % de sommeil | marginal |

## 2. Où part le temps

### La charge, en instructions

| Grandeur | Valeur |
| --- | --- |
| Instructions ARM émulées par ms **simulée** | 10 943 |
| Débit de l'émulateur sur cette machine | 11,6 Minstr/s |
| Part du temps simulé passée endormie (WFE, gratuite) | 91 % |
| Occupation d'un cœur pour tenir 1,00 | 82 → 94 % |

Le calcul qui explique tout :

- le vrai Pico exécute 125 000 cycles par ms, mais MicroPython **dort 91 % du
  temps** → ~11 000 instructions utiles par ms ;
- l'émulateur en produit 11 600 par ms réelle ;
- 10 943 / 11 600 = **0,94** → il reste **6 % de marge**.

Autrement dit : une instruction émulée coûte **86 ns** d'hôte contre 8 ns sur la
puce — l'émulateur est **11× plus lent que le silicium**. Il ne tient le temps
réel que parce que le programme dort. Le seuil de rupture, sur cette machine :

> **le temps réel est tenu tant que le programme Pico n'utilise pas plus de ~9 %
> de son propre CPU.** Au-delà, l'horloge simulée retarde, proportionnellement.

### Le profil (temps propre, `--cpu-prof`)

| Fonction | Part |
| --- | --- |
| `executeInstruction` (interpréteur Thumb de rp2040js) | 40,5 % |
| boucle `execute` du `KablixSimulator` | 17 % |
| idle / boucle d'événements | 7,2 % |
| `findPeripheral` | 5,6 % |
| `readUint16` (deux sites) | 5,5 % + 4,5 % |
| `readUint32` | 2,9 % |
| `writeUint32` | 2,8 % |
| `substractUpdateFlags` | 2,1 % |
| `cyclesIO` | 1,7 % |

≈ 85 % dans l'émulation pure. Le rendu de la webview pèse ~1 %.

### Ce que la boucle coûte (A/B, un processus par variante)

| Variante | régime | moteur | Minstr/s |
| --- | --- | --- | --- |
| référence | 1,00 | 91 % | 12,1 |
| sans `pio[].advance()` ×2 par instruction | 1,01 | 88 % | 12,5 |
| `clock.tick` groupé jusqu'à la prochaine alarme | 0,99 | 97 % | 11,7 |
| les deux | 0,94 | 99 % | 10,8 |

Le régime est plafonné à 1,00 par le pacing : c'est la colonne **moteur** qu'il
faut lire. Supprimer les deux `advance()` inutiles semble rendre ~3 % — **ce
chiffre n'a pas tenu**, le même banc rejoué après les lots 1 et 2 ne montre plus
rien du tout (§10) : c'était du bruit. Grouper les ticks est **contre-productif**
(le test « faut-il verser maintenant ? » coûte plus cher que le tick lui-même) —
la piste abandonnée en v2026.7.86 est définitivement close.

## 3. Pourquoi ça marchait et plus maintenant

Rien n'a régressé : le moteur fait toujours 1,00. Mais il le fait en occupant
**82 à 94 % d'un cœur**. La marge est de 6 à 18 % — moins que la variation
normale d'une machine (fréquence turbo qui retombe, un scan d'antivirus, une
synchro OneDrive, une deuxième webview ouverte, une autre fenêtre VS Code).

Le régime n'est pas binaire : il glisse. Le jour du chronomètre, la marge suffisait.
Aujourd'hui, une charge de fond de 10 % suffit à faire retarder l'horloge.

## 4. Un PC plus rapide ?

Oui, franchement — c'est du **monothread pur** : seule compte la performance d'un
cœur (IPC × fréquence). Ni le nombre de cœurs ni la carte graphique n'entrent en
jeu.

| Machine | Perf 1 cœur | Débit estimé | Budget CPU du programme Pico |
| --- | --- | --- | --- |
| Ryzen 5 2600 (2018, la machine de test) | ×1 | 11,6 Minstr/s | ~9 % |
| Portable milieu de gamme 2024 | ×2,5 | ~29 Minstr/s | ~23 % |
| Desktop haut de gamme 2024-2025 | ×4 | ~46 Minstr/s | ~37 % |
| Portable scolaire type N100 | ×1,2 | ~14 Minstr/s | ~11 % |

Conclusion : sur une machine récente le problème disparaît pour `Horloge.py`, mais
il reviendra dès qu'un sketch demandera plus de travail au Pico — et il reste
entier sur les machines d'élèves. **Ce n'est pas seulement « son PC ».**

## 5. Catalogue de solutions

### Niveau 0 — sans code, tout de suite

| # | Action | Gain | Coût |
| --- | --- | --- | --- |
| 1 | Vérifier le sélecteur de vitesse : 🐇 100 % (🐢 = 10 %, 🐌 = 1 %) | ×10 si c'était ça | nul |
| 2 | Plan d'alimentation Windows « Performances élevées » | 5-15 % | nul |
| 3 | Fermer les autres simulations Kablix ouvertes (chacune prend un cœur) | 0-50 % | nul |
| 4 | Suspendre la synchro OneDrive / le scan antivirus pendant les mesures | 5-15 % | nul |

Vu la marge de 6-18 %, ces quatre points peuvent suffire sur cette machine.

### Niveau 1 — traiter la dérive plutôt que la vitesse

| # | Piste | Gain | Coût |
| --- | --- | --- | --- |
| 5 | **Rattrapage borné** — ✅ **fait (v2026.8.17)**, cf. §7. | dérive ÷5 sur charge ponctuelle ; nul si la machine est saturée en permanence, comme prévu | petit (boucle `execute`) |
| 6 | **Badge honnête** : afficher le retard cumulé en secondes, pas seulement un %, et proposer explicitement 🐢 quand la machine ne suit pas | confort | petit |
| 7 | **Rendu adaptatif** : passer le `renderTick` à 30 Hz quand le moteur sature | 1-3 % | petit |

### Niveau 2 — moins de travail à émuler

| # | Piste | Gain mesuré/estimé | Coût |
| --- | --- | --- | --- |
| 8 | Supprimer `pio[0].advance()` / `pio[1].advance()` par instruction quand aucune machine PIO n'est armée — ⛔ **fermée**, gain réel nul, cf. §10 | 0 % (remesuré) | — |
| 9 | Espacer le polling USB-CDC quand la console est fermée et qu'aucune entrée n'est en attente (1 alarme par ms simulée aujourd'hui) | 2-5 % | moyen |
| 10 | Ne pas faire tourner le cœur 1 tant qu'il n'a pas été lancé | selon sketch | petit |

### Niveau 3 — accélérer l'interpréteur (fork de rp2040js, déjà patché)

| # | Piste | Gain estimé | Coût |
| --- | --- | --- | --- |
| 11 | **Cache de décodage** indexé par PC — ⛔ **sans objet** : #12 rend le décodage déjà O(1), cf. §9 | — | — |
| 12 | **Table de dispatch** à la place de la cascade de `if` — ✅ **fait (v2026.8.19)**, cf. §9 | 10-25 % | moyen |
| 13 | Cache de page dans `findPeripheral` — ✅ **fait (v2026.8.18)**, cf. §8 | ~5 % | petit |
| 14 | Accès mémoire directs (SRAM d'abord, opcode lu dans `flashView`) — ✅ **fait (v2026.8.18)**, cf. §8 | 5-10 % | moyen |
| 15 | **Flags paresseux** : ne calculer N/Z/C/V qu'au moment où un branchement les lit — ⛔ **fermée** : plafond 3,3 % au profil, sous la résolution du banc, cf. §10 | — | — |

Cumul obtenu : **+30 %** (#13, #14, #12), soit un budget programme de ~12 % au
lieu de 9 %. Le niveau 3 est **terminé** — §10 dit pourquoi les pistes restantes
ne rendent rien. Contrainte respectée : `verify:all` + `testkablix` à chaque
étape, les régressions de timing sont sournoises.

### Niveau 4 — changer de moteur d'exécution

| # | Piste | Gain | Coût | Verdict |
| --- | --- | --- | --- | --- |
| 16 | **Cœur Cortex-M0+ en WASM** (Rust ou C compilé), périphériques laissés en JS. Le jeu Thumb du M0+ est petit (~60 instructions) — c'est un projet fini, pas un puits sans fond. | ×2 à ×4 | gros (mémoire partagée JS↔WASM, réécriture du cœur, tests) | la vraie solution technique |
| 17 | **JIT blocs Thumb → WASM** à la volée (façon v86) | ×5 à ×20 | très gros ; la difficulté n'est pas la traduction mais les IRQ et la granularité du compteur de cycles dont les périphériques ont besoin | disproportionné |
| 18 | **MicroPython WASM natif** : le port `webassembly` existe en amont ; on n'émule plus de CPU du tout et on branche `machine`/`rp2` sur du JS | ×50 à ×100 | gros : réimplémenter `machine`, `rp2`, `neopixel`… et rebrancher tous les composants ; perd la fidélité (timing d'instruction, `time.ticks_us`, PIO, DMA, `asm_thumb`) | second moteur « rapide » à côté du moteur « fidèle », pas un remplacement |
| 19 | **Web Worker** pour le moteur | **+7 % (chiffré)** — le moteur détient 92 % du fil | moyen | à faire pour la fluidité de l'UI, pas pour la vitesse |

### Niveau 5 — carte graphique : non

Argument, pour ne plus y revenir :

- l'émulation d'un CPU est **strictement séquentielle** : chaque instruction
  dépend des registres, des flags et de la mémoire laissés par la précédente. Un
  GPU va vite en traitant 10 000 tâches **indépendantes** à la fois ; ici il n'y
  en a qu'une seule ;
- un cœur GPU isolé est ~10× **plus lent** qu'un cœur CPU sur du code de contrôle
  plein de branchements (divergence de warp) ;
- chaque aller-retour CPU↔GPU coûte des dizaines de µs ; il en faudrait plusieurs
  par ms simulée — le trajet coûterait plus cher que le calcul lui-même ;
- ce qui pourrait légitimement y aller, c'est le **rendu** (déjà confié au
  compositeur du navigateur) et éventuellement un afficheur ILI9341 en shader :
  le rendu pèse ~1 %, sans objet.

Seul cas où un GPU aurait du sens : simuler **cent Pico à la fois** (une classe
entière sur un serveur). Ce n'est pas le problème posé.

## 6. Chiffrage : niveau 3 contre #16

Jours de travail assisté (moi qui code, Frank qui valide), régressions et tests
compris.

### Niveau 3 — optimiser l'interpréteur JS (fork rp2040js)

`cortex-m0-core` fait ~1 250 lignes compilées ; le fork existe déjà
(`patches/rp2040js+1.3.3.patch`), donc pas de mise en place à faire.

| # | Travail | Jours | Survit à #16 ? |
| --- | --- | --- | --- |
| 13 | cache de page dans `findPeripheral` — ✅ fait | 0,5 | **oui** (les périphériques restent en JS) |
| 14 | accès mémoire par TypedArray/DataView — ✅ fait | 1-2 | partiellement (la RAM passe en WASM, le bus périphériques reste) |
| 11 + 12 | cache de décodage + table de dispatch — ✅ fait ; #11 s'est révélé sans objet | 4-6 | **non** — jeté |
| 15 | flags N/Z/C/V paresseux | 2-4 | **non** — jeté |
| — | bancs, `verify:all`, `testkablix`, chasse aux régressions de timing | 1-2 | **oui**, réutilisés tels quels |
| | **Total** | **9-15 j** | ~40 % du travail réutilisable |

Livrable par lots indépendants, chacun mesurable, chacun publiable. Risque
faible, sauf #15 (les faux positifs de flags sont sournois).

### #16 — cœur Cortex-M0+ en WASM

| Travail | Jours |
| --- | --- |
| Choix techno et squelette (Rust + `wasm-bindgen`, ou C/Zig) | 1 |
| Jeu d'instructions Thumb-1 + les quelques Thumb-2 du M0+ (`BL`, `MRS`, `MSR`, `DMB`/`DSB`/`ISB`) | 5-8 |
| Exceptions : NVIC, SysTick, modes thread/handler, empilement, `SVCall`, `PendSV` | 4-6 |
| Pont mémoire : RAM + flash en mémoire linéaire WASM, trappes vers JS pour la zone périphériques (`0x40000000+`) et le SIO (`0xd0000000`) | 3-5 |
| Compteur de cycles, alarmes, `WFE`/`WFI`, boucle d'exécution avec budget côté WASM | 2-3 |
| Second cœur + SIO/FIFO/spinlocks | 2-3 |
| Banc de conformité : rejouer un firmware et comparer registre par registre avec le moteur JS | 3-4 |
| Build (wasm inline en base64 — voir la CSP ci-dessous), taille du binaire, intégration esbuild | 2-3 |
| Régressions `testkablix` sur les 40+ schémas | 3-5 |
| **Total** | **25-38 j** |

Deux points durs, à connaître avant de s'engager :

- **CSP de la webview.** Aujourd'hui `script-src 'nonce-…'`
  ([webview-html.ts:64](../src/webview-html.ts#L64)) : `WebAssembly.instantiate`
  y est **bloqué**. Il faut ajouter `'wasm-unsafe-eval'`. Une ligne, mais à
  vérifier tôt — pas après trois semaines de Rust.
- **La granularité de cycle.** Tous les périphériques Kablix dépendent de
  `clock.tick()` appelé PAR instruction (SysTick, NeoPixel, alarmes FIFO du
  SPI+DMA — cf. v2026.7.86 et v86 dans `todo.md`). Repasser la frontière
  JS→WASM à chaque instruction annulerait tout le gain : il faut faire tourner
  l'horloge **dans** le WASM et ne remonter en JS que sur événement. C'est ce
  qui rend le pont plus coûteux que le cœur lui-même.

### L'un exclut-il l'autre ?

**Non, et l'ordre naturel est niveau 3 d'abord.**

- Le moteur JS **reste la référence de conformité** de #16 : sans lui, aucun
  moyen de savoir que le cœur WASM se trompe. Il ne disparaît jamais.
- Les bancs (`_mesure-*`, `_ab-*`) et la discipline « un moteur par processus »
  servent identiquement aux deux.
- Ce qui est perdu si on fait les deux : ~6 à 10 jours (#11, #12, #15). Ce n'est
  pas rien, mais c'est le prix d'un gain **livrable dans le mois** au lieu d'un
  gain livrable dans le trimestre.
- Le niveau 3 est aussi le **plan B** : si #16 s'enlise (le pont, la CSP, les
  deux cœurs), on garde ×1,5 à ×2 déjà en production.

Seul cas où sauter directement à #16 se défend : décider que ×2 ne suffit pas et
que seul ×4 règle le problème pour les machines d'élèves. C'est un pari de 5 à 8
semaines contre un acquis de 2 à 3.

## 7. #5 livré — ce que le rattrapage borné donne vraiment

Banc : `_ab-rattrapage-pico.mjs`. Il gèle le thread par busy-wait synchrone —
seule façon de voler du temps à la boucle comme le ferait un layout ou une autre
fenêtre — et lit la dérive de l'horloge simulée. Un processus par variante ; l'A/B
se fait par `git stash` du patch.

### Charge PONCTUELLE (`blink-pico.py`, 300 ms gelées toutes les 8 s = 4 %)

| | dérive sur 40 s | régime |
| --- | --- | --- |
| avant | **−1 447 ms** (escalier : chaque gel s'ajoute, rien ne revient) | 0,964 |
| après | **−286 ms** (le seul gel en cours) | 0,993 |

Chaque gel de 300 ms est intégralement remboursé en ~6 s, à un régime de ~1,11 —
sous le plafond de 1,25. C'est le cas d'usage visé : la dérive ne s'accumule plus.

### Charge PERMANENTE (`Horloge.py`, 150 ms toutes les secondes = 15 %)

Dette au plafond en 12 s, dérive −11,8 %, régime 0,88. **Aucun rattrapage, et
c'est normal** : `Horloge.py` occupe déjà 82-94 % d'un cœur (§2), il n'y a
matériellement pas de marge pour rembourser quoi que ce soit. Le plafond de dette
existe exactement pour ça — assumer le retard plutôt que faire courir la
simulation pendant des minutes une fois la charge retombée.

À noter, mesuré au passage : `Horloge.py` **sans aucune charge ajoutée** tourne à
**0,971** sur cette machine (dérive −2,9 % sur 22 s). Le 1,00 de v2026.8.12 était
mesuré sur une machine au repos ; la marge de 6 % annoncée au §3 est bien
consommée par le bruit de fond ordinaire.

### Trois pièges rencontrés

1. **Rembourser en raccourcissant la sieste ne marche pas.** Les siestes font 4 à
   5 ms ; sur Windows un `setTimeout` de cet ordre dérive déjà de plus que ce
   qu'on lui retranche. Remboursement mesuré : **nul**. Ce qui marche, c'est de
   décaler l'ancre — remettre le moteur « en retard » et le laisser combler par
   ses sauts d'alarme, gratuits.
2. **Le boot du firmware n'est pas une dette.** MicroPython démarre en calcul pur,
   l'émulateur y accumule forcément du retard. Sans ré-ancrage à l'entrée en
   `stdout`, les premières secondes du script de l'élève couraient pour rembourser
   un retard qui n'appartient à aucune horloge.
3. **Une pause n'est pas une dette non plus** (`resume()` ré-ancre), et un écart
   supérieur à la dette maximale d'un seul coup n'est pas un manque de puissance
   mais un gel de page (onglet caché, veille) : rien à rattraper.

## 8. Niveau 3, lot 1 — #13 et #14 livrés (v2026.8.18)

### La mesure : Minstr/s, pas le régime

Le régime ne convient **pas** pour juger l'interpréteur : le cadencement le
plafonne à 1,00, donc une accélération de 30 % s'y lit… 1,00. Le banc
`_mesure-debit-pico.mjs` mesure le **débit brut** : `setSpeed(100)` une fois le
script parti (le moteur ne dort plus), `executeInstruction` compté sur 5 s,
divisé par `busyMs()`. Un processus par répétition.

> **On compare le MEILLEUR run, pas la médiane.** Le bruit de cette machine
> (turbo qui retombe, OneDrive, antivirus) ne peut que *ralentir* une répétition,
> jamais l'accélérer : la médiane mesure autant l'humeur de la machine que le
> code. Dispersion typique ici : 12-14 % — assez pour noyer un gain de 5 % si on
> lit la mauvaise statistique.

| | meilleur | médiane |
| --- | --- | --- |
| avant | 12,76 Minstr/s | 11,53 |
| après | **14,34** Minstr/s | **13,27** |
| gain | **+12 %** | +15 % |

Confirmé sur deux campagnes (5 puis 10 répétitions).

### Ce qui a changé, quatre insertions dans le patch

1. **`findPeripheral` : un test d'intervalle avant le dictionnaire.**
   `peripherals` est un objet ordinaire indexé par de grands entiers épars, donc
   V8 le range en *mode dictionnaire* et chaque accès hache. Or `writeUint32`
   interrogeait `findPeripheral` **en premier** : chaque écriture en RAM payait un
   hachage pour rien. Une comparaison (`address < 0x40000000`) écarte bootrom,
   flash et SRAM d'un coup.
2. **`readUint32` : la SRAM testée avant le bootrom.** Les quatre plages sont
   disjointes, l'ordre est donc un pur choix de performance — et MicroPython lit
   la SRAM bien plus souvent que le bootrom, que l'amont teste en premier.
3. **`writeUint32` : la SRAM avant `findPeripheral`.** Aucune clé de périphérique
   ne tombe dans la fenêtre SRAM ; on sort l'écriture la plus fréquente de tout
   l'émulateur du chemin périphérique.
4. **L'opcode lu directement dans `flashView`.** `executeInstruction` passait par
   `readUint16` → cascade de comparaisons, deux fois par instruction large. Le
   code exécuté est en flash dans 99,9 % des cas : un `getUint16` direct, avec
   repli sur `readUint16` pour la RAM, le bootrom et un PC négatif.

Rien n'est une réécriture : quatre insertions, ordre des branches et raccourcis,
sur des plages disjointes. Le patch reste rebasable sur l'amont (la branche SRAM
d'origine de `readUint32`, devenue morte, est laissée en place exprès).

### Ce que ça change pour l'élève

Budget CPU du programme Pico avant rupture du temps réel : **~9 % → ~10 %** sur
la machine de référence. Autrement dit : pas encore le sujet. Le gros morceau du
niveau 3 reste **#11 + #12** (cache de décodage + table de dispatch, 20-40 %).

## 9. Niveau 3, lot 2 — la table de décodage (v2026.8.19)

### Le problème : 42 comparaisons pour choisir une instruction

`executeInstruction` décodait l'opcode par une cascade de **83 `else if`**, rangés
par ordre alphabétique de mnémonique. Une instruction au milieu de l'alphabet
payait donc ~42 tests de bits — avant même de commencer son travail. Et le
processeur hôte se trompe de prédiction à chaque fois que le programme émulé
change d'instruction, c'est-à-dire tout le temps.

### La solution : les conditions ne dépendent que des bits

Les 83 conditions portent **uniquement sur les bits de l'opcode**, jamais sur
l'état du cœur. Elles sont donc calculables une fois pour toutes : une table
`Uint8Array(65536)` (64 Ko, tient au chaud dans le cache) donne directement le
numéro d'opération, et le `switch` dessus compile en table de saut. Décoder coûte
désormais **un accès mémoire et un saut**, quelle que soit l'instruction.

Sept branches (BL, DMB, DSB, ISB, MRS, MSR, UDF.W) testent aussi `opcode2`,
inconnu au moment de remplir la table. Elles partagent toutes le préfixe
`0b11110` — qu'aucune autre branche ne revendique — et sont regroupées dans un
`case` unique qui rejoue leur mini-cascade d'origine. BL, la seule fréquente des
sept, y est testée en premier.

| | meilleur | médiane | dispersion |
| --- | --- | --- | --- |
| après le lot 1 | 14,34 Minstr/s | 13,27 | 13,5 % |
| après la table | **16,61** Minstr/s | **16,35** | **3,9 %** |
| gain | **+16 %** | +23 % | |

La chute de la dispersion (13,5 % → 3,9 %) est un résultat en soi : le temps
d'exécution ne dépend plus de *quelle* instruction tombe, donc le débit ne varie
plus qu'avec l'humeur de la machine.

**Cumul du niveau 3 à ce stade : 12,76 → 16,61 Minstr/s, soit +30 %.**

### #11 est devenu sans objet

Le cache de décodage indexé par PC visait à ne pas repayer la cascade à chaque
passage dans une boucle. Avec une table indexée par l'opcode, le décodage coûte
déjà un accès tableau : un cache par PC coûterait autant et consommerait 1 Mo.
**Piste fermée** — c'est 2 des 4-6 jours estimés qui tombent.

### Un patch produit par script, pas à la main

Déplacer 700 lignes à la main, sans filet, et recommencer à chaque montée de
version de rp2040js : non. La transformation est faite par
**`scripts/_gen-decode-rp2040.mjs`**, qui découpe la cascade, recopie les corps
**octet pour octet** (seule la ligne `else if (…) {` devient `case N: {`) et
écrit au passage `scripts/_decode-reference.json` — la cascade d'amont, ordre
compris, avec l'empreinte SHA de chaque corps. Après une montée de version :

```
npm i rp2040js@<version>
node scripts/_gen-decode-rp2040.mjs
npm run verify:decode
npx patch-package rp2040js
```

### L'équivalence est prouvée, pas supposée

**`npm run verify:decode`** (dans `verify:all`), 6 contrôles :

1. les 76 corps sont au bon numéro, avec la bonne empreinte — rien n'a été
   déplacé ni perdu ;
2. le `case` groupé rejoue les 7 conditions larges **dans l'ordre d'amont** ;
3. les **65 536** opcodes désignent la même instruction qu'avant — exhaustif ;
4. **16,8 millions** de couples (opcode, opcode2) pour les instructions larges ;
5. hors du préfixe `0b11110`, la décision ne dépend jamais d'`opcode2` — c'est
   l'hypothèse qui autorise à indexer la table sur le seul opcode, elle est
   vérifiée et non postulée ;
6. la table couvre bien les 78 opérations déclarées.

**Contre-épreuve faite** (3/3) : un corps altéré, une condition de table élargie
et l'ordre des instructions larges inversé sont tous les trois détectés.

## 10. Le niveau 3 s'arrête là — et pourquoi (7 août 2026)

Après le lot 2, un nouveau profil montre que les lots 1 et 2 ont bien vidé leurs
cibles : `findPeripheral` passe de 5,6 % à 0,4 %, `readUint16` de ~10 % à 0,5 %.
Le temps restant se répartit ainsi :

| poste | part | verdict |
| --- | --- | --- |
| `executeInstruction` (corps des instructions) | 52 % | travail utile, rien à réordonner |
| boucle `execute` de `pico.mts` | 25,6 % | **attribution trompeuse**, voir ci-dessous |
| `readUint32` / `writeUint32` | 11,1 % | déjà SRAM-d'abord depuis le lot 1 |
| `cyclesIO` | 2,7 % | |
| `substractUpdateFlags` + `addUpdateFlags` | 3,3 % | plafond de #15 |

### Trois tentatives, trois fois rien

**#8 — les deux `pio.advance()` par instruction.** Sortie anticipée sur les quatre
drapeaux `enabled` de `RPPIO.advance` : 16,44 contre 16,61. Nul, parce que
`StateMachine.advance` renvoyait déjà immédiatement sur `!this.enabled` —
l'économie était déjà faite. **Annulé.**

**La boucle `execute` (25,6 % du profil).** Le banc `_ab-boucle-pico.mjs` mesure
le plafond en NEUTRALISANT les appels, ce qu'aucune optimisation ne pourra
battre :

```
ref              15.5 Minstr/s
sans-pio         15.0
tick-groupé      14.7
sans-les-deux    15.6
```

Supprimer **entièrement** `pio.advance()` ×2 **et** `clock.tick()` ne rend rien.
Les 25,6 % ne sont donc pas dans ces appels : c'est `executeInstruction`, inliné
par V8, dont le temps remonte dans l'appelant. **Le profileur désigne ici un
gisement qui n'existe pas** — vérifier au banc avant d'optimiser sur sa foi.

**Accesseurs mémoire du cœur + `cyclesIO` (13,8 % visés).** Les six accesseurs de
`CortexM0Core` étaient de simples relais vers `RP2040` ; fenêtre SRAM inlinée
dedans, plus `if (addr < APB_START_ADDRESS) return 1;` en tête de `cyclesIO`.
A/B **alterné** (les deux versions run après run dans la même campagne, ordre
inversé une fois sur deux, 6 paires) :

```
sans  meilleur 15.54   médiane 14.99
avec  meilleur 15.43   médiane 15.27
écart meilleur -0.7 %   médiane +1.8 %
```

Sous le bruit. **Annulé** : le patch doit être rebasé à chaque montée de version
de rp2040js, il ne se paie pas 40 lignes qu'on ne sait pas mesurer.

Variante testée au passage : `Uint32Array`/`Uint16Array` sur le buffer SRAM au
lieu de `DataView` (ce qu'amont fait déjà pour `flash16`). **Plus lent**, y
compris pour la lecture d'opcode. Ne pas y revenir.

### La résolution du banc est le mur

La même version a donné **16,80** puis **15,94** à vingt minutes d'écart : la
machine dérive de ~5 % au cours d'une session. Deux campagnes successives ne
départagent donc rien en dessous de ~6 %, et l'A/B alterné descend à ~2 % au
mieux. Les mesures de lot à lot ci-dessus restent valables — chacune compare deux
versions dans la MÊME fenêtre — mais les valeurs absolues ne se comparent pas
d'un jour à l'autre.

**#15 est fermée sur ce constat** : son plafond au profil est 3,3 %, et le gain
réel n'en serait qu'une fraction (seuls C et V sont paresseux ; N et Z coûtent
une comparaison). C'est-à-dire un travail délicat — des drapeaux faux se
traduisent par un firmware qui part en vrille loin de la cause — pour un résultat
que le banc ne saura pas distinguer de zéro.

### Bilan du niveau 3

**12,76 → 16,6 Minstr/s, +30 %**, en deux lots (#13, #14, #12), pour ~1,5 jour au
lieu des 9-15 estimés. #11, #15 et #8 sont fermées. Le reste du facteur ×11
demande un changement de nature, pas une optimisation : **#16**.

## 11. Recommandation

1. Niveau 0 chez Frank — vérifier d'abord le sélecteur de vitesse et le chiffre
   de l'infobulle du badge (*Moteur % · Rendu % · Navigateur % · fps*).
2. ✅ #5 (rattrapage borné) — fait.
3. ✅ **Niveau 3 terminé** : #13, #14 (+12 %) puis #12 (+16 %), **cumul +30 %**.
   #11 sans objet, #8 et #15 fermées faute de gain mesurable (§10).
4. Cap : **#16** (cœur Cortex-M0+ en WASM) — la seule piste qui reste à la
   hauteur de l'écart. #18 seulement si un mode « rapide, moins fidèle » devient
   un objectif produit.

## 12. État au 15 août 2026

### Ce qui a bougé depuis le §11 : #19, le fil de simulation

Le moteur ne tourne plus dans le fil de l'interface. Cinq lots (v2026.8.51 →
v2026.8.55, worker **allumé par défaut** depuis) l'ont déplacé dans un Web
Worker. Ça ne rend pas l'émulateur plus rapide — le facteur ×11 est intact — mais
ça change ce que l'élève ressent : **déplacer un composant, ouvrir la palette ou
redimensionner la fenêtre ne vole plus de temps simulé**. Avant, toute l'animation
de l'éditeur se payait sur le dos du firmware.

C'est le dernier gain « gratuit » disponible. Tout ce qui reste demande d'écrire
un cœur.

### « Faire comme Wokwi » : il n'y a rien à rattraper

Point à mettre au clair avant de chiffrer quoi que ce soit : **le moteur est déjà
celui de Wokwi**. `rp2040js` 1.3.3 est publié par `github.com/wokwi/rp2040js`,
auteur `uri@wokwi.com` — comme `avr8js` pour les cartes AVR. Kablix ne court pas
après une implémentation qu'il n'aurait pas : il fait tourner la leur, **patchée
plus loin** (`patches/rp2040js+1.3.3.patch`, +30 % au niveau 3, §8-§10).

Donc « refaire rp2040js pour atteindre les performances de Wokwi » n'a pas de
sens tel quel. La formulation juste est : **écrire le cœur M0+ en WASM**, ce que
le paquet public de Wokwi ne fait pas. C'est #16, et ce serait une avance sur
eux, pas un rattrapage. (Leur ESP32, lui, tourne sur QEMU compilé en WASM :
l'approche existe chez eux, sur une autre puce.)

### Point dur n°1 levé : la CSP, mesurée

Le §6 annonçait le blocage sans le vérifier. C'est fait, en Chrome headless, un
module WASM minimal (`(module (func (export "f") (result i32) (i32.const 42)))`),
une page par CSP, testé **dans la page ET dans un worker `blob:`** :

| CSP | Page | Worker |
| --- | --- | --- |
| `script-src 'nonce-KX'` (celle de la webview aujourd'hui) | **refusé** | **refusé** |
| `script-src 'nonce-KX' 'wasm-unsafe-eval'` | ok (42) | ok (42) |

Deux enseignements. D'abord le message de Chrome est explicite —
*« Compiling or instantiating WebAssembly module violates the following Content
Security policy directive »* — donc l'échec sera lisible, pas mystérieux.
Ensuite, et c'est le point qui n'allait pas de soi : **le worker hérite de la CSP
du document**. Déplacer le moteur dans le worker (#19, livré) ne contourne rien.

Le correctif est bien **une seule ligne**, `script-src 'nonce-${nonce}'` dans
[webview-html.ts](../src/webview-html.ts) (ligne 74 aujourd'hui, 64 quand le §6 a
été écrit). Rien à négocier avec VS Code : la directive est dans notre propre
`<meta>`.

Le point dur n°2 (l'horloge par instruction) reste entier, et reste **le** vrai
risque de #16 : c'est lui qui décide si le cœur WASM tient ses ×2-×4 ou se fait
manger par les allers-retours.

### Si #16 se lance : quatre jalons, chacun avec sa sortie

Le §6 chiffre 25-38 jours d'un bloc. Un bloc de cinq semaines qui ne prouve rien
avant la fin est intenable. Découpage proposé, chaque jalon donnant un chiffre
qui autorise ou interdit le suivant :

1. **Maquette de vitesse (2-3 j).** Pas d'émulateur : une boucle WASM qui décode
   et exécute une poignée d'instructions Thumb sur une RAM en mémoire linéaire,
   plus une variante qui remonte en JS à chaque instruction. Le rapport entre les
   deux mesure directement le prix du pont. *Si le gain brut n'atteint pas ×3,
   #16 est morte* — inutile d'écrire le NVIC.
2. **Cœur nu + conformité (8-12 j).** Thumb-1 complet, exceptions, horloge dans
   le WASM. Sortie : le banc de conformité (rejouer un firmware et comparer
   registre par registre avec le moteur JS) passe.
3. **Pont périphériques (5-8 j).** Trappes vers JS pour `0x40000000+` et le SIO,
   remontée sur événement seulement. Sortie : `blink-pico` tourne, Minstr/s
   mesuré sur le banc habituel.
4. **Second cœur, intégration, régressions (8-15 j).** Sortie : les 40+ schémas
   `testkablix` verts, wasm inline en base64 dans le bundle.

Le jalon 1 coûte deux jours et tue ou valide une piste à cinq semaines. C'est
par là qu'on commence, jamais autrement.

---

## 13. Le banc WASM — jalon 1 joué, #16 tombe (21 août 2026)

Le §12 posait la règle : *« une boucle WASM qui décode et exécute une poignée
d'instructions Thumb… Si le gain brut n'atteint pas ×3, #16 est morte »*. Le banc
est écrit, il tourne, et il répond. **Gain brut : ×1,86 à ×2,3. #16 est morte.**

Outillage : [`_banc-wasm.mjs`](_banc-wasm.mjs) (pilote), [`wasm/noyau.mjs`](wasm/noyau.mjs)
(fabrique du code Thumb), [`wasm/thumb-js.mjs`](wasm/thumb-js.mjs) (miroir JS),
[`wasm/thumb-banc.c`](wasm/thumb-banc.c) → `thumb-banc.wasm`,
[`wasm/banc-navigateur.js`](wasm/banc-navigateur.js) (tour Chrome). Résultats
bruts dans `banc-wasm.json`. Rejouer : `node scripts/_banc-wasm.mjs` (2 min).

### Ce qui a été mesuré, et contre quoi

Trois interpréteurs exécutent **le même code Thumb, octet pour octet** :

| moteur | ce que c'est | rôle |
| --- | --- | --- |
| `rp2040js` patché | le moteur de Kablix aujourd'hui, 78 opérations | contrôle de réalité |
| **miroir JS** | même switch à 25 branches, même table de décodage, même mémoire que le C | **le dénominateur** |
| cœur WASM | `thumb-banc.c` compilé `clang --target=wasm32 -O3` | le candidat |

Le point qui décide de la valeur du chiffre : **le dénominateur est le miroir JS,
pas `rp2040js`**. Mesurer le WASM contre `rp2040js` aurait répondu à côté — une
partie de l'écart serait venue de la taille du switch et du reste de l'émulateur,
pas du langage. Ce que la piste 6 achèterait, c'est le langage seul.

### Le code exécuté n'est pas inventé

Un banc bâti sur un mélange d'instructions arbitraire mesure une puce imaginaire.
[`_mesure-mix-thumb.mjs`](_mesure-mix-thumb.mjs) fait tourner le **vrai firmware
MicroPython** (`blink-pico.py`, 6 s, 7,5 M d'instructions) et compte ce qui passe
dans `executeInstruction` :

```
 1  LSLS (immediate)   13,19 %      9  LDR (literal)       4,57 %
 2  B (with cond)       9,92 %     10  CMP (register)      3,84 %
 3  BL                  7,12 %     11  UXTH                2,72 %
 4  LDR (immediate)     6,10 %     12  B                   2,52 %
 5  MOVS                5,44 %     13  LDRB (immediate)    2,50 %
 6  CMP immediate       4,91 %     …
 7  POP                 4,69 %     cumul des 25 premières : 91,3 %
 8  PUSH                4,69 %
```

`noyau.mjs` fabrique une boucle qui **rejoue ces proportions** : appels et retours
issus de vraies paires `BL`/`BX` et `BL`/`POP {pc}`, réserves de constantes pour
les `LDR` littéraux, branchements visant l'instruction suivante pour que rien ne
soit jamais sauté. Écart au mélange visé, mesuré instruction par instruction sur
le banc : **0,61 %**.

Deuxième chiffre tiré du vrai firmware, et il compte autant : **1,35 accès mémoire
par instruction, dont 4 % vers un périphérique**, soit **une sortie vers JS toutes
les 18 instructions**. Mais 78 % de ce trafic va au TIMER et au SIO — deux blocs
triviaux, qui vivraient *dans* le WASM. En les internalisant il reste l'USB seul :
**une sortie toutes les 85 instructions**. Les deux régimes sont mesurés.

### L'égalité avant la vitesse

Un banc dont les moteurs ne font pas la même chose ne mesure rien. Avant tout
chiffre, le pilote compare **registre par registre, drapeau par drapeau, cycle par
cycle, plus une empreinte de la SRAM**, à six points de contrôle jusqu'à 254 161
instructions — et les trois moteurs sont d'accord, y compris sur les cycles.
(Y compris sur les bizarreries : `addUpdateFlags` de `rp2040js` calcule en
flottants, son second opérande peut valoir 2³² sur `ADCS` et le drapeau C s'en
ressent ; le C reproduit le comportement au lieu de le corriger.) Les deux mondes
« avec périphériques » sont vérifiés de même entre JS et WASM.

Une seule table de décodage existe : les 64 Ko sont construits en JS puis
**écrits dans la mémoire linéaire du WASM**. Le C et le JS ne peuvent pas diverger.

### Les chiffres

Node 24.11.1, meilleur de 3, 1 024 instructions par tour de boucle :

| | Minstr/s | rapport au miroir JS |
| --- | ---: | ---: |
| `rp2040js` patché (78 op.) | 19,6 | ×0,59 |
| **miroir JS (25 op.)** | **33,3** | ×1,00 |
| WASM, rafale pure | 62,0 | **×1,86** |
| WASM, 1 appel JS sortant par instruction | 32,5 | ×0,97 |
| WASM, 1 appel JS entrant par instruction | 35,3 | ×1,06 |

Par tranches de K instructions entre deux retours en JS :

| K | 1 | 4 | 16 | 64 | 256 | 1 024 | 8 192 | 65 536 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ×miroir JS | 0,98 | 1,28 | 1,60 | 1,73 | 1,81 | 1,87 | 1,84 | 1,81 |

Avec les périphériques (chaque accès MMIO repasse réellement en JS) :

| régime | miroir JS | WASM | gain |
| --- | ---: | ---: | ---: |
| 1 sortie / 18 instructions | 28,6 | 59,8 | ×2,09 |
| 1 sortie / 85 instructions | 26,2 | 58,8 | ×2,24 |

Chrome 151, sous la CSP réelle de la webview : miroir JS 30,6 — WASM 60,6 —
**×1,98**. Le moteur est le même V8, le chiffre aussi.

### Ce que ça dit, et ce que ça ne dit pas

**Le pont n'est pas le coupable.** C'était le point dur n°2 annoncé au §12, et il
se lève : dès **K = 64**, on est à 93 % du plafond. Un cœur WASM ne serait pas
tué par ses allers-retours — il suffirait de rendre la main toutes les quelques
dizaines d'instructions, ce qu'un émulateur fait naturellement. Le prix du pont
n'est cher que dans le cas absurde d'un retour à *chaque* instruction (×1,9 de
perte), qu'aucun portage sérieux ne choisirait.

**C'est le plafond du langage qui est bas.** V8 compile bien un interpréteur : un
gros `switch` sur des entiers denses, des `Uint32Array`, des `DataView`, il en
fait du code machine correct. Le même interpréteur en C ne gagne que ×1,9 — pas
les ×3 qui justifiaient cinq semaines, et pas non plus les ×2-×4 annoncés au §6.

**Vérifié plutôt que supposé** : la variante à compteur de cycles entier 64 bits
(au lieu du flottant qui reproduit `rp2040js`) donne 73 contre 72 Minstr/s — dans
le bruit. Le compteur n'est pas le frein.

**Le chiffre qui pique** : le miroir JS, 25 opérations, va **×1,7 plus vite que
`rp2040js`** — en JavaScript, sans WASM. Attention à ne pas en tirer plus qu'il
n'y a : le miroir ne gère ni interruptions, ni périphériques, ni carte mémoire
complète, et une partie de cet écart est du travail que `rp2040js` doit vraiment
faire. Mais l'ordre de grandeur invite à regarder ce qui reste à gratter **dans
le JS** avant d'aller chercher un autre langage.

### Conséquence sur la roadmap

- Piste 3 (`'wasm-unsafe-eval'`) : **faite**, et le banc le prouve dans un vrai
  Chrome, page **et** worker `blob:`. La ligne reste utile quoi qu'il arrive.
- Piste 4 : **close**, verdict rendu.
- Piste 6 (cœur M0+ en WASM, 25-38 jours) : **morte** par la règle du §12. Deux
  jours de banc ont tué cinq semaines de chantier — c'est exactement ce qu'on lui
  demandait.
- Piste 5 (`cts2c`, traduction TypeScript → C) : elle promettait ×2-×4 par le
  même mécanisme, c'est-à-dire par le même langage compilé. Le banc vient de
  mesurer que ce mécanisme vaut ×1,9 ici. **À déclasser sauf argument nouveau.**

---

## 14. Où part le temps, mesuré sur le vrai moteur (piste 12, 21 août 2026)

Le §13 a fermé la voie du langage compilé et laissé une question ouverte : le
miroir JS de 25 opérations va ×1,7 plus vite que `rp2040js`, et personne ne sait
dire **pourquoi**. La piste 12 demandait de mesurer avant de coder. C'est fait.

Outil : [`_banc-profil-pico.mjs`](_banc-profil-pico.mjs). Rejouer :
`node scripts/_banc-profil-pico.mjs` (~15 min). Mesures brutes dans
`banc-profil-pico.json`. Node 24.11.1, meilleur de 4, fenêtre de 2,5 s.

### Quatre phases, parce qu'aucune ne suffit seule

| phase | question | méthode |
| --- | --- | --- |
| PROFIL | où tombe le temps ? | échantillonnage V8 à 250 µs, **pendant la fenêtre seulement** |
| COMPTEURS | combien de fois y passe-t-on ? | enrobage de comptage, appels pour 1000 instructions |
| ABLATIONS | que coûte un service de la boucle ? | on le retire, on relit le débit |
| CANDIDATS | que rapporterait un patch ? | on le pose, on relit le débit |

Le profil seul ne suffit pas : il dit qu'une fonction pèse 4 %, pas si elle est
chère ou seulement fréquente — les compteurs répondent à ça. Et ni l'un ni l'autre
ne dit ce qu'on gagnerait à y toucher : d'où les deux dernières.

Trois charges, parce qu'un seul sketch ment : `calcul` (MicroPython qui travaille,
aucun sommeil), `gpio` (bascule de broche : SIO, fronts, écouteurs) et `horloge`
(`Horloge.py`, le sketch réel avec ses `sleep`).

### Où part le temps

Part du temps mesuré, par famille (les trois charges, en %) :

| famille | calcul | gpio | horloge |
| --- | ---: | ---: | ---: |
| **interpréteur** (`executeInstruction`) | **59,4** | **58,6** | **60,9** |
| **boucle de simulation** (`KablixSimulator.execute`) | **26,9** | **26,2** | **23,4** |
| mémoire, côté bus (`RP2040.read/writeUintN`) | 7,6 | 8,9 | 8,0 |
| mémoire, côté cœur (`CortexM0Core.read/writeUintN`) | 3,1 | 3,2 | 3,9 |
| périphériques (SIO, GPIO, RTC…) | 0,2 | 0,6 | 1,0 |
| ramasse-miettes | 0,1 | 0,1 | 0,1 |
| hôte au repos | 0,1 | 0,1 | 0,1 |

Trois choses se lisent tout de suite :

- **Le ramasse-miettes n'existe pas** (0,1 %). L'émulateur n'alloue pas dans sa
  boucle chaude — une hypothèse de moins.
- **Les périphériques ne coûtent rien** (≤ 1 %), même sur la charge GPIO qui
  bascule une broche en continu. Ce n'était pas gagné d'avance.
- **Tout est dans deux fonctions** : l'interpréteur et la boucle. À elles deux,
  85 % du temps.

Les compteurs disent pourquoi (charge `calcul`, appels pour 1000 instructions
émulées) :

```
 1000  horloge.tick            251  bus.readUint32      79  cœur.substractUpdateFlags
 1000  pio0.advance            249  cœur.readUint32     67  cœur.readUint16
 1000  pio1.advance            238  cœur.cyclesIO       51  cœur.addUpdateFlags
                               167  cœur.writeUint32    42  cœur.readUint8
                               167  bus.writeUint32     12  bus.findPeripheral
```

Deux enseignements. D'abord **trois appels par instruction** sont versés à la
boucle : deux `pio.advance` et un `clock.tick`, quoi qu'il arrive, y compris quand
aucune machine PIO ne tourne (`pio.machine[n].advance` reste sous la barre des 0,5
pour 1000). Ensuite **chaque accès mémoire est payé deux fois** : le cœur appelle
sa propre `readUint32`, qui ne fait que rappeler celle du bus. 250 allers-retours
pour 1000 instructions.

### Ce que coûte chaque service de la boucle

On retire, on relit le débit. Écart à la boucle de référence — celle qui reproduit
exactement `pico.mts`, instruction par instruction :

| ce qu'on retire | calcul | gpio | horloge |
| --- | ---: | ---: | ---: |
| les deux `pio.advance` | +5,5 % | +8,2 % | +7,6 % |
| l'horloge versée tous les 256 pas au lieu de chaque pas | +7,4 % | +11,6 % | +13,5 % |
| **les deux à la fois** (interpréteur nu) | **+16,7 %** | **+11,1 %** | **+22,2 %** |

### Ce qu'un patch rapporterait

L'inverse de l'ablation : on pose le candidat au lieu de retirer un service.
Écart au témoin, meilleur de 6, fenêtres de 4 s :

| candidat | calcul | gpio | horloge |
| --- | ---: | ---: | ---: |
| **SRAM inlinée dans le cœur** (un saut cœur → bus en moins) | **+8,2 %** | **+5,1 %** | **+6,1 %** |
| `cyclesIO` court-circuité | +3,4 % | +2,2 % | +3,4 % |
| *ÉTALON : un appel de méthode **de plus** par instruction* | *−7,4 %* | *−1,2 %* | *+2,4 %* |

L'étalon n'est pas un candidat : il ne peut que ralentir, et il sert à lire les
deux autres lignes. Il donne **la barre de bruit du banc (±2 à 3 points)** et, au
passage, le prix d'un appel de méthode par instruction — quelques points, pas
quelques dizaines. Un cœur qui exécuterait en **rafales** pour économiser cet
appel (ce que fait le miroir JS du §13) n'y gagnerait donc pas son ×1,7.

Un seul candidat dépasse franchement le bruit : **la SRAM inlinée dans le cœur,
+6 %**. C'est le même geste que le patch a déjà fait pour la lecture d'instruction
— supprimer le saut `CortexM0Core.readUint32` → `RP2040.readUint32`, avec son test
d'alignement et son `>>> 0`, pour les 250 accès par millier d'instructions qui
tombent en SRAM. À tempérer d'un point : le témoin porte lui-même l'enrobage de
mesure (un appel de délégation par accès), que le candidat économise en plus.
**Compter +5 %, pas +8.**

### Comment on chiffre un candidat sans se mentir

Deux méthodes ont été essayées et jetées, la troisième tient. Elles sont notées
ici parce que les deux premières **rendent des chiffres crédibles et faux** :

1. **Patch posé sur l'instance, retiré après la mesure** : la forme de l'objet
   change, V8 désoptimise le cœur, et *tous* les candidats sortent entre −30 % et
   −45 %. On mesure la désoptimisation, pas le candidat.
2. **Un processus patché contre un processus témoin** : d'un lancement à l'autre
   le firmware n'est pas au même point, et le débit varie de ±10 %. L'étalon —
   qui ne peut que ralentir — est sorti à **+10,9 %**. Inexploitable.
3. **Un seul processus, un booléen** : le patch est écrit une fois, posé pour de
   bon sur le prototype, activé par un drapeau. Les deux branches sont chauffées
   avant la première mesure, les variantes tournent en rond, on garde la meilleure
   de chacune. L'étalon retrouve alors le bon signe et la bonne taille.

Trois autres pièges, et ce qu'ils ont coûté :

**Le profileur ne doit pas voir le démarrage.** Le firmware met autant de temps à
booter que la mesure entière ; un `--cpu-prof` aurait profilé le boot. Le banc
pilote donc le profileur par `node:inspector`, autour de la seule fenêtre utile.

**La fenêtre ne se borne pas de l'extérieur.** La boucle du moteur se relance par
`MessageChannel` et affame le reste : un `setTimeout(2500)` a rendu la main après
**18 s**, un second `MessagePort` après 7 s. C'est la boucle elle-même qui borne
la fenêtre — le banc enrobe `execute` et coupe à l'heure. Le profil affiche sa
durée mur pour que toute dérive future se voie.

**Un compteur fausse ce qu'il compte.** Un `n++` par instruction coûtait 15 % au
moteur — plus que tout ce qu'on cherchait à mesurer. Le débit du moteur est donc
lu sur son compteur de **cycles**, converti avec le rapport cycles/instruction
relevé sur la boucle de référence.


### Le verdict

**La boucle, en la vidant complètement, vaut moins de 20 %.** C'est le chiffre qui
tranche : `KablixSimulator.execute` pèse 26 % du profil, mais l'essentiel de ces
26 % est la boucle elle-même — le test du WFE, l'appel à l'interpréteur, le
comptage de la tranche — pas les services qu'on pourrait lui enlever. Et les
services qu'on peut lui enlever, on ne le peut pas gratuitement : sauter
`pio.advance` demande de savoir qu'aucune machine ne tourne, verser l'horloge par
paquets décale les alarmes. Le §12 avait déjà écarté le regroupement de tick pour
cette raison (v86 : `clock.tick` par instruction, sinon SysTick et NeoPixel
décrochent) — le banc confirme que le prix payé achète peu.

**L'écart ×1,7 avec le miroir JS ne vient pas de la boucle.** Il vient de
l'intérieur de `executeInstruction`, qui pèse 60 % à lui seul, et du chemin mémoire
à deux étages. Or l'interpréteur a déjà été retourné deux fois (§9, table de
décodage ; §10, fin du niveau 3) pour +30 % cumulés, et le §10 concluait que la
suite était en dessous du seuil de rentabilité. Le banc ne dit rien qui change ce
verdict : il dit que la cible restante est **la même** que celle qu'on a déjà
exploitée, et qu'entre le miroir (25 opérations, pas d'interruptions, pas de
périphériques, pas de carte mémoire) et `rp2040js` (78 opérations, tout le reste),
une part de l'écart est du travail que le vrai moteur doit vraiment faire.

**Ce que le banc ferme.** Le ramasse-miettes, les périphériques, la boucle de
simulation : trois suspects écartés avec un chiffre. Il ne reste plus de gros gain
à trouver dans le JS de Kablix — la marge est en points, pas en facteurs.

**Ce qu'il laisse ouvert.** La piste 7 (`rp2350js`) reste la seule à promettre un
facteur : leurs 686 modifications portent leurs propres optimisations, sur le même
interpréteur, et il faudra les mesurer avec ce banc-ci.

---

## 15. `rp2350js` évalué — leur Pico 2 tourne à 70 % de notre Pico 1 (21-22 août 2026)

Pistes 7 et 8 de [`roadmap.md`](../roadmap.md). Évaluation faite **hors de
Kablix**, contre un clone de [`c1570/rp2350js`](https://github.com/c1570/rp2350js)
(MIT, dernier commit du 13/08/2026, 50 commits sur six mois, 25 737 lignes de TS
hors tests). Bancs, correctifs et mode d'emploi :
[`scripts/rp2350js-eval/`](rp2350js-eval/README.md).

> **Corrigé le 22/08/2026.** La première rédaction concluait « M33 quatorze fois
> trop lent ». Elle mesurait sous `tsx`, qui à lui seul divise ce cœur-là par
> huit. Tout le volet vitesse a été refait en JS compilé — voir plus bas.

### La méthode : piloter un vrai MicroPython, pas lire un README

Trois firmwares **officiels** MicroPython v1.28.0 (`RPI_PICO2`, `RPI_PICO2-RISCV`,
`RPI_PICO`), un REPL piloté par USB CDC, et dix tests qui sont exactement les
dépendances de Kablix : `sleep_ms` (alarme TIMER), fronts GPIO vus **côté JS** via
`gpio[n].addListener` (le chemin de nos composants), `machine.Timer` périodique,
`Pin.irq`, PWM, ADC, NeoPixel (PIO), scan I²C. Puis la même charge de calcul pur
des §13-14 pour la vitesse. Miroir obligatoire côté Kablix — notre `rp2040js`
patché, même firmware, même charge, même machine, un moteur par processus :
[`_banc-rp2040js-nu.mjs`](_banc-rp2040js-nu.mjs).

### Piste 8 : les manques annoncés ne sont pas ceux qu'on craignait

Le README du fork liste « Timer and System Interrupts » et « Exceptions » — les
deux choses sur lesquelles Kablix repose entièrement. **Mesuré : elles marchent.**
`time.sleep_ms(500)` rend 500, un `machine.Timer(period=100, PERIODIC)` compte
10 ticks en 1050 ms, sur le M33 **et** sur le RISC-V. La liste vise Hazard3 et des
registres de détail ; le M33, lui, a NVIC, SysTick, entrée en exception, faults et
TrustZone. **La question du jour 1 est donc négative : ce n'est pas là que ça
casse.**

Trois vrais défauts trouvés, deux corrigés sur place (patch archivé) :

| Défaut | Portée | Cause | État |
|---|---|---|---|
| `Pin.irq` ne se déclenche jamais | RP2350, **les deux cœurs** | décodage de registre faux dans `io_rp2350.ts` (`% 0x18` qui ne retombe jamais sur `INTR0`/`INTE0`) | **corrigé, 2 lignes** |
| `NeoPixel.write()` fige | RISC-V | `mcycle` (CSR 0xB00) tombait dans « CSR inconnu » et rendait 0 — **14,3 M lectures** en boucle | **corrigé, ~15 lignes** |
| `i2c.scan()` fige | RISC-V | boucle d'attente dans le pilote MicroPython, `mcause` = IRQ externe machine | ouvert |

Le RP2040 du fork, lui, passe les dix tests sans retouche.

### Le piège qui a faussé le premier verdict : `tsx`

Les bancs se lançaient avec `npx tsx`. **`tsx` transpile module par module et
garde les noms de fonctions (`keepNames`) : sur le M33, dont l'exécution est
éclatée en fonctions importées d'autres fichiers, V8 renonce à l'inlining et le
cœur perd un facteur 8.** Mesuré, même charge, même machine :

| Cœur | sous `tsx` | en JS compilé (bundle esbuild) |
|---|---|---|
| `rp2350js` — RP2040 (M0+, un seul fichier) | 12,28 Minstr/s | 12,35 Minstr/s — **identique** |
| `rp2350js` — Cortex-M33 (fichiers séparés) | 0,76-1,15 Minstr/s | **8,3 Minstr/s** |

Kablix bundle sa webview avec esbuild : **c'est la colonne de droite qui décrit
la réalité**. La première version de ce §15 (21/08) annonçait « M33 ÷14 » sur la
foi de la colonne de gauche — chiffre mort, remplacé ci-dessous. Règle qui en
sort : **un banc de vitesse se mesure sur le JS tel qu'il sera livré**, jamais
sous un lanceur TypeScript.

### Piste 7 : la vitesse — l'écart est de 30 %, pas d'un facteur 14

Même charge (`bench(400000)` en MicroPython), même machine (Ryzen 5 2600), tout
en JS compilé, un moteur par processus, **meilleure de trois passes** (la machine
dérive de ±40 % d'une fenêtre à l'autre : seuls les rapports mesurés dans la même
fenêtre valent quelque chose) :

| Moteur | Minstr/s | Mcycles/s | Régime | Rapport à Kablix |
|---|---|---|---|---|
| **Kablix — `rp2040js` patché** (M0+, 125 MHz) | **12,24** | 19,5 | ×0,156 | référence |
| `rp2350js` — RP2040 (M0+, 125 MHz) | 11,34 | 18,6 | ×0,149 | −5 % |
| `rp2350js` — RISC-V Hazard3 (150 MHz) | 10,96 | 13,4 | ×0,107 | −31 % |
| `rp2350js` — **Cortex-M33** (150 MHz) | **8,04** | 13,6 | ×0,109 | **−30 %** |
| `rp2350js` — RISC-V, cache de décodage coupé | 5,69 | 6,9 | ×0,056 | −64 % |

Trois lectures :

Contre-vérification, parce qu'un rapport de 70 % vaut mieux mesuré deux fois :
les deux moteurs relancés **en alternance** (`croise.mjs`, 3 passes chacun, pour
que la dérive machine les frappe également) donnent Kablix ×0,204 contre M33
×0,138, soit **68 %** — même conclusion, dans une fenêtre où la machine tournait
30 % plus vite dans l'absolu.

**Le M33 est utilisable.** Régime ×0,109 : neuf fois plus lent que la puce réelle,
mais seulement 30 % en dessous du Pico 1 que Kablix fait déjà tourner. Une LED
qui doit clignoter à 1 Hz clignote à 0,7 Hz — pas à 1/min comme le disait la
version fausse. Le M33 est même à égalité de régime avec leur RISC-V.

**Leur M0+ vaut le nôtre.** 11,34 contre 12,24 : l'écart est de 5 %, dans le bruit
de la machine. Nos +30 % maison (§9, §10) ne sont donc pas un avantage décisif à
protéger — vendoriser leur bibliothèque pour les deux cartes reste envisageable,
au lieu de maintenir deux moteurs.

**Le cache de décodage vaut ×1,93, mesuré.** En court-circuitant `getDecodeEntry`
de `src/riscv/decode-cache.ts` (36 lignes), leur RISC-V tombe de 10,96 à
5,69 Minstr/s. Ce mécanisme n'existe **que** pour le RISC-V ; le M33 redécode
chaque instruction Thumb-2 à chaque passage. Le profil du M33 en JS compilé le
situe : `executeInstruction` 25 % (fetch, état IT, choix 16/32 bits),
`executeThumb16` 14 %, `executeThumb32` 8 %, les `dispatch*` 8 % — le chemin
mémoire, lui, ne pèse que 5 %.

### Verdict

**Piste 8 : passée.** Les manques annoncés ne sont pas rédhibitoires, et les deux
qui gênaient vraiment se corrigent en une vingtaine de lignes.

**Piste 7 : oui, sous réserve d'accepter −30 %.** Un Pico 2 dans Kablix, c'est le
M33 — la variante que Raspberry Pi vend et pour laquelle le MicroPython officiel
est compilé. Il tourne, il répond, et il est 30 % plus lent que notre Pico 1
actuel. La piste 9 (intégration, 10-20 j) n'est plus bloquée par la vitesse.

**La marge à aller chercher** : un cache de décodage pour le M33, sur le modèle du
leur. Gain attendu ×1,5 à ×1,9 (leur RISC-V mesure ×1,93, le décodage Thumb-2
coûte plus cher à faire donc plus à cacher, mais Amdahl mord : ~40 % du temps M33
seulement est du décodage). Le M33 passerait de ×0,109 à ×0,17-0,20 de régime,
c'est-à-dire **au-dessus** de notre Pico 1 d'aujourd'hui. Coût : le mécanisme
d'indexation par demi-mot existe déjà chez eux (le RISC-V compressé mélange lui
aussi 16 et 32 bits) et l'invalidation sur écriture SRAM est en place ; ce qui
manque est la séparation classification/exécution dans les 2 500 lignes de
`execute-thumb16.ts` + `execute-thumb32.ts`, avec les blocs IT à laisser hors du
tag (la condition s'applique à l'exécution, pas au décodage). **Compter 2-3 jours
pour un cache partiel** (les opcodes chauds seulement, chemin lent conservé pour
le reste — c'est là que se prend l'essentiel du gain), **5-10 jours pour un cache
complet**, leurs 1 700 lignes de tests `*.spec.ts` servant de garde-fou.

À re-sonder de toute façon : le fork est vivant, et `cts2c` (leur transpileur
TS → C, piste todo) reste à part — il s'applique à leur base entière, M33 compris.
