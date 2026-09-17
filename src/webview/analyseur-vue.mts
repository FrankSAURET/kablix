// Rendu de l'analyseur logique : les créneaux des voies sur une échelle de
// temps commune, avec zoom, défilement, réticule et annotations de décodage.
//
// CE QUE CE MODULE N'EST PAS. Ce n'est pas le traceur de courbes (plotter.mts) :
// le traceur trace des VALEURS sur un axe Y continu, l'analyseur trace des
// FRONTS — deux niveaux, un axe Y qui n'a pas d'unité. Les conventions sont en
// revanche reprises du traceur pour que les deux instruments se ressemblent :
// palette de voies partagée (voies-couleurs.mts), pas de graduation « rond »
// (1-2-5 × 10ⁿ), réticule suivant la souris, thème clair/sombre lu sur le body.
//
// L'ÉCHELLE DE TEMPS. Toute la vue travaille en MILLISECONDES SIMULÉES, comme
// la capture. À fort zoom on descend sous la microseconde : l'affichage des
// graduations choisit donc son unité (s, ms, µs, ns) d'après le pas.
//
// LE RENDU EST À PAS CONSTANT EN PIXELS. Une voie peut porter 60 000 fronts ;
// dessiner un segment par front à faible zoom coûterait 60 000 opérations pour
// noircir 800 pixels. On regroupe donc les fronts par colonne de pixel : une
// colonne qui contient plusieurs fronts se dessine en BLOC plein (c'est ce que
// fait un analyseur réel — la zone « ça commute plus vite que l'écran »).

import { couleurVoie, themeSombre } from './voies-couleurs.mjs';
import type { AnalyseurCapture } from './analyseur-capture.mjs';
import type { Annotation } from './analyseur-decodage.mjs';

/** Hauteur d'une piste de voie, en pixels CSS. */
const PISTE_H = 46;
/** Hauteur du créneau dans sa piste (le reste est la marge). */
const CRENEAU_H = 22;
/** Bande réservée aux annotations de décodage sous chaque piste. */
const ANNOT_H = 14;
/** Largeur de la colonne des noms de voie. */
const MARGE_G = 104;
/** Marge droite (respiration + place pour la dernière graduation). */
const MARGE_D = 12;
/** Hauteur de la règle de temps, en haut. */
const REGLE_H = 22;

/** Ce qu'une voie non traçable doit expliquer, tel que le modèle le classe. */
export type ProblemeVoie = 'nowhere' | 'not-mcu' | 'power';

/** Une voie telle que la vue la reçoit (capture + diagnostic de câblage). */
export interface VoieVue {
  voie: number;
  nom: string;
  pin: string;
  /** null = la voie est traçable. */
  probleme: ProblemeVoie | null;
  /** Vrai si la broche porte aussi un convertisseur analogique (A0…, GP26…). */
  analogique: boolean;
  /**
   * Vrai si la pince n'est pas posée sur la carte et que la broche a été
   * trouvée en suivant le fil. La légende le dit : sans cela, l'élève qui a
   * pincé la borne d'un module lirait un nom de broche sans comprendre d'où
   * il sort.
   */
  suivi?: boolean;
  /**
   * Nom choisi par l'élève, qui remplace `nom` à l'affichage. Le nom
   * automatique reste dans `nom` : on y revient en vidant celui-ci.
   */
  nomChoisi?: string;
  /**
   * Indice de teinte à prendre dans la palette, quand l'élève a voulu une
   * autre couleur que celle de son indice de voie. Absent = la teinte de la
   * pince, qui reste le lien visuel avec le schéma.
   */
  couleur?: number;
}

/** État du zoom / défilement, conservé entre deux rendus. */
export interface Fenetre {
  /** Bord gauche, en ms simulées. */
  t0: number;
  /** Largeur de la fenêtre, en ms simulées. */
  duree: number;
}

/** Textes de l'interface, passés par l'appelant (la vue ne traduit rien). */
export interface TextesVue {
  /** Aucune sonde posée sur le schéma. */
  aucuneSonde: string;
  /** Sondes posées mais aucun front capturé. */
  aucuneDonnee: string;
  /** Voie dont la pastille n'est sur aucune broche. */
  nowhere: string;
  /** Voie posée sur une broche qui n'est pas une entrée/sortie logique. */
  notMcu: string;
  /** Voie posée sur une alimentation (VCC / GND) : aucun front à montrer. */
  power: string;
  /** Note sur une broche à convertisseur analogique. */
  analogique: string;
  /** Déclenchement réglé, pas encore survenu. */
  enAttente: string;
}

/** Teinte effective d'une voie : celle qu'on lui a choisie, sinon la sienne. */
export function teinteVoie(vv: VoieVue, sombre: boolean): string {
  return couleurVoie(vv.couleur ?? vv.voie, sombre);
}

/** Nom effectif d'une voie : celui qu'on lui a donné, sinon l'automatique. */
export function nomVoie(vv: VoieVue): string {
  const n = (vv.nomChoisi ?? '').trim();
  return n === '' ? vv.nom : n;
}

/** Formatage d'une durée en ms simulées, unité choisie d'après l'ordre. */
export function formatTemps(ms: number, lang = 'en'): string {
  const abs = Math.abs(ms);
  const rendu = (v: number, u: string, d: number): string =>
    `${v.toLocaleString(lang, { maximumFractionDigits: d })} ${u}`;
  if (abs === 0) return rendu(0, 'ms', 0);
  if (abs >= 1000) return rendu(ms / 1000, 's', 3);
  if (abs >= 1) return rendu(ms, 'ms', 3);
  if (abs >= 0.001) return rendu(ms * 1000, 'µs', 3);
  return rendu(ms * 1e6, 'ns', 1);
}

/** Pas de graduation « rond » (1-2-5 × 10ⁿ), comme dans le traceur. */
export function pasRond(brut: number): number {
  if (!(brut > 0)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(brut)));
  const norm = brut / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

/** Ce que l'appelant fournit à chaque rendu. */
export interface EtatRendu {
  capture: AnalyseurCapture;
  /** Voies à afficher, y compris celles en défaut (dans l'ordre des couleurs). */
  voies: VoieVue[];
  fenetre: Fenetre;
  /** Annotations de décodage, ou liste vide. */
  annotations: Annotation[];
  /** Position du réticule en pixels CSS, ou null (souris hors du canvas). */
  souris: { x: number; y: number } | null;
  textes: TextesVue;
  lang: string;
}

export class AnalyseurVue {
  constructor(private readonly canvas: HTMLCanvasElement) {}

  /** Hauteur totale nécessaire pour n voies (l'appelant dimensionne le canvas). */
  hauteurPour(nVoies: number): number {
    return REGLE_H + Math.max(1, nVoies) * (PISTE_H + ANNOT_H) + 8;
  }

  /** Convertit un temps (ms) en x (pixels CSS). */
  xDe(t: number, f: Fenetre, largeur: number): number {
    const plot = largeur - MARGE_G - MARGE_D;
    return MARGE_G + ((t - f.t0) / f.duree) * plot;
  }

  /** Convertit un x (pixels CSS) en temps (ms). */
  tDe(x: number, f: Fenetre, largeur: number): number {
    const plot = largeur - MARGE_G - MARGE_D;
    return f.t0 + ((x - MARGE_G) / plot) * f.duree;
  }

  /** Indice de piste sous une ordonnée, ou -1 hors des pistes. */
  pisteA(y: number, nVoies: number): number {
    const i = Math.floor((y - REGLE_H) / (PISTE_H + ANNOT_H));
    return i >= 0 && i < nVoies ? i : -1;
  }

  dessiner(e: EtatRendu): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const sombre = themeSombre();
    const style = getComputedStyle(document.body);
    const fg = style.getPropertyValue('--vscode-foreground').trim() || (sombre ? '#ccc' : '#333');
    const faible = sombre ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
    const police = style.getPropertyValue('--vscode-editor-font-family').trim() || 'monospace';
    ctx.font = `10px ${police}`;
    ctx.textBaseline = 'middle';

    if (e.voies.length === 0) {
      this.message(ctx, w, h, fg, e.textes.aucuneSonde);
      return;
    }

    const plot = w - MARGE_G - MARGE_D;
    if (plot <= 10) return;

    this.regle(ctx, e, w, fg, faible, police);

    for (let i = 0; i < e.voies.length; i++) {
      const vv = e.voies[i]!;
      const haut = REGLE_H + i * (PISTE_H + ANNOT_H);
      this.piste(ctx, e, vv, haut, w, fg, faible, sombre);
    }

    if (!e.capture.aDesDonnees) {
      const msg = e.capture.enAttente ? e.textes.enAttente : e.textes.aucuneDonnee;
      ctx.save();
      ctx.globalAlpha = 0.75;
      this.message(ctx, w, h, fg, msg);
      ctx.restore();
    }

    this.annotations(ctx, e, w, fg, sombre);
    this.declenchement(ctx, e, w, h);
    if (e.souris) this.reticule(ctx, e, w, h, fg);
  }

  /** Message centré (aucune sonde, aucune donnée, attente de déclenchement). */
  private message(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    fg: string,
    texte: string
  ): void {
    ctx.save();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.7;
    ctx.fillText(texte, w / 2, h / 2);
    ctx.restore();
  }

  /** Règle de temps en haut, avec des graduations rondes. */
  private regle(
    ctx: CanvasRenderingContext2D,
    e: EtatRendu,
    w: number,
    fg: string,
    faible: string,
    police: string
  ): void {
    const plot = w - MARGE_G - MARGE_D;
    // Une graduation tous les ~90 px : au-delà l'axe devient illisible, en
    // dessous les étiquettes se chevauchent (elles portent une unité).
    const pas = pasRond((e.fenetre.duree * 90) / plot);
    const origine = e.capture.tTrigger ?? 0;
    const premier = Math.ceil((e.fenetre.t0 - origine) / pas) * pas + origine;
    ctx.save();
    ctx.strokeStyle = faible;
    ctx.fillStyle = fg;
    ctx.globalAlpha = 0.85;
    ctx.font = `10px ${police}`;
    ctx.textAlign = 'center';
    for (let t = premier; t <= e.fenetre.t0 + e.fenetre.duree; t += pas) {
      const x = this.xDe(t, e.fenetre, w);
      if (x < MARGE_G - 1) continue;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, REGLE_H - 5);
      ctx.lineTo(Math.round(x) + 0.5, REGLE_H);
      ctx.stroke();
      ctx.fillText(formatTemps(t - origine, e.lang), x, REGLE_H / 2 - 2);
    }
    // Trait de base de la règle.
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(MARGE_G, REGLE_H - 0.5);
    ctx.lineTo(w - MARGE_D, REGLE_H - 0.5);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Une piste : le nom à gauche, le créneau à droite. Une voie en défaut ne
   * dessine aucun créneau mais écrit POURQUOI — c'est la consigne : ne rien
   * montrer, en expliquant.
   */
  private piste(
    ctx: CanvasRenderingContext2D,
    e: EtatRendu,
    vv: VoieVue,
    haut: number,
    w: number,
    fg: string,
    faible: string,
    sombre: boolean
  ): void {
    const couleur = teinteVoie(vv, sombre);
    const yBas = haut + (PISTE_H + CRENEAU_H) / 2;
    const yHaut = haut + (PISTE_H - CRENEAU_H) / 2;

    // Nom, dans la couleur de la pince : c'est le lien visuel avec le schéma.
    ctx.save();
    ctx.fillStyle = couleur;
    ctx.textAlign = 'left';
    ctx.fillText(this.tronquer(ctx, nomVoie(vv), MARGE_G - 14), 8, haut + PISTE_H / 2);
    ctx.restore();

    // Séparateur de piste.
    ctx.save();
    ctx.strokeStyle = faible;
    ctx.beginPath();
    ctx.moveTo(MARGE_G, haut + PISTE_H + ANNOT_H - 0.5);
    ctx.lineTo(w - MARGE_D, haut + PISTE_H + ANNOT_H - 0.5);
    ctx.stroke();
    ctx.restore();

    if (vv.probleme) {
      ctx.save();
      ctx.fillStyle = fg;
      ctx.globalAlpha = 0.65;
      ctx.textAlign = 'left';
      const t =
        vv.probleme === 'nowhere'
          ? e.textes.nowhere
          : vv.probleme === 'power'
            ? e.textes.power
            : e.textes.notMcu;
      ctx.fillText(t, MARGE_G + 8, haut + PISTE_H / 2);
      ctx.restore();
      return;
    }

    this.creneau(ctx, e, vv, yHaut, yBas, w, couleur);

    if (vv.analogique) {
      // Une broche A0…/GP26… est lisible en numérique (digitalRead) : on la
      // trace, mais on rappelle qu'un analyseur logique ne voit que 0 et 1.
      ctx.save();
      ctx.fillStyle = fg;
      ctx.globalAlpha = 0.55;
      ctx.textAlign = 'right';
      ctx.fillText(e.textes.analogique, w - MARGE_D - 2, haut + 8);
      ctx.restore();
    }
  }

  /**
   * Le créneau d'une voie. Les fronts sont regroupés PAR COLONNE DE PIXEL : une
   * colonne qui en contient plusieurs se remplit d'un bloc translucide (« ça
   * commute plus vite que l'écran »), les autres se dessinent en marches.
   */
  private creneau(
    ctx: CanvasRenderingContext2D,
    e: EtatRendu,
    vv: VoieVue,
    yHaut: number,
    yBas: number,
    w: number,
    couleur: string
  ): void {
    const f = e.fenetre;
    const { entrant, fronts } = e.capture.fenetre(vv.voie, f.t0, f.t0 + f.duree);
    ctx.save();
    ctx.strokeStyle = couleur;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'miter';

    if (entrant === null && fronts.length === 0) {
      // Niveau jamais observé : trait pointillé à mi-hauteur. Le dire bas
      // mentirait — la broche est peut-être haute depuis le début.
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(MARGE_G, (yHaut + yBas) / 2);
      ctx.lineTo(w - MARGE_D, (yHaut + yBas) / 2);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const yDe = (n: 0 | 1): number => (n === 1 ? yHaut : yBas);
    const xMin = MARGE_G;
    const xMax = w - MARGE_D;
    let niveau: 0 | 1 = entrant ?? (fronts[0] ? (fronts[0].niveau === 1 ? 0 : 1) : 0);
    let x = xMin;

    ctx.beginPath();
    ctx.moveTo(x, yDe(niveau));
    let i = 0;
    while (i < fronts.length) {
      const xf = this.xDe(fronts[i]!.t, f, w);
      const col = Math.floor(xf);
      // Combien de fronts tombent dans CETTE colonne de pixel ?
      let j = i;
      while (j < fronts.length && Math.floor(this.xDe(fronts[j]!.t, f, w)) === col) j += 1;
      const n = j - i;
      if (n > 2) {
        // Zone dense : on ferme le trait, on remplit un bloc, on repart du
        // dernier niveau réel de la colonne.
        ctx.lineTo(Math.max(xMin, Math.min(xMax, xf)), yDe(niveau));
        ctx.stroke();
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = couleur;
        ctx.fillRect(Math.max(xMin, col), yHaut, 1, yBas - yHaut);
        ctx.restore();
        niveau = fronts[j - 1]!.niveau;
        x = Math.max(xMin, Math.min(xMax, col + 1));
        ctx.beginPath();
        ctx.moveTo(x, yDe(niveau));
        i = j;
        continue;
      }
      for (let k = i; k < j; k++) {
        const xk = Math.max(xMin, Math.min(xMax, this.xDe(fronts[k]!.t, f, w)));
        ctx.lineTo(xk, yDe(niveau)); // palier
        niveau = fronts[k]!.niveau;
        ctx.lineTo(xk, yDe(niveau)); // front
      }
      i = j;
    }
    ctx.lineTo(xMax, yDe(niveau));
    ctx.stroke();
    ctx.restore();
  }

  /** Annotations de décodage, sous les créneaux de la voie de données. */
  private annotations(
    ctx: CanvasRenderingContext2D,
    e: EtatRendu,
    w: number,
    fg: string,
    sombre: boolean
  ): void {
    if (e.annotations.length === 0) return;
    // Chaque annotation se pose sous la piste de SA voie de données. Depuis
    // qu'on décode plusieurs bus à la fois, tout empiler sous la dernière
    // piste mélangeait les trames de deux protocoles sans rien pour les
    // distinguer. Une annotation sans voie (ou dont la voie n'est pas
    // affichée) retombe sous la dernière piste, comme avant.
    const derniere = e.voies.length - 1;
    const rang = new Map<number, number>();
    for (let i = 0; i < e.voies.length; i++) rang.set(e.voies[i]!.voie, i);
    const yDePiste = (i: number): number =>
      REGLE_H + i * (PISTE_H + ANNOT_H) + PISTE_H + 1;
    const xMin = MARGE_G;
    const xMax = w - MARGE_D;
    const couleurs: Record<Annotation['nature'], string> = {
      cadre: sombre ? '#9085e9' : '#4a3aa7',
      donnee: sombre ? '#199e70' : '#1baf7a',
      controle: sombre ? '#c98500' : '#eda100',
      erreur: sombre ? '#e66767' : '#e34948',
    };
    ctx.save();
    ctx.font = `9px ${getComputedStyle(document.body).getPropertyValue('--vscode-editor-font-family').trim() || 'monospace'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Dernier x occupé, PAR PISTE : une annotation qui chevaucherait la
    // précédente est dessinée en trait seul, sans texte — l'élève zoome pour
    // la lire. Le suivi est par piste depuis qu'on décode plusieurs bus : un
    // compteur global laissait un bus muet parce que l'autre avait écrit au
    // même instant sur une AUTRE ligne.
    const occupe = new Map<number, number>();
    for (const a of e.annotations) {
      const piste = (a.voie !== undefined ? rang.get(a.voie) : undefined) ?? derniere;
      if (piste < 0) continue;
      const y = yDePiste(piste);
      const x0 = this.xDe(a.t0, e.fenetre, w);
      const x1 = this.xDe(Math.max(a.t1, a.t0), e.fenetre, w);
      if (x1 < xMin || x0 > xMax) continue;
      const g = Math.max(xMin, x0);
      const d = Math.min(xMax, Math.max(x1, x0 + 1));
      const c = couleurs[a.nature];
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.22;
      ctx.fillRect(g, y, Math.max(1, d - g), ANNOT_H - 3);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.moveTo(Math.round(g) + 0.5, y);
      ctx.lineTo(Math.round(g) + 0.5, y + ANNOT_H - 3);
      ctx.stroke();
      const largeurTexte = ctx.measureText(a.texte).width;
      const centre = (g + d) / 2;
      if (g >= (occupe.get(piste) ?? -Infinity) && d - g >= largeurTexte + 4) {
        ctx.fillStyle = fg;
        ctx.fillText(a.texte, centre, y + (ANNOT_H - 3) / 2);
        occupe.set(piste, d);
      }
    }
    ctx.restore();
  }

  /** Repère vertical de l'instant de déclenchement. */
  private declenchement(
    ctx: CanvasRenderingContext2D,
    e: EtatRendu,
    w: number,
    h: number
  ): void {
    const t = e.capture.tTrigger;
    if (t === null) return;
    const x = this.xDe(t, e.fenetre, w);
    if (x < MARGE_G || x > w - MARGE_D) return;
    ctx.save();
    ctx.strokeStyle = '#e34948';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, REGLE_H);
    ctx.lineTo(Math.round(x) + 0.5, h);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Réticule : trait vertical suivant la souris, l'instant en haut, et le
   * niveau de chaque voie à cet instant à côté de son nom.
   */
  private reticule(
    ctx: CanvasRenderingContext2D,
    e: EtatRendu,
    w: number,
    h: number,
    fg: string
  ): void {
    const s = e.souris!;
    if (s.x < MARGE_G || s.x > w - MARGE_D) return;
    const t = this.tDe(s.x, e.fenetre, w);
    const origine = e.capture.tTrigger ?? 0;
    ctx.save();
    ctx.strokeStyle = fg;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(Math.round(s.x) + 0.5, REGLE_H);
    ctx.lineTo(Math.round(s.x) + 0.5, h);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.fillStyle = fg;
    ctx.textAlign = s.x > w / 2 ? 'right' : 'left';
    const dx = s.x > w / 2 ? -4 : 4;
    ctx.fillText(formatTemps(t - origine, e.lang), s.x + dx, REGLE_H / 2 - 2);

    // Niveau de chaque voie sous le curseur, à droite de son nom.
    ctx.textAlign = 'right';
    for (let i = 0; i < e.voies.length; i++) {
      const vv = e.voies[i]!;
      if (vv.probleme) continue;
      const n = e.capture.niveauA(vv.voie, t);
      if (n === null) continue;
      ctx.globalAlpha = 0.8;
      ctx.fillText(String(n), MARGE_G - 4, REGLE_H + i * (PISTE_H + ANNOT_H) + PISTE_H / 2);
    }
    ctx.restore();
  }

  /** Coupe un texte trop long pour la colonne des noms (suffixe « … »). */
  private tronquer(ctx: CanvasRenderingContext2D, texte: string, largeur: number): string {
    if (ctx.measureText(texte).width <= largeur) return texte;
    let t = texte;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > largeur) t = t.slice(0, -1);
    return `${t}…`;
  }
}

/** Constantes de disposition exposées pour les bancs et l'interface. */
export const DISPOSITION = { PISTE_H, ANNOT_H, MARGE_G, MARGE_D, REGLE_H, CRENEAU_H };
