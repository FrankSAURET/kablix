// Créateur de composants : fenêtre modale permettant de définir un composant
// personnalisé — nom, dessin SVG, points de connexion (posés en cliquant
// l'aperçu) et modèle de simulation (LED, bouton, résistance, buzzer, source
// numérique/analogique ou décoratif).
import { CUSTOM_KINDS, type CustomPartData, type CustomPin, type PartKind } from './catalog.mjs';

const DEFAULT_SVG = `<svg width="80" height="60" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="10" width="68" height="40" rx="6" fill="#3a6ea5" stroke="#1d3d5c" stroke-width="2"/>
  <text x="40" y="34" font-size="10" fill="#fff" text-anchor="middle">MODULE</text>
</svg>`;

export class PartCreator {
  private overlay: HTMLDivElement | null = null;
  private pins: CustomPin[] = [];
  private existing: CustomPartData | null = null;

  constructor(private readonly onSave: (data: CustomPartData) => void) {}

  /** Ouvre la modale (vide, ou pré-remplie pour modifier un composant). */
  open(existing?: CustomPartData): void {
    this.close();
    this.existing = existing ?? null;
    this.pins = existing ? existing.pins.map((p) => ({ ...p })) : [];

    const overlay = document.createElement('div');
    overlay.className = 'creator__overlay';
    const modal = document.createElement('div');
    modal.className = 'creator';
    overlay.appendChild(modal);

    modal.innerHTML = `
      <h3>${existing ? 'Modifier le composant' : 'Créer un composant'}</h3>
      <div class="creator__grid">
        <div class="creator__form">
          <label class="inspector__label">Nom</label>
          <input id="cr-name" class="inspector__control" type="text" placeholder="Mon capteur" />
          <label class="inspector__label">Modèle de simulation</label>
          <select id="cr-kind" class="inspector__control"></select>
          <div id="cr-roles"></div>
          <label class="inspector__label">Dessin SVG</label>
          <textarea id="cr-svg" class="creator__svg" spellcheck="false"></textarea>
          <p class="inspector__hint">Cliquez l'aperçu pour poser un point de connexion.</p>
        </div>
        <div class="creator__side">
          <label class="inspector__label">Aperçu</label>
          <div id="cr-preview" class="creator__preview"></div>
          <label class="inspector__label">Points de connexion</label>
          <div id="cr-pins" class="creator__pins"></div>
        </div>
      </div>
      <div class="creator__actions">
        <button id="cr-cancel">Annuler</button>
        <button id="cr-save" class="primary">Enregistrer</button>
      </div>
    `;

    document.body.appendChild(overlay);
    this.overlay = overlay;

    const nameInput = modal.querySelector('#cr-name') as HTMLInputElement;
    const kindSelect = modal.querySelector('#cr-kind') as HTMLSelectElement;
    const svgArea = modal.querySelector('#cr-svg') as HTMLTextAreaElement;
    const preview = modal.querySelector('#cr-preview') as HTMLDivElement;

    for (const k of CUSTOM_KINDS) {
      const o = document.createElement('option');
      o.value = k.kind;
      o.textContent = k.label;
      kindSelect.appendChild(o);
    }
    nameInput.value = existing?.label ?? '';
    kindSelect.value = existing?.kind ?? 'led';
    svgArea.value = existing?.svg ?? DEFAULT_SVG;

    const refresh = () => {
      this.renderPreview(preview, svgArea.value);
      this.renderPinsTable(modal);
      this.renderRoles(modal, kindSelect.value as PartKind);
    };
    svgArea.addEventListener('input', () => this.renderPreview(preview, svgArea.value));
    kindSelect.addEventListener('change', () => this.renderRoles(modal, kindSelect.value as PartKind));

    // Clic sur l'aperçu : pose un point de connexion à cet endroit.
    preview.addEventListener('pointerdown', (e) => {
      const rect = preview.getBoundingClientRect();
      const x = Math.round(e.clientX - rect.left);
      const y = Math.round(e.clientY - rect.top);
      this.pins.push({ name: `pin${this.pins.length + 1}`, x, y });
      refresh();
    });

    (modal.querySelector('#cr-cancel') as HTMLButtonElement).addEventListener('click', () => this.close());
    (modal.querySelector('#cr-save') as HTMLButtonElement).addEventListener('click', () => {
      const label = nameInput.value.trim();
      if (!label) {
        nameInput.focus();
        return;
      }
      const kind = kindSelect.value as PartKind;
      const pinRoles: Record<string, string> = {};
      for (const sel of modal.querySelectorAll<HTMLSelectElement>('select[data-role]')) {
        if (sel.value) pinRoles[sel.dataset.role!] = sel.value;
      }
      const data: CustomPartData = {
        type: this.existing?.type ?? `custom-${Date.now().toString(36)}`,
        label,
        kind,
        svg: svgArea.value,
        pins: this.pins,
        pinRoles: Object.keys(pinRoles).length > 0 ? pinRoles : undefined,
        attrs:
          kind === 'digital-source' ? { state: '0' }
          : kind === 'analog-source' ? { value: '50' }
          : undefined,
      };
      this.close();
      this.onSave(data);
    });

    refresh();
  }

  close(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  private renderPreview(preview: HTMLDivElement, svg: string): void {
    preview.innerHTML = svg;
    // Pastilles des broches déjà posées.
    for (const pin of this.pins) {
      const dot = document.createElement('div');
      dot.className = 'pin';
      dot.style.left = `${pin.x}px`;
      dot.style.top = `${pin.y}px`;
      dot.title = pin.name;
      preview.appendChild(dot);
    }
  }

  private renderPinsTable(modal: HTMLDivElement): void {
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
        this.renderRoles(modal, (modal.querySelector('#cr-kind') as HTMLSelectElement).value as PartKind);
      });
      const coords = document.createElement('span');
      coords.className = 'inspector__hint';
      coords.textContent = `(${pin.x}, ${pin.y})`;
      const del = document.createElement('button');
      del.textContent = '✕';
      del.title = 'Supprimer ce point';
      del.addEventListener('click', () => {
        this.pins.splice(i, 1);
        const preview = modal.querySelector('#cr-preview') as HTMLDivElement;
        const svgArea = modal.querySelector('#cr-svg') as HTMLTextAreaElement;
        this.renderPreview(preview, svgArea.value);
        this.renderPinsTable(modal);
      });
      row.append(name, coords, del);
      container.appendChild(row);
    });
    if (this.pins.length === 0) {
      const hint = document.createElement('p');
      hint.className = 'inspector__hint';
      hint.textContent = 'Aucun point — cliquez l’aperçu.';
      container.appendChild(hint);
    }
  }

  /** Selon le modèle choisi : à quel point correspond chaque rôle (anode…). */
  private renderRoles(modal: HTMLDivElement, kind: PartKind): void {
    const container = modal.querySelector('#cr-roles') as HTMLDivElement;
    container.replaceChildren();
    const roles = CUSTOM_KINDS.find((k) => k.kind === kind)?.roles ?? [];
    for (const role of roles) {
      const label = document.createElement('label');
      label.className = 'inspector__label';
      label.textContent = `Broche pour le rôle « ${role} »`;
      const select = document.createElement('select');
      select.className = 'inspector__control';
      select.dataset.role = role;
      for (const pin of this.pins) {
        const o = document.createElement('option');
        o.value = pin.name;
        o.textContent = pin.name;
        if (this.existing?.pinRoles?.[role] === pin.name || pin.name === role) o.selected = true;
        select.appendChild(o);
      }
      container.append(label, select);
    }
  }
}
