// Modèles de périphériques I²C (esclaves) pour la « simulation protocole réelle ».
// Le moteur (AvrEngine) relie le maître I²C du MCU à ces appareils via leur
// adresse ; chaque appareil décode les octets reçus et expose un état lisible par
// l'interface (texte d'un LCD, rapports cycliques d'un PCA9685…).
//
// Module pur (sans DOM), testable hors navigateur.

/** Périphérique esclave I²C adressable sur le bus. */
export interface I2cDevice {
  /** Adresse 7 bits de l'esclave. */
  readonly address: number;
  /** Début de transaction (START / repeated START). */
  onStart?(repeated: boolean): void;
  /** Fin de transaction (STOP). */
  onStop?(): void;
  /** Le maître écrit un octet ; retourne true pour ACK. */
  write(byte: number): boolean;
  /** Le maître lit un octet de l'esclave. */
  read(): number;
}

/**
 * Afficheur LCD HD44780 piloté par un backpack PCF8574 en mode 4 bits (montages
 * « LCD I²C » classiques, adresse 0x27 ou 0x3F). Bits du PCF8574 :
 *   P0=RS, P1=RW, P2=E, P3=rétroéclairage, P4..P7 = D4..D7 (quartet de données).
 * Chaque quartet est verrouillé sur le front descendant de E ; deux quartets
 * forment un octet (commande si RS=0, caractère si RS=1).
 */
export class Lcd1602Device implements I2cDevice {
  readonly address: number;
  readonly cols: number;
  readonly rows: number;
  /** Contenu affiché, une chaîne par ligne (longueur = cols). */
  text: string[];

  private lastByte = 0;
  private highNibble = -1; // quartet de poids fort en attente (-1 = aucun)
  private addr = 0; // adresse DDRAM courante
  private static readonly E = 0x04;
  // Bases DDRAM des lignes (HD44780) : L0=0x00, L1=0x40, L2=0x14, L3=0x54.
  private static readonly ROW_BASE = [0x00, 0x40, 0x14, 0x54];

  constructor(address = 0x27, cols = 16, rows = 2) {
    this.address = address;
    this.cols = cols;
    this.rows = rows;
    this.text = Array.from({ length: rows }, () => ' '.repeat(cols));
  }

  write(byte: number): boolean {
    const prevE = this.lastByte & Lcd1602Device.E;
    const curE = byte & Lcd1602Device.E;
    // Front descendant de E : le quartet présent (dans l'octet E-haut) est figé.
    if (prevE && !curE) this.latch(this.lastByte);
    this.lastByte = byte;
    return true;
  }

  read(): number {
    return 0xff;
  }

  private latch(b: number): void {
    const rs = b & 0x01;
    const nib = (b >> 4) & 0x0f;
    if (this.highNibble < 0) {
      this.highNibble = nib;
      return;
    }
    const value = (this.highNibble << 4) | nib;
    this.highNibble = -1;
    if (rs) this.putChar(value);
    else this.command(value);
  }

  private command(v: number): void {
    if (v === 0x01) {
      // Clear display.
      this.text = Array.from({ length: this.rows }, () => ' '.repeat(this.cols));
      this.addr = 0;
    } else if (v === 0x02 || v === 0x03) {
      this.addr = 0; // Return home.
    } else if (v & 0x80) {
      this.addr = v & 0x7f; // Set DDRAM address.
    }
    // Function set / display control / entry mode : sans effet sur le rendu texte.
  }

  private putChar(code: number): void {
    const rc = this.rowCol(this.addr);
    if (rc) {
      const [row, col] = rc;
      const line = this.text[row].split('');
      line[col] = code >= 32 && code < 127 ? String.fromCharCode(code) : ' ';
      this.text[row] = line.join('');
    }
    this.addr++; // mode incrément par défaut
  }

  private rowCol(addr: number): [number, number] | null {
    for (let r = 0; r < this.rows; r++) {
      const base = Lcd1602Device.ROW_BASE[r];
      if (addr >= base && addr < base + this.cols) return [r, addr - base];
    }
    return null;
  }
}

/**
 * Driver PWM 16 canaux PCA9685 (adresse 0x40 par défaut). Mémorise les registres
 * écrits (auto-incrément du pointeur) et expose le rapport cyclique de chaque
 * canal. Registres : LED{n}_ON_L à 0x06+4n (ON 12 bits, OFF 12 bits ; bit 4 du
 * registre _H = pleine échelle ON/OFF).
 */
export class Pca9685Device implements I2cDevice {
  readonly address: number;
  private regs = new Uint8Array(256);
  private ptr = 0;
  private first = true;

  constructor(address = 0x40) {
    this.address = address;
  }

  onStart(): void {
    this.first = true;
  }

  write(byte: number): boolean {
    if (this.first) {
      this.ptr = byte; // 1er octet = pointeur de registre
      this.first = false;
    } else {
      this.regs[this.ptr & 0xff] = byte;
      this.ptr = (this.ptr + 1) & 0xff; // auto-incrément
    }
    return true;
  }

  read(): number {
    const v = this.regs[this.ptr & 0xff];
    this.ptr = (this.ptr + 1) & 0xff;
    return v;
  }

  /** Rapport cyclique (0..1) du canal `ch` (0..15). */
  channelDuty(ch: number): number {
    const base = 0x06 + 4 * ch;
    if (base + 3 > 0xff) return 0;
    if (this.regs[base + 1] & 0x10) return 1; // full ON
    if (this.regs[base + 3] & 0x10) return 0; // full OFF
    const on = (this.regs[base] | (this.regs[base + 1] << 8)) & 0x0fff;
    const off = (this.regs[base + 2] | (this.regs[base + 3] << 8)) & 0x0fff;
    let d = (off - on) / 4096;
    if (d < 0) d += 1; // déphasage : le créneau « repasse » par 0
    return Math.max(0, Math.min(1, d));
  }
}
