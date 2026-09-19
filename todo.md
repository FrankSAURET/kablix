# À faire
1. (rien en attente)
## ne pas faire pour l'instant
- Ruban led extensible

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



