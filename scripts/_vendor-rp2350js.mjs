// VENDORISATION de rp2350js (https://github.com/c1570/rp2350js, MIT).
//
// Pourquoi un script et pas un simple copier-coller : la bibliothèque n'est PAS
// publiée sur npm (contrairement à rp2040js, qui reste installé et patché par
// patch-package). Elle vit donc dans `vendor/rp2350js/`, et cette copie doit
// pouvoir être refaite à l'identique quand l'amont bouge — sinon nos correctifs
// se perdent au premier `git pull` de leur côté.
//
// Ce que le script fait, dans l'ordre :
//   1. extrait l'arbre du clone AU COMMIT (git archive HEAD) — jamais le
//      répertoire de travail, qui contient nos bancs et des `.orig` ;
//   2. applique les patchs Kablix de `patches/rp2350js/` (git apply) ;
//   3. ne recopie que ce qui tourne dans une webview : ni gdb, ni serveur MCP,
//      ni CLI, ni tests, ni les trois utilitaires qui lisent le disque (`fs`) ;
//   4. réécrit les imports relatifs en ESM explicite (`'./x'` → `./x.js`,
//      dossier → `./x/index.js`) : le vendor est déclaré `"type": "module"`,
//      seule façon de le faire avaler par notre `moduleResolution: Node16`
//      sans toucher au tsconfig du projet ;
//   5. écrit `ORIGINE.md` (dépôt, commit, date, patchs, exclusions).
//
// Usage : node scripts/_vendor-rp2350js.mjs --source=<clone rp2350js> [--dry]
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEST = join(RACINE, 'vendor', 'rp2350js');
const PATCHS_DIR = join(RACINE, 'patches', 'rp2350js');
const DEPOT = 'https://github.com/c1570/rp2350js';

// Dossiers entiers écartés : rien de tout ça ne peut tourner dans un navigateur
// (sockets, système de fichiers, stdio) et rien n'est utilisé par le moteur.
const DOSSIERS_EXCLUS = new Set(['gdb', 'mcp', 'rp2-emu-cli', 'test']);
// Repêchés malgré leur dossier : `gdb-target.ts` ne contient qu'une interface de
// huit lignes, dont `simulator.ts` dépend.
const REPECHES = new Set(['gdb/gdb-target.ts']);
// Écarté nommément : pilote de processus externe (fs + os + crypto), sans usage ici.
const FICHIERS_EXCLUS = new Set(['utils/emulator-controller.ts']);
// Modules Node qu'il reste à neutraliser après ça. Plutôt que de rogner leur
// code (une divergence de plus à maintenir), on redirige ces deux imports vers
// des bouchons qui lèvent : ils ne sont atteints que par le chargement de
// firmware DEPUIS UN FICHIER, chemin dont Kablix ne se sert pas — l'extension
// décode l'UF2 de son côté et pousse des segments déjà prêts. Le reste de
// `load-firmware.ts` (poignée de main du démarrage RAM du RP2350) reste, lui,
// utilisable.
const SHIMS = {
	'fs': `// Bouchon Kablix : voir ORIGINE.md. Le vendor ne lit jamais le disque —
// la webview n'en a pas, et les firmwares arrivent déjà décodés.
// Les deux surcharges reproduisent celles de node:fs (binaire sans encodage,
// texte avec) : sans elles, les appelants ne compilent pas.
export function readFileSync(chemin: string): Uint8Array;
export function readFileSync(chemin: string, encodage: string): string;
export function readFileSync(chemin: string, encodage?: string): Uint8Array | string {
	throw new Error(\`rp2350js vendorisé : lecture disque interdite dans la webview (\${chemin}, \${encodage ?? 'binaire'})\`);
}
`,
	'uf2': `// Bouchon Kablix : voir ORIGINE.md. Kablix décode l'UF2 côté extension
// (src/firmware.ts) et pousse des FlashSegment — decodeBlock ne sert jamais.
export function decodeBlock(data: Uint8Array): { flashAddress: number; payload: Uint8Array } {
	throw new Error(\`rp2350js vendorisé : decodeBlock inutilisé (\${data.length} octets)\`);
}
`,
};

const args = process.argv.slice(2);
const opt = (nom) => args.find((a) => a.startsWith(`--${nom}=`))?.split('=').slice(1).join('=');
const dry = args.includes('--dry');
const source = opt('source');
if (!source) {
	console.error('usage : node scripts/_vendor-rp2350js.mjs --source=<clone rp2350js> [--dry]');
	console.error(`clone : git clone ${DEPOT}`);
	process.exit(2);
}
const CLONE = resolve(source);
if (!existsSync(join(CLONE, '.git'))) {
	console.error(`❌ ${CLONE} n'est pas un clone git de rp2350js`);
	process.exit(2);
}

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

// --- 1. arbre du commit, pas du répertoire de travail ------------------------
const commit = git(CLONE, 'rev-parse', 'HEAD');
const commitDate = git(CLONE, 'show', '-s', '--format=%cI', 'HEAD');
const sujet = git(CLONE, 'show', '-s', '--format=%s', 'HEAD');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-rp2350js-'));
try {
	execFileSync('git', ['archive', '--format=tar', '-o', join(tmp, 'src.tar'), 'HEAD', 'src', 'LICENSE'], { cwd: CLONE });
	// `tar -xf V:\...` : le bsdtar de Windows prend « V: » pour un hôte distant.
	// Chemin RELATIF depuis le dossier, donc, jamais absolu.
	execFileSync('tar', ['-xf', 'src.tar'], { cwd: tmp });

	// --- 2. patchs Kablix ------------------------------------------------------
	const patchs = existsSync(PATCHS_DIR)
		? readdirSync(PATCHS_DIR).filter((f) => f.endsWith('.patch')).sort()
		: [];
	if (patchs.length) {
		// `git apply` veut un dépôt : on en fabrique un jetable autour de l'extraction.
		execFileSync('git', ['init', '-q'], { cwd: tmp });
		for (const p of patchs) {
			execFileSync('git', ['apply', '--whitespace=nowarn', join(PATCHS_DIR, p)], { cwd: tmp });
			console.log(`  patch appliqué : ${p}`);
		}
		rmSync(join(tmp, '.git'), { recursive: true, force: true });
	} else {
		console.log('  (aucun patch dans patches/rp2350js/)');
	}

	// --- 3. filtrage -----------------------------------------------------------
	const SRC = join(tmp, 'src');
	const gardes = [];
	const rejets = [];
	const parcours = (dir) => {
		for (const nom of readdirSync(dir)) {
			const abs = join(dir, nom);
			const rel = relative(SRC, abs).replaceAll('\\', '/');
			if (statSync(abs).isDirectory()) {
				if (DOSSIERS_EXCLUS.has(nom) && ![...REPECHES].some((r) => r.startsWith(`${rel}/`))) {
					rejets.push(`${rel}/ (dossier)`);
					continue;
				}
				parcours(abs);
				continue;
			}
			if (!nom.endsWith('.ts')) { rejets.push(rel); continue; }
			if (nom.endsWith('.spec.ts')) { rejets.push(rel); continue; }
			if (FICHIERS_EXCLUS.has(rel)) { rejets.push(rel); continue; }
			const dossier = rel.split('/').slice(0, -1).join('/');
			if (dossier && DOSSIERS_EXCLUS.has(dossier) && !REPECHES.has(rel)) { rejets.push(rel); continue; }
			gardes.push(rel);
		}
	};
	parcours(SRC);

	// --- 4. imports ESM explicites --------------------------------------------
	const estGarde = new Set(gardes);
	const dossiersGardes = new Set(gardes.map((f) => f.split('/').slice(0, -1).join('/')).filter(Boolean));
	let reecrits = 0;
	const manquants = new Set();
	const fichiers = new Map();
	for (const rel of gardes) {
		const texte = readFileSync(join(SRC, rel), 'utf8');
		const base = rel.split('/').slice(0, -1).join('/');
		// Chemin relatif du dossier de bouchons vu depuis CE fichier.
		const versShims = (base ? base.split('/').map(() => '..').join('/') : '.') + '/shims';
		const sortie = texte.split('\n').map((ligne) => {
			// Leur `index.ts` garde des exports gdb en commentaire (`//TODO export …`) :
			// une ligne commentée n'est pas un import, ne pas la compter comme manquante.
			if (ligne.trimStart().startsWith('//')) return ligne;
			return ligne.replace(
				/(\bfrom\s+|\bimport\s*\(\s*)(['"])([^'"]+)\2/g,
				(tout, avant, quote, spec) => {
					if (Object.hasOwn(SHIMS, spec)) {
						reecrits++;
						return `${avant}${quote}${versShims}/${spec}.js${quote}`;
					}
					if (!spec.startsWith('.')) return tout;
					if (/\.(js|mjs|cjs|json)$/.test(spec)) return tout;
					const cible = join(base, spec).replaceAll('\\', '/');
					let final;
					if (estGarde.has(`${cible}.ts`)) final = `${spec}.js`;
					else if (dossiersGardes.has(cible) && estGarde.has(`${cible}/index.ts`)) final = `${spec}/index.js`;
					else { manquants.add(`${rel} → ${spec}`); return tout; }
					reecrits++;
					return `${avant}${quote}${final}${quote}`;
				},
			);
		}).join('\n');
		fichiers.set(rel, sortie);
	}
	if (manquants.size) {
		console.error('❌ imports non résolus (fichier exclu à tort ?) :');
		for (const m of manquants) console.error(`   ${m}`);
		process.exit(1);
	}

	// --- 5. écriture -----------------------------------------------------------
	console.log(`rp2350js @ ${commit.slice(0, 7)} — ${gardes.length} fichiers gardés, ${rejets.length} écartés, ${reecrits} imports réécrits`);
	if (dry) { console.log('(--dry : rien écrit)'); process.exit(0); }

	rmSync(join(DEST, 'src'), { recursive: true, force: true });
	for (const [rel, texte] of fichiers) {
		const abs = join(DEST, 'src', rel);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, texte);
	}
	mkdirSync(join(DEST, 'src', 'shims'), { recursive: true });
	for (const [nom, code] of Object.entries(SHIMS)) {
		writeFileSync(join(DEST, 'src', 'shims', `${nom}.ts`), code);
	}
	cpSync(join(tmp, 'LICENSE'), join(DEST, 'LICENSE'));
	// `"type": "module"` : c'est ce qui rend les imports `.js` ci-dessus légaux
	// pour TypeScript en `moduleResolution: Node16`. Aucun effet à l'exécution —
	// le code est bundlé par esbuild, jamais chargé par Node.
	writeFileSync(join(DEST, 'package.json'), JSON.stringify({
		name: '@vendor/rp2350js',
		private: true,
		type: 'module',
		description: `copie vendorisée de ${DEPOT} (MIT) — voir ORIGINE.md`,
	}, null, 2) + '\n');
	writeFileSync(join(DEST, 'ORIGINE.md'), `# rp2350js — copie vendorisée

Ne rien modifier ici à la main : ce dossier est **régénéré** par
\`node scripts/_vendor-rp2350js.mjs --source=<clone>\`. Toute correction va dans
\`patches/rp2350js/\`, sinon elle disparaît à la prochaine mise à jour.

| | |
|---|---|
| Dépôt | ${DEPOT} |
| Licence | MIT (voir \`LICENSE\`) |
| Commit | \`${commit}\` |
| Daté du | ${commitDate} |
| Sujet | ${sujet} |
| Vendorisé le | ${new Date().toISOString().slice(0, 10)} |

## Patchs appliqués

${patchs.length ? patchs.map((p) => `- \`patches/rp2350js/${p}\``).join('\n') : '_aucun_'}

## Écarté de la copie

${[...DOSSIERS_EXCLUS].map((d) => `- \`src/${d}/\``).join('\n')}
${[...FICHIERS_EXCLUS].map((f) => `- \`src/${f}\``).join('\n')}
- tous les \`*.spec.ts\`

Ces modules parlent au disque, au réseau ou à stdio : ils ne peuvent pas tourner
dans une webview, et le moteur ne les appelle pas.

## Bouchons

\`src/shims/\` remplace deux imports Node que le cœur traîne encore :

${Object.keys(SHIMS).map((s) => `- \`${s}\``).join('\n')}

Ils ne sont atteints que par le chargement d'un firmware **depuis un fichier**,
chemin dont Kablix ne se sert pas : l'extension décode l'UF2 elle-même et pousse
des segments déjà prêts. Les bouchons lèvent une exception explicite si jamais
quelqu'un passe par là. Le reste de \`load-firmware.ts\` — dont la poignée de main
du démarrage RAM du RP2350 — reste utilisable tel quel.

## Différence avec l'amont

Les imports relatifs ont reçu leur extension \`.js\` explicite et le dossier est
déclaré \`"type": "module"\` — exigé par le \`moduleResolution: Node16\` du projet.
Transformation mécanique faite par le script, aucune ligne de logique touchée.
`);
	console.log(`✅ vendor/rp2350js/ écrit (${gardes.length} fichiers)`);
} finally {
	rmSync(tmp, { recursive: true, force: true });
}
