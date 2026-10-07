/**
 * Fronts d'un bus I²C (SDA + SCL), recalculés depuis les échanges du maître —
 * partagé par les deux moteurs (Pico et Arduino).
 *
 * Même raison d'être que uart-fronts.mts : dans les deux émulateurs, le
 * contrôleur I²C matériel ne pilote JAMAIS ses broches. START, adresse, octets
 * et STOP partent droit aux esclaves simulés (carte 16 servos, écran OLED…) et
 * SDA/SCL ne bougent pas. Deux pinces posées sur GP8/GP9 restaient plates,
 * l'analyseur attendait son front de déclenchement pour toujours (Frank,
 * 07/10/2026, « 16 servo + alim-pico2 »).
 *
 * Le signal est connu exactement : on le rejoue depuis sa forme. Chaque bit
 * occupe une période d'horloge T : SDA change pendant que SCL est bas (au quart
 * de période), SCL monte à la moitié et redescend à la fin. START = SDA descend
 * pendant que SCL est haut ; STOP = SDA monte pendant que SCL est haut.
 *
 * Les échanges arrivent tous pendant le même relevé de cycles (l'émulateur les
 * complète instantanément) : on les CHAÎNE, chacun après la fin du précédent,
 * comme les trames série. Un silence sur le bus reste un silence.
 */

/** Fronts absolus d'un morceau d'échange, en µs simulées : [instant, niveau…]. */
export interface FrontsI2c {
  sda: number[];
  scl: number[];
}

/** État d'une ligne I²C (un contrôleur) et heure de fin du dernier morceau émis. */
export class LigneI2c {
  private sda = 1;
  private scl = 1;
  private finUs = 0;

  /** Repart d'un bus au repos (nouvelle capture). */
  reset(): void {
    this.sda = 1;
    this.scl = 1;
    this.finUs = 0;
  }

  /** START, ou START répété si SCL est déjà bas (milieu de transaction). */
  start(maintenantUs: number, periodeUs: number): FrontsI2c {
    return this.morceau(maintenantUs, periodeUs, periodeUs, (f, t0, T) => {
      // Répété : relâcher SDA puis SCL avant de redescendre. Au repos, ces deux
      // fronts n'existent pas (les deux lignes sont déjà hautes).
      this.poser(f, 'sda', 1, t0 + 0.1 * T);
      this.poser(f, 'scl', 1, t0 + 0.35 * T);
      this.poser(f, 'sda', 0, t0 + 0.6 * T);
      this.poser(f, 'scl', 0, t0 + T);
    });
  }

  /**
   * Un octet, poids fort d'abord, suivi du bit d'acquittement : `ack` vrai =
   * SDA tiré bas (ACK), faux = SDA laissé haut (NAK).
   */
  octet(valeur: number, ack: boolean, maintenantUs: number, periodeUs: number): FrontsI2c {
    return this.morceau(maintenantUs, periodeUs, 9 * periodeUs, (f, t0, T) => {
      for (let i = 0; i < 9; i++) {
        const bit = i < 8 ? (valeur >> (7 - i)) & 1 : ack ? 0 : 1;
        const debut = t0 + i * T;
        this.poser(f, 'sda', bit, debut + 0.25 * T);
        this.poser(f, 'scl', 1, debut + 0.5 * T);
        this.poser(f, 'scl', 0, debut + T);
      }
    });
  }

  /** STOP : SDA bas, SCL monte, puis SDA monte. Une demi-période de bus libre suit. */
  stop(maintenantUs: number, periodeUs: number): FrontsI2c {
    return this.morceau(maintenantUs, periodeUs, 1.5 * periodeUs, (f, t0, T) => {
      this.poser(f, 'sda', 0, t0 + 0.25 * T);
      this.poser(f, 'scl', 1, t0 + 0.5 * T);
      this.poser(f, 'sda', 1, t0 + T);
    });
  }

  /** Date un morceau après le précédent (ou maintenant si le bus s'est tu). */
  private morceau(
    maintenantUs: number,
    periodeUs: number,
    dureeUs: number,
    tracer: (f: FrontsI2c, t0: number, T: number) => void
  ): FrontsI2c {
    const t0 = Math.max(maintenantUs, this.finUs);
    this.finUs = t0 + dureeUs;
    const f: FrontsI2c = { sda: [], scl: [] };
    tracer(f, t0, periodeUs);
    return f;
  }

  /** Seuls les CHANGEMENTS font un front. */
  private poser(f: FrontsI2c, ligne: 'sda' | 'scl', niveau: number, t: number): void {
    if (this[ligne] === niveau) return;
    this[ligne] = niveau;
    f[ligne].push(t, niveau);
  }
}

/**
 * Période d'horloge I²C bornée : un registre encore à zéro (contrôleur pas
 * configuré) ou absurde ne doit pas produire des fronts au même instant ni
 * étaler un octet sur une seconde. Repli : 100 kHz, le débit standard.
 */
export function periodeI2cUs(freqHz: number): number {
  if (!Number.isFinite(freqHz) || freqHz <= 0) return 10;
  return 1_000_000 / Math.min(3_400_000, Math.max(10_000, freqHz));
}
