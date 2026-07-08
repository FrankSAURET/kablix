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

  // Palette
  'Components': 'Composants',
  'Search a component…': 'Rechercher un composant…',
  'Recently used': 'Derniers utilisés',
  'Show recently used': 'Afficher les derniers utilisés',
  'Hide recently used': 'Masquer les derniers utilisés',
  // Clavier matriciel : lettre des lignes (Row → Ligne).
  'R': 'L',
  'Component help': 'Aide du composant',
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
  '⚠ Simulation running': '⚠ Simulation en cours',
  'Drag to move — Ctrl: H/V alignment': 'Glisser pour déplacer — Ctrl : alignement H/V',
  '+ or − to rotate the part': '+ ou − pour faire tourner le composant',
  '+ or − to rotate the parts': '+ ou − pour faire tourner les composants',
  'Drag a part to move the whole selection.': 'Glisser un composant déplace toute la sélection.',
  'Ctrl+C / Ctrl+V: copy / paste — Ctrl+D: duplicate.': 'Ctrl+C / Ctrl+V : copier / coller — Ctrl+D : dupliquer.',
  '{0} parts selected': '{0} composants sélectionnés',
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
  'Code file to run / debug — click to change':
    'Fichier de code à exécuter / déboguer — cliquer pour changer',
  'Code file: {0} — click to change': 'Fichier de code : {0} — cliquer pour changer',
  'Current project': 'Projet courant',
  'Current project: {0}': 'Projet courant : {0}',

  // Inspecteur
  'Properties': 'Propriétés',
  'Click a part or a wire to edit it. Wiring: click a pin, add corners by clicking the background, finish on a pin (Esc: cancel).':
    'Cliquez un composant ou un fil pour le modifier. Câblage : cliquez une broche, posez des coudes en cliquant le fond, terminez sur une broche (Échap : annuler).',
  'Wire {0} → {1}': 'Fil {0} → {1}',
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
  'Connection points': 'Points de connexion',
  'No point — click the preview.': "Aucun point — cliquez l'aperçu.",
  'Delete this point': 'Supprimer ce point',
  'Pin for role "{0}"': 'Broche pour le rôle « {0} »',
  'Cancel': 'Annuler',
  'Save': 'Enregistrer',

  // Libellés du catalogue
  'Breadboard': "Platine d'essai",
  'RGB LED': 'LED RGB',
  'Pushbutton': 'Bouton',
  'Resistor': 'Résistance',
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
  'Ultrasonic sensor': 'Capteur à ultrason',
  'Min distance (cm)': 'Distance min (cm)',
  'Max distance (cm)': 'Distance max (cm)',
  'Temp/humidity sensor (DHT22)': 'Capteur temp/humidité (DHT22)',
  'Membrane keypad': 'Clavier matriciel',
  'LCD Texte': 'LCD Texte',
  'Interface': 'Interface',
  'I²C (4 wires)': 'I²C (4 fils)',
  'Parallel (HD44780)': 'Parallèle (HD44780)',
  'OLED display (SSD1306)': 'Écran OLED (SSD1306)',
  'NeoPixel matrix': 'Matrice NeoPixel',
  'NeoPixel ring': 'Anneau NeoPixel',
  'Pushbutton (6mm)': 'Bouton poussoir (6 mm)',
  'NTC temperature sensor': 'Capteur de température (NTC)',
  'Gas sensor (MQ)': 'Capteur de gaz (MQ)',
  'Heart-beat sensor': 'Capteur de pouls',
  'Flame sensor': 'Capteur de flamme',
  'Sound sensor': 'Capteur de son',

  // Propriétés du catalogue
  'Color': 'Couleur',
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

  // Moniteur série / console
  'Serial monitor': 'Moniteur série',
  'Console': 'Console',

  // Barre d'outils du canvas
  'Auto-route the wires (right angles)': 'Autoroutage des fils (angles droits)',
  'Zoom in': 'Zoom avant',
  'Zoom out': 'Zoom arrière',
  'Drag a pin endpoint onto another pin to reconnect it.':
    'Glissez l’extrémité d’un fil sur une autre broche pour la reconnecter.',
};

const DICTS: Record<string, Record<string, string>> = { fr: FR };

let dict: Record<string, string> = {};

/** Initialise la langue ('fr', 'fr-FR', 'en'…). Anglais par défaut. */
export function initLocale(language: string | undefined): void {
  const base = (language ?? 'en').toLowerCase().split(/[-_]/)[0];
  dict = DICTS[base] ?? {};
}

/** Traduit une chaîne source et remplace {0}, {1}… par les arguments. */
export function t(source: string, ...args: Array<string | number>): string {
  let text = dict[source] ?? source;
  args.forEach((arg, i) => {
    text = text.replaceAll(`{${i}}`, String(arg));
  });
  return text;
}
