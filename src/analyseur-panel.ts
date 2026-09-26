import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';

// Onglet « Analyseur logique » : la VUE de l'instrument, dans un onglet à part.
//
// POURQUOI L'HÔTE SERT DE RELAIS. Deux webviews ne se parlent pas directement :
// l'atelier (le schéma, la simulation) et l'onglet de l'analyseur sont deux
// pages isolées. L'extension est leur seul point commun, donc c'est elle qui
// transporte les voies déclarées et les salves de fronts de l'une à l'autre.
// L'atelier reste maître de la simulation : l'onglet ne fait que recevoir.
//
// UN ONGLET PAR ATELIER. La clé est l'URI du .projix (ou une clé d'atelier sans
// nom pour un projet jamais enregistré) : deux projets ouverts côte à côte ont
// chacun son analyseur, sinon les voies de l'un écraseraient celles de l'autre.

/**
 * Plafond de la file d'attente d'un onglet pas encore prêt.
 *
 * À 60 images de simulation par seconde, c'est un peu plus de trois secondes de
 * salves — largement le temps qu'une webview se charge, mais pas l'infini si
 * elle ne se charge jamais.
 */
export const ATTENTE_MAX = 200;

/**
 * Range un message dans la file d'un onglet pas encore prêt, en évinçant si
 * besoin. **N'ÉVINCE QUE DES SALVES DE FRONTS.**
 *
 * LE DÉFAUT DU 19/09. La file jetait le plus ancien message quel qu'il soit. Or
 * les premiers arrivés sont `voies`, `depart` et `restaure` — les seuls qui ne
 * se rattrapent pas. Sans `voies`, la page ignore à quelle piste rattacher une
 * broche, et `capture.verser()` jette TOUTES les salves suivantes en silence :
 * l'onglet reste vide pour toujours, sans la moindre erreur. Perdre de vieux
 * fronts ne coûte que le début de la mesure ; perdre `voies` coûte tout.
 *
 * Fonction PURE et exportée pour être éprouvée hors de VS Code (le module
 * importe `vscode`, qui n'existe pas dans un banc Node).
 */
export function rangerEnAttente<T extends { type: string }>(file: T[], msg: T): T[] {
  if (file.length >= ATTENTE_MAX) {
    const i = file.findIndex((m) => m.type === 'fronts');
    if (i >= 0) file.splice(i, 1);
    else file.shift();
  }
  file.push(msg);
  return file;
}

/** Message que l'onglet envoie à l'hôte. */
export type AnalyseurVersHote =
  /** La page est prête : l'hôte lui renvoie l'état courant. */
  | { type: 'analyseurPret' }
  /** Réglages changés (déclenchement, décodage) : à enregistrer dans le .projix. */
  | {
      type: 'analyseurReglages';
      declenchement: unknown;
      /** Décodages actifs : plusieurs bus peuvent être décodés de front. */
      decodages: unknown[];
      /** Réglages d'affichage et de seuils, par indice de voie. */
      voiesReglages: Record<string, unknown>;
      /** Fréquence d'échantillonnage simulée, en hertz ; 0 = illimitée. */
      echantillonnage: number;
    }
  /**
   * L'utilisateur demande l'export de la mesure en CSV.
   *
   * Le message ne PORTE PAS de données : la mesure n'est pas dans la page, elle
   * est dans le journal de session écrit au fil de l'eau côté hôte
   * (`analyseur-journal.ts`), déjà au format CSV. La page, elle, rabote sa
   * capture (FRONTS_MAX_PAR_VOIE) pour rester fluide : elle exporterait une
   * mesure amputée de son début.
   */
  | { type: 'analyseurExport' };

/** Ce que l'atelier veut faire parvenir à l'onglet. */
export type HoteVersAnalyseur =
  | { type: 'voies'; voies: unknown[] }
  | { type: 'fronts'; salves: Record<string, number[]> }
  | { type: 'depart' }
  | { type: 'arret' }
  | { type: 'restaure'; etat: unknown }
  /** L'onglet vient de repasser au premier plan : qu'il repeigne. */
  | { type: 'repeindre' };

/** Ce dont l'onglet a besoin quand il s'ouvre (ou se recharge). */
export interface EtatAnalyseur {
  voies: unknown[];
  /**
   * Dernière capture connue : celle du journal de session, à défaut celle d'un
   * ancien .projix. Porte aussi les réglages de l'instrument.
   */
  capture: unknown | null;
  /**
   * Vrai si une simulation tourne. Au PREMIER lancement, l'atelier annonce le
   * départ avant d'ouvrir l'onglet : ce `depart` ne trouvait personne et se
   * perdait. L'onglet se croyait arrêté tout le run, et changer son
   * déclenchement cherchait dans une capture figée — la courbe disparaissait
   * jusqu'au lancement suivant (Frank, 24/09).
   */
  enCours?: boolean;
}

/** Nonce CSP : aléa cryptographique. */
function nonce(): string {
  return randomBytes(24).toString('base64');
}

export class AnalyseurPanel {
  public static readonly viewType = 'kablix.analyseur';
  /** Un onglet par atelier, indexé par sa clé. */
  private static readonly ouverts = new Map<string, AnalyseurPanel>();
  /**
   * Qui veut savoir qu'un onglet s'ouvre ou se ferme : l'atelier, qui montre
   * alors (ou cache) son bouton de réouverture. Un simple ensemble et pas un
   * `vscode.EventEmitter` : les bancs chargent ce module sur un `vscode` de
   * carton, et un champ statique qui l'exige casserait leur import.
   */
  private static readonly auditeurs = new Set<(cle: string) => void>();

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  /** Vrai dès que la page a signalé qu'elle était prête à recevoir. */
  private prete = false;
  /** Messages accumulés avant que la page soit prête (ouverture pendant un run). */
  private enAttente: HoteVersAnalyseur[] = [];

  /**
   * Ouvre (ou révèle) l'onglet de l'analyseur d'un atelier. `fournirEtat` est
   * rappelé quand la page est prête : c'est l'atelier qui sait quelles sondes
   * sont posées et quelle capture il détient.
   */
  public static ouvrir(
    extensionUri: vscode.Uri,
    cle: string,
    titre: string,
    fournirEtat: () => EtatAnalyseur,
    surReglages: (m: AnalyseurVersHote) => void
  ): AnalyseurPanel {
    const existant = AnalyseurPanel.ouverts.get(cle);
    if (existant) {
      existant.panel.reveal(undefined, true);
      // La page vit déjà : on lui repousse ses voies, au cas où des sondes
      // auraient été posées pendant que l'onglet était caché. Rien de plus : elle
      // tient sa capture, et un `depart` ou un `restaure` la lui ferait refaire.
      existant.envoyer({ type: 'voies', voies: fournirEtat().voies });
      return existant;
    }
    const panel = vscode.window.createWebviewPanel(
      AnalyseurPanel.viewType,
      titre,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        localResourceRoots: [extensionUri],
        // La capture vit dans la page : la perdre en changeant d'onglet serait
        // perdre la mesure. `retainContext` est fait pour ça.
        retainContextWhenHidden: true,
      }
    );
    return AnalyseurPanel.brancher(panel, extensionUri, cle, fournirEtat, surReglages);
  }

  /**
   * Met un panneau en service : page, abonnements, registre. Partagé entre
   * l'ouverture normale et la REPRISE d'un onglet que VS Code a restauré au
   * démarrage — les deux doivent produire exactement le même onglet vivant.
   */
  private static brancher(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    cle: string,
    fournirEtat: () => EtatAnalyseur,
    surReglages: (m: AnalyseurVersHote) => void
  ): AnalyseurPanel {
    const vue = new AnalyseurPanel(panel, cle);
    AnalyseurPanel.ouverts.set(cle, vue);
    AnalyseurPanel.signaler(cle);
    // La clé est écrite DANS la page, qui la confiera à VS Code (setState) :
    // c'est elle qu'il nous rendra au prochain démarrage, et sans elle on ne
    // saurait pas à quel projet rattacher le panneau qu'il nous tend.
    panel.webview.html = AnalyseurPanel.html(panel.webview, extensionUri, cle);
    panel.webview.onDidReceiveMessage(
      (m: AnalyseurVersHote) => {
        if (m?.type === 'analyseurPret') {
          // La page peut se dire prête PLUSIEURS FOIS : VS Code la recharge
          // quand on déplace l'onglet vers une autre fenêtre (un second écran).
          // Elle repart alors vide, et ce qu'on lui a posté pendant le
          // rechargement s'est perdu. On lui rend donc l'état COMPLET du moment,
          // capture comprise (le journal de session la tient) — et la file
          // d'attente est jetée : tout ce qu'elle portait y est déjà. La rejouer
          // en plus verserait deux fois les mêmes fronts, et un `depart` en file
          // effacerait la capture qu'on vient de rendre.
          vue.prete = true;
          vue.enAttente = [];
          vue.pousserEtat(fournirEtat());
          return;
        }
        surReglages(m);
      },
      undefined,
      vue.disposables
    );
    return vue;
  }

  /**
   * REPRISE DES ONGLETS APRÈS UN REDÉMARRAGE DE VS CODE.
   *
   * VS Code réaffiche au démarrage les onglets de webview qui étaient ouverts,
   * mais il ne les rend à l'extension que si celle-ci a posé un sérialiseur sur
   * leur `viewType`. Sans lui, l'onglet revient à l'écran en cadavre : absent du
   * registre, donc `this.analyseur()` rend `undefined` côté panel.ts et plus un
   * seul message ne l'atteint — ni les voies, ni le départ, ni les fronts. La
   * page reste vide, sans même un nom de voie, pendant que le journal CSV, lui,
   * se remplit normalement (il ne passe pas par l'onglet). C'était la « page
   * grise » de Frank.
   *
   * L'onglet ne porte PAS sa capture : une mesure appartient à une simulation,
   * pas à une fenêtre. Il revient vide et se remplira au prochain lancement.
   */
  public static enregistrerRestauration(
    extensionUri: vscode.Uri,
    reprendre: (
      cle: string
    ) => { fournirEtat: () => EtatAnalyseur; surReglages: (m: AnalyseurVersHote) => void } | undefined
  ): vscode.Disposable {
    return vscode.window.registerWebviewPanelSerializer(AnalyseurPanel.viewType, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel, etatRange: unknown): Promise<void> {
        const cle = (etatRange as { cle?: string } | undefined)?.cle;
        // Sans clé, on ne sait pas à quel atelier rendre l'onglet : plutôt que de
        // laisser une page morte à l'écran, on la ferme.
        if (!cle) { panel.dispose(); return; }
        // Un onglet déjà rangé sous cette clé (l'atelier a redémarré plus vite
        // que la restauration) : le nôtre ferait doublon.
        if (AnalyseurPanel.ouverts.has(cle)) { panel.dispose(); return; }
        const repris = reprendre(cle);
        if (!repris) { panel.dispose(); return; }
        panel.webview.options = { enableScripts: true, localResourceRoots: [extensionUri] };
        AnalyseurPanel.brancher(panel, extensionUri, cle, repris.fournirEtat, repris.surReglages);
      },
    });
  }

  /** Onglet d'un atelier s'il est ouvert, sinon undefined. */
  public static pour(cle: string): AnalyseurPanel | undefined {
    return AnalyseurPanel.ouverts.get(cle);
  }

  /** Abonne `f` aux ouvertures et fermetures d'onglet ; il reçoit la clé. */
  public static surChangement(f: (cle: string) => void): vscode.Disposable {
    AnalyseurPanel.auditeurs.add(f);
    return { dispose: () => { AnalyseurPanel.auditeurs.delete(f); } };
  }

  private static signaler(cle: string): void {
    for (const f of AnalyseurPanel.auditeurs) f(cle);
  }

  private constructor(panel: vscode.WebviewPanel, private cle: string) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.onDispose(), null, this.disposables);
    // RETOUR AU PREMIER PLAN. L'onglet naît DERRIÈRE l'atelier (`preserveFocus`)
    // et sa page est alors large de zéro pixel : le rendu a bien lieu mais sort
    // sur son garde de largeur nulle, et le canvas reste vierge. Quand l'élève
    // clique enfin sur l'onglet, la page reprend sa largeur sans qu'aucun
    // `resize` de fenêtre ni aucun `visibilitychange` ne soit émis dans la
    // webview — `document.hidden` n'a jamais été vrai.
    //
    // La page a bien un `ResizeObserver` sur son canvas, mais un observateur de
    // taille n'est servi qu'avec une image : il rattrape le cas dès que le
    // navigateur en donne une, pas de façon certaine. C'est l'HÔTE qui sait,
    // lui, que l'onglet vient de passer devant. Un message de plus ne coûte
    // rien, une page grise coûte la mesure.
    this.panel.onDidChangeViewState(
      (e) => {
        if (e.webviewPanel.visible) this.envoyer({ type: 'repeindre' });
      },
      null,
      this.disposables
    );
  }

  /**
   * Le projet a changé de nom (« enregistrer sous », premier enregistrement
   * d'un projet sans nom) : l'onglet suit. Le TITRE ne suffit pas — la clé de
   * rangement est l'URI du .projix, et sans ce réétiquetage l'atelier ne
   * retrouverait plus son propre onglet sous la nouvelle clé : il en ouvrirait
   * un second et le premier resterait là, muet.
   */
  public static suivreProjet(ancienneCle: string, nouvelleCle: string, titre: string): void {
    const vue = AnalyseurPanel.ouverts.get(ancienneCle);
    if (!vue) return;
    vue.panel.title = titre;
    if (nouvelleCle === ancienneCle) return;
    AnalyseurPanel.ouverts.delete(ancienneCle);
    // Un onglet déjà rangé sous la nouvelle clé serait celui d'un AUTRE atelier
    // ayant ce projet ouvert : on ne l'écrase pas, on laisse le nôtre se fermer
    // sur sa clé d'origine.
    if (!AnalyseurPanel.ouverts.has(nouvelleCle)) {
      vue.cle = nouvelleCle;
      AnalyseurPanel.ouverts.set(nouvelleCle, vue);
    }
    AnalyseurPanel.signaler(nouvelleCle);
  }

  /**
   * Envoie un message à la page. Avant qu'elle soit prête les messages sont mis
   * de côté. Depuis v2026.9.5.149, la page prête reçoit l'état complet du moment
   * (capture du journal comprise) et la file est jetée : elle ne sert plus qu'à
   * ne rien poster dans une page qui ne sait pas encore écouter.
   */
  public envoyer(msg: HoteVersAnalyseur): void {
    if (!this.prete) {
      // File bornée (si la page ne se charge jamais, la mémoire ne doit pas
      // gonfler), mais l'éviction ne touche QUE des salves : cf. rangerEnAttente.
      rangerEnAttente(this.enAttente, msg);
      return;
    }
    void this.panel.webview.postMessage(msg);
  }

  /**
   * L'atelier a fini par arriver derrière un onglet restauré : il lui repousse
   * son état. Sans cela l'onglet resterait sur le vide reçu au démarrage, quand
   * aucun atelier n'existait encore pour le renseigner.
   */
  public reprendreEtat(etat: EtatAnalyseur): void {
    this.pousserEtat(etat);
  }

  /**
   * Déclare les voies, annonce le run en cours s'il y en a un (`depart` : la
   * page qui vient de naître ne l'a pas reçu), puis restaure la capture.
   * Dans CET ordre : `depart` vide la capture de la page, il effaçait celle
   * qu'on venait de lui rendre.
   */
  private pousserEtat(etat: EtatAnalyseur, depart = true): void {
    this.envoyer({ type: 'voies', voies: etat.voies });
    if (depart && etat.enCours) this.envoyer({ type: 'depart' });
    if (etat.capture) this.envoyer({ type: 'restaure', etat: etat.capture });
  }

  private onDispose(): void {
    AnalyseurPanel.ouverts.delete(this.cle);
    while (this.disposables.length) this.disposables.pop()?.dispose();
    AnalyseurPanel.signaler(this.cle);
  }

  /** Page de l'onglet : barre d'outils, légende, canvas. Rien d'autre. */
  private static html(webview: vscode.Webview, extensionUri: vscode.Uri, cle: string): string {
    const script = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'analyseur.js')
    );
    const n = nonce();
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${n}'`,
      `font-src ${webview.cspSource}`,
    ].join('; ');
    const l = vscode.l10n;
    return `<!DOCTYPE html>
<html lang="${vscode.env.language}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>${l.t('Logic analyzer')}</title>
<style>
  body {
    margin: 0; padding: 0;
    /* Les panneaux flottants s'ancrent en absolu sur le corps de la page : ils
       suivent le bouton dessiné qui les ouvre, où qu'il soit dans le canvas. */
    position: relative;
    font: var(--vscode-font-weight) var(--vscode-font-size) var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
  }
  .barre {
    display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35));
  }
  .barre label { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .barre select, .barre button {
    font: inherit; color: var(--vscode-foreground);
    background: var(--vscode-dropdown-background, transparent);
    border: 1px solid var(--vscode-dropdown-border, rgba(128,128,128,.4));
    border-radius: 3px; padding: 1px 4px;
  }
  .barre button { cursor: pointer; }
  .barre button:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,.2)); }
  #etat { opacity: .7; margin-left: auto; }
  /* Panneau flottant : réglages d'une voie, choix d'un front, choix d'un
     protocole. Il s'ouvre SOUS le bouton dessiné qui l'appelle — les boutons
     vivent dans le canvas, un panneau ancré à la barre du haut aurait obligé à
     faire l'aller-retour des yeux entre la voie et son réglage. */
  .flottant {
    position: absolute; z-index: 20;
    display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px;
    max-width: 460px; padding: 6px 8px;
    border: 1px solid var(--vscode-dropdown-border, rgba(128,128,128,.55));
    border-radius: 4px;
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    box-shadow: 0 2px 8px rgba(0,0,0,.35);
  }
  .flottant label { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .flottant input, .flottant select, .flottant button {
    font: inherit; color: var(--vscode-foreground);
    background: var(--vscode-input-background, transparent);
    border: 1px solid var(--vscode-dropdown-border, rgba(128,128,128,.4));
    border-radius: 3px; padding: 1px 4px;
  }
  .flottant button { cursor: pointer; }
  .flottant input[type=checkbox] { padding: 0; }
  /* Choix d'un front ou d'un protocole : une colonne d'entrées, pas une
     rangée — on choisit dans une liste, on ne règle pas plusieurs champs. */
  .flottant--liste { flex-direction: column; align-items: stretch; gap: 2px; max-width: 240px; }
  .flottant--liste button {
    display: flex; align-items: center; gap: 8px;
    text-align: left; border: none; background: none; padding: 3px 6px;
  }
  .flottant--liste button:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,.2)); }
  .flottant--liste button[aria-pressed=true] { outline: 1px solid var(--vscode-focusBorder, #07f); }
  .flottant--liste svg { flex: none; }
  #trace { display: block; width: 100%; }
  .aide { padding: 4px 10px 8px; opacity: .6; }
</style>
</head>
<body>
<div class="barre">
  <!-- Ni déclenchement ni décodage ici : ils sont passés SUR LA VOIE, boutons
       « T » et « P » sous son nom (demande de Frank, 19/09). Une barre unique
       obligeait à désigner la voie avant de pouvoir régler quoi que ce soit, et
       ne montrait jamais d'un coup d'œil laquelle déclenchait. -->
  <label title="${l.t('Sampling rate of the analyzer: edges closer together than one sample are merged, exactly as on a real instrument. Unlimited shows every edge the simulation produced.')}">${l.t('Sampling')}
    <select id="horloge">
      <option value="0">${l.t('Unlimited')}</option>
      <option value="1000000000">1 GHz</option>
      <option value="100000000">100 MHz</option>
      <option value="24000000">24 MHz</option>
      <option value="10000000">10 MHz</option>
      <option value="1000000">1 MHz</option>
      <option value="100000">100 kHz</option>
      <option value="10000">10 kHz</option>
      <option value="1000">1 kHz</option>
    </select>
  </label>
  <!-- Flèches : reculer ou avancer d'une demi-fenêtre sans toucher au zoom
       (Frank, 23/09). Les touches ← → du clavier font la même chose. -->
  <!-- ⏮ ⏭ : début de la trame décodée précédente ou suivante au bord gauche,
       zoom inchangé (Frank, 25/09), en sautant les trames identiques
       (Frank, 26/09). Grisés tant qu'aucune voie n'est décodée. -->
  <button id="trame-prec" type="button" disabled title="${l.t('Bring the start of the previous decoded frame whose content changes to the left edge. Repeated identical frames are skipped. Needs a decoding on a channel.')}">⏮</button>
  <button id="gauche" type="button" title="${l.t('Move back in time by half a window. The Left arrow key does the same.')}">◀</button>
  <button id="droite" type="button" title="${l.t('Move forward in time by half a window. The Right arrow key does the same.')}">▶</button>
  <button id="trame-suiv" type="button" disabled title="${l.t('Bring the start of the next decoded frame whose content changes to the left edge. Repeated identical frames are skipped. Needs a decoding on a channel.')}">⏭</button>
  <!-- Deux boutons nommés en clair : « Fit » et « Follow » ne disaient pas ce
       qu'ils font une fois dans un analyseur (retour Frank, .91). -->
  <button id="tout" type="button" title="${l.t('Zoom out until the whole capture, from the start to the last edge, fits the window.')}">${l.t('Whole capture')}</button>
  <button id="suivre" type="button" title="${l.t('Keep the window on the last captured edges: the view scrolls by itself while the simulation runs. Zooming with the wheel turns it off.')}">${l.t('Follow live')}</button>
  <!-- L'export lit le journal de session côté hôte : la page ne fait que le
       demander, elle ne détient pas la mesure entière. -->
  <button id="exporter" type="button" title="${l.t('Save every edge measured since the simulation started to a CSV file: time in milliseconds, channel, pin, name and level. Sampling does not apply: the file holds the raw edges.')}">${l.t('Export CSV')}</button>
  <!-- Voies masquées : leur menu vit sur la piste, qui a disparu avec elles.
       Ce bouton est le chemin du retour (Frank, 23/09) ; la page le montre,
       avec le compte, dès qu'une voie est masquée. -->
  <button id="reafficher" type="button" hidden title="${l.t('Show again every channel hidden from its settings menu.')}"></button>
  <span id="etat"></span>
</div>
<canvas id="trace"></canvas>
<div class="aide">${l.t('Wheel to zoom, drag to pan. Under each channel name: T sets the trigger edge, P picks the bus to decode.')}</div>
<script nonce="${n}">window.KABLIX_LANG = ${JSON.stringify(vscode.env.language)};
/* La clé du projet, que la page confiera à VS Code (setState) : c'est elle
   qu'il nous rendra si l'onglet est restauré au prochain démarrage. Sans elle,
   le panneau reviendrait à l'écran sans savoir à quel atelier se rattacher.
   Elle ne peut pas être posée ici : acquireVsCodeApi() ne s'appelle qu'UNE
   fois par page, et c'est analyseur.js qui le fait. */
window.KABLIX_ANALYSEUR_CLE = ${JSON.stringify(cle)};</script>
<script nonce="${n}" src="${script}"></script>
</body>
</html>`;
  }
}
