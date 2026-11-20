// Formules TeX → HTML, pour l'aide locale (fiches et guides).
//
// Les fiches écrivent leurs formules comme l'aperçu Markdown de VS Code les
// comprend : `$…$` en ligne, `$$…$$` en bloc. Notre lecteur (markdown.ts) n'a
// pas KaTeX — trop lourd pour quelques équations — d'où ce rendu réduit au
// sous-ensemble réellement employé : fractions, indices, exposants, lettres
// grecques, opérateurs courants, `\left( \right)`, tailles `\large`/`\Large`.
// Une commande inconnue sort telle quelle (lisible, et repérable à la relecture).

/** Échappe le texte destiné au HTML. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Commandes rendues par un simple caractère. */
const SYMBOLES: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ',
  phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', approx: '≈', neq: '≠', ne: '≠',
  le: '≤', leq: '≤', ge: '≥', geq: '≥', infty: '∞', to: '→', rightarrow: '→', leftarrow: '←',
  degree: '°', circ: '∘', ',': ' ', ';': ' ', ' ': ' ', quad: ' ', '%': '%',
  '{': '{', '}': '}', '$': '$',
};

/** Tailles TeX → facteur CSS. */
const TAILLES: Record<string, string> = {
  small: '0.9em', normalsize: '1em', large: '1.2em', Large: '1.44em', LARGE: '1.73em', huge: '2.07em', Huge: '2.49em',
};

/** Fonctions écrites droites (sin, log…), pas en italique comme une variable. */
const FONCTIONS = new Set(['sin', 'cos', 'tan', 'ln', 'log', 'exp', 'min', 'max', 'lim']);

class Lecteur {
  private i = 0;
  constructor(private readonly s: string) {}

  /** Groupe jusqu'à `}` (ou la fin) : suite d'atomes, avec leurs indices/exposants. */
  groupe(): string {
    let out = '';
    while (this.i < this.s.length && this.s[this.i] !== '}') {
      const c = this.s[this.i];
      if (c === '_' || c === '^') {
        this.i++;
        const tag = c === '_' ? 'sub' : 'sup';
        out += `<${tag}>${this.argument()}</${tag}>`;
        continue;
      }
      // `\large` & co : s'applique à tout le reste du groupe.
      const taille = this.s.slice(this.i).match(/^\\([a-zA-Z]+)/);
      if (taille && TAILLES[taille[1]]) {
        this.i += taille[0].length;
        const reste = this.groupe();
        // Classe et non `style=` : la CSP des webviews n'admet que la feuille à nonce.
        out += `<span class="math-${taille[1]}">${reste}</span>`;
        break;
      }
      out += this.atome();
    }
    return out;
  }

  /** Argument d'une commande ou d'un `_`/`^` : `{…}` ou un seul atome. */
  private argument(): string {
    this.blancs();
    if (this.s[this.i] === '{') {
      this.i++;
      const g = this.groupe();
      this.i++; // `}`
      return g;
    }
    return this.atome();
  }

  /** Texte brut d'un argument `{…}` (pour `\text`, `\mathrm`). */
  private texte(): string {
    this.blancs();
    if (this.s[this.i] !== '{') return '';
    let prof = 0;
    const debut = this.i + 1;
    for (; this.i < this.s.length; this.i++) {
      if (this.s[this.i] === '{') prof++;
      else if (this.s[this.i] === '}' && --prof === 0) break;
    }
    return this.s.slice(debut, this.i++);
  }

  private blancs(): void {
    while (this.s[this.i] === ' ') this.i++;
  }

  private atome(): string {
    const c = this.s[this.i];
    if (c === ' ') { this.i++; return ''; } // les espaces TeX ne comptent pas
    if (c === '{') {
      this.i++;
      const g = this.groupe();
      this.i++;
      return g;
    }
    if (c === '\\') return this.commande();
    this.i++;
    if (/[A-Za-z]/.test(c)) return `<i>${c}</i>`;
    if (c === '-') return '−';
    if (c === '*') return '∗';
    if (/[=<>+−×±]/.test(c)) return `<span class="math-op">${esc(c)}</span>`;
    return esc(c);
  }

  private commande(): string {
    const m = this.s.slice(this.i).match(/^\\([a-zA-Z]+|.)/);
    if (!m) { this.i++; return '\\'; }
    this.i += m[0].length;
    const nom = m[1];
    if (nom === 'frac' || nom === 'dfrac' || nom === 'tfrac') {
      const haut = this.argument();
      const bas = this.argument();
      return `<span class="math-frac"><span class="math-num">${haut}</span><span class="math-den">${bas}</span></span>`;
    }
    if (nom === 'sqrt') return `√<span class="math-racine">${this.argument()}</span>`;
    if (nom === 'text' || nom === 'mathrm' || nom === 'textrm' || nom === 'operatorname') {
      return `<span class="math-droit">${esc(this.texte())}</span>`;
    }
    if (nom === 'mathbf' || nom === 'textbf') return `<b>${this.argument()}</b>`;
    if (nom === 'left' || nom === 'right' || nom === 'big' || nom === 'Big' || nom === 'bigg' || nom === 'Bigg') {
      // Délimiteur agrandi : `\left(` … `\right)`. `\left.` = délimiteur vide.
      this.blancs();
      const d = this.s[this.i] === '\\' ? this.commande() : esc(this.s[this.i++] ?? '');
      return d === '.' ? '' : `<span class="math-delim">${d}</span>`;
    }
    if (FONCTIONS.has(nom)) return `<span class="math-droit">${nom}</span>`;
    if (SYMBOLES[nom] !== undefined) {
      const sym = SYMBOLES[nom];
      return /^[×·÷±∓≈≠≤≥→←]$/.test(sym) ? `<span class="math-op">${sym}</span>` : sym;
    }
    return esc(m[0]); // inconnue : laissée lisible
  }
}

/** Formule TeX → HTML. `bloc` : formule centrée sur sa propre ligne (`$$…$$`). */
export function texToHtml(tex: string, bloc = false): string {
  const html = new Lecteur(tex.trim()).groupe();
  return bloc ? `<div class="math math-bloc">${html}</div>` : `<span class="math">${html}</span>`;
}

/** Styles des formules, à inclure dans la feuille de chaque webview d'aide. */
export const MATH_CSS = `
    .math { font-family: 'Cambria Math', 'STIX Two Math', 'Latin Modern Math', 'Times New Roman', serif; white-space: nowrap; }
    .math-bloc { display: block; text-align: center; margin: 0.9rem 0; overflow-x: auto; }
    .math i { font-style: italic; }
    .math-droit { font-style: normal; }
    .math-op { margin: 0 0.25em; }
    .math sub, .math sup { font-size: 0.7em; line-height: 0; }
    .math-frac { display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; margin: 0 0.15em; }
    .math-num { padding: 0 0.2em; border-bottom: 1px solid currentColor; }
    .math-den { padding: 0 0.2em; }
    .math-delim { font-size: 1.9em; font-weight: 200; vertical-align: middle; line-height: 1; position: relative; top: -0.05em; }
    .math-racine { border-top: 1px solid currentColor; padding: 0 0.1em; }
${Object.entries(TAILLES).map(([nom, em]) => `    .math-${nom} { font-size: ${em}; }`).join('\n')}
`;
