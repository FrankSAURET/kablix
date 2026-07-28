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
  /** L'esclave répond aussi au General Call (adresse 0x00) — ex. le PCA9685
   *  y reçoit son software reset (SWRST). Sans cela, l'écriture du maître à
   *  0x00 est NAKée par le bus rp2040js SIMULÉ, ce qui perturbe la transaction
   *  suivante (EIO), même quand le pilote encadre le reset d'un try/except. */
  readonly generalCall?: boolean;
  /** Le routage signale si la transaction courante vise le General Call (0x00,
   *  true) ou l'adresse propre du device (false). Appelé après onConnect. */
  setGeneralCall?(on: boolean): void;
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
 * Cœur d'affichage HD44780 : mémorise le contenu texte et interprète les octets
 * de commande/donnée, indépendamment du transport (backpack PCF8574 en I²C ou
 * bus parallèle RS/E/D0-D7). Reçoit soit des octets complets (`writeByte`, mode
 * 8 bits), soit des quartets (`writeNibble`, mode 4 bits — deux quartets, poids
 * fort d'abord, forment un octet). RS choisit commande (0) ou caractère (1).
 */
export class Hd44780 {
  readonly cols: number;
  readonly rows: number;
  /** Contenu affiché, une chaîne par ligne (longueur = cols). */
  text: string[];

  private highNibble = -1; // quartet de poids fort en attente (-1 = aucun)
  private addr = 0; // adresse DDRAM courante
  // Bases DDRAM des lignes (HD44780) : L0=0x00, L1=0x40, L2=0x14, L3=0x54.
  private static readonly ROW_BASE = [0x00, 0x40, 0x14, 0x54];

  constructor(cols = 16, rows = 2) {
    this.cols = cols;
    this.rows = rows;
    this.text = Array.from({ length: rows }, () => ' '.repeat(cols));
  }

  /** Reçoit un octet complet (mode 8 bits). */
  writeByte(value: number, rs: boolean): void {
    if (rs) this.putChar(value);
    else this.command(value);
  }

  /** Reçoit un quartet (mode 4 bits) : appaire deux quartets en un octet. */
  writeNibble(nib: number, rs: boolean): void {
    if (this.highNibble < 0) {
      this.highNibble = nib & 0x0f;
      return;
    }
    const value = (this.highNibble << 4) | (nib & 0x0f);
    this.highNibble = -1;
    this.writeByte(value, rs);
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
      const base = Hd44780.ROW_BASE[r];
      if (addr >= base && addr < base + this.cols) return [r, addr - base];
    }
    return null;
  }
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
  private readonly core: Hd44780;

  private lastByte = 0;
  private static readonly E = 0x04;

  constructor(address = 0x27, cols = 16, rows = 2) {
    this.address = address;
    this.core = new Hd44780(cols, rows);
  }

  get cols(): number {
    return this.core.cols;
  }

  get rows(): number {
    return this.core.rows;
  }

  /** Contenu affiché, une chaîne par ligne. */
  get text(): string[] {
    return this.core.text;
  }

  write(byte: number): boolean {
    const prevE = this.lastByte & Lcd1602Device.E;
    const curE = byte & Lcd1602Device.E;
    // Front descendant de E : le quartet présent (dans l'octet E-haut) est figé.
    if (prevE && !curE) {
      const b = this.lastByte;
      this.core.writeNibble((b >> 4) & 0x0f, (b & 0x01) !== 0);
    }
    this.lastByte = byte;
    return true;
  }

  read(): number {
    return 0xff;
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
  // Le PCA9685 répond au General Call (0x00) — il y reçoit son software reset.
  readonly generalCall = true;
  private regs = new Uint8Array(256);
  private ptr = 0;
  private first = true;
  /** Transaction en cours adressée au General Call (0x00) et non au device. */
  private inGeneralCall = false;

  constructor(address = 0x40) {
    this.address = address;
  }

  onStart(): void {
    this.first = true;
  }

  /** Le routage I²C signale si la transaction vise l'adresse propre (false) ou
   *  le General Call 0x00 (true) — appelé juste après onStart. */
  setGeneralCall(on: boolean): void {
    this.inGeneralCall = on;
  }

  write(byte: number): boolean {
    // General Call : 0x06 = software reset (SWRST) — remet les registres à 0
    // (toutes les sorties full-OFF). On ACK simplement les autres octets.
    if (this.inGeneralCall) {
      if (byte === 0x06) this.regs.fill(0);
      return true;
    }
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

// --- Carte microSD : géométrie de l'image FAT16 préformatée --------------------
// Une carte VIERGE n'a pas de système de fichiers : `SD.begin()` réussit (la carte
// répond) mais `SD.open()` échoue toujours, ce qui rend le composant inutilisable.
// La carte simulée est donc livrée FORMATÉE, comme une vraie carte du commerce.
// La bibliothèque SD d'Arduino (SdFat) refuse le FAT12 : il faut au moins 4085
// clusters. Avec un cluster d'un seul secteur, 4200 clusters suffisent (≈ 2 Mo).
const SD_PART_START = 1; // 1er secteur du volume (0 = MBR ; SdFat exige ≠ 0)
const SD_RESERVED = 1; // secteurs réservés (le secteur de démarrage)
const SD_FAT_COUNT = 2;
const SD_ROOT_ENTRIES = 512; // → 32 secteurs de répertoire racine
const SD_CLUSTERS = 4200; // > 4085 : FAT16 et non FAT12
const SD_SECTORS_PER_FAT = Math.ceil(((SD_CLUSTERS + 2) * 2) / 512);
const SD_ROOT_SECTORS = (SD_ROOT_ENTRIES * 32) / 512;
const SD_DATA_START = SD_RESERVED + SD_FAT_COUNT * SD_SECTORS_PER_FAT + SD_ROOT_SECTORS;
const SD_VOLUME_SECTORS = SD_DATA_START + SD_CLUSTERS;
// Taille de carte arrondie au multiple de 1024 blocs (512 Ko) : c'est l'unité du
// champ C_SIZE d'un CSD v2, donc la seule capacité qu'une carte SDHC peut annoncer
// exactement. Sinon le pilote annonce moins de blocs que n'en occupe la partition.
const SD_TOTAL_SECTORS = Math.ceil((SD_PART_START + SD_VOLUME_SECTORS) / 1024) * 1024;

/**
 * Carte microSD en mode SPI : répondeur de protocole + stockage de blocs.
 *
 * Gère l'initialisation (CMD0→idle, CMD8, CMD55/ACMD41→prêt, CMD58) et la
 * lecture/écriture de blocs de 512 o. La carte s'annonce **SDHC** (bit CCS de
 * l'OCR) : l'argument des commandes de bloc est donc un NUMÉRO de bloc, ce que
 * suppose déjà le code de lecture/écriture.
 *
 * Le stockage est **paresseux** (un tableau par bloc réellement écrit) : une carte
 * de 2 Mo ne coûte que les blocs utilisés. Les blocs du formatage FAT16 sont
 * générés au premier accès.
 */
export class SdCardSpiDevice implements SpiDevice {
  csPin?: string;
  private blocks = new Map<number, Uint8Array>();
  private cmd: number[] = [];
  private resp: number[] = [];
  private ready = false;
  // Réception d'un bloc d'écriture : -1 = pas en écriture, sinon n° de bloc visé.
  private writeBlock = -1;
  private writeBuf: number[] = [];
  // Écriture MULTIPLE (CMD25) : les blocs se suivent, chacun précédé du jeton
  // 0xFC, la série se terminant par 0xFD.
  private writeMulti = false;
  // Lecture MULTIPLE (CMD18) : numéro du prochain bloc à servir, -1 si aucune.
  private readMulti = -1;
  private selected = false;

  constructor() {
    this.format();
  }

  /** Nombre de blocs de 512 o de la carte simulée. */
  get blockCount(): number {
    return SD_TOTAL_SECTORS;
  }

  /** Lecture d'un bloc (jamais `undefined` : un bloc jamais écrit vaut zéro). */
  readBlock(index: number): Uint8Array {
    return this.blocks.get(index) ?? new Uint8Array(512);
  }

  /** Bloc modifiable, créé à la volée. */
  private blockFor(index: number): Uint8Array {
    let b = this.blocks.get(index);
    if (!b) {
      b = new Uint8Array(512);
      this.blocks.set(index, b);
    }
    return b;
  }

  /**
   * Écrit le MBR, le secteur de démarrage FAT16 et les deux tables d'allocation :
   * la carte est vue formatée par la bibliothèque SD, `open()` et `write()`
   * fonctionnent. Le reste (racine, données) part à zéro, comme après un formatage.
   */
  private format(): void {
    const le16 = (b: Uint8Array, off: number, v: number): void => {
      b[off] = v & 0xff;
      b[off + 1] = (v >> 8) & 0xff;
    };
    const le32 = (b: Uint8Array, off: number, v: number): void => {
      le16(b, off, v & 0xffff);
      le16(b, off + 2, (v >>> 16) & 0xffff);
    };
    const ascii = (b: Uint8Array, off: number, s: string, len: number): void => {
      for (let i = 0; i < len; i++) b[off + i] = i < s.length ? s.charCodeAt(i) : 0x20;
    };

    // MBR : une seule partition FAT16, amorçable non marquée.
    const mbr = this.blockFor(0);
    const p = 446;
    mbr[p] = 0x00; // pas de drapeau d'amorçage (SdFat exige boot & 0x7F == 0)
    mbr[p + 1] = 0x01; // CHS de début, valeurs sans importance ici
    mbr[p + 2] = 0x01;
    mbr[p + 3] = 0x00;
    mbr[p + 4] = 0x06; // type 0x06 : FAT16
    mbr[p + 5] = 0xfe;
    mbr[p + 6] = 0xff;
    mbr[p + 7] = 0xff;
    le32(mbr, p + 8, SD_PART_START);
    le32(mbr, p + 12, SD_VOLUME_SECTORS);
    mbr[510] = 0x55;
    mbr[511] = 0xaa;

    // Secteur de démarrage (BIOS Parameter Block) du volume FAT16.
    const bs = this.blockFor(SD_PART_START);
    bs[0] = 0xeb;
    bs[1] = 0x3c;
    bs[2] = 0x90;
    ascii(bs, 3, 'MSDOS5.0', 8);
    le16(bs, 11, 512); // octets par secteur
    bs[13] = 1; // secteurs par cluster
    le16(bs, 14, SD_RESERVED);
    bs[16] = SD_FAT_COUNT;
    le16(bs, 17, SD_ROOT_ENTRIES);
    le16(bs, 19, SD_VOLUME_SECTORS); // tient sur 16 bits (≈ 4 300)
    bs[21] = 0xf8; // disque fixe
    le16(bs, 22, SD_SECTORS_PER_FAT);
    le16(bs, 24, 63); // secteurs par piste (hérité, ignoré)
    le16(bs, 26, 255); // têtes (hérité, ignoré)
    le32(bs, 28, SD_PART_START); // secteurs cachés
    le32(bs, 32, 0); // total 32 bits inutilisé : le champ 16 bits suffit
    bs[36] = 0x80;
    bs[38] = 0x29; // signature de bloc étendu
    le32(bs, 39, 0x4b41424c); // numéro de série
    ascii(bs, 43, 'KABLIX', 11);
    ascii(bs, 54, 'FAT16', 8);
    bs[510] = 0x55;
    bs[511] = 0xaa;

    // Premier secteur de chaque table : entrées 0 et 1 réservées.
    for (let f = 0; f < SD_FAT_COUNT; f++) {
      const fat = this.blockFor(SD_PART_START + SD_RESERVED + f * SD_SECTORS_PER_FAT);
      le16(fat, 0, 0xfff8);
      le16(fat, 2, 0xffff);
    }
  }

  /** Réinitialise l'automate de trame quand la carte est désélectionnée. */
  onSelect(selected: boolean): void {
    this.selected = selected;
    if (selected) return;
    this.cmd = [];
    this.resp = [];
    // Une écriture ANNONCÉE dont aucune donnée n'est encore arrivée survit à la
    // désélection : le pilote `sdcard.py` de MicroPython relève CS entre le CMD24
    // et le bloc de données (et à chaque bloc d'une série CMD25). Tout annuler ici
    // faisait perdre l'écriture — le fichier restait vide. En revanche, un bloc
    // COMMENCÉ puis interrompu est bel et bien une trame cassée : on l'abandonne.
    if (this.writeBuf.length > 0) {
      this.writeBlock = -1;
      this.writeBuf = [];
      this.writeMulti = false;
    }
  }

  transfer(mosi: number): number {
    // L'octet renvoyé est celui préparé AVANT ce transfert. Une vraie carte a
    // toujours au moins un octet de latence (Ncr) entre le dernier octet d'une
    // commande et son premier octet de réponse — et la bibliothèque ne lit
    // qu'APRÈS avoir envoyé les six octets. En répondant dans le même octet, la
    // carte plaçait son R1 là où personne ne le lisait : la bibliothèque ne
    // recevait plus que des 0xFF, `SD.begin()` expirait, et rien ne marchait.
    // Lecture MULTIPLE en cours : dès que la réponse est épuisée, la carte enchaîne
    // le bloc suivant — mais SEULEMENT si elle est sélectionnée. Le pilote
    // MicroPython relève CS entre deux blocs puis envoie un octet à vide : servir
    // le jeton 0xFE à ce moment-là le ferait manquer, et tout le bloc se décalerait.
    if (this.readMulti >= 0 && this.resp.length === 0 && this.selected) this.pushBlock(this.readMulti++);
    const out = this.resp.length ? this.resp.shift()! : 0xff;
    // Écriture d'un bloc en cours : on avale 0xFE + 512 o + 2 CRC.
    if (this.writeBlock >= 0) {
      this.feedWrite(mosi);
      return out;
    }
    // Collecte d'une commande : démarre sur un octet à bits 7..6 = 01.
    if (this.cmd.length === 0 && (mosi & 0xc0) === 0x40) this.cmd.push(mosi);
    else if (this.cmd.length > 0) this.cmd.push(mosi);
    if (this.cmd.length === 6) {
      this.handleCommand(
        this.cmd[0] & 0x3f,
        ((this.cmd[1] << 24) | (this.cmd[2] << 16) | (this.cmd[3] << 8) | this.cmd[4]) >>> 0
      );
      this.cmd = [];
    }
    return out;
  }

  private r1(): number {
    return this.ready ? 0x00 : 0x01; // bit 0 = idle
  }

  /** Empile un bloc de données : jeton 0xFE, 512 octets, 2 octets de CRC. */
  private pushBlock(index: number): void {
    this.resp.push(0xfe);
    const b = this.readBlock(index);
    for (let i = 0; i < 512; i++) this.resp.push(b[i]);
    this.resp.push(0xff, 0xff);
  }

  private handleCommand(cmd: number, arg: number): void {
    // Toute commande autre que l'arrêt interrompt une lecture multiple en cours :
    // sinon sa réponse se rangerait DERRIÈRE des centaines d'octets de données.
    if (cmd !== 12 && this.readMulti >= 0) {
      this.readMulti = -1;
      this.resp = [];
    }
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
      case 58: {
        // READ_OCR. Bits 31 (alimentée) ET 30 (CCS) à 1 : carte SDHC, donc
        // l'argument des CMD17/CMD24 est un NUMÉRO DE BLOC. Avec 0x80, SdFat
        // aurait pris une carte à adressage par octet et multiplié l'adresse par
        // 512 de son côté — la carte lisait alors 512 blocs plus loin.
        this.resp.push(this.r1(), 0xc0, 0xff, 0x80, 0x00);
        break;
      }
      case 9: {
        // SEND_CSD : CSD v2 (SDHC). C_SIZE tient sur 22 bits, à cheval sur les
        // octets 7 (6 bits de poids fort), 8 et 9 — et NON 8/9/10 : décalé d'un
        // octet, le pilote `sdcard.py` de MicroPython (qui lit `csd[8]<<8|csd[9]`)
        // voyait une carte de 512 Ko au lieu de 2,5 Mo, plus petite que sa propre
        // partition. Capacité = (C_SIZE + 1) × 512 Ko, d'où la taille de carte
        // arrondie au multiple de 1024 blocs.
        const size = SD_TOTAL_SECTORS / 1024 - 1;
        const csd = [
          0x40, 0x0e, 0x00, 0x32, 0x5b, 0x59, 0x00,
          (size >> 16) & 0x3f, (size >> 8) & 0xff, size & 0xff,
          0x00, 0x7f, 0x80, 0x0a, 0x40, 0x01,
        ];
        this.resp.push(0x00, 0xfe, ...csd, 0xff, 0xff);
        break;
      }
      case 17: // READ_SINGLE_BLOCK : R1=0, jeton 0xFE, 512 o, 2 CRC.
        this.resp.push(0x00);
        this.pushBlock(arg);
        break;
      case 18: // READ_MULTIPLE_BLOCK : blocs enchaînés jusqu'au CMD12
        this.resp.push(0x00);
        this.readMulti = arg;
        break;
      case 12:
        // STOP_TRANSMISSION : arrête la lecture multiple. Le premier octet renvoyé
        // est un octet bidon (« stuff byte ») que le pilote saute — d'où le
        // `skip1=True` de `sdcard.py` — avant le R1 et l'octet d'occupation.
        this.readMulti = -1;
        this.resp = [0xff, this.r1(), 0x00];
        break;
      case 24: // WRITE_BLOCK : R1=0 puis on attend le bloc
        this.resp.push(0x00);
        this.writeBlock = arg;
        this.writeBuf = [];
        this.writeMulti = false;
        break;
      case 25: // WRITE_MULTIPLE_BLOCK : série de blocs consécutifs
        this.resp.push(0x00);
        this.writeBlock = arg;
        this.writeBuf = [];
        this.writeMulti = true;
        break;
      case 13:
        // SEND_STATUS : réponse R2, soit DEUX octets (R1 + un octet d'état).
        // `Sd2Card::writeBlock` la lit APRÈS chaque bloc écrit et échoue si le
        // second octet n'est pas nul. Avec la réponse R1 d'un seul octet, la
        // bibliothèque lisait 0xFF en second et concluait à une erreur de
        // programmation : `SD.open(..., FILE_WRITE)` échouait à tous les coups
        // alors que l'initialisation et la lecture, elles, marchaient.
        this.resp.push(this.r1(), 0x00);
        break;
      default:
        this.resp.push(this.r1());
    }
  }

  private feedWrite(b: number): void {
    if (this.writeBuf.length === 0) {
      // Fin d'une série CMD25 : jeton d'arrêt, puis un octet d'occupation.
      if (this.writeMulti && b === 0xfd) {
        this.resp.push(0x00);
        this.writeBlock = -1;
        this.writeMulti = false;
        return;
      }
      if (b !== (this.writeMulti ? 0xfc : 0xfe)) return; // attend le jeton de départ
    }
    this.writeBuf.push(b);
    // 1 (jeton) + 512 (données) + 2 (CRC) = 515 octets.
    if (this.writeBuf.length === 515) {
      const dst = this.blockFor(this.writeBlock);
      for (let i = 0; i < 512; i++) dst[i] = this.writeBuf[i + 1];
      this.resp.push(0x05, 0x00); // data response « accepté » + fin d'occupation
      this.writeBuf = [];
      // En série, le bloc suivant s'écrit juste après ; sinon l'écriture est finie.
      if (this.writeMulti) this.writeBlock++;
      else this.writeBlock = -1;
    }
  }
}
