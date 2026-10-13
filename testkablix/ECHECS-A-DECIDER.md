# Échecs de `testkablix/_verify.mjs --quick` — à décider (13/10/2026)

61 contrôles en échec, 0 introduit par le L78SxxCV (même nombre avant et après). Commande : `node testkablix/_verify.mjs --quick`. Rien n'a été régénéré ni corrigé : `_generate.mjs` écraserait tes retouches.

Principe commun : le `.projix` est le schéma que tu as retouché dans l'éditeur, `_spec.mjs` est la description d'origine. Les deux ont divergé. Pour chaque groupe, deux issues possibles : **A** = la spec reprend ce que dit le `.projix` (ton travail est gardé, le banc se tait) ; **B** = on régénère le `.projix` depuis la spec (ton travail est perdu). Ma recommandation est donnée à chaque fois, sauf mention contraire c'est **A**.

## Synthèse

| N° | Groupe | Échecs | Nature | Recommandation |
| --- | --- | --- | --- | --- |
| 1 | Capacités des batteries | 3 | spec = capacité réduite pour la démonstration, `.projix` = capacité réelle | Laisser comme c'est |
| 2 | `autonomie-uno` | 3 | batterie absente du `.projix` |c'est corrigé |
| 3 | `joystick-uno` | 1 | `.projix` enregistré pour une `nano` | B |
| 4 | Générateur BF (`gbf-*`) | 10 | réglages retouchés | Ne rien changer |
| 5 | DS18B20 (`ds18b20-*`) | 5 | capteur supplémentaire et sonde déplacée | Ne rien changer |
| 6 | Oscilloscope (`oscillo-*`) | 4 | base de temps retouchée, voie M2 absente | détaille encore le problème |
| 7 | Mesure (`mesure-*`) | 2 | calibre et tension retouchés | A |
| 8 | `variateur-pnp-uno` | 2 | broche `GND.4` inconnue sur Uno | Je pense que j'ai corrigé |
| 9 | `moteur-dc-pico` | 1 | courant max retouché | Confirmé |
| 10 | Sondes logiques (`sonde-logique-*`) | 20 | sondes déplacées, renommées, retirées | On laisse tel quel |
| 11 | Analyseur UART (`uart-*`) | 3 | réglages d'analyseur retouchés | A |
| 12 | `buzzer-pico2` | 1 | variante `pico2` au lieu de `pico` | A |
| 13 | `pot-pico2` | 1 | oscilloscope M1 absent | A |
| 14 | `dht11-pico2` | 1 | sonde SD2 absente | A |
| 15 | `dmx-pico2` | 4 | sondes SD1 à SD4 absentes | A |
| | **Total** | **61** | | |

## 1. Capacités des batteries (3)

- `consommation-pico` : `Bat1.capacity` — `.projix` = 5000, spec = 1.
- `pile-9v-uno` : `Bat1.prm_capacity` — `.projix` = 500, spec = 1.
- `batterie-lipo-pico` : `Bat1.prm_capacity` — `.projix` = 1000, spec = 1.

La spec met 1 mAh pour que la batterie se vide en quelques secondes pendant une démonstration. Le `.projix` porte la capacité réelle du composant. **À décider** : le banc de démonstration doit-il garder la capacité réduite (B) ou la capacité réelle (A) ? Pour `autonomie-uno` (groupe 2) la spec prévoit 2 mAh, donc le même choix s'y applique.

## 2. `autonomie-uno` (3)

- `Bat1` absent du `.projix` ; `Bat1 alimente la carte par VIN` → null ; `la carte démarre` → NaN V.

La pile 9 V a disparu du `.projix` : le scénario d'autonomie (`testkablix/scenario-piles.md`) ne peut plus tourner. **À décider** : régénérer ce seul `.projix` (B) — la pile est indispensable au test. Les deux autres échecs en découlent.

## 3. `joystick-uno` (1)

- `manifeste` : le `.projix` est enregistré avec `board=nano`, la spec dit `uno`.

**À décider** : le joystick a-t-il été volontairement passé sur une Nano ? Si oui, la spec doit dire `nano` (A, avec son nom de test). Si non, régénérer (B).

## 4. Générateur BF (10)

- `gbf-uno` : `Gen1.amplitude` — `.projix` 2,5 / spec 5.
- `gbf-pico` : `Gen1.frequency` — 1000 / 20 ; `amplitude` — 1,5 / 3 ; `offset` — 1,5 / 1,65 ; `duty` — 50 / 30.
- `gbf-pico2` : `frequency` — 20 / 1000 ; `amplitude` — 3 / 1,5 ; `offset` — 1,65 / 1,5 ; `duty` — 30 / 50 ; `M1` absent du `.projix`.

Les valeurs de `gbf-pico` et `gbf-pico2` sont **croisées** : le `.projix` de la Pico porte les réglages que la spec donne à la Pico 2, et inversement. **À décider** : quels réglages (20 Hz / 3 V / 1,65 V / 30 % ou 1 kHz / 1,5 V / 1,5 V / 50 %) pour quelle carte ? Et `gbf-pico2` doit-il garder un oscilloscope `M1` ?

## 5. DS18B20 (5)

- `ds18b20-uno` : `Capt2` absent ; `Capt2.Data` → 2.
- `ds18b20-pico2` : `SD1.voie` — 7 / 0 ; `SD1.accroche` — `R1/1` / `Capt1/Data` ; `1 capteur(s) 1-Wire` — trouve 3 (`Capt1`, `Mod1`, `Mod2`).

Le test Uno attend un second capteur `Capt2` qui n'existe plus. Le test Pico 2 résout trois capteurs au lieu d'un : deux modules `Mod1` et `Mod2` y ont été ajoutés. **À décider** : garde-t-on les deux modules et le second capteur ? Si oui la spec les déclare (A).

## 6. Oscilloscope (4)

- `oscillo-uno` : `M1.sdiv` — 0,003751 / 0,5.
- `oscillo-pico` : `M1.sdiv` — 0,006675 / 0,5.
- `oscillo-pico2` : `M1.sdiv` — 0,005006 / 0,006675 ; `M2` absent.

Les `sdiv` du `.projix` sont des valeurs mesurées à la main (molette), pas des valeurs rondes. **À décider** : reprendre ces valeurs dans la spec (A) ou revenir à des valeurs rondes (B) ? Et `oscillo-pico2` doit-il avoir une seconde voie `M2` ?

## 7. Mesure (2)

- `mesure-uno` : `O1.voltsdiv` — 2 / 1.
- `mesure-pico` : `Rl1.voltage` — 3 / 5.

Calibre de l'oscilloscope et tension du rail changés. **À décider** : A, sauf si ces 3 V (au lieu de 5) étaient un essai.

## 8. `variateur-pnp-uno` (2)

- `fil w13 → uno/GND.4 — broche inconnue` ; `O1 lit 5 V` → lu = null.

Défaut réel, pas une dérive de réglage : un fil touche une broche `GND.4` qui n'existe pas sur la carte Uno, donc le multimètre ne lit rien. **À décider** : quelle masse voulais-tu (`GND.1`, `GND.2` ou `GND.3`) ? Je corrige la spec et régénère ce seul test.

## 9. `moteur-dc-pico` (1)

- `Alim1.maxcurrent` — `.projix` 3 / spec 1.

A : 3 A est la valeur que tu as réglée pour que le moteur démarre. À confirmer.

## 10. Sondes logiques (20)

- `sonde-logique-uno` (1) : `SD3.accroche` — `U1/GND.1` / `U1/GND.3`.
- `sonde-logique-pico` (12) : `SD1` sans étiquette (spec : « horloge ») ; `SD2` absente ; `SD3` accrochée à GP15 au lieu de GP17, posée en 260,150 rot 0 au lieu de 250,80 rot 90 ; `SD4` accrochée à GP17 au lieu de GP26, posée en 250,80 rot 0 au lieu de 160,80 rot 90 ; `SD1` nommée vide au lieu de « horloge » ; `SD2` non accrochée à GP15, pas sur la voie 1, nommée vide.
- `sonde-logique-pico2` (7) : `SD5` absente ; `SD4` accrochée à GP26 au lieu de GP17, sans étiquette ; `SD3` accrochée à GP17 au lieu de GP15, sans étiquette ; `SD1` étiquetée « horloge » (spec : vide) ; `SD2` sur la voie 4 au lieu de 1, accrochée à `R1/1`.

Les sondes ont été déplacées, renumérotées et rebranchées. Les trois `.projix` n'ont plus la même répartition entre eux (Pico à quatre sondes, Pico 2 à cinq). **À décider** : la bonne disposition de référence — celle de la Pico, de la Pico 2, ou une troisième ? Il me faut le nombre de sondes, leurs broches (GP14, GP15, GP17, GP26…) et leurs étiquettes. Je reporte alors la décision dans la spec (A).

## 11. Analyseur UART (3)

- `uart-uno`, `uart-pico`, `uart-pico2` : « réglages de l'analyseur » différents.

Écarts : dans `uart-uno` le décodeur d1 a `bits:true` ; dans `uart-pico` c'est le décodeur d2. Le `uart-pico2` n'a `bits` nulle part. **À décider** : quel décodeur affiche les bits, sur quelle carte ?

## 12. à 15. Quatre cas isolés (7)

- `buzzer-pico2` (1) : `U1.variant` — `.projix` = `pico2`, spec = `pico`. A : le `.projix` est le bon.
- `pot-pico2` (1) : oscilloscope `M1` absent du `.projix`. A si tu l'as retiré, B si l'oubli est involontaire.
- `dht11-pico2` (1) : sonde `SD2` absente. Même question.
- `dmx-pico2` (4) : sondes `SD1` à `SD4` toutes absentes. Même question ; la liaison DMX avait quatre voies à observer.

**À décider** pour chacun : retrait voulu (A) ou oubli à rétablir (B).
