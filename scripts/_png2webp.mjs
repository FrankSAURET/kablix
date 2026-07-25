// Conversion PNG → WebP sans dépendance : l'encodeur est celui de Chrome, déjà
// utilisé par tous les bancs de rendu du projet (aucun cwebp/ImageMagick sur le
// poste). La page charge le PNG dans un <canvas> et rend `toDataURL('image/webp')`,
// qui PRÉSERVE LA TRANSPARENCE — indispensable pour les captures de composants,
// tirées sur fond transparent.
//
// Usage : node scripts/_png2webp.mjs <fichier.png|dossier> [qualité 0-1]
//   node scripts/_png2webp.mjs docs/img/composants          → tout le dossier
//   node scripts/_png2webp.mjs media/step.png 0.95
// Le .png n'est PAS supprimé : la suppression reste un geste manuel (git rm).
import { readdirSync, writeFileSync, readFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));
if (!CHROME) { console.error('Chrome introuvable — conversion impossible.'); process.exit(1); }

const target = process.argv[2];
const quality = Number(process.argv[3] ?? 0.92);
if (!target) { console.error('Usage : node scripts/_png2webp.mjs <fichier.png|dossier> [qualité]'); process.exit(1); }

const abs = resolve(ROOT, target);
const files = statSync(abs).isDirectory()
  ? readdirSync(abs).filter((f) => /\.png$/i.test(f)).map((f) => join(abs, f))
  : [abs];
if (files.length === 0) { console.log('rien à convertir.'); process.exit(0); }

const work = mkdtempSync(join(tmpdir(), 'kbx-webp-'));
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/').replace(/ /g, '%20').replace(/#/g, '%23');

// Une seule page pour tout le lot : Chrome démarre lentement, pas la conversion.
const page = join(work, 'convert.html');
writeFileSync(page, `<!doctype html><meta charset="utf-8"><body><pre id="out"></pre><script>
const files = ${JSON.stringify(files.map(fileUrl))};
const q = ${quality};
(async () => {
  const parts = [];
  for (const src of files) {
    const img = new Image();
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = src; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0); // canvas vierge = transparent
    parts.push(c.toDataURL('image/webp', q).split(',')[1]);
  }
  document.getElementById('out').textContent = parts.join('|');
})();
</script></body>`, 'utf8');

const dom = execFileSync('cmd', ['/c', CHROME, '--headless=new', '--disable-gpu',
  '--allow-file-access-from-files', '--virtual-time-budget=20000', '--dump-dom', page],
  { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
const blob = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
const b64 = blob ? blob[1].trim().split('|') : [];
if (b64.length !== files.length) {
  console.error(`conversion incomplète : ${b64.length}/${files.length} images.`);
  rmSync(work, { recursive: true, force: true });
  process.exit(1);
}

for (const [i, src] of files.entries()) {
  const out = src.replace(/\.png$/i, '.webp');
  const buf = Buffer.from(b64[i], 'base64');
  if (buf.toString('ascii', 8, 12) !== 'WEBP') { console.error(`✗ ${basename(src)} : sortie non WebP`); continue; }
  writeFileSync(out, buf);
  const a = statSync(src).size, b = buf.length;
  console.log(`✓ ${basename(out)} ${(a / 1024).toFixed(0)}→${(b / 1024).toFixed(0)} Ko (${((1 - b / a) * 100).toFixed(0)} %)`);
}
rmSync(work, { recursive: true, force: true });
