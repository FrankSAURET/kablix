import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

/**
 * Journal de session de l'analyseur logique.
 *
 * POURQUOI un fichier plutôt que le .projix : une mesure logique est une
 * MESURE, pas une pièce du projet. Elle vaut pour la session en cours ; la
 * graver dans le .projix alourdissait le fichier (16 000 fronts par voie),
 * posait le point « à enregistrer » sur un schéma que personne n'avait touché,
 * et surtout ne survivait pas au cycle réel d'utilisation — un arrêt de
 * simulation qui ne passait pas par le chemin prévu et la capture était perdue.
 *
 * Ici les fronts sont écrits AU FIL DE L'EAU, dès qu'ils arrivent : il n'y a
 * plus d'instant unique dont tout dépend. Le format est le CSV que l'utilisateur
 * exportera — un seul format, donc rien à convertir au moment de l'export.
 *
 * Un journal par projet ouvert (clé = URI du .projix, comme l'onglet), rangé
 * dans un dossier propre au processus (`kablix-analyseur/<pid>/`). Le fichier
 * meurt avec le projet : `fermer()` à la fermeture, et un balayage des dossiers
 * de processus morts au démarrage pour le cas où VS Code s'est arrêté brutalement.
 */

/** Une voie telle que l'atelier la déclare (pince posée sur une broche). */
export interface VoieJournal {
  voie: number;
  pin: string;
  nom: string;
}

/** En-tête du CSV : une ligne de commentaire par voie, puis les colonnes. */
const ENTETE = 'temps_ms,voie,broche,nom,niveau';

/**
 * Profondeur de la page par défaut, en fronts par voie : `FRONTS_MAX_PAR_VOIE`
 * d'analyseur-capture.mts, que l'hôte n'importe pas (module de la page).
 */
export const PROFONDEUR_DEFAUT = 60_000;

/**
 * Fronts gardés EN MÉMOIRE par broche, pour rendre sa capture à une page
 * d'analyseur rechargée : sept sixièmes de la profondeur de la page (70 000
 * pour 60 000), dans chacun de deux morceaux :
 *  - la TÊTE, les premiers fronts du run : une capture déclenchée tôt s'y fige
 *    (réserve d'avant + profondeur d'après), la page ne garde rien d'autre ;
 *  - la QUEUE, les derniers : sans déclenchement, la page suit la fin du run.
 * Entre les deux, le fichier seul garde tout. Le relire ferait envoyer à la page
 * des millions de fronts (une trame DMX en compte des milliers) pour qu'elle en
 * jette presque tout.
 */
function gardeMemoire(profondeur: number): number {
  return Math.ceil((profondeur * 7) / 6);
}

/** Voie d'une capture rendue à la page : ses fronts à plat `[t, niveau, …]`. */
export interface VoieCaptureJournal extends VoieJournal {
  fronts: number[];
}

/** Racine commune des journaux de session, sous le temporaire du système. */
function racineJournaux(): string {
  return path.join(os.tmpdir(), 'kablix-analyseur');
}

/**
 * Dossier des journaux de CE processus. Chaque fenêtre de VS Code a son propre
 * hôte d'extensions, donc son propre pid. Tout ranger à la racine commune
 * faisait effacer, par la fenêtre qui démarre, le journal VIVANT d'une autre :
 * la suite de sa mesure se réécrivait sans en-tête et l'export en perdait le
 * début.
 */
function dossierJournaux(): string {
  return path.join(racineJournaux(), String(process.pid));
}

/**
 * Vrai si le processus `pid` tourne encore. Le signal 0 ne fait que tester son
 * existence ; EPERM veut dire qu'il existe mais appartient à un autre compte.
 */
function processusVivant(pid: number): boolean {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Journaux de l'ancien rangement (avant v2026.9.5.139), posés à la racine sans
 * pid : une fenêtre restée sur une ancienne version peut encore y écrire. On ne
 * les balaie qu'après une journée sans écriture.
 */
const ANCIEN_REPOS_MS = 24 * 60 * 60 * 1000;

/**
 * Nom de fichier pour une clé de projet. La clé est une URI : elle contient des
 * caractères interdits sur Windows (`:`, `/`). On la hache pour obtenir un nom
 * court et stable, et on garde le nom lisible du projet en préfixe pour qu'un
 * humain qui ouvre le dossier s'y retrouve.
 */
function cheminPour(cle: string, nomProjet: string): string {
  const hachage = crypto.createHash('sha1').update(cle).digest('hex').slice(0, 12);
  const lisible = nomProjet.replace(/[^\w.-]+/g, '_').slice(0, 40) || 'projet';
  return path.join(dossierJournaux(), `${lisible}-${hachage}.csv`);
}

export class AnalyseurJournal {
  /** Un journal par projet ouvert, rangé sous la même clé que son onglet. */
  private static readonly ouverts = new Map<string, AnalyseurJournal>();

  /** Voies connues, pour retrouver broche et nom à partir du numéro. */
  private voies: VoieJournal[] = [];
  /** Fronts déjà écrits, par broche : sert à ne jamais réécrire deux fois. */
  private ecrits = new Map<string, number>();
  /** Vrai dès qu'au moins un front est passé dans le fichier. */
  private garni = false;
  /** Tête et queue du run, par broche, à plat (cf. gardeMemoire). */
  private tetes = new Map<string, number[]>();
  private queues = new Map<string, number[]>();
  /** Fronts gardés au plus dans la tête, et dans la queue, par broche. */
  private garde = gardeMemoire(PROFONDEUR_DEFAUT);

  /**
   * La page change de profondeur : la tête et la queue la suivent, sinon une
   * page rechargée ne retrouverait que 70 000 fronts d'une capture qui en
   * tenait un million. Une tête déjà dépassée par la queue ne regrandit pas :
   * ce qui l'aurait prolongée est passé, et la queue le suit.
   */
  public reglerProfondeur(profondeur: number): void {
    const p = Number.isFinite(profondeur) && profondeur > 0 ? profondeur : PROFONDEUR_DEFAUT;
    this.garde = gardeMemoire(p);
  }

  private constructor(
    public readonly cle: string,
    public readonly chemin: string
  ) {}

  /**
   * Journal du projet `cle`, créé au besoin. `nomProjet` ne sert qu'à rendre le
   * nom de fichier lisible ; c'est la clé qui identifie.
   */
  public static pour(cle: string, nomProjet: string): AnalyseurJournal {
    const deja = this.ouverts.get(cle);
    if (deja) return deja;
    const j = new AnalyseurJournal(cle, cheminPour(cle, nomProjet));
    this.ouverts.set(cle, j);
    return j;
  }

  /** Journal déjà ouvert pour cette clé, sans en créer un. */
  public static existant(cle: string): AnalyseurJournal | undefined {
    return this.ouverts.get(cle);
  }

  /**
   * Le projet change d'URI (« enregistrer sous ») : le journal le suit, sinon il
   * resterait rangé sous l'ancienne clé et ne serait jamais fermé.
   */
  public static suivreProjet(ancienneCle: string, nouvelleCle: string): void {
    if (ancienneCle === nouvelleCle) return;
    const j = this.ouverts.get(ancienneCle);
    if (!j) return;
    this.ouverts.delete(ancienneCle);
    this.ouverts.set(nouvelleCle, j);
  }

  /**
   * Projet fermé : le journal n'a plus de raison d'être. On supprime le fichier
   * — c'est une donnée de session, pas un document de l'utilisateur. Ce qu'il
   * voulait garder, il l'a exporté.
   */
  public static fermer(cle: string): void {
    const j = this.ouverts.get(cle);
    if (!j) return;
    this.ouverts.delete(cle);
    try {
      fs.rmSync(j.chemin, { force: true });
    } catch {
      /* fichier déjà parti ou verrouillé : sans conséquence, c'est du temporaire */
    }
  }

  /** Tous les journaux encore ouverts sont fermés (extinction de l'extension). */
  public static fermerTous(): void {
    for (const cle of [...this.ouverts.keys()]) this.fermer(cle);
    try {
      fs.rmdirSync(dossierJournaux()); // vide seulement : sinon il reste, sans dommage
    } catch {
      /* absent ou non vide */
    }
  }

  /**
   * Journaux laissés par une session précédente : VS Code peut s'être arrêté
   * sans passer par `fermer()`. On les efface au démarrage plutôt que de laisser
   * le dossier temporaire grossir indéfiniment.
   *
   * Seuls partent les dossiers des processus MORTS : ceux des autres fenêtres
   * de VS Code, bien vivantes, ne sont pas à nous. Dans notre propre dossier
   * (un pid réutilisé après un arrêt brutal), les journaux de CETTE session
   * sont épargnés.
   */
  public static nettoyerOrphelins(): void {
    const racine = racineJournaux();
    let entrees: fs.Dirent[];
    try {
      entrees = fs.readdirSync(racine, { withFileTypes: true });
    } catch {
      return; // dossier absent : rien à nettoyer
    }
    for (const e of entrees) {
      const chemin = path.join(racine, e.name);
      try {
        if (e.isDirectory()) {
          // Un dossier qui n'est pas un pid n'est pas de nous : on n'y touche pas.
          if (!/^\d+$/.test(e.name)) continue;
          const pid = Number(e.name);
          if (pid === process.pid) this.nettoyerLeMien();
          else if (!processusVivant(pid)) fs.rmSync(chemin, { recursive: true, force: true });
        } else if (e.isFile() && e.name.endsWith('.csv')) {
          if (Date.now() - fs.statSync(chemin).mtimeMs > ANCIEN_REPOS_MS) fs.rmSync(chemin, { force: true });
        }
      } catch {
        /* verrouillé ou disparu entre-temps : on le laisse */
      }
    }
  }

  /** Notre dossier, hérité d'un processus mort au même pid : tout ce qui n'est pas ouvert part. */
  private static nettoyerLeMien(): void {
    const dossier = dossierJournaux();
    const vivants = new Set([...this.ouverts.values()].map((j) => j.chemin));
    for (const nom of fs.readdirSync(dossier)) {
      const chemin = path.join(dossier, nom);
      if (!vivants.has(chemin)) fs.rmSync(chemin, { recursive: true, force: true });
    }
  }

  /**
   * Nouvelle mesure : le fichier repart de zéro. Les voies sont réinscrites en
   * en-tête pour que le CSV se lise seul, sans le projet.
   */
  public demarrer(voies: VoieJournal[]): void {
    this.voies = voies.slice();
    this.ecrits.clear();
    this.garni = false;
    this.tetes.clear();
    this.queues.clear();
    const entete = [
      '# Kablix — analyseur logique, journal de session',
      `# ${new Date().toISOString()}`,
      ...this.voies.map((v) => `# voie ${v.voie} = ${v.pin} (${v.nom})`),
      ENTETE,
      '',
    ].join('\n');
    try {
      fs.mkdirSync(path.dirname(this.chemin), { recursive: true });
      fs.writeFileSync(this.chemin, entete, 'utf8');
    } catch {
      /* journal indisponible : la simulation ne doit pas s'arrêter pour ça */
    }
  }

  /** Les voies changent en cours de route (pince déplacée, renommée). */
  public majVoies(voies: VoieJournal[]): void {
    this.voies = voies.slice();
  }

  /** Voies déclarées par l'atelier : colonnes d'un export dont l'onglet ne dit rien. */
  public voiesDeclarees(): VoieJournal[] {
    return this.voies.slice();
  }

  /**
   * Verse une salve de fronts. `salves` est ce que l'atelier envoie déjà :
   * par broche, une suite plate `[t0, niveau0, t1, niveau1, …]` où le temps est
   * en millisecondes SIMULÉES.
   *
   * Écrit au fil de l'eau, en ajout : aucun instant unique dont tout dépendrait.
   */
  public verser(salves: Record<string, number[]>): void {
    const lignes: string[] = [];
    for (const [pin, plat] of Object.entries(salves)) {
      if (!Array.isArray(plat) || plat.length < 2) continue;
      const v = this.voies.find((x) => x.pin === pin);
      const voie = v ? v.voie : -1;
      const nom = v ? v.nom : pin;
      // Une salve peut recouvrir la précédente (l'atelier renvoie parfois sa
      // fenêtre entière) : on ne garde que ce qui est postérieur au dernier
      // front écrit, sinon le CSV compterait deux fois les mêmes transitions.
      const dernier = this.ecrits.get(pin) ?? Number.NEGATIVE_INFINITY;
      let plusRecent = dernier;
      for (let i = 0; i + 1 < plat.length; i += 2) {
        const t = plat[i];
        const niveau = plat[i + 1];
        if (t <= dernier) continue;
        lignes.push(`${t},${voie},${pin},${csv(nom)},${niveau}`);
        this.retenir(pin, t, niveau);
        if (t > plusRecent) plusRecent = t;
      }
      if (plusRecent > dernier) this.ecrits.set(pin, plusRecent);
    }
    if (lignes.length === 0) return;
    try {
      fs.appendFileSync(this.chemin, lignes.join('\n') + '\n', 'utf8');
      this.garni = true;
    } catch {
      /* écriture impossible : on n'interrompt pas la simulation pour un journal */
    }
  }

  /** Range un front en tête tant qu'elle a de la place, en queue ensuite. */
  private retenir(pin: string, t: number, niveau: number): void {
    let tete = this.tetes.get(pin);
    if (!tete) this.tetes.set(pin, (tete = []));
    let queue = this.queues.get(pin);
    // La tête ne reprend jamais après la queue : les fronts seraient rendus
    // dans le désordre (profondeur agrandie en cours de run).
    if (tete.length < 2 * this.garde && !queue?.length) {
      tete.push(t, niveau);
      return;
    }
    if (!queue) this.queues.set(pin, (queue = []));
    queue.push(t, niveau);
    // Rabot par paquets : un `splice` à chaque front coûterait la queue entière.
    if (queue.length > 2 * this.garde * 1.25) queue.splice(0, queue.length - 2 * this.garde);
  }

  /**
   * La mesure du run, au format du message `restaure` : ce qu'une page
   * d'analyseur RECHARGÉE doit rejouer pour retrouver ses courbes. VS Code
   * recharge la page d'un onglet qu'on déplace vers une autre fenêtre (un
   * second écran) : elle repart vide, et ce qu'elle avait capturé n'existe plus
   * que dans ce journal. `undefined` si aucune voie n'a de front.
   *
   * Tête et queue sont mises bout à bout : la page, qui rejoue les fronts dans
   * l'ordre du temps, garde de ce trou ce qu'elle aurait gardé en direct.
   */
  public capture(): { voies: VoieCaptureJournal[] } | undefined {
    const voies = this.voies.map((v) => ({
      ...v,
      fronts: (this.tetes.get(v.pin) ?? []).concat(this.queues.get(v.pin) ?? []),
    }));
    return voies.some((v) => v.fronts.length > 0) ? { voies } : undefined;
  }

  /** Le journal porte-t-il au moins un front ? */
  public aDesDonnees(): boolean {
    return this.garni;
  }

  /** Contenu du journal, pour l'export. `undefined` s'il n'y a rien à exporter. */
  public lire(): string | undefined {
    if (!this.garni) return undefined;
    try {
      return fs.readFileSync(this.chemin, 'utf8');
    } catch {
      return undefined;
    }
  }
}

/** Voie telle que l'onglet la montre, pour l'export. */
export interface VoieExport extends VoieJournal {
  /**
   * Lue à l'envers — pince sur la patte `-` d'une paire DMX, ou réglage
   * « Invert » : la colonne suit l'écran, pas la broche.
   */
  inverse?: boolean;
}

/**
 * Le CSV que l'utilisateur exporte, tiré du journal (Frank, 26/09).
 *
 * UNE COLONNE PAR VOIE. Le journal range les fronts par BROCHE : trois pinces
 * sur la même broche (Sig, DMX-, DMX+ d'un Grove DMX512) n'y sont écrites
 * qu'une fois, sous la première voie — recopier le journal n'en rendait qu'une
 * sur trois. Ici chaque voie a sa colonne, inversée comme à l'écran.
 *
 * DEUX LIGNES PAR FRONT, au même instant : le niveau d'avant, puis celui
 * d'après. Un tableur qui relie les points trace alors des créneaux à fronts
 * verticaux ; avec une ligne par front, il tirait une oblique de l'un à l'autre.
 *
 * `plage` (M1 et M2 posés) : une ligne à M1 donne le niveau de départ de chaque
 * voie, une ligne à M2 son niveau d'arrivée, et entre les deux les fronts de la
 * plage, bornes comprises. L'ordre des marqueurs ne compte pas.
 *
 * Case vide = niveau encore inconnu : la voie n'a pas bougé depuis le départ.
 */
export function csvExport(texte: string, voies: VoieExport[], plage?: { t1: number; t2: number }): string {
  const a = plage ? Math.min(plage.t1, plage.t2) : Number.NEGATIVE_INFINITY;
  const b = plage ? Math.max(plage.t1, plage.t2) : Number.POSITIVE_INFINITY;

  // Broches écoutées, une seule fois même sous plusieurs pinces.
  const brochesIdx = new Map<string, number>();
  for (const v of voies) if (!brochesIdx.has(v.pin)) brochesIdx.set(v.pin, brochesIdx.size);
  const colonnes = voies.map((v) => ({ p: brochesIdx.get(v.pin) as number, inv: v.inverse === true }));

  // Lecture du journal : `t,voie,broche,nom,niveau`. La broche est entre la
  // 2e et la 3e virgule, avant le nom (qui peut être cité et porter des
  // virgules) ; le niveau suit la dernière.
  let date = '';
  const ts: number[] = [];
  const ps: number[] = [];
  const ns: number[] = [];
  for (let debut = 0; debut < texte.length; ) {
    let fin = texte.indexOf('\n', debut);
    if (fin < 0) fin = texte.length;
    const ligne = texte.slice(debut, fin);
    debut = fin + 1;
    if (ligne.startsWith('#')) {
      if (!date && /^# \d{4}-\d\d-\d\dT/.test(ligne)) date = ligne;
      continue;
    }
    const v1 = ligne.indexOf(',');
    const v2 = v1 < 0 ? -1 : ligne.indexOf(',', v1 + 1);
    const v3 = v2 < 0 ? -1 : ligne.indexOf(',', v2 + 1);
    if (v3 < 0) continue; // ligne de colonnes, ligne vide
    const t = Number(ligne.slice(0, v1));
    const p = brochesIdx.get(ligne.slice(v2 + 1, v3));
    const niveau = Number(ligne.slice(ligne.lastIndexOf(',') + 1));
    if (p === undefined || !Number.isFinite(t) || !Number.isFinite(niveau)) continue;
    ts.push(t);
    ps.push(p);
    ns.push(niveau);
  }

  // Le journal range par salve et par broche : on remet dans l'ordre du temps,
  // à égalité dans l'ordre d'écriture. Une broche seule est déjà triée.
  let ordre: Uint32Array | null = null;
  for (let i = 1; i < ts.length; i++) {
    if (ts[i] < ts[i - 1]) {
      ordre = new Uint32Array(ts.length);
      for (let k = 0; k < ordre.length; k++) ordre[k] = k;
      ordre.sort((x, y) => ts[x] - ts[y] || x - y);
      break;
    }
  }

  const niveaux: Array<number | null> = [...brochesIdx.keys()].map(() => null);
  let connus = 0;
  const appliquer = (i: number): void => {
    if (niveaux[ps[i]] === null) connus++;
    niveaux[ps[i]] = ns[i];
  };
  const donnees: string[] = [];
  let derniere = '';
  /** Ligne des niveaux à l'instant t ; ni doublon, ni ligne tout inconnue. */
  const noter = (t: number): void => {
    if (connus === 0) return;
    let s = temps(t);
    for (const c of colonnes) {
      const n = niveaux[c.p];
      s += n === null ? ',' : `,${c.inv && (n === 0 || n === 1) ? 1 - n : n}`;
    }
    if (s !== derniere) donnees.push((derniere = s));
  };

  const n = ts.length;
  const idx = (k: number): number => (ordre ? ordre[k] : k);
  let k = 0;
  while (k < n && ts[idx(k)] < a) appliquer(idx(k++));
  if (plage) noter(a);
  while (k < n && ts[idx(k)] <= b) {
    const t0 = ts[idx(k)];
    noter(t0); // niveau d'avant le front…
    while (k < n && ts[idx(k)] === t0) appliquer(idx(k++));
    noter(t0); // …et d'après, au même instant : le front est vertical
  }
  if (plage) noter(b);

  const tete = [
    '# Kablix — analyseur logique, mesure exportée',
    ...(date ? [date] : []),
    ...voies.map((v) => `# voie ${v.voie} = ${v.pin} (${v.nom})${v.inverse ? ', lue inversée' : ''}`),
    ...(plage ? [`# plage exportée : de ${temps(a)} à ${temps(b)} ms (M1 → M2)`] : []),
    "# un front = deux lignes au même instant, niveau d'avant puis niveau d'après ; case vide = niveau encore inconnu",
    ['temps_ms', ...voies.map((v) => csv(v.nom))].join(','),
  ];
  return [...tete, ...donnees, ''].join('\n');
}

/**
 * Instant en ms, arrondi à la picoseconde : les temps simulés traînent un
 * bruit de flottant (`20473.748125000002`) qu'aucune horloge ne justifie — un
 * cycle vaut 62,5 ns sur un Uno, 8 ns sur un Pico.
 */
function temps(t: number): string {
  return String(Math.round(t * 1e6) / 1e6);
}

/** Échappe un champ CSV : guillemets doublés, champ cité s'il contient un séparateur. */
function csv(texte: string): string {
  if (!/[",\n]/.test(texte)) return texte;
  return `"${texte.replace(/"/g, '""')}"`;
}
