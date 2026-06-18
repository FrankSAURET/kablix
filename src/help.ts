import * as vscode from 'vscode';

// Liens « aide en ligne » : dépôt GitHub et documentation utilisateur (FR/EN).
const REPO_URL = 'https://github.com/FrankSAURET/kablix';
const DOC_URL = 'https://github.com/FrankSAURET/kablix/blob/main/docs/UTILISATION.md';
const DOC_URL_EN = 'https://github.com/FrankSAURET/kablix/blob/main/docs/USAGE.en.md';

/** Vrai si VS Code tourne en français (sinon l'aide s'affiche en anglais). */
function isFrench(): boolean {
  return (vscode.env.language ?? 'en').toLowerCase().startsWith('fr');
}

/**
 * Panneau d'aide local (packagé, donc disponible hors-ligne). Le contenu suit
 * la langue de VS Code : français si `vscode.env.language` commence par « fr »,
 * anglais sinon (langue de repli). Un seul panneau à la fois : un nouvel appel
 * révèle l'existant plutôt que d'en ouvrir un second (même logique que
 * SimulatorPanel).
 */
export class HelpPanel {
  public static readonly viewType = 'kablix.help';
  private static current: HelpPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  public static createOrShow(): void {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (HelpPanel.current) {
      HelpPanel.current.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      HelpPanel.viewType,
      isFrench() ? 'Kablix — Aide' : 'Kablix — Help',
      column ?? vscode.ViewColumn.One,
      { enableScripts: false }
    );

    HelpPanel.current = new HelpPanel(panel);
  }

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.webview.html = getHtml(this.panel.webview);
    this.panel.onDidDispose(() => this.onDispose(), null, this.disposables);
  }

  private onDispose(): void {
    HelpPanel.current = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

function getHtml(webview: vscode.Webview): string {
  const nonce = getNonce();
  // CSP autonome : aucune ressource externe, styles inline pour le thème VS Code.
  const csp = [
    `default-src 'none'`,
    `style-src 'nonce-${nonce}'`,
    `img-src ${webview.cspSource} https: data:`,
  ].join('; ');

  const fr = isFrench();
  const lang = fr ? 'fr' : 'en';
  const title = fr ? 'Kablix — Aide' : 'Kablix — Help';
  const body = fr ? bodyFr() : bodyEn();

  return /* html */ `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style nonce="${nonce}">
    :root { color-scheme: light dark; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      line-height: 1.55;
      margin: 0;
      padding: 0 1.5rem 4rem;
    }
    .wrap { max-width: 52rem; margin: 0 auto; }
    h1 { font-size: 1.7rem; margin: 1.5rem 0 0.25rem; }
    h2 {
      font-size: 1.25rem;
      margin: 2.2rem 0 0.5rem;
      padding-top: 0.4rem;
      border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,.3));
    }
    h3 { font-size: 1.05rem; margin: 1.3rem 0 0.3rem; }
    p, li { color: var(--vscode-foreground); }
    a { color: var(--vscode-textLink-foreground); text-decoration: none; }
    a:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }
    code, kbd {
      font-family: var(--vscode-editor-font-family, monospace);
      background: var(--vscode-textCodeBlock-background, rgba(128,128,128,.15));
      border-radius: 3px;
      padding: 0.05em 0.35em;
      font-size: 0.92em;
    }
    kbd { border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.4)); }
    .lead { color: var(--vscode-descriptionForeground); margin-top: 0.2rem; }
    .toc {
      background: var(--vscode-textBlockQuote-background, rgba(128,128,128,.08));
      border-left: 3px solid var(--vscode-textLink-foreground);
      border-radius: 4px;
      padding: 0.8rem 1.2rem;
      margin: 1.2rem 0;
    }
    .toc ol { margin: 0.3rem 0; padding-left: 1.4rem; }
    .toc li { margin: 0.15rem 0; }
    ol.steps { padding-left: 1.4rem; }
    ol.steps > li { margin: 0.4rem 0; }
    .note {
      background: var(--vscode-textBlockQuote-background, rgba(128,128,128,.08));
      border-left: 3px solid var(--vscode-descriptionForeground);
      border-radius: 4px;
      padding: 0.5rem 1rem;
      margin: 0.8rem 0;
      color: var(--vscode-descriptionForeground);
    }
    .online {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      margin: 0.6rem 0 0.3rem;
    }
    .online a {
      border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.4));
      border-radius: 4px;
      padding: 0.35rem 0.8rem;
    }
    .top { font-size: 0.8rem; }
    pre {
      background: var(--vscode-textCodeBlock-background, rgba(128,128,128,.15));
      border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.3));
      border-radius: 4px;
      padding: 0.8rem 1rem;
      overflow: auto;
      white-space: pre-wrap;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.88em;
      line-height: 1.45;
    }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

/** Corps de l'aide en français. */
function bodyFr(): string {
  return /* html */ `  <div class="wrap">
    <h1>Kablix — Aide</h1>
    <p class="lead">Simulateur Arduino Uno / Raspberry Pi Pico intégré à VS Code, 100&nbsp;% hors-ligne. Cette aide est locale (disponible sans connexion) ; la version en ligne complète est liée plus bas.</p>

    <nav class="toc" aria-label="Sommaire">
      <strong>Sommaire</strong>
      <ol>
        <li><a href="#demarrage">Démarrage</a></li>
        <li><a href="#interface">Interface</a></li>
        <li><a href="#montage">Construire un montage</a></li>
        <li><a href="#executer">Exécuter du code</a></li>
        <li><a href="#debogage">Débogage pas à pas</a></li>
        <li><a href="#serie">Moniteur série</a></li>
        <li><a href="#svg">Export SVG</a></li>
        <li><a href="#composants">Composants personnalisés</a></li>
        <li><a href="#composants-ia">Créer un composant avec une IA</a></li>
        <li><a href="#updates">Mises à jour des bibliothèques</a></li>
        <li><a href="#pas-a-pas-arduino">Pas à pas — Arduino</a></li>
        <li><a href="#pas-a-pas-pico">Pas à pas — Raspberry Pi Pico (MicroPython)</a></li>
        <li><a href="#en-ligne">Aide en ligne</a></li>
      </ol>
    </nav>

    <h2 id="demarrage">Démarrage</h2>
    <p>Trois façons d'ouvrir le simulateur :</p>
    <ul>
      <li>l'<strong>icône Kablix</strong> dans la barre d'activité (à gauche) ;</li>
      <li>la palette de commandes (<kbd>Ctrl+Shift+P</kbd>) → <strong>« Kablix : Ouvrir le simulateur »</strong> ;</li>
      <li>la commande <strong>« Kablix : Compiler »</strong> (ouvre le simulateur et y charge le fichier en cours d'édition).</li>
    </ul>
    <p>Au premier affichage, la feuille de dessin est vide : posez vos composants depuis la palette, câblez-les, puis cliquez <strong>▶ Démarrer</strong>. <strong>▶ compile automatiquement</strong> votre fichier de code (cf. chip 📄) s'il a changé depuis la dernière exécution, sinon il relance le binaire déjà compilé — il n'y a plus de bouton « Compiler » séparé. Pendant la simulation le schéma est figé (pas de sélection ni de modification) ; le bouton <strong>⟲</strong> de la barre de simulation remet les composants à leur état initial.</p>

    <h2 id="interface">Interface</h2>
    <ul>
      <li><strong>Barre d'outils</strong> (haut) : sélecteur de carte, ▶ Démarrer (compile le code modifié au besoin) / ■ Arrêter / ⏸ Pause / ⏭ Pas, vitesse 🐇/🐢/🐌, ⬇ SVG, 🏷 Noms. (Le bouton <strong>↑ Charger binaire</strong> est masqué par défaut — cf. réglages.)</li>
      <li><strong>Palette</strong> (gauche) : les composants à poser, triés <strong>AZ</strong> ou par <strong>catégories</strong>, avec une zone « Derniers utilisés ».</li>
      <li><strong>Canvas</strong> (centre) : les composants, les fils et leurs poignées.</li>
      <li><strong>Propriétés</strong> / inspecteur (droite) : édite l'élément sélectionné (couleur, valeur, angle, suppression) ; une zone d'aide y rappelle les gestes utiles.</li>
      <li><strong>Moniteur série</strong> (bas) : sortie en temps réel et champ d'envoi.</li>
    </ul>

    <h2 id="montage">Construire un montage</h2>
    <h3>Poser et déplacer</h3>
    <ul>
      <li><strong>Poser</strong> : clic sur un composant de la palette (posé au centre) ou glisser-déposer vers le canvas — la miniature du composant suit alors le curseur.</li>
      <li><strong>Déplacer</strong> : glisser le corps du composant, ou <strong>glisser au clic droit</strong> — indispensable pour les composants interactifs (bouton, potentiomètre…) dont le clic gauche actionne le contrôle.</li>
      <li><strong>Tourner / retourner</strong> : sélectionner puis utiliser la barre <strong>Orientation</strong> de l'inspecteur — icônes ↺ ↻ (rotation de 45°) et ⇆ ⇅ (miroir horizontal / vertical). Les touches <kbd>+</kbd> / <kbd>-</kbd> font aussi tourner le composant sélectionné.</li>
      <li><strong>Câblage interne</strong> : pour les composants qui en ont un schéma (bouton, LED, résistance, buzzer), le bouton 🔌 du bandeau (à gauche du ✕) l'affiche ou le masque par-dessus le composant.</li>
      <li><strong>Zoomer</strong> : <kbd>Ctrl</kbd>+<strong>molette</strong> dans le canvas (centré sur le curseur) ; le badge <code>⟳ %</code> en bas à droite réinitialise la vue d'un clic.</li>
      <li><strong>Supprimer</strong> : 🗑 de l'inspecteur ou <kbd>Suppr</kbd>.</li>
      <li><strong>Annuler / Refaire</strong> : <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd>.</li>
      <li><strong>Tout effacer</strong> : bouton 🗑 en haut à droite du canvas (annulable avec <kbd>Ctrl+Z</kbd>).</li>
    </ul>
    <h3>Câbler</h3>
    <ol class="steps">
      <li>Cliquer une <strong>broche</strong> (pastille dorée) : le fil démarre.</li>
      <li>Chaque clic sur le fond pose un <strong>coude</strong> (segments aimantés à l'horizontale/verticale).</li>
      <li>Cliquer une autre broche termine le fil. <kbd>Échap</kbd> annule.</li>
    </ol>
    <p>Un fil touchant une masse naît noir, une alimentation rouge, sinon il suit les couleurs Dupont. La couleur reste modifiable dans l'inspecteur. <strong>Retoucher un fil</strong> : le sélectionner fait apparaître des poignées sur chaque coude ; <kbd>Ctrl</kbd> maintenu pendant le glissement aligne le coude (réticule H/V) ; double-clic sur le fil insère un coude ; cliquer un coude puis <kbd>Suppr</kbd> le supprime (sinon <kbd>Suppr</kbd> efface tout le fil).</p>
    <p>La <strong>platine d'essai</strong> existe en trois tailles (mini / half / full). Au survol pendant un déplacement, les bandes qui recevraient les broches s'allument en jaune ; au relâchement le composant s'enfiche automatiquement, sans fil visible.</p>

    <h2 id="executer">Exécuter du code</h2>
    <p>Le <strong>chip 📄</strong> dans la barre de simulation (en haut à gauche du canvas) indique le fichier de code exécuté / débogué ; un clic dessus permet d'en choisir un autre. À défaut, c'est le fichier actif de l'éditeur qui sert.</p>
    <p>Le bouton <strong>▶ Démarrer</strong> compile (si le source a changé) et exécute le fichier de code (cf. chip 📄) ; le traitement dépend de l'extension du fichier :</p>
    <ul>
      <li><code>.ino</code>, <code>.c</code>, <code>.cpp</code> (Uno) : compilation locale (<code>arduino-cli</code> ou <code>avr-gcc</code>) ;</li>
      <li><code>.c</code>, <code>.cpp</code> (Pico) : compilation bare-metal (<code>arm-none-eabi-gcc</code>) ;</li>
      <li><code>.py</code> : MicroPython sur le Pico simulé (firmware <code>.uf2</code> requis) ;</li>
      <li><code>.hex</code> / <code>.uf2</code> / <code>.elf</code> / <code>.bin</code> : chargés directement.</li>
    </ul>
    <p>Bouton <strong>↑ Charger binaire</strong> : détecte et lance un binaire <strong>déjà compilé</strong> (sans recompiler) — le <code>.hex</code> le plus récent (sortie de <code>.vscode/arduino.json</code>, sinon scan) pour l'Arduino, ou le <code>.uf2</code> du dossier <code>build/</code> pour le Pico. Utile pour exécuter un binaire produit par un autre outil (extension Arduino, CMake…). <strong>Ce bouton est masqué par défaut</strong> : activez le réglage <code>kablix.showLoadBinaryButton</code> pour l'afficher.</p>

    <h2 id="debogage">Débogage pas à pas</h2>
    <ul>
      <li><strong>⏸ Pause / ▶ Reprendre</strong> : gèle la simulation ; l'état des broches et des LED reste affiché. Le sélecteur 🐇/🐢/🐌 ralentit l'exécution (Uno).</li>
      <li><strong>⏭ Pas</strong> : exécute une ligne du fichier source puis se remet en pause. Le panneau <strong>Variables</strong> (sous le canvas) montre la ligne courante et les variables globales ; la ligne est aussi surlignée dans l'éditeur.</li>
      <li><strong>Points d'arrêt</strong> : cliquer dans la gouttière de l'éditeur ; la simulation se met en pause en atteignant la ligne. Un <strong>point d'arrêt conditionnel</strong> (clic droit dans la gouttière → « Ajouter un point d'arrêt conditionnel ») ne suspend l'exécution que si sa condition est vraie — en <strong>MicroPython</strong>, la condition est une expression Python évaluée dans les variables globales du script (ex. <code>compteur &gt; 100</code>). En C/Arduino la condition n'est pas évaluée (arrêt inconditionnel).</li>
      <li>Une variable dont la valeur <strong>change</strong> en cours de débogage passe en <strong>rouge</strong> dans le panneau Variables, jusqu'au prochain démarrage.</li>
    </ul>
    <p class="note">Le pas à pas couvre les variables <strong>globales</strong> simples (C/Arduino via infos DWARF, MicroPython instrumenté). Les artefacts chargés directement n'ont pas d'infos de débogage : pause et ralenti restent disponibles, pas le pas à pas.</p>

    <h2 id="serie">Moniteur série</h2>
    <ul>
      <li><strong>Sortie</strong> : USART (Uno), USB-CDC et UART0 (Pico), en temps réel.</li>
      <li><strong>Entrée</strong> : champ de saisie + <kbd>Entrée</kbd> (ou bouton Envoyer). Sur le Pico, l'entrée alimente l'USB-CDC (REPL MicroPython) et l'UART0.</li>
    </ul>

    <h2 id="svg">Export SVG</h2>
    <p>Bouton <strong>⬇ SVG</strong> : le schéma complet (composants avec leurs rotations, fils colorés avec leurs arrondis) est exporté en fichier SVG autonome, utilisable dans un document, un site ou une impression.</p>

    <h2 id="composants">Composants personnalisés</h2>
    <p>Bouton <strong>« + Créer un composant »</strong> en bas de la palette : nom, modèle de simulation (LED, bouton, résistance, buzzer, source numérique/analogique, décoratif), dessin SVG avec aperçu live, points de connexion cliqués sur l'aperçu, puis correspondance des rôles. Le composant (★) est persisté entre les sessions. Depuis la palette : clic = poser, double-clic = modifier, ⇩ = exporter en <code>.json</code>, ✕ = supprimer, <strong>⇪ Importer (.json)</strong> = charger un composant partagé. Le format <code>.kablix-part.json</code> est documenté dans l'aide en ligne.</p>

    <h3 id="composants-ia">Créer un composant avec une IA</h3>
    <p>Une IA (ChatGPT, Claude, Gemini…) sait produire un composant complet — dessin SVG <em>et</em> broches — directement au format importable. Marche à suivre :</p>
    <ol class="steps">
      <li>Copiez le <strong>prompt</strong> ci-dessous dans l'IA et décrivez le composant voulu à la place du texte entre crochets.</li>
      <li>Récupérez le bloc JSON renvoyé et enregistrez-le dans un fichier <code>mon-composant.kablix-part.json</code> (ou <code>.json</code>).</li>
      <li>Dans la palette Kablix : <strong>⇪ Importer (.json)</strong>, choisissez le fichier. Le composant (★) apparaît, prêt à poser.</li>
      <li>Au besoin, <strong>double-cliquez</strong> le composant dans la palette pour réajuster les points de connexion sur l'aperçu.</li>
    </ol>
    <p class="note">⚠ Espacez les broches d'un <strong>multiple de 10 px</strong> (le pas de la grille = écartement réel de 0,1″ entre pattes) : elles tombent alors pile sur la grille et sur les trous de la platine d'essai.</p>
    <p>Champs du format : <code>label</code> (nom affiché, requis), <code>svg</code> (dessin, requis), <code>pins</code> (liste <code>{ name, x, y }</code>, requis), <code>kind</code> (modèle de simulation), <code>pinRoles</code> (rôle → broche). Modèles disponibles pour <code>kind</code> : <code>led</code> (rôles A/C), <code>pushbutton</code> (1.l/2.l), <code>resistor</code> (1/2), <code>buzzer</code> (1/2), <code>digital-source</code> (OUT), <code>analog-source</code> (AO), <code>servo</code>, <code>ultrasonic</code> (TRIG/ECHO — HC-SR04), <code>i2c-lcd</code> (afficheur HD44780), <code>i2c-pwm</code> (PCA9685), <code>passive</code> (décoratif).</p>
    <p>Prompt à copier :</p>
    <pre>Tu es un assistant qui crée un composant électronique pour le simulateur Kablix.
Réponds UNIQUEMENT par un objet JSON valide (format .kablix-part.json), sans texte autour.

Composant voulu : [DÉCRIS ICI : ex. « capteur de température TMP36, boîtier TO-92, 3 broches VCC / SORTIE / GND »].

Contraintes :
- "svg" : un dessin SVG autonome, lisible, avec un attribut viewBox et des dimensions réalistes.
  Le repère commence en haut à gauche (0,0). Dessine les pattes/broches sur le dessin.
- "pins" : une entrée { "name", "x", "y" } par broche, aux coordonnées EXACTES (dans le repère du SVG)
  du point de connexion. ESPACE les broches d'un multiple de 10 (pas de la grille = 0,1").
- "kind" : choisis le modèle de simulation le plus proche parmi
  led | pushbutton | resistor | buzzer | digital-source | analog-source | passive.
- "pinRoles" : associe chaque rôle du modèle à un nom de broche (ex. { "AO": "SORTIE" } pour analog-source).
- "label" : nom court affiché dans la palette ; "type" : identifiant en minuscules sans espace.

Schéma de la réponse :
{
  "type": "tmp36",
  "label": "TMP36",
  "kind": "analog-source",
  "svg": "&lt;svg viewBox='0 0 60 80' ...&gt;...&lt;/svg&gt;",
  "pins": [
    { "name": "VCC", "x": 10, "y": 70 },
    { "name": "SORTIE", "x": 30, "y": 70 },
    { "name": "GND", "x": 50, "y": 70 }
  ],
  "pinRoles": { "AO": "SORTIE" }
}</pre>

    <h2 id="updates">Mises à jour des bibliothèques</h2>
    <p>Kablix embarque <code>avr8js</code>, <code>rp2040js</code> et <code>@wokwi/elements</code>, et reste <strong>hors-ligne par défaut</strong>.</p>
    <ul>
      <li><strong>Vérification manuelle</strong> : palette de commandes → <strong>« Kablix : Vérifier les mises à jour des bibliothèques »</strong>.</li>
      <li><strong>Au démarrage</strong> (optionnel) : réglage <code>kablix.checkUpdatesOnStartup</code> ; une notification n'apparaît qu'en cas de mise à jour.</li>
    </ul>
    <p class="note">Mettre à jour ces bibliothèques peut casser l'extension (changements d'API). En cas de problème, ouvrez une demande sur le dépôt GitHub.</p>

    <h2 id="pas-a-pas-arduino">Pas à pas — Arduino</h2>
    <p>Partez d'un sketch écrit et édité dans l'extension d'édition Arduino <strong>« Arduino-VsCode-IDE »</strong>, puis exécutez-le dans Kablix.</p>
    <ol class="steps">
      <li><strong>Écrire le sketch</strong> dans « Arduino-VsCode-IDE » : ouvrez ou créez votre fichier <code>.ino</code> (ou <code>.c</code>/<code>.cpp</code>) et sélectionnez la carte <em>Arduino Uno</em>.</li>
      <li><strong>Préparer le montage dans Kablix</strong> : ouvrez le simulateur (icône Kablix), choisissez la carte <em>Arduino Uno</em>, posez les composants depuis la palette et câblez-les (par ex. une LED + résistance sur D13, un bouton sur une entrée).</li>
      <li><strong>Compiler &amp; exécuter</strong> : le fichier <code>.ino</code> étant l'éditeur actif (cf. chip 📄), cliquez <strong>▶ Démarrer</strong> (compilation locale via <code>arduino-cli</code> si le source a changé). Variante : si « Arduino-VsCode-IDE » a déjà produit un <code>.hex</code>, activez le réglage <code>kablix.showLoadBinaryButton</code> puis utilisez <strong>↑ Charger binaire</strong> pour récupérer l'artefact le plus récent. Si <code>arduino-cli</code> est installé mais introuvable, renseignez le réglage <code>kablix.arduinoCliPath</code>.</li>
      <li><strong>Observer</strong> : la ou les LED s'allument selon le programme ; ouvrez le <strong>moniteur série</strong> (bas) pour voir les <code>Serial.print()</code>, et envoyez-y des données si besoin.</li>
      <li><strong>Déboguer pas à pas</strong> : posez un <strong>point d'arrêt</strong> dans la gouttière de l'éditeur, ou utilisez <strong>⏸ Pause</strong> puis <strong>⏭ Pas</strong> pour avancer ligne par ligne et lire les variables globales dans le panneau <em>Variables</em>.</li>
    </ol>

    <h2 id="pas-a-pas-pico">Pas à pas — Raspberry Pi Pico (MicroPython)</h2>
    <p>Partez d'un script <code>.py</code> édité avec l'extension officielle <strong>« Raspberry Pi Pico »</strong>, puis exécutez-le dans Kablix.</p>
    <ol class="steps">
      <li><strong>Écrire le script</strong> <code>.py</code> dans l'extension « Raspberry Pi Pico » (édition, structure de projet MicroPython).</li>
      <li><strong>Firmware MicroPython</strong> : au premier lancement d'un <code>.py</code>, si aucun firmware n'est trouvé, Kablix propose de le <strong>télécharger automatiquement</strong> (choix Pico / Pico W) ; il est ensuite mémorisé et réutilisé dans tous vos projets. Vous pouvez aussi fournir le vôtre : placez un <code>.uf2</code> officiel (<a href="https://micropython.org/download/RPI_PICO/">micropython.org/download/RPI_PICO</a>) dans le workspace, ou renseignez son chemin dans le réglage <code>kablix.micropythonUf2</code>.</li>
      <li><strong>Préparer le montage dans Kablix</strong> : ouvrez le simulateur, choisissez la carte <em>Raspberry Pi Pico</em>, posez et câblez vos composants (par ex. une LED sur GP25/GP15).</li>
      <li><strong>Compiler &amp; exécuter</strong> : le fichier <code>.py</code> étant actif (cf. chip 📄), cliquez <strong>▶ Démarrer</strong>. Le firmware démarre puis le script est injecté via le raw REPL.</li>
      <li><strong>Observer</strong> : les <code>print()</code> apparaissent dans le <strong>moniteur série</strong> ; à la fin du script, le REPL interactif reste disponible via le champ d'envoi.</li>
      <li><strong>Déboguer pas à pas</strong> : <strong>⏸ Pause</strong> / <strong>⏭ Pas</strong> et les points d'arrêt fonctionnent sur les variables globales (script instrumenté automatiquement) ; la pause prend effet à la ligne suivante.</li>
    </ol>
    <p class="note">⚠ <strong>Fonctionnement entièrement hors-ligne</strong> : pour qu'un poste sans accès Internet n'ait jamais à télécharger le firmware, <strong>placez le <code>.uf2</code> MicroPython directement dans le dossier du projet</strong> (il sera versionné avec le projet et distribué aux élèves). Kablix cherche le firmware <strong>d'abord dans le workspace</strong>, puis dans le firmware téléchargé/mémorisé, et ne propose le téléchargement qu'en dernier recours. Un projet qui embarque son firmware est donc reproductible et autonome.</p>
    <h3>Wi-Fi du Pico W (pont réseau)</h3>
    <p>La puce Wi-Fi du Pico W n'est pas émulée, mais Kablix fournit un <strong>pont réseau réel</strong> : quand la carte sélectionnée est <em>Raspberry Pi Pico W</em>, les modules MicroPython <code>network</code> et <code>urequests</code> (alias <code>requests</code>) sont automatiquement remplacés par des versions qui font passer les vraies requêtes HTTP par <strong>l'hôte VS Code</strong>. Concrètement : <code>network.WLAN</code> « se connecte » instantanément (IP factice <code>192.168.1.50</code>), et <code>urequests.get/post(...)</code> exécute une <strong>vraie</strong> requête depuis la machine, puis renvoie la réponse (<code>status_code</code>, <code>text</code>, <code>json()</code>) au script.</p>
    <pre>import network, urequests
wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect("mon-ssid", "mon-mdp")
print(wlan.isconnected())          # True (connexion simulée)
r = urequests.get("https://api.exemple.fr/data")
print(r.status_code, r.json())     # vraie réponse via l'hôte
r.close()</pre>
    <p class="note">Le pont est <strong>activé par défaut</strong> et n'agit que pour la carte Pico W. Désactivez-le avec le réglage <code>kablix.picowNetworkBridge</code> pour bloquer toute requête sortante. Limites : HTTP(S) uniquement (pas de sockets bruts), corps de réponse plafonné (le tunnel série est lent), délai de 15 s par requête.</p>

    <h2 id="en-ligne">Aide en ligne</h2>
    <p>La documentation complète et à jour est en ligne :</p>
    <div class="online">
      <a href="${DOC_URL}">📖 Guide d'utilisation (docs/UTILISATION.md)</a>
      <a href="${REPO_URL}">⭐ Dépôt GitHub Kablix</a>
    </div>
    <p class="top"><a href="#demarrage">↑ Retour au sommaire</a></p>
  </div>`;
}

/** Help body in English (fallback language). */
function bodyEn(): string {
  return /* html */ `  <div class="wrap">
    <h1>Kablix — Help</h1>
    <p class="lead">Arduino Uno / Raspberry Pi Pico simulator built into VS Code, 100&nbsp;% offline. This help is local (available without a connection); the full online version is linked below.</p>

    <nav class="toc" aria-label="Contents">
      <strong>Contents</strong>
      <ol>
        <li><a href="#start">Getting started</a></li>
        <li><a href="#ui">Interface</a></li>
        <li><a href="#build">Building a circuit</a></li>
        <li><a href="#run">Running code</a></li>
        <li><a href="#debug">Step-by-step debugging</a></li>
        <li><a href="#serial">Serial monitor</a></li>
        <li><a href="#svg">SVG export</a></li>
        <li><a href="#parts">Custom parts</a></li>
        <li><a href="#parts-ai">Creating a part with an AI</a></li>
        <li><a href="#updates">Library updates</a></li>
        <li><a href="#walk-arduino">Walkthrough — Arduino</a></li>
        <li><a href="#walk-pico">Walkthrough — Raspberry Pi Pico (MicroPython)</a></li>
        <li><a href="#online">Online help</a></li>
      </ol>
    </nav>

    <h2 id="start">Getting started</h2>
    <p>Three ways to open the simulator:</p>
    <ul>
      <li>the <strong>Kablix icon</strong> in the activity bar (left);</li>
      <li>the command palette (<kbd>Ctrl+Shift+P</kbd>) → <strong>"Kablix: Open the simulator"</strong>;</li>
      <li>the <strong>"Kablix: Compile"</strong> command (opens the simulator and loads the file you are editing).</li>
    </ul>
    <p>On first display the canvas is empty: drop parts from the palette, wire them up, then click <strong>▶ Start</strong>. <strong>▶ automatically compiles</strong> your code file (see the 📄 chip) if it changed since the last run, otherwise it re-runs the already-compiled binary — there is no separate "Compile" button. During simulation the diagram is frozen (no selection or editing); the <strong>⟲</strong> button on the simulation bar resets the parts to their initial state.</p>

    <h2 id="ui">Interface</h2>
    <ul>
      <li><strong>Toolbar</strong> (top): board selector, ▶ Start (compiles changed code if needed) / ■ Stop / ⏸ Pause / ⏭ Step, speed 🐇/🐢/🐌, ⬇ SVG, 🏷 Names, ❔ Help. (The <strong>↑ Load binary</strong> button is hidden by default — see settings.)</li>
      <li><strong>Palette</strong> (left): the parts to drop, sorted <strong>A–Z</strong> or by <strong>category</strong>, with a "Recently used" area.</li>
      <li><strong>Canvas</strong> (center): parts, wires and their handles.</li>
      <li><strong>Properties</strong> / inspector (right): edits the selected item (color, value, angle, deletion); a help area there recalls the useful gestures.</li>
      <li><strong>Serial monitor</strong> (bottom): real-time output and a send field.</li>
    </ul>

    <h2 id="build">Building a circuit</h2>
    <h3>Place and move</h3>
    <ul>
      <li><strong>Place</strong>: click a part in the palette (dropped at the center) or drag-and-drop onto the canvas — the part thumbnail then follows the cursor.</li>
      <li><strong>Move</strong>: drag the part body, or <strong>right-click drag</strong> — essential for interactive parts (button, potentiometer…) whose left click actuates the control.</li>
      <li><strong>Rotate / flip</strong>: select then use the inspector's <strong>Orientation</strong> bar — icons ↺ ↻ (45° rotation) and ⇆ ⇅ (horizontal / vertical mirror). The <kbd>+</kbd> / <kbd>-</kbd> keys also rotate the selected part.</li>
      <li><strong>Internal wiring</strong>: for parts that have a schematic (button, LED, resistor, buzzer), the 🔌 button in the name banner (left of the ✕) shows or hides it over the part.</li>
      <li><strong>Zoom</strong>: <kbd>Ctrl</kbd>+<strong>wheel</strong> on the canvas (centered on the cursor); the <code>⟳ %</code> badge at the bottom right resets the view in one click.</li>
      <li><strong>Delete</strong>: 🗑 in the inspector or <kbd>Del</kbd>.</li>
      <li><strong>Undo / Redo</strong>: <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd>.</li>
      <li><strong>Clear all</strong>: the 🗑 button at the top right of the canvas (undoable with <kbd>Ctrl+Z</kbd>).</li>
    </ul>
    <h3>Wiring</h3>
    <ol class="steps">
      <li>Click a <strong>pin</strong> (golden dot): the wire starts.</li>
      <li>Each click on the background adds a <strong>corner</strong> (segments snapped to horizontal/vertical).</li>
      <li>Click another pin to finish the wire. <kbd>Esc</kbd> cancels.</li>
    </ol>
    <p>A wire touching a ground is born black, a power rail red, otherwise it follows the Dupont ribbon colors. The color stays editable in the inspector. <strong>Editing a wire</strong>: selecting it reveals handles on each corner; holding <kbd>Ctrl</kbd> while dragging aligns the corner (H/V crosshair); double-clicking the wire inserts a corner; clicking a corner then <kbd>Del</kbd> removes it (otherwise <kbd>Del</kbd> erases the whole wire).</p>
    <p>The <strong>breadboard</strong> comes in three sizes (mini / half / full). While hovering during a move, the strips that would receive the pins light up yellow; on release the part plugs in automatically, with no visible wire.</p>

    <h2 id="run">Running code</h2>
    <p>The <strong>📄 chip</strong> on the simulation bar (top left of the canvas) shows the code file being run / debugged; clicking it lets you pick another one. Otherwise the active editor file is used.</p>
    <p>The <strong>▶ Start</strong> button compiles (if the source changed) and runs the code file (see the 📄 chip); handling depends on the file extension:</p>
    <ul>
      <li><code>.ino</code>, <code>.c</code>, <code>.cpp</code> (Uno): local compilation (<code>arduino-cli</code> or <code>avr-gcc</code>);</li>
      <li><code>.c</code>, <code>.cpp</code> (Pico): bare-metal compilation (<code>arm-none-eabi-gcc</code>);</li>
      <li><code>.py</code>: MicroPython on the simulated Pico (a <code>.uf2</code> firmware is required);</li>
      <li><code>.hex</code> / <code>.uf2</code> / <code>.elf</code> / <code>.bin</code>: loaded directly.</li>
    </ul>
    <p><strong>↑ Load binary</strong> button: detects and runs an <strong>already-compiled</strong> binary (without recompiling) — the most recent <code>.hex</code> (output of <code>.vscode/arduino.json</code>, otherwise a scan) for the Arduino, or the <code>.uf2</code> in the <code>build/</code> folder for the Pico. Useful to run a binary produced by another tool (Arduino extension, CMake…). <strong>This button is hidden by default</strong>: enable the <code>kablix.showLoadBinaryButton</code> setting to show it.</p>

    <h2 id="debug">Step-by-step debugging</h2>
    <ul>
      <li><strong>⏸ Pause / ▶ Resume</strong>: freezes the simulation; the pin and LED states stay shown. The 🐇/🐢/🐌 selector slows execution down (Uno).</li>
      <li><strong>⏭ Step</strong>: runs one line of the source file then pauses again. The <strong>Variables</strong> panel (under the canvas) shows the current line and the global variables; the line is also highlighted in the editor.</li>
      <li><strong>Breakpoints</strong>: click in the editor gutter; the simulation pauses when it reaches the line. A <strong>conditional breakpoint</strong> (right-click in the gutter → "Add Conditional Breakpoint") only pauses when its condition is true — in <strong>MicroPython</strong>, the condition is a Python expression evaluated against the script's global variables (e.g. <code>counter &gt; 100</code>). In C/Arduino the condition is not evaluated (unconditional stop).</li>
      <li>A variable whose value <strong>changes</strong> during debugging turns <strong>red</strong> in the Variables panel until the next start.</li>
    </ul>
    <p class="note">Step-by-step covers simple <strong>global</strong> variables (C/Arduino via DWARF info, instrumented MicroPython). Directly loaded artifacts have no debug info: pause and slow-motion remain available, but not stepping.</p>

    <h2 id="serial">Serial monitor</h2>
    <ul>
      <li><strong>Output</strong>: USART (Uno), USB-CDC and UART0 (Pico), in real time.</li>
      <li><strong>Input</strong>: input field + <kbd>Enter</kbd> (or the Send button). On the Pico, the input feeds the USB-CDC (MicroPython REPL) and UART0.</li>
    </ul>

    <h2 id="svg">SVG export</h2>
    <p><strong>⬇ SVG</strong> button: the full diagram (parts with their rotations, colored wires with their rounded corners) is exported as a standalone SVG file, usable in a document, a website or a printout.</p>

    <h2 id="parts">Custom parts</h2>
    <p><strong>"+ Create a part"</strong> button at the bottom of the palette: name, simulation model (LED, button, resistor, buzzer, digital/analog source, decorative), SVG drawing with live preview, connection points clicked on the preview, then role mapping. The part (★) is persisted across sessions. From the palette: click = place, double-click = edit, ⇩ = export to <code>.json</code>, ✕ = delete, <strong>⇪ Import (.json)</strong> = load a shared part. The <code>.kablix-part.json</code> format is documented in the online help.</p>

    <h3 id="parts-ai">Creating a part with an AI</h3>
    <p>An AI (ChatGPT, Claude, Gemini…) can produce a complete part — SVG drawing <em>and</em> pins — directly in the importable format. Steps:</p>
    <ol class="steps">
      <li>Copy the <strong>prompt</strong> below into the AI and describe the part you want in place of the bracketed text.</li>
      <li>Take the returned JSON block and save it to a <code>my-part.kablix-part.json</code> (or <code>.json</code>) file.</li>
      <li>In the Kablix palette: <strong>⇪ Import (.json)</strong>, pick the file. The part (★) appears, ready to place.</li>
      <li>If needed, <strong>double-click</strong> the part in the palette to fine-tune the connection points on the preview.</li>
    </ol>
    <p class="note">⚠ Space the pins by a <strong>multiple of 10 px</strong> (the grid step = the real 0.1″ spacing between legs): they then land exactly on the grid and on the breadboard holes.</p>
    <p>Format fields: <code>label</code> (displayed name, required), <code>svg</code> (drawing, required), <code>pins</code> (list of <code>{ name, x, y }</code>, required), <code>kind</code> (simulation model), <code>pinRoles</code> (role → pin). Available <code>kind</code> models: <code>led</code> (roles A/C), <code>pushbutton</code> (1.l/2.l), <code>resistor</code> (1/2), <code>buzzer</code> (1/2), <code>digital-source</code> (OUT), <code>analog-source</code> (AO), <code>servo</code>, <code>ultrasonic</code> (TRIG/ECHO — HC-SR04), <code>i2c-lcd</code> (HD44780 display), <code>i2c-pwm</code> (PCA9685), <code>passive</code> (decorative).</p>
    <p>Prompt to copy:</p>
    <pre>You are an assistant that creates an electronic part for the Kablix simulator.
Reply ONLY with a valid JSON object (.kablix-part.json format), with no surrounding text.

Wanted part: [DESCRIBE HERE: e.g. "TMP36 temperature sensor, TO-92 package, 3 pins VCC / OUT / GND"].

Constraints:
- "svg": a self-contained, readable SVG drawing with a viewBox attribute and realistic dimensions.
  The origin is the top-left corner (0,0). Draw the legs/pins on the drawing.
- "pins": one { "name", "x", "y" } entry per pin, at the EXACT coordinates (in the SVG frame)
  of the connection point. SPACE the pins by a multiple of 10 (grid step = 0.1").
- "kind": pick the closest simulation model among
  led | pushbutton | resistor | buzzer | digital-source | analog-source | passive.
- "pinRoles": map each model role to a pin name (e.g. { "AO": "OUT" } for analog-source).
- "label": short name shown in the palette; "type": lowercase identifier without spaces.

Response schema:
{
  "type": "tmp36",
  "label": "TMP36",
  "kind": "analog-source",
  "svg": "&lt;svg viewBox='0 0 60 80' ...&gt;...&lt;/svg&gt;",
  "pins": [
    { "name": "VCC", "x": 10, "y": 70 },
    { "name": "OUT", "x": 30, "y": 70 },
    { "name": "GND", "x": 50, "y": 70 }
  ],
  "pinRoles": { "AO": "OUT" }
}</pre>

    <h2 id="updates">Library updates</h2>
    <p>Kablix bundles <code>avr8js</code>, <code>rp2040js</code> and <code>@wokwi/elements</code>, and stays <strong>offline by default</strong>.</p>
    <ul>
      <li><strong>Manual check</strong>: command palette → <strong>"Kablix: Check for library updates"</strong>.</li>
      <li><strong>At startup</strong> (optional): the <code>kablix.checkUpdatesOnStartup</code> setting; a notification only appears if an update exists.</li>
    </ul>
    <p class="note">Updating these libraries may break the extension (API changes). If a problem occurs, open an issue on the GitHub repository.</p>

    <h2 id="walk-arduino">Walkthrough — Arduino</h2>
    <p>Start from a sketch written and edited in the Arduino editing extension <strong>"Arduino-VsCode-IDE"</strong>, then run it in Kablix.</p>
    <ol class="steps">
      <li><strong>Write the sketch</strong> in "Arduino-VsCode-IDE": open or create your <code>.ino</code> (or <code>.c</code>/<code>.cpp</code>) file and select the <em>Arduino Uno</em> board.</li>
      <li><strong>Prepare the circuit in Kablix</strong>: open the simulator (Kablix icon), choose the <em>Arduino Uno</em> board, drop parts from the palette and wire them (e.g. an LED + resistor on D13, a button on an input).</li>
      <li><strong>Compile &amp; run</strong>: with the <code>.ino</code> file as the active editor (see the 📄 chip), click <strong>▶ Start</strong> (local compilation via <code>arduino-cli</code> if the source changed). Alternative: if "Arduino-VsCode-IDE" already produced a <code>.hex</code>, enable the <code>kablix.showLoadBinaryButton</code> setting then use <strong>↑ Load binary</strong> to pick up the latest artifact. If <code>arduino-cli</code> is installed but not found, set the <code>kablix.arduinoCliPath</code> setting.</li>
      <li><strong>Observe</strong>: the LED(s) light up according to the program; open the <strong>serial monitor</strong> (bottom) to see the <code>Serial.print()</code> output, and send it data if needed.</li>
      <li><strong>Debug step by step</strong>: set a <strong>breakpoint</strong> in the editor gutter, or use <strong>⏸ Pause</strong> then <strong>⏭ Step</strong> to advance line by line and read the global variables in the <em>Variables</em> panel.</li>
    </ol>

    <h2 id="walk-pico">Walkthrough — Raspberry Pi Pico (MicroPython)</h2>
    <p>Start from a <code>.py</code> script edited with the official <strong>"Raspberry Pi Pico"</strong> extension, then run it in Kablix.</p>
    <ol class="steps">
      <li><strong>Write the script</strong> <code>.py</code> in the "Raspberry Pi Pico" extension (editing, MicroPython project structure).</li>
      <li><strong>MicroPython firmware</strong>: on the first run of a <code>.py</code>, if no firmware is found, Kablix offers to <strong>download it automatically</strong> (Pico / Pico W choice); it is then remembered and reused across all your projects. You can also provide your own: place an official <code>.uf2</code> (<a href="https://micropython.org/download/RPI_PICO/">micropython.org/download/RPI_PICO</a>) in the workspace, or set its path in the <code>kablix.micropythonUf2</code> setting.</li>
      <li><strong>Prepare the circuit in Kablix</strong>: open the simulator, choose the <em>Raspberry Pi Pico</em> board, drop and wire your parts (e.g. an LED on GP25/GP15).</li>
      <li><strong>Compile &amp; run</strong>: with the <code>.py</code> file active (see the 📄 chip), click <strong>▶ Start</strong>. The firmware boots then the script is injected via the raw REPL.</li>
      <li><strong>Observe</strong>: the <code>print()</code> output appears in the <strong>serial monitor</strong>; when the script ends, the interactive REPL stays available via the send field.</li>
      <li><strong>Debug step by step</strong>: <strong>⏸ Pause</strong> / <strong>⏭ Step</strong> and breakpoints work on global variables (script instrumented automatically); the pause takes effect on the next line.</li>
    </ol>
    <p class="note">⚠ <strong>Fully offline operation</strong>: so that a machine without Internet access never has to download the firmware, <strong>place the MicroPython <code>.uf2</code> directly in the project folder</strong> (it will be versioned with the project and distributed to students). Kablix looks for the firmware <strong>first in the workspace</strong>, then in the downloaded/remembered firmware, and only offers the download as a last resort. A project that bundles its firmware is therefore reproducible and self-contained.</p>
    <h3>Pico W Wi-Fi (network bridge)</h3>
    <p>The Pico W Wi-Fi chip is not emulated, but Kablix provides a <strong>real network bridge</strong>: when the selected board is <em>Raspberry Pi Pico W</em>, the MicroPython <code>network</code> and <code>urequests</code> (alias <code>requests</code>) modules are automatically replaced by versions that route real HTTP requests through the <strong>VS Code host</strong>. In practice: <code>network.WLAN</code> "connects" instantly (fake IP <code>192.168.1.50</code>), and <code>urequests.get/post(...)</code> performs a <strong>real</strong> request from the machine, then returns the response (<code>status_code</code>, <code>text</code>, <code>json()</code>) to the script.</p>
    <pre>import network, urequests
wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect("my-ssid", "my-pwd")
print(wlan.isconnected())          # True (simulated connection)
r = urequests.get("https://api.example.com/data")
print(r.status_code, r.json())     # real response via the host
r.close()</pre>
    <p class="note">The bridge is <strong>on by default</strong> and only acts for the Pico W board. Disable it with the <code>kablix.picowNetworkBridge</code> setting to block all outbound requests. Limits: HTTP(S) only (no raw sockets), response body capped (the serial tunnel is slow), 15 s timeout per request.</p>

    <h2 id="online">Online help</h2>
    <p>The full, up-to-date documentation is online:</p>
    <div class="online">
      <a href="${DOC_URL_EN}">📖 User guide (docs/USAGE.en.md)</a>
      <a href="${REPO_URL}">⭐ Kablix GitHub repository</a>
    </div>
    <p class="top"><a href="#start">↑ Back to top</a></p>
  </div>`;
}
