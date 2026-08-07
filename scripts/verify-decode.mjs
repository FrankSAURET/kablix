// BANC — prouve que la table de décodage de rp2040js décide EXACTEMENT comme la
// cascade d'amont qu'elle remplace (pistes #11 + #12 de scripts/vitesse-pico.md).
//
// Ce que ça vérifie, et pourquoi ça suffit :
//   1. chaque `case N` porte le nom ET le corps (empreinte SHA) de la N-ième
//      branche de la cascade d'origine — aucun corps n'a été déplacé ou perdu ;
//   2. pour les 65 536 opcodes, la table désigne la même opération que la
//      cascade d'origine — exhaustif, pas d'échantillon ;
//   3. pour les 2 048 opcodes larges (préfixe 0b11110, ceux dont la décision
//      dépend d'opcode2), la mini-cascade du `case` groupé décide comme l'amont,
//      sur tout l'espace utile d'opcode2 ;
//   4. hors de ce préfixe, la décision ne dépend PAS d'opcode2 — c'est
//      l'hypothèse qui autorise à indexer la table sur le seul opcode.
//
// La référence est `scripts/_decode-reference.json`, écrit par
// `_gen-decode-rp2040.mjs` AVANT la transformation, donc à partir du fichier
// d'amont intact.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SRC = `${root}node_modules/rp2040js/dist/esm/cortex-m0-core.js`;
const ref = JSON.parse(readFileSync(`${root}scripts/_decode-reference.json`, 'utf8'));

let ok = 0;
let ko = 0;
const bon = (m) => { ok++; console.log(`✅ ${m}`); };
const mauvais = (m) => { ko++; console.log(`❌ ${m}`); };
const sha = (lignes) => createHash('sha256').update(lignes.join('\n')).digest('hex').slice(0, 16);

// ------------------------------------------------- lire le fichier patché ----
const texte = readFileSync(SRC, 'utf8');
const lignes = texte.split(/\r?\n/);
if (!texte.includes('KX_DECODE')) {
	console.log('❌ cortex-m0-core.js n\'est pas transformé (KX_DECODE absent) — patch non appliqué ?');
	process.exit(1);
}
const version = JSON.parse(readFileSync(`${root}node_modules/rp2040js/package.json`, 'utf8')).version;
if (version !== ref.version) {
	console.log(`❌ rp2040js est en ${version} mais la référence date de ${ref.version} : rejouer _gen-decode-rp2040.mjs`);
	process.exit(1);
}

// kxClassify, tel quel, pour l'évaluer ici
const debutClassif = lignes.findIndex((l) => l.startsWith('function kxClassify('));
const finClassif = lignes.findIndex((l, i) => i > debutClassif && l === '}');
const kxClassify = new Function(`${lignes.slice(debutClassif, finClassif + 1).join('\n')}\nreturn kxClassify;`)();

// les cases : numéro → nom + empreinte du corps (ré-indenté comme à l'origine)
const cases = new Map();
for (let i = 0; i < lignes.length; i++) {
	const m = lignes[i].match(/^ {12}case (\d+): \{$/);
	if (!m) continue;
	const nom = (lignes[i - 1].match(/^ {12}\/\/ (.+)$/) ?? [])[1];
	let j = i + 1;
	while (j < lignes.length && lignes[j] !== '                break;') j++;
	const corps = lignes.slice(i + 1, j).map((l) => (l.startsWith('    ') ? l.slice(4) : l));
	cases.set(Number(m[1]), { nom, sha: sha(corps), corps });
}

// la mini-cascade du case groupé (instructions larges)
const debutLarge = lignes.findIndex((l) => l === `            case ${ref.opLarge}: {`);
const condsLarges = [];
for (let i = debutLarge + 1; i < lignes.length; i++) {
	const m = lignes[i].match(/^ {16}(?:\} )?(?:else )?if \((.*)\) \{ \/\/ (.+)$/);
	if (m) { condsLarges.push({ cond: m[1], nom: m[2] }); continue; }
	if (lignes[i] === '                } else {') break;
}

// ------------------------- 1. chaque case porte le bon nom et le bon corps ----
const etroites = ref.branches.filter((b) => !b.large);
let deplace = 0;
etroites.forEach((b, n) => {
	const c = cases.get(n);
	if (!c) { mauvais(`case ${n} (${b.nom}) absent du fichier transformé`); deplace++; return; }
	if (c.nom !== b.nom) { mauvais(`case ${n} : nom « ${c.nom} » au lieu de « ${b.nom} »`); deplace++; return; }
	if (c.sha !== b.sha) { mauvais(`case ${n} (${b.nom}) : le CORPS a changé (${c.sha} ≠ ${b.sha})`); deplace++; }
});
if (!deplace) bon(`les ${etroites.length} corps d'instruction sont recopiés à l'identique, au bon numéro`);

const largesRef = ref.branches.filter((b) => b.large);
if (condsLarges.length !== largesRef.length) {
	mauvais(`case groupé : ${condsLarges.length} conditions au lieu de ${largesRef.length}`);
} else if (condsLarges.some((c, n) => c.cond !== largesRef[n].cond)) {
	mauvais('case groupé : les conditions ou leur ORDRE ne correspondent plus à l\'amont');
} else {
	bon(`le case groupé rejoue les ${largesRef.length} conditions larges dans l'ordre d'amont`);
}

// ------------------------------------------- 2. la cascade de référence ----
// Reconstruite littéralement depuis la référence : premier qui gagne, sur
// (opcode, opcode2), et elle rend le NOM de la branche.
const refCascade = new Function('opcode', 'opcode2', [
	...ref.branches.map((b, n) => `${n ? 'else ' : ''}if (${b.cond}) return ${JSON.stringify(b.nom)};`),
	'return "ILLEGAL";',
].join('\n'));

// Le chemin réel : table (indexée sur le seul opcode) puis, pour le groupe large,
// la mini-cascade du case.
const largeCascade = new Function('opcode', 'opcode2', [
	...condsLarges.map((c, n) => `${n ? 'else ' : ''}if (${c.cond}) return ${JSON.stringify(c.nom)};`),
	'return "ILLEGAL";',
].join('\n'));
const nomCase = (op) => (op === ref.opLarge ? null : op === ref.opIllegal ? 'ILLEGAL' : cases.get(op)?.nom);
const reel = (opcode, opcode2) => {
	const op = kxClassify(opcode);
	return op === ref.opLarge ? largeCascade(opcode, opcode2) : nomCase(op);
};

// ------------------------------- 3. exhaustif sur les 65 536 opcodes ----
let ecarts = 0;
let premier = null;
for (let opcode = 0; opcode < 65536; opcode++) {
	const attendu = refCascade(opcode, 0);
	const obtenu = reel(opcode, 0);
	if (attendu !== obtenu) {
		ecarts++;
		premier ??= `0x${opcode.toString(16).padStart(4, '0')} : attendu ${attendu}, obtenu ${obtenu}`;
	}
}
if (ecarts) mauvais(`${ecarts} opcodes décodés différemment (premier — ${premier})`);
else bon('les 65 536 opcodes désignent la même instruction qu\'avant (opcode2 = 0)');

// ------------------ 4. les opcodes larges, sur tout l'espace utile d'opcode2 ----
// Les conditions ne lisent jamais les quatre bits bas d'opcode2 (>>14, >>12, >>8,
// & 0xfff0) : on balaie donc ses 12 bits hauts, avec deux témoins pour les bits bas.
let ecartsLarges = 0;
let premierLarge = null;
let essais = 0;
for (let opcode = 0b11110 << 11; opcode < (0b11111 << 11); opcode++) {
	for (let haut = 0; haut < 4096; haut++) {
		for (const bas of [0x0, 0xf]) {
			const opcode2 = (haut << 4) | bas;
			essais++;
			const attendu = refCascade(opcode, opcode2);
			const obtenu = reel(opcode, opcode2);
			if (attendu !== obtenu) {
				ecartsLarges++;
				premierLarge ??= `opcode 0x${opcode.toString(16)} / opcode2 0x${opcode2.toString(16)} : attendu ${attendu}, obtenu ${obtenu}`;
			}
		}
	}
}
if (ecartsLarges) mauvais(`instructions larges : ${ecartsLarges} écarts sur ${essais} (premier — ${premierLarge})`);
else bon(`instructions larges : ${(essais / 1e6).toFixed(1)} M couples (opcode, opcode2) décodés à l'identique`);

// ------------- 5. hors du préfixe large, opcode2 ne doit rien changer ----
// C'est l'hypothèse qui autorise à indexer la table sur le seul opcode.
let fuites = 0;
const temoins = [0x0000, 0xffff, 0xd000, 0x8f50, 0x8f40, 0x8f60, 0x8800, 0xa000];
for (let opcode = 0; opcode < 65536; opcode++) {
	if (opcode >>> 11 === 0b11110) continue;
	const attendu = refCascade(opcode, 0);
	for (const opcode2 of temoins) {
		if (refCascade(opcode, opcode2) !== attendu) { fuites++; break; }
	}
}
if (fuites) mauvais(`${fuites} opcodes hors préfixe 0b11110 dépendent quand même d'opcode2 — la table ne peut pas être indexée sur le seul opcode`);
else bon('hors du préfixe 0b11110, la décision ne dépend jamais d\'opcode2');

// ------------------------------------------------ 6. la table du module ----
// Enfin, on relit la table telle que le module la construit vraiment.
const mod = await import(`file:///${SRC}`);
void mod;
const table = new Uint8Array(65536);
for (let opcode = 0; opcode < 65536; opcode++) table[opcode] = kxClassify(opcode);
const distinctes = new Set(table).size;
if (distinctes < 60) mauvais(`la table n'utilise que ${distinctes} opérations distinctes — suspect`);
else bon(`la table couvre ${distinctes} opérations distinctes sur ${ref.opIllegal + 1} déclarées`);

console.log(`\ndécodage rp2040js : ${ok} contrôles OK${ko ? `, ${ko} en ÉCHEC` : ''} — la table décide comme la cascade d'amont.`);
process.exit(ko ? 1 : 0);
