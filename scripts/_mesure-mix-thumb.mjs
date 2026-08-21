// MESURE (outil d'atelier) — QUELLES instructions Thumb le Pico exécute vraiment.
//
// La piste 4 de roadmap.md demande un banc WASM sur « la même poignée
// d'instructions ». Encore faut-il savoir laquelle : un banc bâti sur un mélange
// inventé mesurerait une puce imaginaire. Ce script fait tourner le VRAI firmware
// MicroPython sur le VRAI moteur (rp2040js patché) et compte, opcode par opcode,
// ce qui passe dans `executeInstruction`.
//
// Sortie : le classement des opérations (les noms sont ceux des commentaires du
// `switch` de rp2040js), et un fichier JSON réutilisable par le banc.
//
// Usage : node scripts/_mesure-mix-thumb.mjs [sketch.py] [--secondes=6] [--json=chemin]
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tk } from '../testkablix/_paths.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dire = (...a) => writeSync(1, `${a.join(' ')}\n`);
const arg = (nom, defaut) => {
	const t = process.argv.find((a) => a.startsWith(`--${nom}=`));
	return t ? t.slice(nom.length + 3) : defaut;
};
const SKETCH = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'blink-pico.py';
const FENETRE_MS = Number(arg('secondes', 6)) * 1000;
const SORTIE = arg('json', join(root, 'scripts', 'mix-thumb.json'));

// --------------------------------------------------------- le firmware ----

const dirs = [
	join(root, 'test-assets'),
	join(homedir(), 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'electropol-fr.kablix', 'micropython'),
	...(process.env.KABLIX_FW_DIR ? [process.env.KABLIX_FW_DIR] : []),
];
let firmware = null;
for (const dir of dirs) {
	if (!existsSync(dir)) continue;
	const f = readdirSync(dir).find((n) => /^RPI_PICO-.*\.uf2$/i.test(n)) || readdirSync(dir).find((n) => /\.uf2$/i.test(n));
	if (f) { firmware = join(dir, f); break; }
}
if (!firmware) { dire('SKIP : aucun firmware .uf2 trouvé.'); process.exit(0); }

// ------------------------------- noms des opérations, lus dans la source ----
// Le `switch` de rp2040js porte le nom de chaque opération en commentaire juste
// au-dessus de son `case`. On les lit plutôt que de les recopier : une montée de
// version de rp2040js renumérote les cases, et ce script suivra tout seul.

const SRC = join(root, 'node_modules', 'rp2040js', 'dist', 'esm', 'cortex-m0-core.js');
const lignes = readFileSync(SRC, 'utf8').split(/\r?\n/);
const NOMS = new Map();
for (let i = 1; i < lignes.length; i++) {
	const m = /^\s*case (\d+): \{/.exec(lignes[i]);
	const c = /^\s*\/\/ (.+)$/.exec(lignes[i - 1]);
	if (m && c) NOMS.set(Number(m[1]), c[1].trim());
}
if (NOMS.size < 50) { dire(`ÉCHEC : ${NOMS.size} opérations nommées, le patch KX_DECODE est-il appliqué ?`); process.exit(1); }

// ------------------------------------------------------------- le moteur ----

const tmp = mkdtempSync(join(tmpdir(), 'kablix-mix-'));
async function load(entry, name) {
	const out = join(tmp, name);
	await esbuild.build({
		entryPoints: [join(root, entry)], outfile: out, bundle: true,
		platform: 'node', format: 'esm', external: ['vscode'], logLevel: 'silent',
	});
	return import(pathToFileURL(out).href);
}
const { loadPythonProgram } = await load('src/compiler.ts', 'compiler.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

const program = loadPythonProgram(firmware, readFileSync(tk(SKETCH), 'utf8'), false);
const engine = new PicoEngine({
	kind: 'flash',
	segments: program.payload.segments.map((s) => ({
		addr: s.addr, data: new Uint8Array(Buffer.from(s.b64, 'base64')),
	})),
	script: program.payload.script,
});

// Histogramme SUR L'OPCODE (16 bits) : c'est la seule grandeur qui permette
// ensuite de rejouer exactement les mêmes instructions dans le banc. Le
// classement par opération se déduit après coup, via KX_DECODE.
const core = engine.sim.rp2040.core;
const orig = core.executeInstruction.bind(core);
const hist = new Uint32Array(65536);
let armed = false;
let total = 0;
core.executeInstruction = () => {
	if (armed) {
		const pc = core.PC & ~1;
		// Le code tourne en flash XIP ; lecture directe, sans réveiller un périphérique.
		const off = pc - 0x10000000;
		const rp = core.rp2040;
		if (off >= 0 && off + 1 < rp.flash.length) { hist[rp.flashView.getUint16(off, true)]++; total++; }
	}
	return orig();
};

// Deuxième compteur : la PART DES ACCÈS MÉMOIRE qui sortent vers un périphérique
// (APB 0x40000000+, SIO 0xd0000000+). C'est le seul trafic qui, dans un cœur
// WASM, DEVRA repasser en JS — les périphériques resteraient écrits en JS. Le
// banc de la piste 4 en a besoin pour doser sa variante « trappe MMIO ».
const acces = { total: 0, mmio: 0 };
const parBloc = new Map(); // adresse >>> 12 → nombre d'accès, pour savoir QUI est sollicité
for (const nom of ['readUint32', 'readUint16', 'readUint8', 'writeUint32', 'writeUint16', 'writeUint8']) {
	const rp = core.rp2040;
	const vrai = rp[nom].bind(rp);
	rp[nom] = (addr, ...reste) => {
		if (armed) {
			acces.total++;
			if ((addr >>> 0) >= 0x40000000) {
				acces.mmio++;
				const bloc = (addr >>> 0) >>> 12;
				parBloc.set(bloc, (parBloc.get(bloc) || 0) + 1);
			}
		}
		return vrai(addr, ...reste);
	};
}

const t0 = Date.now();
let base = null;
engine.onRunning = () => { armed = true; hist.fill(0); total = 0; base = Date.now(); };
engine.start();
await new Promise((resolve) => {
	const timer = setInterval(() => {
		if ((base && Date.now() - base >= FENETRE_MS) || Date.now() - t0 > 120_000) { clearInterval(timer); resolve(); }
	}, 100);
});
armed = false;
engine.stop?.();
if (!base) { dire('ÉCHEC : le moteur n\'a jamais démarré.'); process.exit(1); }

// ------------------------------------------------------------- le tri ----

const classer = await (async () => {
	// `kxClassify` vit dans le module patché, non exporté. On le récupère en
	// relisant la source et en évaluant la fonction seule : elle ne dépend que de
	// l'opcode, aucune fermeture sur l'état du cœur (c'est la propriété qui
	// autorise la table, cf. _gen-decode-rp2040.mjs).
	const texte = readFileSync(SRC, 'utf8');
	const i = texte.indexOf('function kxClassify');
	if (i < 0) throw new Error('kxClassify introuvable dans rp2040js patché');
	let profondeur = 0, j = texte.indexOf('{', i), fin = j;
	for (; fin < texte.length; fin++) {
		if (texte[fin] === '{') profondeur++;
		else if (texte[fin] === '}' && --profondeur === 0) { fin++; break; }
	}
	const mod = join(tmp, 'classify.mjs');
	writeFileSync(mod, `export ${texte.slice(i, fin)}\n`);
	return (await import(pathToFileURL(mod).href)).kxClassify;
})();

const parOp = new Map();
const opcodesParOp = new Map();
for (let opcode = 0; opcode < 65536; opcode++) {
	const n = hist[opcode];
	if (!n) continue;
	const op = classer(opcode);
	parOp.set(op, (parOp.get(op) || 0) + n);
	if (!opcodesParOp.has(op)) opcodesParOp.set(op, []);
	opcodesParOp.get(op).push([opcode, n]);
}

const classement = [...parOp.entries()].sort((a, b) => b[1] - a[1]);
dire(`sketch : ${SKETCH}    firmware : ${firmware.split(/[\\/]/).pop()}`);
dire(`${total.toLocaleString('fr-FR')} instructions observées en ${(FENETRE_MS / 1000)} s, ${classement.length} opérations distinctes\n`);
dire('  #  opération                                      part     cumul');
dire('  ' + '-'.repeat(66));
let cumul = 0;
classement.slice(0, 25).forEach(([op, n], i) => {
	const part = (100 * n) / total;
	cumul += part;
	dire(`${String(i + 1).padStart(3)}  ${(NOMS.get(op) || `op ${op}`).padEnd(42)} ${part.toFixed(2).padStart(6)} %  ${cumul.toFixed(1).padStart(6)} %`);
});

dire('');
dire(`accès mémoire : ${(acces.total / total).toFixed(3)} par instruction, dont ` +
	`${(100 * acces.mmio / Math.max(1, acces.total)).toFixed(2)} % vers un périphérique ` +
	`(soit 1 sortie vers JS toutes les ${(total / Math.max(1, acces.mmio)).toFixed(0)} instructions).`);

const blocs = [...parBloc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
	.map(([b, n]) => `0x${(b * 0x1000).toString(16).padStart(8, '0')} ${(100 * n / acces.mmio).toFixed(0)} %`);
dire(`  répartition : ${blocs.join('   ')}`);

// -------------------------------------------------- le fichier réutilisable ----

const json = {
	genere: new Date().toISOString().slice(0, 10),
	sketch: SKETCH,
	firmware: firmware.split(/[\\/]/).pop(),
	total,
	acces: { parInstruction: acces.total / total, partMmio: acces.mmio / Math.max(1, acces.total), instructionsParMmio: total / Math.max(1, acces.mmio),
		blocs: [...parBloc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([b, n]) => ({ base: b * 0x1000, n })) },
	operations: classement.map(([op, n]) => ({
		op, nom: NOMS.get(op) || `op ${op}`, n, part: n / total,
		// Les opcodes les plus fréquents de cette opération : de quoi rejouer un
		// mélange réaliste sans réinventer les champs de bits.
		opcodes: opcodesParOp.get(op).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([o, c]) => ({ opcode: o, n: c })),
	})),
};
writeFileSync(SORTIE, JSON.stringify(json, null, '\t'));
dire(`\nÉcrit : ${SORTIE.replace(root, '')}`);
process.exit(0);
