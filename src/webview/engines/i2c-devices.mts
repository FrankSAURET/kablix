// Modèles de périphériques I²C (esclaves) pour la « simulation protocole réelle ».
// Le moteur (AvrEngine) relie le maître I²C du MCU à ces appareils via leur
// adresse ; chaque appareil décode les octets reçus et expose un état lisible par
// l'interface (texte d'un LCD, rapports cycliques d'un PCA9685…).
//
// Module pur (sans DOM), testable hors navigateur.

/** Périphérique esclave SPI (un seul appareil par bus géré pour l'instant). */
export interface SpiDevice {
  /** Broche MCU portant le signal D/C (commande = bas, donnée = haut), si applicable. */
  dcPin?: string;
  /** Transfert d'un octet : reçoit MOSI + niveau D/C, renvoie l'octet MISO. */
  transfer(mosi: number, dc: boolean): number;
}

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

/**
 * Afficheur OLED SSD1306 en I²C (adresse 0x3C / 0x3D). Décode le flux I²C : un
 * octet de contrôle (0x00 = commandes, 0x40 = données GDDRAM) puis les octets.
 * Adressage horizontal (mode Adafruit/MicroPython) géré : on suit les plages de
 * colonnes/pages et on remplit un tampon page-major (1 octet = 8 pixels verticaux,
 * bit 0 = haut). `buffer` est lu par l'UI pour produire l'image.
 */
export class Ssd1306Device implements I2cDevice, SpiDevice {
  readonly address: number;
  readonly width: number;
  readonly height: number;
  /** Broche D/C (mode SPI) : renseignée par l'UI quand l'écran est câblé en SPI. */
  dcPin?: string;
  /** Tampon GDDRAM : pages × largeur (buffer[page*width + col] = 8 px verticaux). */
  buffer: Uint8Array;

  private gotControl = false;
  private dataMode = false;
  private cmd: number[] = [];
  private expectArgs = 0;
  private colStart = 0;
  private colEnd: number;
  private col = 0;
  private pageStart = 0;
  private pageEnd: number;
  private page = 0;

  constructor(address = 0x3c, width = 128, height = 64) {
    this.address = address;
    this.width = width;
    this.height = height;
    this.colEnd = width - 1;
    this.pageEnd = height / 8 - 1;
    this.buffer = new Uint8Array(width * (height / 8));
  }

  onStart(): void {
    this.gotControl = false; // chaque transaction commence par un octet de contrôle
  }

  write(byte: number): boolean {
    if (!this.gotControl) {
      this.gotControl = true;
      this.dataMode = (byte & 0x40) !== 0; // bit D/C
      return true;
    }
    if (this.dataMode) this.writeData(byte);
    else this.command(byte);
    return true;
  }

  read(): number {
    return 0;
  }

  /** Octet reçu en mode SPI 4 fils : D/C = bas → commande, haut → donnée GDDRAM. */
  transfer(mosi: number, dc: boolean): number {
    if (dc) this.writeData(mosi);
    else this.command(mosi);
    return 0;
  }

  private command(b: number): void {
    if (this.expectArgs > 0) {
      this.cmd.push(b);
      if (--this.expectArgs === 0) this.applyCommand();
      return;
    }
    this.cmd = [b];
    if (b === 0x21 || b === 0x22) this.expectArgs = 2; // column / page address
    else if (b === 0x20) this.expectArgs = 1; // memory addressing mode
    else this.applyCommand();
  }

  private applyCommand(): void {
    const c = this.cmd[0];
    if (c === 0x21) {
      this.colStart = this.cmd[1] & 0x7f;
      this.colEnd = this.cmd[2] & 0x7f;
      this.col = this.colStart;
    } else if (c === 0x22) {
      this.pageStart = this.cmd[1] & 0x07;
      this.pageEnd = this.cmd[2] & 0x07;
      this.page = this.pageStart;
    } else if (c >= 0xb0 && c <= 0xb7) {
      this.page = c - 0xb0; // page start (mode page)
    }
    // Autres commandes (on/off, contraste, scan…) sans effet sur le tampon.
  }

  private writeData(b: number): void {
    const idx = this.page * this.width + this.col;
    if (idx >= 0 && idx < this.buffer.length) this.buffer[idx] = b;
    this.col++;
    if (this.col > this.colEnd) {
      this.col = this.colStart;
      this.page = this.page >= this.pageEnd ? this.pageStart : this.page + 1;
    }
  }

  /** Vrai si le pixel (x,y) est allumé. */
  pixelOn(x: number, y: number): boolean {
    const page = y >> 3;
    return ((this.buffer[page * this.width + x] >> (y & 7)) & 1) === 1;
  }
}
