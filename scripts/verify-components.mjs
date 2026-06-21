// Tests unitaires des composants ajoutés : protocole DHT22 (1-wire), afficheur
// 7 segments multiplexé (sevenSegmentDigit) et résolution des broches d'un
// clavier matriciel (keypadBindings). Pas de firmware ni de toolchain : on
// vérifie la logique pure (encodage, forme d'onde, netlist).
import esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kx-comp-'));

async function bundle(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)],
    outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

const { dht22Bytes, buildDht22Schedule } = await bundle('src/webview/engines/dht22.mts', 'dht22.mjs');
const { sevenSegmentDigit, keypadBindings } = await bundle('src/webview/diagram/model.mts', 'model.mjs');

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

// --- DHT22 : encodage + aller-retour de la forme d'onde ----------------------
console.log('DHT22 (1-wire) :');
{
  const [b0, b1, b2, b3, sum] = dht22Bytes(23.5, 60);
  check('humidité 60 % → 0x0258', b0 === 0x02 && b1 === 0x58, `0x${b0.toString(16)}${b1.toString(16)}`);
  check('température 23,5 °C → 235 (0x00EB)', b2 === 0x00 && b3 === 0xeb, `0x${b2.toString(16)}${b3.toString(16)}`);
  check('checksum cohérent', sum === ((b0 + b1 + b2 + b3) & 0xff));

  // Décodage : un lecteur DHT mesure la durée de l'état HAUT de chaque bit
  // (> 50 µs = 1, sinon 0). cyclesPerUs = 1 → cycles = µs.
  const ev = buildDht22Schedule(23.5, 60, 0, 1);
  const bits = [];
  for (let i = 2; i < ev.length - 1; i++) {
    if (ev[i].value === true) bits.push(ev[i + 1].cycle - ev[i].cycle > 50 ? 1 : 0);
  }
  check('40 bits émis', bits.length === 40, String(bits.length));
  const bytes = [];
  for (let i = 0; i < 40; i += 8) {
    let v = 0;
    for (let k = 0; k < 8; k++) v = (v << 1) | bits[i + k];
    bytes.push(v);
  }
  check('octets décodés = octets encodés', JSON.stringify(bytes) === JSON.stringify([b0, b1, b2, b3, sum]),
    JSON.stringify(bytes));
  check('checksum vérifié côté lecteur', ((bytes[0] + bytes[1] + bytes[2] + bytes[3]) & 0xff) === bytes[4]);

  // Température négative : le bit de signe (0x8000) doit être posé.
  const neg = dht22Bytes(-10.0, 40);
  check('température −10 °C → bit de signe', (neg[2] & 0x80) !== 0 && (((neg[2] & 0x7f) << 8) | neg[3]) === 100);
}

// --- 7 segments multiplexé : un chiffre actif quand son DIGn est actif --------
console.log('7 segments multiplexé :');
{
  const diagram = {
    parts: [
      { id: 'u', type: 'uno', x: 0, y: 0 },
      { id: 's', type: '7seg', x: 0, y: 0, attrs: { digits: '2', common: 'cathode' } },
    ],
    wires: [
      { id: 'w1', a: { partId: 's', pin: 'A' }, b: { partId: 'u', pin: '2' } },
      { id: 'w2', a: { partId: 's', pin: 'DIG1' }, b: { partId: 'u', pin: '3' } },
    ],
  };
  // Segment A piloté HAUT (broche 2), commun DIG1 BAS (broche 3) → chiffre 1 actif, A allumé.
  const read = (name) => name === '2';
  const d1 = sevenSegmentDigit(diagram, 's', read, 'DIG1', false);
  check('DIG1 actif (commun bas)', d1.active === true);
  check('segment A allumé sur le chiffre 1', d1.values[0] === 1 && d1.values[1] === 0);
  const d2 = sevenSegmentDigit(diagram, 's', read, 'DIG2', false);
  check('DIG2 non câblé → inactif', d2.active === false);
}

// --- Clavier matriciel : lignes/colonnes résolues côté MCU -------------------
console.log('Clavier matriciel :');
{
  const diagram = {
    parts: [
      { id: 'u', type: 'uno', x: 0, y: 0 },
      { id: 'k', type: 'keypad', x: 0, y: 0, attrs: { columns: '4' } },
    ],
    wires: [
      { id: 'w1', a: { partId: 'k', pin: 'R1' }, b: { partId: 'u', pin: '9' } },
      { id: 'w2', a: { partId: 'k', pin: 'C2' }, b: { partId: 'u', pin: '5' } },
    ],
  };
  const [b] = keypadBindings(diagram);
  check('1 clavier détecté', !!b);
  check('R1 → broche 9', b?.rows[0] === '9', String(b?.rows[0]));
  check('C2 → broche 5', b?.cols[1] === '5', String(b?.cols[1]));
  check('4 colonnes', b?.cols.length === 4, String(b?.cols.length));
}

console.log(`\nRESULTAT: ${failures === 0 ? 'OK' : `${failures} ÉCHEC(S)`}`);
process.exit(failures === 0 ? 0 : 1);
