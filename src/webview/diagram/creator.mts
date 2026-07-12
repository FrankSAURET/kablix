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
  CUSTOM_KINDS,
  getSimModelPresets,
  type CustomPartData,
  type CustomPin,
  type PartKind,
  type SimModelPreset,
} from './catalog.mjs';
import { analyzeMarkedSvg } from './svg-markers.mjs';
import { t } from '../i18n.mjs';

const DEFAULT_SVG = `<svg width="80" height="60" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="10" width="68" height="40" rx="6" fill="#3a6ea5" stroke="#1d3d5c" stroke-width="2"/>
  <text x="40" y="34" font-size="10" fill="#fff" text-anchor="middle">MODULE</text>
</svg>`;

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

  /** La liste des modèles importés a changé (à persister côté extension). */
  onModelsChange?: (models: SimModelPreset[]) => void;

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
          <label class="inspector__label">${t('Simulation model')}</label>
          <div class="creator__modelrow">
            <select id="cr-kind" class="inspector__control"></select>
            <button type="button" id="cr-model-import" title="${t('Import simulation models (.json)')}">⇪</button>
          </div>
          <div id="cr-roles"></div>
          <label class="inspector__label">${t('Connection points')}</label>
          <div id="cr-pins" class="creator__pins"></div>
          <p id="cr-note" class="inspector__hint"></p>
          <p class="inspector__hint">${t(
            'Markers: red circle (opacity 0.8) = pin, green circle (0.5) = alignment anchor, red text = pin name. They are removed from the final part.'
          )}</p>
        </div>
        <section class="creator__pane">
          <div class="creator__pane-head">
            <label class="inspector__label">${t('External view')}</label>
            <button type="button" id="cr-ext-pick">${t('Load an SVG…')}</button>
          </div>
          <div id="cr-preview-ext" class="creator__preview"></div>
          <p class="inspector__hint">${t('Click the preview to add a connection point.')}</p>
        </section>
        <section class="creator__pane">
          <div class="creator__pane-head">
            <label class="inspector__label">${t('Internal view')}</label>
            <button type="button" id="cr-int-pick">${t('Load an SVG…')}</button>
            <label class="creator__check"><input type="checkbox" id="cr-int-overlay" />${t('Overlay')}</label>
            <button type="button" id="cr-int-del" title="${t('Remove the internal view')}">✕</button>
          </div>
          <div id="cr-preview-int" class="creator__preview"></div>
          <p class="inspector__hint">${t('Same scale as the external drawing; the green anchor aligns both views.')}</p>
        </section>
      </div>
      <div class="creator__actions">
        <button id="cr-cancel">${t('Cancel')}</button>
        <button id="cr-save" class="primary">${t('Save')}</button>
      </div>
    `;

    document.body.appendChild(overlay);
    this.overlay = overlay;

    const nameInput = modal.querySelector('#cr-name') as HTMLInputElement;
    const kindSelect = modal.querySelector('#cr-kind') as HTMLSelectElement;

    this.fillKindSelect(kindSelect, existing?.kind);
    nameInput.value = existing?.label ?? '';

    const refresh = () => {
      this.renderPreviews(modal);
      this.renderPinsTable(modal);
      this.renderRoles(modal);
    };
    kindSelect.addEventListener('change', () => this.renderRoles(modal));

    // Clic sur l'aperçu externe : pose un point de connexion à cet endroit
    // (complément manuel de la détection ; coordonnées réelles = position écran
    // ramenée par le facteur de zoom).
    const extPreview = modal.querySelector('#cr-preview-ext') as HTMLDivElement;
    extPreview.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.pin')) return; // clic sur une pastille existante
      const inner = extPreview.firstElementChild as HTMLElement | null;
      const rect = (inner ?? extPreview).getBoundingClientRect();
      const x = Math.round((e.clientX - rect.left) / this.zoom);
      const y = Math.round((e.clientY - rect.top) / this.zoom);
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
      const attrs = baseAttrs || preset?.attrs ? { ...baseAttrs, ...preset?.attrs } : undefined;
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
      };
      this.close();
      this.onSave(data);
    });

    refresh();
    // Zoom d'accueil : remplit la zone une fois la fenêtre mise en page.
    requestAnimationFrame(() => fit());
  }

  close(): void {
    this.overlay?.remove();
    this.overlay = null;
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

  /** Selon le modèle choisi : à quel point correspond chaque rôle (anode…). */
  private renderRoles(modal: HTMLElement): void {
    const container = modal.querySelector('#cr-roles') as HTMLDivElement;
    container.replaceChildren();
    const { kind, preset } = this.selectedModel(modal.querySelector('#cr-kind') as HTMLSelectElement);
    const roles = CUSTOM_KINDS.find((k) => k.kind === kind)?.roles ?? [];
    for (const role of roles) {
      const label = document.createElement('label');
      label.className = 'inspector__label';
      label.textContent = t('Pin for role "{0}"', role);
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
      container.append(label, select);
    }
  }
}
