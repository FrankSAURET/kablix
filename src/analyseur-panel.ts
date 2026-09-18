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
    };

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
  /** Dernière capture connue, telle qu'enregistrée dans le .projix. */
  capture: unknown | null;
}

/** Nonce CSP : aléa cryptographique. */
function nonce(): string {
  return randomBytes(24).toString('base64');
}

export class AnalyseurPanel {
  public static readonly viewType = 'kablix.analyseur';
  /** Un onglet par atelier, indexé par sa clé. */
  private static readonly ouverts = new Map<string, AnalyseurPanel>();

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
      // La page vit déjà : on lui repousse l'état, au cas où des sondes auraient
      // été posées pendant que l'onglet était caché.
      existant.pousserEtat(fournirEtat());
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
    const vue = new AnalyseurPanel(panel, cle);
    AnalyseurPanel.ouverts.set(cle, vue);
    panel.webview.html = AnalyseurPanel.html(panel.webview, extensionUri);
    panel.webview.onDidReceiveMessage(
      (m: AnalyseurVersHote) => {
        if (m?.type === 'analyseurPret') {
          vue.prete = true;
          vue.pousserEtat(fournirEtat());
          for (const msg of vue.enAttente) panel.webview.postMessage(msg);
          vue.enAttente = [];
          return;
        }
        surReglages(m);
      },
      undefined,
      vue.disposables
    );
    return vue;
  }

  /** Onglet d'un atelier s'il est ouvert, sinon undefined. */
  public static pour(cle: string): AnalyseurPanel | undefined {
    return AnalyseurPanel.ouverts.get(cle);
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
  }

  /**
   * Envoie un message à la page. Avant qu'elle soit prête les messages sont mis
   * de côté : un onglet ouvert au milieu d'un run doit recevoir les salves qui
   * arrivent pendant son chargement, sinon il démarre sur un trou.
   */
  public envoyer(msg: HoteVersAnalyseur): void {
    if (!this.prete) {
      // On ne garde qu'une quantité bornée : si la page ne se charge jamais, il
      // ne faut pas que les salves fassent gonfler la mémoire de l'extension.
      if (this.enAttente.length > 200) this.enAttente.shift();
      this.enAttente.push(msg);
      return;
    }
    void this.panel.webview.postMessage(msg);
  }

  /** Déclare les voies puis restaure la dernière capture. */
  private pousserEtat(etat: EtatAnalyseur): void {
    this.envoyer({ type: 'voies', voies: etat.voies });
    if (etat.capture) this.envoyer({ type: 'restaure', etat: etat.capture });
  }

  private onDispose(): void {
    AnalyseurPanel.ouverts.delete(this.cle);
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }

  /** Page de l'onglet : barre d'outils, légende, canvas. Rien d'autre. */
  private static html(webview: vscode.Webview, extensionUri: vscode.Uri): string {
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
  #decodages { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .deco {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 1px 4px; border-radius: 4px;
    border: 1px solid var(--vscode-dropdown-border, rgba(128,128,128,.4));
  }
  .deco .role { gap: 3px; }
  .deco .oter {
    border: none; background: none; padding: 0 2px;
    opacity: .6; cursor: pointer; font-size: 1.1em; line-height: 1;
  }
  .deco .oter:hover { opacity: 1; background: none; }
  #etat { opacity: .7; margin-left: auto; }
  #legende { display: flex; flex-wrap: wrap; gap: 4px 12px; padding: 5px 10px 0; }
  .chip { display: inline-flex; align-items: center; gap: 5px; opacity: .95; }
  .chip i {
    width: 10px; height: 10px; border-radius: 2px; display: inline-block;
    border: none; padding: 0; cursor: pointer;
  }
  .chip--muet { opacity: .45; text-decoration: line-through; }
  /* Réglages d'une voie : dépliés sous la légende, au clic sur sa pastille. */
  .reglages {
    display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px;
    margin: 4px 10px 0; padding: 5px 8px;
    border: 1px solid var(--vscode-dropdown-border, rgba(128,128,128,.4));
    border-radius: 4px;
  }
  .reglages label { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .reglages input, .reglages select, .reglages button {
    font: inherit; color: var(--vscode-foreground);
    background: var(--vscode-input-background, transparent);
    border: 1px solid var(--vscode-dropdown-border, rgba(128,128,128,.4));
    border-radius: 3px; padding: 1px 4px;
  }
  .reglages input[type=checkbox] { padding: 0; }
  .reglages .teintes { display: inline-flex; gap: 3px; }
  .reglages .teintes button { width: 14px; height: 14px; padding: 0; border-radius: 2px; cursor: pointer; }
  .reglages .teintes button[aria-pressed=true] { outline: 2px solid var(--vscode-focusBorder, #07f); }
  #trace { display: block; width: 100%; }
  .aide { padding: 4px 10px 8px; opacity: .6; }
</style>
</head>
<body>
<div class="barre">
  <label>${l.t('Trigger')}
    <select id="decl-voie"></select>
    <select id="decl-sens">
      <option value="rising">${l.t('rising')}</option>
      <option value="falling">${l.t('falling')}</option>
    </select>
  </label>
  <!-- Plusieurs décodages de front : un montage porte souvent deux bus, et
       devoir choisir lequel regarder empêchait de voir ce qui les relie. -->
  <div id="decodages"></div>
  <button id="ajout-decodage" type="button" title="${l.t('Decode one more bus at the same time: each decoding writes under its own data channel.')}">${l.t('+ Decode')}</button>
  <!-- Deux boutons nommés en clair : « Fit » et « Follow » ne disaient pas ce
       qu'ils font une fois dans un analyseur (retour Frank, .91). -->
  <button id="tout" type="button" title="${l.t('Zoom out until the whole capture, from the start to the last edge, fits the window.')}">${l.t('Whole capture')}</button>
  <button id="suivre" type="button" title="${l.t('Keep the window on the last captured edges: the view scrolls by itself while the simulation runs. Zooming with the wheel turns it off.')}">${l.t('Follow live')}</button>
  <span id="etat"></span>
</div>
<div id="legende"></div>
<canvas id="trace"></canvas>
<div class="aide">${l.t('Wheel to zoom, drag to pan.')}</div>
<script nonce="${n}">window.KABLIX_LANG = ${JSON.stringify(vscode.env.language)};</script>
<script nonce="${n}" src="${script}"></script>
</body>
</html>`;
  }
}
