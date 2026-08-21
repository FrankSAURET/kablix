/*
 * CŒUR THUMB DU BANC — la variante WASM de `thumb-js.mjs`, ligne pour ligne.
 * Piste 4 de roadmap.md : mesurer ce que rapporterait un cœur Cortex-M0+ écrit
 * en langage compilé, et ce que coûte le pont vers JavaScript.
 *
 * Ce n'est PAS un émulateur : 25 opérations, aucune interruption, aucun
 * périphérique. C'est un instrument de mesure, et il n'a de valeur que parce
 * que son jumeau JS fait exactement la même chose (banc d'équivalence).
 *
 * Compilation (LLVM suffit, ni emscripten ni wasi-sdk) :
 *   clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry -Wl,--export-dynamic \
 *         -o thumb-banc.wasm thumb-banc.c
 *
 * QUATRE FAÇONS DE L'APPELER, et c'est tout l'objet du banc :
 *   run_burst(n)  n instructions d'affilée, sans jamais repasser en JS ;
 *   run_cb(n)     n instructions, avec un appel SORTANT vers JS à chacune ;
 *   step()        une instruction par appel ENTRANT depuis JS ;
 *   run_burst appelé par tranches de K depuis JS : le vrai compromis.
 * Les accès mémoire hors flash/SRAM sortent toujours vers JS (les périphériques
 * resteraient écrits en JS dans un portage réel) — c'est la variante « MMIO ».
 */

#define FLASH_BASE 0x10000000u
#define FLASH_SIZE (64u * 1024u)
#define SRAM_BASE 0x20000000u
#define SRAM_SIZE (264u * 1024u)

#define REG_SP 13
#define REG_LR 14
#define REG_PC 15

/* --------------------------------------------------------- l'état ---- */

static unsigned char flash[FLASH_SIZE];
static unsigned char sram[SRAM_SIZE];
static unsigned char decode[65536]; /* rempli par JS : une seule table de vérité */
static unsigned int regs[16];
static unsigned int fN, fZ, fC, fV;
static double cycles;
static unsigned int inconnu;
static unsigned int sorties; /* franchissements du pont */

/* --------------------------------------------- les trappes vers JS ---- */

__attribute__((import_module("env"), import_name("tick"))) extern void
js_tick(unsigned int delta);

__attribute__((import_module("env"), import_name("mmio_read"))) extern unsigned int
js_mmio_read(unsigned int addr, unsigned int taille);

__attribute__((import_module("env"), import_name("mmio_write"))) extern void
js_mmio_write(unsigned int addr, unsigned int taille, unsigned int valeur);

/* ----------------------------------------------- ce que JS peut voir ---- */

__attribute__((export_name("flash_ptr"))) unsigned char *flash_ptr(void) { return flash; }
__attribute__((export_name("sram_ptr"))) unsigned char *sram_ptr(void) { return sram; }
__attribute__((export_name("decode_ptr"))) unsigned char *decode_ptr(void) { return decode; }
__attribute__((export_name("regs_ptr"))) unsigned int *regs_ptr(void) { return regs; }
__attribute__((export_name("flash_taille"))) unsigned int flash_taille(void) { return FLASH_SIZE; }
__attribute__((export_name("sram_taille"))) unsigned int sram_taille(void) { return SRAM_SIZE; }
__attribute__((export_name("cycles_get"))) double cycles_get(void) { return cycles; }
__attribute__((export_name("inconnu_get"))) unsigned int inconnu_get(void) { return inconnu; }
__attribute__((export_name("sorties_get"))) unsigned int sorties_get(void) { return sorties; }

__attribute__((export_name("etat_set"))) void
etat_set(unsigned int n, unsigned int z, unsigned int c, unsigned int v) {
	fN = n; fZ = z; fC = c; fV = v;
	cycles = 0;
	inconnu = 0;
	sorties = 0;
}

__attribute__((export_name("drapeaux_get"))) unsigned int drapeaux_get(void) {
	return (fN ? 1u : 0u) | (fZ ? 2u : 0u) | (fC ? 4u : 0u) | (fV ? 8u : 0u);
}

/* ------------------------------------------------------- la mémoire ---- */

/* wasm32 lit sans contrainte d'alignement, mais clang ne le sait qu'ainsi. */
typedef unsigned int u32d __attribute__((aligned(1)));
typedef unsigned short u16d __attribute__((aligned(1)));

static inline unsigned int rd32(unsigned int addr) {
	unsigned int o = addr - SRAM_BASE;
	if (o < SRAM_SIZE) return *(u32d *)(sram + o);
	o = addr - FLASH_BASE;
	if (o < FLASH_SIZE) return *(u32d *)(flash + o);
	sorties++;
	return js_mmio_read(addr, 4);
}

static inline unsigned int rd16(unsigned int addr) {
	unsigned int o = addr - FLASH_BASE;
	if (o < FLASH_SIZE) return *(u16d *)(flash + o);
	o = addr - SRAM_BASE;
	if (o < SRAM_SIZE) return *(u16d *)(sram + o);
	sorties++;
	return js_mmio_read(addr, 2) & 0xffffu;
}

static inline unsigned int rd8(unsigned int addr) {
	unsigned int o = addr - FLASH_BASE;
	if (o < FLASH_SIZE) return flash[o];
	o = addr - SRAM_BASE;
	if (o < SRAM_SIZE) return sram[o];
	sorties++;
	return js_mmio_read(addr, 1) & 0xffu;
}

static inline void wr32(unsigned int addr, unsigned int valeur) {
	unsigned int o = addr - SRAM_BASE;
	if (o < SRAM_SIZE) { *(u32d *)(sram + o) = valeur; return; }
	sorties++;
	js_mmio_write(addr, 4, valeur);
}

/* Coût mémoire, copié de rp2040js : SIO gratuit, APB cher. */
static inline unsigned int cycles_io(unsigned int addr, int ecriture) {
	if (addr >= 0xd0000000u && addr < 0xe0000000u) return 0;
	if (addr >= 0x40000000u && addr < 0x50000000u) return ecriture ? 4 : 3;
	return 1;
}

/* ------------------------------------------------------ les drapeaux ---- */

/*
 * `b` est un entier 64 bits parce que rp2040js calcule en flottants : sur ADCS,
 * son second opérande peut valoir 2^32 et le drapeau C en dépend. Reproduire le
 * comportement plutôt que le corriger — sinon le banc d'équivalence se plaint
 * d'un écart qui n'en est pas un.
 */
static inline unsigned int add_flags(unsigned int a, unsigned long long b) {
	unsigned long long somme = (unsigned long long)a + b;
	unsigned int r = (unsigned int)somme;
	fN = r >> 31;
	fZ = (r == 0);
	fC = (somme >> 32) != 0;
	long long signee = (long long)(int)a + (int)(unsigned int)b;
	fV = ((long long)(int)r != signee);
	return r;
}

static inline unsigned int sub_flags(unsigned int m, unsigned int s) {
	unsigned int r = m - s;
	fN = r >> 31;
	fZ = (r == 0);
	fC = (m >= s);
	fV = ((r >> 31) && !(m >> 31) && (s >> 31)) || (!(r >> 31) && (m >> 31) && !(s >> 31));
	return r;
}

static inline int condition(unsigned int cond) {
	int r = 0;
	switch (cond >> 1) {
		case 0: r = fZ; break;
		case 1: r = fC; break;
		case 2: r = fN; break;
		case 3: r = fV; break;
		case 4: r = fC && !fZ; break;
		case 5: r = (fN != 0) == (fV != 0); break;
		case 6: r = ((fN != 0) == (fV != 0)) && !fZ; break;
		case 7: r = 1; break;
	}
	return (cond & 1) && cond != 15 ? !r : r;
}

/* --------------------------------------------------- l'interpréteur ---- */

/*
 * `rappel` est une constante au point d'appel : clang produit donc deux boucles
 * spécialisées, l'une sans le moindre test de mode, l'autre avec l'appel
 * sortant. Le banc mesurerait autrement le coût d'un `if` par instruction.
 */
__attribute__((always_inline)) static inline unsigned int
executer(unsigned int n, const int rappel) {
	unsigned int fait = 0;
	double cy = cycles;
	for (; fait < n; fait++) {
		unsigned int opcodePC = regs[REG_PC] & ~1u;
		unsigned int off = opcodePC - FLASH_BASE;
		int enFlash = off < FLASH_SIZE;
		unsigned int opcode = enFlash ? *(u16d *)(flash + off) : rd16(opcodePC);
		int large = (opcode >> 12) == 0xf || (opcode >> 11) == 0x1d;
		unsigned int opcode2 = 0;
		if (large) {
			opcode2 = (enFlash && off + 2 < FLASH_SIZE)
				? *(u16d *)(flash + off + 2)
				: rd16(opcodePC + 2);
		}
		regs[REG_PC] += 2;
		unsigned int delta = 1;
		switch (decode[opcode]) {
			case 0: { /* ADCS */
				unsigned int Rm = (opcode >> 3) & 7, Rdn = opcode & 7;
				regs[Rdn] = add_flags(regs[Rm], (unsigned long long)regs[Rdn] + (fC ? 1u : 0u));
				break;
			}
			case 1: { /* ADDS (registre) */
				unsigned int Rm = (opcode >> 6) & 7, Rn = (opcode >> 3) & 7;
				regs[opcode & 7] = add_flags(regs[Rn], regs[Rm]);
				break;
			}
			case 2: { /* ADDS immédiat 8 bits */
				unsigned int Rdn = (opcode >> 8) & 7;
				regs[Rdn] = add_flags(regs[Rdn], opcode & 0xff);
				break;
			}
			case 3: { /* B */
				int imm11 = (int)((opcode & 0x7ff) << 1);
				if (imm11 & (1 << 11)) imm11 = (imm11 & 0x7ff) - 0x800;
				regs[REG_PC] += (unsigned int)(imm11 + 2);
				delta++;
				break;
			}
			case 4: { /* B conditionnel */
				int imm8 = (int)((opcode & 0xff) << 1);
				if (imm8 & (1 << 8)) imm8 = (imm8 & 0x1ff) - 0x200;
				if (condition((opcode >> 8) & 0xf)) { regs[REG_PC] += (unsigned int)(imm8 + 2); delta++; }
				break;
			}
			case 5: { /* BL */
				if ((opcode >> 11) == 0x1e && (opcode2 >> 14) == 3 && ((opcode2 >> 12) & 1) == 1) {
					unsigned int imm11 = opcode2 & 0x7ff;
					unsigned int J2 = (opcode2 >> 11) & 1, J1 = (opcode2 >> 13) & 1;
					unsigned int imm10 = opcode & 0x3ff, S = (opcode >> 10) & 1;
					unsigned int I1 = 1 - (S ^ J1), I2 = 1 - (S ^ J2);
					unsigned int imm32 = ((S ? 0xffu : 0u) << 24) | (I1 << 23) | (I2 << 22) | (imm10 << 12) | (imm11 << 1);
					regs[REG_LR] = (regs[REG_PC] + 2) | 1u;
					regs[REG_PC] += 2 + imm32;
					delta += 2;
				} else { inconnu = opcode; cycles = cy; return fait; }
				break;
			}
			case 6: /* BX */
				regs[REG_PC] = regs[(opcode >> 3) & 0xf] & ~1u;
				delta++;
				break;
			case 7: /* CMP immédiat */
				sub_flags(regs[(opcode >> 8) & 7], opcode & 0xff);
				break;
			case 8: /* CMP registre */
				sub_flags(regs[opcode & 7], regs[(opcode >> 3) & 7]);
				break;
			case 9: { /* LDR immédiat */
				unsigned int addr = regs[(opcode >> 3) & 7] + (((opcode >> 6) & 0x1f) << 2);
				delta += cycles_io(addr, 0);
				regs[opcode & 7] = rd32(addr);
				break;
			}
			case 10: { /* LDR littéral */
				unsigned int addr = ((regs[REG_PC] + 2) & 0xfffffffcu) + ((opcode & 0xff) << 2);
				delta += cycles_io(addr, 0);
				regs[(opcode >> 8) & 7] = rd32(addr);
				break;
			}
			case 11: { /* LDR [sp, #imm] */
				unsigned int addr = regs[REG_SP] + ((opcode & 0xff) << 2);
				delta += cycles_io(addr, 0);
				regs[(opcode >> 8) & 7] = rd32(addr);
				break;
			}
			case 12: { /* LDRB immédiat */
				unsigned int addr = regs[(opcode >> 3) & 7] + ((opcode >> 6) & 0x1f);
				delta += cycles_io(addr, 0);
				regs[opcode & 7] = rd8(addr);
				break;
			}
			case 13: { /* LDRH immédiat */
				unsigned int addr = regs[(opcode >> 3) & 7] + (((opcode >> 6) & 0x1f) << 1);
				delta += cycles_io(addr, 0);
				regs[opcode & 7] = rd16(addr);
				break;
			}
			case 14: { /* LSLS immédiat */
				unsigned int imm5 = (opcode >> 6) & 0x1f;
				unsigned int input = regs[(opcode >> 3) & 7];
				unsigned int r = imm5 ? (input << imm5) : input;
				regs[opcode & 7] = r;
				fN = r >> 31;
				fZ = (r == 0);
				if (imm5) fC = (input >> (32 - imm5)) & 1;
				break;
			}
			case 15: { /* LSRS immédiat */
				unsigned int imm5 = (opcode >> 6) & 0x1f;
				unsigned int input = regs[(opcode >> 3) & 7];
				unsigned int r = imm5 ? (input >> imm5) : 0;
				regs[opcode & 7] = r;
				fN = r >> 31;
				fZ = (r == 0);
				fC = (input >> (imm5 ? imm5 - 1 : 31)) & 1;
				break;
			}
			case 16: { /* MOV */
				unsigned int Rm = (opcode >> 3) & 0xf;
				unsigned int Rd = ((opcode >> 4) & 8) | (opcode & 7);
				unsigned int valeur = (Rm == REG_PC) ? regs[REG_PC] + 2 : regs[Rm];
				if (Rd == REG_PC) { delta++; valeur &= ~1u; }
				else if (Rd == REG_SP) valeur &= ~3u;
				regs[Rd] = valeur;
				break;
			}
			case 17: { /* MOVS */
				unsigned int valeur = opcode & 0xff;
				regs[(opcode >> 8) & 7] = valeur;
				fN = 0;
				fZ = (valeur == 0);
				break;
			}
			case 18: { /* MULS */
				unsigned int Rdm = opcode & 7;
				unsigned int r = (unsigned int)((int)regs[(opcode >> 3) & 7] * (int)regs[Rdm]);
				regs[Rdm] = r;
				fN = r >> 31;
				fZ = (r == 0);
				break;
			}
			case 19: { /* POP */
				unsigned int addr = regs[REG_SP];
				for (unsigned int i = 0; i <= 7; i++) {
					if (opcode & (1u << i)) { regs[i] = rd32(addr); addr += 4; delta++; }
				}
				if ((opcode >> 8) & 1) {
					regs[REG_SP] = addr + 4;
					regs[REG_PC] = rd32(addr) & ~1u;
					delta += 2;
				} else regs[REG_SP] = addr;
				break;
			}
			case 20: { /* PUSH */
				unsigned int bits = 0;
				for (unsigned int i = 0; i <= 8; i++) if (opcode & (1u << i)) bits++;
				unsigned int addr = regs[REG_SP] - 4 * bits;
				for (unsigned int i = 0; i <= 7; i++) {
					if (opcode & (1u << i)) { wr32(addr, regs[i]); delta++; addr += 4; }
				}
				if (opcode & (1u << 8)) wr32(addr, regs[REG_LR]);
				regs[REG_SP] -= 4 * bits;
				break;
			}
			case 21: { /* STR immédiat */
				unsigned int addr = regs[(opcode >> 3) & 7] + (((opcode >> 6) & 0x1f) << 2);
				delta += cycles_io(addr, 1);
				wr32(addr, regs[opcode & 7]);
				break;
			}
			case 22: { /* STR [sp, #imm] */
				unsigned int addr = regs[REG_SP] + ((opcode & 0xff) << 2);
				delta += cycles_io(addr, 1);
				wr32(addr, regs[(opcode >> 8) & 7]);
				break;
			}
			case 23: { /* SUBS registre */
				unsigned int Rm = (opcode >> 6) & 7, Rn = (opcode >> 3) & 7;
				regs[opcode & 7] = sub_flags(regs[Rn], regs[Rm]);
				break;
			}
			case 24: /* UXTH */
				regs[opcode & 7] = regs[(opcode >> 3) & 7] & 0xffffu;
				break;
			default:
				inconnu = opcode;
				cycles = cy;
				return fait;
		}
		cy += delta;
		if (rappel) js_tick(delta);
	}
	cycles = cy;
	return fait;
}

/* ------------------------------------------------------ les variantes ---- */

/** n instructions d'affilée, sans jamais repasser en JS. Le plafond. */
__attribute__((export_name("run_burst"))) unsigned int run_burst(unsigned int n) {
	return executer(n, 0);
}

/** n instructions, avec un appel SORTANT vers JS à chacune. Le pire des cas. */
__attribute__((export_name("run_cb"))) unsigned int run_cb(unsigned int n) {
	return executer(n, 1);
}

/** Une instruction par appel ENTRANT depuis JS. L'autre pire des cas. */
__attribute__((export_name("step"))) unsigned int step(void) {
	return executer(1, 0);
}
