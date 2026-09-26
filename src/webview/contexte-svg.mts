// Contexte de dessin qui ÉCRIT du SVG au lieu de peindre des pixels.
//
// POURQUOI. L'export SVG de l'analyseur (Frank, 26/09) doit montrer ce que
// l'écran montre. Plutôt qu'un second moteur de rendu, qui dériverait du
// premier à la première retouche, la vue peint dans ce contexte avec LE MÊME
// code que dans le canvas : chaque trait, rectangle et texte devient un élément
// SVG. Le résultat est vectoriel : il se retouche dans Inkscape, s'agrandit
// sans flou, et ses textes restent des textes.
//
// PÉRIMÈTRE. Seul le sous-ensemble de CanvasRenderingContext2D dont se sert
// analyseur-vue.mts est couvert : chemins droits, rectangles (arrondis ou non),
// pointillés, textes alignés, transparence globale, pile save/restore. Les
// mesures de texte sont demandées à un vrai canvas : coupures de lignes et
// troncatures tombent donc comme à l'écran.
//
// COMPATIBILITÉ. Inkscape, les navigateurs et les suites bureautiques ne lisent
// pas tous `rgba()`, `#rrggbbaa` ni `dominant-baseline`. Les couleurs sont donc
// écrites en `#rrggbb` plus une opacité, et la ligne de base des textes est
// calculée ici (décalage mesuré sur le vrai canvas), pas laissée au lecteur.

interface Etat {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  lineCap: CanvasLineCap;
  tirets: number[];
  globalAlpha: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
}

/** Nombre court : deux décimales suffisent à des pixels CSS. */
function n(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}

/** Échappement pour un attribut ou un texte XML. */
function xml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class ContexteSvg {
  private etat: Etat = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineJoin: 'miter',
    lineCap: 'butt',
    tirets: [],
    globalAlpha: 1,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  };
  private pile: Etat[] = [];
  /** Chemin en cours (attribut `d`). */
  private d = '';
  private readonly elements: string[] = [];
  /** Vrai canvas, pour mesurer les textes et normaliser couleurs et polices. */
  private readonly mesure: CanvasRenderingContext2D | null;
  /** Décalage de la ligne de base alphabétique, par police et ligne de base demandée. */
  private readonly decalages = new Map<string, number>();

  constructor(
    private readonly largeur: number,
    private readonly hauteur: number
  ) {
    this.mesure = document.createElement('canvas').getContext('2d');
  }

  get fillStyle(): string { return this.etat.fillStyle; }
  set fillStyle(v: string) { this.etat.fillStyle = String(v); }
  get strokeStyle(): string { return this.etat.strokeStyle; }
  set strokeStyle(v: string) { this.etat.strokeStyle = String(v); }
  get lineWidth(): number { return this.etat.lineWidth; }
  set lineWidth(v: number) { if (Number.isFinite(v) && v > 0) this.etat.lineWidth = v; }
  get lineJoin(): CanvasLineJoin { return this.etat.lineJoin; }
  set lineJoin(v: CanvasLineJoin) { this.etat.lineJoin = v; }
  get lineCap(): CanvasLineCap { return this.etat.lineCap; }
  set lineCap(v: CanvasLineCap) { this.etat.lineCap = v; }
  get globalAlpha(): number { return this.etat.globalAlpha; }
  set globalAlpha(v: number) { if (Number.isFinite(v) && v >= 0 && v <= 1) this.etat.globalAlpha = v; }
  get font(): string { return this.etat.font; }
  set font(v: string) { this.etat.font = v; }
  get textAlign(): CanvasTextAlign { return this.etat.textAlign; }
  set textAlign(v: CanvasTextAlign) { this.etat.textAlign = v; }
  get textBaseline(): CanvasTextBaseline { return this.etat.textBaseline; }
  set textBaseline(v: CanvasTextBaseline) { this.etat.textBaseline = v; }

  save(): void {
    this.pile.push({ ...this.etat, tirets: [...this.etat.tirets] });
  }

  restore(): void {
    const e = this.pile.pop();
    if (e) this.etat = e;
  }

  setLineDash(tirets: number[]): void {
    this.etat.tirets = [...tirets];
  }

  getLineDash(): number[] {
    return [...this.etat.tirets];
  }

  /** Sans objet : le SVG est en pixels CSS, sans l'échelle de l'écran. */
  setTransform(): void {}

  /** Sans objet : le document part vide. */
  clearRect(): void {}

  beginPath(): void {
    this.d = '';
  }

  moveTo(x: number, y: number): void {
    this.d += `M${n(x)} ${n(y)}`;
  }

  lineTo(x: number, y: number): void {
    this.d += `L${n(x)} ${n(y)}`;
  }

  closePath(): void {
    this.d += 'Z';
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.d += `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`;
  }

  /** Rectangle arrondi, un seul rayon pour les quatre coins (tout ce que la vue demande). */
  roundRect(x: number, y: number, w: number, h: number, rayons?: number | DOMPointInit | Array<number | DOMPointInit>): void {
    const brut = Array.isArray(rayons) ? rayons[0] : rayons;
    const r0 = typeof brut === 'number' ? brut : (brut?.x ?? 0);
    const r = Math.max(0, Math.min(r0, Math.abs(w) / 2, Math.abs(h) / 2));
    if (r === 0) {
      this.rect(x, y, w, h);
      return;
    }
    const a = `A${n(r)} ${n(r)} 0 0 1`;
    this.d +=
      `M${n(x + r)} ${n(y)}H${n(x + w - r)}${a} ${n(x + w)} ${n(y + r)}` +
      `V${n(y + h - r)}${a} ${n(x + w - r)} ${n(y + h)}` +
      `H${n(x + r)}${a} ${n(x)} ${n(y + h - r)}` +
      `V${n(y + r)}${a} ${n(x + r)} ${n(y)}Z`;
  }

  fill(): void {
    if (this.d !== '') this.elements.push(`<path d="${this.d}"${this.remplissage()}/>`);
  }

  stroke(): void {
    if (this.d !== '') this.elements.push(`<path d="${this.d}" fill="none"${this.trait()}/>`);
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.elements.push(`<rect${this.boite(x, y, w, h)}${this.remplissage()}/>`);
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    this.elements.push(`<rect${this.boite(x, y, w, h)} fill="none"${this.trait()}/>`);
  }

  fillText(texte: string, x: number, y: number): void {
    if (texte === '') return;
    const p = this.police();
    const ancre =
      this.etat.textAlign === 'center'
        ? 'middle'
        : this.etat.textAlign === 'right' || this.etat.textAlign === 'end'
          ? 'end'
          : 'start';
    this.elements.push(
      `<text x="${n(x)}" y="${n(y + this.decalageBase())}" font-family="${xml(p.famille)}" font-size="${n(p.taille)}"` +
        (p.graisse ? ` font-weight="${p.graisse}"` : '') +
        (p.style ? ` font-style="${p.style}"` : '') +
        (ancre !== 'start' ? ` text-anchor="${ancre}"` : '') +
        `${this.remplissage()} xml:space="preserve">${xml(texte)}</text>`
    );
  }

  measureText(texte: string): TextMetrics {
    if (!this.mesure) return { width: texte.length * this.police().taille * 0.6 } as TextMetrics;
    this.mesure.font = this.etat.font;
    this.mesure.textBaseline = 'alphabetic';
    return this.mesure.measureText(texte);
  }

  /** Le document SVG complet. */
  texte(): string {
    const w = n(this.largeur);
    const h = n(this.hauteur);
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
      ...this.elements,
      '</svg>',
      '',
    ].join('\n');
  }

  // --- Attributs ---------------------------------------------------------------

  /** Rectangle aux côtés positifs (le canvas accepte une largeur négative, le SVG non). */
  private boite(x: number, y: number, w: number, h: number): string {
    const x0 = Math.min(x, x + w);
    const y0 = Math.min(y, y + h);
    return ` x="${n(x0)}" y="${n(y0)}" width="${n(Math.abs(w))}" height="${n(Math.abs(h))}"`;
  }

  private remplissage(): string {
    const c = this.couleur(this.etat.fillStyle);
    const a = c.a * this.etat.globalAlpha;
    return ` fill="${xml(c.rgb)}"` + (a < 1 ? ` fill-opacity="${n(a)}"` : '');
  }

  private trait(): string {
    const c = this.couleur(this.etat.strokeStyle);
    const a = c.a * this.etat.globalAlpha;
    const e = this.etat;
    return (
      ` stroke="${xml(c.rgb)}"` +
      (a < 1 ? ` stroke-opacity="${n(a)}"` : '') +
      (e.lineWidth !== 1 ? ` stroke-width="${n(e.lineWidth)}"` : '') +
      (e.tirets.length > 0 ? ` stroke-dasharray="${e.tirets.map(n).join(' ')}"` : '') +
      (e.lineJoin !== 'miter' ? ` stroke-linejoin="${e.lineJoin}"` : '') +
      (e.lineCap !== 'butt' ? ` stroke-linecap="${e.lineCap}"` : '')
    );
  }

  /**
   * Couleur en `#rrggbb` plus une opacité. Le vrai canvas normalise d'abord
   * n'importe quelle écriture CSS (nom, `rgb()`, `#abc`…) en `#rrggbb` ou en
   * `rgba(r, g, b, a)` : il ne reste que ces deux formes à lire.
   */
  private couleur(css: string): { rgb: string; a: number } {
    let c = css;
    if (this.mesure) {
      this.mesure.fillStyle = '#000000';
      this.mesure.fillStyle = css;
      c = String(this.mesure.fillStyle);
    }
    if (/^#[0-9a-f]{6}$/i.test(c)) return { rgb: c, a: 1 };
    const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i.exec(c);
    if (!m) return { rgb: c, a: 1 };
    const hex = (v: string): string => Math.max(0, Math.min(255, Math.round(Number(v)))).toString(16).padStart(2, '0');
    return { rgb: `#${hex(m[1]!)}${hex(m[2]!)}${hex(m[3]!)}`, a: m[4] !== undefined ? Number(m[4]) : 1 };
  }

  /** Police courante découpée en attributs SVG (le raccourci CSS `font` n'est pas lu partout). */
  private police(): { famille: string; taille: number; graisse: string; style: string } {
    let f = this.etat.font;
    if (this.mesure) {
      this.mesure.font = f;
      f = this.mesure.font;
    }
    const m = /^(.*?)\s*(\d*\.?\d+)px(?:\/\S+)?\s+(.+)$/.exec(f);
    if (!m) return { famille: 'sans-serif', taille: 10, graisse: '', style: '' };
    let graisse = '';
    let style = '';
    for (const mot of m[1]!.split(/\s+/)) {
      if (mot === 'italic' || mot === 'oblique') style = mot;
      else if (mot === 'bold' || mot === 'bolder' || mot === 'lighter' || /^\d{3}$/.test(mot)) graisse = mot;
    }
    // Guillemets simples : la famille va dans un attribut entre guillemets doubles.
    return { famille: m[3]!.replace(/"/g, "'"), taille: Number(m[2]), graisse, style };
  }

  /**
   * Écart entre la ligne de base demandée (`middle` le plus souvent) et la ligne
   * de base alphabétique, la seule que tous les lecteurs de SVG respectent. Mesuré
   * sur le vrai canvas : le haut d'un « H » est au même endroit dans les deux
   * réglages, seule la ligne de référence change.
   */
  private decalageBase(): number {
    const base = this.etat.textBaseline;
    if (base === 'alphabetic' || !this.mesure) return 0;
    const cle = `${base}|${this.etat.font}`;
    const connu = this.decalages.get(cle);
    if (connu !== undefined) return connu;
    this.mesure.font = this.etat.font;
    this.mesure.textBaseline = 'alphabetic';
    const alpha = this.mesure.measureText('H').actualBoundingBoxAscent;
    this.mesure.textBaseline = base;
    const demande = this.mesure.measureText('H').actualBoundingBoxAscent;
    this.mesure.textBaseline = 'alphabetic';
    const d = alpha - demande;
    this.decalages.set(cle, d);
    return d;
  }
}
