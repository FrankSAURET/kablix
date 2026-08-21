// MIROIR JS — le même interpréteur Thumb que `thumb-banc.c`, écrit en JavaScript.
//
// À QUOI IL SERT. Comparer le cœur WASM à rp2040js répondrait à côté : rp2040js
// décode 78 opérations, le banc n'en implémente que 25. Une partie de l'écart
// viendrait de la TAILLE du switch, pas du langage. Ce miroir a exactement le
// même switch à 25 branches, la même table de décodage, le même découpage
// mémoire et les mêmes DataView que le C. L'écart entre lui et le WASM, c'est
// le langage et rien d'autre — c'est LUI le dénominateur honnête du « gain brut ».
//
// La sémantique est celle de rp2040js, quirks compris (voir `addFlags` : les
// entiers y débordent parfois de 32 bits, et les drapeaux s'en ressentent).
// Aucun module importé : ce fichier est empaqueté tel quel pour le navigateur.

export const REG_PC = 15;
export const REG_LR = 14;
export const REG_SP = 13;

export class NoyauJS {
	constructor({ flash, sram, decode, flashBase, sramBase }) {
		this.flash = flash;
		this.sram = sram;
		this.decode = decode;
		this.flashBase = flashBase;
		this.sramBase = sramBase;
		this.flashView = new DataView(flash.buffer, flash.byteOffset, flash.byteLength);
		this.sramView = new DataView(sram.buffer, sram.byteOffset, sram.byteLength);
		this.regs = new Uint32Array(16);
		this.N = false; this.Z = false; this.C = false; this.V = false;
		this.cycles = 0;
		this.inconnu = 0; // opcode non implémenté rencontré (0 = aucun)
		/** Trappes vers « les périphériques » — le pont que le WASM devra franchir. */
		this.mmioRead = () => 0x5a5a5a5a;
		this.mmioWrite = () => {};
		this.sorties = 0; // nombre de franchissements
	}

	// ------------------------------------------------------------ mémoire ----

	readUint32(addr) {
		let o = (addr - this.sramBase) >>> 0;
		if (o < this.sram.length) return this.sramView.getUint32(o, true);
		o = (addr - this.flashBase) >>> 0;
		if (o < this.flash.length) return this.flashView.getUint32(o, true);
		this.sorties++;
		return this.mmioRead(addr, 4) >>> 0;
	}

	readUint16(addr) {
		let o = (addr - this.flashBase) >>> 0;
		if (o < this.flash.length) return this.flashView.getUint16(o, true);
		o = (addr - this.sramBase) >>> 0;
		if (o < this.sram.length) return this.sramView.getUint16(o, true);
		this.sorties++;
		return this.mmioRead(addr, 2) & 0xffff;
	}

	readUint8(addr) {
		let o = (addr - this.flashBase) >>> 0;
		if (o < this.flash.length) return this.flash[o];
		o = (addr - this.sramBase) >>> 0;
		if (o < this.sram.length) return this.sram[o];
		this.sorties++;
		return this.mmioRead(addr, 1) & 0xff;
	}

	writeUint32(addr, value) {
		const o = (addr - this.sramBase) >>> 0;
		if (o < this.sram.length) { this.sramView.setUint32(o, value, true); return; }
		this.sorties++;
		this.mmioWrite(addr, 4, value >>> 0);
	}

	/** Coût mémoire d'un accès, copié de rp2040js : SIO gratuit, APB cher. */
	cyclesIO(addr, write) {
		addr = addr >>> 0;
		if (addr >= 0xd0000000 && addr < 0xe0000000) return 0;
		if (addr >= 0x40000000 && addr < 0x50000000) return write ? 4 : 3;
		return 1;
	}

	// ------------------------------------------------------- les drapeaux ----

	/**
	 * `addend2` peut valoir 2^32 (cas ADCS où le registre vaut 0xffffffff et la
	 * retenue est posée) : rp2040js travaille en nombres flottants et le
	 * comportement en dépend. On le reproduit tel quel plutôt que de le corriger,
	 * sinon le banc d'équivalence signalerait un écart qui n'en est pas un.
	 */
	addFlags(a, b) {
		const result = a + b;
		const r = result | 0;
		this.N = !!(r & 0x80000000);
		this.Z = r === 0;
		this.C = result !== (result >>> 0);
		this.V = r !== ((a | 0) + (b | 0));
		return r;
	}

	subFlags(m, s) {
		const result = m - s;
		this.N = !!(result & 0x80000000);
		this.Z = (result & 0xffffffff) === 0;
		this.C = m >= s;
		this.V =
			(!!(result & 0x80000000) && !(m & 0x80000000) && !!(s & 0x80000000)) ||
			(!(result & 0x80000000) && !!(m & 0x80000000) && !(s & 0x80000000));
		return result;
	}

	condition(cond) {
		let r = false;
		switch (cond >> 1) {
			case 0b000: r = this.Z; break;
			case 0b001: r = this.C; break;
			case 0b010: r = this.N; break;
			case 0b011: r = this.V; break;
			case 0b100: r = this.C && !this.Z; break;
			case 0b101: r = this.N === this.V; break;
			case 0b110: r = this.N === this.V && !this.Z; break;
			case 0b111: r = true; break;
		}
		return cond & 0b1 && cond !== 0b1111 ? !r : r;
	}

	// ------------------------------------------------------- l'interpréteur ----

	/** Exécute `n` instructions. Renvoie le nombre réellement exécuté. */
	executer(n) {
		const regs = this.regs;
		const decode = this.decode;
		const flashView = this.flashView;
		const flashLen = this.flash.length;
		const flashBase = this.flashBase;
		let cycles = this.cycles;
		let fait = 0;
		for (; fait < n; fait++) {
			const opcodePC = regs[REG_PC] & ~1;
			const off = opcodePC - flashBase;
			const enFlash = off >= 0 && off < flashLen;
			const opcode = enFlash ? flashView.getUint16(off, true) : this.readUint16(opcodePC);
			const large = opcode >> 12 === 0b1111 || opcode >> 11 === 0b11101;
			const opcode2 = large
				? (enFlash && off + 2 < flashLen ? flashView.getUint16(off + 2, true) : this.readUint16(opcodePC + 2))
				: 0;
			regs[REG_PC] += 2;
			let delta = 1;
			switch (decode[opcode]) {
				case 0: { // ADCS
					const Rm = (opcode >> 3) & 0x7;
					const Rdn = opcode & 0x7;
					regs[Rdn] = this.addFlags(regs[Rm], regs[Rdn] + (this.C ? 1 : 0));
					break;
				}
				case 1: { // ADDS (register)
					const Rm = (opcode >> 6) & 0x7;
					const Rn = (opcode >> 3) & 0x7;
					regs[opcode & 0x7] = this.addFlags(regs[Rn], regs[Rm]);
					break;
				}
				case 2: { // ADDS immédiat 8 bits
					const Rdn = (opcode >> 8) & 0x7;
					regs[Rdn] = this.addFlags(regs[Rdn], opcode & 0xff);
					break;
				}
				case 3: { // B
					let imm11 = (opcode & 0x7ff) << 1;
					if (imm11 & (1 << 11)) imm11 = (imm11 & 0x7ff) - 0x800;
					regs[REG_PC] += imm11 + 2;
					delta++;
					break;
				}
				case 4: { // B conditionnel
					let imm8 = (opcode & 0xff) << 1;
					if (imm8 & (1 << 8)) imm8 = (imm8 & 0x1ff) - 0x200;
					if (this.condition((opcode >> 8) & 0xf)) { regs[REG_PC] += imm8 + 2; delta++; }
					break;
				}
				case 5: { // BL (seule instruction large du banc)
					if (opcode >> 11 === 0b11110 && opcode2 >> 14 === 0b11 && ((opcode2 >> 12) & 1) === 1) {
						const imm11 = opcode2 & 0x7ff;
						const J2 = (opcode2 >> 11) & 1;
						const J1 = (opcode2 >> 13) & 1;
						const imm10 = opcode & 0x3ff;
						const S = (opcode >> 10) & 1;
						const I1 = 1 - (S ^ J1);
						const I2 = 1 - (S ^ J2);
						const imm32 = ((S ? 0xff : 0) << 24) | (I1 << 23) | (I2 << 22) | (imm10 << 12) | (imm11 << 1);
						regs[REG_LR] = (regs[REG_PC] + 2) | 1;
						regs[REG_PC] += 2 + imm32;
						delta += 2;
					} else { this.inconnu = opcode; this.cycles = cycles; return fait; }
					break;
				}
				case 6: { // BX
					regs[REG_PC] = regs[(opcode >> 3) & 0xf] & ~1;
					delta++;
					break;
				}
				case 7: { // CMP immédiat
					this.subFlags(regs[(opcode >> 8) & 0x7], opcode & 0xff);
					break;
				}
				case 8: { // CMP registre
					this.subFlags(regs[opcode & 0x7], regs[(opcode >> 3) & 0x7]);
					break;
				}
				case 9: { // LDR immédiat
					const addr = regs[(opcode >> 3) & 0x7] + (((opcode >> 6) & 0x1f) << 2);
					delta += this.cyclesIO(addr, false);
					regs[opcode & 0x7] = this.readUint32(addr);
					break;
				}
				case 10: { // LDR littéral
					const addr = ((regs[REG_PC] + 2) & 0xfffffffc) + ((opcode & 0xff) << 2);
					delta += this.cyclesIO(addr, false);
					regs[(opcode >> 8) & 7] = this.readUint32(addr);
					break;
				}
				case 11: { // LDR [sp, #imm]
					const addr = regs[REG_SP] + ((opcode & 0xff) << 2);
					delta += this.cyclesIO(addr, false);
					regs[(opcode >> 8) & 0x7] = this.readUint32(addr);
					break;
				}
				case 12: { // LDRB immédiat
					const addr = regs[(opcode >> 3) & 0x7] + ((opcode >> 6) & 0x1f);
					delta += this.cyclesIO(addr, false);
					regs[opcode & 0x7] = this.readUint8(addr);
					break;
				}
				case 13: { // LDRH immédiat
					const addr = regs[(opcode >> 3) & 0x7] + (((opcode >> 6) & 0x1f) << 1);
					delta += this.cyclesIO(addr, false);
					regs[opcode & 0x7] = this.readUint16(addr);
					break;
				}
				case 14: { // LSLS immédiat
					const imm5 = (opcode >> 6) & 0x1f;
					const input = regs[(opcode >> 3) & 0x7];
					const result = input << imm5;
					regs[opcode & 0x7] = result;
					this.N = !!(result & 0x80000000);
					this.Z = result === 0;
					this.C = imm5 ? !!(input & (1 << (32 - imm5))) : this.C;
					break;
				}
				case 15: { // LSRS immédiat
					const imm5 = (opcode >> 6) & 0x1f;
					const input = regs[(opcode >> 3) & 0x7];
					const result = imm5 ? input >>> imm5 : 0;
					regs[opcode & 0x7] = result;
					this.N = !!(result & 0x80000000);
					this.Z = result === 0;
					this.C = !!((input >>> (imm5 ? imm5 - 1 : 31)) & 1);
					break;
				}
				case 16: { // MOV
					const Rm = (opcode >> 3) & 0xf;
					const Rd = ((opcode >> 4) & 0x8) | (opcode & 0x7);
					let value = Rm === REG_PC ? regs[REG_PC] + 2 : regs[Rm];
					if (Rd === REG_PC) { delta++; value &= ~1; }
					else if (Rd === REG_SP) value &= ~3;
					regs[Rd] = value;
					break;
				}
				case 17: { // MOVS
					const value = opcode & 0xff;
					regs[(opcode >> 8) & 7] = value;
					this.N = false;
					this.Z = value === 0;
					break;
				}
				case 18: { // MULS
					const Rdm = opcode & 0x7;
					const result = Math.imul(regs[(opcode >> 3) & 0x7], regs[Rdm]);
					regs[Rdm] = result;
					this.N = !!(result & 0x80000000);
					this.Z = result === 0;
					break;
				}
				case 19: { // POP
					let address = regs[REG_SP];
					for (let i = 0; i <= 7; i++) {
						if (opcode & (1 << i)) { regs[i] = this.readUint32(address); address += 4; delta++; }
					}
					if ((opcode >> 8) & 1) {
						regs[REG_SP] = address + 4;
						regs[REG_PC] = this.readUint32(address) & ~1;
						delta += 2;
					} else regs[REG_SP] = address;
					break;
				}
				case 20: { // PUSH
					let bits = 0;
					for (let i = 0; i <= 8; i++) if (opcode & (1 << i)) bits++;
					let address = regs[REG_SP] - 4 * bits;
					for (let i = 0; i <= 7; i++) {
						if (opcode & (1 << i)) { this.writeUint32(address, regs[i]); delta++; address += 4; }
					}
					if (opcode & (1 << 8)) this.writeUint32(address, regs[REG_LR]);
					regs[REG_SP] -= 4 * bits;
					break;
				}
				case 21: { // STR immédiat
					const addr = regs[(opcode >> 3) & 0x7] + (((opcode >> 6) & 0x1f) << 2);
					delta += this.cyclesIO(addr, true);
					this.writeUint32(addr, regs[opcode & 0x7]);
					break;
				}
				case 22: { // STR [sp, #imm]
					const addr = regs[REG_SP] + ((opcode & 0xff) << 2);
					delta += this.cyclesIO(addr, true);
					this.writeUint32(addr, regs[(opcode >> 8) & 0x7]);
					break;
				}
				case 23: { // SUBS registre
					const Rm = (opcode >> 6) & 0x7;
					const Rn = (opcode >> 3) & 0x7;
					regs[opcode & 0x7] = this.subFlags(regs[Rn], regs[Rm]);
					break;
				}
				case 24: { // UXTH
					regs[opcode & 0x7] = regs[(opcode >> 3) & 0x7] & 0xffff;
					break;
				}
				default:
					this.inconnu = opcode;
					this.cycles = cycles;
					return fait;
			}
			cycles += delta;
		}
		this.cycles = cycles;
		return fait;
	}

	/** État comparable d'un interpréteur à l'autre. */
	etat() {
		return {
			regs: Array.from(this.regs),
			N: this.N, Z: this.Z, C: this.C, V: this.V,
			cycles: this.cycles,
		};
	}
}
