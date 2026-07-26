// Carte microSD (SPI) : la bibliothèque SD d'Arduino doit pouvoir initialiser la
// carte, MONTER son système de fichiers, écrire un fichier et le relire (repro
// Frank : « carte SD ne marche pas »). Le banc joue le rôle du MCU exactement
// comme SdFat (Sd2Card::init puis SdVolume::init), sur le VRAI `.projix` de test.
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import JSZip from 'jszip';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-sd-'));

async function load(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

const { SdCardSpiDevice } = await load('src/webview/engines/i2c-devices.mts', 'devices.mjs');
const { spiDeviceBindings } = await load('src/webview/diagram/model.mts', 'model.mjs');

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

// ----------------------------------------------------- le MCU, façon SdFat ----
// Toutes les fonctions ci-dessous reproduisent la bibliothèque : une commande
// SPI, c'est six octets envoyés, puis on LIT (en envoyant des 0xFF) jusqu'à
// recevoir un octet dont le bit 7 est à zéro — la réponse R1.

const rec = (card) => card.transfer(0xff, false);

function command(card, cmd, arg) {
  card.transfer(0xff, false); // un octet à vide, comme la bibliothèque
  card.transfer(0x40 | cmd, false);
  card.transfer((arg >>> 24) & 0xff, false);
  card.transfer((arg >>> 16) & 0xff, false);
  card.transfer((arg >>> 8) & 0xff, false);
  card.transfer(arg & 0xff, false);
  card.transfer(cmd === 0 ? 0x95 : cmd === 8 ? 0x87 : 0xff, false); // CRC
  let status = 0xff;
  for (let i = 0; (status & 0x80) !== 0 && i !== 0xff; i++) status = rec(card);
  return status;
}

const appCommand = (card, cmd, arg) => {
  command(card, 55, 0);
  return command(card, cmd, arg);
};

/** Sd2Card::init — renvoie le type de carte (1 = SD1, 2 = SD2, 3 = SDHC) ou 0. */
function cardInit(card) {
  card.onSelect?.(true);
  if (command(card, 0, 0) !== 0x01) return 0;
  let type = 1;
  if ((command(card, 8, 0x1aa) & 0x04) === 0) {
    let echo = 0;
    for (let i = 0; i < 4; i++) echo = rec(card);
    if (echo !== 0xaa) return 0;
    type = 2;
  }
  let tries = 0;
  while (appCommand(card, 41, type === 2 ? 0x40000000 : 0) !== 0) {
    if (++tries > 100) return 0;
  }
  if (type === 2) {
    if (command(card, 58, 0) !== 0) return 0;
    const ocr = rec(card);
    for (let i = 0; i < 3; i++) rec(card);
    if ((ocr & 0xc0) === 0xc0) type = 3;
  }
  return type;
}

/** Sd2Card::readBlock — renvoie les 512 octets, ou null si la carte refuse. */
function readBlock(card, block) {
  if (command(card, 17, block) !== 0) return null;
  let token = 0xff;
  for (let i = 0; token === 0xff && i < 600; i++) token = rec(card);
  if (token !== 0xfe) return null;
  const buf = new Uint8Array(512);
  for (let i = 0; i < 512; i++) buf[i] = rec(card);
  rec(card);
  rec(card); // CRC
  card.onSelect?.(false);
  card.onSelect?.(true);
  return buf;
}

/** Sd2Card::writeBlock — vrai si la carte accepte le bloc. */
function writeBlock(card, block, data) {
  if (command(card, 24, block) !== 0) return false;
  card.transfer(0xfe, false);
  for (let i = 0; i < 512; i++) card.transfer(data[i] ?? 0, false);
  card.transfer(0xff, false);
  card.transfer(0xff, false); // CRC
  const status = rec(card);
  if ((status & 0x1f) !== 0x05) return false;
  for (let i = 0; rec(card) === 0 && i < 600; i++); // attente de fin d'occupation
  card.onSelect?.(false);
  card.onSelect?.(true);
  return true;
}

// ------------------------------------------------------- le câblage réel ------
{
  const zip = await JSZip.loadAsync(readFileSync(join(root, 'testkablix/microsd-uno/microsd-uno.projix')));
  const diagram = JSON.parse(await zip.file('diagram.json').async('string'));
  const bindings = spiDeviceBindings(diagram);
  const sd = bindings.find((b) => b.kind === 'spi-sd');
  check('le .projix de test contient bien une carte SD sur le bus SPI', !!sd);
  check('CS de la carte câblé sur D4 (celui du sketch)', sd?.csPin === '4', String(sd?.csPin));

  const wires = diagram.wires.map((w) => `${w.a.pin}→${w.b.pin}`);
  check(
    'DI/DO/SCK câblés sur D11/D12/D13 (bus SPI matériel)',
    wires.includes('DI→11') && wires.includes('DO→12') && wires.includes('SCK→13'),
    wires.join(' '),
  );
}

// ------------------------------------------------------- initialisation -------
const card = new SdCardSpiDevice();
const type = cardInit(card);
check('la bibliothèque initialise la carte (SD.begin)', type !== 0, `type=${type}`);
check('la carte s\'annonce SDHC : adresses en NUMÉROS de bloc', type === 3, `type=${type}`);

// ------------------------------------------------------- montage du volume ----
// SdVolume::init : partition 1 du MBR, puis secteur de démarrage et BPB.
const le16 = (b, o) => b[o] | (b[o + 1] << 8);
const le32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

const mbr = readBlock(card, 0);
check('le bloc 0 se lit (CMD17 sans décalage d\'adresse)', !!mbr);
check('signature 0x55AA du MBR', mbr?.[510] === 0x55 && mbr?.[511] === 0xaa);

const part = 446;
const partStart = mbr ? le32(mbr, part + 8) : 0;
const partSectors = mbr ? le32(mbr, part + 12) : 0;
check(
  'partition 1 valide pour SdFat (drapeau, 1er secteur, taille)',
  mbr && (mbr[part] & 0x7f) === 0 && partStart !== 0 && partSectors >= 100,
  `boot=${mbr?.[part]} start=${partStart} sectors=${partSectors}`,
);

const bs = readBlock(card, partStart);
check('signature 0x55AA du secteur de démarrage', bs?.[510] === 0x55 && bs?.[511] === 0xaa);

const bytesPerSector = bs ? le16(bs, 11) : 0;
const sectorsPerCluster = bs ? bs[13] : 0;
const reserved = bs ? le16(bs, 14) : 0;
const fatCount = bs ? bs[16] : 0;
const rootEntries = bs ? le16(bs, 17) : 0;
const totalSectors = bs ? le16(bs, 19) || le32(bs, 32) : 0;
const sectorsPerFat = bs ? le16(bs, 22) : 0;

check(
  'BPB accepté par SdFat (512 o/secteur, FAT présente, réservés ≠ 0)',
  bytesPerSector === 512 && fatCount !== 0 && reserved !== 0 && sectorsPerCluster !== 0,
  `bps=${bytesPerSector} fats=${fatCount} res=${reserved} spc=${sectorsPerCluster}`,
);

const fatStart = partStart + reserved;
const rootStart = fatStart + fatCount * sectorsPerFat;
const dataStart = rootStart + Math.ceil((32 * rootEntries) / 512);
const clusterCount = Math.floor((totalSectors - (dataStart - partStart)) / sectorsPerCluster);
check(
  'assez de clusters pour du FAT16 (SdFat refuse le FAT12)',
  clusterCount >= 4085 && clusterCount < 65525,
  `clusters=${clusterCount}`,
);
check('la partition tient dans la carte', partStart + totalSectors <= card.blockCount);

const fat = readBlock(card, fatStart);
check(
  'table d\'allocation amorcée (entrées 0 et 1 réservées)',
  fat && le16(fat, 0) === 0xfff8 && le16(fat, 2) === 0xffff,
  fat ? `${le16(fat, 0).toString(16)} ${le16(fat, 2).toString(16)}` : '',
);

const rootBlock = readBlock(card, rootStart);
check('répertoire racine vide au départ', rootBlock?.[0] === 0x00);

// ------------------------------------------------------- lecture / écriture ---
{
  const data = new Uint8Array(512);
  for (let i = 0; i < 512; i++) data[i] = (i * 7 + 3) & 0xff;
  const ok = writeBlock(card, dataStart, data);
  const back = readBlock(card, dataStart);
  check('un bloc écrit se relit à l\'identique', ok && back && back.every((v, i) => v === data[i]));
}

{
  // Ancien stockage : 128 blocs seulement, avec un modulo qui repliait les
  // adresses. Un bloc lointain doit maintenant vivre à sa place.
  const far = card.blockCount - 1;
  const data = new Uint8Array(512).fill(0xa5);
  const ok = writeBlock(card, far, data);
  const back = readBlock(card, far);
  const near = readBlock(card, far % 128);
  check('un bloc écrit en fin de carte ne se replie pas sur le début', ok && back?.[0] === 0xa5 && near?.[0] !== 0xa5);
}

{
  // Une commande interrompue (CS relâché) ne doit pas décaler les suivantes.
  command(card, 17, dataStart); // lecture entamée…
  rec(card);
  card.onSelect?.(false); // …puis abandonnée
  card.onSelect?.(true);
  const back = readBlock(card, 0);
  check('après une commande interrompue, la carte repart propre', back?.[510] === 0x55);
}

// ------------------------------------------------------- un vrai fichier ------
// Mini-pilote FAT16 : on crée un fichier comme le ferait la bibliothèque (entrée
// de répertoire + cluster de données + chaîne FAT), puis on le relit en repartant
// des blocs de la carte. Prouve que l'image formatée est cohérente de bout en bout.
{
  const nom = 'ESSAI   TXT';
  const texte = 'Kablix : carte SD simulee.\r\n';

  const cluster = 2; // premier cluster de données
  const bloc = new Uint8Array(512);
  for (let i = 0; i < texte.length; i++) bloc[i] = texte.charCodeAt(i);
  writeBlock(card, dataStart + (cluster - 2) * sectorsPerCluster, bloc);

  const fatBloc = readBlock(card, fatStart);
  fatBloc[cluster * 2] = 0xff;
  fatBloc[cluster * 2 + 1] = 0xff; // fin de chaîne
  writeBlock(card, fatStart, fatBloc);

  const dir = readBlock(card, rootStart);
  for (let i = 0; i < 11; i++) dir[i] = nom.charCodeAt(i);
  dir[11] = 0x20; // archive
  dir[26] = cluster & 0xff;
  dir[27] = (cluster >> 8) & 0xff;
  dir[28] = texte.length & 0xff;
  dir[29] = (texte.length >> 8) & 0xff;
  writeBlock(card, rootStart, dir);

  // Relecture complète, en repartant de zéro comme un nouveau montage.
  const dir2 = readBlock(card, rootStart);
  const nomLu = String.fromCharCode(...dir2.slice(0, 11));
  const premier = le16(dir2, 26);
  const taille = le32(dir2, 28);
  const chaine = le16(readBlock(card, fatStart), premier * 2);
  const contenu = readBlock(card, dataStart + (premier - 2) * sectorsPerCluster);
  const lu = String.fromCharCode(...contenu.slice(0, taille));

  check('le fichier créé se retrouve dans le répertoire racine', nomLu === nom, nomLu);
  check('sa chaîne d\'allocation se termine bien (0xFFFF)', chaine === 0xffff, chaine.toString(16));
  check('son contenu se relit à l\'identique', lu === texte, JSON.stringify(lu));
}

// ------------------------------------------------------- contrôles de source --
{
  const dev = readFileSync(join(root, 'src/webview/engines/i2c-devices.mts'), 'utf8');
  check(
    'la réponse est décalée d\'un octet (latence Ncr)',
    /const out = this\.resp\.length \? this\.resp\.shift\(\)! : 0xff;/.test(dev) &&
      /\n    return out;\n  \}/.test(dev),
  );
  check('OCR avec le bit CCS : carte SDHC', /this\.resp\.push\(this\.r1\(\), 0xc0,/.test(dev));
  check('stockage par blocs, sans repli modulo', !/% this\.store\.length/.test(dev));

  for (const [nom, fichier] of [
    ['AVR', 'src/webview/engines/avr.mts'],
    ['Pico', 'src/webview/engines/pico.mts'],
  ]) {
    const src = readFileSync(join(root, fichier), 'utf8');
    check(
      `${nom} : les changements de CS sont notifiés aux périphériques SPI`,
      /this\.sampleSpiSelect\(\);/.test(src) && /dev\.onSelect\(on\);/.test(src),
    );
  }

  const ino = readFileSync(join(root, 'testkablix/microsd-uno/microsd-uno.ino'), 'utf8');
  check(
    'le sketch de test écrit ET relit un fichier',
    /BROCHE_CS = 4/.test(ino) && /SD\.begin\(BROCHE_CS\)/.test(ino) && /FILE_WRITE/.test(ino) && /f\.read\(\)/.test(ino),
  );
}

console.log(failures === 0 ? '\n✅ carte microSD en simulation : OK' : `\n❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
