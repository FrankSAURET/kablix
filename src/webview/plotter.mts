// Traceur de courbes temps réel : visualise la télémétrie série au format
// Teleplot (`>nom:valeur`, compatible avec l'outil Teleplot sur vrai matériel)
// et les « sondes internes » — la tension que chaque capteur analogique pose
// sur sa broche via setAnalog, tracée sans une ligne de code dans le sketch.
// Canvas 2D maison, aucune dépendance, entièrement hors-ligne.
import { t } from './i18n.mjs';

/** Point de mesure : instant (performance.now, ms) + valeur. */
interface PlotPoint {
  t: number;
  v: number;
}

/**
 * Série tracée. `mode` :
 * - 'line' : échantillons imprimés par le programme (points reliés en droites) ;
 * - 'step' : sonde interne événementielle — la valeur TIENT entre deux
 *   changements, donc tracé en escalier prolongé jusqu'à « maintenant ».
 */
interface PlotSeries {
  name: string;
  unit: string;
  mode: 'line' | 'step';
  colorIdx: number; // index de palette, attribué à la création et JAMAIS recyclé
  pts: PlotPoint[];
  visible: boolean;
  chip: HTMLButtonElement;
  dot: HTMLSpanElement;
  valueEl: HTMLSpanElement;
}

// Palette catégorielle (8 teintes, ordre fixe optimisé daltonisme — validée
// contre les fonds VS Code clair #fff et sombre #1f1f1f). La 9e série et les
// suivantes reçoivent un gris neutre : on ne recycle jamais une teinte.
const PALETTE_LIGHT = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'];
const PALETTE_DARK = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767', '#d55181', '#d95926'];
const OVERFLOW_COLOR = '#888888';

// Ligne Teleplot complète : `>nom:valeur`, `>nom:horodatage:valeur`, unité
// optionnelle `§u`, drapeaux optionnels `|g`… L'horodatage émis par le sketch
// est ignoré (l'heure d'arrivée locale suffit et reste cohérente entre séries).
const TELEM_LINE = /^>([^:\s>|§]+):(?:(-?\d+):)?(-?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?)(?:§([^|\r\n]*))?(?:\|[a-zA-Z]*)?\r?$/;
// Préfixe encore candidat (ligne en cours de réception, pas de \n encore vu).
const TELEM_PREFIX = /^>[^:\s>|§]*(?::[^\r\n]*)?$/;
// Une ligne retenue qui ne se termine pas est rendue à la console après ce
// délai (l'écho d'un « > » tapé au REPL ne doit pas rester invisible ; une
// vraie ligne de télémétrie arrive en rafale bien plus vite).
const HOLD_FLUSH_MS = 500;

const MAX_HOLD_CHARS = 300;
const MAX_KEEP_MS = 65_000; // fenêtre max 60 s + marge de continuité

/** Options de fenêtre glissante proposées (secondes). */
const WINDOWS_S = [5, 10, 30, 60];

export class Plotter {
  private section = document.getElementById('plotter-section') as HTMLElement;
  private canvas = document.getElementById('plotter-canvas') as HTMLCanvasElement;
  private legendEl = document.getElementById('plotter-legend') as HTMLDivElement;
  private windowSelect = document.getElementById('plotter-window') as HTMLSelectElement;
  private pauseBtn = document.getElementById('plotter-pause') as HTMLButtonElement;
  private csvBtn = document.getElementById('plotter-csv') as HTMLButtonElement;
  private clearBtn = document.getElementById('clear-plotter') as HTMLButtonElement;
  private emptyEl = document.getElementById('plotter-empty') as HTMLDivElement;
  private tooltipEl = document.getElementById('plotter-tooltip') as HTMLDivElement;

  private series = new Map<string, PlotSeries>();
  private t0 = performance.now(); // origine des temps affichés (départ du run)
  private running = false;
  private frozen = false; // ⏸ d'affichage : la collecte continue
  private freezeT = 0; // borne droite figée (pause ou arrêt)
  private raf = 0;
  private hoverX = -1; // position du réticule (px CSS), -1 = pas de survol

  // Filtre du flux série : ligne candidate retenue (commence par '>').
  private lineBuf = '';
  private atLineStart = true;
  private holdTimer: ReturnType<typeof setTimeout> | undefined;

  /** Première série créée depuis start() : l'hôte peut auto-afficher le panneau. */
  onFirstData: (() => void) | null = null;
  /** Export CSV demandé (l'hôte ouvre la boîte d'enregistrement). */
  onExportCsv: ((csv: string) => void) | null = null;
  /** Texte retenu par le filtre finalement rendu à la console (délai dépassé). */
  onHoldFlush: ((text: string) => void) | null = null;

  constructor() {
    for (const s of WINDOWS_S) {
      const opt = document.createElement('option');
      opt.value = String(s);
      opt.textContent = `${s} s`;
      if (s === 10) opt.selected = true;
      this.windowSelect.appendChild(opt);
    }
    this.windowSelect.addEventListener('change', () => this.requestDraw());
    this.pauseBtn.addEventListener('click', () => this.toggleFrozen());
    this.clearBtn.addEventListener('click', () => this.clear());
    this.csvBtn.addEventListener('click', () => this.onExportCsv?.(this.toCsv()));
    // Réticule de survol : valeurs de chaque série à l'instant pointé.
    this.canvas.addEventListener('pointermove', (e) => {
      const box = this.canvas.getBoundingClientRect();
      this.hoverX = e.clientX - box.left;
      this.requestDraw();
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.hoverX = -1;
      this.tooltipEl.hidden = true;
      this.requestDraw();
    });
    // Redessin sur redimensionnement (même courbes figées après l'arrêt).
    new ResizeObserver(() => this.requestDraw()).observe(this.canvas);
    // Changement de thème VS Code : classe du <body> mise à jour en direct.
    new MutationObserver(() => {
      this.applyThemeToChips();
      this.requestDraw();
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    this.updateEmptyState();
  }

  // --- Cycle de vie --------------------------------------------------------

  /** Nouveau run : données effacées, origine des temps remise à zéro. */
  start(): void {
    this.clear();
    this.t0 = performance.now();
    this.running = true;
    this.frozen = false;
    this.updatePauseBtn();
    this.startLoop();
  }

  /** Fin de simulation : les courbes restent affichées pour analyse. */
  stop(): void {
    if (this.running) this.freezeT = performance.now();
    this.running = false;
    this.stopLoop();
    this.flushHold();
    this.requestDraw();
    this.updatePauseBtn();
  }

  /** Efface toutes les séries (données + puces de légende). */
  clear(): void {
    for (const s of this.series.values()) s.chip.remove();
    this.series.clear();
    this.lineBuf = '';
    this.atLineStart = true;
    if (this.holdTimer !== undefined) clearTimeout(this.holdTimer);
    this.holdTimer = undefined;
    this.updateEmptyState();
    this.requestDraw();
  }

  /** Au moins une série existe (données reçues depuis le dernier start). */
  get hasData(): boolean {
    return this.series.size > 0;
  }

  /** À appeler après avoir (ré)affiché la section : relance rendu et boucle. */
  refresh(): void {
    this.requestDraw();
    if (this.running) this.startLoop();
  }

  // --- Entrées de données --------------------------------------------------

  /**
   * Filtre le flux série : les lignes de télémétrie `>nom:valeur` sont
   * absorbées (tracées), le reste est rendu tel quel pour la console. Les
   * caractères d'une ligne candidate sont retenus jusqu'à son dénouement
   * (fin de ligne, motif invalidé ou délai) — voir HOLD_FLUSH_MS.
   */
  filterSerial(chunk: string): string {
    let out = '';
    for (const ch of chunk) {
      if (this.lineBuf) {
        if (ch === '\n') {
          const line = this.lineBuf;
          this.endHold();
          this.atLineStart = true;
          if (!this.ingestLine(line)) out += line + ch; // pas de la télémétrie
        } else {
          this.lineBuf += ch;
          if (this.lineBuf.length > MAX_HOLD_CHARS || !TELEM_PREFIX.test(this.lineBuf.replace(/\r$/, ''))) {
            out += this.lineBuf; // plus candidate : rendre les caractères retenus
            this.endHold();
            this.atLineStart = false;
          }
        }
        continue;
      }
      if (ch === '>' && this.atLineStart) {
        this.lineBuf = '>';
        this.holdTimer = setTimeout(() => this.flushHold(), HOLD_FLUSH_MS);
        continue;
      }
      this.atLineStart = ch === '\n' || ch === '\r';
      out += ch;
    }
    return out;
  }

  /**
   * Sonde interne : valeur posée sur une broche analogique (déjà convertie en
   * volts par l'appelant). Tracé en escalier ; une valeur inchangée n'ajoute
   * aucun point (le prolongement jusqu'à « maintenant » est fait au dessin).
   */
  probe(name: string, value: number, unit = 'V'): void {
    this.push(name, value, unit, 'step');
  }

  /** Ligne candidate abandonnée : son texte est rendu à la console. */
  private flushHold(): void {
    if (!this.lineBuf) return;
    const text = this.lineBuf;
    this.endHold();
    this.atLineStart = false;
    this.onHoldFlush?.(text);
  }

  private endHold(): void {
    this.lineBuf = '';
    if (this.holdTimer !== undefined) clearTimeout(this.holdTimer);
    this.holdTimer = undefined;
  }

  /** Tente d'interpréter une ligne complète comme télémétrie Teleplot. */
  private ingestLine(line: string): boolean {
    const m = TELEM_LINE.exec(line);
    if (!m) return false;
    const value = Number.parseFloat(m[3]!.replace(',', '.'));
    if (!Number.isFinite(value)) return false;
    this.push(m[1]!, value, m[4]?.trim() ?? '', 'line');
    return true;
  }

  private push(name: string, value: number, unit: string, mode: 'line' | 'step'): void {
    let s = this.series.get(name);
    if (!s) {
      s = this.createSeries(name, unit, mode);
      this.series.set(name, s);
      if (this.series.size === 1) this.onFirstData?.();
      this.updateEmptyState();
    }
    const now = performance.now();
    const last = s.pts[s.pts.length - 1];
    if (s.mode === 'step') {
      if (last && last.v === value) return; // valeur tenue : rien à mémoriser
      // Marche d'escalier : l'ancienne valeur tient jusqu'à l'instant du changement.
      if (last) s.pts.push({ t: now, v: last.v });
    }
    s.pts.push({ t: now, v: value });
    // Purge du passé hors fenêtre — en gardant un point avant la coupe pour que
    // la courbe entre par le bord gauche sans trou.
    const cutoff = now - MAX_KEEP_MS;
    if (s.pts.length > 2 && s.pts[0]!.t < cutoff) {
      let i = 0;
      while (i < s.pts.length && s.pts[i]!.t < cutoff) i++;
      if (i > 1) s.pts.splice(0, i - 1);
    }
  }

  private createSeries(name: string, unit: string, mode: 'line' | 'step'): PlotSeries {
    const colorIdx = this.series.size;
    const chip = document.createElement('button');
    chip.className = 'plotter__chip';
    chip.title = t('Click to hide/show this curve');
    const dot = document.createElement('span');
    dot.className = 'plotter__dot';
    const label = document.createElement('span');
    label.textContent = name;
    const valueEl = document.createElement('span');
    valueEl.className = 'plotter__chip-value';
    chip.append(dot, label, valueEl);
    this.legendEl.appendChild(chip);
    const s: PlotSeries = { name, unit, mode, colorIdx, pts: [], visible: true, chip, dot, valueEl };
    dot.style.background = this.colorOf(s);
    chip.addEventListener('click', () => {
      s.visible = !s.visible;
      chip.classList.toggle('plotter__chip--off', !s.visible);
      this.requestDraw();
    });
    return s;
  }

  // --- Couleurs / thème ----------------------------------------------------

  private isDark(): boolean {
    const cls = document.body.classList;
    return !cls.contains('vscode-light'); // défaut : sombre
  }

  private colorOf(s: PlotSeries): string {
    const palette = this.isDark() ? PALETTE_DARK : PALETTE_LIGHT;
    return s.colorIdx < palette.length ? palette[s.colorIdx]! : OVERFLOW_COLOR;
  }

  private applyThemeToChips(): void {
    for (const s of this.series.values()) s.dot.style.background = this.colorOf(s);
  }

  // --- Affichage -----------------------------------------------------------

  private toggleFrozen(): void {
    this.frozen = !this.frozen;
    if (this.frozen) this.freezeT = performance.now();
    else if (this.running) this.startLoop();
    this.updatePauseBtn();
    this.requestDraw();
  }

  private updatePauseBtn(): void {
    this.pauseBtn.textContent = this.frozen ? '▶' : '⏸';
    this.pauseBtn.title = this.frozen
      ? t('Resume the display (data keeps being collected)')
      : t('Freeze the display (data keeps being collected)');
    this.pauseBtn.classList.toggle('primary', this.frozen);
    this.pauseBtn.disabled = !this.running && !this.frozen;
  }

  private updateEmptyState(): void {
    this.emptyEl.hidden = this.series.size > 0;
    this.legendEl.hidden = this.series.size === 0;
  }

  private startLoop(): void {
    if (this.raf) return;
    const tick = (): void => {
      if (!this.running || this.frozen || this.section.hidden) {
        this.raf = 0;
        return;
      }
      this.draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Un rendu ponctuel (état figé, redimensionnement, survol, thème…). */
  private requestDraw(): void {
    if (this.raf) return; // la boucle s'en charge déjà
    requestAnimationFrame(() => {
      if (!this.raf) this.draw();
    });
  }

  /** Arrondit un pas à une valeur « ronde » (1-2-5 × 10^n). */
  private niceStep(raw: number): number {
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  }

  private fmt(n: number, digits = 2): string {
    const lang = window.KABLIX_LANG ?? 'en';
    return n.toLocaleString(lang, { maximumFractionDigits: digits });
  }

  private draw(): void {
    if (this.section.hidden) return;
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

    const style = getComputedStyle(document.body);
    const fg = style.getPropertyValue('--vscode-foreground').trim() || (this.isDark() ? '#ccc' : '#333');
    const font = `10px ${style.getPropertyValue('--vscode-editor-font-family').trim() || 'monospace'}`;

    // Bornes temporelles : fenêtre glissante qui suit « maintenant », figée en
    // pause d'affichage ou à l'arrêt de la simulation.
    const windowMs = (Number(this.windowSelect.value) || 10) * 1000;
    const tEnd = this.running && !this.frozen ? performance.now() : this.freezeT;
    const tStart = tEnd - windowMs;

    // Marges : place pour les graduations Y à gauche et X en bas.
    const padL = 44;
    const padR = 8;
    const padT = 8;
    const padB = 18;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    if (plotW <= 0 || plotH <= 0) return;

    // Étendue Y automatique sur les points visibles de la fenêtre.
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const s of this.series.values()) {
      if (!s.visible) continue;
      for (const p of s.pts) {
        if (p.t < tStart - 1000 || p.t > tEnd) continue;
        if (p.v < yMin) yMin = p.v;
        if (p.v > yMax) yMax = p.v;
      }
      // La valeur tenue d'une sonde compte aussi (série sans point récent).
      const last = s.pts[s.pts.length - 1];
      if (s.mode === 'step' && last && last.t <= tEnd) {
        if (last.v < yMin) yMin = last.v;
        if (last.v > yMax) yMax = last.v;
      }
    }
    if (!Number.isFinite(yMin)) {
      yMin = 0;
      yMax = 1;
    }
    if (yMax - yMin < 1e-9) {
      yMin -= 0.5;
      yMax += 0.5;
    }
    const pad = (yMax - yMin) * 0.08;
    yMin -= pad;
    yMax += pad;

    const xOf = (tms: number): number => padL + ((tms - tStart) / windowMs) * plotW;
    const yOf = (v: number): number => padT + (1 - (v - yMin) / (yMax - yMin)) * plotH;

    // Grille discrète + graduations. Axe X en secondes depuis le départ du run.
    ctx.font = font;
    ctx.strokeStyle = fg;
    ctx.fillStyle = fg;
    const yStep = this.niceStep((yMax - yMin) / 4);
    ctx.globalAlpha = 1;
    for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) {
      const y = yOf(v);
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 0.65;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.fmt(v), padL - 5, y);
    }
    const xStepMs = this.niceStep(windowMs / 5);
    for (let tm = Math.ceil(tStart / xStepMs) * xStepMs; tm <= tEnd; tm += xStepMs) {
      const x = xOf(tm);
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, h - padB);
      ctx.stroke();
      ctx.globalAlpha = 0.65;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`${this.fmt((tm - this.t0) / 1000, 1)} s`, x, h - padB + 4);
    }
    // Unité commune à toutes les séries visibles : affichée en haut de l'axe Y.
    const units = new Set([...this.series.values()].filter((s) => s.visible).map((s) => s.unit));
    if (units.size === 1) {
      const unit = [...units][0];
      if (unit) {
        ctx.globalAlpha = 0.65;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(unit, 2, padT);
      }
    }
    ctx.globalAlpha = 1;

    // Courbes : traits de 2 px, jonctions arrondies. Les sondes (escalier) sont
    // prolongées horizontalement jusqu'au bord droit (valeur toujours tenue).
    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, padT, plotW, plotH);
    ctx.clip();
    for (const s of this.series.values()) {
      if (!s.visible || s.pts.length === 0) continue;
      ctx.strokeStyle = this.colorOf(s);
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      let started = false;
      for (const p of s.pts) {
        if (p.t > tEnd) break;
        const x = xOf(p.t);
        const y = yOf(p.v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      const last = s.pts[s.pts.length - 1]!;
      if (s.mode === 'step' && last.t < tEnd) {
        // Valeur tenue jusqu'à maintenant.
        if (!started) ctx.moveTo(xOf(tStart), yOf(last.v));
        ctx.lineTo(xOf(tEnd), yOf(last.v));
      }
      ctx.stroke();
      // Valeur courante dans la puce de légende (texte en encre normale).
      s.valueEl.textContent = `${this.fmt(last.v, 3)}${s.unit ? ` ${s.unit}` : ''}`;
    }
    ctx.restore();

    this.drawCrosshair(ctx, w, h, padL, padR, padT, padB, tStart, tEnd, fg);
  }

  /** Réticule + info-bulle : valeurs de chaque série à l'instant survolé. */
  private drawCrosshair(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    padL: number,
    padR: number,
    padT: number,
    padB: number,
    tStart: number,
    tEnd: number,
    fg: string
  ): void {
    if (this.hoverX < padL || this.hoverX > w - padR) {
      this.tooltipEl.hidden = true;
      return;
    }
    const tm = tStart + ((this.hoverX - padL) / (w - padL - padR)) * (tEnd - tStart);
    ctx.strokeStyle = fg;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.hoverX, padT);
    ctx.lineTo(this.hoverX, h - padB);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const rows: string[] = [`<div class="plotter__tooltip-time">${this.fmt((tm - this.t0) / 1000, 2)} s</div>`];
    for (const s of this.series.values()) {
      if (!s.visible || s.pts.length === 0) continue;
      // Dernier point antérieur ou égal à l'instant pointé (recherche binaire).
      let lo = 0;
      let hi = s.pts.length - 1;
      if (s.pts[0]!.t > tm) continue;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (s.pts[mid]!.t <= tm) lo = mid;
        else hi = mid - 1;
      }
      const v = s.pts[lo]!.v;
      const esc = s.name.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      rows.push(
        `<div><span class="plotter__dot" style="background:${this.colorOf(s)}"></span>${esc} : ${this.fmt(v, 3)}${s.unit ? ` ${s.unit}` : ''}</div>`
      );
    }
    if (rows.length <= 1) {
      this.tooltipEl.hidden = true;
      return;
    }
    this.tooltipEl.innerHTML = rows.join('');
    this.tooltipEl.hidden = false;
    // Positionnée près du réticule, rabattue à gauche près du bord droit.
    const wrapW = this.canvas.clientWidth;
    const tipW = this.tooltipEl.offsetWidth;
    const left = this.hoverX + 12 + tipW > wrapW ? this.hoverX - tipW - 12 : this.hoverX + 12;
    this.tooltipEl.style.left = `${Math.max(0, left)}px`;
    this.tooltipEl.style.top = '8px';
  }

  // --- Export --------------------------------------------------------------

  /**
   * CSV au format long : temps (s depuis le départ) ; grandeur ; valeur ; unité.
   * Séparateur « ; » et virgule décimale en français (ouverture directe dans
   * Excel FR), sinon « , » et point décimal.
   */
  private toCsv(): string {
    const fr = (window.KABLIX_LANG ?? 'en').startsWith('fr');
    const sep = fr ? ';' : ',';
    const num = (n: number): string => {
      const s = String(n);
      return fr ? s.replace('.', ',') : s;
    };
    const lines = [
      fr ? `temps_s${sep}grandeur${sep}valeur${sep}unite` : `time_s${sep}name${sep}value${sep}unit`,
    ];
    for (const s of this.series.values()) {
      for (const p of s.pts) {
        lines.push(`${num((p.t - this.t0) / 1000)}${sep}${s.name}${sep}${num(p.v)}${sep}${s.unit}`);
      }
    }
    return lines.join('\n') + '\n';
  }
}
