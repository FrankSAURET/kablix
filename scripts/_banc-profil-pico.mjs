// BANC (piste 12 de roadmap.md) — OÙ part le temps du moteur Pico, mesuré.
//
// Le banc WASM (§13) a fermé la voie du langage compilé : ×1,86, sous le ×3
// exigé. Il a aussi laissé un chiffre qui pique — un miroir JS de 25 opérations
// va ×1,7 plus vite que `rp2040js`. Reste à savoir POURQUOI, sur le vrai
// firmware, plutôt qu'à le deviner. C'est ce que ce banc mesure, en trois
// phases qui répondent chacune à une question différente :
//
//   PROFIL     — où tombent les échantillons du profileur V8, par fonction et
//                par famille, PENDANT la fenêtre de mesure seulement (profileur
//                piloté par `node:inspector`, pas `--cpu-prof` : le démarrage du
//                firmware dure autant que la mesure et fausserait tout).
//   COMPTEURS  — combien d'appels par instruction émulée. Le profil dit où le
//                temps tombe, les compteurs disent COMBIEN de fois on y passe :
//                sans eux on ne sait pas si une fonction est chère ou fréquente.
//   ABLATIONS  — ce que coûte VRAIMENT chaque service de la boucle : on le
//                retire et on relit le débit. Un chiffre de gain plafond, pas
//                une intuition. La sémantique est cassée pendant la mesure —
//                c'est une mesure jetable, jamais un patch.
//   CANDIDATS  — l'inverse de l'ablation : ce qu'un patch RAPPORTERAIT. Un
//                processus par candidat, le patch posé sur le prototype avant
//                la chauffe, et un TÉMOIN sans patch mené exactement pareil qui
//                sert de zéro. Le chiffre est un plancher : le vrai patch, écrit
//                dans la source, ne peut que faire mieux.
//
// Trois charges, parce qu'un seul sketch ment : `calcul` (MicroPython qui
// travaille, aucun sommeil — le cas où ça rame), `gpio` (bascule de broche :
// SIO, fronts, écouteurs) et `horloge` (Horloge.py, le sketch réel avec ses
// sleep, 91 % de sommeil).
//
// Usage : node scripts/_banc-profil-pico.mjs [--charges=calcul,gpio,horloge]
//                                            [--repets=3] [--fenetre=2500]
//                                            [--phases=profil,compteurs,ablations,candidats]
import esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { Session } from 'node:inspector';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tk } from '../testkablix/_paths.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dire = (...a) => writeSync(1, `${a.join(' ')}\n`);
const CYCLE_NANOS = 1e9 / 125_000_000; // 8 ns, comme pico.mts

const arg = (nom, defaut) => {
	const hit = process.argv.slice(2).find((a) => a.startsWith(`--${nom}=`));
	return hit ? hit.slice(nom.length + 3) : defaut;
};

// Charges : deux fabriquées ici (pour être sûr de ce qu'elles font), une réelle.
const CHARGES = {
	// MicroPython qui calcule, sans jamais dormir : le régime plein, celui qui
	// fait retarder l'horloge quand la machine ne suit pas.
	calcul: {
		titre: 'calcul pur (aucun sommeil)',
		source: [
			'x = 1',
			'while True:',
			'    for i in range(2000):',
			'        x = (x * 31 + i) % 1000003',
		].join('\n'),
	},
	// Bascule de broche : chaque écriture traverse le SIO, lève un front GPIO et
	// réveille les écouteurs de l'éditeur. Chemin mémoire tout différent.
	gpio: {
		titre: 'bascule de broche (SIO + fronts)',
		source: [
			'from machine import Pin',
			'p = Pin(15, Pin.OUT)',
			'while True:',
			'    p.value(1)',
			'    p.value(0)',
		].join('\n'),
	},
	// Le sketch réel du diagnostic d'origine (§2) : 91 % de sommeil.
	horloge: { titre: 'Horloge.py (sketch réel, avec sleep)', fichier: 'Horloge.py' },
};

const ENFANT = process.env.KABLIX_PROFIL_MODE;

// ═══════════════════════════════════════════════════ chef d'orchestre ═══
if (!ENFANT) {
	const charges = arg('charges', 'calcul,gpio,horloge').split(',').filter((c) => CHARGES[c]);
	const phases = arg('phases', 'profil,compteurs,ablations,candidats').split(',');
	const repets = Number(arg('repets', 3));
	const fenetre = Number(arg('fenetre', 2500));
	const resultats = { date: new Date().toISOString(), charges: {}, fenetreMs: fenetre, repets };

	const lancer = (mode, charge, extra = {}) => {
		const tmp = mkdtempSync(join(tmpdir(), 'kablix-profil-'));
		const r = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url)], {
			cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
			env: {
				...process.env,
				KABLIX_PROFIL_MODE: mode,
				KABLIX_PROFIL_CHARGE: charge,
				KABLIX_PROFIL_TMP: tmp,
				KABLIX_PROFIL_FENETRE: String(fenetre),
				...extra,
			},
		});
		const ligne = (r.stdout || '').split('\n').find((l) => l.startsWith('##RESULT##'));
		if (!ligne) {
			dire(`   ÉCHEC (${mode}/${charge}) : ${(r.stderr || r.stdout || '').split('\n').slice(-4).join(' | ')}`);
			return null;
		}
		return JSON.parse(ligne.slice(10));
	};

	dire(`\n╔═══ BANC PROFIL PICO — piste 12 ═══════════════════════════════════════`);
	dire(`║ fenêtre ${fenetre} ms · ${repets} répétitions · charges : ${charges.join(', ')}`);
	dire(`╚══════════════════════════════════════════════════════════════════════\n`);

	const pct = (v, ref) => (ref ? `${v >= ref ? '+' : ''}${(((v - ref) / ref) * 100).toFixed(1)} %` : '');

	for (const charge of charges) {
		const bloc = (resultats.charges[charge] = { titre: CHARGES[charge].titre });
		let refCharge = 0; // débit de la boucle non patchée : le zéro des deux tableaux
		dire(`\n████ ${charge.toUpperCase()} — ${CHARGES[charge].titre}`);

		// ---------------------------------------------------------- profil ----
		if (phases.includes('profil')) {
			const p = lancer('profil', charge);
			if (p) {
				bloc.profil = p;
				dire(`\n  ── Profil V8 (fenêtre ${p.murMs?.toFixed(0)} ms mur, ${p.totalMs.toFixed(0)} ms échantillonnés, ${p.echantillons} échantillons)`);
				dire('     part    ms  famille');
				for (const [fam, ms] of p.familles) {
					dire(`   ${((ms / p.totalMs) * 100).toFixed(1).padStart(6)} % ${ms.toFixed(0).padStart(5)}  ${fam}`);
				}
				dire('\n     part    ms  fonction');
				for (const [nom, ms] of p.fonctions.slice(0, 16)) {
					dire(`   ${((ms / p.totalMs) * 100).toFixed(1).padStart(6)} % ${ms.toFixed(0).padStart(5)}  ${nom}`);
				}
			}
		}

		// ------------------------------------------------------- compteurs ----
		if (phases.includes('compteurs')) {
			const c = lancer('compteurs', charge);
			if (c) {
				bloc.compteurs = c;
				dire(`\n  ── Appels pour 1000 instructions émulées (${(c.instr / 1000).toFixed(0)} kinstr comptées)`);
				for (const [nom, n] of c.appels) {
					const par1000 = (n / c.instr) * 1000;
					if (par1000 < 0.5) continue;
					dire(`   ${par1000.toFixed(0).padStart(6)}  ${nom}`);
				}
				const rares = c.appels.filter(([, n]) => (n / c.instr) * 1000 < 0.5).map(([nom]) => nom);
				if (rares.length) dire(`   (< 0,5 pour 1000 : ${rares.join(', ')})`);
			}
		}

		// ------------------------------------------------------- ablations ----
		if (phases.includes('ablations') || phases.includes('candidats')) {
			const meilleur = new Map();
			for (let i = 0; i < repets; i++) {
				const a = lancer('ablations', charge, { KABLIX_PROFIL_ROT: String(i) });
				if (!a) continue;
				for (const [nom, minstr] of a.variantes) {
					if (!(minstr > 0)) continue;
					if (!meilleur.has(nom) || minstr > meilleur.get(nom)) meilleur.set(nom, minstr);
				}
			}
			if (meilleur.size) {
				// Repère : la boucle maison. Celle du moteur est convertie depuis son
				// compteur de CYCLES, que le WFE fait bondir sans exécuter d'instruction —
				// elle est indicative, elle ne peut pas servir de zéro.
				refCharge = meilleur.get('référence (boucle maison)') || meilleur.get('boucle du moteur');
				bloc.ablations = [...meilleur.entries()];
				dire(`\n  ── Débit par variante (meilleur de ${repets}, Minstr/s)`);
				dire('     Minstr/s   écart  variante');
				for (const [nom, v] of [...meilleur.entries()].sort((a, b) => a[1] - b[1])) {
					dire(`   ${v.toFixed(2).padStart(9)} ${pct(v, refCharge).padStart(8)}  ${nom}`);
				}
			}
		}

		// ------------------------------------------------------- candidats ----
		// Ce qu'un patch rapporterait, mesuré dans UN seul processus : chaque
		// candidat est un booléen posé sur un patch permanent, et le témoin (aucun
		// drapeau) est le zéro. Deux processus ne se comparent pas — le firmware n'y
		// est pas au même point et le débit varie de ±10 %.
		if (phases.includes('candidats')) {
			const meilleur = new Map();
			for (let i = 0; i < repets; i++) {
				const a = lancer('candidats', charge, { KABLIX_PROFIL_ROT: String(i) });
				if (!a) continue;
				for (const [nom, minstr] of a.variantes) {
					if (!(minstr > 0)) continue;
					if (!meilleur.has(nom) || minstr > meilleur.get(nom)) meilleur.set(nom, minstr);
				}
			}
			if (meilleur.size) {
				bloc.candidats = [...meilleur.entries()];
				// Le zéro est le témoin, mesuré dans le même processus que les candidats.
				const zero = meilleur.get('TÉMOIN : rien de posé') || 0;
				dire(`\n  ── Candidats : ce qu'un patch rapporterait (meilleur de ${repets}, Minstr/s)`);
				dire('     Minstr/s    gain  candidat');
				for (const [nom, v] of [...meilleur.entries()].sort((a, b) => b[1] - a[1])) {
					dire(`   ${v.toFixed(2).padStart(9)} ${pct(v, zero).padStart(7)}  ${nom}`);
				}
			}
		}
	}

	const sortie = join(root, 'scripts', 'banc-profil-pico.json');
	writeFileSync(sortie, JSON.stringify(resultats, null, 2));
	dire(`\nMesures brutes : scripts/banc-profil-pico.json\n`);
	process.exit(0);
}

// ══════════════════════════════════════════════════════════ un enfant ═══
const CHARGE = CHARGES[process.env.KABLIX_PROFIL_CHARGE];
const TMP = process.env.KABLIX_PROFIL_TMP;
const FENETRE = Number(process.env.KABLIX_PROFIL_FENETRE || 2500);
const ROT = Number(process.env.KABLIX_PROFIL_ROT || 0);

function firmware() {
	if (process.env.KABLIX_FW && existsSync(process.env.KABLIX_FW)) return process.env.KABLIX_FW;
	const dirs = [
		join(root, 'test-assets'),
		join(homedir(), 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'electropol-fr.kablix', 'micropython'),
	];
	for (const dir of dirs) {
		if (!existsSync(dir)) continue;
		const hit = readdirSync(dir).find((n) => /^RPI_PICO-.*\.uf2$/.test(n));
		if (hit) return join(dir, hit);
	}
	return undefined;
}
const fw = firmware();
if (!fw) { dire('SKIP : firmware Pico introuvable.'); process.exit(0); }

const bundle = join(TMP, 'pico.mjs');
async function charger(entry, nom) {
	const out = join(TMP, nom);
	await esbuild.build({
		entryPoints: [join(root, entry)], outfile: out, bundle: true,
		platform: 'node', format: 'esm', external: ['vscode'], logLevel: 'silent',
	});
	return import(pathToFileURL(out).href);
}
const { loadPythonProgram } = await charger('src/compiler.ts', 'compiler.mjs');
const { PicoEngine } = await charger('src/webview/engines/pico.mts', 'pico.mjs');

const source = CHARGE.fichier ? readFileSync(tk(CHARGE.fichier), 'utf8') : CHARGE.source;
const program = loadPythonProgram(fw, source, false);
const engine = new PicoEngine({
	kind: 'flash',
	segments: program.payload.segments.map((s) => ({
		addr: s.addr, data: new Uint8Array(Buffer.from(s.b64, 'base64')),
	})),
	script: program.payload.script,
});
let fronts = 0;
engine.onUpdate = () => { fronts++; };

// Démarrage : on attend que le script tourne vraiment, puis on coupe le
// cadencement (×100 = plus de sieste) et on laisse une seconde au JIT.
await new Promise((resolve) => {
	const garde = setTimeout(resolve, 120_000);
	engine.onRunning = () => { clearTimeout(garde); resolve(); };
	engine.start();
});
engine.setSpeed(100);

const sim = engine.sim;
const rp = sim.rp2040;
const core = rp.core;
const clock = sim.clock;
const [pio0, pio1] = rp.pio;
const rendre = (o) => { dire(`##RESULT##${JSON.stringify(o)}`); process.exit(0); };

/**
 * Laisser tourner le moteur pendant `ms`, mesuré — et pas sept fois plus.
 * Attendre de l'extérieur ne marche pas : la boucle de pico.mts se relance par
 * `MessageChannel`, et ni un `setTimeout` (18 s au lieu de 2,5) ni un second
 * MessagePort (7 s) ne reprennent la main assez souvent. C'est donc la boucle
 * elle-même qui borne la fenêtre : on enveloppe `execute` — appelé à chaque
 * tranche de 16 ms, quel que soit le chemin de relance — et on coupe à l'heure.
 */
const courir = (ms, { arreter = false, amorcer = false } = {}) => new Promise((resolve) => {
	const t0 = performance.now();
	const fin = t0 + ms;
	const orig = sim.execute.bind(sim);
	sim.execute = function () {
		orig();
		if (performance.now() >= fin) {
			sim.execute = orig;
			if (arreter) sim.stop();
			resolve(performance.now() - t0);
		}
	};
	if (amorcer) sim.execute();
});
await courir(1000); // une seconde de JIT avant de mesurer quoi que ce soit

// ────────────────────────────────────────────────────────────── PROFIL ────
if (process.env.KABLIX_PROFIL_MODE === 'profil') {
	const session = new Session();
	session.connect();
	const post = (m, p) => new Promise((res, rej) => session.post(m, p, (e, r) => (e ? rej(e) : res(r))));
	await post('Profiler.enable');
	await post('Profiler.setSamplingInterval', { interval: 250 }); // µs
	await post('Profiler.start');
	const instr0 = core.cycles;
	const mur0 = performance.now();
	await courir(FENETRE);
	const murMs = performance.now() - mur0;
	const { profile } = await post('Profiler.stop');
	engine.stop?.();

	// Classe propriétaire d'une ligne du bundle : on remonte jusqu'à la
	// déclaration de classe la plus proche. Sans ça `readUint32` de trois
	// classes différentes se confondent en une seule ligne du profil.
	const lignes = readFileSync(bundle, 'utf8').split('\n');
	const classeDe = (no) => {
		for (let i = Math.min(no, lignes.length - 1); i >= 0 && no - i < 900; i--) {
			const m = /^\s*(?:var\s+(\w+)\s*=\s*class|(?:export\s+)?class\s+(\w+))/.exec(lignes[i]);
			if (m) return (m[1] || m[2] || '').replace(/^_/, '');
		}
		return '';
	};

	// Familles : premier motif qui accroche, dans l'ordre. La table est écrite
	// pour qu'aucun temps ne se cache dans un fourre-tout — « autre » est
	// affiché tel quel, à charge d'y regarder s'il grossit.
	const FAMILLES = [
		[/^(CortexM0Core)\.(readUint|writeUint)/, 'mémoire (via le cœur)'],
		[/^(RP2040)\.(readUint|writeUint|findPeripheral)/, 'mémoire (bus)'],
		[/^(CortexM0Core|RPSIO|RP2040SIO)\./, 'interpréteur'],
		[/^(SimulationClock|ClockAlarm)\./, 'horloge simulée'],
		[/^(PIO|StateMachine|FIFO)/, 'PIO'],
		[/^(KablixSimulator|Simulator)\./, 'boucle de simulation'],
		[/^(RPUSB|USB|RPUART|UART|RPDMA|DMA|GPIOPin|RPTimer|Timer|RPPWM|PWM|RPI2C|RPSPI|RPADC|RPPPB|RPSysinfo|RPClocks|RPReset|RPPads|RPIO|Peripheral)/i, 'périphériques'],
		[/^\(garbage collector\)/, 'ramasse-miettes'],
		[/^\(program\)|^\(idle\)|^\(root\)|node:internal|^processTicks|^listOnTimeout|^Timeout/, 'hôte / repos'],
		[/^PicoEngine\.|^SimEngine\./, 'moteur Kablix (hors boucle)'],
	];

	const parId = new Map(profile.nodes.map((n) => [n.id, n]));
	const propre = new Map();
	const familles = new Map();
	let total = 0;
	for (let i = 0; i < profile.samples.length; i++) {
		const n = parId.get(profile.samples[i]);
		if (!n) continue;
		const dt = (profile.timeDeltas[i] || 0) / 1000; // µs -> ms
		if (dt <= 0) continue;
		const f = n.callFrame;
		const brut = f.functionName || '(anonyme)';
		const dansBundle = (f.url || '').endsWith('pico.mjs');
		const cls = dansBundle && brut && !brut.startsWith('(') ? classeDe(f.lineNumber) : '';
		const nom = cls ? `${cls}.${brut}` : brut;
		propre.set(nom, (propre.get(nom) || 0) + dt);
		const fam = FAMILLES.find(([re]) => re.test(nom))?.[1] || `autre : ${nom}`;
		familles.set(fam, (familles.get(fam) || 0) + dt);
		total += dt;
	}
	rendre({
		totalMs: total,
		murMs,
		echantillons: profile.samples.length,
		cyclesFenetre: core.cycles - instr0,
		familles: [...familles.entries()].sort((a, b) => b[1] - a[1]),
		fonctions: [...propre.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30),
	});
}

// ─────────────────────────────────────────────────────────── COMPTEURS ────
if (process.env.KABLIX_PROFIL_MODE === 'compteurs') {
	const n = new Map();
	let arme = false;
	// Enveloppe posée sur l'INSTANCE : elle masque la méthode du prototype sans
	// la remplacer, donc `this.readUint16(...)` du cœur passe bien par ici.
	const compte = (obj, cle, nom) => {
		const orig = obj[cle];
		if (typeof orig !== 'function') return;
		n.set(nom, 0);
		obj[cle] = function (...a) {
			if (arme) n.set(nom, n.get(nom) + 1);
			return orig.apply(this, a);
		};
	};
	compte(core, 'executeInstruction', 'instructions');
	for (const m of ['readUint32', 'readUint16', 'readUint8', 'writeUint32', 'writeUint16', 'writeUint8']) {
		compte(core, m, `cœur.${m}`);
		compte(rp, m, `bus.${m}`);
	}
	compte(rp, 'findPeripheral', 'bus.findPeripheral');
	compte(core, 'addUpdateFlags', 'cœur.addUpdateFlags');
	compte(core, 'substractUpdateFlags', 'cœur.substractUpdateFlags');
	compte(core, 'cyclesIO', 'cœur.cyclesIO');
	compte(core, 'checkForInterrupts', 'cœur.checkForInterrupts');
	compte(clock, 'tick', 'horloge.tick');
	compte(clock, 'linkAlarm', 'horloge.alarme programmée');
	compte(pio0, 'advance', 'pio0.advance');
	compte(pio1, 'advance', 'pio1.advance');
	for (const [i, sm] of [...pio0.machines, ...pio1.machines].entries()) {
		compte(sm, 'advance', `pio.machine[${i}].advance`);
	}
	compte(rp.sio, 'readUint32', 'sio.readUint32');
	compte(rp.sio, 'writeUint32', 'sio.writeUint32');

	const f0 = fronts;
	arme = true;
	await courir(FENETRE);
	arme = false;
	engine.stop?.();
	const instr = n.get('instructions') || 1;
	n.set('fronts GPIO', fronts - f0);
	rendre({
		instr,
		fenetreMs: FENETRE,
		appels: [...n.entries()].filter(([nom]) => nom !== 'instructions').sort((a, b) => b[1] - a[1]),
	});
}

// ─────────────────────────────────────────────────────────── ABLATIONS ────
// Chaque variante est une boucle ÉCRITE À PART, sans `if` dans le chemin chaud :
// un drapeau testé par instruction se paierait dans la mesure et brouillerait
// justement ce qu'on cherche à chiffrer.
//
// Deux précautions contre le bruit, apprises du banc précédent :
//   - PASSES courtes en ROND (moteur, puis chaque variante, puis on recommence)
//     et on garde le MEILLEUR de chaque : la machine ralentit par bouffées
//     (turbo qui retombe, antivirus) et l'état du firmware dérive — un ordre
//     figé donnerait l'avantage à celui qui passe en premier ;
//   - la boucle du VRAI moteur est mesurée SANS enveloppe de comptage : un
//     `n++` par instruction lui coûtait 15 %, soit plus que ce qu'on cherche.
//     On lit son compteur de CYCLES et on le convertit avec le rapport
//     cycles/instruction relevé sur la boucle de référence.
const MODE = process.env.KABLIX_PROFIL_MODE;
if (MODE === 'ablations' || MODE === 'candidats') {
	const BLOC = 2000;  // instructions entre deux lectures de l'horloge hôte
	const PASSES = 5;
	const DUREE = Math.max(300, Math.round(FENETRE / PASSES));

	// Cœur en WFE : on saute jusqu'à la prochaine alarme, comme la boucle de
	// pico.mts. Sans ce saut, une variante qui n'avance plus l'horloge simulée
	// (tick groupé, boucle nue) s'endormirait pour toujours.
	const reveiller = () => {
		let dt = clock.nanosToNextAlarm;
		if (dt <= 0) dt = 1000; // pas d'alarme en vue : 1 µs simulée, et on repart
		const sauts = dt / CYCLE_NANOS;
		core.cycles += sauts;
		pio0.advance(sauts);
		pio1.advance(sauts);
		clock.tick(dt);
	};

	const boucleReference = (ms) => { // ce que fait pico.mts, instruction par instruction
		let n = 0; const c0 = core.cycles; const t0 = performance.now(), fin = t0 + ms;
		for (;;) {
			for (let i = 0; i < BLOC; i++) {
				if (core.waiting) { reveiller(); continue; }
				const c = core.executeInstruction();
				pio0.advance(c); pio1.advance(c);
				clock.tick(c * CYCLE_NANOS);
				n++;
			}
			if (performance.now() >= fin) return { n, ms: performance.now() - t0, cycles: core.cycles - c0 };
		}
	};
	const boucleSansPio = (ms) => { // les deux advance() par instruction en moins
		let n = 0; const c0 = core.cycles; const t0 = performance.now(), fin = t0 + ms;
		for (;;) {
			for (let i = 0; i < BLOC; i++) {
				if (core.waiting) { reveiller(); continue; }
				const c = core.executeInstruction();
				clock.tick(c * CYCLE_NANOS);
				n++;
			}
			if (performance.now() >= fin) return { n, ms: performance.now() - t0, cycles: core.cycles - c0 };
		}
	};
	const boucleTickGroupe = (ms) => { // horloge versée tous les 256 pas, pas à chaque pas
		let n = 0, acc = 0; const c0 = core.cycles; const t0 = performance.now(), fin = t0 + ms;
		for (;;) {
			for (let i = 0; i < BLOC; i++) {
				if (core.waiting) { clock.tick(acc * CYCLE_NANOS); acc = 0; reveiller(); continue; }
				const c = core.executeInstruction();
				pio0.advance(c); pio1.advance(c);
				acc += c;
				if ((n & 255) === 0) { clock.tick(acc * CYCLE_NANOS); acc = 0; }
				n++;
			}
			if (performance.now() >= fin) return { n, ms: performance.now() - t0, cycles: core.cycles - c0 };
		}
	};
	const boucleNue = (ms) => { // interpréteur seul : ni PIO, ni horloge par pas
		let n = 0, acc = 0; const c0 = core.cycles; const t0 = performance.now(), fin = t0 + ms;
		for (;;) {
			for (let i = 0; i < BLOC; i++) {
				if (core.waiting) { clock.tick(acc * CYCLE_NANOS); acc = 0; reveiller(); continue; }
				acc += core.executeInstruction();
				n++;
			}
			clock.tick(acc * CYCLE_NANOS); acc = 0; // une fois par bloc : les alarmes tombent quand même
			if (performance.now() >= fin) return { n, ms: performance.now() - t0, cycles: core.cycles - c0 };
		}
	};
	const boucleAppelVide = (ms) => { // référence + UN appel de méthode vide par instruction
		let n = 0; const c0 = core.cycles; const t0 = performance.now(), fin = t0 + ms;
		for (;;) {
			for (let i = 0; i < BLOC; i++) {
				if (core.waiting) { reveiller(); continue; }
				core.rien();
				const c = core.executeInstruction();
				pio0.advance(c); pio1.advance(c);
				clock.tick(c * CYCLE_NANOS);
				n++;
			}
			if (performance.now() >= fin) return { n, ms: performance.now() - t0, cycles: core.cycles - c0 };
		}
	};

	// ---- CANDIDATS : l'inverse de l'ablation — non plus ce qu'on retire, mais
	// ce qu'un patch RAPPORTERAIT. Chaque candidat est écrit UNE fois, posé pour
	// de bon sur le prototype, et piloté par un booléen. Poser puis retirer une
	// méthode en cours de mesure ne marche pas (la forme de l'objet change, le
	// cœur est désoptimisé : -45 % relevés, soit tout sauf le candidat), et
	// mesurer un processus patché contre un processus témoin ne marche pas non
	// plus : d'un lancement à l'autre le firmware n'est pas au même point et le
	// débit varie de ±10 % — assez pour que l'étalon « un appel de méthode DE
	// PLUS » sorte à +10,9 %, ce qui n'a aucun sens. Un booléen, lui, laisse tout
	// dans le même processus, à la suite, comparable.
	const KX = { sram: false, cyclesio: false };
	{
		const proto = Object.getPrototypeOf(core);
		const vue = rp.sramView, taille = rp.sram.length;
		// 1. SRAM inlinée dans le cœur, comme le patch l'a déjà fait pour la lecture
		//    d'instruction : un saut cœur → bus en moins, et avec lui le test
		//    d'alignement et le `>>> 0` du bus. Mêmes bornes, donc même sémantique.
		const lire = proto.readUint32, ecrire = proto.writeUint32;
		proto.readUint32 = function (address) {
			if (KX.sram) {
				const o = address - 0x20000000;
				if (o >= 0 && o < taille) return vue.getUint32(o, true);
			}
			return lire.call(this, address);
		};
		proto.writeUint32 = function (address, value) {
			if (KX.sram) {
				const o = address - 0x20000000;
				if (o >= 0 && o < taille) { vue.setUint32(o, value, true); return; }
			}
			ecrire.call(this, address, value);
		};
		// 2. `cyclesIO` : un appel par accès mémoire (~200 pour 1000 instructions)
		//    pour rendre 0, 1, 3 ou 4. Court-circuité, il chiffre ce que vaudrait
		//    son inlining. La durée simulée devient fausse — mesure jetable.
		const cycles = proto.cyclesIO;
		proto.cyclesIO = function (addr, write) {
			if (KX.cyclesio) return 1;
			return cycles.call(this, addr, write);
		};
		// 3. ÉTALON : pas un patch, un appelable vide que la boucle d'à côté
		//    ajoutera à chaque instruction. Posé ici pour que la forme de l'objet
		//    soit la même dans toutes les variantes.
		proto.rien = () => 0;
	}
	// Le drapeau posé, la boucle de référence tourne : c'est le débit du candidat.
	const avecDrapeau = (cle) => (ms) => {
		KX[cle] = true;
		try { return boucleReference(ms); } finally { KX[cle] = false; }
	};

	const variantes = MODE === 'candidats' ? [
		['TÉMOIN : rien de posé', boucleReference],
		['SRAM inlinée dans le cœur', avecDrapeau('sram')],
		['cyclesIO court-circuité', avecDrapeau('cyclesio')],
		['ÉTALON : un appel de méthode DE PLUS', boucleAppelVide],
	] : [
		['référence (boucle maison)', boucleReference],
		['sans les 2 pio.advance', boucleSansPio],
		['horloge versée tous les 256', boucleTickGroupe],
		['interpréteur nu (ni PIO ni horloge)', boucleNue],
	];
	const meilleur = new Map();
	const garder = (nom, minstr) => {
		if (!(minstr > 0)) return;
		if (!meilleur.has(nom) || minstr > meilleur.get(nom)) meilleur.set(nom, minstr);
	};

	// Cycles par instruction : mesuré ici, servira à convertir le compteur de
	// cycles du moteur en instructions sans lui coller d'enveloppe.
	let cyclesInstr = 0;
	// Chauffe : les deux branches de chaque drapeau, puis le chemin nu. Une
	// branche jamais prise se paierait d'une désoptimisation à la première
	// mesure — et c'est justement la mesure qu'on veut propre.
	for (const cle of Object.keys(KX)) { KX[cle] = true; boucleReference(120); KX[cle] = false; }
	boucleReference(300); // chauffe : le JIT ne doit pas être payé par la première variante
	sim.stop();

	const moteurMs = [];
	for (let passe = 0; passe < PASSES; passe++) {
		// --- la boucle du vrai moteur, telle quelle (repère du mode ablations) ---
		if (MODE === 'ablations') {
			const c0 = core.cycles;
			const dt = await courir(DUREE, { arreter: true, amorcer: true });
			moteurMs.push([core.cycles - c0, dt]);
		}

		// --- les boucles maison, dans un ordre qui tourne ---
		for (let k = 0; k < variantes.length; k++) {
			const [nom, fn] = variantes[(k + passe + ROT) % variantes.length];
			const r = fn(DUREE);
			garder(nom, r.n / r.ms / 1000);
			if (nom === variantes[0][0] && r.n) cyclesInstr = r.cycles / r.n;
		}
	}
	// Conversion du moteur : cycles → instructions, avec le rapport mesuré.
	if (cyclesInstr > 0) {
		for (const [dc, dt] of moteurMs) garder('boucle du moteur', dc / cyclesInstr / dt / 1000);
	}
	rendre({ variantes: [...meilleur.entries()], cyclesInstr, fronts });
}

dire(`mode inconnu : ${process.env.KABLIX_PROFIL_MODE}`);
process.exit(1);
