// Génère la recette de test manuelle de Kablix (tous les composants + le
// programme, version AVR puis RP2040) au format .docx (éditable Word/LibreOffice)
// et .csv (tableur). 4 colonnes : Élément | Action | Observable | Commentaire.
//   node scripts/make-test-plan.mjs   →   docs/Recette-de-test.docx + .csv
import JSZip from 'jszip';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs');
mkdirSync(OUT, { recursive: true });

// Lignes : { s: 'titre de section' }  ou  [élément, action, observable, commentaire].
const ROWS = [
  { s: 'Préparation (commune)' },
  ['Lancer le simulateur', 'Icône Kablix (barre d’activité) ou palette → « Kablix : Ouvrir le simulateur »', 'L’atelier s’ouvre dans un nouvel onglet (palette, canvas, moniteur série)', ''],
  ['Aide', 'Bouton ❔ Aide de la barre d’outils', 'La page d’aide s’ouvre (FR si VS Code en français, sinon EN)', ''],
  ['Aide — rubrique IA', 'Sommaire → « Créer un composant avec une IA »', 'Tuto + prompt copiable affichés', ''],
  ['Toolchains', 'Vérifier arduino-cli / avr-gcc (AVR) et un firmware .uf2 MicroPython (RP2040)', 'Compilation possible ; sinon message clair + réglages kablix.*', 'Pico : téléchargement assisté au 1er lancement'],

  { s: 'Atelier (indépendant de la carte)' },
  ['Poser un composant', 'Clic sur une LED dans la palette', 'LED posée au centre du canvas', ''],
  ['Glisser-déposer', 'Glisser une résistance de la palette vers le canvas', 'Déposée à l’endroit du lâcher (la miniature suit le curseur)', ''],
  ['Déplacer (interactif)', 'Clic droit glissé sur un bouton', 'Le bouton se déplace (le clic gauche l’actionne)', ''],
  ['Rotation / miroir', 'Sélectionner → barre Orientation ↺ ↻ ⇆ ⇅ (ou touches +/-)', 'Le composant pivote / se retourne', ''],
  ['Câblage', 'Cliquer une broche dorée puis une autre broche', 'Un fil relie les deux ; clic sur le fond = coude', ''],
  ['Couleur de fil auto', 'Câbler vers GND puis vers 5V/3V3', 'Fil noir (GND) / rouge (alimentation) automatiquement', ''],
  ['Retouche de fil', 'Sélectionner un fil ; glisser un coude ; double-clic = insérer ; Suppr sur un coude', 'Tracé modifié / coude supprimé', ''],
  ['Sélection au rectangle', 'Tracer un cadre englobant 2 composants et leurs fils', 'Seuls les éléments ENTIÈREMENT encadrés sont sélectionnés', 'comportement corrigé'],
  ['Déplacement de bloc', 'Déplacer une sélection multiple', 'Composants ET coudes des fils internes suivent (tracé non déformé)', 'comportement corrigé'],
  ['Zoom', 'Ctrl + molette sur le canvas', 'Zoom centré sur le curseur ; badge ⟳ % réinitialise la vue', ''],
  ['Platine d’essai', 'Poser une breadboard, y enficher une LED', 'Bandes en surbrillance jaune au survol ; enfichage sans fil visible', 'Mini / Moyenne / Grande'],
  ['Effacer / annuler', '🗑 (canvas), touche Suppr, Ctrl+Z / Ctrl+Y', 'Suppression / annulation / rétablissement', ''],
  ['Export SVG', 'Bouton ⬇ SVG', 'Fichier .svg du schéma enregistré (composants + fils)', ''],
  ['Projet .projix', '💾 Enregistrer puis 📂 Ouvrir le .projix', 'Schéma rechargé à l’identique (carte + composants perso)', ''],
  ['Noms', 'Bouton 🏷 Noms', 'Affiche / masque les noms au-dessus des composants', ''],
  ['Composant perso', '« + Créer un composant » : nom, modèle, SVG, points de connexion', 'Composant ★ créé, persistant entre les sessions', ''],
  ['Import composant', 'Palette → ⇪ Importer (.json) → parts/hc-sr04.kablix-part.json', 'Le composant ★ apparaît dans la palette', 'dossier parts/'],
  ['Import / export Wokwi', 'Commandes Kablix d’import/export diagram.json', 'Schéma converti ; types inconnus ignorés', ''],

  { s: 'Débogage (commun)' },
  ['Compiler & exécuter', 'Choisir le fichier (pastille 📄) puis ▶ Démarrer', 'Compilation puis exécution ; statut « Running… »', '▶ recompile si le source a changé'],
  ['Pause / reprise', '⏸ puis ▶', 'La simulation se fige puis reprend', ''],
  ['Pas à pas', '⏭ Pas', 'Avance d’une ligne ; ligne surlignée dans l’éditeur', ''],
  ['Panneau Variables', 'Pendant une pause, observer le panneau Variables', 'Variables globales listées (nom : valeur)', ''],
  ['Variables en rouge', 'Avancer d’un pas pendant qu’une variable change', 'Valeur changée en rouge ; au pas suivant elle repasse en noir si inchangée', 'comportement corrigé'],
  ['Point d’arrêt', 'Cliquer dans la gouttière de l’éditeur', 'La simulation s’arrête à la ligne', ''],
  ['Point d’arrêt conditionnel', 'Clic droit gouttière → condition (ex. compteur > 100)', 'Arrêt seulement quand la condition est vraie (MicroPython)', 'C/AVR : arrêt inconditionnel'],
  ['Vitesse', 'Sélecteur 🐇 / 🐢 / 🐌', 'Ralentit l’exécution (Uno)', 'RP2040 : non réglable'],
  ['Réinitialiser', 'Bouton ⟲', 'Composants remis à leur état initial sans toucher au câblage', ''],

  { s: 'Partie 1 — AVR : Arduino Uno' },
  ['Carte Uno', 'Sélecteur → Arduino Uno ; ▶ avec un blink sur D13', 'La LED sur D13 clignote (~1 Hz)', ''],
  ['LED', 'A → D13 (via résistance 220 Ω), K → GND ; digitalWrite(13, HIGH/LOW)', 'La LED s’allume / s’éteint', ''],
  ['RGB LED', 'R/V/B → 3 broches PWM ; analogWrite', 'La couleur résultante s’affiche', ''],
  ['Bouton poussoir', 'Bouton → D2 (autre patte GND) ; INPUT_PULLUP', 'digitalRead(2) = LOW à l’appui ; LED pilotée suit', 'clic = transitoire, Ctrl+clic = maintenu'],
  ['Bouton 6 mm', 'Idem bouton poussoir', 'Idem', ''],
  ['Résistance', 'En série avec une LED', 'La LED s’allume (continuité)', 'valeur non simulée'],
  ['Buzzer', 'Broche → buzzer ; niveau haut / tone()', 'Halo « actif » sur le buzzer', ''],
  ['Potentiomètre', 'Curseur → A0 ; analogRead(A0)', 'Valeur 0–1023 varie avec le curseur de l’inspecteur', ''],
  ['Potentiomètre à glissière', 'Curseur → A0', 'Idem potentiomètre', ''],
  ['Afficheur 7 segments', 'Segments → broches ; piloter les segments', 'Le chiffre / segment s’affiche', ''],
  ['Barre de LED', 'Broches → barre ; allumer N segments', 'N segments allumés', ''],
  ['Interrupteur à glissière', 'Position → broche', 'digitalRead suit la position', ''],
  ['DIP switch ×8', 'Canaux → broches', 'Chaque canal fermé tire sa broche à LOW', ''],
  ['Joystick analogique', 'VRx → A0, VRy → A1, SW → D2', 'analogRead X/Y varient ; SW = bouton', ''],
  ['Photorésistance (LDR)', 'OUT → A0 ; régler « luminosité » dans l’inspecteur', 'analogRead(A0) varie avec le réglage', 'source analogique'],
  ['Capteurs NTC / gaz / pouls', 'Sortie → entrée analogique ; régler la valeur', 'analogRead varie', 'sources analogiques'],
  ['Capteurs PIR / inclinaison / flamme / son', 'Sortie → entrée ; basculer l’état dans l’inspecteur', 'digitalRead suit l’état (0/1)', 'sources numériques'],
  ['Servomoteur', 'Signal → D9 ; Servo.write(0 / 90 / 180)', 'Le bras se positionne à l’angle RÉEL (largeur d’impulsion)', 'angle réel mesuré'],
  ['HC-SR04 (ultrason)', 'Trig → D2, Echo → D3 ; impulsion + pulseIn(Echo) ; régler l’attribut « distance »', 'Distance mesurée ≈ valeur réglée (≈ 58 µs/cm)', 'AVR uniquement'],
  ['LCD 16×2 I²C', 'SDA → A4, SCL → A5 ; LiquidCrystal_I2C ; lcd.print("…")', 'Le texte s’affiche superposé sur l’écran', 'adresse 0x27'],
  ['PCA9685 (16 PWM)', 'SDA → A4, SCL → A5 ; régler un canal ; servo/LED relié à PWMn', 'Le servo/LED suit le rapport cyclique du canal', 'I²C 0x40'],
  ['OLED SSD1306 (SPI)', 'DATA → D11, CLK → D13, DC → D9, CS → D10 ; Adafruit_SSD1306 dessine', 'Le dessin s’affiche (blanc sur noir)', 'SPI 4 fils'],
  ['Écran TFT ILI9341 (SPI)', 'MOSI → D11, SCK → D13, D/C → D9, CS → D10 ; remplir / dessiner', 'L’image couleur s’affiche (240×320)', ''],
  ['Carte microSD (SPI)', 'DI → D11, DO → D12, SCK → D13, CS → D4 ; SD.begin(CS)', 'SD.begin réussit (carte détectée)', 'pas de FAT préchargé → open() de fichier échoue'],
  ['NeoPixel / matrice / anneau', 'DIN → D6 ; Adafruit_NeoPixel setPixelColor + show()', 'Les LED prennent les couleurs définies', 'WS2812'],
  ['Moniteur série', 'Serial.begin/print ; envoyer du texte dans le champ', 'Sortie affichée ; texte reçu côté µC', 'accents OK (UTF-8)'],

  { s: 'Partie 1 — AVR : variantes' },
  ['Arduino Nano', 'Sélecteur → Arduino Nano ; ▶ blink', 'Fonctionne comme l’Uno (ATmega328P)', 'broches D0–13, A0–A7'],
  ['Arduino Pro Mini', 'Sélecteur → Arduino Pro Mini ; ▶ blink', 'Idem ATmega328P', 'visuel = Nano'],
  ['Arduino Mega 2560', 'Sélecteur → Mega ; blink D13 + analogRead(A0)', 'LED 13 clignote ; lecture A0 OK ; broches 0–53', 'timers 3-5 / USART1-3 / ADC A8-15 non simulés'],

  { s: 'Partie 2 — RP2040 : Raspberry Pi Pico (MicroPython)' },
  ['Carte Pico', 'Sélecteur → Raspberry Pi Pico ; ▶ avec un .py (machine.Pin(25))', 'LED embarquée GP25 clignote', 'firmware MicroPython requis'],
  ['LED', 'A → GP15 (via résistance), K → GND ; Pin(15).value(1/0)', 'La LED s’allume / s’éteint', ''],
  ['Bouton', 'Bouton → GP14 ; Pin(14, Pin.IN, Pin.PULL_UP)', 'value() = 0 à l’appui', 'actif bas'],
  ['Potentiomètre', 'Curseur → GP26 (ADC0) ; machine.ADC(26).read_u16()', 'Valeur varie avec le curseur', 'GP26–28 = ADC'],
  ['Servomoteur', 'PWM 50 Hz sur GP15 ; machine.PWM(...).duty_u16(...)', 'Le bras se positionne à l’angle réel', ''],
  ['Capteurs / sources', 'Sources analogiques → GP26-28 ; sources numériques → GPx', 'read_u16 / value() suivent les réglages de l’inspecteur', ''],
  ['LCD I²C', 'SDA → GP0, SCL → GP1 ; machine.I2C + pilote LCD', 'Le texte s’affiche', 'I²C matériel'],
  ['PCA9685', 'machine.I2C ; régler un canal ; servo relié', 'Le servo est piloté', ''],
  ['OLED SSD1306 (SPI)', 'machine.SPI + DC/CS ; framebuf + show()', 'Le dessin s’affiche', ''],
  ['Écran TFT ILI9341 (SPI)', 'machine.SPI + D/C + CS ; remplir', 'L’image couleur s’affiche', ''],
  ['Carte microSD (SPI)', 'machine.SPI ; pilote sdcard + uos.mount', 'La carte est détectée (init OK)', 'FAT non préchargé'],
  ['NeoPixel', 'neopixel.NeoPixel(machine.Pin(0), n) ; np[i]=(r,g,b) ; np.write()', 'Les LED prennent les couleurs définies', 'validé sur Pico réel'],
  ['HC-SR04 (ultrason)', '—', 'NON simulé sur RP2040', 'disponible sur AVR uniquement'],
  ['Moniteur série', 'print() ; saisie dans le champ → REPL', 'Sortie affichée ; REPL interactif après le script', 'USB-CDC'],

  { s: 'Partie 2 — RP2040 : Pico W (Wi-Fi)' },
  ['Carte Pico W', 'Sélecteur → Raspberry Pi Pico W ; ▶ un .py réseau', 'Démarre comme le Pico ; firmware RPI_PICO_W', 'même brochage'],
  ['Wi-Fi — connexion', 'network.WLAN(STA_IF) ; wlan.connect(...) ; wlan.isconnected()', 'isconnected() = True ; ifconfig() = 192.168.1.50', 'WLAN factice'],
  ['Wi-Fi — requête réelle', 'urequests.get("https://…") ; r.status_code / r.json()', 'Vraie réponse HTTP relayée par l’hôte', 'pont réseau réel'],
  ['Wi-Fi — coupé', 'Désactiver kablix.picowNetworkBridge ; relancer', 'Requête bloquée / OSError', 'sécurité / contrôle'],
];

// --- Helpers XML / DOCX -----------------------------------------------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const COLS = [2300, 3200, 2500, 1700]; // largeurs en twips

function cell(text, w, { bold = false, fill = null } = {}) {
  const shd = fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '';
  const rPr = bold ? '<w:rPr><w:b/></w:rPr>' : '';
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${shd}</w:tcPr>` +
    `<w:p><w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p></w:tc>`
  );
}

function rowXml(cells, opts = {}) {
  return `<w:tr>${cells.map((t, i) => cell(t, COLS[i], opts)).join('')}</w:tr>`;
}

function sectionXml(title) {
  // Ligne de section : titre en gras sur fond bleu, 4 cellules fusionnées visuellement.
  const cells = [title, '', '', ''].map((t, i) => cell(t, COLS[i], { bold: true, fill: 'D9E2F3' }));
  return `<w:tr>${cells.join('')}</w:tr>`;
}

const header = rowXml(['Élément en test', 'Action à mener', 'Observable pour valider', 'Commentaire'], { bold: true, fill: 'BDD7EE' });
const body = ROWS.map((r) => (Array.isArray(r) ? rowXml(r) : sectionXml(r.s))).join('');

const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
  .map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`)
  .join('');

const documentXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
  `<w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>Recette de test — Kablix</w:t></w:r></w:p>` +
  `<w:p><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">Tester chaque composant et le programme, en version AVR (Arduino) puis RP2040 (Raspberry Pi Pico). Cocher le commentaire après chaque test.</w:t></w:r></w:p>` +
  `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr>` +
  `<w:tblGrid>${COLS.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` +
  header + body +
  `</w:tbl>` +
  `<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>` +
  `</w:body></w:document>`;

const contentTypes =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `</Types>`;

const rels =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

const zip = new JSZip();
zip.file('[Content_Types].xml', contentTypes);
zip.file('_rels/.rels', rels);
zip.file('word/document.xml', documentXml);
const docxBuf = await zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
writeFileSync(join(OUT, 'Recette-de-test.docx'), docxBuf);

// --- CSV (tableur) ----------------------------------------------------------
const csvCell = (s) => `"${String(s).replace(/"/g, '""')}"`;
const csvLines = [['Élément en test', 'Action à mener', 'Observable pour valider', 'Commentaire'].map(csvCell).join(';')];
for (const r of ROWS) {
  if (Array.isArray(r)) csvLines.push(r.map(csvCell).join(';'));
  else csvLines.push([`== ${r.s} ==`, '', '', ''].map(csvCell).join(';'));
}
writeFileSync(join(OUT, 'Recette-de-test.csv'), '﻿' + csvLines.join('\r\n'), 'utf8');

const nRows = ROWS.filter((r) => Array.isArray(r)).length;
console.log(`OK : docs/Recette-de-test.docx + .csv (${nRows} tests, ${ROWS.length - nRows} sections)`);
