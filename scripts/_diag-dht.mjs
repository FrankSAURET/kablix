// Que se passe-t-il vraiment sur la ligne d'un DHT ? Ce diagnostic note CHAQUE
// changement d'état de la broche de données pendant une lecture et l'imprime
// avec sa durée : on voit d'un coup d'oeil le signal de départ du MCU, puis
// l'accusé de réception du capteur — ou son absence.
//
// Les projets dht11 et dht22 rendaient « [Errno 110] ETIMEDOUT » sur les deux
// cartes Pico, sans qu'on sache qui, du MCU ou du capteur simulé, se taisait.
//
//   node scripts/_diag-dht.mjs [dht11|dht22] [rp2040|rp2350] [secondes]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwarePico } from './_firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-dhtdiag-'));
const MODELE = process.argv[2] ?? 'dht22';
const famille = process.argv[3] ?? 'rp2040';
const SECONDES = Number(process.argv[4] ?? 12);

async function load(entry, name) {
	await esbuild.build({ entryPoints: [join(ROOT, entry)], outfile: join(tmp, name), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
	return import(pathToFileURL(join(tmp, name)).href);
}

const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');
const fw = firmwarePico(famille === 'rp2350' ? 'RPI_PICO2-' : 'RPI_PICO-');
if (!fw) { console.log('firmware absent'); process.exit(1); }
const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));

const GP = MODELE === 'dht11' ? 22 : 14;
const CLASSE = MODELE === 'dht11' ? 'DHT11' : 'DHT22';
const REPOS = MODELE === 'dht11' ? 1.2 : 2.2;
const script = [
	'from machine import Pin',
	'import dht',
	'import time',
	`capteur = dht.${CLASSE}(Pin(${GP}))`,
	'for i in range(2):',
	`    time.sleep(${REPOS})`,
	'    try:',
	'        capteur.measure()',
	"        print('LU', capteur.temperature(), capteur.humidity())",
	'    except OSError as e:',
	"        print('RATEE', e)",
	"print('KX_DONE')",
	'',
].join('\n');

const engine = new PicoEngine({ kind: 'flash', segments, script }, famille);
engine.setDht22([{ pin: `GP${GP}`, temperatureC: 23.4, humidity: 56.7, model: MODELE }]);

// Chaque changement de la broche, avec l'instant en microsecondes simulées. Les
// noms d'état viennent de rp2040js (Low/High/Input/InputPullUp/InputPullDown).
const ETATS = ['Low', 'High', 'Input', 'InputPullUp', 'InputPullDown'];
const fronts = [];
const broche = engine.mcu.gpio[GP];
const usSimulees = () => (engine.core.cycles / (engine.mcu.clkSys || 125e6)) * 1e6;
broche.addListener(() => {
	if (fronts.length < 4000) fronts.push({ us: usSimulees(), etat: broche.value, entree: broche.inputValue });
});

// Le capteur simule repond en poussant des niveaux sur l'ENTREE de la broche
// (setInput) : ces fronts-la ne changent pas `value` et echappent donc a
// l'ecouteur ci-dessus. On les compte a part.
const reponses = [];
const setInputOrigine = engine.setInput.bind(engine);
engine.setInput = (nom, valeur) => {
	const r = setInputOrigine(nom, valeur);
	if (nom === `GP${GP}` && reponses.length < 4000) {
		reponses.push({
			us: usSimulees(), valeur,
			entree: broche.inputValue, brut: broche.rawInputValue, ie: broche.inputEnable,
			oe: broche.outputEnable, ov: broche.outputValue,
			bit: (engine.mcu.gpioValues >>> GP) & 1,
		});
	}
	return r;
};

// Et que LIT le firmware ? GPIO_IN du bloc SIO (0xd0000004) est le registre
// par lequel il regarde la broche : on note chaque changement du bit qui nous
// interesse, vu depuis le programme.
const vues = [];
const toutesLectures = [];
let lecturesGpioIn = 0;
let dernierBit = null;
const readOrigine = engine.mcu.readUint32.bind(engine.mcu);
engine.mcu.readUint32 = (adresse) => {
	const v = readOrigine(adresse);
	if (adresse === 0xd0000004) {
		lecturesGpioIn++;
		if (toutesLectures.length < 6000) toutesLectures.push({ us: usSimulees(), bit: (v >>> GP) & 1 });
		const bit = (v >>> GP) & 1;
		if (bit !== dernierBit && vues.length < 4000) { vues.push({ us: usSimulees(), bit }); dernierBit = bit; }
	}
	return v;
};

let sortie = '';
engine.onSerial = (c) => { sortie += c; };
engine.start();
setTimeout(() => {
	console.log(`${MODELE} sur ${famille}, GP${GP} — ${fronts.length} changements notés`);
	// On ne montre que le voisinage du PREMIER signal de départ : une ligne
	// tenue basse plus de 400 µs, c'est le MCU qui réveille le capteur.
	let depart = -1;
	for (let i = 0; i + 1 < fronts.length; i++) {
		if (fronts[i].etat === 0 && fronts[i + 1].us - fronts[i].us > 400) { depart = i; break; }
	}
	if (depart < 0) {
		console.log('AUCUN signal de départ vu : le MCU ne tire jamais la ligne bas assez longtemps.');
		console.log('40 premiers changements :');
		for (const f of fronts.slice(0, 40)) console.log(`  ${f.us.toFixed(1)} us  etat=${ETATS[f.etat] ?? f.etat}  entree=${f.entree}`);
	} else {
		console.log(`signal de départ à ${fronts[depart].us.toFixed(1)} us ; 60 changements à partir de là :`);
		let prec = fronts[depart].us;
		for (const f of fronts.slice(depart, depart + 60)) {
			console.log(`  +${(f.us - prec).toFixed(1)} us  etat=${ETATS[f.etat] ?? f.etat}  entree=${f.entree}`);
			prec = f.us;
		}
	}
	console.log(`--- reponse du capteur : ${reponses.length} niveaux pousses sur l'entree, premier a ${reponses.length ? reponses[0].us.toFixed(1) : '?'} us ---`);
	let precR = reponses.length ? reponses[0].us : 0;
	for (const r of reponses.slice(0, 20)) {
		console.log(`  +${(r.us - precR).toFixed(1)} us  pousse=${r.valeur} brut=${r.brut} ie=${r.ie} entree=${r.entree} oe=${r.oe} ov=${r.ov} GPIO_IN=${r.bit}`);
		precR = r.us;
	}
	console.log(`--- vu par le programme (SIO GPIO_IN) : ${lecturesGpioIn} lectures, ${vues.length} changements ---`);
	let precV = vues.length ? vues[0].us : 0;
	for (const v of vues.slice(0, 20)) {
		console.log(`  +${(v.us - precV).toFixed(1)} us  bit=${v.bit}`);
		precV = v.us;
	}
	// Les lectures du programme AUTOUR du debut de la reponse : c'est la que se
	// joue la rencontre entre ce que le capteur pousse et ce que le programme voit.
	if (reponses.length) {
		const t0 = reponses[0].us;
		const autour = toutesLectures.filter((l) => l.us > t0 - 300 && l.us < t0 + 900);
		console.log(`--- lectures du programme entre ${(t0 - 300).toFixed(0)} et ${(t0 + 900).toFixed(0)} us : ${autour.length} ---`);
		// Seules les lectures APRES le debut de la reponse nous apprennent
		// quelque chose : avant, la ligne est haute et tout le monde est d'accord.
		const apres = autour.filter((l) => l.us >= t0);
		console.log(`  dont ${apres.length} apres le debut de la reponse :`);
		for (const l of apres.slice(0, 30)) console.log(`  +${(l.us - t0).toFixed(1)} us  bit=${l.bit}`);
	}
	console.log('--- console ---');
	console.log(sortie.split('\n').slice(-8).join('\n'));
	process.exit(0);
}, SECONDES * 1000);
