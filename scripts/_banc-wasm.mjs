// BANC DE VITESSE WASM (piste 4 de roadmap.md) — le test qui décide de la piste 6.
//
// LA QUESTION. Réécrire le cœur Cortex-M0+ en WASM, c'est cinq semaines. Ça ne
// vaut le coup que si le langage compilé rapporte vraiment, ET si le pont vers
// JavaScript ne reprend pas le gain d'une main ce qu'il a donné de l'autre — car
// un cœur WASM devra sortir vers JS chaque fois qu'il touche un périphérique.
//
// COMMENT ON MESURE. Trois interpréteurs exécutent EXACTEMENT le même code Thumb :
//   • rp2040js patché       — l'ancre : le moteur réel de Kablix aujourd'hui ;
//   • le miroir JS          — même switch à 25 branches, même table de décodage,
//                             même mémoire que le C : le dénominateur honnête ;
//   • le cœur WASM          — thumb-banc.c compilé en wasm32.
// Comparer le WASM à rp2040js répondrait à côté (rp2040js décode 78 opérations,
// le banc 25 : une part de l'écart viendrait de la TAILLE du switch). C'est le
// miroir JS qui sert de référence, et rp2040js qui sert de contrôle de réalité.
//
// LE CODE EXÉCUTÉ n'est pas inventé : `scripts/mix-thumb.json` dit quelles
// instructions le vrai firmware MicroPython exécute vraiment, et dans quelles
// proportions. `wasm/noyau.mjs` fabrique une boucle qui reproduit ce mélange.
//
// AVANT DE MESURER, ON PROUVE L'ÉGALITÉ : registres, drapeaux, cycles et
// empreinte de la SRAM identiques après des millions d'instructions. Un banc
// dont les trois moteurs ne font pas la même chose ne mesure rien.
//
// Usage : node scripts/_banc-wasm.mjs [--instructions=1024] [--rapide]
//         [--sans-navigateur] [--json=chemin]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { NoyauJS } from './wasm/thumb-js.mjs';
import {
	ENTREE, FLASH_SIZE, SRAM_BASE, SRAM_SIZE,
	OPS, genererNoyau, registresInitiaux, sramInitiale, tableDecode,
} from './wasm/noyau.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dire = (...a) => process.stdout.write(`${a.join(' ')}\n`);
const arg = (nom, defaut) => {
	const t = process.argv.find((a) => a.startsWith(`--${nom}=`));
	return t ? t.slice(nom.length + 3) : defaut;
};
const drapeau = (nom) => process.argv.includes(`--${nom}`);

const INSTRUCTIONS = Number(arg('instructions', 1024)); // par tour de boucle
const RAPIDE = drapeau('rapide');
const CIBLE_MS = RAPIDE ? 250 : 900;
const ESSAIS = RAPIDE ? 2 : 3;
const WASM = arg('wasm', join(root, 'scripts', 'wasm', 'thumb-banc.wasm'));

if (!existsSync(WASM)) {
	dire('ÉCHEC : scripts/wasm/thumb-banc.wasm absent. Le recompiler :');
	dire('  clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry -Wl,--export-dynamic \\');
	dire('        -Wl,--initial-memory=1114112 -o scripts/wasm/thumb-banc.wasm scripts/wasm/thumb-banc.c');
	process.exit(1);
}

// =========================================================== le monde ====
// Un « monde » = un noyau Thumb + le contenu initial de la flash et de la SRAM.
// Les trois moteurs en reçoivent une copie strictement identique.

const DECODE = tableDecode();

function construireMonde({ mmio = 0, graine = 20260821 } = {}) {
	const k = genererNoyau({ instructions: INSTRUCTIONS, mmio, graine });
	const flash = new Uint8Array(FLASH_SIZE);
	flash.set(k.code, 0);
	return { k, flash, zones: sramInitiale(), mmio };
}

/** Trappe déterministe : les trois moteurs doivent lire la même chose. */
const valeurMmio = (addr, taille) => (Math.imul(addr >>> 0, 2654435761) ^ taille) >>> 0;

// ------------------------------------------------------------ rp2040js ----

async function moteurRp2040(monde) {
	const { RP2040 } = await import('rp2040js');
	const rp = new RP2040();
	rp.flash.set(monde.k.code, 0);
	for (const z of monde.zones) rp.sram.set(z.octets, z.adresse - SRAM_BASE);
	const c = rp.core;
	c.registers.set(registresInitiaux());
	c.N = c.Z = c.C = c.V = false;
	c.cycles = 0;
	const executer = (n) => { for (let i = 0; i < n; i++) c.executeInstruction(); return n; };
	return {
		nom: 'rp2040js (78 opérations)', executer,
		etat: () => ({ regs: Array.from(c.registers), N: c.N, Z: c.Z, C: c.C, V: c.V, cycles: c.cycles }),
		sram: rp.sram, sorties: () => 0,
	};
}

// ----------------------------------------------------------- miroir JS ----

function moteurJS(monde) {
	const sram = new Uint8Array(SRAM_SIZE);
	for (const z of monde.zones) sram.set(z.octets, z.adresse - SRAM_BASE);
	const n = new NoyauJS({
		flash: monde.flash.slice(), sram, decode: DECODE,
		flashBase: ENTREE, sramBase: SRAM_BASE,
	});
	n.regs.set(registresInitiaux());
	n.mmioRead = valeurMmio;
	n.mmioWrite = () => {};
	return {
		nom: 'miroir JS (25 opérations)', executer: (k) => n.executer(k),
		etat: () => n.etat(), sram, sorties: () => n.sorties, brut: n,
	};
}

// ------------------------------------------------------------- le WASM ----

async function moteurWasm(monde) {
	let cyclesRappel = 0;
	const bin = readFileSync(WASM);
	const { instance } = await WebAssembly.instantiate(bin, {
		env: {
			tick: (d) => { cyclesRappel += d; },
			mmio_read: valeurMmio,
			mmio_write: () => {},
		},
	});
	const ex = instance.exports;
	const mem = new Uint8Array(ex.memory.buffer);
	mem.set(monde.flash, ex.flash_ptr());
	mem.set(DECODE, ex.decode_ptr());
	const basSram = ex.sram_ptr();
	for (const z of monde.zones) mem.set(z.octets, basSram + (z.adresse - SRAM_BASE));
	const regs = new Uint32Array(ex.memory.buffer, ex.regs_ptr(), 16);
	regs.set(registresInitiaux());
	ex.etat_set(0, 0, 0, 0);

	const verifie = (fait, attendu) => {
		if (fait !== attendu) throw new Error(`le WASM s'est arrêté sur l'opcode 0x${ex.inconnu_get().toString(16)}`);
		return fait;
	};
	return {
		nom: 'cœur WASM (25 opérations)',
		executer: (n) => verifie(ex.run_burst(n), n),
		parTranches: (K) => (n) => {
			let fait = 0;
			while (fait < n) fait += verifie(ex.run_burst(K), K);
			return fait;
		},
		pasAPas: (n) => { for (let i = 0; i < n; i++) verifie(ex.step(), 1); return n; },
		rappel: (n) => verifie(ex.run_cb(n), n),
		etat: () => {
			const d = ex.drapeaux_get();
			return {
				regs: Array.from(regs), N: !!(d & 1), Z: !!(d & 2), C: !!(d & 4), V: !!(d & 8),
				cycles: ex.cycles_get(),
			};
		},
		sram: mem.subarray(basSram, basSram + SRAM_SIZE),
		sorties: () => ex.sorties_get(), cyclesRappel: () => cyclesRappel,
	};
}

// ====================================================== l'équivalence ====

/** Empreinte FNV-1a des deux zones de SRAM réellement touchées. */
function empreinte(sram) {
	let h = 0x811c9dc5;
	for (const { adresse, octets } of sramInitiale()) {
		const debut = adresse - SRAM_BASE - 4096; // la pile descend sous SP
		for (let i = Math.max(0, debut); i < debut + octets.length + 4096; i++) {
			h = Math.imul(h ^ sram[i], 0x01000193);
		}
	}
	return h >>> 0;
}

function comparer(a, b, ou, { cycles = true } = {}) {
	const ea = a.etat(), eb = b.etat();
	for (let r = 0; r < 16; r++) {
		if (ea.regs[r] !== eb.regs[r]) {
			throw new Error(`${ou} : r${r} vaut 0x${ea.regs[r].toString(16)} pour « ${a.nom} », `
				+ `0x${eb.regs[r].toString(16)} pour « ${b.nom} »`);
		}
	}
	for (const f of ['N', 'Z', 'C', 'V']) {
		if (!!ea[f] !== !!eb[f]) throw new Error(`${ou} : drapeau ${f} divergent (${ea[f]} / ${eb[f]})`);
	}
	if (cycles && ea.cycles !== eb.cycles) throw new Error(`${ou} : cycles ${ea.cycles} / ${eb.cycles}`);
	const ha = empreinte(a.sram), hb = empreinte(b.sram);
	if (ha !== hb) throw new Error(`${ou} : SRAM divergente (${ha.toString(16)} / ${hb.toString(16)})`);
}

async function equivalence(monde, { avecRp2040 }) {
	const pas = [1, 7, 64, 1000, INSTRUCTIONS * 3 + 17, 250_000];
	const js = moteurJS(monde);
	const wasm = await moteurWasm(monde);
	const rp = avecRp2040 ? await moteurRp2040(monde) : null;
	let total = 0;
	for (const n of pas) {
		js.executer(n); wasm.executer(n); rp?.executer(n);
		total += n;
		comparer(js, wasm, `après ${total.toLocaleString('fr-FR')} instructions (JS ↔ WASM)`);
		if (rp) comparer(js, rp, `après ${total.toLocaleString('fr-FR')} instructions (JS ↔ rp2040js)`);
	}
	if (wasm.sorties() !== js.sorties()) {
		throw new Error(`franchissements du pont différents : ${wasm.sorties()} / ${js.sorties()}`);
	}
	return { total, sorties: js.sorties() };
}

// ========================================================= les mesures ====

function debit(fn) {
	let n = 20_000;
	for (;;) {
		const t = performance.now(); fn(n); const d = performance.now() - t;
		if (d >= 80) { n = Math.max(2000, Math.round(n * (CIBLE_MS / d))); break; }
		if (n >= 2 ** 30) break;
		n *= 4;
	}
	let meilleur = 0;
	for (let i = 0; i < ESSAIS; i++) {
		const t = performance.now();
		const c = fn(n);
		const d = performance.now() - t;
		if (d > 0) meilleur = Math.max(meilleur, c / (d / 1000));
	}
	return meilleur;
}

const TRANCHES = [1, 4, 16, 64, 256, 1024, 8192, 65536];

async function mesurer(monde, { avecRp2040 }) {
	const r = {};
	const js = moteurJS(monde);
	r.js = debit((n) => js.executer(n));
	const w = await moteurWasm(monde);
	r.burst = debit((n) => w.executer(n));
	r.step = debit((n) => w.pasAPas(n));
	r.cb = debit((n) => w.rappel(n));
	r.tranches = {};
	for (const K of TRANCHES) {
		const w2 = await moteurWasm(monde);
		r.tranches[K] = debit(w2.parTranches(K));
	}
	if (avecRp2040) {
		const rp = await moteurRp2040(monde);
		r.rp2040 = debit((n) => rp.executer(n));
	}
	return r;
}

// ================================================ le mélange obtenu ====
// On publie à côté du mélange MESURÉ celui que le noyau produit vraiment : un
// banc qui prétend rejouer le vrai firmware doit montrer son écart, pas le cacher.

function melangeObtenu(monde) {
	const js = moteurJS(monde);
	const compte = new Float64Array(OPS.length + 1);
	const tours = 20;
	const n = INSTRUCTIONS * tours;
	for (let i = 0; i < n; i++) {
		const pc = js.brut.regs[15] & ~1;
		const off = pc - ENTREE;
		const opcode = off >= 0 && off + 1 < monde.flash.length
			? monde.flash[off] | (monde.flash[off + 1] << 8) : 0;
		compte[DECODE[opcode] === 255 ? OPS.length : DECODE[opcode]]++;
		js.executer(1);
	}
	return Array.from(compte, (c) => c / n);
}

// ================================================== le tour navigateur ====
// Deux choses à prouver dans un VRAI navigateur, et pas seulement dans Node :
//   1. la CSP de la webview (piste 3) laisse bien instancier du WebAssembly,
//      dans la page ET dans un worker `blob:` — c'est là que tourne la simu ;
//   2. le rapport WASM/JS tient aussi sur le moteur de Chrome (V8 y est le même
//      qu'ici, mais la webview, elle, n'est pas Node).

function cspDeLaWebview() {
	// On ne recopie pas la CSP : on l'ÉVALUE depuis la source, sinon le contrôle
	// finirait par tester une chaîne périmée.
	const src = readFileSync(join(root, 'src', 'webview-html.ts'), 'utf8');
	const i = src.indexOf('const csp = [');
	const j = src.indexOf("].join('; ')", i);
	if (i < 0 || j < 0) throw new Error('bloc CSP introuvable dans src/webview-html.ts');
	const tableau = src.slice(src.indexOf('[', i), j + 1);
	// eslint-disable-next-line no-new-func
	const f = new Function('webview', 'nonce', `return ${tableau}.join('; ')`);
	return f({ cspSource: 'https://file+.vscode-resource.vscode-cdn.net' }, 'NONCE_DU_BANC');
}

function chrome() {
	return [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
		process.env.CHROME_PATH,
	].filter(Boolean).find(existsSync);
}

async function tourNavigateur(monde) {
	const exe = chrome();
	if (!exe) return { saute: 'Chrome introuvable' };

	const tmp = mkdtempSync(join(tmpdir(), 'kablix-banc-'));
	// noyau.mjs lit `mix-thumb.json` par `node:fs` — on ne l'emporte pas dans le
	// navigateur : le noyau, la table et la SRAM sont fabriqués ici et injectés
	// tout faits. Seul le miroir JS a besoin d'être empaqueté.
	const bundle = await esbuild.build({
		stdin: {
			contents: `import { NoyauJS } from ${JSON.stringify(join(root, 'scripts/wasm/thumb-js.mjs').replace(/\\/g, '/'))};\nglobalThis.NoyauJS = NoyauJS;\n`,
			resolveDir: root, loader: 'js',
		},
		bundle: true, format: 'iife', write: false, logLevel: 'silent',
	});
	const miroir = bundle.outputFiles[0].text;

	const b64 = (u8) => Buffer.from(u8).toString('base64');
	const donnees = JSON.stringify({
		wasm: b64(readFileSync(WASM)),
		flash: b64(monde.flash),
		decode: b64(DECODE),
		zones: monde.zones.map((z) => ({ adresse: z.adresse, octets: b64(z.octets) })),
		regs: Array.from(registresInitiaux()),
		sramBase: SRAM_BASE, sramTaille: SRAM_SIZE, entree: ENTREE,
		cibleMs: CIBLE_MS, essais: ESSAIS,
	});

	const banc = readFileSync(join(root, 'scripts', 'wasm', 'banc-navigateur.js'), 'utf8');
	const csp = cspDeLaWebview();
	const html = `<!DOCTYPE html><html><head>
<meta http-equiv="Content-Security-Policy" content="${csp.replace(/"/g, '&quot;')}" />
</head><body><pre id="o"></pre>
<script nonce="NONCE_DU_BANC">window.__DONNEES = ${donnees};</script>
<script nonce="NONCE_DU_BANC">${miroir}</script>
<script nonce="NONCE_DU_BANC">${banc}</script>
</body></html>`;
	const page = join(tmp, 'banc.html');
	writeFileSync(page, html, 'utf8');

	const r = spawnSync(exe, [
		'--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
		'--enable-logging=stderr', '--log-level=0',
		`--user-data-dir=${join(tmp, 'profil')}`,
		`file:///${page.replace(/\\/g, '/')}`,
	], { encoding: 'utf8', timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });

	const morceaux = [];
	for (const ligne of (r.stderr || '').split(/\r?\n/)) {
		const m = /"KX (\d+) (\d+) ([A-Za-z0-9+/=]*)"/.exec(ligne);
		if (m) morceaux[Number(m[1])] = m[3];
	}
	// Le diagnostic vit dans le journal de Chrome : on le garde plutôt que de le
	// résumer, sinon un refus de CSP se lit comme une panne quelconque.
	const journal = join(tmp, 'chrome.log');
	writeFileSync(journal, r.stderr || '(rien sur stderr)', 'utf8');
	if (!morceaux.length) {
		const err = (r.stderr || '').split(/\r?\n/)
			.filter((l) => /KXERREUR|Refused|Content Security|CONSOLE/.test(l)).slice(0, 6);
		return { saute: `la page n'a rien renvoyé — ${journal}${err.length ? ` — ${err.join(' | ')}` : ''}`, csp };
	}
	// base64 : Chrome recopie le message entre guillemets sur stderr, et du JSON
	// brut y mettrait les siens.
	return { ...JSON.parse(Buffer.from(morceaux.join(''), 'base64').toString('utf8')), csp };
}

// ============================================================ le rapport ====

const M = (x) => (x / 1e6).toFixed(2);
const pct = (x) => `${(100 * x).toFixed(2)} %`;

const t0 = Date.now();
dire('BANC DE VITESSE WASM — piste 4 de roadmap.md\n');

const monde0 = construireMonde({ mmio: 0 });
dire(`noyau : ${monde0.k.taille.toLocaleString('fr-FR')} octets, ${monde0.k.nBlocs} blocs, `
	+ `${INSTRUCTIONS} instructions par tour, mélange couvrant ${pct(monde0.k.couverture)} du vrai firmware`);

// ---- 1. égalité ----
dire('\n1. ÉGALITÉ DES TROIS MOTEURS');
const eq = await equivalence(monde0, { avecRp2040: true });
dire(`   ✅ ${eq.total.toLocaleString('fr-FR')} instructions, registres + drapeaux + cycles + SRAM identiques`);
dire('      (rp2040js, miroir JS et cœur WASM — le banc compare bien la même chose)');

const mondes = {
	'1 sortie / 18 instr.': construireMonde({ mmio: 1 / 18, graine: 20260822 }),
	'1 sortie / 85 instr.': construireMonde({ mmio: 1 / 85, graine: 20260823 }),
};
for (const [nom, m] of Object.entries(mondes)) {
	const e = await equivalence(m, { avecRp2040: false });
	dire(`   ✅ ${nom} : JS ↔ WASM identiques (${e.sorties.toLocaleString('fr-FR')} franchissements du pont)`);
}

// ---- 2. le mélange réellement exécuté ----
const obtenu = melangeObtenu(monde0);
const vise = monde0.k.visePart;
dire('\n2. MÉLANGE D\'INSTRUCTIONS — mesuré sur le vrai firmware, et obtenu dans le banc');
dire('   opération        visé   obtenu  |  opération        visé   obtenu');
const lignes = OPS.map((nom, i) => `${nom.padEnd(12)} ${pct(vise[i]).padStart(7)} ${pct(obtenu[i]).padStart(8)}`);
for (let i = 0; i < lignes.length; i += 2) {
	dire(`   ${lignes[i]}  |  ${lignes[i + 1] || ''}`);
}
const ecart = OPS.reduce((s, _, i) => s + Math.abs(obtenu[i] - vise[i]), 0) / 2;
dire(`   écart total au mélange visé : ${pct(ecart)} des instructions`);

// ---- 3. les vitesses ----
dire('\n3. VITESSES (Node ' + process.version + ', meilleur de ' + ESSAIS + ')');
const m0 = await mesurer(monde0, { avecRp2040: true });
dire(`   rp2040js patché (78 op.)  ${M(m0.rp2040).padStart(7)} Minstr/s   ← le moteur d'aujourd'hui`);
dire(`   miroir JS (25 op.)        ${M(m0.js).padStart(7)} Minstr/s   ← le dénominateur honnête`);
dire(`   WASM, rafale pure         ${M(m0.burst).padStart(7)} Minstr/s   ← le plafond`);
dire(`   WASM, appel JS sortant    ${M(m0.cb).padStart(7)} Minstr/s   ← 1 appel vers JS par instruction`);
dire(`   WASM, appel JS entrant    ${M(m0.step).padStart(7)} Minstr/s   ← 1 appel depuis JS par instruction`);
dire('');
dire('   par tranches de K instructions entre deux retours en JS :');
for (const K of TRANCHES) {
	const v = m0.tranches[K];
	dire(`     K = ${String(K).padStart(5)}   ${M(v).padStart(7)} Minstr/s   (${(v / m0.js).toFixed(2)} × le miroir JS)`);
}

const gainBrut = m0.burst / m0.js;
const prixPont = m0.burst / m0.cb;

// ---- 4. avec les périphériques ----
dire('\n4. AVEC LES PÉRIPHÉRIQUES (chaque accès MMIO repasse en JS)');
const reels = {};
for (const [nom, m] of Object.entries(mondes)) {
	const r = await mesurer(m, { avecRp2040: false });
	reels[nom] = r;
	dire(`   ${nom.padEnd(22)} JS ${M(r.js).padStart(7)}   WASM ${M(r.burst).padStart(7)} Minstr/s   `
		+ `gain ×${(r.burst / r.js).toFixed(2)}`);
}
const gainReel = reels['1 sortie / 85 instr.'].burst / reels['1 sortie / 85 instr.'].js;

// ---- 5. navigateur + CSP ----
dire('\n5. DANS UN VRAI NAVIGATEUR, SOUS LA CSP DE LA WEBVIEW (piste 3)');
let nav = { saute: 'tour navigateur désactivé (--sans-navigateur)' };
if (!drapeau('sans-navigateur')) nav = await tourNavigateur(monde0);
if (nav.saute) {
	dire(`   ⏳ sauté : ${nav.saute}`);
} else {
	dire(`   CSP testée : ${nav.csp}`);
	dire(`   ${nav.page.wasm ? '✅' : '❌'} WebAssembly instancié dans la PAGE`
		+ (nav.page.erreur ? ` — ${nav.page.erreur}` : ''));
	dire(`   ${nav.worker.wasm ? '✅' : '❌'} WebAssembly instancié dans un WORKER blob:`
		+ (nav.worker.erreur ? ` — ${nav.worker.erreur}` : ''));
	dire(`   ${nav.page.egal ? '✅' : '❌'} miroir JS et cœur WASM d'accord sur l'état final, dans la page`);
	dire(`   Chrome ${nav.chrome} :  miroir JS ${M(nav.page.js)}   WASM rafale ${M(nav.page.burst)}   `
		+ `WASM appel sortant ${M(nav.page.cb)} Minstr/s`);
	dire(`   gain brut dans le navigateur : ×${(nav.page.burst / nav.page.js).toFixed(2)}`);
}

// ---- 6. le verdict ----
dire('\n6. VERDICT');
dire(`   gain brut (WASM rafale / miroir JS)     ×${gainBrut.toFixed(2)}`);
dire(`   prix du pont (rafale / appel sortant)   ×${prixPont.toFixed(2)} de perte si l'on sort à chaque instruction`);
dire(`   gain réel (1 sortie toutes les 85)      ×${gainReel.toFixed(2)}`);
dire(`   gain contre le moteur d'aujourd'hui     ×${(m0.burst / m0.rp2040).toFixed(2)}`);
dire('');
const seuil = 3;
if (gainBrut >= seuil) {
	dire(`   ➜ le gain brut atteint le seuil de ×${seuil} : la piste 6 reste ouverte.`);
} else {
	dire(`   ➜ le gain brut n'atteint PAS le seuil de ×${seuil} : la piste 6 est MORTE.`);
}
dire(`   (seuil fixé par scripts/vitesse-pico.md §12, jalon 1)`);

const json = {
	genere: new Date().toISOString().slice(0, 10),
	instructionsParTour: INSTRUCTIONS,
	noyau: { taille: monde0.k.taille, blocs: monde0.k.nBlocs, couverture: monde0.k.couverture },
	melange: OPS.map((nom, i) => ({ nom, vise: vise[i], obtenu: obtenu[i] })),
	melangeEcart: ecart,
	node: { version: process.version, ...m0 },
	mmio: Object.fromEntries(Object.entries(reels).map(([k, v]) => [k, { js: v.js, burst: v.burst }])),
	navigateur: nav.saute ? { saute: nav.saute } : nav,
	verdict: { gainBrut, prixPont, gainReel, gainContreRp2040: m0.burst / m0.rp2040, seuil, ouvert: gainBrut >= seuil },
};
const sortie = arg('json', join(root, 'scripts', 'banc-wasm.json'));
writeFileSync(sortie, JSON.stringify(json, null, '\t'));
dire(`\nÉcrit : ${sortie.replace(root, '')}   (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
