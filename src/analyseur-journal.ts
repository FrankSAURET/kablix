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

/** Échappe un champ CSV : guillemets doublés, champ cité s'il contient un séparateur. */
function csv(texte: string): string {
  if (!/[",\n]/.test(texte)) return texte;
  return `"${texte.replace(/"/g, '""')}"`;
}
