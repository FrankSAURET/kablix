# À faire

*(rien en attente)*

## fait

1. ✅ **kablix_components ne migre PAS vers un dépôt dédié** — analyse ajoutée au README. Je l'ai supprimé aucunintéret sauf pour moi.
1. ✅ Dessin de la sonde logique recalé. On ni touche plus.
1. ✅ Pour le ds18b20 en double cliquant sur le slider ou la valeur, on peut saisir la valeur au clavier (. et , indifféremment)
1. Analyseur logique :
    1. ✅ Pour le DMX j'ai bien le signal en sortie de la carte pico mais rien en sortie de la carte DMX
    1. ✅ Met le nom de la voie plus gros
    1. ✅ Sous le nom affiche un bouton T (un peu épais pour qu'on le voie bien) Si on clic sur ce bouton, on peut choisir montant ou descendant. Le T du bouton est alors remplacé par un front montant ou descendant les autres reviennent à T
    1. ✅ Ajoute à coté un bouton  P¨(un peu épais pour qu'on le voie bien) cliquer dessus fait apparaitre la liste déroulante pour choisir le protocole
    1. ✅ Du coup pas de ligne de légende en haut
    1. ✅ pas non plus trigger et rising ni decode
    1. ✅ Par contre un bouton  pour choisir la fréquence d'horloge 'dans la barre du haut'

## ne pas faire pour l'instant
- Ruban led extensible

---

# v2026.9.4.117
1. ✅ **`verify:align` repassé au vert** : le contrôle « la pointe de la mâchoire tombe PILE sur la pastille » est **retiré** de [verify-align.mjs](scripts/verify-align.mjs). C'est le réglage de Frank qui fait foi — il est le bon, et la tolérance du banc n'est pas touchée (elle reste à 0,2 pour tous les autres composants).
2. ℹ️ **Pourquoi ce contrôle seul était faux** : la pince est **inclinée**. Il comparait le coin de la **boîte englobante** de la mâchoire à la pastille, or la boîte d'un objet penché déborde toujours de sa pointe. Il mesurait donc l'inclinaison, pas l'alignement — c'est pour ça qu'aucun autre composant du banc (résistance, LED, LDR, CTN, CTP, tous droits) n'était touché.
3. ✅ Le **vrai** point de connexion reste gardé, au vingtième d'unité près : « crochet : son extremite tombe PILE sur le croisement de la grille » mesure le **nœud du trait**, pas une boîte — insensible à l'inclinaison. Contre-épreuve faite : `SONDE_PIN` décalée de trois carreaux → 3 échecs. 65 contrôles au vert.

---

# v2026.9.4.116
1. ✅ **Saisie au clavier sur un curseur de simulation** (item 3). Double-clic sur le curseur OU sur la valeur, dans [custom-part.mts](src/webview/composants/custom-part.mts) : `ouvrirSaisie()` remplace la valeur par un champ **texte** — surtout pas `type="number"`, qui refuse la virgule sur un clavier français et rend une chaîne **vide** en silence. Point et virgule normalisés à la main, Entrée valide, Échap annule, perte du focus = validation, hors bornes ramené dans la course.
2. ✅ Le geste est **prouvé à la vraie souris** : 8 contrôles ajoutés à [verify-souris.mjs](scripts/verify-souris.mjs) (§11), composant de bibliothèque monté seul avec `simulating`. Sans ce banc, rien ne prouvait que `dblclick` arrive jusqu'au curseur — l'atelier appelle `preventDefault()` sur `pointerdown`, ce qui tue `dblclick`, et c'est exactement ce qui avait fait livrer deux lots verts sur un double-clic mort (v.71, v.72).
3. ✅ **DMX : la sonde ne voyait rien en sortie de la carte** (item 4.1). Cause racine : `dmx-grove` porte un SP3485, qui prend un signal TTL asymétrique sur `SIG` et sort une paire différentielle sur `+` / `-`. Ces pattes ne sont sur **aucun nœud commun** — et c'est juste : les relier dans la netlist court-circuiterait la sortie sur son entrée. Une sonde sur `+` ne trouvait donc aucune broche de carte (`not-mcu`).
4. ✅ Solution : **`probeMirrors`**, table « la patte X reflète le signal de la patte Y », lue **uniquement par l'analyseur**, jamais par la netlist électrique. Chaîne complète : [_sources.json](kablix_components/_sources.json) → [build-kompix.mjs](scripts/build-kompix.mjs) → `.kompix` → [kompixLibrary.ts](src/kompixLibrary.ts) → [catalog.mts](src/webview/diagram/catalog.mts) → `refletDeSonde()` dans [model.mts](src/webview/diagram/model.mts), qui remonte la chaîne avec une borne de 8 sauts. `dmx-grove` passe en `2026.9.1` avec `{ "+": "SIG", "-": "SIG" }`.
5. ✅ 5 contrôles ajoutés à [verify-analyseur.mjs](scripts/verify-analyseur.mjs) : entrée, les deux sorties, la carte **non reliée** qui doit rester muette (le reflet ne doit pas inventer de signal), et la déclaration dans le paquet publié. **Contre-épreuve faite : 3 échecs sur l'ancien code**, dont les deux `not-mcu` du défaut de Frank.
6. ℹ️ Le banc construisait le modèle et le catalogue en **deux paquets esbuild séparés**, donc avec deux catalogues distincts : un composant enregistré dans l'un restait inconnu de l'autre. Les deux sont maintenant réunis en un seul paquet, par un module `stdin`. Piège rencontré : `export *` sur les deux modules **fait pendre** la résolution (le modèle importe déjà le catalogue) — l'export du catalogue est donc **nommé**.
7. ✅ **Boutons T et P sur les pistes** (items 4.2 à 4.7). Le nom de voie passe à 15 px, et deux boutons épais de 18 px sont **dessinés dans le canvas** sous lui — pas posés en HTML : ils doivent suivre la piste, qui se déplace dès qu'une voie est masquée. `ZoneBouton` relues par `vue.boutonA(x, y)`, panneaux HTML flottants ancrés par-dessus (une liste, un champ texte et huit pastilles se font mal au canvas et y perdraient le clavier). Un seul panneau à la fois, refermé au clic à côté, à Échap et quand les voies changent.
8. ✅ **T** montre le sens du déclenchement (front montant ou descendant dessiné à la place de la lettre, les autres voies revenant à T), **P** le protocole décodé sur cette voie. La barre du haut perd donc légende, sélecteurs `trigger`/`rising` et bouton « + Decode ».
9. ✅ **Fréquence d'échantillonnage** dans la barre du haut (item 4.7). Kablix date les fronts au cycle, il n'échantillonne pas : le réglage **retire** ce qu'un instrument de cette vitesse n'aurait pas vu, appliqué **en sortie** comme l'inversion — revenir en « illimité » retrouve tout. Front daté au **tic** qui suit, avec une marge d'un échantillon à gauche de la fenêtre pour ne pas perdre un front lu juste après le bord.
10. ℹ️ Le **décodeur** ([analyseur-decodage.mts](src/webview/analyseur-decodage.mts)) lit toujours la capture **brute**, non échantillonnée. Laissé tel quel volontairement : mélanger les deux demanderait de refaire toute la chaîne, pour un gain douteux.
11. ✅ Le réglage est **enregistré avec le projet** (`echantillonnage` dans `ProjixAnalyseur`) et repris à la réouverture.
12. ✅ Bancs de l'analyseur remis d'aplomb : [verify-analyseur.mjs](scripts/verify-analyseur.mjs) (5 contrôles d'échantillonnage, 3 réécrits pour les nouveaux boutons) et [verify-analyseur-rendu.mjs](scripts/verify-analyseur-rendu.mjs), dont le contrôle de légende devient un **comptage de pixels peints** dans la colonne de gauche. **Contre-épreuve faite : 1 échec sur l'ancienne vue** (189 px peints contre plus de 200).
13. ⏳ Traductions (`docs/en/`, `l10n/bundle.l10n.fr.json`) : rien de traduit, conformément à la règle — tout en un lot avant publication. `npm run verify:i18n` est donc rouge (7 contrôles) : c'est **attendu**, pas un défaut.
14. ⏳ **`npm run verify:align` est rouge sur UN contrôle** — « la pointe de la mâchoire tombe PILE sur la pastille », pointe (11,23 ; 69,25) contre pastille (10 ; 70). La cause n'est pas ce lot : c'est le `RECALAGE` de [sonde-logique-element.mts](src/webview/composants/sonde-logique-element.mts), que **Frank a recalé lui-même** à `{ x: 0.5, y: 0 }` (`-0.73 ; 0.75` auparavant) — « Dessin de la sonde logique recalé. On ni touche plus. » Le banc, lui, exige que la pointe du dessin coïncide **exactement** avec le point de connexion. **Question pour Frank** : c'est le dessin qui fait foi (alors le banc doit tolérer un écart d'environ 1,2 px), ou le banc (alors le recalage est à reprendre) ? Rien n'a été touché des deux côtés en attendant.

---

# v2026.9.4.115
1. ✅ **Position de la pastille de la sonde : les deux constantes à retoucher** sont dans [sonde-logique-element.mts](src/webview/composants/sonde-logique-element.mts). `SONDE_PIN = { x: 10, y: 70 }` (ligne 34) est le **point de connexion** : il doit rester sur un croisement de la grille de 10 px, sinon plus rien ne s'accroche — **ne pas y toucher**. `RECALAGE = { x: -0.73, y: 0.75 }` (ligne 52) est le **décalage du dessin** : c'est CE couple qu'il faut bouger. `x` négatif décale le dessin vers la gauche, `y` positif vers le bas. Un dixième d'unité = un centième de carreau.
2. ✅ **La pince reliée par un fil ne changeait pas de couleur** — cause trouvée : `colorerSondesReliees()` atteignait la pince par `document.getElementById(partId)`, or le conteneur d'un composant ne porte QUE la classe `.part`, jamais son identifiant de schéma. La fonction sortait donc sans rien colorer, en silence. Corrigé en passant par `editor.elementOf(partId)`.
3. ✅ Ce chemin est maintenant **gardé** : [verify-sonde-fil.mjs](scripts/verify-sonde-fil.mjs) passe de 12 à 19 contrôles — une section navigateur qui prouve la jonction (`elementOf` trouve, `getElementById` ne trouve pas, la pince prend une vraie couleur) et trois contrôles sur le source de `sim.mts` qui refusent le retour de `getElementById`. Contre-épreuve faite : 2 échecs sur l'ancien code.
4. ✅ **L'onglet de l'analyseur restait vide** — vraie cause racine, trouvée dans [analyseur-panel.ts](src/analyseur-panel.ts) : la file d'attente des messages envoyés avant que la page soit prête était plafonnée à 200 et **évinçait le PLUS ANCIEN**, c'est-à-dire `voies`, `depart` et `restaure` — les seuls messages qui ne se rattrapent pas. Sans `voies`, `capture.verser()` jette toutes les salves suivantes en silence : l'onglet restait vide pour toute la session, sans la moindre erreur. À 60 images par seconde, le plafond était atteint en 3,3 s : toute machine plus lente que ça à charger la webview tombait dedans.
5. ✅ Correction : la fonction `rangerEnAttente()` **n'évince que des salves de fronts** ; `voies`/`depart`/`restaure` sont intouchables. Exportée et pure, pour être éprouvée hors de VS Code (le module importe `vscode`).
6. ✅ Nouveau banc [verify-analyseur-file.mjs](scripts/verify-analyseur-file.mjs) : 8 contrôles sur la file d'attente, avec un bouchon `vscode` fourni par un greffon esbuild. Contre-épreuve (`file.shift()` nu) : 3 échecs.
7. ✅ Nouveau banc [verify-analyseur-e2e.mjs](scripts/verify-analyseur-e2e.mjs) : il charge le **vrai micrologiciel** Pico, exécute le programme de `sonde-logique-pico.py` et compte les fronts réellement émis. Résultat : Pico 1 → 13 296 / 6 647 fronts, rapport 2,00 ; Pico 2 → 32 228 / 16 113, rapport 2,00. **Le moteur était donc hors de cause depuis le début.** Le cas B (moteur sans `setPulseMonitors`) prouve le couplage des deux déclarations.
8. ✅ Les deux bancs sont inscrits dans `verify:all:serie`.
9. ✅ **Tutoriel pas à pas** ajouté en tête de la fiche [sonde-logique.md](docs/fr/composants/sonde-logique.md) : « Première fois : le tour complet en cinq minutes » — le tableau des quatre pinces du schéma de test, puis huit étapes du lancement à la loupe et au suivi. Le pas à pas de dépannage existant garde sa place en dessous, avec une note sur le défaut de file désormais corrigé.
10. ✅ Commentaire faux corrigé dans [sonde-logique-pico.py](testkablix/sonde-logique-pico.py) : SD3 est sur GP17, pas sur GND.
11. ✅ Spec de `sonde-logique-pico` réaccordée au `.projix` retouché par Frank dans [_spec.mjs](testkablix/_spec.mjs) — emplacements repris **du fichier de Frank**, pas régénérés. `_generate.mjs` n'a volontairement pas été lancé.
12. ✅ **Rigole de la platine d'essai rétrécie** dans [breadboard.mts](src/webview/composants/breadboard.mts) : elle prenait 24 px sur les 30 de l'écart e→f. Elle vaut maintenant **un tiers de cet écart, centré**. Les trous ne bougent pas d'un pixel — ils viennent de `breadboardPins()` seul, que ce calcul ne touche pas.
13. ✅ [verify-platine.mjs](scripts/verify-platine.mjs) gagne une section d'immobilité des trous (rangées e et f alignées, écart e→f toujours de 3 pas, pas de 10 px conservé, sur les trois tailles) plus trois contrôles sur le calcul de la rigole. 69 contrôles au vert.
14. ✅ **kablix_components ne migre PAS vers un dépôt dédié** — analyse ajoutée au README (générée par [build-components-index.mjs](scripts/build-components-index.mjs)). Raison décisive : l'URL du dépôt officiel est écrite dans `kompixLibrary.ts` (la changer casse les installations en place), les scripts de construction et les bancs vivent ici, et surtout **un composant et le code qui le simule se modifient ensemble**. À reconsidérer si la bibliothèque dépasse quelques dizaines de Mo ou si les contributions externes deviennent régulières.
15. ✅ Deux scénarios de bout en bout à la racine, écrits **pour une vidéo explicative**, avec repères « À filmer » à chaque étape : [Créer un composant 2D.md](Créer%20un%20composant%202D.md) (carte moteur Joy-it SBC-MotoDriver3) et [Créer un composant 3D.md](Créer%20un%20composant%203D.md) (véhicule PMMA : Pico, carte moteur, 4 moteurs, platine, roues sur les axes). Chacun traite le comportement de simulation **avec IA et sans IA**, avec la demande type à copier.
16. ℹ️ La carte Joy-it s'appelle **SBC-MotoDriver3** (pas MotorDriver3) : un PCA9634 en I²C à l'adresse 0x15 qui commande deux DRV8833, 4 moteurs CC, `VM` de 4 à 10 V. Vérifié sur la fiche produit, pas déduit.
17. ✅ Enregistrement des modifications en attente depuis le lot précédent (README, archives, programmes de test DS18B20, `c_cpp_properties.json`).
18. ⏳ Traductions (`docs/en/`, `l10n/bundle.l10n.fr.json`) : rien de traduit, conformément à la règle — tout en un lot avant publication.

---

# v2026.9.4.114
1. ✅ DS18B20 validé par Frank : drapeau `"experimental"` retiré des deux composants (TO-92 et sonde étanche), version des composants passée à `2026.9.1`, `.kompix` et `index.json` reconstruits.
2. ✅ Curseur de température abrégé : l'étiquette `Temperature` / `Température` devient `T°` dans les deux entrées de `_sources.json` (base EN et l10n FR). Les autres composants à curseur de température (NTC, PTC, DHT22, HC-SR04) n'affichent pas ce mot — ils portent déjà une icône 🌡 ou aucune étiquette.
3. ℹ️ « Lecture ratée » à −55 °C sur `ds18b20-uno` : ce n'est PAS un défaut de Kablix. La bibliothèque **DallasTemperature** travaille en 1/128 °C et utilise `DEVICE_DISCONNECTED_RAW = -7040`, soit exactement −55 °C ; son test est `raw <= -7040`, donc la borne basse légitime du capteur est confondue avec une panne. Notre encodage est juste (aller-retour vérifié : −55 → `0xFC90` → −55). Un vrai DS18B20 donnerait le même résultat. MicroPython (`ds18x20`) n'a pas ce défaut.
4. ✅ Les deux fiches d'aide expliquent ce piège et indiquent le contournement (régler −54,5 °C), et citent la nouvelle étiquette `T°`.
5. ✅ Mention « Expérimental » du DS18B20 retirée du CHANGELOG 2026.9.5.
6. ⏳ Enregistrement des modifications en cours de Frank (README, archives, programmes de test DS18B20, `c_cpp_properties.json`) — reporté au lot suivant, rien n'avait été enregistré.

---



