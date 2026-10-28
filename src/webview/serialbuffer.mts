// Tampon du moniteur série. Le firmware transmet OCTET PAR OCTET : écrire
// directement dans le DOM à chaque octet — relire `textContent`, le réécrire en
// entier puis lire `scrollHeight` (reflow forcé) — coûte O(taille de la console)
// par caractère. Mesuré en Chrome : 18 000 octets = ~36 SECONDES, contre ~70 ms
// avec ce tampon. Comme `onSerial` est appelé depuis la boucle d'exécution du
// microcontrôleur, ce temps était pris sur la simulation elle-même : un sketch
// bavard (HC-SR04, capteurs) tournait des dizaines de fois trop lentement.
//
// Ici le texte vit en JavaScript ; le DOM n'est touché qu'au `flush` (une fois
// par frame), et seulement pour y AJOUTER le delta quand c'est possible.

/** Nombre de caractères conservés dans le moniteur (au-delà, le début est oublié). */
export const SERIAL_MAX_CHARS = 200_000;

export class SerialConsole {
  private text = '';

  /** Caractères pas encore ajoutés au DOM (ajout simple, sans réécriture). */
  private pending = '';

  /** Le DOM doit être RÉÉCRIT en entier (effacement, backspace, troncature). */
  private rewrite = true;

  /** Séquence ANSI « \x1b[… » en cours, accumulée jusqu'à sa lettre finale. */
  private escape = '';

  /**
   * Couleurs ANSI (SGR `\x1b[…m`, couleurs de texte seulement) : à partir de la
   * position `start` du texte, la classe CSS devient `cls` ('' = couleur par
   * défaut). Vide tant que personne n'a écrit en couleur — le DOM reste alors un
   * seul nœud texte, comme avant.
   */
  private runs: { start: number; cls: string }[] = [];

  /** Classe de la couleur en cours ('' = défaut). */
  private cls = '';

  /** Contenu courant de la console. */
  get value(): string {
    return this.text;
  }

  /** Y a-t-il quelque chose à porter dans le DOM ? */
  get dirty(): boolean {
    return this.rewrite || this.pending.length > 0;
  }

  /**
   * Ajoute un morceau reçu du firmware. Backspace et DEL effacent le dernier
   * caractère ; le CR est avalé (en `white-space: pre-wrap` le navigateur le rend
   * déjà comme un saut de ligne, le LF qui suit en ferait un second) ; les
   * couleurs de texte ANSI sont rendues, les autres séquences (curseur…) ignorées.
   */
  write(chunk: string): void {
    for (const ch of chunk) {
      if (this.escape) {
        this.escape += ch;
        // Terminée par une lettre (ex. « K » = efface jusqu'à la fin de ligne) : le
        // Backspace qui précède toujours cette séquence a déjà reculé d'un cran.
        if (/[A-Za-z]/.test(ch)) {
          if (ch === 'm' && this.escape[1] === '[') this.setColor(this.escape.slice(2, -1));
          this.escape = '';
        }
        continue;
      }
      if (ch === '\x1b') {
        this.escape = ch;
      } else if (ch === '\b' || ch === '\x7f') {
        this.text = this.text.slice(0, -1);
        this.runs = this.runs.filter((r) => r.start <= this.text.length);
        this.pending = '';
        this.rewrite = true; // on retire du texte : l'ajout simple ne suffit plus
      } else if (ch === '\r') {
        continue;
      } else {
        this.text += ch;
        if (!this.rewrite) this.pending += ch;
      }
    }
    if (this.text.length > SERIAL_MAX_CHARS) {
      const cut = this.text.length - SERIAL_MAX_CHARS;
      this.text = this.text.slice(cut);
      // La couleur en vigueur au nouveau début est gardée, ramenée en position 0.
      const before = this.runs.filter((r) => r.start <= cut).at(-1);
      this.runs = this.runs.filter((r) => r.start > cut).map((r) => ({ start: r.start - cut, cls: r.cls }));
      if (before) this.runs.unshift({ start: 0, cls: before.cls });
      this.pending = '';
      this.rewrite = true;
    }
  }

  /** Paramètres d'une séquence SGR (`36`, `0`, `1;32`…) : seule la couleur du texte compte. */
  private setColor(params: string): void {
    let cls = this.cls;
    for (const p of params.split(';')) {
      const n = p === '' ? 0 : Number(p);
      if (n === 0 || n === 39) cls = '';
      else if ((n >= 30 && n <= 37) || (n >= 90 && n <= 97)) cls = `ansi-${n}`;
    }
    if (cls === this.cls) return;
    this.cls = cls;
    const last = this.runs.at(-1);
    if (last && last.start === this.text.length) last.cls = cls;
    else this.runs.push({ start: this.text.length, cls });
    // Le texte qui suit ne va plus dans le même nœud : réécriture au prochain flush.
    this.pending = '';
    this.rewrite = true;
  }

  /** Vide la console (et l'état ANSI en cours). */
  clear(): void {
    this.text = '';
    this.pending = '';
    this.escape = '';
    this.runs = [];
    this.cls = '';
    this.rewrite = true;
  }

  /**
   * Porte le tampon dans le DOM et défile en bas. Tant que le texte ne fait que
   * croître, seul le delta est ajouté au nœud texte existant (`appendData`) : le
   * coût suit ce qui arrive, pas la taille déjà affichée.
   */
  flush(el: HTMLElement): void {
    if (!this.dirty) return;
    // Dernier nœud : texte nu, ou <span> coloré dont le texte est l'enfant unique.
    const last = el.lastChild;
    const node = last instanceof Text ? last : last?.firstChild;
    if (!this.rewrite && node instanceof Text) {
      node.appendData(this.pending);
    } else if (this.runs.length === 0) {
      el.textContent = this.text;
    } else {
      el.replaceChildren(...this.nodes(el.ownerDocument));
    }
    this.rewrite = false;
    this.pending = '';
    el.scrollTop = el.scrollHeight;
  }

  /** Texte découpé selon les couleurs : nœud texte nu ou <span class="ansi-NN">. */
  private nodes(doc: Document): Node[] {
    const out: Node[] = [];
    const bounds = [{ start: 0, cls: '' }, ...this.runs];
    for (let i = 0; i < bounds.length; i++) {
      const end = i + 1 < bounds.length ? bounds[i + 1].start : this.text.length;
      const part = this.text.slice(bounds[i].start, end);
      // Le dernier segment existe même vide : le texte à venir s'y ajoute.
      if (!part && i + 1 < bounds.length) continue;
      if (!bounds[i].cls) {
        out.push(doc.createTextNode(part));
      } else {
        const span = doc.createElement('span');
        span.className = bounds[i].cls;
        span.appendChild(doc.createTextNode(part));
        out.push(span);
      }
    }
    return out;
  }
}
