// Puce flash SPI (famille Winbond W25Q) branchée derrière le contrôleur QSPI
// de la puce simulée : SSI du RP2040, QMI du RP2350.
//
// Ni rp2040js ni rp2350js n'émulent cette puce : la flash n'y est qu'un tableau
// lu par la fenêtre XIP (0x10000000), et tout octet envoyé au contrôleur
// partait dans le vide. Les routines du bootrom (flash_range_erase,
// flash_range_program) ne changeaient donc rien : `rp2.Flash()` perdait ses
// écritures, LittleFS ne pouvait pas formater, et MicroPython démarrait sans
// système de fichiers (`open(..., 'w')` → ENODEV).
//
// Ici, chaque octet échangé pendant que CS est forcé bas passe par l'automate
// de commandes de la puce, qui lit et modifie le MÊME tableau que la fenêtre
// XIP : ce qui est programmé se relit aussitôt, et survit à un soft_reset.
// Hors CS forcé (boot2, mode XIP configuré par le contrôleur lui-même), on ne
// fait qu'acquitter : réponse 0, comme avant.

/** Commandes reconnues (jeu Winbond, celui qu'emploient les deux bootroms). */
const CMD = {
  ecrireStatus: 0x01,
  programmerPage: 0x02,
  lire: 0x03,
  interdireEcriture: 0x04,
  lireStatus1: 0x05,
  autoriserEcriture: 0x06,
  lireRapide: 0x0b,
  lireStatus3: 0x15,
  effacerSecteur: 0x20,
  ecrireStatus2: 0x31,
  lireStatus2: 0x35,
  identifiantUnique: 0x4b,
  effacerBloc32: 0x52,
  effacerPuce: 0x60,
  idFabricant: 0x90,
  jedec: 0x9f,
  reveil: 0xab,
  effacerPuce2: 0xc7,
  effacerBloc64: 0xd8,
} as const;

/** Bit WEL (écriture autorisée) du registre d'état 1. */
const SR1_WEL = 0x02;
/** Identifiant unique rendu par 0x4B : fixe, pour que `machine.unique_id()` soit stable. */
const ID_UNIQUE = [0xe6, 0x61, 0x41, 0x04, 0x03, 0x4b, 0x2a, 0x31];

export class PuceFlashSpi {
  private selectionnee = false;
  /** Rang de l'octet dans la transaction en cours (0 = la commande). */
  private rang = 0;
  private commande = 0;
  private adresse = 0;
  private sr1 = 0;
  /** QE (bit 1) posé d'usine sur les puces des Pico : boot2 n'a rien à écrire. */
  private sr2 = 0x02;
  private readonly masque: number;

  /**
   * @param flash tableau partagé avec la fenêtre XIP de la puce simulée
   * @param jedec identifiant JEDEC sur 24 bits (0xEF4015 = W25Q16, 2 Mo)
   */
  constructor(
    private readonly flash: Uint8Array,
    private readonly jedec: number,
  ) {
    // Les deux bibliothèques allouent une flash en puissance de deux (16 Mo).
    this.masque = flash.length - 1;
  }

  /** CS forcé bas (vrai) ou relâché : un relâchement termine la commande. */
  selectionner(actif: boolean): void {
    if (actif === this.selectionnee) return;
    if (!actif) this.terminer();
    this.selectionnee = actif;
    this.rang = 0;
  }

  get active(): boolean {
    return this.selectionnee;
  }

  /** Un octet sort sur MOSI, l'octet rendu est celui de MISO. */
  echanger(octet: number): number {
    if (!this.selectionnee) return 0;
    const rang = this.rang++;
    if (rang === 0) {
      this.commande = octet & 0xff;
      this.adresse = 0;
      if (this.commande === CMD.autoriserEcriture) this.sr1 |= SR1_WEL;
      else if (this.commande === CMD.interdireEcriture) this.sr1 &= ~SR1_WEL;
      return 0;
    }
    switch (this.commande) {
      case CMD.lireStatus1:
        return this.sr1;
      case CMD.lireStatus2:
        return this.sr2;
      case CMD.lireStatus3:
        return 0;
      case CMD.ecrireStatus:
        if (this.sr1 & SR1_WEL) {
          if (rang === 1) this.sr1 = (octet & 0xfc) | (this.sr1 & SR1_WEL);
          else if (rang === 2) this.sr2 = octet & 0xff;
        }
        return 0;
      case CMD.ecrireStatus2:
        if (rang === 1 && this.sr1 & SR1_WEL) this.sr2 = octet & 0xff;
        return 0;
      case CMD.jedec:
        return rang <= 3 ? (this.jedec >>> (8 * (3 - rang))) & 0xff : 0;
      case CMD.identifiantUnique:
        // Quatre octets factices, puis les huit de l'identifiant.
        return rang >= 5 && rang < 13 ? ID_UNIQUE[rang - 5] : 0;
      case CMD.reveil:
        // Trois octets factices, puis l'identifiant court de la puce.
        return rang >= 4 ? this.jedec & 0xff : 0;
      case CMD.idFabricant:
        if (rang <= 3) return 0;
        return (rang & 1) === 0 ? this.jedec >>> 16 : (this.jedec & 0xff) - 1;
    }
    // Commandes à adresse : trois octets d'adresse après la commande.
    if (rang <= 3) {
      this.adresse = (this.adresse << 8) | (octet & 0xff);
      return 0;
    }
    switch (this.commande) {
      case CMD.lire:
        return this.flash[this.adresse++ & this.masque];
      case CMD.lireRapide:
        // Un octet factice avant les données.
        return rang === 4 ? 0 : this.flash[this.adresse++ & this.masque];
      case CMD.programmerPage: {
        if (!(this.sr1 & SR1_WEL)) return 0;
        // Une page = 256 octets : l'adresse reboucle dans sa page, et une
        // cellule NOR ne passe que de 1 à 0 (seul l'effacement remet à 1).
        const page = this.adresse & ~0xff;
        const i = (page | ((this.adresse + rang - 4) & 0xff)) & this.masque;
        this.flash[i] &= octet;
        return 0;
      }
    }
    return 0;
  }

  /** Fin de transaction (CS relâché) : les effacements s'exécutent ici. */
  private terminer(): void {
    if (this.rang === 0) return;
    const wel = (this.sr1 & SR1_WEL) !== 0;
    const complete = this.rang >= 4;
    switch (this.commande) {
      case CMD.effacerSecteur:
        if (wel && complete) this.effacer(this.adresse, 0x1000);
        break;
      case CMD.effacerBloc32:
        if (wel && complete) this.effacer(this.adresse, 0x8000);
        break;
      case CMD.effacerBloc64:
        if (wel && complete) this.effacer(this.adresse, 0x10000);
        break;
      case CMD.effacerPuce:
      case CMD.effacerPuce2:
        if (wel) this.flash.fill(0xff);
        break;
      case CMD.programmerPage:
      case CMD.ecrireStatus:
      case CMD.ecrireStatus2:
        break;
      default:
        return;
    }
    // Toute opération d'écriture, même refusée, retombe WEL (comme la puce).
    this.sr1 &= ~SR1_WEL;
  }

  private effacer(adresse: number, taille: number): void {
    const debut = adresse & this.masque & ~(taille - 1);
    this.flash.fill(0xff, debut, debut + taille);
  }
}

/** Accès minimal aux périphériques des deux bibliothèques. */
interface Perif {
  readUint32(offset: number): number;
  writeUint32(offset: number, value: number): void;
}

const ATOMIC_XOR = 1;
const ATOMIC_SET = 2;
const ATOMIC_CLEAR = 3;

// --- RP2040 : SSI + IO_QSPI --------------------------------------------------
const SSI_SSIENR = 0x08;
const SSI_TXFLR = 0x20;
const SSI_RXFLR = 0x24;
const SSI_SR = 0x28;
const SSI_DR0 = 0x60;
const SSI_SR_TFNF = 0x02;
const SSI_SR_TFE = 0x04;
const SSI_SR_RFNE = 0x08;
/** Profondeur de la FIFO de réception du SSI. */
const SSI_FIFO = 16;
/** GPIO_QSPI_SS_CTRL : forçage de CS par le bootrom (OUTOVER, bits 9:8). */
const QSPI_SS_CTRL = 0x0c;
const OUTOVER_LOW = 2;

/**
 * Branche la puce flash sur le SSI du RP2040. Le bootrom force CS par
 * IO_QSPI (`flash_cs_force`), envoie ses octets par DR0 et compte les réponses
 * par RXFLR : les deux registres doivent dire vrai, sinon il tourne en rond.
 */
export function brancherFlashRp2040(
  puce: { flash: Uint8Array; peripherals: Record<number, unknown> },
  jedec: number,
): PuceFlashSpi {
  const flashSpi = new PuceFlashSpi(puce.flash, jedec);
  const rx: number[] = [];

  const ssi = puce.peripherals[0x18000] as Perif;
  const lireSsi = ssi.readUint32.bind(ssi);
  const ecrireSsi = ssi.writeUint32.bind(ssi);
  ssi.readUint32 = (offset: number): number => {
    switch (offset) {
      case SSI_DR0:
        return rx.length ? rx.shift()! : 0;
      case SSI_RXFLR:
        return rx.length;
      case SSI_TXFLR:
        return 0; // transfert instantané : la FIFO d'émission est toujours vide
      case SSI_SR:
        return SSI_SR_TFNF | SSI_SR_TFE | (rx.length ? SSI_SR_RFNE : 0);
    }
    return lireSsi(offset);
  };
  ssi.writeUint32 = (offset: number, value: number): void => {
    if (offset === SSI_DR0) {
      const reponse = flashSpi.echanger(value & 0xff);
      if (rx.length < SSI_FIFO) rx.push(reponse);
      return;
    }
    // SSI désactivé : la vraie puce vide ses FIFO.
    if (offset === SSI_SSIENR && !(value & 1)) rx.length = 0;
    ecrireSsi(offset, value);
  };

  puce.peripherals[0x40018] = new IoQspi(0x30, (offset, value) => {
    if (offset === QSPI_SS_CTRL) flashSpi.selectionner(((value >>> 8) & 3) === OUTOVER_LOW);
  });
  return flashSpi;
}

/**
 * IO_QSPI, absent des deux bibliothèques : périphérique « non implémenté » qui
 * rend 0xFFFFFFFF à toute lecture. Or le bootrom teste `flash_was_aborted()`
 * (SD1_CTRL.INOVER) avant chaque effacement : avec ce 0xFFFFFFFF, il croyait
 * l'opération avortée et rendait la main sans rien faire. Un banc de registres
 * suffit, où seuls les GPIO_QSPI_*_CTRL partent de 0 (INOVER = 0 : « pas
 * d'abandon »). Tout le reste garde l'ancien 0xFFFFFFFF : les *_STATUS disent
 * « broche haute », et le bootrom du RP2350 en déduit que BOOTSEL n'est pas
 * enfoncé.
 */
class IoQspi {
  private readonly regs = new Uint32Array(0x1000 / 4).fill(0xffffffff);

  /**
   * @param finCtrl fin des paires STATUS/CTRL (CTRL = offset ≡ 4 mod 8) :
   *   0x30 sur RP2040 (6 broches), 0x40 sur RP2350 (USB DP/DM en tête)
   */
  constructor(
    finCtrl: number,
    private readonly surEcriture?: (offset: number, value: number) => void,
  ) {
    for (let o = 4; o < finCtrl; o += 8) this.regs[o >>> 2] = 0;
  }

  readUint32(offset: number): number {
    return this.regs[(offset & 0xfff) >>> 2];
  }

  writeUint32(offset: number, value: number): void {
    this.regs[(offset & 0xfff) >>> 2] = value >>> 0;
    this.surEcriture?.(offset & 0xfff, value >>> 0);
  }

  writeUint32Atomic(offset: number, value: number, atomicType: number): void {
    const actuel = this.readUint32(offset);
    const nouveau =
      atomicType === ATOMIC_XOR
        ? actuel ^ value
        : atomicType === ATOMIC_SET
          ? actuel | value
          : atomicType === ATOMIC_CLEAR
            ? actuel & ~value
            : value;
    this.writeUint32(offset, nouveau);
  }

  byteAddressable(): boolean {
    return false;
  }
}

// --- RP2350 : QMI en mode direct --------------------------------------------
const QMI_DIRECT_CSR = 0x00;
const QMI_DIRECT_TX = 0x04;
const QMI_DIRECT_RX = 0x08;
const DIRECT_CSR_EN = 1 << 0;
const DIRECT_CSR_ASSERT_CS0N = 1 << 2;
const DIRECT_CSR_AUTO_CS0N = 1 << 6;
const DIRECT_CSR_TXEMPTY = 1 << 11;
const DIRECT_CSR_RXEMPTY = 1 << 16;
const DIRECT_CSR_RXFULL = 1 << 17;
const DIRECT_CSR_RXLEVEL_LSB = 18;
const DIRECT_TX_DWIDTH = 1 << 18;
const DIRECT_TX_NOPUSH = 1 << 20;
/** Profondeur de la FIFO de réception du QMI. */
const QMI_FIFO = 4;

/**
 * Branche la puce flash sur le QMI du RP2350. Le bootrom passe en mode direct
 * (DIRECT_CSR.EN), affirme CS0 par ASSERT_CS0N, pousse ses octets dans
 * DIRECT_TX et relit DIRECT_RX ; NOPUSH dispense de la réponse.
 */
export function brancherFlashRp2350(
  puce: { flash: Uint8Array; peripherals: Record<number, unknown> },
  jedec: number,
): PuceFlashSpi {
  const flashSpi = new PuceFlashSpi(puce.flash, jedec);
  // Ici CS passe par le QMI : IO_QSPI ne sert qu'au test d'abandon.
  puce.peripherals[0x40030] = new IoQspi(0x40);
  const rx: number[] = [];
  const qmi = puce.peripherals[0x400d0] as Perif;
  const lireQmi = qmi.readUint32.bind(qmi);
  const ecrireQmi = qmi.writeUint32.bind(qmi);
  qmi.readUint32 = (offset: number): number => {
    if (offset === QMI_DIRECT_RX) return rx.length ? rx.shift()! : 0;
    if (offset === QMI_DIRECT_CSR) {
      // Leur registre répond toujours « FIFO vide » : on corrige le niveau.
      let csr = lireQmi(offset) & ~(DIRECT_CSR_RXEMPTY | DIRECT_CSR_RXFULL | (7 << DIRECT_CSR_RXLEVEL_LSB));
      csr |= DIRECT_CSR_TXEMPTY;
      if (rx.length === 0) csr |= DIRECT_CSR_RXEMPTY;
      if (rx.length >= QMI_FIFO) csr |= DIRECT_CSR_RXFULL;
      csr |= (Math.min(rx.length, 7) & 7) << DIRECT_CSR_RXLEVEL_LSB;
      return csr >>> 0;
    }
    return lireQmi(offset);
  };
  // Le bootrom remplit la FIFO d'émission AVANT d'affirmer CS (« 0x06 » puis
  // ASSERT_CS0N) : sur la puce, le premier front d'horloge suit l'affirmation.
  // Ici, les mots attendent donc CS, puis partent tous d'un coup.
  const enAttente: number[] = [];
  const emettre = (value: number): void => {
    // DWIDTH : 16 bits, octet de poids FAIBLE en premier sur le fil (le
    // bootrom écrit la commande 0x02 et le haut de l'adresse en 0x1002).
    let reponse: number;
    if (value & DIRECT_TX_DWIDTH) {
      const faible = flashSpi.echanger(value & 0xff);
      reponse = (flashSpi.echanger((value >>> 8) & 0xff) << 8) | faible;
    } else {
      reponse = flashSpi.echanger(value & 0xff);
    }
    if (!(value & DIRECT_TX_NOPUSH) && rx.length < QMI_FIFO) rx.push(reponse);
  };
  let csrCourant = 0;
  qmi.writeUint32 = (offset: number, value: number): void => {
    if (offset === QMI_DIRECT_TX) {
      if (flashSpi.active) emettre(value);
      // CS automatique (boot2, réglage du XIP) : rien à délimiter, on acquitte.
      else if (csrCourant & DIRECT_CSR_AUTO_CS0N) {
        if (!(value & DIRECT_TX_NOPUSH) && rx.length < QMI_FIFO) rx.push(0);
      } else enAttente.push(value);
      return;
    }
    if (offset === QMI_DIRECT_CSR) {
      csrCourant = value;
      flashSpi.selectionner((value & DIRECT_CSR_ASSERT_CS0N) !== 0);
      if (flashSpi.active) for (const mot of enAttente.splice(0)) emettre(mot);
      if (!(value & DIRECT_CSR_EN)) {
        rx.length = 0;
        enAttente.length = 0;
      }
    }
    ecrireQmi(offset, value);
  };
  return flashSpi;
}
