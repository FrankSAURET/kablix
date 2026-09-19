// Le capteur DS18B20 répond vraiment en 1-Wire Dallas.
//
// LA DEMANDE. Frank, item 1 du 18/09 : un DSB1820 en deux versions (CI et
// étanche), curseur de température de −55 à +125 °C, protocole 1-Wire, dans la
// bibliothèque externe.
//
// CE QUE CE BANC PROUVE. Le protocole, et lui seul : l'automate de
// `src/webview/engines/ds18b20.mts`. Le banc joue le rôle du MAÎTRE — il
// fabrique les créneaux de temps comme le ferait la bibliothèque OneWire — et
// relit ce que l'esclave répond. Aucune constante recopiée à la main : les
// octets attendus sont recalculés depuis la température, et l'aller-retour
// (encoder puis relire) est ce qui prouve l'encodage.
//
// POURQUOI JOUER LE MAÎTRE PLUTÔT QUE LIRE DES CHAMPS. Un automate se trompe
// dans les TRANSITIONS, pas dans ses variables : vérifier que `phase` vaut telle
// valeur ne dirait rien de ce qui se passe quand un vrai programme parle. On
// envoie donc de vrais créneaux, avec de vraies durées en microsecondes, et on
// exige les réponses que la fiche technique décrit.
//
// Usage : node scripts/verify-ds18b20.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-ds18b20');
mkdirSync(CACHE, { recursive: true });

const checks = [];
const ok = (nom, cond, detail = '') => {
	let val = cond;
	if (typeof cond === 'function') {
		try { val = cond(); }
		catch (e) { val = false; detail = `mesure impossible : ${e.message}`; }
	}
	checks.push({ nom, ok: !!val });
	console.log(`${val ? '✅' : '❌'} ${nom}${val ? '' : ` — ${detail}`}`);
};

// Le module est en TypeScript : on le compile pour node.
const paquet = await esbuild({
	entryPoints: [join(ROOT, 'src', 'webview', 'engines', 'ds18b20.mts')],
	bundle: true, format: 'esm', write: false, platform: 'node', absWorkingDir: ROOT,
});
const sortie = join(CACHE, 'ds18b20.mjs');
writeFileSync(sortie, paquet.outputFiles[0].text);
const M = await import('file:///' + sortie.split(String.fromCharCode(92)).join('/'));

// 1 cycle = 1 µs : les durées du protocole se lisent alors directement, et une
// erreur de conversion ne peut pas se cacher derrière un facteur d'échelle.
const CPU = 1;

/**
 * Le MAÎTRE. Il tient l'horloge et joue les créneaux exactement comme la
 * bibliothèque OneWire : c'est lui qui ouvre chaque bit par un front descendant.
 */
class Maitre {
	constructor(esclave) {
		this.e = esclave;
		this.t = 0;
		/** Impulsions que l'esclave a demandées, pour savoir si la ligne est basse. */
		this.impulsions = [];
	}

	/** La ligne est-elle tenue BASSE par l'esclave à cet instant ? */
	basseA(cycle) {
		return this.impulsions.some((i) => cycle >= i.debut && cycle < i.fin);
	}

	noter(imp) {
		if (imp) this.impulsions.push(imp);
	}

	/** Reset : BAS 500 µs, relâche, puis on regarde la présence. */
	reset() {
		this.noter(this.e.frontDescendant(this.t));
		this.t += 500;
		this.noter(this.e.frontMontant(this.t));
		// La présence se lit 70 µs après la relâche : le creux du vrai composant.
		const vue = this.basseA(this.t + 70);
		this.t += 300;
		return vue;
	}

	/** Écrit un bit : BAS court pour « 1 », BAS long pour « 0 ». */
	ecrireBit(bit) {
		this.noter(this.e.frontDescendant(this.t));
		this.t += bit ? 6 : 65;
		this.noter(this.e.frontMontant(this.t));
		this.t += bit ? 64 : 5;
		this.t += 2; // temps de repos entre créneaux
	}

	ecrireOctet(octet) {
		// LSB d'abord, comme le 1-Wire.
		for (let i = 0; i < 8; i++) this.ecrireBit((octet >> i) & 1);
	}

	/**
	 * Lit un bit : le maître ouvre par un BAS très court, relâche, puis
	 * échantillonne 13 µs après le front — l'instant que recommande la fiche
	 * technique (avant la fin des 30 µs pendant lesquels l'esclave tient bas).
	 */
	lireBit() {
		const front = this.t;
		this.noter(this.e.frontDescendant(this.t));
		this.t += 3;
		this.noter(this.e.frontMontant(this.t));
		const bas = this.basseA(front + 13);
		this.t = front + 70;
		return bas ? 0 : 1;
	}

	lireOctet() {
		let o = 0;
		for (let i = 0; i < 8; i++) o |= this.lireBit() << i;
		return o & 0xff;
	}

	lireOctets(n) {
		const r = [];
		for (let i = 0; i < n; i++) r.push(this.lireOctet());
		return r;
	}
}

/** Un capteur neuf et son maître, pour repartir d'un état propre à chaque cas. */
const banc = (id = 'part-1', tempC = 25) => {
	const e = new M.Ds18b20(id, CPU);
	e.temperatureC = tempC;
	return { e, m: new Maitre(e) };
};

// --- L'encodage de la température --------------------------------------------
// Aller-retour : on encode puis on relit. Une constante écrite à la main ici ne
// prouverait que ma capacité à recopier une fiche technique.
for (const t of [25, 0, 85, 125, -55, -10.5, 0.0625, -0.0625]) {
	const [lsb, msb] = M.ds18b20Temperature(t);
	const relu = M.ds18b20Lire(lsb, msb);
	ok(`température ${t} °C : encodée puis relue à l'identique`,
		Math.abs(relu - t) < 0.0626, `relu ${relu}`);
}

// LE piège des capteurs : les négatives. Le DS18B20 code en COMPLÉMENT À DEUX,
// le DHT22 en valeur absolue avec bit de signe. Confondre les deux passe
// inaperçu tant qu'on ne teste que des températures positives.
{
	const [lsb, msb] = M.ds18b20Temperature(-25);
	const mot = (msb << 8) | lsb;
	ok('les négatives sont en complément à deux (pas un bit de signe)',
		mot > 0x8000 && M.ds18b20Lire(lsb, msb) === -25,
		`mot 0x${mot.toString(16)}, relu ${M.ds18b20Lire(lsb, msb)}`);
}

// La plage du composant : il SATURE, il ne replie pas.
ok('au-delà de +125 °C, le capteur sature au lieu de replier',
	M.ds18b20Lire(...M.ds18b20Temperature(200)) === 125,
	`${M.ds18b20Lire(...M.ds18b20Temperature(200))} °C`);
ok('en deçà de −55 °C, le capteur sature au lieu de replier',
	M.ds18b20Lire(...M.ds18b20Temperature(-100)) === -55,
	`${M.ds18b20Lire(...M.ds18b20Temperature(-100))} °C`);

// --- Le CRC ------------------------------------------------------------------
// DallasTemperature REJETTE une lecture dont le CRC est faux : un CRC
// approximatif donnerait un capteur qui a l'air branché et ne rend jamais rien.
{
	// Vecteur de la note d'application Maxim AN27 : la ROM 0x02 1C B8 01 00 00 00
	// a pour CRC 0xA2.
	const crc = M.crc8Dallas([0x02, 0x1c, 0xb8, 0x01, 0x00, 0x00, 0x00]);
	ok('CRC8 Dallas conforme au vecteur de la note Maxim AN27',
		crc === 0xa2, `0x${crc.toString(16)} au lieu de 0xa2`);
	const rom = M.ds18b20Rom('part-1');
	ok('la ROM du capteur porte un CRC juste',
		M.crc8Dallas(rom.slice(0, 7)) === rom[7]);
	ok('la ROM commence par le code famille du DS18B20 (0x28)', rom[0] === 0x28,
		`0x${rom[0].toString(16)}`);
	const sp = M.ds18b20Scratchpad(25);
	ok('le scratchpad porte un CRC juste', M.crc8Dallas(sp.slice(0, 8)) === sp[8]);
}

// Deux composants distincts = deux adresses distinctes, et la même à chaque fois.
{
	const a = M.ds18b20Rom('part-1').join();
	const b = M.ds18b20Rom('part-2').join();
	ok('deux capteurs du schéma ont deux adresses différentes', a !== b);
	ok('un capteur garde la même adresse d\'un appel à l\'autre',
		a === M.ds18b20Rom('part-1').join());
}

// --- Le dialogue complet, en vrais créneaux ----------------------------------
{
	const { m } = banc('part-1', 25);
	ok('RESET : le capteur répond par une impulsion de présence', m.reset());
}
{
	// Un reset trop court ne doit RIEN déclencher : c'est ce qui distingue un
	// reset d'un « 0 » écrit, et s'y tromper casse tout le reste.
	const { e, m } = banc();
	m.noter(e.frontDescendant(m.t));
	m.t += 100; // trop long pour un bit, trop court pour un reset
	m.noter(e.frontMontant(m.t));
	ok('un BAS de 100 µs n\'est PAS pris pour un reset', !m.basseA(m.t + 70));
}
{
	// LE RESET QUI TOMBE UN CHEVEU SOUS LA SPEC. La bibliothèque `onewire` de
	// MicroPython vise 480 µs PILE : selon la granularité du lot d'instructions
	// en cours, la durée qui parvient à l'automate tombe à 479,95 µs aussi
	// souvent qu'à 480,04. Avec un seuil à 480 le capteur répondait aux premiers
	// resets puis ratait le suivant, et `convert_temp()` levait `OneWireError`
	// au milieu d'un programme qui marchait — un capteur « qui marche une fois
	// sur deux » sans rien changer au schéma. Le banc jouait 500 µs : il ne
	// pouvait pas le voir.
	const { e, m } = banc();
	m.noter(e.frontDescendant(m.t));
	m.t += 479.952; // mesuré sur le moteur Pico, au reset qui échouait
	m.noter(e.frontMontant(m.t));
	ok('un RESET de 479,95 µs est reconnu (dérive du moteur, pas un bit)',
		m.basseA(m.t + 70));
}
{
	// READ ROM : le capteur décline son identité. C'est le premier échange
	// bidirectionnel — il prouve que l'esclave reçoit ET émet.
	const { e, m } = banc('part-7');
	m.reset();
	m.ecrireOctet(M.CMD_READ_ROM);
	const lu = m.lireOctets(8);
	const attendu = M.ds18b20Rom('part-7');
	ok('READ ROM : les 8 octets d\'adresse sont rendus exactement',
		lu.join() === attendu.join(), `lu ${lu.join()}, attendu ${attendu.join()}`);
}
{
	// LE parcours qu'une bibliothèque Arduino suit vraiment.
	const { m } = banc('part-1', 23.5);
	m.reset();
	m.ecrireOctet(M.CMD_SKIP_ROM);
	m.ecrireOctet(M.CMD_CONVERT_T);
	m.reset();
	m.ecrireOctet(M.CMD_SKIP_ROM);
	m.ecrireOctet(M.CMD_READ_SCRATCHPAD);
	const sp = m.lireOctets(9);
	ok('SKIP ROM + CONVERT T + READ SCRATCHPAD : 9 octets rendus',
		sp.length === 9 && sp.some((o) => o !== 0xff), sp.join());
	ok('le CRC du scratchpad lu SUR LE FIL est juste',
		M.crc8Dallas(sp.slice(0, 8)) === sp[8],
		`calculé 0x${M.crc8Dallas(sp.slice(0, 8)).toString(16)}, reçu 0x${(sp[8] ?? 0).toString(16)}`);
	ok('la température lue sur le fil est celle du curseur',
		Math.abs(M.ds18b20Lire(sp[0], sp[1]) - 23.5) < 0.07,
		`${M.ds18b20Lire(sp[0], sp[1])} °C au lieu de 23,5`);
}
{
	// Une température NÉGATIVE, jusqu'au bout du fil : c'est là que se cache
	// l'erreur d'encodage, et elle ne se voit pas autrement.
	const { m } = banc('part-1', -12.5);
	m.reset();
	m.ecrireOctet(M.CMD_SKIP_ROM);
	m.ecrireOctet(M.CMD_READ_SCRATCHPAD);
	const sp = m.lireOctets(9);
	ok('une température négative traverse le fil sans se changer en +4000 °C',
		Math.abs(M.ds18b20Lire(sp[0], sp[1]) + 12.5) < 0.07,
		`${M.ds18b20Lire(sp[0], sp[1])} °C au lieu de −12,5`);
}
{
	// MATCH ROM avec la BONNE adresse : le capteur répond.
	const { m } = banc('part-3', 30);
	m.reset();
	m.ecrireOctet(M.CMD_MATCH_ROM);
	for (const o of M.ds18b20Rom('part-3')) m.ecrireOctet(o);
	m.ecrireOctet(M.CMD_READ_SCRATCHPAD);
	const sp = m.lireOctets(9);
	ok('MATCH ROM à la bonne adresse : le capteur répond',
		Math.abs(M.ds18b20Lire(sp[0], sp[1]) - 30) < 0.07,
		`${M.ds18b20Lire(sp[0], sp[1])} °C`);
}
{
	// MATCH ROM avec une AUTRE adresse : le capteur se tait. Sans cela, deux
	// capteurs sur un même fil répondraient ensemble et le bus serait illisible.
	const { m } = banc('part-3', 30);
	m.reset();
	m.ecrireOctet(M.CMD_MATCH_ROM);
	for (const o of M.ds18b20Rom('un-autre')) m.ecrireOctet(o);
	m.ecrireOctet(M.CMD_READ_SCRATCHPAD);
	const sp = m.lireOctets(9);
	ok('MATCH ROM à une AUTRE adresse : le capteur reste muet',
		sp.every((o) => o === 0xff), `a répondu ${sp.join()}`);
}
{
	// La résolution se règle par WRITE SCRATCHPAD, et elle CHANGE la mesure.
	const { m } = banc('part-1', 25.0625);
	m.reset();
	m.ecrireOctet(M.CMD_SKIP_ROM);
	m.ecrireOctet(M.CMD_WRITE_SCRATCHPAD);
	m.ecrireOctet(0x4b); // TH
	m.ecrireOctet(0x46); // TL
	m.ecrireOctet(0x1f); // config : 9 bits
	m.reset();
	m.ecrireOctet(M.CMD_SKIP_ROM);
	m.ecrireOctet(M.CMD_READ_SCRATCHPAD);
	const sp = m.lireOctets(9);
	const t = M.ds18b20Lire(sp[0], sp[1]);
	ok('WRITE SCRATCHPAD en 9 bits : la mesure perd ses décimales fines',
		t === 25, `${t} °C — les bits de poids faible devraient être effacés`);
}
{
	// Une commande inconnue ne doit pas laisser l'automate dans un état où il
	// répondrait n'importe quoi au créneau suivant.
	const { m } = banc();
	m.reset();
	m.ecrireOctet(0x12); // n'existe pas
	const sp = m.lireOctets(2);
	ok('une commande inconnue laisse le capteur muet (pas de réponse au hasard)',
		sp.every((o) => o === 0xff), sp.join());
}
{
	// CONTRE-CAS : sans reset préalable, rien ne doit répondre. Un automate qui
	// accepterait une commande « à froid » rendrait les contrôles ci-dessus verts
	// pour la mauvaise raison.
	const { m } = banc();
	m.ecrireOctet(M.CMD_SKIP_ROM);
	m.ecrireOctet(M.CMD_READ_SCRATCHPAD);
	const sp = m.lireOctets(9);
	ok('sans RESET préalable, le capteur ne répond pas',
		sp.every((o) => o === 0xff), sp.join());
}

const fails = checks.filter((c) => !c.ok).length;
console.log(fails
	? `ds18b20 : ${fails} échec(s).`
	: `ds18b20 : ${checks.length} contrôles OK — le capteur parle vraiment 1-Wire.`);
process.exit(fails ? 1 : 0);
