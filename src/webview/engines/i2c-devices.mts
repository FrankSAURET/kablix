// Modèles de périphériques I²C (esclaves) pour la « simulation protocole réelle ».
// Le moteur (AvrEngine) relie le maître I²C du MCU à ces appareils via leur
// adresse ; chaque appareil décode les octets reçus et expose un état lisible par
// l'interface (texte d'un LCD, rapports cycliques d'un PCA9685…).
//
// Module pur (sans DOM), testable hors navigateur.

/** Périphérique esclave SPI sur le bus, sélectionné par sa broche CS (actif bas). */
export interface SpiDevice {
  /** Broche MCU portant le signal D/C (commande = bas, donnée = haut), si applicable. */
  dcPin?: string;
  /** Broche MCU de sélection (CS, actif bas). Absente = toujours sélectionné. */
  csPin?: string;
  /** Transfert d'un octet : reçoit MOSI + niveau D/C, renvoie l'octet MISO. */
  transfer(mosi: number, dc: boolean): number;
  /** Notifié quand CS change (utile pour réinitialiser un état de trame). */
  onSelect?(selected: boolean): void;
}

/**
 * Choisit le périphérique SPI adressé : celui dont la broche CS est active (bas).
 * À défaut (aucun CS bas), retourne le premier périphérique sans broche CS.
 */
export function selectSpiDevice(
  devices: SpiDevice[],
  readDigital: (pin: string) => boolean
): SpiDevice | null {
  let fallback: SpiDevice | null = null;
  for (const d of devices) {
    if (!d.csPin) {
      if (!fallback) fallback = d;
      continue;
    }
    if (!readDigital(d.csPin)) return d; // CS actif bas
  }
  return fallback;
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

/**
 * Écran TFT couleur ILI9341 en SPI 4 fils (240×320). Décode les commandes (D/C
 * bas) CASET (0x2A) / RASET (0x2B) / RAMWR (0x2C) et les pixels RGB565 (D/C haut,
 * 2 octets/pixel) dans une image RGBA lue par l'UI (mise dans le canvas).
 * Orientation par défaut (MADCTL ignoré).
 */
export class Ili9341Device implements SpiDevice {
  dcPin?: string;
  csPin?: string;
  readonly width = 240;
  readonly height = 320;
  /** Image RGBA prête pour le canvas de l'élément. */
  data: Uint8ClampedArray;

  private target: 'none' | 'caset' | 'raset' | 'pixel' = 'none';
  private args: number[] = [];
  private x0 = 0;
  private x1 = 239;
  private y0 = 0;
  private y1 = 319;
  private x = 0;
  private y = 0;
  private pixHi = -1;

  constructor() {
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
    for (let i = 3; i < this.data.length; i += 4) this.data[i] = 255; // alpha opaque
  }

  transfer(mosi: number, dc: boolean): number {
    if (dc) this.dataByte(mosi);
    else this.command(mosi);
    return 0;
  }

  private command(b: number): void {
    if (b === 0x2a) {
      this.target = 'caset';
      this.args = [];
    } else if (b === 0x2b) {
      this.target = 'raset';
      this.args = [];
    } else if (b === 0x2c) {
      this.target = 'pixel';
      this.x = this.x0;
      this.y = this.y0;
      this.pixHi = -1;
    } else {
      this.target = 'none'; // autres commandes (MADCTL, format…) : paramètres ignorés
    }
  }

  private dataByte(b: number): void {
    if (this.target === 'caset' || this.target === 'raset') {
      this.args.push(b);
      if (this.args.length === 4) {
        const lo = (this.args[0] << 8) | this.args[1];
        const hi = (this.args[2] << 8) | this.args[3];
        if (this.target === 'caset') {
          this.x0 = lo;
          this.x1 = hi;
        } else {
          this.y0 = lo;
          this.y1 = hi;
        }
        this.target = 'none';
      }
    } else if (this.target === 'pixel') {
      if (this.pixHi < 0) {
        this.pixHi = b;
        return;
      }
      this.putPixel((this.pixHi << 8) | b);
      this.pixHi = -1;
    }
  }

  private putPixel(rgb565: number): void {
    if (this.x >= 0 && this.x < this.width && this.y >= 0 && this.y < this.height) {
      const r5 = (rgb565 >> 11) & 0x1f;
      const g6 = (rgb565 >> 5) & 0x3f;
      const b5 = rgb565 & 0x1f;
      const i = (this.y * this.width + this.x) * 4;
      this.data[i] = (r5 << 3) | (r5 >> 2);
      this.data[i + 1] = (g6 << 2) | (g6 >> 4);
      this.data[i + 2] = (b5 << 3) | (b5 >> 2);
    }
    if (++this.x > this.x1) {
      this.x = this.x0;
      this.y = this.y >= this.y1 ? this.y0 : this.y + 1;
    }
  }
}

/**
 * Carte microSD en mode SPI : répondeur de PROTOCOLE (pas de système de fichiers).
 * Gère l'initialisation (CMD0→idle, CMD8, CMD55/ACMD41→prêt, CMD58) et la
 * lecture/écriture de blocs de 512 o vers un stockage RAM (64 Ko). Permet à une
 * bibliothèque SD de détecter et d'initialiser la carte ; aucun FAT n'est
 * préchargé (l'ouverture de fichiers d'une carte vierge échoue, comme attendu).
 */
export class SdCardSpiDevice implements SpiDevice {
  csPin?: string;
  private store = new Uint8Array(512 * 128); // 64 Ko de blocs
  private cmd: number[] = [];
  private resp: number[] = [];
  private ready = false;
  // Réception d'un bloc d'écriture : -1 = pas en écriture, sinon octets restants.
  private writeAddr = -1;
  private writeBuf: number[] = [];

  transfer(mosi: number): number {
    // Écriture d'un bloc en cours : on avale 0xFE + 512 o + 2 CRC.
    if (this.writeAddr >= 0) {
      this.feedWrite(mosi);
      return this.resp.length ? this.resp.shift()! : 0xff;
    }
    // Collecte d'une commande : démarre sur un octet à bits 7..6 = 01.
    if (this.cmd.length === 0 && (mosi & 0xc0) === 0x40) this.cmd.push(mosi);
    else if (this.cmd.length > 0) this.cmd.push(mosi);
    if (this.cmd.length === 6) {
      this.handleCommand(this.cmd[0] & 0x3f, (this.cmd[1] << 24) | (this.cmd[2] << 16) | (this.cmd[3] << 8) | this.cmd[4]);
      this.cmd = [];
    }
    return this.resp.length ? this.resp.shift()! : 0xff;
  }

  private r1(): number {
    return this.ready ? 0x00 : 0x01; // bit 0 = idle
  }

  private handleCommand(cmd: number, arg: number): void {
    switch (cmd) {
      case 0: // GO_IDLE_STATE
        this.resp.push(0x01);
        break;
      case 8: // SEND_IF_COND : R1 + écho (carte v2)
        this.resp.push(0x01, 0x00, 0x00, 0x01, 0xaa);
        break;
      case 55: // APP_CMD
        this.resp.push(this.r1());
        break;
      case 41: // ACMD41 : initialisation terminée
        this.ready = true;
        this.resp.push(0x00);
        break;
      case 58: // READ_OCR
        this.resp.push(this.r1(), 0x80, 0xff, 0x80, 0x00);
        break;
      case 17: {
        // READ_SINGLE_BLOCK : R1=0, jeton 0xFE, 512 o, 2 CRC.
        this.resp.push(0x00, 0xfe);
        const base = (arg * 512) % this.store.length;
        for (let i = 0; i < 512; i++) this.resp.push(this.store[base + i]);
        this.resp.push(0xff, 0xff);
        break;
      }
      case 24: // WRITE_BLOCK : R1=0 puis on attend le bloc
        this.resp.push(0x00);
        this.writeAddr = (arg * 512) % this.store.length;
        this.writeBuf = [];
        break;
      default:
        this.resp.push(this.r1());
    }
  }

  private feedWrite(b: number): void {
    if (this.writeBuf.length === 0 && b !== 0xfe) return; // attend le jeton de départ
    this.writeBuf.push(b);
    // 1 (jeton) + 512 (données) + 2 (CRC) = 515 octets.
    if (this.writeBuf.length === 515) {
      for (let i = 0; i < 512; i++) this.store[this.writeAddr + i] = this.writeBuf[i + 1];
      this.resp.push(0x05, 0x00); // data response « accepté » + fin d'occupation
      this.writeAddr = -1;
      this.writeBuf = [];
    }
  }
}
