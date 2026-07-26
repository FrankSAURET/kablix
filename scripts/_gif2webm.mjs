// GIF de démo → WebM VP9, pour que les 3 animations de USAGE.md tiennent DANS le
// vsix (les GIF pèsent 12,2 Mo à eux trois : ils étaient servis depuis GitHub,
// donc invisibles hors connexion).
//
// Réglages choisis après mesure (v2026.7.190) :
//  - cadence SOURCE conservée : les GIF ne tournent qu'à ~3 images/s ; forcer
//    12 im/s triplait le nombre d'images à encoder sans rien améliorer.
//  - VP9 + yuv420p : profile 0, le seul dont la lecture est garantie dans
//    Chromium (donc dans les webviews de VS Code) sur toutes les plateformes.
//  - CRF 32 sans débit cible : 12,2 Mo → 1,2 Mo, SSIM 0,95 à 0,99 contre le GIF.
//  - dimensions ramenées au pair (yuv420p l'exige : 800x525 → 800x524).
//
// Usage : node scripts/_gif2webm.mjs [--force] [fichier.gif …]  (défaut : les 3
// démos). Un WebM PLUS RÉCENT que son GIF est laissé tel quel : il a été refait
// à la main (Frank a réencodé `simuler.webm`, jugé trop dégradé) et ce script ne
// doit pas l'écraser au prochain passage. `--force` réencode quand même.
// ffmpeg est cherché dans FFMPEG (variable d'environnement), puis à l'endroit
// où il est installé sur le poste, puis dans le PATH.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const MEDIA = join(root, 'media');
const DEMOS = ['demarrer.gif', 'dessiner.gif', 'simuler.gif'];
const CRF = '32';

function ffmpeg() {
  const candidates = [
    process.env.FFMPEG,
    'A:/Imagerie/Vidéo/ffmpeg/bin/ffmpeg.exe',
    'ffmpeg',
  ].filter(Boolean);
  for (const c of candidates) {
    if (c === 'ffmpeg' || existsSync(c)) {
      if (spawnSync(c, ['-version'], { encoding: 'utf8' }).status === 0) return c;
    }
  }
  console.error('ffmpeg introuvable — définir la variable FFMPEG.');
  process.exit(1);
}

const FF = ffmpeg();
const mb = (p) => (statSync(p).size / 1048576).toFixed(2);
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const gifs = args.filter((a) => a !== '--force').length ? args.filter((a) => a !== '--force') : DEMOS;

let total = 0;
let totalGif = 0;
for (const g of gifs) {
  const src = g.includes('/') || g.includes('\\') ? g : join(MEDIA, g);
  if (!existsSync(src)) { console.error(`❌ ${g} : absent`); process.exitCode = 1; continue; }
  const dst = join(MEDIA, basename(src).replace(/\.gif$/i, '.webm'));
  // WebM refait à la main (donc plus récent que son GIF) : on n'y touche pas.
  if (!FORCE && existsSync(dst) && statSync(dst).mtimeMs > statSync(src).mtimeMs) {
    console.log(`⏭️  ${basename(dst)} ${mb(dst)} Mo : plus récent que le GIF, conservé (--force pour réencoder)`);
    continue;
  }
  const r = spawnSync(FF, [
    '-y', '-i', src,
    '-c:v', 'libvpx-vp9', '-crf', CRF, '-b:v', '0',
    '-pix_fmt', 'yuv420p',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-row-mt', '1', '-deadline', 'good', '-cpu-used', '1',
    '-an', dst,
  ], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`❌ ${basename(src)} : ffmpeg a échoué\n${(r.stderr ?? '').split('\n').slice(-6).join('\n')}`);
    process.exitCode = 1;
    continue;
  }
  totalGif += statSync(src).size;
  total += statSync(dst).size;
  console.log(`✅ ${basename(src)} ${mb(src)} Mo → ${basename(dst)} ${mb(dst)} Mo`);
}

if (total) {
  console.log(`total : ${(totalGif / 1048576).toFixed(2)} Mo de GIF → ${(total / 1048576).toFixed(2)} Mo de WebM (CRF ${CRF}, VP9)`);
}
