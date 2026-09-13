# Kablix face aux simulateurs analogues

Relevé fait en septembre 2026 sur **Wokwi** (l'extension VS Code surtout),
**Tinkercad Circuits** et **SimulIDE**. Deux questions, celles du todo :

1. ce qu'ils font de mieux et qui mériterait d'arriver dans Kablix ;
2. précisément, ce que le débogage de l'extension Wokwi fait de mieux.

Complément de [roadmap.md](roadmap.md), qui classe les pistes venues de
[Pistes.md](Pistes.md). Ici, les pistes viennent de l'extérieur.

---

## Le tableau d'ensemble

| | Kablix | Wokwi (VS Code) | Tinkercad | SimulIDE |
|---|---|---|---|---|
| Intégré à VS Code | oui | oui | non (web) | non (appli) |
| Hors-ligne | **oui** | non (simulation distante) | non | oui |
| Points d'arrêt | oui | oui (GDB) | oui | oui |
| Points d'arrêt conditionnels | Pico seulement | oui (GDB) | non | non |
| Variables locales | Pico seulement | **oui** (GDB) | oui (survol) | non (globales) |
| Tableaux, structures | non | **oui** (GDB) | non | non |
| Pile d'appels | **non** | **oui** (GDB) | non | non |
| Registres, PC, bits d'état | non | oui (GDB) | non | **oui** |
| Vue RAM / ROM / flash | non | oui (GDB) | non | **oui** |
| Oscilloscope | **oui** | **non** | non | oui (4 voies) |
| Multimètre | **oui** | **non** | oui | oui |
| Analyseur logique | non | oui (export VCD) | non | oui (8 voies) |
| Traceur série | oui | non | oui | non |
| Résistances prises en compte | **oui** | **non** | oui | oui |
| Courant, puissance dissipée | **oui** | non | partiel | oui |
| Composants qui chauffent / explosent | **oui** | non | non | non |
| Aide intégrée par composant | **oui** | non | partiel | non |
| Schéma verrouillable (TP à trous) | pas encore | non | non | non |

Rien dans ce tableau n'est une surprise agréable pour le débogage AVR, et rien
n'est inquiétant pour l'électricité. C'est exactement l'inverse des deux
gros : **eux débogent mieux, nous simulons mieux le circuit.**

---

## 1. Ce que fait de mieux l'extension Wokwi au débogage

### Le mécanisme : ils ne débogent pas, ils délèguent

C'est la réponse en une phrase. Wokwi **n'écrit pas de débogueur** : il ouvre un
**serveur GDB** sur un port TCP (3333 par convention, réglé par `gdbServerPort`
dans `wokwi.toml`), et VS Code s'y branche par un `launch.json` ordinaire.
L'élève lance « Wokwi: Start Simulator and Wait for Debugger », puis F5.

Un point de vocabulaire, parce que tout en découle : le **protocole GDB distant**
est un dialogue texte minuscule — lire de la mémoire, lire un registre, poser un
point d'arrêt, continuer. Le simulateur ne répond qu'à ça. Tout le reste —
comprendre qu'à cette adresse se trouve un `int`, que cette trame de pile
appartient à `loop()`, que ce pointeur mène à un tableau de 10 `float` — est fait
par le client `gdb`, qui lit le DWARF du `.elf` de son côté.

Conséquence directe : **Wokwi obtient gratuitement tout ce que GDB sait faire**,
sans l'avoir écrit. Locales, tableaux, structures, pile d'appels, registres,
watchpoints, points d'arrêt conditionnels, évaluation d'expressions.

### Ce que ça leur coûte

Quatre exécutables différents à installer selon la puce : `avr-gdb` (Arduino),
`arm-none-eabi-gdb` (Pico, STM32), `xtensa-esp32-elf-gdb`, `riscv32-esp-elf-gdb`.
La documentation signale que le GDB livré avec l'IDE Arduino (7.8) est **trop
vieux** et échoue sur les projets AVR (« Remote 'g' packet reply is too long »,
erreurs de fil d'exécution) — il faut aller en chercher un récent soi-même.

Et il faut écrire un `launch.json`. Pour un élève de première année, deux
obstacles avant la première variable affichée.

### Ce qu'ils ne débogent pas

**MicroPython.** Le débogage Wokwi couvre C/C++, Rust, CircuitPython — GDB
débogue du code machine, il ne sait rien d'un interpréteur. Kablix, lui, **débogue
MicroPython**, par instrumentation du source ([pydebug.ts](src/shared/pydebug.ts)),
avec locales et points d'arrêt conditionnels. C'est le seul des quatre.

### Verdict

| | |
|---|---|
| **Mieux chez eux** | locales, tableaux, structures, pile d'appels, registres, watchpoints, conditions — sur AVR et ARM |
| **Mieux chez nous** | ça marche sans rien installer, sans `launch.json`, sans compte, hors-ligne ; et MicroPython est débogable |
| **À rattraper** | locales AVR, puis tableaux et structures : voir [roadmap.md](roadmap.md) §10 |

Le §10 du roadmap chiffrait ce rattrapage à **M**. Vérification faite depuis, il
est **plus petit que ça** : le DWARF est déjà lu (`parseDwarfGlobals()` dans
[compiler.ts](src/compiler.ts) analyse `avr-objdump --dwarf=info` et construit
déjà l'arbre des DIE), et le pointeur de trame AVR est le registre Y, soit
`cpu.data[28]/[29]`, déjà à portée du moteur. Ce sont **trois filtres** qui
limitent la vue aux globales scalaires, pas une information manquante.

**Ce qu'on ne copie pas** : brancher un vrai GDB. Ça imposerait à chaque poste
d'installer une chaîne d'outils par famille de puces, et de configurer un
`launch.json`. Le prix d'entrée de Kablix — on ouvre, ça marche — vaut plus cher
que la pile d'appels.

---

## 2. Ce que les autres font de mieux, et qui vaut le détour

### 2.1 L'analyseur logique — confirmé par les deux autres

Wokwi et SimulIDE en ont un, pas nous. C'est la piste n°4 du roadmap, et la voir
chez les deux concurrents sérieux la confirme.

**Wokwi** : composant `wokwi-logic-analyzer`, 8 voies + masse, échantillonnage
annoncé à 1 GHz, déclenchement par niveau ou par front (`triggerMode`), et export
en **VCD** (*Value Change Dump*, le format d'échange standard des signaux
numériques) à l'arrêt de la simulation. **La visualisation est externe** :
PulseView ou GTKWave, où se trouvent les décodeurs I²C, SPI, UART.

**SimulIDE** : 8 voies aussi, mais **affichage intégré**.

**Ce qu'on en retient pour Kablix** : le format VCD est à prendre — il est
normalisé, et il ouvre PulseView avec ses décodeurs de protocole sans qu'on
écrive une ligne. Mais **l'affichage doit rester intégré** : envoyer un élève
installer PulseView pour voir son I²C, c'est le même renoncement que le
`launch.json` de Wokwi. Kablix a déjà le traceur de courbes (échelle de temps,
zoom, mode escalier) — la base est là.

Un décodeur I²C/SPI/UART **intégré** serait même un avantage net : ni Wokwi ni
SimulIDE ne l'ont dans leur fenêtre.

### 2.2 La vue des périphériques internes — SimulIDE va beaucoup plus loin

C'est la piste n°8 du roadmap, et SimulIDE est le seul à la traiter vraiment :
moniteur des **registres, du PC, des bits d'état, de la RAM, de la ROM et de la
flash**, pour AVR, PIC et ESP32.

Pédagogiquement, c'est le chaînon qui manque partout ailleurs : voir `TCCR1B`
changer quand on appelle `analogWrite()` est ce qui fait comprendre qu'il y a une
machine sous la bibliothèque Arduino.

**Nuance, et elle compte** : SimulIDE montre les registres **bruts**, en
hexadécimal. Un élève qui ne sait pas déjà ce qu'est `TCCR1B` n'y apprend rien.
La valeur pédagogique n'est pas dans le vidage de registres — c'est la partie
facile — elle est dans **l'interprétation** : « Timer1, mode PWM rapide,
diviseur 64, soit 976 Hz ». Le roadmap classait le n°8 en **L** ; le relevé ne le
contredit pas, et confirme qu'il faut viser l'interprétation, pas la table.

### 2.3 Points d'arrêt conditionnels sur AVR

Wokwi les a (par GDB), Kablix seulement sur Pico. Sur AVR le point d'arrêt est
posé par adresse flash : évaluer une condition à l'arrêt demande d'avoir déjà les
locales. **C'est donc la suite naturelle du §10**, pas un chantier séparé.

### 2.4 Les petites choses de l'extension Wokwi

- **Mode confidentiel** (`wokwi.hidePersonalInfo`) : masque les informations
  personnelles pendant une diffusion ou une présentation. Détail, mais pensé pour
  qui montre son écran à une classe — donc pertinent ici.
- **« Ouvrir dans l'éditeur de texte »** sur le schéma : bascule entre l'édition
  graphique et le JSON brut. Kablix n'a pas d'équivalent pour le `.projix`.
  Utile pour dépanner un schéma cassé et pour comprendre le format.
- **Serveur série RFC2217** : expose le port série du microcontrôleur simulé en
  TCP, pour qu'un vrai logiciel s'y branche. Cas d'usage étroit, à noter sans
  plus.

---

## 3. Ce que Kablix fait de mieux — et qu'il faut assumer

Ce n'est pas de l'autosatisfaction : ça oriente le classement du roadmap. Une
piste qui creuse un avantage réel vaut mieux qu'une piste qui court derrière.

### 3.1 L'électricité — l'écart est franc

**Wokwi ignore purement les résistances dans un circuit analogique.** C'est
documenté chez eux : on ne peut pas associer une résistance à un composant
analogique (potentiomètre, CTN…), le simulateur ne la voit pas. Il n'y a **ni
multimètre ni oscilloscope** dans Wokwi — la demande existe depuis des années.

Kablix calcule : ponts diviseurs (`adcDividerLevels`), courant d'une alimentation
(`psuLoadAmps`), puissance dissipée par résistance (`resistorPowers`), physique
LED avec sa résistance série (`ledElectrical`, `ledSeriesOhms`), le tout dans
[model.mts](src/webview/diagram/model.mts) — et il a **multimètre et
oscilloscope** comme composants posables.

Pour un cours d'électronique, c'est l'écart le plus important du tableau. La loi
d'Ohm n'est pas un détail de confort : c'est la moitié du programme.

### 3.2 Les composants qui chauffent, rougissent et explosent

Personne d'autre ne le fait. Une résistance sous-dimensionnée qui rougit puis
lâche apprend, en une seconde et sans un mot, ce qu'un message d'erreur n'apprend
pas. C'est aussi ce qui rend la piste n°9 (thermique) peu chère : le mécanisme
existe, il faut l'étendre.

### 3.3 Le débogage MicroPython

Seul des quatre. Wokwi simule MicroPython mais ne le débogue pas.

### 3.4 L'aide intégrée par composant

Une fiche par composant, en français, atteignable depuis le composant lui-même.
Aucun des trois autres n'a ça.

### 3.5 Le hors-ligne intégral

Wokwi simule **sur ses serveurs** : sans réseau, rien. En salle de classe, c'est
une panne par mois. Kablix simule dans la webview.

---

## 4. Ce que ça change au roadmap

Le relevé **ne renverse aucun classement**. Il précise trois choses :

1. **Le §10 (locales AVR) est plus petit que chiffré** — le DWARF est déjà lu, ce
   sont des filtres à ouvrir. Il reste en n°2 de l'ordre proposé, mais il y sera
   moins longtemps que prévu. Et il débloque les points d'arrêt conditionnels.
2. **L'analyseur logique (n°4) est confirmé** par sa présence chez les deux
   concurrents sérieux. À faire avec **export VCD** (norme, ouvre PulseView) mais
   **affichage intégré** (l'externaliser reproduirait le défaut de Wokwi). Un
   décodeur I²C/SPI/UART intégré serait un avantage que personne n'a.
3. **La vue des périphériques (n°8) reste en L**, et SimulIDE montre par l'exemple
   ce qu'il ne faut pas faire : un vidage de registres en hexadécimal n'enseigne
   rien. Viser l'interprétation.

Deux petites idées à verser à [Pistes.md](Pistes.md), de coût S :

- **Mode confidentiel** pendant une projection en classe.
- **Voir le `.projix` en texte**, comme Wokwi ouvre son `diagram.json`.

Et une confirmation qui vaut décision : **le linter électronique (n°2) reste
l'atout que personne ne peut copier.** Wokwi n'a pas le circuit électrique,
Tinkercad n'a pas le code hors de son éditeur, SimulIDE n'a pas d'analyse
statique. Kablix voit les deux en même temps. C'est le seul endroit du tableau
où la case « chez eux » est vide par construction, et pas par retard.

---

## Sources

- [Wokwi — débogage dans VS Code](https://docs.wokwi.com/vscode/debugging)
- [Wokwi — débogage GDB](https://docs.wokwi.com/gdb-debugging)
- [Wokwi — API analogique (limites)](https://docs.wokwi.com/chips-api/analog)
- [Wokwi — référence de la résistance](https://docs.wokwi.com/parts/wokwi-resistor)
- [Wokwi — demande de multimètre (non réalisée)](https://github.com/wokwi/wokwi-features/issues/273)
- [Wokwi — configuration du projet (wokwi.toml)](https://docs.wokwi.com/vscode/project-config)
- [Wokwi — journal des versions de l'extension](https://open-vsx.org/extension/Wokwi/wokwi-vscode/changes)
- [Tinkercad — guide officiel de Circuits](https://www.tinkercad.com/blog/official-guide-to-tinkercad-circuits)
- [SimulIDE — présentation](https://simulide.com/p/)
- [SimulIDE — analyseur logique](https://simulide.com/p/logic-analyzer/)
- [SimulIDE — oscilloscope](https://simulide.com/p/oscilloscope/)
