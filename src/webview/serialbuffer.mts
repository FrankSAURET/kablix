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
   * séquences ANSI non gérées (couleurs, curseur…) sont ignorées.
   */
  write(chunk: string): void {
    for (const ch of chunk) {
      if (this.escape) {
        this.escape += ch;
        // Terminée par une lettre (ex. « K » = efface jusqu'à la fin de ligne) : le
        // Backspace qui précède toujours cette séquence a déjà reculé d'un cran.
        if (/[A-Za-z]/.test(ch)) this.escape = '';
        continue;
      }
      if (ch === '\x1b') {
        this.escape = ch;
      } else if (ch === '\b' || ch === '\x7f') {
        this.text = this.text.slice(0, -1);
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
      this.text = this.text.slice(this.text.length - SERIAL_MAX_CHARS);
      this.pending = '';
      this.rewrite = true;
    }
  }

  /** Vide la console (et l'état ANSI en cours). */
  clear(): void {
    this.text = '';
    this.pending = '';
    this.escape = '';
    this.rewrite = true;
  }

  /**
   * Porte le tampon dans le DOM et défile en bas. Tant que le texte ne fait que
   * croître, seul le delta est ajouté au nœud texte existant (`appendData`) : le
   * coût suit ce qui arrive, pas la taille déjà affichée.
   */
  flush(el: HTMLElement): void {
    if (!this.dirty) return;
    const node = el.firstChild;
    if (!this.rewrite && node instanceof Text && el.childNodes.length === 1) {
      node.appendData(this.pending);
    } else {
      el.textContent = this.text;
    }
    this.rewrite = false;
    this.pending = '';
    el.scrollTop = el.scrollHeight;
  }
}
