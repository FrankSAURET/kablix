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
