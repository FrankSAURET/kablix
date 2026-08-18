// Test du système .kompix : empaquetage/dépaquetage round-trip.
//
// Utilisation : npm run verify:kompix
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORK_DIR = join(ROOT, 'node_modules', '.cache-verify-kompix');
mkdirSync(WORK_DIR, { recursive: true });

let passed = 0;
let failed = 0;
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }
}

// Test 1 : Créer un .kompix valide
test('Créer un .kompix valide', async () => {
  const zip = new JSZip();
  const manifest = {
    kompixVersion: 1,
    type: 'test-resistor',
    label: 'Test Resistor',
    description: 'A test resistor component',
    version: '0.1.0',
    author: 'Test',
    kind: 'passive',
    category: 'passive',
    board: 'uno',
    pins: [
      { name: 'A', x: 10, y: 10 },
      { name: 'B', x: 10, y: 60 }
    ]
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  const svg = `<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
    <g id="test-resistor">
      <rect width="100" height="60" fill="#f0f0f0"/>
    </g>
  </svg>`;
  zip.file('schema.svg', svg);

  const buffer = await zip.generateAsync({ type: 'uint8array' });
  if (!buffer || buffer.length === 0) throw new Error('Buffer vide');

  const path = join(WORK_DIR, 'test-resistor.kompix');
  writeFileSync(path, Buffer.from(buffer));

  const data = readFileSync(path);
  if (data.length !== buffer.length) throw new Error('Taille incohérente');
});

// Test 2 : Dépaquer un .kompix
test('Dépaquer un .kompix', async () => {
  const zip = new JSZip();
  const manifest = { kompixVersion: 1, type: 'test-led', label: 'Test LED', version: '0.1.0', author: 'Test', kind: 'led', pins: [] };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  const buffer = await zip.generateAsync({ type: 'uint8array' });
  const path = join(WORK_DIR, 'test-led.kompix');
  writeFileSync(path, Buffer.from(buffer));

  const data = readFileSync(path);
  const loaded = new JSZip();
  await loaded.loadAsync(data);

  const manifestFile = loaded.file('manifest.json');
  if (!manifestFile) throw new Error('Pas de manifest.json');

  const text = await manifestFile.async('string');
  const parsed = JSON.parse(text);
  if (parsed.type !== 'test-led') throw new Error('Type incorrect');
});

// Test 3 : Round-trip manifest
test('Round-trip manifest', async () => {
  const original = {
    kompixVersion: 1,
    type: 'test-button',
    label: 'Test Button',
    description: 'A button',
    version: '1.0.0',
    author: 'Tester',
    kind: 'pushbutton',
    pins: [{ name: 'P1', x: 10, y: 10 }],
    attrs: { resistance: 100 }
  };

  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(original, null, 2));
  const buffer = await zip.generateAsync({ type: 'uint8array' });

  const loaded = new JSZip();
  await loaded.loadAsync(buffer);
  const text = await loaded.file('manifest.json').async('string');
  const restored = JSON.parse(text);

  if (JSON.stringify(restored) !== JSON.stringify(original)) {
    throw new Error('Manifest restauré différent');
  }
});

// Test 4 : Valider schema.svg présent
test('Valider schema.svg présent', async () => {
  const zip = new JSZip();
  const manifest = { kompixVersion: 1, type: 'test', label: 'Test', version: '0.1.0', author: 'Test', kind: 'passive', pins: [] };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  const svg = '<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg"><g id="test"/></svg>';
  zip.file('schema.svg', svg);

  const buffer = await zip.generateAsync({ type: 'uint8array' });
  const loaded = new JSZip();
  await loaded.loadAsync(buffer);

  if (!loaded.file('manifest.json')) throw new Error('Pas de manifest');
  if (!loaded.file('schema.svg')) throw new Error('Pas de schema.svg');
});

// Test 5 : SVG avec deux groupes (externe + interne)
test('SVG avec deux groupes', async () => {
  const zip = new JSZip();
  const manifest = { kompixVersion: 1, type: 'test-dual', label: 'Test', version: '0.1.0', author: 'Test', kind: 'passive', pins: [] };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  const svg = `<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
    <g id="test-dual"><rect width="100" height="60" fill="#f0"/></g>
    <g id="test-dual-interne"><path d="M 10 10 L 20 20"/></g>
  </svg>`;
  zip.file('schema.svg', svg);

  const buffer = await zip.generateAsync({ type: 'uint8array' });
  const loaded = new JSZip();
  await loaded.loadAsync(buffer);

  const text = await loaded.file('schema.svg').async('string');
  if (!text.includes('id="test-dual"')) throw new Error('Groupe externe absent');
  if (!text.includes('id="test-dual-interne"')) throw new Error('Groupe interne absent');
});

// Run all tests
await runTests();

// Cleanup
rmSync(WORK_DIR, { recursive: true, force: true });

console.log(`\n✓ ${passed} / ${passed + failed} tests passed`);
if (failed > 0) process.exit(1);
