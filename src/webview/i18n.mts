// Internationalisation de la webview. Les chaînes sources (clés) sont en
// anglais ; chaque langue fournit un dictionnaire clé → traduction. La langue
// vient de vscode.env.language, injectée par l'extension dans window.KABLIX_LANG.
// t() remplace les marqueurs {0}, {1}… par ses arguments.

const FR: Record<string, string> = {
  // Barre d'état / simulation
  'Ready': 'Prêt',
  'Stopped': 'Arrêté',
  'Running…': 'En cours…',
  'Compiling…': 'Compilation…',
  'Starting MicroPython… (a few seconds)': 'Démarrage MicroPython… (quelques secondes)',
  'Board: {0}': 'Carte : {0}',
  'Error: {0}': 'Erreur : {0}',
  'Wokwi project loaded': 'Projet Wokwi chargé',
  'Wokwi project loaded ({0} unsupported part(s) ignored)':
    'Projet Wokwi chargé ({0} composant(s) non pris en charge ignoré(s))',
  'Paused': 'En pause',
  'Pause': 'Pause',
  'Pause - resume the simulation': 'Mettre en pause / reprendre la simulation',
  'Resume': 'Reprendre',
  'Reset': 'Réinitialisé',
  'Line {0}': 'Ligne {0}',
  'Slowed down: {0}× real time': 'Ralentie : {0}× le temps réel',
  'The page cannot keep up with the simulation.':
    'La page n\'arrive plus à suivre la simulation.',
  // Relais : défauts de câblage signalés pendant la simulation.
  'Flyback diode is reversed': 'Diode à l\'envers',
  'A flyback diode is required': 'Une diode de roue libre est obligatoire',
  'Coil voltage too low: the relay does not pull in':
    'Tension de commande insuffisante : le relais ne colle pas',
  'The supply cannot deliver the coil current':
    'L\'alimentation ne peut pas fournir le courant de la bobine',
  // Moteur à courant continu : c'est une inductance, comme la bobine d'un
  // relais — mêmes règles de roue libre, plus la surtension qui le grille.
  'The supply cannot deliver the motor current':
    'L\'alimentation ne peut pas fournir le courant du moteur',
  'Motor overvoltage: it burned out': 'Surtension : le moteur a grillé',
  // Étiquette posée à côté du composant encadré : elle EXPLIQUE le défaut, là
  // où la barre d'état se contente de le nommer.
  'Diode reversed': 'Diode à l\'envers',
  'A relay coil is an inductor: when the current is cut it sends back a surge that destroys the driving transistor. The flyback diode absorbs it — it is not optional.':
    'La commande d\'un relais est une bobine : à la coupure elle renvoie une surtension qui détruit le transistor de commande. La diode de roue libre l\'absorbe — elle n\'est pas facultative.',
  'Coil voltage too low: this relay does not pull in. Supply the coil at its rated voltage.':
    'Tension de bobine trop faible : ce relais ne colle pas. Alimentez la bobine sous sa tension nominale.',
  'The supply cannot deliver the coil current: raise its maximum current, or share fewer coils on the same source.':
    'L\'alimentation ne fournit pas le courant de la bobine : augmentez son courant maximal, ou mettez moins de bobines sur la même source.',
  // Même étiquette pour les composants qui viennent d'exploser : l'explosion dit
  // qui est mort, le texte dit pourquoi.
  'This LED burned out: with no series resistor (or far too small a one) the current goes past what the junction can take.':
    'Cette LED a grillé : sans résistance série (ou avec une trop faible), le courant dépasse ce que la jonction supporte.',
  'This capacitor broke down: the voltage across it went past its rated working voltage. Pick one rated well above the supply voltage.':
    'Ce condensateur a claqué : la tension à ses bornes a dépassé sa tension de service. Prenez-en un dont la tension nominale est bien supérieure à celle du montage.',
  'This board burned out: the V+ servo terminal takes 5 V, no more. Beyond 5.5 V the chip is destroyed.':
    'Cette carte a grillé : le bornier V+ des servos accepte 5 V, pas plus. Au-delà de 5,5 V la puce est détruite.',
  'This motor burned out: it was fed more than 1.5 times its rated voltage. Its windings do not take that.':
    'Ce moteur a grillé : il a reçu plus de 1,5 fois sa tension nominale. Ses bobinages ne le supportent pas.',
  'This transistor was destroyed: a motor is a coil, and cutting its current sends back a surge. A flyback diode across the motor absorbs it — it is not optional.':
    'Ce transistor a été détruit : un moteur est une bobine, et couper son courant renvoie une surtension. Une diode de roue libre aux bornes du moteur l\'absorbe — elle n\'est pas facultative.',
  'The supply cannot deliver the current this motor draws: a board pin is far too weak for a motor. Use a power supply and a transistor.':
    'L\'alimentation ne fournit pas le courant que demande ce moteur : une broche de carte est très loin du compte. Passez par une alimentation et un transistor.',
  // Circuit intégré logique : la famille (LS, HC…) fixe la plage d'alimentation.
  // Sous le minimum le boîtier reste muet, au-dessus il est détruit — même
  // message dans les deux cas, la tension mesurée départage.
  'Incompatible supply voltage': 'Tensions d\'alimentation incompatibles',
  'Incompatible supply voltage: this chip is fed below the minimum of its family, so it does nothing. Check the supply against the family printed on the package.':
    'Tensions d\'alimentation incompatibles : ce circuit est alimenté sous le minimum de sa famille, il ne fait donc rien. Comparez l\'alimentation à la famille inscrite sur le boîtier.',
  'This chip was destroyed: it was fed above the maximum supply voltage of its family. The family printed on the package sets that limit.':
    'Ce circuit a été détruit : il a été alimenté au-dessus de la tension maximale de sa famille. C\'est la famille inscrite sur le boîtier qui fixe cette limite.',
  // Répartition du temps réel, dans l'infobulle du badge « ralentie ».
  'Engine': 'Moteur',
  'Rendering': 'Rendu',
  'Browser': 'Navigateur',

  // Palette
  'Components': 'Composants',
  'Search a component…': 'Rechercher un composant…',
  'Recently used': 'Derniers utilisés',
  'Show recently used': 'Afficher les derniers utilisés',
  'Hide recently used': 'Masquer les derniers utilisés',
  // Clavier matriciel : lettre des lignes (Row → Ligne).
  'R': 'L',
  'Component help': 'Aide composant',
  'Open the help for this part': 'Ouvrir l\'aide de ce composant',
  'Expand all categories': 'Tout déplier',
  'Collapse all categories': 'Tout replier',
  'Auto (accordion)': 'Auto (accordéon)',
  'Folding mode': 'Mode de pliage',
  'All components': 'Tous les composants',
  'Alphabetical': 'Ordre alphabétique',
  'By category': 'Par catégorie',
  'Boards': 'Cartes & platines',
  'Displays & LEDs': 'Afficheurs',
  'Controls': 'Commandes',
  'Sensors': 'Capteurs',
  'Actuators': 'Actionneurs',
  'Instruments': 'Appareils de mesure',
  'Divers': 'Divers',
  'Passive': 'Discrets',
  'Custom parts': 'Composants personnalisés',
  '+ Create a part': '+ Créer un composant',
  '⇪ Import (.json)': '⇪ Importer (.json)',
  'Click: place on canvas — double-click: edit the model':
    'Clic : poser sur le canvas — double-clic : modifier le modèle',
  'Export this part (.json)': 'Exporter ce composant (.json)',
  'Delete this part model': 'Supprimer ce modèle de composant',
  'Import failed: {0}': 'Import impossible : {0}',
  'invalid JSON.': 'JSON invalide.',
  'missing "label" field.': 'champ « label » manquant.',
  'missing or invalid "svg" field.': 'champ « svg » manquant ou invalide.',
  'missing "pins" field.': 'champ « pins » manquant.',
  'each pin needs name, x and y.': 'chaque broche doit avoir name, x et y.',

  // Composants posés
  'Delete': 'Supprimer',
  'Right-click drag to move': 'Glisser avec le clic droit pour déplacer',
  '⚠ Simulation running: wiring is locked.': '⚠ Simulation en cours : le câblage est verrouillé.',
  '⚠ Simulation running: editing is disabled.': '⚠ Simulation en cours : édition désactivée',
  'Drag to move — Ctrl: H/V alignment': 'Glisser pour déplacer — Ctrl : alignement H/V',
  '+ or − to rotate the part': '+ ou − pour faire tourner le composant',
  '+ or − to rotate the parts': '+ ou − pour faire tourner les composants',
  'Drag a part to move the whole selection.': 'Glisser un composant déplace toute la sélection.',
  'Ctrl+C / Ctrl+V: copy / paste, from one project to another too — Ctrl+D: duplicate.':
    'Ctrl+C / Ctrl+V : copier / coller, d’un projet à l’autre aussi — Ctrl+D : dupliquer.',
  '{0} parts selected': '{0} composants sélectionnés',
  '{0} × {1} — shared properties': '{0} × {1} — propriétés communes',
  'Changing a property applies to the whole selection.': 'Modifier une propriété l’applique à toute la sélection.',
  'Delete the selection': 'Supprimer la sélection',
  'Right-click to move it.': 'Clic droit pour déplacer.',
  'Reset the view (zoom 100%)': 'Réinitialiser la vue (zoom 100 %)',
  'Flip': 'Retourner',
  'Orientation': 'Orientation',
  'Rotate left (−45°)': 'Tourner à gauche (−45°)',
  'Rotate right (+45°)': 'Tourner à droite (+45°)',
  'Flip horizontally': "Retourner sur l'axe horizontal",
  'Flip vertically': "Retourner sur l'axe vertical",
  'Show/hide the internal wiring': 'Afficher/masquer le câblage interne',
  'Show/hide the full pinout': 'Afficher/masquer le brochage complet',
  'Cross handle: move a corner.': 'La croix pour déplacer un angle.',
  'Ctrl: horizontal/vertical alignment.': 'CTRL pour alignement horizontal et vertical.',
  'Double-click the wire: add a corner.': 'Double clic sur le fil pour en rajouter un.',
  'Click a corner then Del: remove it.': 'Cliquer un coude puis Suppr pour le supprimer.',
  'Drag to move — Ctrl: H/V alignment — Del: remove this corner':
    'Glisser pour déplacer — Ctrl : alignement H/V — Suppr : supprimer ce coude',
  'No file': 'Aucun fichier',
  'Code file to run / debug — click to change, double-click to open':
    'Fichier de code à exécuter / déboguer — cliquer pour changer, double-cliquer pour ouvrir',
  'Code file: {0} — click to change, double-click to open':
    'Fichier de code : {0} — cliquer pour changer, double-cliquer pour ouvrir',
  'Code file {0} not found on this computer — click to choose the file to run':
    'Fichier de code {0} introuvable sur ce poste — cliquer pour choisir le fichier à exécuter',
  'Current project': 'Projet courant',
  'Current project: {0}': 'Projet courant : {0}',
  'Unsaved changes': 'Modifications non enregistrées',

  // Inspecteur
  'Properties': 'Propriétés',
  'Click a part or a wire to edit it. Wiring: click a pin, add corners by clicking the background, finish on a pin (Esc: cancel).':
    'Cliquez un composant ou un fil pour le modifier. Câblage : cliquez une broche, posez des coudes en cliquant le fond, terminez sur une broche (Échap : annuler).',
  'Wire {0} → {1}': 'Fil {0} → {1}',
  'Node {0}': 'Nœud {0}',
  'Select every wire of this node': 'Sélectionner tous les fils de ce nœud',
  'Color (Dupont cables)': 'Couleur (câbles Dupont)',
  'Delete the wire': 'Supprimer le fil',
  'Delete the part': 'Supprimer le composant',
  'No editable property for this part.': 'Aucune propriété modifiable pour ce composant.',
  'Suffixes allowed: p n µ m k M G (e.g. 2.2k)': 'Suffixes autorisés : p n µ m k M G (ex. 2.2k)',
  'no': 'non',
  'Wokwi help': 'Aide Wokwi',
  'Open the online Wokwi documentation for this part':
    'Ouvrir la documentation Wokwi en ligne de ce composant',
  'Available online only': 'Fonction disponible uniquement en ligne',

  // Créateur de composants
  'Create a part': 'Créer un composant',
  'Edit the part': 'Modifier le composant',
  'Name': 'Nom',
  'My sensor': 'Mon capteur',
  'Simulation model': 'Modèle de simulation',
  'SVG drawing': 'Dessin SVG',
  'Click the preview to add a connection point.': "Cliquez l'aperçu pour poser un point de connexion.",
  'Preview': 'Aperçu',
  'External view': 'Vue externe',
  'Internal view': 'Vue interne',
  'Load an SVG…': 'Charger un SVG…',
  'Overlay': 'Superposer',
  'Remove the internal view': 'Retirer la vue interne',
  'Same scale as the external drawing; the green anchor aligns both views.':
    "Même échelle que le dessin externe ; l'ancre verte cale les deux vues.",
  'Fit the drawing in the view': 'Ajuster le dessin à la zone',
  'Import simulation models (.json)': 'Importer des modèles de simulation (.json)',
  'Imported models': 'Modèles importés',
  '{0} model(s) available.': '{0} modèle(s) disponible(s).',
  'Markers: red circle (opacity 0.8) = pin, green circle (0.5) = alignment anchor, red text = pin name. They are removed from the final part.':
    'Marqueurs : cercle rouge (opacité 0,8) = broche, cercle vert (0,5) = ancre de calage, texte rouge = nom de la broche. Ils sont retirés du composant final.',
  'invalid SVG file.': 'fichier SVG invalide.',
  '{0} pin(s) detected.': '{0} broche(s) détectée(s).',
  'No red circle found — click the preview to place the pins.':
    "Aucun cercle rouge trouvé — cliquez l'aperçu pour poser les broches.",
  'Green anchor missing in one of the two views — top-left corners aligned.':
    "Ancre verte absente dans l'une des deux vues — coins haut-gauche alignés.",
  'Internal view aligned on the green anchor.': "Vue interne calée sur l'ancre verte.",
  'Alignment anchor': 'Ancre de calage',
  'No internal view — load an SVG (optional).': 'Aucune vue interne — chargez un SVG (facultatif).',
  'Part parameters': 'Paramètres du composant',
  'Add a parameter (usable in the characteristic)': 'Ajouter un paramètre (utilisable dans la caractéristique)',
  'Delete this parameter': 'Supprimer ce paramètre',
  'name': 'nom',
  'label': 'libellé',
  'value': 'valeur',
  'Simulation control': 'Contrôle de simulation',
  'Add a simulation control (slider, switch)': 'Ajouter un contrôle de simulation (curseur, interrupteur)',
  'Remove the simulation control': 'Retirer le contrôle de simulation',
  'None': 'Aucun',
  'Slider (analog output)': 'Curseur (sortie analogique)',
  'Switch (digital output)': 'Interrupteur (sortie numérique)',
  'Control label': 'Libellé du contrôle',
  'Unit': 'Unité',
  'Min': 'Min',
  'Max': 'Max',
  'Step': 'Pas',
  'Characteristic (V)': 'Caractéristique (V)',
  'linear (min→max)': 'linéaire (min→max)',
  'Output voltage in volts — empty = linear ramp. Variables: x{0}.':
    'Tension de sortie en volts — vide = rampe linéaire. Variables : x{0}.',
  'Valid expression. Variables: x{0}.': 'Expression valide. Variables : x{0}.',
  'Invalid expression: {0}': 'Expression invalide : {0}',
  'Connection points': 'Points de connexion',
  'No point — click the preview.': "Aucun point — cliquez l'aperçu.",
  'Delete this point': 'Supprimer ce point',
  'Pin for role "{0}"': 'Broche pour le rôle « {0} »',
  'Maximum collector-emitter voltage': 'Tension collecteur-émetteur maximale',
  'Current gain: Ic = β × Ib once saturated': 'Gain en courant : Ic = β × Ib à saturation',
  'Maximum collector current': 'Courant de collecteur maximal',
  'Free drawing': 'Dessin libre',
  'Draws the package in the external view, pins included':
    'Dessine le boîtier dans la vue externe, pattes comprises',
  'Package “{0}” drawn — {1} pin(s).': 'Boîtier « {0} » dessiné — {1} patte(s).',
  'Symbol': 'Symbole',
  'Draws the symbol in the internal view': 'Dessine le symbole dans la vue interne',
  'Open in the SVG editor…': "Ouvrir dans l'éditeur SVG…",
  'Opens the drawing in the SVG editor of your choice (asked once, then remembered); it is reloaded here at every save.':
    "Ouvre le dessin dans l'éditeur SVG de votre choix (demandé une fois, puis retenu) ; il est rechargé ici à chaque enregistrement.",
  'Drawing opened in your editor — it is reloaded at every save.':
    'Dessin ouvert dans votre éditeur — il est rechargé à chaque enregistrement.',
  'Drawing updated from the external editor.': "Dessin actualisé depuis l'éditeur externe.",
  'Drag to resize': 'Glisser pour redimensionner',
  'Cancel': 'Annuler',
  'Save': 'Enregistrer',

  // Libellés du catalogue
  // Les noms qui ne CHANGENT PAS en français (marques, sigles) sont écrits ici
  // quand même : `verify:i18n` exige une entrée pour chaque libellé du catalogue,
  // et l'identité assumée vaut mieux qu'un oubli silencieux (cf. « Capacitor »,
  // resté en anglais de la v2026.7.232 à la v2026.7.235).
  'Arduino Uno': 'Arduino Uno',
  'Arduino Nano': 'Arduino Nano',
  'Arduino Mega 2560': 'Arduino Mega 2560',
  'Raspberry Pi Pico': 'Raspberry Pi Pico',
  'Raspberry Pi Pico W': 'Raspberry Pi Pico W',
  'LED': 'LED',
  'Buzzer': 'Buzzer',
  'NeoPixel': 'NeoPixel',
  'DIP switch ×8': 'Interrupteur DIP ×8',
  'TFT display (ILI9341, SPI)': 'Écran TFT (ILI9341, SPI)',
  'microSD card (SPI)': 'Carte microSD (SPI)',
  'Breadboard': "Platine d'essai",
  'Grove Shield (Pico)': 'Grove Shield (Pico)',
  'Grove VCC rail': 'Alimentation des ports Grove (VCC)',
  '3.3 V': '3,3 V',
  '5 V (VBUS)': '5 V (VBUS)',
  'RGB LED': 'LED RGB',
  'Pushbutton': 'Bouton',
  'Resistor': 'Résistance',
  'Diode': 'Diode',
  'Threshold voltage (V)': 'Tension de seuil (V)',
  // Les trois condensateurs se suivent dans la palette : leur libellé commence
  // par le même mot dans les deux langues (la liste est triée alphabétiquement).
  // Seul « Capacitor » est encore dans la bibliothèque (les polarisés sont des
  // variantes), mais les trois libellés servent encore : inspecteur, projets
  // enregistrés, import Wokwi.
  'Capacitor': 'Condensateur',
  'Capacitor (film)': 'Condensateur (film)',
  'Capacitor (tantalum)': 'Condensateur (tantale)',
  'Capacitor (electrolytic)': 'Condensateur (chimique)',
  'Non-polarized': 'Non polarisé',
  'Polarized': 'Polarisé',
  'Plastic': 'Plastique',
  'Tantalum': 'Tantale',
  'Electrolytic': 'Chimique',
  'Nominal value (F)': 'Valeur nominale (F)',
  'Max voltage (V)': 'Tension max (V)',
  'Nominal value (Ω)': 'Valeur nominale (Ω)',
  'Potentiometer': 'Potentiomètre',
  'Slide potentiometer': 'Potentiomètre glissière',
  '7-segment display': 'Afficheur 7 segments',
  'LED bar graph': 'Barre de LED',
  'Slide switch': 'Interrupteur glissière',
  'Analog joystick': 'Joystick analogique',
  'Light sensor': 'Capteur de lumière',
  'Sensitivity (%)': 'Sensibilité (%)',
  'PIR motion sensor': 'Détecteur de mouvement (PIR)',
  'Tilt sensor': "Capteur d'inclinaison",
  'Servo motor': 'Servomoteur',
  'Pulse at 0° (µs)': 'Impulsion à 0° (µs)',
  'Pulse at 180° (µs)': 'Impulsion à 180° (µs)',
  'Rotation time (s/turn)': 'Temps de rotation (s/tour)',
  // PCA9685 : adresse réglée par les six pads AD0..AD5 de la carte.
  'I²C address': 'Adresse I²C',
  'AD0 (bit 0)': 'AD0 (bit 0)',
  'AD1 (bit 1)': 'AD1 (bit 1)',
  'AD2 (bit 2)': 'AD2 (bit 2)',
  'AD3 (bit 3)': 'AD3 (bit 3)',
  'AD4 (bit 4)': 'AD4 (bit 4)',
  'AD5 (bit 5)': 'AD5 (bit 5)',
  'Ultrasonic sensor': 'Capteur à ultrason',
  'Min distance (cm)': 'Distance min (cm)',
  'Max distance (cm)': 'Distance max (cm)',
  'Air temperature (°C)': 'Température de l’air (°C)',
  'Temp/humidity sensor (DHT22)': 'Capteur temp/humidité (DHT22)',
  'Temp/humidity sensor (DHT11)': 'Capteur temp/humidité (DHT11)',
  'Fan': 'Ventilateur',
  'Rated voltage (V)': 'Tension nominale (V)',
  'Current draw (A)': 'Courant consommé (A)',
  'DC motor': 'Moteur à courant continu',
  'No-load current (A)': 'Courant à vide (A)',
  // Transistors : un seul item de bibliothèque, la référence se choisit dans les
  // propriétés (sélecteur à critères). Les trois entrées d'origine restent des
  // types valides pour les projets déjà enregistrés, mais sortent de la palette.
  'Transistor': 'Transistor',
  'Max Ic at least': 'Ic max d’au moins',
  'Max Vce at least': 'Vce max d’au moins',
  'Gain at least': 'Gain d’au moins',
  'Any': 'Peu importe',
  'TO-92': 'TO-92',
  'TO-220': 'TO-220',
  'Matching models': 'Modèles correspondants',
  'No model matches these criteria.': 'Aucun modèle ne répond à ces critères.',
  'Custom NPN': 'NPN personnalisé',
  'Custom PNP': 'PNP personnalisé',
  // Familles : le nom du prototype personnalisé se compose à partir du libellé
  // de la famille (« MOSFET canal N » → « MOSFET canal N personnalisé »).
  'Custom {0}': '{0} personnalisé',
  'NPN Darlington': 'Darlington NPN',
  'PNP Darlington': 'Darlington PNP',
  'N-channel MOSFET': 'MOSFET canal N',
  'Max Id at least': 'Id max d’au moins',
  'Max Vds at least': 'Vds max d’au moins',
  'Rds(on) at most': 'Rds(on) d’au plus',
  'Every characteristic stays editable': 'Toutes les caractéristiques restent réglables',
  'Change transistor…': 'Changer de transistor…',
  'Save to my parts…': 'Enregistrer dans mes composants…',
  'Add this transistor to the library, under “Custom parts”':
    'Ajoute ce transistor à la bibliothèque, dans « Composants personnalisés »',
  '“{0}” saved: you will find it in the library, under “Custom parts”.':
    '« {0} » enregistré : tu le retrouveras dans la bibliothèque, dans « Composants personnalisés ».',
  '“{0}” updated in the library, under “Custom parts”.':
    '« {0} » mis à jour dans la bibliothèque, dans « Composants personnalisés ».',
  'Pinout (flat face)': 'Brochage (face plate)',
  'Pick a model, or a custom NPN/PNP to set everything yourself.':
    'Choisis un modèle, ou un NPN/PNP personnalisé pour tout régler toi-même.',
  'Transistor PN2222A (NPN)': 'Transistor PN2222A (NPN)',
  'Transistor NPN (generic)': 'Transistor NPN (générique)',
  'Transistor PNP (generic)': 'Transistor PNP (générique)',
  'Package': 'Boîtier',
  'Emitter on pin': 'Émetteur sur la patte',
  'Base on pin': 'Base sur la patte',
  'Collector on pin': 'Collecteur sur la patte',
  'Gate on pin': 'Grille sur la patte',
  'Drain on pin': 'Drain sur la patte',
  'Source on pin': 'Source sur la patte',
  'Current gain (β)': 'Gain en courant (β)',
  'Rds(on) (Ω)': 'Rds(on) (Ω)',
  'Marking': 'Inscription',
  'Max Vce (V)': 'Vce max (V)',
  'Max Ic (A)': 'Ic max (A)',
  'Max Vds (V)': 'Vds max (V)',
  'Max Id (A)': 'Id max (A)',
  // Circuits intégrés logiques : une entrée de bibliothèque par référence, le
  // libellé porte la référence ET la fonction (c'est ainsi qu'on cherche un CI).
  'Integrated circuits': 'Circuits intégrés',
  'Model': 'Modèle',
  '74 series family': 'Famille (série 74)',
  'CD4081 quad 2-input AND gate': 'CD4081 4 portes ET à 2 entrées',
  'CD4071 quad 2-input OR gate': 'CD4071 4 portes OU à 2 entrées',
  'CD4070 quad 2-input XOR gate': 'CD4070 4 portes OU exclusif à 2 entrées',
  'CD4011 quad 2-input NAND gate': 'CD4011 4 portes NON-ET à 2 entrées',
  'CD4001 quad 2-input NOR gate': 'CD4001 4 portes NON-OU à 2 entrées',
  'CD40106 hex Schmitt-trigger inverter': 'CD40106 6 inverseurs à trigger de Schmitt',
  '74xx08 quad 2-input AND gate': '74xx08 4 portes ET à 2 entrées',
  '74xx32 quad 2-input OR gate': '74xx32 4 portes OU à 2 entrées',
  '74xx86 quad 2-input XOR gate': '74xx86 4 portes OU exclusif à 2 entrées',
  '74xx00 quad 2-input NAND gate': '74xx00 4 portes NON-ET à 2 entrées',
  '74xx02 quad 2-input NOR gate': '74xx02 4 portes NON-OU à 2 entrées',
  '74xx14 hex Schmitt-trigger inverter': '74xx14 6 inverseurs à trigger de Schmitt',
  // Relais
  'Relay OMRON G5V': 'Relais OMRON G5V',
  'Coil voltage (V)': 'Tension de commande (V)',
  'Membrane keypad': 'Clavier matriciel',
  'LCD Texte': 'LCD Texte',
  'Interface': 'Interface',
  'I²C (4 wires)': 'I²C (4 fils)',
  'I²C (SDA/SCL)': 'I²C (SDA/SCL)',
  'SPI (4 wires)': 'SPI (4 fils)',
  'Parallel (HD44780)': 'Parallèle (HD44780)',
  '16 × 2': '16 × 2',
  '20 × 4': '20 × 4',
  'OLED display (SSD1306)': 'Écran OLED (SSD1306)',
  'NeoPixel matrix': 'Matrice NeoPixel',
  'NeoPixel ring': 'Anneau NeoPixel',
  'Pushbutton (6mm)': 'Bouton poussoir (6 mm)',
  'NTC temperature sensor': 'Capteur de température (NTC)',
  'LDR (photoresistor)': 'Photorésistance (LDR)',
  'NTC thermistor': 'Thermistance CTN',
  'PTC thermistor': 'Thermistance CTP',
  'Resistance at 1 lx (Ω)': 'Résistance à 1 lx (Ω)',
  'Sensitivity coefficient (γ)': 'Coefficient de sensibilité (γ)',
  'Resistance at 25 °C (Ω)': 'Résistance à 25 °C (Ω)',
  'Beta coefficient (K)': 'Coefficient B (K)',
  'Slider Tmin (°C)': 'Tmin du curseur (°C)',
  'Slider Tmax (°C)': 'Tmax du curseur (°C)',
  'Temp. coefficient (%/°C)': 'Coefficient de température (%/°C)',
  'Gas sensor (MQ)': 'Capteur de gaz (MQ)',
  'Heart-beat sensor': 'Capteur de pouls',
  'Flame sensor': 'Capteur de flamme',
  'Sound sensor': 'Capteur de son',
  '16-channel PWM driver (PCA9685)': 'Pilote PWM 16 canaux (PCA9685)',
  // Alimentation de laboratoire (les deux derniers sont dessinés SUR le composant)
  'Bench power supply': 'Alimentation de laboratoire',
  'Voltage (V)': 'Tension (V)',
  'Max current supplied (A)': 'Courant max fourni (A)',
  'Voltage': 'Tension',
  'Current limit': 'Courant limite',

  // Nomenclature exportée en CSV (en-tête du tableau)
  'Ref.': 'Repère',
  'Part': 'Composant',
  'Characteristics': 'Caractéristiques',
  'Value': 'Valeur',
  'Comment': 'Commentaire',

  // Propriétés du catalogue
  'Color': 'Couleur',
  'Type': 'Type',
  'Size': 'Taille',
  'Mini': 'Mini',
  'Medium': 'Moyenne',
  'Large': 'Grande',
  'Flipped': 'Retournée',
  'Value (Ω)': 'Valeur (Ω)',
  'Position (%)': 'Position (%)',
  'Brightness (%)': 'Luminosité (%)',
  'Motion detected': 'Mouvement détecté',
  'Tilted': 'Incliné',
  'Temperature (%)': 'Température (%)',
  'Gas level (%)': 'Niveau de gaz (%)',
  'Pulse (%)': 'Pouls (%)',
  'Flame detected': 'Flamme détectée',
  'Sound detected': 'Son détecté',
  'Horn': 'Bras',
  'Single horn': 'Bras simple',
  'Double horn': 'Bras double',
  'Cross horn': 'Bras en croix',
  'State (0/1)': 'État (0/1)',
  'Common pin': 'Broche commune',
  'New project': 'Nouveau projet',
  'Project saved': 'Projet sauvegardé',
  'Category': 'Catégorie',
  'Submit to Kablix…': 'Soumettre à Kablix…',
  'Share your component': 'Partagez votre composant',
  'Export the component as .json (⇩ button next to it in the palette), then send it:':
    'Exportez le composant en .json (bouton ⇩ à côté de lui dans la bibliothèque), puis envoyez-le :',
  'open a GitHub issue with the “Submit new component” template and attach the .json;':
    'ouvrez une issue GitHub avec le modèle « Submit new component » et joignez le .json ;',
  'or propose a pull request on the Kablix repository.':
    'ou proposez une pull request sur le dépôt Kablix.',
  'Open the GitHub form': 'Ouvrir le formulaire GitHub',
  'Close': 'Fermer',
  'Hard keys (instead of membrane)': 'Touches dures (au lieu de membrane)',
  'All names': 'Tous les noms',
  'Selected parts only': 'Uniquement les composants sélectionnés',
  'Show part ids': 'Afficher l\'id des composants',
  'Ctrl+click to lock the position': 'Ctrl + clic pour verrouiller la position',
  '{0} wire(s) selected': '{0} câble(s) sélectionné(s)',
  'Delete these wires': 'Supprimer ces câbles',
  'Common cathode (K)': 'Cathode commune (K)',
  'Common anode (A)': 'Anode commune (A)',
  'Digits': 'Chiffres',
  '1 digit': '1 chiffre',
  '2 digits': '2 chiffres',
  '4 digits': '4 chiffres',
  'Colon (clock)': 'Deux-points (horloge)',
  'Clock colon (:)': 'Deux-points horloge (:)',
  'Distance (cm)': 'Distance (cm)',
  'Temperature (°C)': 'Température (°C)',
  'Humidity (%)': 'Humidité (%)',
  'Columns': 'Colonnes',
  '3 columns (3×4)': '3 colonnes (3×4)',
  '4 columns (4×4)': '4 colonnes (4×4)',

  // Modèles du créateur
  'LED (lit when A=high and K=low)': 'LED (allumée si A=haut et K=bas)',
  'Pushbutton (pulls the pin to GND)': 'Bouton poussoir (tire la broche à GND)',
  'Resistor (joins its two pins)': 'Résistance (relie ses deux broches)',
  'Buzzer (active when voltage across 1 and 2)': 'Buzzer (actif si tension entre 1 et 2)',
  'Bipolar transistor (saturated switch C→E)': 'Transistor bipolaire (interrupteur saturé C→E)',
  'Relay (coil B1/B2 switches Com from NF to NO)': 'Relais (la bobine B1/B2 fait passer Com de NF à NO)',
  'Digital source (state set in Properties)': 'Source numérique (état piloté dans Propriétés)',
  'Analog source (value set in Properties)': 'Source analogique (valeur pilotée dans Propriétés)',
  'Decorative (no behavior)': 'Décoratif (aucun comportement)',

  // Couleurs Dupont
  'Red': 'Rouge',
  'Yellow': 'Jaune',
  'Green': 'Vert',
  'Blue': 'Bleu',
  'Purple': 'Violet',
  'Gray': 'Gris',
  'Fuchsia': 'Fuchsia',
  'Black': 'Noir',
  'Brown': 'Marron',
  'Orange': 'Orange',
  'White': 'Blanc',
  'GYR': 'VJR',

  // Aide
  'In simulation: Ctrl+click keeps it pressed.': 'En simulation : Ctrl+clic le maintient enfoncé.',
  'Ctrl+click to lock the unstable state': 'Ctrl+clic pour verrouiller l’état instable',
  'No readable variable here (C: global variables only).':
    'Aucune variable lisible ici (en C : variables globales seulement).',
  'ℹ Only global variables are shown': 'ℹ Seules les variables globales sont affichées',
  'In C/Arduino, declare a variable outside setup() and loop() (global) to inspect it here.':
    'En C/Arduino, déclarez une variable hors de setup() et loop() (globale) pour la voir ici.',
  'No readable variable (define module-level variables to inspect them).':
    'Aucune variable lisible (définissez des variables au niveau du module pour les inspecter).',
  'No readable variable here.': 'Aucune variable lisible ici.',
  // Masquage des variables du panneau (œil de chaque ligne / liste du titre)
  'Show the hidden variables': 'Afficher les variables masquées',
  'Click to hide': 'Cliquer pour masquer',
  'Show this variable again': 'Réafficher cette variable',
  'Show all again': 'Tout réafficher',
  'No hidden variable — click the 👁 of a variable to hide it.':
    'Aucune variable masquée — cliquez sur le 👁 d’une variable pour la masquer.',
  'All variables are hidden (click “Variables” to show them again).':
    'Toutes les variables sont masquées (cliquez sur « Variables » pour les réafficher).',

  // Base d'affichage d'une variable (menu au clic sur son nom ou sa valeur)
  'Display of “{0}”': 'Affichage de « {0} »',
  'Click to change the display base': 'Cliquer pour changer la base d’affichage',
  'Binary': 'Binaire',
  'Hexadecimal': 'Hexadécimal',
  'Decimal': 'Décimal',
  'Character': 'Caractère',

  // Moniteur série / console
  'Serial monitor': 'Moniteur série',
  'Console': 'Console',

  // Traceur de courbes
  'Click to hide/show this curve': 'Cliquer pour masquer/afficher cette courbe',
  'Freeze the display (data keeps being collected)':
    "Figer l'affichage (les mesures continuent d'être collectées)",
  'Resume the display (data keeps being collected)':
    "Reprendre l'affichage (les mesures continuent d'être collectées)",

  // Barre d'outils du canvas
  'Auto-route the wires (right angles)': 'Autoroutage des fils (angles droits)',
  'Auto-routing the wires…': 'Autoroutage des fils…',
  'Auto-routing stopped: {0} of {1} wires routed':
    'Autoroutage interrompu : {0} fils routés sur {1}',
  'Zoom in': 'Zoom avant',
  'Zoom out': 'Zoom arrière',
  'Drag a pin endpoint onto another pin to reconnect it.':
    'Glissez l’extrémité d’un fil sur une autre broche pour la reconnecter.',
};

const DICTS: Record<string, Record<string, string>> = { fr: FR };

let dict: Record<string, string> = {};
let current = 'en';

/** Initialise la langue ('fr', 'fr-FR', 'en'…). Anglais par défaut. */
export function initLocale(language: string | undefined): void {
  const base = (language ?? 'en').toLowerCase().split(/[-_]/)[0];
  current = base;
  dict = DICTS[base] ?? {};
}

/** Langue active ('fr', 'en'…) — pour les tables qui ne passent pas par t(),
 *  comme les préfixes de repère (R1, BP2…), trop courts pour servir de clé. */
export function locale(): string {
  return current;
}

/** Traduit une chaîne source et remplace {0}, {1}… par les arguments. */
export function t(source: string, ...args: Array<string | number>): string {
  let text = dict[source] ?? source;
  args.forEach((arg, i) => {
    text = text.replaceAll(`{${i}}`, String(arg));
  });
  return text;
}
