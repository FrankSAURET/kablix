// Succès (feuille de route n°6) : des badges qui attestent d'une COMPÉTENCE ou
// récompensent une MANIÈRE DE TRAVAILLER.
//
// Règles de conception (Frank) :
// - deux familles : « maîtrise » (un fait mesurable dans la simulation, décerné
//   une seule fois) et « effort » (le processus, pas le résultat : elle
//   dédramatise l'erreur) ;
// - jamais de badge pour du TEMPS passé seul : « une heure dans Kablix » ne
//   prouve rien et pousse à rester devant l'écran ;
// - chaque badge a une phrase qui dit ce qu'il atteste, sinon c'est un gadget.
//
// Ce module est PUR (aucun accès à la page) : la page lui envoie des
// événements, il décide, et rend les badges nouvellement obtenus. Ce qui doit
// survivre au changement de projet (badges, protocoles vus, lancements du jour)
// est dans `EtatSucces`, que la page confie à l'hôte (globalState).

export type FamilleSucces = 'maitrise' | 'effort';

export interface DefSucces {
  id: string;
  famille: FamilleSucces;
  /** Titre court (clé de traduction EN). */
  titre: string;
  /** Ce que le badge atteste (clé de traduction EN). */
  atteste: string;
}

export const SUCCES: readonly DefSucces[] = [
  // ----- Preuve de maîtrise ------------------------------------------------
  {
    id: 'ohm',
    famille: 'maitrise',
    titre: "Ohm's law",
    atteste: 'You lit an LED with the right series resistor on your first run, without destroying anything.',
  },
  {
    id: 'niveau-logique',
    famille: 'maitrise',
    titre: 'Logic level',
    atteste: 'A 5 V sensor is read by a 3.3 V board through a voltage divider: the pin gets a safe level and the board survives.',
  },
  {
    id: 'bus',
    famille: 'maitrise',
    titre: 'Bus mastered',
    atteste: 'You decoded a real I²C frame with the logic analyzer: the address and the acknowledge are readable.',
  },
  {
    id: 'sans-attendre',
    famille: 'maitrise',
    titre: 'No waiting',
    atteste: 'Your circuit blinks without a single delay(): you keep time with millis() or with a timer, so the microcontroller stays free.',
  },
  {
    id: 'interruption',
    famille: 'maitrise',
    titre: 'Interrupt',
    atteste: 'An input was handled by an interrupt (attachInterrupt, pin.irq) instead of a waiting loop.',
  },
  {
    id: 'econome',
    famille: 'maitrise',
    titre: 'Frugal',
    atteste: 'Your circuit averages less than 1 mA: sleeping between two jobs is how a coin cell lasts years.',
  },
  {
    id: 'calibre',
    famille: 'maitrise',
    titre: 'The right rating',
    atteste: 'A motor runs, driven by a transistor, with nothing burning or collapsing: you sized the power stage.',
  },
  {
    id: 'trois-protocoles',
    famille: 'maitrise',
    titre: 'Three protocols',
    atteste: 'You ran I²C, SPI and a serial link, each in a different project.',
  },
  // ----- Effort et processus ----------------------------------------------
  {
    id: 'fumee',
    famille: 'effort',
    titre: 'First puff of smoke',
    atteste: 'Your first burned component. Everybody gets one: the mistake helps you progress.',
  },
  {
    id: 'deux-fois',
    famille: 'effort',
    titre: 'Twice',
    atteste: 'A circuit burned, then the same project ran cleanly: you fixed it.',
  },
  {
    id: 'chercheur',
    famille: 'effort',
    titre: 'Fault hunter',
    atteste: 'Three different faults fixed in the same session.',
  },
  {
    id: 'pas-a-pas',
    famille: 'effort',
    titre: 'Step by step',
    atteste: 'A breakpoint set and ten steps executed: you read your program instead of guessing.',
  },
  {
    id: 'instrument',
    famille: 'effort',
    titre: 'With the instrument',
    atteste: 'You measured with a multimeter or an oscilloscope before changing the circuit.',
  },
  {
    id: 'perseverant',
    famille: 'effort',
    titre: 'Persevering',
    atteste: 'Five simulation runs of the same project in one day.',
  },
  {
    id: 'au-propre',
    famille: 'effort',
    titre: 'Neatly done',
    atteste: 'A diagram of more than ten components where every wire is clean: right angles, nothing crossing a part.',
  },
  {
    id: 'documente',
    famille: 'effort',
    titre: 'Documented',
    atteste: 'A project carrying at least three text labels: whoever opens it understands it.',
  },
];

// --------------------------------------------------------------------------
// État conservé d'une session à l'autre
// --------------------------------------------------------------------------

export type ProtocoleSucces = 'i2c' | 'spi' | 'serie';

export interface EtatSucces {
  /** id du badge → date d'obtention (ms depuis 1970). */
  obtenus: Record<string, number>;
  /** Projets (clés) où chaque protocole a tourné. */
  protocoles: Record<ProtocoleSucces, string[]>;
  /** Lancements du jour, par projet. */
  assidu: Record<string, { jour: string; n: number }>;
}

export function etatVierge(): EtatSucces {
  return { obtenus: {}, protocoles: { i2c: [], spi: [], serie: [] }, assidu: {} };
}

/** Relit un état venu du disque : tout ce qui n'a pas la bonne forme est écarté. */
export function etatValide(brut: unknown): EtatSucces {
  const out = etatVierge();
  if (typeof brut !== 'object' || brut === null) return out;
  const b = brut as Partial<EtatSucces>;
  const connus = new Set(SUCCES.map((s) => s.id));
  for (const [id, d] of Object.entries(b.obtenus ?? {})) {
    if (connus.has(id) && typeof d === 'number' && Number.isFinite(d)) out.obtenus[id] = d;
  }
  for (const p of ['i2c', 'spi', 'serie'] as const) {
    const l = b.protocoles?.[p];
    if (Array.isArray(l)) out.protocoles[p] = l.filter((x): x is string => typeof x === 'string').slice(0, 200);
  }
  for (const [k, v] of Object.entries(b.assidu ?? {})) {
    if (v && typeof v.jour === 'string' && typeof v.n === 'number' && Number.isFinite(v.n)) {
      out.assidu[k] = { jour: v.jour, n: v.n };
    }
  }
  return out;
}

// --------------------------------------------------------------------------
// Ce que la page rapporte
// --------------------------------------------------------------------------

/** Au clic sur ▶ : ce qui se lit AVANT que la simulation tourne. */
export interface InfoLancement {
  /** Clé du projet (son nom, ou « sans titre »). */
  projet: string;
  /** Jour local, `AAAA-MM-JJ`. */
  jour: string;
  /** Texte du code lancé, ou null (simulation sans code). */
  source: string | null;
  /** Nombre de composants du schéma (cartes et instruments compris). */
  composants: number;
  /** Étiquettes de texte libre posées sur la feuille. */
  etiquettes: number;
  /** Fils du schéma, et combien sont « propres » (cf. Editor.proprete). */
  fils: number;
  filsPropres: number;
  /** Protocoles câblés dans le schéma. */
  protocoles: ProtocoleSucces[];
  /** Un transistor est posé dans le schéma. */
  transistor: boolean;
  /** Un capteur plus haut que la carte est lu à travers un pont diviseur (cf. pontsNiveauLogique). */
  pontNiveau: boolean;
}

/** Relevé périodique pendant la simulation. */
export interface Instantane {
  /** Temps simulé écoulé (ms). */
  tMs: number;
  /** Une LED est allumée, avec une résistance en série, sans surintensité. */
  ledSaine: boolean;
  /** Composants grillés depuis le lancement (ids). */
  grilles: string[];
  /** Défauts actifs ou vus (clés : `burn:led`, `lint:pwm`…). */
  defauts: string[];
  /** Un moteur tourne, sans défaut. */
  moteurSain: boolean;
  /** Fronts vus sur les broches que le code pilote / sur ses broches d'interruption (cumul). */
  frontsSortie: number;
  frontsInterruption: number;
  /** Un multimètre ou un oscilloscope est câblé. */
  instrument: boolean;
  /** Le programme a écrit sur la liaison série. */
  serie: boolean;
  /** Courant moyen de la carte depuis le lancement (A), ou null s'il est inconnu. */
  courantMoyenA: number | null;
}

interface ProjetSession {
  lancements: number;
  /** Le dernier lancement a grillé quelque chose. */
  aGrille: boolean;
  /** Défauts du lancement précédent / défauts corrigés depuis le début de la séance. */
  defautsPrec: Set<string>;
  corriges: Set<string>;
  /** Un lancement a eu un instrument câblé ; le prochain changement du schéma décerne le badge. */
  mesure: boolean;
}

interface Lancement {
  info: InfoLancement;
  projet: ProjetSession;
  pas: number;
  pointsArret: number;
  defauts: Set<string>;
  aGrille: boolean;
  tMs: number;
  instrument: boolean;
  calibreDepuis: number;
}

const DUREE_PROPRE_MS = 5000;

export class SuiviSucces {
  private readonly projets = new Map<string, ProjetSession>();
  private run: Lancement | null = null;

  constructor(
    readonly etat: EtatSucces,
    private readonly onObtenu: (def: DefSucces) => void,
    private readonly maintenant: () => number = Date.now
  ) {}

  /** Badges obtenus, dans l'ordre du catalogue. */
  obtenus(): DefSucces[] {
    return SUCCES.filter((s) => this.etat.obtenus[s.id] !== undefined);
  }

  private accorder(id: string): void {
    if (this.etat.obtenus[id] !== undefined) return;
    const def = SUCCES.find((s) => s.id === id);
    if (!def) return;
    this.etat.obtenus[id] = this.maintenant();
    this.onObtenu(def);
  }

  private projetDe(cle: string): ProjetSession {
    let p = this.projets.get(cle);
    if (!p) {
      p = { lancements: 0, aGrille: false, defautsPrec: new Set(), corriges: new Set(), mesure: false };
      this.projets.set(cle, p);
    }
    return p;
  }

  /** Clic sur ▶. */
  lancement(info: InfoLancement): void {
    if (this.run) this.arret();
    const projet = this.projetDe(info.projet);
    projet.lancements++;
    this.run = {
      info,
      projet,
      pas: 0,
      pointsArret: 0,
      defauts: new Set(),
      aGrille: false,
      tMs: 0,
      instrument: false,
      calibreDepuis: -1,
    };
    // Persévérant : cinq lancements du même projet le même jour.
    const a = this.etat.assidu[info.projet];
    this.etat.assidu[info.projet] = a && a.jour === info.jour ? { jour: info.jour, n: a.n + 1 } : { jour: info.jour, n: 1 };
    if (this.etat.assidu[info.projet].n >= 5) this.accorder('perseverant');
    // Documenté : trois étiquettes au moins.
    if (info.etiquettes >= 3) this.accorder('documente');
    // Au propre : plus de dix composants, tous les fils propres.
    if (info.composants > 10 && info.fils > 0 && info.filsPropres === info.fils) this.accorder('au-propre');
  }

  /** Relevé périodique. */
  tick(s: Instantane): void {
    const r = this.run;
    if (!r) return;
    r.tMs = s.tMs;
    for (const d of s.defauts) r.defauts.add(d);
    if (s.instrument) r.instrument = true;

    // Premier nuage de fumée.
    if (s.grilles.length > 0) {
      r.aGrille = true;
      this.accorder('fumee');
    }
    const propre = s.grilles.length === 0 && !r.aGrille;

    // Loi d'Ohm : du PREMIER lancement du projet, rien détruit.
    if (propre && s.ledSaine && r.projet.lancements === 1 && !r.projet.aGrille && s.tMs >= 2000) this.accorder('ohm');

    // Niveau logique : un capteur 5 V lu par une carte 3,3 V à travers un pont, la carte survit.
    if (propre && r.info.pontNiveau && s.tMs >= 2000) this.accorder('niveau-logique');

    // Deux fois vaut mieux : il avait grillé, il tourne maintenant.
    if (propre && r.projet.aGrille && s.tMs >= DUREE_PROPRE_MS) this.accorder('deux-fois');

    // Le bon calibre : un moteur tourne sans défaut, par un transistor, 3 s de suite.
    if (propre && r.info.transistor && s.moteurSain) {
      if (r.calibreDepuis < 0) r.calibreDepuis = s.tMs;
      else if (s.tMs - r.calibreDepuis >= 3000) this.accorder('calibre');
    } else r.calibreDepuis = -1;

    // Sans attendre / Interruption : lus dans le code, confirmés par l'exécution.
    const src = r.info.source;
    if (src !== null) {
      if (sansDelay(src) && s.frontsSortie >= 6) this.accorder('sans-attendre');
      if (/\battachInterrupt\s*\(|\.irq\s*\(/.test(src) && s.frontsInterruption >= 1) this.accorder('interruption');
    }

    // Économe : moins de 1 mA de moyenne, mesuré sur 10 s de programme au moins.
    if (propre && s.tMs >= 10_000 && s.courantMoyenA !== null && s.courantMoyenA < 0.001) this.accorder('econome');

    // Trois protocoles, chacun dans un projet différent.
    const vus: ProtocoleSucces[] = [...r.info.protocoles];
    if (s.serie && !vus.includes('serie')) vus.push('serie');
    let change = false;
    for (const p of vus) {
      const l = this.etat.protocoles[p];
      if (!l.includes(r.info.projet)) {
        l.push(r.info.projet);
        change = true;
      }
    }
    if (change && representantsDistincts(this.etat.protocoles)) this.accorder('trois-protocoles');
  }

  /** Une trame décodée par l'analyseur logique. */
  bus(protocole: string, ack: boolean): void {
    if (protocole === 'i2c' && ack) this.accorder('bus');
  }

  /** Clic sur « pas suivant ». */
  pas(): void {
    const r = this.run;
    if (!r) return;
    r.pas++;
    this.verifierPas(r);
  }

  /** Nombre de points d'arrêt posés dans le code. */
  pointsArret(n: number): void {
    const r = this.run;
    if (!r) return;
    r.pointsArret = n;
    this.verifierPas(r);
  }

  private verifierPas(r: Lancement): void {
    if (r.pointsArret >= 1 && r.pas >= 10) this.accorder('pas-a-pas');
  }

  /** Fin du lancement (■, ou nouveau ▶). */
  arret(): void {
    const r = this.run;
    if (!r) return;
    this.run = null;
    const p = r.projet;
    const longue = r.tMs >= DUREE_PROPRE_MS;
    // Chercheur de panne : un défaut vu au lancement précédent a disparu de celui-ci.
    if (longue) {
      for (const d of p.defautsPrec) if (!r.defauts.has(d)) p.corriges.add(d);
      if (p.corriges.size >= 3) this.accorder('chercheur');
      p.defautsPrec = new Set(r.defauts);
    } else {
      for (const d of r.defauts) p.defautsPrec.add(d);
    }
    p.aGrille = r.aGrille || (p.aGrille && !longue);
    if (r.instrument && r.tMs >= 3000) p.mesure = true;
  }

  /** Le schéma vient d'être modifié par l'élève (hors simulation). */
  modification(): void {
    if (this.run) return;
    let mesure = false;
    for (const p of this.projets.values()) {
      if (p.mesure) mesure = true;
      p.mesure = false;
    }
    if (mesure) this.accorder('instrument');
  }
}

/** Le code garde le temps SANS bloquer : ni `delay()`, ni `sleep()`, mais millis() ou un timer. */
export function sansDelay(source: string): boolean {
  const s = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/#.*$/gm, ' ');
  if (/\bdelay(?:Microseconds)?\s*\(|\bsleep(?:_ms|_us)?\s*\(/.test(s)) return false;
  return /\bmillis\s*\(|\bmicros\s*\(|\bticks_ms\s*\(|\bticks_us\s*\(|\bticks_diff\s*\(|\bTimer\b|\bTicker\b|\bMsTimer2\b|\bTimerOne\b/.test(s);
}

/** Vrai si les trois protocoles ont chacun un projet à eux, tous différents. */
export function representantsDistincts(p: Record<ProtocoleSucces, string[]>): boolean {
  for (const a of p.i2c) {
    for (const b of p.spi) {
      if (b === a) continue;
      for (const c of p.serie) if (c !== a && c !== b) return true;
    }
  }
  return false;
}
