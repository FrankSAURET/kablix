/**
 * Décodeur DMX512 branché sur le flux d'octets d'un UART matériel.
 *
 * Une trame DMX512 ne commence pas par un octet mais par un BREAK (ligne basse
 * ≥ 88 µs) suivi d'un MAB, que l'UART ne sait pas produire : les programmes le
 * tiennent à la main (broche TX pilotée en GPIO côté Arduino, `sendbreak()` côté
 * MicroPython). Rien de tout cela n'apparaît dans `onByteTransmit` — le décodeur
 * se resynchronise donc sur le SILENCE : à 250 kbauds, deux octets d'une même
 * trame sont séparés de ~44 µs, un BREAK en fait au moins 88. Au-delà du seuil,
 * l'octet suivant est un START CODE.
 *
 * Seul le start code 0 (« éclairage ») est retenu : les autres (RDM, test…) ne
 * portent pas de niveaux de projecteur et ne doivent pas écraser l'univers. Cette
 * garde protège aussi le cas ordinaire — la même broche TX sert au moniteur
 * série, et un `Serial.println` ne doit pas allumer un projecteur.
 *
 * Les canaux sont appliqués AU FIL DE L'EAU : un vrai récepteur attend la fin de
 * trame, mais 512 canaux à 250 kbauds font 23 ms de retard pour rien. Le décodeur
 * ne prévient personne de lui-même ; c'est le moteur qui relève `takeChanged()`
 * à sa cadence de publication, sinon un balayage de 512 canaux coûterait 512
 * messages.
 */

/** Silence minimal séparant deux trames, en µs simulées (BREAK de la norme). */
const GAP_US = 88;

/** Canaux d'un univers, plus le start code en tête (index 0). */
export const DMX_SLOTS = 513;

export class DmxDecoder {
  /** Univers courant : index 0 = start code, 1..512 = canaux. */
  readonly universe = new Uint8Array(DMX_SLOTS);

  /** Instant du dernier octet reçu, en µs simulées (−1 = aucun). */
  private lastUs = -1;
  /** Position dans la trame courante (0 = start code) ; −1 = trame ignorée. */
  private slot = -1;
  /** Vrai si un canal a bougé depuis le dernier relevé. */
  private dirty = false;
  /** Le prochain octet est le start code (après un BREAK explicite). */
  private awaitStart = false;

  /** Un octet vient de partir sur la ligne, daté en µs de temps SIMULÉ. */
  feed(byte: number, us: number): void {
    const nouvelle = this.lastUs < 0 || us - this.lastUs >= GAP_US;
    this.lastUs = us;
    if (nouvelle) {
      // Le silence a fermé la trame précédente : celle-ci s'ouvre sur son start
      // code. Un start code non nul (RDM…) met le décodeur en sommeil jusqu'au
      // prochain silence.
      this.awaitStart = false;
      this.startCode(byte);
      return;
    }
    this.pushSlot(byte);
  }

  /**
   * Octet d'une ligne dont les trames sont délimitées par un BREAK EXPLICITE
   * (ligne bit-bangée : DmxSimple & co, voir DmxWire). Le silence ne dit rien
   * ici — la routine d'interruption qui produit la trame souffle jusqu'à 2 ms
   * au milieu de celle-ci, ce qui rouvrirait une trame à chaque respiration.
   */
  feedFramed(byte: number): void {
    if (this.awaitStart) {
      this.awaitStart = false;
      this.startCode(byte);
      return;
    }
    this.pushSlot(byte);
  }

  /** Premier octet d'une trame : start code 0 (éclairage) ou trame ignorée. */
  private startCode(byte: number): void {
    this.slot = byte === 0 ? 0 : -1;
  }

  /** Octet suivant : canal `slot`, s'il reste dans l'univers. */
  private pushSlot(byte: number): void {
    if (this.slot < 0) return;
    this.slot += 1;
    if (this.slot >= DMX_SLOTS) return;
    if (this.universe[this.slot] !== byte) {
      this.universe[this.slot] = byte;
      this.dirty = true;
    }
  }

  /** BREAK explicite (uart.sendbreak, ligne bit-bangée) : ferme la trame. */
  breakDetected(): void {
    this.lastUs = -1;
    this.slot = -1;
    this.awaitStart = true;
  }

  /** L'univers s'il a changé depuis le dernier appel, `null` sinon. */
  takeChanged(): Uint8Array | null {
    if (!this.dirty) return null;
    this.dirty = false;
    return this.universe;
  }

  /** Remet à zéro (arrêt de simulation, recâblage). */
  reset(): void {
    this.universe.fill(0);
    this.lastUs = -1;
    this.slot = -1;
    this.dirty = false;
    this.awaitStart = false;
  }
}

/** Durée d'un bit à 250 kbauds, en µs. */
const BIT_US = 4;
/** Un niveau bas d'au moins 22 bits (88 µs) est un BREAK, pas un octet. */
const BREAK_BITS = 22;
/**
 * Bits poussés au plus pour un même palier. Au repos la ligne reste haute des
 * millisecondes : au-delà d'un octet complet, la machine est de toute façon en
 * attente de start bit — inutile de compter 500 fois « 1 ».
 */
const MAX_BITS = 16;

/**
 * Décodeur DMX512 branché sur le FIL, pour les bibliothèques qui produisent la
 * trame à la main sur une broche ordinaire (DmxSimple sur la broche 3 par
 * défaut, shield Tinker.it!) au lieu d'un UART matériel. Rien ne passe alors par
 * `onByteTransmit` : le seul signal est le niveau de la broche.
 *
 * On ne suréchantillonne PAS la ligne (250 kbauds = un point toutes les 4 µs) :
 * on date les FRONTS. Entre deux fronts, la durée écoulée donne le nombre de
 * bits du palier, et ces bits alimentent un UART logiciel 8N2. Le coût est donc
 * proportionnel aux transitions, pas au temps.
 *
 * Un palier bas d'au moins 88 µs est le BREAK d'ouverture de trame — c'est lui
 * qui délimite les trames ici, pas le silence : la routine d'interruption qui
 * bit-bangue la trame la découpe en tranches et peut souffler 2 ms au milieu.
 */
export class DmxWire {
  readonly decoder = new DmxDecoder();

  /** Niveau courant de la ligne (repos = haut). */
  private level = true;
  /** Date du dernier front, en µs simulées (−1 = pas encore d'échantillon). */
  private edgeUs = -1;
  /** Octet en cours de réception (LSB en premier). */
  private acc = 0;
  /** 0 = attente du start bit, 1..8 = bits de données, 9 = stop. */
  private count = 0;

  /** Niveau de la broche, daté en µs simulées. Appelé à chaque écriture de port. */
  sample(high: boolean, us: number): void {
    if (this.edgeUs < 0) {
      this.level = high;
      this.edgeUs = us;
      return;
    }
    if (high === this.level) return; // pas un front : rien à décoder
    const bits = Math.round((us - this.edgeUs) / BIT_US);
    const fini = this.level; // le palier qui vient de se TERMINER
    this.level = high;
    this.edgeUs = us;
    if (bits <= 0) return;
    if (!fini && bits >= BREAK_BITS) {
      this.decoder.breakDetected();
      this.count = 0;
      return;
    }
    const n = Math.min(bits, MAX_BITS);
    for (let i = 0; i < n; i++) this.feedBit(fini ? 1 : 0);
  }

  /** Remet la ligne au repos (arrêt de simulation, recâblage). */
  reset(): void {
    this.decoder.reset();
    this.level = true;
    this.edgeUs = -1;
    this.acc = 0;
    this.count = 0;
  }

  /** UART logiciel 8N2 : start à 0, huit bits LSB d'abord, stop à 1. */
  private feedBit(bit: number): void {
    if (this.count === 0) {
      if (bit === 0) {
        this.count = 1;
        this.acc = 0;
      }
      return; // ligne au repos
    }
    if (this.count <= 8) {
      if (bit) this.acc |= 1 << (this.count - 1);
      this.count += 1;
      return;
    }
    // Bit de stop : un 0 ici est un octet mal cadré, on le jette. Le second
    // stop bit passera pour du repos, ce qu'il est.
    this.count = 0;
    if (bit === 1) this.decoder.feedFramed(this.acc);
  }
}
