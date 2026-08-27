// Créateur de composants : fenêtre plein écran permettant de définir un composant
// personnalisé — nom, dessin SVG externe (chargé d'un fichier, broches détectées
// par les marqueurs rouges/vert), vue interne optionnelle (schéma) calée sur
// l'externe par l'ancre verte, et modèle de simulation (liste intégrée +
// préréglages importés d'un .json).
//
// Convention des SVG « marqués » (voir svg-markers.mts) :
// - cercle rouge rgb(255,0,0) opacité 0,8 centré sur chaque broche (externe) ;
// - cercle vert rgb(0,255,0) opacité 0,5 sur UNE broche, répété au même endroit
//   dans la vue interne → calage des deux vues (mêmes échelles exigées) ;
// - texte rouge près de chaque broche = son nom (deviendra l'infobulle) ;
// tous ces marqueurs sont retirés du composant final.
import {
  addSimModelPresets,
  CATEGORY_ORDER,
  CUSTOM_KINDS,
  getSimModelPresets,
  type CustomControl,
  type CustomParam,
  type CustomPartData,
  type CustomPin,
  type PartKind,
  type SimModelPreset,
} from './catalog.mjs';
import { analyzeMarkedSvg } from './svg-markers.mjs';
import { compileExpr } from './expr.mjs';
import { internalWiringSvg } from './internal-wiring.mjs';
import { PACKAGE_LABELS, PACKAGES, type TransistorPackage } from '../composants/transistor-element.mjs';
import { t } from '../i18n.mjs';

// Dessin de départ calé sur la grille de 10 px (comme tout composant Kablix) :
// coins sur des croisements, hauteur et largeur multiples du carreau.
const DEFAULT_SVG = `<svg width="80" height="60" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="10" width="60" height="40" rx="6" fill="#3a6ea5" stroke="#1d3d5c" stroke-width="2"/>
  <text x="40" y="34" font-size="10" fill="#fff" text-anchor="middle">MODULE</text>
</svg>`;

/** Feuille vierge envoyée à l'éditeur externe quand la vue interne est vide. */
const DEFAULT_INNER_SVG = `<svg width="80" height="60" xmlns="http://www.w3.org/2000/svg"></svg>`;

/** Largeur minimale d'une des trois zones (poignées de redimensionnement). */
const MIN_COL = 160;

/** Pas de la grille des aperçus, en pixels du composant (celui de l'éditeur). */
const GRID = 10;

/** Coordonnée ramenée au croisement de grille le plus proche. */
const snap10 = (v: number): number => Math.round(v / GRID) * GRID;

type XY = { x: number; y: number };

export class PartCreator {
  private overlay: HTMLDivElement | null = null;
  private pins: CustomPin[] = [];
  private existing: CustomPartData | null = null;
  /** Facteur de zoom des aperçus (les broches restent en coordonnées réelles). */
  private zoom = 1;
  /** SVG externe nettoyé (marqueurs retirés). */
  private svg = DEFAULT_SVG;
  /** SVG interne nettoyé, ou null (pas de vue interne). */
  private innerSvg: string | null = null;
  /** Ancres vertes mesurées à l'import (repères respectifs des deux SVG). */
  private extAnchor: XY | null = null;
  private intAnchor: XY | null = null;
  /** Superpose la vue interne sur l'aperçu externe (contrôle du calage). */
  private overlayInternal = false;
  /** Paramètres de définition (valeur nominale…) : inspecteur + constantes. */
  private params: CustomParam[] = [];
  /** Contrôle de simulation (curseur/interrupteur), ou null. */
  private control: CustomControl | null = null;
  /** Caractéristiques du modèle choisi (transistor : gain, Vce max, Ic max…). */
  private kindAttrs: Record<string, string> = {};
  /** Boîtier posé dans la vue externe, ou '' (dessin libre importé). */
  private pkg = '';
  /**
   * Largeur des trois zones, en pixels. Partagée par toutes les ouvertures de
   * la fenêtre : une disposition ajustée à la main ne se perd pas au premier
   * composant suivant.
   */
  private static cols: [number, number, number] | null = null;

  /** La liste des modèles importés a changé (à persister côté extension). */
  onModelsChange?: (models: SimModelPreset[]) => void;
  /** Ouverture d'un lien externe (formulaire GitHub de soumission). */
  onOpenExternal?: (url: string) => void;
  /** Ouverture d'un des deux dessins dans l'éditeur SVG par défaut du système. */
  onEditSvg?: (which: 'ext' | 'int', svg: string) => void;
  /** Fenêtre refermée : plus rien à surveiller côté extension. */
  onStopEditSvg?: () => void;

  constructor(private readonly onSave: (data: CustomPartData) => void) {}

  /** Ouvre la fenêtre (vide, ou pré-remplie pour modifier un composant). */
  open(existing?: CustomPartData): void {
    this.close();
    this.existing = existing ?? null;
    this.pins = existing ? existing.pins.map((p) => ({ ...p })) : [];
    this.zoom = 1;
    this.svg = existing?.svg ?? DEFAULT_SVG;
    this.innerSvg = existing?.innerSvg ?? null;
    this.extAnchor = existing?.extAnchor ?? null;
    this.intAnchor = existing?.intAnchor ?? null;
    this.overlayInternal = !!this.innerSvg;
    this.params = existing?.params ? existing.params.map((p) => ({ ...p })) : [];
    this.control = existing?.control ? { ...existing.control } : null;
    this.kindAttrs = { ...existing?.attrs };
    this.pkg = '';

    const overlay = document.createElement('div');
    overlay.className = 'creator__overlay';
    const modal = document.createElement('div');
    modal.className = 'creator creator--full';
    overlay.appendChild(modal);

    modal.innerHTML = `
      <div class="creator__head">
        <h3>${existing ? t('Edit the part') : t('Create a part')}</h3>
        <div class="creator__zoom">
          <button type="button" id="cr-zoom-out" title="${t('Zoom out')}">−</button>
          <span id="cr-zoom-label">100 %</span>
          <button type="button" id="cr-zoom-in" title="${t('Zoom in')}">+</button>
          <button type="button" id="cr-zoom-fit" title="${t('Fit the drawing in the view')}">⛶</button>
        </div>
      </div>
      <div class="creator__grid">
        <div class="creator__form">
          <label class="inspector__label">${t('Name')}</label>
          <input id="cr-name" class="inspector__control" type="text" placeholder="${t('My sensor')}" />
          <label class="inspector__label">${t('Category')}</label>
          <select id="cr-category" class="inspector__control">
            <option value="">${t('Custom parts')}</option>
            ${CATEGORY_ORDER.map((c) => `<option value="${c}">${t(c)}</option>`).join('')}
          </select>
          <label class="inspector__label">${t('Simulation model')}</label>
          <div class="creator__modelrow">
            <select id="cr-kind" class="inspector__control"></select>
            <button type="button" id="cr-model-import" title="${t('Import simulation models (.json)')}">⇪</button>
          </div>
          <div id="cr-roles"></div>
          <div class="creator__section-head">
            <label class="inspector__label">${t('Part parameters')}</label>
            <button type="button" id="cr-param-add" title="${t('Add a parameter (usable in the characteristic)')}">＋</button>
          </div>
          <div id="cr-params" class="creator__params"></div>
          <div class="creator__section-head">
            <label class="inspector__label">${t('Simulation control')}</label>
            <button type="button" id="cr-ctrl-add" title="${t('Add a simulation control (slider, switch)')}">＋</button>
          </div>
          <div id="cr-ctrl"></div>
          <label class="inspector__label">${t('Connection points')}</label>
          <div id="cr-pins" class="creator__pins"></div>
          <p id="cr-note" class="inspector__hint"></p>
          <p class="inspector__hint">${t(
            'Markers: red circle (opacity 0.8) = pin, green circle (0.5) = alignment anchor, red text = pin name. They are removed from the final part.'
          )}</p>
        </div>
        <div class="creator__gutter" data-gutter="0" title="${t('Drag to resize')}"></div>
        <section class="creator__pane">
          <div class="creator__pane-head">
            <label class="inspector__label">${t('External view')}</label>
            <button type="button" id="cr-ext-pick">${t('Load an SVG…')}</button>
            <button type="button" id="cr-ext-edit" title="${t(
              'Opens the drawing in the SVG editor of your choice (asked once, then remembered); it is reloaded here at every save.'
            )}">${t('Open in the SVG editor…')}</button>
          </div>
          <div id="cr-preview-ext" class="creator__preview"></div>
          <p class="inspector__hint">${t('Click the preview to add a connection point.')}</p>
        </section>
        <div class="creator__gutter" data-gutter="1" title="${t('Drag to resize')}"></div>
        <section class="creator__pane">
          <div class="creator__pane-head">
            <label class="inspector__label">${t('Internal view')}</label>
            <button type="button" id="cr-int-pick">${t('Load an SVG…')}</button>
            <button type="button" id="cr-int-edit" title="${t(
              'Opens the drawing in the SVG editor of your choice (asked once, then remembered); it is reloaded here at every save.'
            )}">${t('Open in the SVG editor…')}</button>
            <label class="creator__check"><input type="checkbox" id="cr-int-overlay" />${t('Overlay')}</label>
            <button type="button" id="cr-int-del" title="${t('Remove the internal view')}">✕</button>
          </div>
          <div id="cr-preview-int" class="creator__preview"></div>
          <p class="inspector__hint">${t('Same scale as the external drawing; the green anchor aligns both views.')}</p>
        </section>
      </div>
      <div class="creator__actions">
        <button id="cr-submit" class="creator__submit">${t('Submit to Kablix…')}</button>
        <button id="cr-cancel">${t('Cancel')}</button>
        <button id="cr-save" class="primary">${t('Save')}</button>
      </div>
    `;

    document.body.appendChild(overlay);
    this.overlay = overlay;

    const nameInput = modal.querySelector('#cr-name') as HTMLInputElement;
    const kindSelect = modal.querySelector('#cr-kind') as HTMLSelectElement;
    const categorySelect = modal.querySelector('#cr-category') as HTMLSelectElement;

    this.fillKindSelect(kindSelect, existing?.kind);
    nameInput.value = existing?.label ?? '';
    categorySelect.value = existing?.category ?? '';

    const refresh = () => {
      this.renderPreviews(modal);
      this.renderPinsTable(modal);
      this.renderRoles(modal);
    };
    kindSelect.addEventListener('change', () => this.renderRoles(modal));

    // --- Paramètres de définition + contrôle de simulation --------------------
    (modal.querySelector('#cr-param-add') as HTMLButtonElement).addEventListener('click', () => {
      this.params.push({ name: `P${this.params.length + 1}`, label: '', value: 0 });
      this.renderParams(modal);
      this.renderControlForm(modal);
    });
    // Un composant n'a le plus souvent RIEN à régler pendant la simulation : le
    // formulaire du contrôle n'apparaît qu'à la demande, comme un paramètre.
    (modal.querySelector('#cr-ctrl-add') as HTMLButtonElement).addEventListener('click', () => {
      this.control = { type: 'slider', min: 0, max: 100, step: 1 };
      this.renderControlForm(modal);
    });
    this.renderParams(modal);
    this.renderControlForm(modal);

    // Clic sur l'aperçu externe : pose un point de connexion à cet endroit
    // (complément manuel de la détection ; coordonnées réelles = position écran
    // ramenée par le facteur de zoom).
    const extPreview = modal.querySelector('#cr-preview-ext') as HTMLDivElement;
    extPreview.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.pin')) return; // clic sur une pastille existante
      const inner = extPreview.firstElementChild as HTMLElement | null;
      const rect = (inner ?? extPreview).getBoundingClientRect();
      // Accrochage sur la grille : une broche tombe TOUJOURS sur un croisement,
      // comme dans l'éditeur (pas de 10 px) — un fil s'y branche droit.
      const x = snap10((e.clientX - rect.left) / this.zoom);
      const y = snap10((e.clientY - rect.top) / this.zoom);
      this.pins.push({ name: `pin${this.pins.length + 1}`, x, y });
      refresh();
    });

    // --- Zoom partagé des deux aperçus --------------------------------------
    const applyZoom = (z: number) => {
      this.zoom = Math.min(6, Math.max(0.25, z));
      (modal.querySelector('#cr-zoom-label') as HTMLElement).textContent = `${Math.round(this.zoom * 100)} %`;
      this.renderPreviews(modal);
    };
    (modal.querySelector('#cr-zoom-in') as HTMLButtonElement).addEventListener('click', () => applyZoom(this.zoom * 1.25));
    (modal.querySelector('#cr-zoom-out') as HTMLButtonElement).addEventListener('click', () => applyZoom(this.zoom / 1.25));
    const fit = () => {
      const inner = extPreview.firstElementChild as HTMLElement | null;
      // scrollWidth/Height ignorent le transform → taille du dessin à l'échelle 1.
      const w = inner?.scrollWidth ?? 0;
      const h = inner?.scrollHeight ?? 0;
      if (w && h) applyZoom(Math.min((extPreview.clientWidth - 24) / w, (extPreview.clientHeight - 24) / h));
    };
    (modal.querySelector('#cr-zoom-fit') as HTMLButtonElement).addEventListener('click', fit);

    // --- Import des SVG externe / interne (sélecteur de fichier) -------------
    const pickSvg = (onLoaded: (r: ReturnType<typeof analyzeMarkedSvg>) => void) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.svg,image/svg+xml';
      input.style.display = 'none';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) return;
        void file.text().then((text) => {
          try {
            onLoaded(analyzeMarkedSvg(text));
          } catch {
            this.note(modal, t('Import failed: {0}', t('invalid SVG file.')), true);
          }
          refresh();
          fit();
        });
      });
      modal.appendChild(input);
      input.click();
    };
    (modal.querySelector('#cr-ext-pick') as HTMLButtonElement).addEventListener('click', () =>
      pickSvg((r) => {
        this.svg = r.svg;
        this.extAnchor = r.anchor;
        if (r.pins.length > 0) {
          this.pins = r.pins;
          this.note(modal, t('{0} pin(s) detected.', String(r.pins.length)));
        } else {
          this.note(modal, t('No red circle found — click the preview to place the pins.'), true);
        }
      })
    );
    (modal.querySelector('#cr-int-pick') as HTMLButtonElement).addEventListener('click', () =>
      pickSvg((r) => {
        this.innerSvg = r.svg;
        this.intAnchor = r.anchor;
        this.overlayInternal = true;
        (modal.querySelector('#cr-int-overlay') as HTMLInputElement).checked = true;
        if (!r.anchor || !this.extAnchor) {
          this.note(modal, t('Green anchor missing in one of the two views — top-left corners aligned.'), true);
        } else {
          this.note(modal, t('Internal view aligned on the green anchor.'));
        }
      })
    );
    // --- Retouche dans l'éditeur SVG du système -------------------------------
    // Le dessin part dans un fichier ; chaque ENREGISTREMENT le ramène ici (on
    // ne peut pas savoir quand Inkstape se ferme, mais on sait quand il écrit).
    (modal.querySelector('#cr-ext-edit') as HTMLButtonElement).addEventListener('click', () => {
      this.onEditSvg?.('ext', this.svg);
      this.note(modal, t('Drawing opened in your editor — it is reloaded at every save.'));
    });
    (modal.querySelector('#cr-int-edit') as HTMLButtonElement).addEventListener('click', () => {
      this.onEditSvg?.('int', this.innerSvg ?? DEFAULT_INNER_SVG);
      this.note(modal, t('Drawing opened in your editor — it is reloaded at every save.'));
    });

    const overlayCheck = modal.querySelector('#cr-int-overlay') as HTMLInputElement;
    overlayCheck.checked = this.overlayInternal;
    overlayCheck.addEventListener('change', () => {
      this.overlayInternal = overlayCheck.checked;
      this.renderPreviews(modal);
    });
    (modal.querySelector('#cr-int-del') as HTMLButtonElement).addEventListener('click', () => {
      this.innerSvg = null;
      this.intAnchor = null;
      this.overlayInternal = false;
      overlayCheck.checked = false;
      refresh();
    });

    // --- Import de préréglages de modèles (.json) -----------------------------
    (modal.querySelector('#cr-model-import') as HTMLButtonElement).addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.style.display = 'none';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) return;
        void file.text().then((text) => {
          try {
            const models = addSimModelPresets(JSON.parse(text));
            this.onModelsChange?.(models);
            this.fillKindSelect(kindSelect, kindSelect.value);
            this.note(modal, t('{0} model(s) available.', String(models.length)));
          } catch (err) {
            this.note(modal, t('Import failed: {0}', err instanceof Error ? err.message : String(err)), true);
          }
        });
      });
      modal.appendChild(input);
      input.click();
    });

    (modal.querySelector('#cr-cancel') as HTMLButtonElement).addEventListener('click', () => this.close());
    (modal.querySelector('#cr-save') as HTMLButtonElement).addEventListener('click', () => {
      const label = nameInput.value.trim();
      if (!label) {
        nameInput.focus();
        return;
      }
      const { kind, preset } = this.selectedModel(kindSelect);
      const pinRoles: Record<string, string> = { ...preset?.pinRoles };
      for (const sel of modal.querySelectorAll<HTMLSelectElement>('select[data-role]')) {
        if (sel.value) pinRoles[sel.dataset.role!] = sel.value;
      }
      const baseAttrs =
        kind === 'digital-source' ? { state: '0' }
        : kind === 'analog-source' ? { value: '50' }
        : undefined;
      // Caractéristiques saisies dans la zone du modèle (gain, Vce max…) : ce
      // sont elles que la simulation lira sur le composant posé.
      const kindAttrs = this.modelAttrs(kind);
      const attrs =
        baseAttrs || preset?.attrs || kindAttrs
          ? { ...baseAttrs, ...preset?.attrs, ...kindAttrs }
          : undefined;
      // Paramètres : nom identifiant valide + uniques (sinon inutilisables en
      // expression), les lignes vides sont ignorées silencieusement.
      const seen = new Set<string>();
      const params = this.params.filter((p) => {
        const ok = /^[A-Za-z_]\w*$/.test(p.name) && !seen.has(p.name) && Number.isFinite(p.value);
        seen.add(p.name);
        return ok;
      });
      const data: CustomPartData = {
        type: this.existing?.type ?? `custom-${Date.now().toString(36)}`,
        label,
        kind,
        svg: this.svg,
        pins: this.pins,
        pinRoles: Object.keys(pinRoles).length > 0 ? pinRoles : undefined,
        attrs,
        innerSvg: this.innerSvg ?? undefined,
        innerOffset: this.innerSvg ? this.innerOffset() : undefined,
        extAnchor: this.extAnchor ?? undefined,
        intAnchor: this.intAnchor ?? undefined,
        params: params.length > 0 ? params : undefined,
        control: this.control ?? undefined,
        category: categorySelect.value || undefined,
      };
      this.close();
      this.onSave(data);
    });

    // « Soumettre à Kablix » : petite fenêtre expliquant comment envoyer le
    // composant à Frank — export .json puis issue GitHub (modèle « Submit new
    // component », lien direct) ou pull request.
    (modal.querySelector('#cr-submit') as HTMLButtonElement).addEventListener('click', () => {
      const box = document.createElement('div');
      box.className = 'creator__overlay';
      box.innerHTML = `
        <div class="creator creator--submit">
          <h3>${t('Share your component')}</h3>
          <p>${t('Export the component as .json (⇩ button next to it in the palette), then send it:')}</p>
          <ul>
            <li>${t('open a GitHub issue with the “Submit new component” template and attach the .json;')}</li>
            <li>${t('or propose a pull request on the Kablix repository.')}</li>
          </ul>
          <div class="creator__actions">
            <button id="cr-submit-close">${t('Close')}</button>
            <button id="cr-submit-open" class="primary">${t('Open the GitHub form')}</button>
          </div>
        </div>`;
      overlay.appendChild(box);
      (box.querySelector('#cr-submit-close') as HTMLButtonElement).addEventListener('click', () => box.remove());
      (box.querySelector('#cr-submit-open') as HTMLButtonElement).addEventListener('click', () => {
        this.onOpenExternal?.('https://github.com/FrankSAURET/kablix/issues/new?template=submit-new-component.md');
      });
    });

    this.setupGutters(modal);
    refresh();
    // Zoom d'accueil : remplit la zone une fois la fenêtre mise en page.
    requestAnimationFrame(() => fit());
  }

  close(): void {
    this.overlay?.remove();
    this.overlay = null;
    this.onStopEditSvg?.();
  }

  /**
   * Poignées de redimensionnement entre les trois zones : glisser déplace la
   * frontière, les deux zones voisines se partageant la largeur (le reste de la
   * fenêtre ne bouge pas). La disposition survit à la fermeture de la fenêtre.
   */
  private setupGutters(modal: HTMLElement): void {
    const grid = modal.querySelector('.creator__grid') as HTMLElement;
    const apply = (): void => {
      const c = PartCreator.cols;
      if (c) grid.style.gridTemplateColumns = `${c[0]}px 6px ${c[1]}px 6px ${c[2]}px`;
    };
    // Première ouverture (ou fenêtre devenue trop étroite) : formulaire à sa
    // largeur d'origine, les deux aperçus se partagent le reste.
    const layout = (): void => {
      // Largeur disponible : la fenêtre moins les deux poignées et les écarts.
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
      const total = grid.clientWidth - 12 - 4 * gap;
      const c = PartCreator.cols;
      if (total > 0 && (!c || Math.abs(c[0] + c[1] + c[2] - total) > 2)) {
        const form = Math.min(c?.[0] ?? 280, Math.max(MIN_COL, total - 2 * MIN_COL));
        const rest = Math.max(MIN_COL, (total - form) / 2);
        PartCreator.cols = [form, rest, rest];
      }
      apply();
    };
    requestAnimationFrame(layout);

    for (const gutter of modal.querySelectorAll<HTMLElement>('.creator__gutter')) {
      const i = Number(gutter.dataset.gutter); // 0 = formulaire/externe, 1 = externe/interne
      gutter.addEventListener('pointerdown', (e) => {
        if (!PartCreator.cols) layout(); // mise en page pas encore mesurée
        const cols = PartCreator.cols;
        if (!cols) return;
        e.preventDefault();
        try {
          gutter.setPointerCapture(e.pointerId);
        } catch {
          // Pointeur synthétique (bancs de test) : le suivi marche sans capture.
        }
        const x0 = e.clientX;
        const a0 = cols[i];
        const b0 = cols[i + 1];
        const move = (ev: PointerEvent): void => {
          // Somme constante : seule la frontière bouge, jamais la largeur totale.
          const d = Math.max(MIN_COL - a0, Math.min(b0 - MIN_COL, ev.clientX - x0));
          cols[i] = a0 + d;
          cols[i + 1] = b0 - d;
          apply();
        };
        const up = (): void => {
          gutter.removeEventListener('pointermove', move);
          gutter.removeEventListener('pointerup', up);
        };
        gutter.addEventListener('pointermove', move);
        gutter.addEventListener('pointerup', up);
      });
    }
  }

  /** Coin haut-gauche de la vue interne dans le repère externe (calage vert). */
  private innerOffset(): XY {
    if (this.extAnchor && this.intAnchor) {
      return { x: this.extAnchor.x - this.intAnchor.x, y: this.extAnchor.y - this.intAnchor.y };
    }
    return this.existing?.innerOffset ?? { x: 0, y: 0 };
  }

  /** Modèle sélectionné : kind de base + préréglage importé éventuel. */
  private selectedModel(select: HTMLSelectElement): { kind: PartKind; preset: SimModelPreset | null } {
    const v = select.value;
    if (v.startsWith('preset:')) {
      const preset = getSimModelPresets()[Number(v.slice(7))];
      if (preset) return { kind: preset.kind, preset };
    }
    return { kind: v as PartKind, preset: null };
  }

  /** (Re)remplit la liste des modèles : intégrés puis préréglages importés. */
  private fillKindSelect(select: HTMLSelectElement, selected?: string): void {
    select.replaceChildren();
    for (const k of CUSTOM_KINDS) {
      const o = document.createElement('option');
      o.value = k.kind;
      o.textContent = t(k.label);
      select.appendChild(o);
    }
    const presets = getSimModelPresets();
    if (presets.length > 0) {
      const group = document.createElement('optgroup');
      group.label = t('Imported models');
      presets.forEach((p, i) => {
        const o = document.createElement('option');
        o.value = `preset:${i}`;
        o.textContent = p.label;
        group.appendChild(o);
      });
      select.appendChild(group);
    }
    select.value = selected && [...select.options].some((o) => o.value === selected) ? selected : select.value || 'led';
    if (!select.value) select.value = 'led';
  }

  /** Message d'état (imports, détection) dans la colonne de gauche. */
  private note(modal: HTMLElement, message: string, isError = false): void {
    const note = modal.querySelector('#cr-note') as HTMLElement;
    note.textContent = message;
    note.style.color = isError ? '#ff8a8a' : '';
  }

  /** Redessine les deux aperçus (externe avec pastilles, interne, superposition). */
  private renderPreviews(modal: HTMLElement): void {
    const ext = modal.querySelector('#cr-preview-ext') as HTMLDivElement;
    const int = modal.querySelector('#cr-preview-int') as HTMLDivElement;

    // Un carreau vaut 10 px du COMPOSANT : le pas dessiné suit donc le zoom, et
    // le coin haut-gauche du dessin (0,0) tombe sur un croisement.
    const step = `${GRID * this.zoom}px ${GRID * this.zoom}px`;
    ext.style.backgroundSize = step;
    int.style.backgroundSize = step;

    // Conteneur interne mis à l'échelle (zoom) : le SVG et les pastilles vivent
    // en coordonnées réelles, le zoom n'est qu'un transform d'affichage.
    const makeInner = (svg: string): HTMLDivElement => {
      const inner = document.createElement('div');
      inner.className = 'creator__preview-inner';
      inner.style.transform = `scale(${this.zoom})`;
      inner.style.transformOrigin = 'top left';
      inner.innerHTML = svg;
      return inner;
    };
    const anchorDot = (p: XY): HTMLDivElement => {
      const dot = document.createElement('div');
      dot.className = 'creator__anchor';
      dot.style.left = `${p.x}px`;
      dot.style.top = `${p.y}px`;
      dot.title = t('Alignment anchor');
      return dot;
    };

    // Aperçu externe : dessin + pastilles de broches + ancre + superposition.
    const extInner = makeInner(this.svg);
    for (const pin of this.pins) {
      const dot = document.createElement('div');
      dot.className = 'pin';
      dot.style.left = `${pin.x}px`;
      dot.style.top = `${pin.y}px`;
      dot.title = pin.name;
      extInner.appendChild(dot);
    }
    if (this.extAnchor) extInner.appendChild(anchorDot(this.extAnchor));
    if (this.overlayInternal && this.innerSvg) {
      const off = this.innerOffset();
      const ov = document.createElement('div');
      ov.className = 'creator__internal-overlay';
      ov.style.left = `${off.x}px`;
      ov.style.top = `${off.y}px`;
      ov.innerHTML = this.innerSvg;
      extInner.appendChild(ov);
    }
    ext.replaceChildren(extInner);

    // Aperçu interne : dessin + ancre, ou invite si aucun SVG chargé.
    if (this.innerSvg) {
      const intInner = makeInner(this.innerSvg);
      if (this.intAnchor) intInner.appendChild(anchorDot(this.intAnchor));
      int.replaceChildren(intInner);
    } else {
      const hint = document.createElement('p');
      hint.className = 'inspector__hint creator__empty';
      hint.textContent = t('No internal view — load an SVG (optional).');
      int.replaceChildren(hint);
    }
  }

  /** Table des paramètres de définition : nom (identifiant), libellé, valeur. */
  private renderParams(modal: HTMLElement): void {
    const container = modal.querySelector('#cr-params') as HTMLDivElement;
    container.replaceChildren();
    this.params.forEach((param, i) => {
      const row = document.createElement('div');
      row.className = 'creator__pinrow';
      const mk = (
        key: 'name' | 'label' | 'value',
        placeholder: string,
        cls = ''
      ): HTMLInputElement => {
        const input = document.createElement('input');
        input.className = `inspector__control ${cls}`.trim();
        input.placeholder = placeholder;
        input.title = placeholder;
        if (key === 'value') input.type = 'number';
        input.value = String(param[key]);
        input.addEventListener('change', () => {
          if (key === 'value') param.value = Number(input.value) || 0;
          else param[key] = input.value.trim();
          // Le nom sert de variable : signale tout de suite s'il est invalide.
          if (key === 'name') {
            input.style.borderColor = /^[A-Za-z_]\w*$/.test(param.name) ? '' : '#ff8a8a';
            this.renderControlForm(modal);
          }
        });
        return input;
      };
      const del = document.createElement('button');
      del.textContent = '✕';
      del.title = t('Delete this parameter');
      del.addEventListener('click', () => {
        this.params.splice(i, 1);
        this.renderParams(modal);
        this.renderControlForm(modal);
      });
      row.append(mk('name', t('name'), 'creator__coord'), mk('label', t('label')), mk('value', t('value'), 'creator__coord'), del);
      container.appendChild(row);
    });
  }

  /** Formulaire du contrôle de simulation selon son type (curseur/interrupteur). */
  private renderControlForm(modal: HTMLElement): void {
    const container = modal.querySelector('#cr-ctrl') as HTMLDivElement;
    container.replaceChildren();
    const add = modal.querySelector('#cr-ctrl-add') as HTMLButtonElement | null;
    const ctrl = this.control;
    // Un seul contrôle par composant : le ＋ s'efface tant qu'il en existe un.
    if (add) add.style.visibility = ctrl ? 'hidden' : '';
    if (!ctrl) return;
    const row = (label: string, input: HTMLElement): void => {
      const wrap = document.createElement('div');
      wrap.className = 'creator__ctrlrow';
      const lab = document.createElement('label');
      lab.className = 'inspector__label';
      lab.textContent = label;
      wrap.append(lab, input);
      container.appendChild(wrap);
    };

    // Type du contrôle + retrait, en tête de son propre formulaire.
    const typeRow = document.createElement('div');
    typeRow.className = 'creator__ctrlrow creator__ctrlrow--type';
    const typeLab = document.createElement('label');
    typeLab.className = 'inspector__label';
    typeLab.textContent = t('Type');
    const typeSel = document.createElement('select');
    typeSel.id = 'cr-ctrl-type';
    typeSel.className = 'inspector__control';
    for (const [value, label] of [
      ['slider', t('Slider (analog output)')],
      ['switch', t('Switch (digital output)')],
    ] as const) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      typeSel.appendChild(o);
    }
    typeSel.value = ctrl.type;
    typeSel.addEventListener('change', () => {
      this.control =
        typeSel.value === 'switch'
          ? { type: 'switch', label: ctrl.label }
          : {
              type: 'slider',
              label: ctrl.label,
              unit: ctrl.unit,
              min: ctrl.min ?? 0,
              max: ctrl.max ?? 100,
              step: ctrl.step ?? 1,
              expr: ctrl.expr,
              maxParam: ctrl.maxParam,
            };
      this.renderControlForm(modal);
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.id = 'cr-ctrl-del';
    del.textContent = '✕';
    del.title = t('Remove the simulation control');
    del.addEventListener('click', () => {
      this.control = null;
      this.renderControlForm(modal);
    });
    typeRow.append(typeLab, typeSel, del);
    container.appendChild(typeRow);
    const text = (value: string, onChange: (v: string) => void): HTMLInputElement => {
      const input = document.createElement('input');
      input.className = 'inspector__control';
      input.value = value;
      input.addEventListener('change', () => onChange(input.value.trim()));
      return input;
    };
    const num = (value: number | undefined, onChange: (v: number) => void): HTMLInputElement => {
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'inspector__control';
      input.value = value === undefined ? '' : String(value);
      input.addEventListener('change', () => {
        const v = Number(input.value);
        if (Number.isFinite(v)) onChange(v);
      });
      return input;
    };
    row(t('Control label'), text(ctrl.label ?? '', (v) => (ctrl.label = v || undefined)));
    if (ctrl.type === 'slider') {
      row(t('Unit'), text(ctrl.unit ?? '', (v) => (ctrl.unit = v || undefined)));
      row(t('Min'), num(ctrl.min, (v) => (ctrl.min = v)));
      row(t('Max'), num(ctrl.max, (v) => (ctrl.max = v)));
      row(t('Step'), num(ctrl.step, (v) => (ctrl.step = v)));
      // Caractéristique : tension de sortie en volts, f(x, paramètres). Validée
      // en direct — vide = rampe linéaire min→max → 0→Vref.
      const exprInput = document.createElement('input');
      exprInput.className = 'inspector__control';
      exprInput.value = ctrl.expr ?? '';
      exprInput.placeholder = t('linear (min→max)');
      const note = document.createElement('p');
      note.className = 'inspector__hint';
      const validate = (): void => {
        const src = exprInput.value.trim();
        ctrl.expr = src || undefined;
        if (!src) {
          note.textContent = t('Output voltage in volts — empty = linear ramp. Variables: x{0}.', this.exprVarsHint());
          note.style.color = '';
          return;
        }
        try {
          compileExpr(src, ['x', ...this.params.map((p) => p.name)]);
          note.textContent = t('Valid expression. Variables: x{0}.', this.exprVarsHint());
          note.style.color = '';
        } catch (err) {
          note.textContent = t('Invalid expression: {0}', err instanceof Error ? err.message : String(err));
          note.style.color = '#ff8a8a';
        }
      };
      exprInput.addEventListener('input', validate);
      validate();
      row(t('Characteristic (V)'), exprInput);
      container.appendChild(note);
    }
  }

  /** Liste des variables disponibles dans une expression (pour les messages). */
  private exprVarsHint(): string {
    const names = this.params.map((p) => p.name).filter((n) => /^[A-Za-z_]\w*$/.test(n));
    return names.length > 0 ? `, ${names.join(', ')}` : '';
  }

  private renderPinsTable(modal: HTMLElement): void {
    const container = modal.querySelector('#cr-pins') as HTMLDivElement;
    container.replaceChildren();
    this.pins.forEach((pin, i) => {
      const row = document.createElement('div');
      row.className = 'creator__pinrow';
      const name = document.createElement('input');
      name.className = 'inspector__control';
      name.value = pin.name;
      name.addEventListener('change', () => {
        pin.name = name.value.trim() || pin.name;
        this.renderPreviews(modal);
        this.renderRoles(modal);
      });
      // Coordonnées éditables directement (en plus du clic sur l'aperçu).
      const coords = document.createElement('span');
      coords.className = 'creator__pincoords';
      const mkCoord = (axis: 'x' | 'y'): HTMLInputElement => {
        const input = document.createElement('input');
        input.type = 'number';
        input.step = String(GRID); // les flèches sautent de carreau en carreau
        input.className = 'inspector__control creator__coord';
        input.value = String(pin[axis]);
        input.title = axis.toUpperCase();
        input.addEventListener('input', () => {
          const v = Math.round(Number(input.value));
          if (Number.isFinite(v)) {
            pin[axis] = v;
            this.renderPreviews(modal);
          }
        });
        return input;
      };
      coords.append(mkCoord('x'), mkCoord('y'));
      const del = document.createElement('button');
      del.textContent = '✕';
      del.title = t('Delete this point');
      del.addEventListener('click', () => {
        this.pins.splice(i, 1);
        this.renderPreviews(modal);
        this.renderPinsTable(modal);
        this.renderRoles(modal);
      });
      row.append(name, coords, del);
      container.appendChild(row);
    });
    if (this.pins.length === 0) {
      const hint = document.createElement('p');
      hint.className = 'inspector__hint';
      hint.textContent = t('No point — click the preview.');
      container.appendChild(hint);
    }
  }

  /**
   * Zone du modèle de simulation : une LIGNE par rôle (l'électrode à gauche, la
   * patte à droite) puis les caractéristiques propres au modèle. Empilées, les
   * trois électrodes d'un transistor se lisent d'un coup d'œil au lieu de tenir
   * six lignes de libellés pleine largeur.
   */
  private renderRoles(modal: HTMLElement): void {
    const container = modal.querySelector('#cr-roles') as HTMLDivElement;
    container.replaceChildren();
    const { kind, preset } = this.selectedModel(modal.querySelector('#cr-kind') as HTMLSelectElement);
    const roles = CUSTOM_KINDS.find((k) => k.kind === kind)?.roles ?? [];
    const row = (label: string, title: string, control: HTMLElement): void => {
      const wrap = document.createElement('div');
      wrap.className = 'creator__ctrlrow';
      const lab = document.createElement('label');
      lab.className = 'inspector__label';
      lab.textContent = label;
      lab.title = title;
      wrap.append(lab, control);
      container.appendChild(wrap);
    };
    for (const role of roles) {
      const select = document.createElement('select');
      select.className = 'inspector__control';
      select.dataset.role = role;
      const wanted = preset?.pinRoles?.[role] ?? this.existing?.pinRoles?.[role];
      for (const pin of this.pins) {
        const o = document.createElement('option');
        o.value = pin.name;
        o.textContent = pin.name;
        if (wanted === pin.name || (!wanted && pin.name === role)) o.selected = true;
        select.appendChild(o);
      }
      row(role, t('Pin for role "{0}"', role), select);
    }
    if (kind === 'transistor') this.renderTransistorFields(modal, row);
  }

  /**
   * Caractéristiques d'un transistor : Vce max, gain, Ic max, puis le BOÎTIER
   * (qui devient la vue externe, dessiné par le vrai composant, inscription
   * comprise) et le SYMBOLE NPN/PNP (qui devient la vue interne).
   */
  private renderTransistorFields(
    modal: HTMLElement,
    row: (label: string, title: string, control: HTMLElement) => void
  ): void {
    const num = (key: string, fallback: string, step: string): HTMLInputElement => {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = step;
      input.className = 'inspector__control';
      input.dataset.attr = key;
      input.value = this.kindAttrs[key] ?? fallback;
      this.kindAttrs[key] = input.value;
      input.addEventListener('change', () => {
        this.kindAttrs[key] = input.value.trim() || fallback;
      });
      return input;
    };
    row(t('Max Vce (V)'), t('Maximum collector-emitter voltage'), num('vcemax', '40', '1'));
    row(t('Current gain (β)'), t('Current gain: Ic = β × Ib once saturated'), num('gain', '100', '10'));
    row(t('Max Ic (A)'), t('Maximum collector current'), num('icmax', '0.6', '0.1'));

    const pkgSelect = document.createElement('select');
    pkgSelect.className = 'inspector__control';
    pkgSelect.id = 'cr-pkg';
    for (const [value, label] of [['', t('Free drawing')], ...Object.entries(PACKAGE_LABELS)]) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      pkgSelect.appendChild(o);
    }
    pkgSelect.value = this.pkg;
    pkgSelect.addEventListener('change', () => {
      this.pkg = pkgSelect.value;
      if (this.pkg) void this.applyTransistorPackage(modal);
    });
    row(t('Package'), t('Draws the package in the external view, pins included'), pkgSelect);

    const symSelect = document.createElement('select');
    symSelect.className = 'inspector__control';
    symSelect.id = 'cr-symbol';
    for (const [value, label] of [['npn', 'NPN'], ['pnp', 'PNP']]) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      symSelect.appendChild(o);
    }
    symSelect.value = this.kindAttrs.symbol ?? 'npn';
    this.kindAttrs.symbol = symSelect.value;
    symSelect.addEventListener('change', () => {
      this.kindAttrs.symbol = symSelect.value;
      this.applyTransistorSymbol(modal);
    });
    row(t('Symbol'), t('Draws the symbol in the internal view'), symSelect);
  }

  /** Caractéristiques à embarquer dans le composant selon le modèle choisi. */
  private modelAttrs(kind: PartKind): Record<string, string> | undefined {
    if (kind !== 'transistor') return undefined;
    return {
      symbol: this.kindAttrs.symbol ?? 'npn',
      gain: this.kindAttrs.gain ?? '100',
      vcemax: this.kindAttrs.vcemax ?? '40',
      icmax: this.kindAttrs.icmax ?? '0.6',
    };
  }

  /**
   * Pose le boîtier choisi dans la vue externe. Le dessin est produit par le
   * VRAI composant `kablix-transistor` : inscription (le nom saisi), police et
   * position des pattes viennent de lui, jamais d'une copie du calage.
   */
  private async applyTransistorPackage(modal: HTMLElement): Promise<void> {
    const pkg = this.pkg as TransistorPackage;
    if (!PACKAGES[pkg]) return;
    const el = document.createElement('kablix-transistor') as HTMLElement & {
      updateComplete?: Promise<unknown>;
      pinInfo?: { name: string; x: number; y: number }[];
      pkg?: string;
      symbol?: string;
      text?: string;
    };
    el.pkg = pkg;
    el.symbol = this.kindAttrs.symbol ?? 'npn';
    el.text = this.markingLines(modal);
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    await el.updateComplete;
    const src = el.shadowRoot?.querySelector('svg');
    if (src) {
      // Le dessin quitte le shadow DOM : la police de l'inscription le suit,
      // sans quoi le texte partirait à gauche du boîtier.
      this.svg = src.outerHTML.replace(
        /^(<svg[^>]*>)/,
        `$1<style>text{font-family:'OCR A Std','Consolas',monospace;text-anchor:middle}</style>`
      );
      this.pins = (el.pinInfo ?? []).map((p) => ({ name: p.name, x: p.x, y: p.y }));
      this.extAnchor = null;
    }
    el.remove();
    this.applyTransistorSymbol(modal);
    // Les pattes du boîtier viennent d'arriver : les rôles E/B/C peuvent enfin
    // les viser.
    this.renderRoles(modal);
    this.note(modal, t('Package “{0}” drawn — {1} pin(s).', PACKAGE_LABELS[pkg], String(this.pins.length)));
  }

  /** Pose le symbole NPN/PNP dans la vue interne, à la taille du dessin externe. */
  private applyTransistorSymbol(modal: HTMLElement): void {
    const box = this.extSize();
    const inner = internalWiringSvg(
      'transistor',
      this.pins,
      { symbol: this.kindAttrs.symbol ?? 'npn' },
      'transistor',
      box
    );
    if (!inner) return;
    this.innerSvg =
      `<svg width="${box.w}" height="${box.h}" viewBox="0 0 ${box.w} ${box.h}" xmlns="http://www.w3.org/2000/svg">` +
      `<g fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g></svg>`;
    // Même repère que l'externe (le symbole est dessiné à sa taille) : les deux
    // vues se superposent sans ancre verte.
    this.intAnchor = null;
    this.overlayInternal = true;
    const check = modal.querySelector('#cr-int-overlay') as HTMLInputElement | null;
    if (check) check.checked = true;
    this.renderPreviews(modal);
    this.renderPinsTable(modal);
  }

  /** Taille du dessin externe (attributs width/height, à défaut le viewBox). */
  private extSize(): { w: number; h: number } {
    const doc = new DOMParser().parseFromString(this.svg, 'image/svg+xml');
    const svg = doc.documentElement;
    const w = parseFloat(svg.getAttribute('width') ?? '');
    const h = parseFloat(svg.getAttribute('height') ?? '');
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { w, h };
    const vb = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
    return vb.length === 4 && vb[2] > 0 ? { w: vb[2], h: vb[3] } : { w: 50, h: 50 };
  }

  /** Nom saisi découpé en lignes d'inscription (un mot par ligne, 3 au plus). */
  private markingLines(modal: HTMLElement): string {
    const name = (modal.querySelector('#cr-name') as HTMLInputElement | null)?.value.trim() ?? '';
    return name.split(/\s+/).filter(Boolean).slice(0, 3).join('\n');
  }

  /**
   * Dessin revenu de l'éditeur externe (le fichier vient d'être enregistré) :
   * marqueurs relus au passage — des pastilles rouges ajoutées dans Inkscape
   * deviennent des broches, un dessin sans marqueur garde celles déjà posées.
   */
  applyEditedSvg(which: 'ext' | 'int', text: string): void {
    const modal = this.overlay?.querySelector('.creator') as HTMLElement | null;
    if (!modal) return;
    let r: ReturnType<typeof analyzeMarkedSvg>;
    try {
      r = analyzeMarkedSvg(text);
    } catch {
      this.note(modal, t('Import failed: {0}', t('invalid SVG file.')), true);
      return;
    }
    if (which === 'ext') {
      this.svg = r.svg;
      if (r.anchor) this.extAnchor = r.anchor;
      if (r.pins.length > 0) this.pins = r.pins;
    } else {
      this.innerSvg = r.svg;
      if (r.anchor) this.intAnchor = r.anchor;
    }
    this.note(modal, t('Drawing updated from the external editor.'));
    this.renderPreviews(modal);
    this.renderPinsTable(modal);
    this.renderRoles(modal);
  }
}
