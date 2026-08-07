// GÉNÉRATEUR (outil d'atelier) — transforme la cascade de décodage de rp2040js
// en table de décodage + switch. Pistes #11 et #12 de scripts/vitesse-pico.md.
//
// POURQUOI un script et pas une retouche à la main : `executeInstruction` décode
// l'opcode par une cascade de 83 `else if`, soit ~42 comparaisons par instruction
// émulée. La remplacer à la main, c'est déplacer 700 lignes sans filet ; et il
// faudrait tout refaire à chaque montée de version de rp2040js. Ici la
// transformation est mécanique et REJOUABLE :
//
//     npm i rp2040js@<nouvelle version>
//     node scripts/_gen-decode-rp2040.mjs
//     node scripts/verify-decode.mjs      (équivalence exhaustive)
//     npx patch-package rp2040js
//
// CE QUE ÇA PRODUIT. Les conditions de la cascade ne portent que sur les BITS de
// l'opcode — jamais sur l'état du cœur. Elles sont donc calculables une fois pour
// toutes : une table `Uint8Array(65536)` donne directement le numéro
// d'opération, et le `switch` dessus compile en table de saut. Les corps des
// branches sont recopiés OCTET POUR OCTET : seule la ligne `else if (…) {`
// devient `case N: {`.
//
// LE CAS PARTICULIER DES INSTRUCTIONS LARGES. Sept branches (BL, DMB, DSB, ISB,
// MRS, MSR, UDF.W) testent aussi `opcode2`, qui n'est pas connu au moment de
// remplir la table. Elles partagent toutes le préfixe `opcode >>> 11 === 0b11110`
// et — vérifié par le banc d'équivalence — aucune autre branche ne touche ce
// préfixe : elles sont donc regroupées en une seule opération dont le `case`
// rejoue leur mini-cascade d'origine, dans l'ordre d'origine.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sha = (lignes) => createHash('sha256').update(lignes.join('\n')).digest('hex').slice(0, 16);

const root = fileURLToPath(new URL('..', import.meta.url));
const SRC = `${root}node_modules/rp2040js/dist/esm/cortex-m0-core.js`;
const MARQUE = 'KX_DECODE';

const texte = readFileSync(SRC, 'utf8');
if (texte.includes(MARQUE)) {
	console.log('Déjà transformé (KX_DECODE présent) — rien à faire.');
	process.exit(0);
}
const lignes = texte.split(/\r?\n/);
const eol = texte.includes('\r\n') ? '\r\n' : '\n';

// --------------------------------------------------- 1. lire la cascade ----
const debut = lignes.findIndex((l) => l.includes('let deltaCycles = 1;'));
if (debut < 0) throw new Error('cascade introuvable : « let deltaCycles = 1; » absent');

const branches = [];
let nom = null;
let i = debut + 1;
let finCascade = -1;
for (; i < lignes.length; i++) {
	const l = lignes[i];
	const c = l.match(/^ {8}\/\/ (.+)$/);
	if (c) { nom = c[1]; continue; }
	const m = l.match(/^ {8}(?:else )?if \((.*)\) \{$/);
	const dernier = /^ {8}else \{$/.test(l);
	if (!m && !dernier) continue;
	// corps = jusqu'à la première accolade fermante à huit espaces
	let j = i + 1;
	while (j < lignes.length && !/^ {8}\}$/.test(lignes[j])) j++;
	branches.push({ nom: nom ?? 'ILLEGAL', cond: m ? m[1] : null, corps: lignes.slice(i + 1, j) });
	nom = null;
	i = j;
	if (dernier) { finCascade = j; break; }
}
if (finCascade < 0) throw new Error('fin de cascade introuvable (« else { » final)');

const illegal = branches.pop();
if (illegal.cond !== null) throw new Error('la dernière branche devrait être le « else » final');

// Aucun corps ne doit contenir un `break` hors boucle : il sortirait du switch.
for (const b of [...branches, illegal]) {
	if (b.corps.some((l) => /^ {12}break;/.test(l))) {
		throw new Error(`la branche ${b.nom} contient un break de premier niveau — transformation refusée`);
	}
}

// ------------------------------------ 2. isoler les branches « larges » ----
const LARGE = /opcode2/;
const larges = branches.filter((b) => LARGE.test(b.cond));
const premiereLarge = branches.findIndex((b) => LARGE.test(b.cond));
if (!larges.length) throw new Error('aucune branche à opcode2 — le fichier a changé de forme');

// Elles doivent toutes tenir dans le préfixe 0b11110, et lui seul.
const PREFIXE_LARGE = 'opcode >>> 11 === 0b11110';
for (const b of larges) {
	const partieOpcode = b.cond.split('&&')[0].trim();
	const ok = ['opcode >> 11 === 0b11110', 'opcode === 0xf3bf', 'opcode === 0b1111001111101111',
		'opcode >> 4 === 0b111100111000', 'opcode >> 4 === 0b111101111111'].includes(partieOpcode);
	if (!ok) throw new Error(`branche large inattendue (${b.nom}) : ${partieOpcode}`);
}

// Numérotation : les branches étroites gardent leur rang, les larges fusionnent
// en une seule opération placée au rang de la première d'entre elles.
const etroites = branches.filter((b) => !LARGE.test(b.cond));
const OP_LARGE = etroites.length;
const OP_ILLEGAL = etroites.length + 1;
if (OP_ILLEGAL > 255) throw new Error('plus de 255 opérations : Uint8Array insuffisant');

// ------------------------------------------ 3. le code de classification ----
// C'est la cascade d'origine, conditions seules, corps remplacés par un return.
// La branche « large » fusionnée prend la place de la première des sept, pour que
// l'ordre des tests — donc la sémantique du premier-qui-gagne — soit préservé.
const rangLarge = branches.slice(0, premiereLarge).filter((b) => !LARGE.test(b.cond)).length;
const tests = [];
etroites.forEach((b, n) => {
	if (n === rangLarge) tests.push({ cond: PREFIXE_LARGE, op: OP_LARGE, nom: larges.map((l) => l.nom).join(', ') });
	tests.push({ cond: b.cond, op: n, nom: b.nom });
});
if (rangLarge >= etroites.length) tests.push({ cond: PREFIXE_LARGE, op: OP_LARGE, nom: 'larges' });

const corpsClassif = [
	'function kxClassify(opcode) {',
	...tests.map((t, n) => `    ${n ? 'else ' : ''}if (${t.cond}) return ${t.op}; // ${t.nom}`),
	`    return ${OP_ILLEGAL};`,
	'}',
].join(eol);

const prelude = [
	'// KABLIX PATCH (généré par scripts/_gen-decode-rp2040.mjs — ne pas retoucher à la main).',
	'// Pistes #11 + #12 de scripts/vitesse-pico.md : la cascade de 83 « else if » de',
	'// executeInstruction coûtait ~42 comparaisons par instruction émulée. Les',
	'// conditions ne portent que sur les BITS de l\'opcode, jamais sur l\'état du cœur :',
	'// elles se calculent donc une fois pour toutes. kxClassify ci-dessous EST cette',
	'// cascade (conditions d\'origine, ordre d\'origine, corps remplacés par un return) ;',
	'// elle ne sert qu\'à remplir la table, au chargement du module, en ~10 ms.',
	'//',
	'// Les sept instructions larges (BL, DMB, DSB, ISB, MRS, MSR, UDF.W) dépendent aussi',
	'// d\'opcode2, inconnu à ce moment : elles partagent toutes le préfixe 0b11110, que',
	'// nulle autre branche ne revendique, et leur case rejoue leur mini-cascade.',
	'//',
	'// Équivalence prouvée par exhaustion : scripts/verify-decode.mjs.',
	corpsClassif,
	`const ${MARQUE} = (() => {`,
	'    const t = new Uint8Array(65536);',
	'    for (let opcode = 0; opcode < 65536; opcode++) t[opcode] = kxClassify(opcode);',
	'    return t;',
	'})();',
	'',
].join(eol);

// ------------------------------------------------- 4. le switch émis ----
const sortie = [];
sortie.push('        switch (KX_DECODE[opcode]) {');
etroites.forEach((b, n) => {
	sortie.push(`            // ${b.nom}`);
	sortie.push(`            case ${n}: {`);
	sortie.push(...b.corps.map((l) => (l ? `    ${l}` : l)));
	sortie.push('                break;');
	sortie.push('            }');
});
// Le case des instructions larges : la mini-cascade d'origine, intacte.
sortie.push(`            // ${larges.map((b) => b.nom).join(' / ')} — dépendent d'opcode2`);
sortie.push(`            case ${OP_LARGE}: {`);
larges.forEach((b, n) => {
	sortie.push(`                ${n ? '} else ' : ''}if (${b.cond}) { // ${b.nom}`);
	sortie.push(...b.corps.map((l) => (l ? `        ${l}` : l)));
});
sortie.push('                } else {');
sortie.push(...illegal.corps.map((l) => (l ? `        ${l}` : l)));
sortie.push('                }');
sortie.push('                break;');
sortie.push('            }');
sortie.push('            default: {');
sortie.push(...illegal.corps.map((l) => (l ? `    ${l}` : l)));
sortie.push('            }');
sortie.push('        }');

const avant = lignes.slice(0, debut + 1);
const apres = lignes.slice(finCascade + 1);
const resultat = [
	...avant.slice(0, avant.length),
	...sortie,
	...apres,
].join(eol);

// Le prélude va juste avant la déclaration de la classe.
const ancre = 'export class CortexM0Core {';
if (!resultat.includes(ancre)) throw new Error('ancre de classe introuvable');
writeFileSync(SRC, resultat.replace(ancre, prelude + ancre), 'utf8');

// ------------------- 5. la référence, pour prouver l'équivalence ensuite ----
// Écrite AVANT que l'original ne disparaisse : c'est la cascade d'amont, ordre
// compris, avec l'empreinte de chaque corps. Le banc verify-decode.mjs
// s'en sert pour prouver que le fichier transformé décide exactement pareil.
const version = JSON.parse(readFileSync(`${root}node_modules/rp2040js/package.json`, 'utf8')).version;
writeFileSync(`${root}scripts/_decode-reference.json`, `${JSON.stringify({
	commentaire: 'Cascade de décodage de rp2040js AVANT transformation. Produit par _gen-decode-rp2040.mjs, lu par verify-decode.mjs. Ne pas éditer à la main.',
	version,
	prefixeLarge: PREFIXE_LARGE,
	opLarge: OP_LARGE,
	opIllegal: OP_ILLEGAL,
	rangLarge,
	branches: branches.map((b) => ({ nom: b.nom, cond: b.cond, large: LARGE.test(b.cond), sha: sha(b.corps) })),
	illegal: { sha: sha(illegal.corps) },
}, null, 1)}\n`, 'utf8');

console.log(`${etroites.length} opérations étroites + 1 groupe large + illégal = ${OP_ILLEGAL + 1} cases`);
console.log(`Cascade remplacée : lignes ${debut + 2}..${finCascade + 1} de l'original.`);
console.log('Vérifier avec : node scripts/verify-decode.mjs');
