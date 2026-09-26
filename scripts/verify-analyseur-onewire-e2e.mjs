// L'analyseur lit-il ce que le DS18B20 répond VRAIMENT ? (v2026.9.5.165)
//
// LE DÉFAUT. Frank, 26/09 : « Je suis incapable de lire cette capture. Réglé à
// 35°C et affichage correcte dans le moniteur série. » Le programme lisait
// 35,0 °C, l'analyseur décodait des octets faux derrière READ SCRATCHPAD.
//
// LA CAUSE. En 1-Wire, c'est la durée du creux qui porte le bit. Le « 0 » que
// répond le capteur simulé dure 30,0 µs (LECTURE_ZERO_US), et le décodeur
// coupait EXACTEMENT à 30 µs : la soustraction de deux dates en virgule
// flottante tombait d'un côté ou de l'autre, et chaque octet lu était une
// loterie. Les bancs du décodeur (verify-analyseur, verify-analyseur-bits)
// restaient verts : leurs fronts fabriqués à la main mettaient 6 µs pour un 1
// et 60 µs pour un 0, loin du seuil. Aucun ne passait par le capteur simulé.
// Second défaut sur la même capture : seul l'octet qui suit le RESET était
// nommé, `0xBE` restait muet derrière MATCH ROM et ses huit octets d'adresse.
//
// CE BANC PART DU MOTEUR. Vrai firmware MicroPython, vrai programme de Frank
// (`testkablix/ds18b20-pico.py`), capteur réglé à 35 °C sur GP14, pince posée
// comme la page la pose (`setLogicProbes` ET `setPulseMonitors`), puis le
// décodeur de l'analyseur sur les fronts drainés. Il contrôle :
//  - la température : 35 °C = 0x0230, donc les deux premiers octets lus après
//    READ SCRATCHPAD valent 0x30 puis 0x02 ;
//  - la somme de contrôle : le 9e octet est le CRC-8 Dallas des huit premiers.
//    Un seul bit faux et elle ne tombe plus juste — c'est ce contrôle qui
//    prouve que TOUS les octets sont lus, pas seulement la température ;
//  - l'adresse : l'octet qui suit MATCH ROM est le code famille 0x28 ;
//  - les commandes de fonction nommées : CONVERT T, READ SCRATCHPAD.
//
// Pico 1 seulement : sur Pico 2, l'émulateur étire certains « 1 » du maître
// (creux de 22 à 50 µs au lieu de quelques µs, par paquets d'horloge) ; le fil
// simulé n'y respecte plus la norme, aucun seuil ne peut s'en accommoder.
//
// Contre-épreuve : `node scripts/verify-analyseur-onewire-e2e.mjs --ancien`
// compile analyseur-decodage.mts dans sa version HEAD.
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firmwareAbsent, firmwarePico } from './_firmware.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-onewire-e2e-'));
const ANCIEN = process.argv.includes('--ancien');
/** `--ancien` : le décodeur tel qu'il est enregistré dans HEAD. */
const versionHead = {
	name: 'version-head',
	setup(b) {
		b.onLoad({ filter: /analyseur-decodage\.mts$/ }, (args) => {
			if (!ANCIEN) return undefined;
			const contents = execFileSync('git', ['show', 'HEAD:src/webview/analyseur-decodage.mts'], { cwd: root, encoding: 'utf8' });
			return { contents, loader: 'ts', resolveDir: dirname(args.path) };
		});
	},
};
async function load(entry, name) {
	const out = join(tmp, name);
	await esbuild.build({
		plugins: [versionHead],
		entryPoints: [join(root, entry)],
		outfile: out,
		bundle: true,
		platform: 'node',
		format: 'esm',
		logLevel: 'silent',
	});
	return import(pathToFileURL(out).href);
}
if (ANCIEN) console.log('(contre-épreuve : analyseur-decodage en version HEAD)');

const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');
const { decoder } = await load('src/webview/analyseur-decodage.mts', 'decodage.mjs');

const BROCHE = 'GP14';
const TEMP = 35;
/** Nombre de mesures attendues au port série avant d'arrêter la capture. */
const MESURES = 3;

let echecs = 0;
function check(nom, ok, detail = '') {
	console.log(`${ok ? '✅' : '❌'} ${nom}${!ok && detail ? ` — ${detail}` : ''}`);
	if (!ok) echecs++;
}

/** CRC-8 Dallas/Maxim (polynôme 0x31 réfléchi = 0x8C), celui du scratchpad. */
function crc8(octets) {
	let crc = 0;
	for (let o of octets) {
		for (let i = 0; i < 8; i++) {
			const mix = (crc ^ o) & 1;
			crc >>= 1;
			if (mix) crc ^= 0x8c;
			o >>= 1;
		}
	}
	return crc;
}

const fw = firmwarePico('RPI_PICO-');
if (!fw) {
	console.log(`SKIP : ${firmwareAbsent('RPI_PICO-')}`);
	console.log('RESULTAT: OK (ignoré)');
	process.exit(0);
}
const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));
const script = readFileSync(join(root, 'testkablix/ds18b20-pico.py'), 'utf8');
const engine = new PicoEngine({ kind: 'flash', segments, script }, 'rp2040');
engine.setDs18b20([{ id: 'Capt1', pin: BROCHE, temperatureC: TEMP }]);
// Les deux déclarations de la page (cf. verify-analyseur-e2e.mjs) : sans la
// seconde, samplePulses ne date pas les fronts du maître.
engine.setLogicProbes([BROCHE]);
engine.setPulseMonitors([BROCHE]);
let serie = '';
engine.onSerial = (c) => { serie += c; };

const fronts = [];
const debut = Date.now();
engine.start();
await new Promise((resolve) => {
	const minuteur = setInterval(() => {
		const journal = engine.drainScopeEdges()[BROCHE];
		if (journal) for (let i = 0; i < journal.length; i += 2) fronts.push({ t: journal[i], niveau: journal[i + 1] });
		const n = (serie.match(/T0 =/g) ?? []).length;
		if (n >= MESURES || Date.now() - debut > 180_000) {
			clearInterval(minuteur);
			resolve();
		}
	}, 50);
});
engine.dispose();
console.log(`Pico 1, ${((Date.now() - debut) / 1000).toFixed(1)} s, ${fronts.length} fronts sur ${BROCHE}`);

check(`le programme lit ${TEMP}.0 °C au port série`, (serie.match(/T0 = 35\.0 C/g) ?? []).length >= MESURES, JSON.stringify(serie.slice(-120)));

const voies = [{ voie: 0, pin: BROCHE, nom: BROCHE, fronts, niveauInitial: 1 }];
const annotations = decoder(voies, { protocole: 'onewire', id: 'ow', donnees: 0, bits: false });
const octetDe = (a) => {
	const m = /^0x([0-9a-f]{2})/i.exec(a.texte);
	return m ? parseInt(m[1], 16) : undefined;
};

// Les octets qui suivent chaque commande, jusqu'au RESET suivant.
function apres(commande, combien) {
	const lectures = [];
	annotations.forEach((a, i) => {
		if (!a.texte.endsWith(commande)) return;
		const octets = [];
		for (let j = i + 1; j < annotations.length && octets.length < combien; j++) {
			const b = annotations[j];
			if (b.texte === 'RESET') break;
			if (b.nature === 'donnee') octets.push(octetDe(b));
		}
		lectures.push(octets);
	});
	return lectures;
}

const hex = (o) => (o === undefined ? '??' : o.toString(16).padStart(2, '0').toUpperCase());
// La lecture se repère par sa FORME, pas par le nom de la commande (le nommage
// a son propre contrôle plus bas) : MATCH ROM, huit octets d'adresse, 0xBE,
// puis les neuf octets du scratchpad. Ainsi la contre-épreuve montre aussi les
// octets faux de l'ancien seuil, et pas seulement l'absence de nom.
// La première lecture a le droit de tomber pendant que la ligne s'établit :
// on juge les suivantes, comme verify-ds18b20-e2e.
const scratch = apres('MATCH ROM', 18)
	.filter((o) => o.length === 18 && o[8] === 0xbe)
	.map((o) => o.slice(9));
console.log(`${scratch.length} lectures du scratchpad (MATCH ROM, adresse, 0xBE) :`);
for (const o of scratch) console.log(`   ${o.map(hex).join(' ')}`);
check('au moins deux lectures du scratchpad complètes', scratch.length >= 2, `${scratch.length}`);
check('READ SCRATCHPAD nommé en clair derrière l’adresse',
	annotations.filter((a) => a.texte === '0xBE READ SCRATCHPAD').length >= 2);
const jugees = scratch.slice(1);
check('température lue par l’analyseur : 0x30 0x02 (35 °C) à chaque lecture',
	jugees.length > 0 && jugees.every((o) => o[0] === 0x30 && o[1] === 0x02),
	jugees.map((o) => `${hex(o[0])} ${hex(o[1])}`).join(', '));
check('somme de contrôle juste : le 9e octet est le CRC-8 des huit premiers',
	jugees.length > 0 && jugees.every((o) => o.every((x) => x !== undefined) && crc8(o.slice(0, 8)) === o[8]),
	jugees.map((o) => `${hex(crc8(o.slice(0, 8)))} ≠ ${hex(o[8])}`).join(', '));

const match = apres('MATCH ROM', 8).filter((o) => o.length === 8).slice(1);
check('adresse visée par MATCH ROM : code famille 0x28 et CRC juste',
	match.length > 0 && match.every((o) => o[0] === 0x28 && crc8(o.slice(0, 7)) === o[7]),
	match.map((o) => o.map(hex).join(' ')).join(', '));

check('CONVERT T reconnu', annotations.some((a) => a.texte.endsWith('CONVERT T')));

console.log(echecs ? `\nRESULTAT: ECHEC (${echecs})` : '\nRESULTAT: OK');
process.exit(echecs ? 1 : 0);
