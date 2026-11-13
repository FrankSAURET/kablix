// Commande « Kablix : Signaler un problème ».
//
// Une fenêtre : zone de description, case « joindre le projet et le
// programme », avertissement de ce qui part, bouton Envoyer. Au clic, tout est
// anonymisé (rapport.ts / anonymiser.ts), zippé, puis posté au script Google
// Apps Script de Frank, qui le lui renvoie par mail, zip en pièce jointe
// (outils/signaler-probleme/). Aucun secret dans le paquet : l'adresse de
// destination ne vit que dans le script.
//
// Après un envoi réussi, le suivi Kablix s'allume pour 24 h (suivi.ts).
import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { hostname, homedir, userInfo, platform, release, arch } from 'node:os';
import { randomBytes } from 'node:crypto';
import { SimulatorPanel } from './panel';
import { preparerSecrets, segmentsNominatifs, type Secret } from './anonymiser';
import { anonymiserProjix, construireRapport, lireJournaux, sessionsAJoindre } from './rapport';
import { allumerSuivi, note } from './suivi';
import { versionPublique } from './version';

const l10n = vscode.l10n;

/**
 * Adresse du script Google Apps Script (déploiement « Application Web »,
 * exécuté en tant que Frank, accessible à tous). Vide = service pas encore
 * branché : la fenêtre propose alors d'enregistrer le rapport.
 */
export const URL_RAPPORT = 'https://script.google.com/macros/s/AKfycbyAbnar7IJxjrnezrSWeTrb6yi_7a7hQl7txiLi2wd82RVMe6HLy48SpDVutrYpeHwu/exec';

/** Taille au-delà de laquelle le script refuse (pièce jointe Gmail : 25 Mo). */
const MAX_RAPPORT = 18 * 1024 * 1024;

/** Nom git de l'utilisateur, s'il y en a un (`git config user.name`). */
function gitConfig(cle: string): Promise<string> {
  return new Promise((resolve) => {
    execFile('git', ['config', '--global', cle], { timeout: 3000, windowsHide: true }, (err, out) =>
      resolve(err ? '' : String(out).trim())
    );
  });
}

/** Tout ce qui, sur ce poste, désigne une personne, une machine ou un lieu. */
async function collecterSecrets(): Promise<Secret[]> {
  const s: Secret[] = [];
  const ajouter = (valeur: string | undefined, marqueur: string): void => {
    if (valeur) s.push({ valeur, marqueur });
  };
  try {
    ajouter(userInfo().username, '<utilisateur>');
  } catch {
    /* compte sans entrée locale */
  }
  ajouter(process.env.USERNAME, '<utilisateur>');
  ajouter(process.env.USER, '<utilisateur>');
  for (const seg of segmentsNominatifs(homedir())) ajouter(seg, '<utilisateur>');
  ajouter(hostname(), '<machine>');
  ajouter(process.env.COMPUTERNAME, '<machine>');
  ajouter(process.env.LOGONSERVER?.replace(/^\\+/, ''), '<machine>');
  ajouter(process.env.USERDOMAIN, '<domaine>');
  ajouter(process.env.USERDNSDOMAIN, '<domaine>');
  ajouter(vscode.env.machineId, '<id-machine>');
  ajouter(vscode.env.sessionId, '<id-session>');
  const nomGit = await gitConfig('user.name');
  ajouter(nomGit, '<utilisateur>');
  for (const mot of nomGit.split(/\s+/)) ajouter(mot, '<utilisateur>');
  ajouter(await gitConfig('user.email'), '<mail>');
  // Dossiers du projet ouvert et du programme : leurs noms sont souvent ceux
  // de la personne (« TP Dupont »), on les efface partout.
  const chemins = [
    ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath),
    SimulatorPanel.active()?.getDocumentUri()?.fsPath,
    SimulatorPanel.active()?.getCodeFileUri()?.fsPath,
  ];
  for (const c of chemins) if (c) for (const seg of segmentsNominatifs(c)) ajouter(seg, '<dossier>');
  return preparerSecrets(s);
}

/** Pièces du projet ouvert : .projix enregistré et programme (avec ses
 *  modifications non enregistrées, c'est ce que l'utilisateur voit). */
async function piecesDuProjet(): Promise<{
  projix?: Uint8Array;
  programme?: { extension: string; texte: string };
}> {
  const panel = SimulatorPanel.active();
  const r: { projix?: Uint8Array; programme?: { extension: string; texte: string } } = {};
  const doc = panel?.getDocumentUri();
  if (doc?.scheme === 'file') {
    try {
      r.projix = await vscode.workspace.fs.readFile(doc);
    } catch {
      /* fichier disparu */
    }
  }
  const code = panel?.getCodeFileUri();
  if (code) {
    const ouvert = vscode.workspace.textDocuments.find((d) => d.uri.toString() === code.toString());
    try {
      const texte = ouvert
        ? ouvert.getText()
        : Buffer.from(await vscode.workspace.fs.readFile(code)).toString('utf8');
      r.programme = { extension: /\.[^.\\/]+$/.exec(code.fsPath)?.[0] ?? '.txt', texte };
    } catch {
      /* fichier disparu */
    }
  }
  return r;
}

/** Fiche lisible en tête du zip. */
function fiche(description: string, joindre: boolean, pieces: { projix?: unknown; programme?: unknown }): string {
  const pkg = vscode.extensions.getExtension('electropol-fr.kablix')?.packageJSON ?? {};
  return [
    `Kablix ${versionPublique()} (build ${pkg.buildNumber ?? '?'})`,
    `VS Code ${vscode.version} — ${vscode.env.appName} — langue ${vscode.env.language}`,
    `Système ${platform()} ${release()} ${arch()}`,
    `Date ${new Date().toISOString()}`,
    `Projet joint : ${joindre ? (pieces.projix ? 'oui' : 'aucun .projix enregistré') : 'non'}`,
    `Programme joint : ${joindre ? (pieces.programme ? 'oui' : 'aucun') : 'non'}`,
    '',
    'Description :',
    description,
    '',
  ].join('\n');
}

export class SignalerPanel {
  private static current: SignalerPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  /** Dernier rapport fabriqué (pour « Enregistrer le rapport » après un échec). */
  private dernier: Uint8Array | undefined;

  public static show(context: vscode.ExtensionContext): void {
    if (SignalerPanel.current) {
      SignalerPanel.current.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'kablix.reportProblem',
      l10n.t('Kablix — Report a problem'),
      vscode.ViewColumn.Active,
      { enableScripts: true, localResourceRoots: [] }
    );
    SignalerPanel.current = new SignalerPanel(panel, context);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext
  ) {
    this.panel.webview.html = this.html();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage((m) => void this.recevoir(m), null, this.disposables);
  }

  private dispose(): void {
    SignalerPanel.current = undefined;
    for (const d of this.disposables) d.dispose();
  }

  private etat(texte: string, genre: 'info' | 'ok' | 'erreur', enregistrer = false, envoye = false): void {
    void this.panel.webview.postMessage({ type: 'etat', texte, genre, enregistrer, envoye });
  }

  /** Fabrique le zip anonymisé. */
  private async fabriquer(description: string, joindre: boolean): Promise<Uint8Array> {
    const JSZip = (await import('./zip.js')).JSZip;
    const secrets = await collecterSecrets();
    const pieces = joindre ? await piecesDuProjet() : {};
    const projix = pieces.projix ? await anonymiserProjix(JSZip, pieces.projix, secrets) : undefined;
    return construireRapport(JSZip, {
      fiche: fiche(description, joindre, pieces),
      journaux: lireJournaux(sessionsAJoindre(this.context.logUri.fsPath)),
      projix,
      programme: pieces.programme,
      secrets,
    });
  }

  private async recevoir(m: { type?: string; description?: unknown; joindre?: unknown }): Promise<void> {
    if (m.type === 'enregistrer') return this.enregistrer();
    if (m.type !== 'envoyer' && m.type !== 'apercu') return;
    const description = String(m.description ?? '').trim();
    const joindre = m.joindre === true;
    if (m.type === 'envoyer' && !description) {
      this.etat(l10n.t('Describe the problem first.'), 'erreur');
      return;
    }
    this.etat(l10n.t('Anonymizing the logs…'), 'info');
    try {
      this.dernier = await this.fabriquer(description, joindre);
    } catch (err) {
      note('Rapport : fabrication impossible', err);
      this.etat(l10n.t('Could not build the report: {0}', String(err)), 'erreur');
      return;
    }
    if (m.type === 'apercu') return this.enregistrer();
    if (this.dernier.length > MAX_RAPPORT) {
      this.etat(l10n.t('The report is too large to be sent ({0} MB). Save it and send it another way.', (this.dernier.length / 1048576).toFixed(1)), 'erreur', true);
      return;
    }
    if (!URL_RAPPORT) {
      this.etat(l10n.t('Sending is not available yet in this version. Save the report and send it by mail.'), 'erreur', true);
      return;
    }
    this.etat(l10n.t('Sending…'), 'info');
    try {
      const controle = new AbortController();
      const minuterie = setTimeout(() => controle.abort(), 60000);
      const res = await fetch(URL_RAPPORT, {
        method: 'POST',
        // text/plain : évite la requête de pré-vérification, que Apps Script ne sait pas servir.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          version: versionPublique(),
          reference: randomBytes(4).toString('hex'),
          resume: description.slice(0, 80),
          zip: Buffer.from(this.dernier).toString('base64'),
        }),
        signal: controle.signal,
      });
      clearTimeout(minuterie);
      const reponse = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
      if (!res.ok || !reponse.ok) throw new Error(reponse.erreur ?? `HTTP ${res.status}`);
    } catch (err) {
      note('Rapport : envoi impossible', err);
      this.etat(l10n.t('Sending failed ({0}). Save the report and send it by mail.', err instanceof Error ? err.message : String(err)), 'erreur', true);
      return;
    }
    await allumerSuivi();
    this.etat(l10n.t('Report sent. Thank you! Kablix will keep a detailed log for the next 24 hours.'), 'ok', false, true);
  }

  /** Enregistre le dernier rapport sur le disque (aperçu, ou envoi manuel). */
  private async enregistrer(): Promise<void> {
    if (!this.dernier) return;
    const cible = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(vscode.Uri.file(homedir()), `rapport-kablix-${new Date().toISOString().slice(0, 10)}.zip`),
      filters: { Zip: ['zip'] },
    });
    if (!cible) {
      this.etat('', 'info');
      return;
    }
    await vscode.workspace.fs.writeFile(cible, this.dernier);
    this.etat(l10n.t('Report saved.'), 'ok');
    void vscode.commands.executeCommand('revealFileInOS', cible);
  }

  private html(): string {
    const nonce = randomBytes(16).toString('base64');
    const panel = SimulatorPanel.active();
    const nomProjet = panel?.getDocumentUri()?.scheme === 'file' ? panel.getDocumentUri()!.fsPath.split(/[\\/]/).pop() : undefined;
    const nomCode = panel?.getCodeFileUri()?.fsPath.split(/[\\/]/).pop();
    const esc = (s: string): string =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const pieces = [nomProjet, nomCode].filter(Boolean).map((n) => esc(n!)).join(', ');
    const t = {
      titre: l10n.t('Report a problem'),
      intro: l10n.t('Describe what you were doing, what you expected and what happened instead.'),
      placeholder: l10n.t('Example: I start the simulation, the LED stays off although the program turns it on…'),
      joindre: pieces
        ? l10n.t('Attach the project and the program ({0})', pieces)
        : l10n.t('Attach the project and the program (none open)'),
      avert: l10n.t('What is sent: your description, the VS Code logs of this session and the previous one, and, if the box is ticked, the project (.projix) and the program. Everything is anonymized before leaving: user and computer names, folder names in paths, mail, IP and MAC addresses are replaced. The text of your description and of your program is sent as is — do not write your name in it.'),
      suivi: l10n.t('After sending, Kablix keeps a detailed log of its own actions for 24 hours, to help understand the problem. It stays on this computer and is only sent with another report.'),
      envoyer: l10n.t('Send'),
      apercu: l10n.t('Save a copy…'),
      enregistrer: l10n.t('Save the report…'),
    };
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 1rem 1.5rem; max-width: 46rem; }
  h1 { font-size: 1.4em; font-weight: 600; }
  textarea { width: 100%; box-sizing: border-box; min-height: 10rem; resize: vertical; font: inherit;
    color: var(--vscode-input-foreground); background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent); padding: .5rem; }
  textarea:focus { outline: 1px solid var(--vscode-focusBorder); }
  label { display: flex; gap: .5rem; align-items: center; margin: .8rem 0; }
  .avert { border-left: 3px solid var(--vscode-editorWarning-foreground, #c90); padding: .4rem .8rem; margin: .8rem 0;
    background: var(--vscode-textBlockQuote-background); }
  .note { opacity: .8; font-size: .92em; }
  .boutons { display: flex; gap: .6rem; flex-wrap: wrap; margin-top: 1rem; }
  button { font: inherit; padding: .35rem 1rem; border: none; cursor: pointer;
    color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.second { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  button:disabled { opacity: .5; cursor: default; }
  #etat { margin-top: 1rem; min-height: 1.4em; }
  #etat.erreur { color: var(--vscode-errorForeground); }
  #etat.ok { color: var(--vscode-testing-iconPassed, #3a3); }
</style></head>
<body>
<h1>${esc(t.titre)}</h1>
<p>${esc(t.intro)}</p>
<textarea id="description" placeholder="${esc(t.placeholder)}"></textarea>
<label><input type="checkbox" id="joindre" checked> ${esc(t.joindre)}</label>
<div class="avert">${esc(t.avert)}</div>
<p class="note">${esc(t.suivi)}</p>
<div class="boutons">
  <button id="envoyer">${esc(t.envoyer)}</button>
  <button id="apercu" class="second">${esc(t.apercu)}</button>
  <button id="enregistrer" class="second" hidden>${esc(t.enregistrer)}</button>
</div>
<div id="etat"></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const boutons = ['envoyer', 'apercu', 'enregistrer'].map($);
  const occupe = (oui) => boutons.forEach((b) => (b.disabled = oui));
  const demande = (type) => {
    occupe(true);
    vscode.postMessage({ type, description: $('description').value, joindre: $('joindre').checked });
  };
  $('envoyer').addEventListener('click', () => demande('envoyer'));
  $('apercu').addEventListener('click', () => demande('apercu'));
  $('enregistrer').addEventListener('click', () => { occupe(true); vscode.postMessage({ type: 'enregistrer' }); });
  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type !== 'etat') return;
    $('etat').textContent = m.texte;
    $('etat').className = m.genre;
    $('enregistrer').hidden = !m.enregistrer;
    occupe(m.genre === 'info' && m.texte !== '');
    if (m.envoye) $('envoyer').disabled = true;
  });
  $('description').focus();
</script>
</body></html>`;
  }
}
