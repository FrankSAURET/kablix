// NOYAU DE TEST — le morceau de code Thumb que les trois interpréteurs du banc
// WASM (rp2040js, le miroir JS, le cœur C compilé) exécutent tous les trois, à
// l'octet près. Piste 4 de roadmap.md.
//
// POURQUOI UN CODE ENGENDRÉ. Comparer deux interpréteurs n'a de sens que s'ils
// font exactement le même travail. Rejouer un vrai firmware demanderait de
// réimplémenter tout le RP2040 côté WASM — c'est justement le chantier que le
// banc doit AUTORISER OU INTERDIRE, on ne peut pas le faire avant. On engendre
// donc une boucle dont le mélange d'instructions reproduit celui mesuré sur le
// vrai firmware MicroPython (`_mesure-mix-thumb.mjs`, fichier `mix-thumb.json`).
//
// CE QUI EST GARANTI PAR CONSTRUCTION :
// - r5 (base de la zone de travail) et r6 (base MMIO) ne sont JAMAIS écrits, et
//   tous les accès mémoire passent par eux ou par SP : aucune adresse ne part
//   à l'aventure ;
// - les branchements conditionnels visent l'instruction SUIVANTE. Le décodage,
//   le test des drapeaux et l'écriture du PC coûtent la même chose qu'un vrai
//   branchement, mais rien ne peut être sauté — donc aucun PUSH ne peut perdre
//   son POP, et la pile revient à son point de départ à chaque tour ;
// - les appels (BL) visent deux sous-programmes réels, l'un rendant la main par
//   `BX lr`, l'autre par `POP {pc}` : c'est de là que viennent les PUSH, POP et
//   BX du mélange, exactement comme dans le vrai firmware (les proportions
//   mesurées, 7,1 % de BL pour 2,2 % de BX et 4,7 % de PUSH/POP, sont celles
//   d'appels et de retours appariés) ;
// - la boucle se referme sur elle-même : le banc arrête au bout de N
//   instructions, où qu'il en soit.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ------------------------------------------------------ plan mémoire ----
// Les mêmes constantes des trois côtés. Les tailles de flash et de SRAM sont
// plus petites que celles de rp2040js (16 Mo / 264 Ko) : seules comptent les
// plages RÉELLEMENT touchées, et le noyau tient dans quelques kilo-octets.
export const FLASH_BASE = 0x10000000;
export const FLASH_SIZE = 64 * 1024;
export const SRAM_BASE = 0x20000000;
export const SRAM_SIZE = 264 * 1024;
export const APB_BASE = 0x40000000;
export const SIO_BASE = 0xd0000000;

export const ENTREE = FLASH_BASE;
export const SP_INIT = 0x20040000; // 8 Ko de rab au-dessus, 256 Ko en dessous
export const R5_INIT = 0x20001000; // zone de travail, 128 octets utilisés
export const R6_INIT = SIO_BASE; // base MMIO (variante « trappe »)

/** Registres libres : ni r5 (base de travail), ni r6 (base MMIO). */
const LIBRES = [0, 1, 2, 3, 4, 7];

// ------------------------------------------------------ les opérations ----
// Numérotation DENSE, propre au banc : 25 opérations au lieu des 78 de
// rp2040js. C'est volontaire — le miroir JS a le même switch à 25 branches que
// le C, sinon la comparaison mesurerait la taille du switch et pas le langage.

export const OPS = [
	'ADCS', 'ADDS_REG', 'ADDS_IMM8', 'B', 'BCOND', 'BL', 'BX', 'CMP_IMM', 'CMP_REG',
	'LDR_IMM', 'LDR_LIT', 'LDR_SP', 'LDRB_IMM', 'LDRH_IMM', 'LSLS_IMM', 'LSRS_IMM',
	'MOV', 'MOVS', 'MULS', 'POP', 'PUSH', 'STR_IMM', 'STR_SP', 'SUBS_REG', 'UXTH',
];
export const OP = Object.fromEntries(OPS.map((n, i) => [n, i]));
export const OP_INCONNU = 255;

/**
 * Classification d'un opcode 16 bits. Les conditions sont celles de `kxClassify`
 * dans rp2040js patché — recopiées, pas réinventées : c'est la garantie que le
 * banc décode comme le moteur qu'il prétend remplacer.
 */
export function classer(opcode) {
	if (opcode >> 6 === 0b0100000101) return OP.ADCS;
	if (opcode >> 11 === 0b00110) return OP.ADDS_IMM8;
	if (opcode >> 9 === 0b0001100) return OP.ADDS_REG;
	if (opcode >> 12 === 0b1101 && ((opcode >> 9) & 0x7) !== 0b111) return OP.BCOND;
	if (opcode >> 11 === 0b11100) return OP.B;
	if (opcode >>> 11 === 0b11110) return OP.BL;
	if (opcode >> 7 === 0b010001110 && (opcode & 0x7) === 0) return OP.BX;
	if (opcode >> 11 === 0b00101) return OP.CMP_IMM;
	if (opcode >> 6 === 0b0100001010) return OP.CMP_REG;
	if (opcode >> 11 === 0b01101) return OP.LDR_IMM;
	if (opcode >> 11 === 0b10011) return OP.LDR_SP;
	if (opcode >> 11 === 0b01001) return OP.LDR_LIT;
	if (opcode >> 11 === 0b01111) return OP.LDRB_IMM;
	if (opcode >> 11 === 0b10001) return OP.LDRH_IMM;
	if (opcode >> 11 === 0b00000) return OP.LSLS_IMM;
	if (opcode >> 11 === 0b00001) return OP.LSRS_IMM;
	if (opcode >> 8 === 0b01000110) return OP.MOV;
	if (opcode >> 11 === 0b00100) return OP.MOVS;
	if (opcode >> 6 === 0b0100001101) return OP.MULS;
	if (opcode >> 9 === 0b1011110) return OP.POP;
	if (opcode >> 9 === 0b1011010) return OP.PUSH;
	if (opcode >> 11 === 0b01100) return OP.STR_IMM;
	if (opcode >> 11 === 0b10010) return OP.STR_SP;
	if (opcode >> 9 === 0b0001101) return OP.SUBS_REG;
	if (opcode >> 6 === 0b1011001010) return OP.UXTH;
	return OP_INCONNU;
}

/** Table de décodage 64 Ko, écrite telle quelle dans la mémoire du WASM. */
export function tableDecode() {
	const t = new Uint8Array(65536);
	for (let o = 0; o < 65536; o++) t[o] = classer(o);
	return t;
}

// ------------------------------------------------------ l'assembleur ----

const adcs = (rdn, rm) => 0x4140 | (rm << 3) | rdn;
const addsReg = (rd, rn, rm) => 0x1800 | (rm << 6) | (rn << 3) | rd;
const addsImm = (rdn, imm8) => 0x3000 | (rdn << 8) | (imm8 & 0xff);
const bcond = (cond, imm8) => 0xd000 | (cond << 8) | (imm8 & 0xff);
const b = (imm11) => 0xe000 | (imm11 & 0x7ff);
const bx = (rm) => 0x4700 | (rm << 3);
const cmpImm = (rn, imm8) => 0x2800 | (rn << 8) | (imm8 & 0xff);
const cmpReg = (rn, rm) => 0x4280 | (rm << 3) | rn;
const ldrImm = (rt, rn, imm5) => 0x6800 | (imm5 << 6) | (rn << 3) | rt;
const ldrLit = (rt, imm8) => 0x4800 | (rt << 8) | (imm8 & 0xff);
const ldrSp = (rt, imm8) => 0x9800 | (rt << 8) | (imm8 & 0xff);
const ldrbImm = (rt, rn, imm5) => 0x7800 | (imm5 << 6) | (rn << 3) | rt;
const ldrhImm = (rt, rn, imm5) => 0x8800 | (imm5 << 6) | (rn << 3) | rt;
const lsls = (rd, rm, imm5) => 0x0000 | (imm5 << 6) | (rm << 3) | rd;
const lsrs = (rd, rm, imm5) => 0x0800 | (imm5 << 6) | (rm << 3) | rd;
const mov = (rd, rm) => 0x4600 | ((rd & 8) << 4) | (rm << 3) | (rd & 7);
const movs = (rd, imm8) => 0x2000 | (rd << 8) | (imm8 & 0xff);
const muls = (rdm, rn) => 0x4340 | (rn << 3) | rdm;
const pop = (liste, p) => 0xbc00 | (p ? 0x100 : 0) | liste;
const push = (liste, m) => 0xb400 | (m ? 0x100 : 0) | liste;
const strImm = (rt, rn, imm5) => 0x6000 | (imm5 << 6) | (rn << 3) | rt;
const strSp = (rt, imm8) => 0x9000 | (rt << 8) | (imm8 & 0xff);
const subsReg = (rd, rn, rm) => 0x1a00 | (rm << 6) | (rn << 3) | rd;
const uxth = (rd, rm) => 0xb280 | (rm << 3) | rd;

/**
 * BL, encodage large complet (deux demi-mots). `offset` est la distance en
 * octets depuis (adresse de l'instruction + 4). Encodage inverse exact de celui
 * que rp2040js décode : I1 = 1 − (S ⊕ J1), donc J1 = S ⊕ (1 − I1).
 */
function bl(offset) {
	const S = offset < 0 ? 1 : 0;
	const i1 = (offset >> 23) & 1;
	const i2 = (offset >> 22) & 1;
	const imm10 = (offset >> 12) & 0x3ff;
	const imm11 = (offset >> 1) & 0x7ff;
	const j1 = S ^ (1 - i1);
	const j2 = S ^ (1 - i2);
	return [0xf000 | (S << 10) | imm10, 0xd000 | (j1 << 13) | (j2 << 11) | imm11];
}

// ------------------------------------------------------ tirage au sort ----

/** xorshift32 : reproductible d'une machine et d'un moteur JS à l'autre. */
function alea(graine) {
	let x = graine >>> 0 || 1;
	return () => {
		x ^= x << 13; x >>>= 0;
		x ^= x >>> 17;
		x ^= x << 5; x >>>= 0;
		return x / 0x100000000;
	};
}

// -------------------------------------------- lecture du mélange mesuré ----

const NOMS_RP2040 = new Map([
	['ADCS', 'ADCS'], ['ADDS (register)', 'ADDS_REG'], ['ADDS (Encoding T2)', 'ADDS_IMM8'],
	['B', 'B'], ['B (with cond)', 'BCOND'], ['BX', 'BX'],
	['CMP immediate', 'CMP_IMM'], ['CMP (register)', 'CMP_REG'],
	['LDR (immediate)', 'LDR_IMM'], ['LDR (literal)', 'LDR_LIT'], ['LDR (sp + immediate)', 'LDR_SP'],
	['LDRB (immediate)', 'LDRB_IMM'], ['LDRH (immediate)', 'LDRH_IMM'],
	['LSLS (immediate)', 'LSLS_IMM'], ['LSRS (immediate)', 'LSRS_IMM'],
	['MOV', 'MOV'], ['MOVS', 'MOVS'], ['MULS', 'MULS'],
	['POP', 'POP'], ['PUSH', 'PUSH'],
	['STR (immediate)', 'STR_IMM'], ['STR (sp + immediate)', 'STR_SP'],
	['SUBS (register)', 'SUBS_REG'], ['UXTH', 'UXTH'],
]);

/**
 * Parts visées, par opération dense, d'après `scripts/mix-thumb.json`. Les
 * opérations non implémentées (~9 % du vrai firmware) sont écartées et le reste
 * est renormalisé : le banc mesure donc le mélange des 91 % les plus fréquents.
 */
export function melangeVise(chemin) {
	const f = chemin || fileURLToPath(new URL('../mix-thumb.json', import.meta.url));
	const mix = JSON.parse(readFileSync(f, 'utf8'));
	const parts = new Float64Array(OPS.length);
	let garde = 0;
	for (const o of mix.operations) {
		const dense = o.nom.startsWith('BL /') ? 'BL' : NOMS_RP2040.get(o.nom);
		if (!dense) continue;
		parts[OP[dense]] += o.part;
		garde += o.part;
	}
	for (let i = 0; i < parts.length; i++) parts[i] /= garde;
	return { parts, couverture: garde, source: mix };
}

// ------------------------------------------------------ la fabrication ----

const SLOTS_PAR_BLOC = 128;
const MOTS_PAR_POOL = 16;

/**
 * Fabrique le noyau.
 *
 * @param {object} o
 * @param {number} o.instructions  instructions exécutées par TOUR de boucle (≈1024)
 * @param {number} o.mmio          part des LDR/STR détournés vers r6 (base MMIO)
 * @param {number} o.graine        graine du tirage
 */
export function genererNoyau({ instructions = 1024, mmio = 0, graine = 20260821 } = {}) {
	const { parts, couverture } = melangeVise();
	const rnd = alea(graine);
	const choix = (t) => t[(rnd() * t.length) | 0];

	// 1. Combien de chaque opération, dynamiquement, par tour de boucle.
	const vise = new Int32Array(OPS.length);
	for (let i = 0; i < OPS.length; i++) vise[i] = Math.round(parts[i] * instructions);

	// 2. Les appels d'abord : ils apportent leurs BX, PUSH, POP et un peu de
	//    UXTH / LSLS. Un BL sur trois rend la main par `BX lr`, les autres par
	//    `POP {r4, pc}` — c'est le rapport BX/BL mesuré sur le vrai firmware.
	const nBL = vise[OP.BL];
	const nBLbx = Math.min(vise[OP.BX], nBL);
	const nBLpop = nBL - nBLbx;
	const retire = (op, n) => { vise[op] = Math.max(0, vise[op] - n); };
	retire(OP.BX, nBLbx);
	retire(OP.UXTH, nBLbx); // corps de sub_bx
	retire(OP.PUSH, nBLpop);
	retire(OP.POP, nBLpop);
	retire(OP.LSLS_IMM, nBLpop); // corps de sub_pop
	vise[OP.BL] = 0;

	// 3. Les PUSH/POP qui resteraient (au-delà des appels) partent par paires.
	const nPaires = Math.min(vise[OP.PUSH], vise[OP.POP]);
	retire(OP.PUSH, nPaires);
	retire(OP.POP, nPaires);

	// 4. Un `B` par bloc saute par-dessus la réserve de constantes, et un `MOV
	//    pc, r8` referme la boucle : autant de moins à tirer, sinon le mélange
	//    dériverait. (Pourquoi `MOV pc` et pas `B` : la portée d'un `B` est de
	//    ±2 Ko, et le noyau fait le double. r8 tient l'adresse d'entrée et n'est
	//    jamais écrit — aucune instruction émise ne touche aux registres hauts.)
	const slotsEstimes = instructions - nBLbx * 2 - nBLpop * 3;
	const nBlocs = Math.max(1, Math.ceil(slotsEstimes / SLOTS_PAR_BLOC));
	retire(OP.B, nBlocs);
	retire(OP.MOV, 1);

	// 5. La liste des emplacements, mélangée.
	const slots = [];
	for (let i = 0; i < nBLbx; i++) slots.push({ t: 'bl_bx' });
	for (let i = 0; i < nBLpop; i++) slots.push({ t: 'bl_pop' });
	for (let i = 0; i < nPaires; i++) slots.push({ t: 'pushpop' });
	for (let op = 0; op < OPS.length; op++) {
		if (op === OP.BL || op === OP.BX) continue;
		for (let i = 0; i < vise[op]; i++) slots.push({ t: 'simple', op });
	}
	for (let i = slots.length - 1; i > 0; i--) {
		const j = (rnd() * (i + 1)) | 0;
		[slots[i], slots[j]] = [slots[j], slots[i]];
	}

	// 6. Assemblage. Deux passes : on pose d'abord les demi-mots avec des trous
	//    pour les valeurs qui dépendent d'adresses encore inconnues (LDR
	//    littéral, BL, B de rebouclage), puis on rebouche.
	const hw = []; // demi-mots
	const aReboucher = [];
	const pools = [];
	const mmioSlots = new Set();
	if (mmio > 0) {
		const memes = slots.map((s, i) => [s, i]).filter(([s]) => s.t === 'simple'
			&& [OP.LDR_IMM, OP.STR_IMM, OP.LDRB_IMM, OP.LDRH_IMM].includes(s.op));
		const combien = Math.round(mmio * instructions);
		for (let i = 0; i < Math.min(combien, memes.length); i++) mmioSlots.add(memes[i][1]);
	}

	const emet = (...mots) => { for (const m of mots) hw.push(m & 0xffff); };
	// Les valeurs immédiates restent modestes et variées : le but est que les
	// drapeaux, donc les branchements conditionnels, ne soient pas tous pris.
	const imm8 = () => (rnd() * 256) | 0;
	const imm5 = () => (rnd() * 32) | 0;

	const emetSimple = (op, iSlot) => {
		const base = mmioSlots.has(iSlot) ? 6 : 5;
		const rt = choix(LIBRES);
		switch (op) {
			case OP.ADCS: emet(adcs(choix(LIBRES), choix(LIBRES))); break;
			case OP.ADDS_REG: emet(addsReg(choix(LIBRES), choix(LIBRES), choix(LIBRES))); break;
			case OP.ADDS_IMM8: emet(addsImm(choix(LIBRES), imm8())); break;
			case OP.B: emet(b(-1)); break; // -1 demi-mot : la cible vaut PC+4+imm, donc l'instruction suivante
			case OP.BCOND: emet(bcond((rnd() * 14) | 0, -1)); break;
			case OP.CMP_IMM: emet(cmpImm(choix(LIBRES), imm8())); break;
			case OP.CMP_REG: emet(cmpReg(choix(LIBRES), choix(LIBRES))); break;
			case OP.LDR_IMM: emet(ldrImm(rt, base, (rnd() * 32) | 0)); break;
			case OP.LDR_SP: emet(ldrSp(rt, (rnd() * 256) | 0)); break;
			case OP.LDRB_IMM: emet(ldrbImm(rt, base, imm5())); break;
			case OP.LDRH_IMM: emet(ldrhImm(rt, base, imm5())); break;
			case OP.LSLS_IMM: emet(lsls(choix(LIBRES), choix(LIBRES), imm5())); break;
			case OP.LSRS_IMM: emet(lsrs(choix(LIBRES), choix(LIBRES), imm5())); break;
			case OP.MOV: emet(mov(choix(LIBRES), choix(LIBRES))); break;
			case OP.MOVS: emet(movs(choix(LIBRES), imm8())); break;
			case OP.MULS: emet(muls(choix(LIBRES), choix(LIBRES))); break;
			case OP.STR_IMM: emet(strImm(rt, base, (rnd() * 32) | 0)); break;
			case OP.STR_SP: emet(strSp(rt, (rnd() * 256) | 0)); break;
			case OP.SUBS_REG: emet(subsReg(choix(LIBRES), choix(LIBRES), choix(LIBRES))); break;
			case OP.UXTH: emet(uxth(choix(LIBRES), choix(LIBRES))); break;
			case OP.LDR_LIT: {
				aReboucher.push({ genre: 'lit', at: hw.length, bloc: pools.length, mot: (rnd() * MOTS_PAR_POOL) | 0 });
				emet(ldrLit(rt, 0));
				break;
			}
			case OP.PUSH: emet(push(0b00010000, 0)); break; // ne devrait pas arriver seul
			case OP.POP: emet(pop(0b00010000, 0)); break;
			default: throw new Error(`opération sans émetteur : ${OPS[op]}`);
		}
	};

	let iSlot = 0;
	for (let bloc = 0; bloc < nBlocs; bloc++) {
		const fin = bloc === nBlocs - 1 ? slots.length : Math.min(slots.length, (bloc + 1) * SLOTS_PAR_BLOC);
		for (; iSlot < fin; iSlot++) {
			const s = slots[iSlot];
			if (s.t === 'simple') emetSimple(s.op, iSlot);
			else if (s.t === 'pushpop') {
				emet(push(0b10010001, 0)); // r0, r4, r7
				emet(pop(0b10010001, 0));
			} else {
				aReboucher.push({ genre: 'bl', at: hw.length, cible: s.t });
				emet(0, 0);
			}
		}
		// saut par-dessus la réserve, puis la réserve elle-même (alignée mot)
		aReboucher.push({ genre: 'sautPool', at: hw.length, bloc });
		emet(b(0));
		if (hw.length & 1) emet(0x46c0); // NOP encodé MOV r8,r8 — bourrage d'alignement
		pools.push({ at: hw.length });
		for (let k = 0; k < MOTS_PAR_POOL * 2; k++) emet((rnd() * 65536) | 0);
	}
	// rebouclage : `MOV pc, r8`, r8 valant l'adresse d'entrée
	const atWrap = hw.length;
	emet(mov(15, 8));
	// sous-programmes
	const subBx = hw.length;
	emet(uxth(0, 7), bx(14));
	const subPop = hw.length;
	emet(push(0b00010000, 1), lsls(4, 7, 1), pop(0b00010000, 1));

	// 7. Rebouchage.
	const octet = (i) => i * 2; // décalage en octets d'un demi-mot
	for (const r of aReboucher) {
		if (r.genre === 'sautPool') {
			const apres = pools[r.bloc].at + MOTS_PAR_POOL * 2;
			const offset = octet(apres) - (octet(r.at) + 4);
			hw[r.at] = b(offset >> 1);
		} else if (r.genre === 'lit') {
			const adrInstr = octet(r.at);
			const base = (adrInstr + 4) & ~3;
			const cible = octet(pools[r.bloc].at) + r.mot * 4;
			const delta = (cible - base) / 4;
			if (delta < 0 || delta > 255) throw new Error(`LDR littéral hors de portée : ${delta}`);
			hw[r.at] = (hw[r.at] & 0xff00) | delta;
		} else {
			const cible = octet(r.cible === 'bl_bx' ? subBx : subPop);
			const [a, bb] = bl(cible - (octet(r.at) + 4));
			hw[r.at] = a; hw[r.at + 1] = bb;
		}
	}
	for (const p of pools) if (octet(p.at) & 3) throw new Error('réserve de constantes non alignée');

	// 8. Les octets, et le mélange RÉELLEMENT obtenu (compté sur la simulation,
	//    pas déduit du tirage : c'est le seul chiffre qu'on ait le droit de
	//    publier à côté du mélange mesuré).
	const code = new Uint8Array(hw.length * 2);
	const vue = new DataView(code.buffer);
	for (let i = 0; i < hw.length; i++) vue.setUint16(i * 2, hw[i], true);

	return {
		code, entree: ENTREE, taille: code.length, nBlocs, atWrap: octet(atWrap),
		subBx: FLASH_BASE + octet(subBx), subPop: FLASH_BASE + octet(subPop),
		visePart: parts, couverture, instructionsParTour: instructions,
	};
}

/**
 * Contenu initial de la SRAM : de quoi donner des valeurs variées aux lectures,
 * donc des drapeaux — et donc des branchements conditionnels qui ne sont pas
 * tous pris. Deux zones : celle pointée par r5, et celle lue par les `LDR [sp,
 * #imm]` (jusqu'à SP + 1020).
 */
export function sramInitiale(graine = 424242) {
	const rnd = alea(graine);
	const remplir = (n) => { const z = new Uint8Array(n); for (let i = 0; i < n; i++) z[i] = (rnd() * 256) | 0; return z; };
	return [
		{ adresse: R5_INIT, octets: remplir(2048) },
		{ adresse: SP_INIT, octets: remplir(1024) },
	];
}

/** État initial des registres, identique pour les trois interpréteurs. */
export function registresInitiaux() {
	const r = new Uint32Array(16);
	r[5] = R5_INIT;
	r[6] = R6_INIT;
	r[8] = ENTREE; // cible du `MOV pc, r8` de rebouclage
	r[13] = SP_INIT;
	r[14] = ENTREE | 1;
	r[15] = ENTREE;
	return r;
}
