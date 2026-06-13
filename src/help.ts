import * as vscode from 'vscode';

// Liens « aide en ligne » : dépôt GitHub et documentation utilisateur.
const REPO_URL = 'https://github.com/FrankSAURET/kablix';
const DOC_URL = 'https://github.com/FrankSAURET/kablix/blob/main/docs/UTILISATION.md';

/**
 * Panneau d'aide local (packagé, donc disponible hors-ligne) en français.
 * Un seul panneau à la fois : un nouvel appel révèle l'existant plutôt que
 * d'en ouvrir un second (même logique que SimulatorPanel).
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
      'Kablix — Aide',
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

  return /* html */ `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kablix — Aide</title>
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
  </style>
</head>
<body>
  <div class="wrap">
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
      <li>la commande <strong>« Kablix : Compiler &amp; exécuter le fichier actif »</strong> (ouvre le simulateur et y charge le fichier en cours d'édition).</li>
    </ul>
    <p>Au premier affichage, la feuille de dessin est vide : posez vos composants depuis la palette, câblez-les, puis cliquez <strong>▶ Démarrer</strong> (démo intégrée : LED&nbsp;D13/GP25 clignotante) ou <strong>⚙ Compiler &amp; exécuter le fichier actif</strong> pour votre propre code.</p>

    <h2 id="interface">Interface</h2>
    <ul>
      <li><strong>Barre d'outils</strong> (haut) : sélecteur de carte, ▶ Démarrer / ■ Arrêter / ⏸ Pause / ⏭ Pas, vitesse 🐇/🐢/🐌, ⚙ Compiler, ↑ Charger workspace, ⬇ SVG, 🏷 Noms.</li>
      <li><strong>Palette</strong> (gauche) : les composants à poser, triés <strong>AZ</strong> ou par <strong>catégories</strong>, avec une zone « Derniers utilisés ».</li>
      <li><strong>Canvas</strong> (centre) : les composants, les fils et leurs poignées.</li>
      <li><strong>Propriétés</strong> / inspecteur (droite) : édite l'élément sélectionné (couleur, valeur, angle, suppression) ; une zone d'aide y rappelle les gestes utiles.</li>
      <li><strong>Moniteur série</strong> (bas) : sortie en temps réel et champ d'envoi.</li>
    </ul>

    <h2 id="montage">Construire un montage</h2>
    <h3>Poser et déplacer</h3>
    <ul>
      <li><strong>Poser</strong> : clic sur un composant de la palette (posé au centre) ou glisser-déposer vers le canvas.</li>
      <li><strong>Déplacer</strong> : glisser le corps du composant, ou <strong>glisser au clic droit</strong> — indispensable pour les composants interactifs (bouton, potentiomètre…) dont le clic gauche actionne le contrôle.</li>
      <li><strong>Tourner</strong> : sélectionner puis <kbd>+</kbd> (45° horaire) ou <kbd>-</kbd> (45° antihoraire).</li>
      <li><strong>Zoomer</strong> : <strong>molette</strong> dans le canvas (centré sur le curseur) ; le badge <code>⟳ %</code> en bas à droite réinitialise la vue d'un clic.</li>
      <li><strong>Supprimer</strong> : ✕ du bandeau, 🗑 de l'inspecteur ou <kbd>Suppr</kbd>.</li>
    </ul>
    <h3>Câbler</h3>
    <ol class="steps">
      <li>Cliquer une <strong>broche</strong> (pastille dorée) : le fil démarre.</li>
      <li>Chaque clic sur le fond pose un <strong>coude</strong> (segments aimantés à l'horizontale/verticale).</li>
      <li>Cliquer une autre broche termine le fil. <kbd>Échap</kbd> annule.</li>
    </ol>
    <p>Un fil touchant une masse naît noir, une alimentation rouge, sinon il suit les couleurs Dupont. La couleur reste modifiable dans l'inspecteur. <strong>Retoucher un fil</strong> : le sélectionner fait apparaître des poignées sur chaque coude ; <kbd>Ctrl</kbd> maintenu pendant le glissement aligne le coude (réticule H/V) ; double-clic sur le fil insère un coude.</p>
    <p>La <strong>platine d'essai</strong> existe en trois tailles (mini / half / full). Au survol pendant un déplacement, les bandes qui recevraient les broches s'allument en jaune ; au relâchement le composant s'enfiche automatiquement, sans fil visible.</p>

    <h2 id="executer">Exécuter du code</h2>
    <p>Bouton <strong>⚙ Compiler &amp; exécuter le fichier actif</strong> ; le traitement dépend de l'extension du fichier :</p>
    <ul>
      <li><code>.ino</code>, <code>.c</code>, <code>.cpp</code> (Uno) : compilation locale (<code>arduino-cli</code> ou <code>avr-gcc</code>) ;</li>
      <li><code>.c</code>, <code>.cpp</code> (Pico) : compilation bare-metal (<code>arm-none-eabi-gcc</code>) ;</li>
      <li><code>.py</code> : MicroPython sur le Pico simulé (firmware <code>.uf2</code> requis) ;</li>
      <li><code>.hex</code> / <code>.uf2</code> / <code>.elf</code> / <code>.bin</code> : chargés directement.</li>
    </ul>
    <p>Bouton <strong>↑ Charger workspace</strong> : détecte et lance le <code>.hex</code> le plus récent (sortie de <code>.vscode/arduino.json</code>, sinon scan) ou le <code>.uf2</code> du dossier <code>build/</code>.</p>

    <h2 id="debogage">Débogage pas à pas</h2>
    <ul>
      <li><strong>⏸ Pause / ▶ Reprendre</strong> : gèle la simulation ; l'état des broches et des LED reste affiché. Le sélecteur 🐇/🐢/🐌 ralentit l'exécution (Uno).</li>
      <li><strong>⏭ Pas</strong> : exécute une ligne du fichier source puis se remet en pause. Le panneau <strong>Variables</strong> (sous le canvas) montre la ligne courante et les variables globales ; la ligne est aussi surlignée dans l'éditeur.</li>
      <li><strong>Points d'arrêt</strong> : cliquer dans la gouttière de l'éditeur ; la simulation se met en pause en atteignant la ligne.</li>
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
      <li><strong>Compiler &amp; exécuter</strong> : le fichier <code>.ino</code> étant l'éditeur actif, cliquez <strong>⚙ Compiler &amp; exécuter le fichier actif</strong> (compilation locale via <code>arduino-cli</code> ou <code>avr-gcc</code>). Variante : si « Arduino-VsCode-IDE » a déjà produit un <code>.hex</code>, utilisez <strong>↑ Charger workspace</strong> pour récupérer l'artefact le plus récent.</li>
      <li><strong>Observer</strong> : la ou les LED s'allument selon le programme ; ouvrez le <strong>moniteur série</strong> (bas) pour voir les <code>Serial.print()</code>, et envoyez-y des données si besoin.</li>
      <li><strong>Déboguer pas à pas</strong> : posez un <strong>point d'arrêt</strong> dans la gouttière de l'éditeur, ou utilisez <strong>⏸ Pause</strong> puis <strong>⏭ Pas</strong> pour avancer ligne par ligne et lire les variables globales dans le panneau <em>Variables</em>.</li>
    </ol>

    <h2 id="pas-a-pas-pico">Pas à pas — Raspberry Pi Pico (MicroPython)</h2>
    <p>Partez d'un script <code>.py</code> édité avec l'extension officielle <strong>« Raspberry Pi Pico »</strong>, puis exécutez-le dans Kablix.</p>
    <ol class="steps">
      <li><strong>Écrire le script</strong> <code>.py</code> dans l'extension « Raspberry Pi Pico » (édition, structure de projet MicroPython).</li>
      <li><strong>Fournir le firmware MicroPython</strong> : récupérez le <code>.uf2</code> officiel (<a href="https://micropython.org/download/RPI_PICO/">micropython.org/download/RPI_PICO</a>) et placez-le dans le workspace, ou renseignez son chemin dans le réglage <code>kablix.micropythonUf2</code>.</li>
      <li><strong>Préparer le montage dans Kablix</strong> : ouvrez le simulateur, choisissez la carte <em>Raspberry Pi Pico</em>, posez et câblez vos composants (par ex. une LED sur GP25/GP15).</li>
      <li><strong>Compiler &amp; exécuter</strong> : le fichier <code>.py</code> étant actif, cliquez <strong>⚙ Compiler &amp; exécuter le fichier actif</strong>. Le firmware démarre puis le script est injecté via le raw REPL.</li>
      <li><strong>Observer</strong> : les <code>print()</code> apparaissent dans le <strong>moniteur série</strong> ; à la fin du script, le REPL interactif reste disponible via le champ d'envoi.</li>
      <li><strong>Déboguer pas à pas</strong> : <strong>⏸ Pause</strong> / <strong>⏭ Pas</strong> et les points d'arrêt fonctionnent sur les variables globales (script instrumenté automatiquement) ; la pause prend effet à la ligne suivante.</li>
    </ol>

    <h2 id="en-ligne">Aide en ligne</h2>
    <p>La documentation complète et à jour est en ligne :</p>
    <div class="online">
      <a href="${DOC_URL}">📖 Guide d'utilisation (docs/UTILISATION.md)</a>
      <a href="${REPO_URL}">⭐ Dépôt GitHub Kablix</a>
    </div>
    <p class="top"><a href="#demarrage">↑ Retour au sommaire</a></p>
  </div>
</body>
</html>`;
}
