# Scénario de test — piles, consommation et refus d'alimentation (v2026.9.7.180-181)

Tous les projets sont dans `testkablix/` : les `.projix` Pico à la racine, les Arduino dans `testkablix/Arduino/<nom>/`. Les durées sont en **temps de programme** : au ralenti, elles prennent plus longtemps à l'écran, jamais moins.

Les messages de la barre d'état et les noms de courbes sont encore **en anglais** : leur traduction attend la publication.

## 0. Préparation

1. F5 pour lancer l'extension.
2. **⚙ Gérer les composants** : installer `Battery pack 4 × AA`, `Battery 9 V`, `Coin cell CR2032`, `LiPo battery 1S`.
3. Chaque carte porte la mention « à l'essai » (composant expérimental).

| Contrôle | Attendu |
|---|---|
| Poser une pile, tirer un fil depuis `+` | Fil **rouge** |
| Tirer un fil depuis `-` | Fil **noir** |
| Inspecteur de la pile | Champ **Capacity (mAh)** : 2500 / 500 / 220 / 1000 selon la pile |
| Aide de la pile (menu contextuel) | Fiche FR avec illustration et tableau « Où la brancher » |

## 1. Refus de démarrer

Ouvrir chaque projet, lancer la simulation. La carte ne démarre pas, rien au moniteur série, message dans la barre d'état.

| Projet | Attendu dans la barre d'état |
|---|---|
| `pile-cr2032-uno` | `The board does not start: Bat1 gives 3 V on 5V, which needs 4,5 to 5,5 V.` |
| `batterie-lipo-uno` | `The board does not start: Bat1 gives 4,2 V on VIN, which needs 6,2 to 20 V.` |
| `pile-4aa-pico` | `The board does not start: Bat1 gives 6,4 V on VSYS, which needs 1,8 to 5,5 V.` |
| `pile-9v-pico` | `The board does not start: Bat1 gives 9,5 V on VSYS, which needs 1,8 to 5,5 V.` |

Contre-essai : dans `pile-cr2032-uno`, débrancher le fil `-` de la pile, relancer. La masse n'est plus commune : la carte reste sur l'USB et **démarre**.

## 2. Extinction en route

Capacité réduite à 1 mAh dans ces projets. Traceur ouvert : courbes `Bat1: charge`, `Bat1: voltage`, `Bat1: battery life`, `Board current`, `Charge used`.

| Projet | Attendu |
|---|---|
| `pile-4aa-uno` | Démarre (6,4 V), compte les secondes. Tension qui baisse ; sous **6,2 V** : arrêt au bout de **8 s** environ, message `Bat1 dropped to 6,2 V: the board switched off after … of program (VIN needs at least 6,2 V).` |
| `pile-9v-uno` | Démarre (9,5 V), arrêt sous 6,2 V au bout d'**environ 75 s**, même message. |
| `pile-cr2032-pico` | Démarre (3 V), tourne jusqu'à pile vide (2 V reste dans la plage de VSYS), environ **3 min**, message `Bat1 is empty: the board switched off after … of program.` |
| `batterie-lipo-pico` | Démarre (4,2 V), environ **3 min**, même message « empty ». |

Relancer : la pile repart **pleine**.

## 3. Autonomie Uno : la veille ne sauve pas grand-chose

Projet `autonomie-uno` : Uno sur pile 9 V (2 mAh) par VIN, LED verte sur D8. Cycle : 1 s de mesure LED allumée, 4 s d'attente.

1. `#define VEILLE 1` : lancer. `Board current` alterne **≈ 46 mA + LED** et **31 mA**. Noter la durée de l'arrêt et le dernier `cycle` au moniteur.
2. `#define VEILLE 0` : relancer. `Board current` ne descend plus sous 46 mA.

| Réglage | Arrêt (sous 6,2 V) | Cycles |
|---|---|---|
| `VEILLE 1` | ≈ 3 min | ≈ 37 |
| `VEILLE 0` | ≈ 2 min 20 | ≈ 28 |

Leçon : une Uno endormie garde les deux tiers de sa consommation (régulateur, puce USB, LED ON).

## 4. Autonomie Pico : la veille change tout

Projet `autonomie-pico` : Pico sur LiPo 1S (1 mAh) par VSYS, LED verte sur GP15. Même cycle.

1. `VEILLE = True` : lancer. `Board current` alterne **≈ 21 mA + LED** et **1,3 mA**.
2. `VEILLE = False` : relancer. Le courant reste à 21 mA pendant `time.sleep()`.

| Réglage | Batterie vide | Cycles |
|---|---|---|
| `VEILLE = True` | ≈ 9 min | ≈ 110 |
| `VEILLE = False` | ≈ 3 min | ≈ 33 |

Leçon : `time.sleep()` n'est pas une veille, la puce reste éveillée. `lightsleep()` multiplie l'autonomie par 3 à 4.

## 5. Power bank : non-régression

| Projet | Attendu |
|---|---|
| `consommation-uno` | Power bank sur 5V : démarre, se vide, `Bat1 is empty…` |
| `consommation-pico` | Power bank sur VSYS : idem, beaucoup plus long |
| `consommation-uno` modifié : fil `V+` déplacé de 5V vers **VIN** | Refus : `Bat1 gives 5 V on VIN, which needs 6,2 to 20 V.` |
| `powerbank-uno` | Inchangé : PCA9685 + servo, jauge LED qui suit la charge |

## 6. À signaler

- Toute durée très loin des valeurs ci-dessus (facteur 2 ou plus).
- Une carte qui démarre dans la partie 1, ou qui refuse dans la partie 2.
- Un fil de pile qui ne prend pas la bonne couleur.
- Un message qui reste affiché au lancement suivant.
