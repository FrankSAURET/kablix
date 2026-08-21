/*
 * LE BANC, CÔTÉ NAVIGATEUR. Chargé par `scripts/_banc-wasm.mjs` dans une page
 * portant la VRAIE CSP de la webview Kablix (celle de `src/webview-html.ts`),
 * puis piloté en Chrome headless.
 *
 * Il répond à deux questions que Node ne peut pas trancher :
 *   1. la CSP laisse-t-elle instancier du WebAssembly — dans la page, et dans un
 *      worker `blob:` (c'est là que tourne la simulation) ? C'est la piste 3 ;
 *   2. le rapport WASM / JS tient-il hors de Node ?
 *
 * Le noyau Thumb, la table de décodage et la SRAM initiale arrivent tout faits
 * dans `window.__DONNEES` : `noyau.mjs` lit des fichiers, il n'a rien à faire ici.
 *
 * Les résultats repartent par `console.log`, en morceaux de base64 séparés par des
 * espaces : Chrome recopie le message sur stderr entre guillemets et en ASCII
 * approximatif — ni guillemet ni accent dans la charge utile, donc.
 */
(async () => {
	const D = window.__DONNEES;
	const sortie = { page: {}, worker: {}, chrome: (/Chrome\/([\d.]+)/.exec(navigator.userAgent) || [, '?'])[1] };

	const bin = (b64) => {
		const s = atob(b64);
		const u = new Uint8Array(s.length);
		for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
		return u;
	};
	const WASM = bin(D.wasm);
	const FLASH = bin(D.flash);
	const DECODE = bin(D.decode);
	const ZONES = D.zones.map((z) => ({ adresse: z.adresse, octets: bin(z.octets) }));
	const valeurMmio = (addr, taille) => (Math.imul(addr >>> 0, 2654435761) ^ taille) >>> 0;

	// ------------------------------------------------------- les moteurs ----

	function moteurJS() {
		const sram = new Uint8Array(D.sramTaille);
		for (const z of ZONES) sram.set(z.octets, z.adresse - D.sramBase);
		const n = new window.NoyauJS({
			flash: FLASH.slice(), sram, decode: DECODE,
			flashBase: D.entree, sramBase: D.sramBase,
		});
		n.regs.set(Uint32Array.from(D.regs));
		n.mmioRead = valeurMmio;
		return n;
	}

	async function moteurWasm() {
		const { instance } = await WebAssembly.instantiate(WASM, {
			env: { tick: () => {}, mmio_read: valeurMmio, mmio_write: () => {} },
		});
		const ex = instance.exports;
		const mem = new Uint8Array(ex.memory.buffer);
		mem.set(FLASH, ex.flash_ptr());
		mem.set(DECODE, ex.decode_ptr());
		const bas = ex.sram_ptr();
		for (const z of ZONES) mem.set(z.octets, bas + (z.adresse - D.sramBase));
		const regs = new Uint32Array(ex.memory.buffer, ex.regs_ptr(), 16);
		regs.set(Uint32Array.from(D.regs));
		ex.etat_set(0, 0, 0, 0);
		return { ex, regs };
	}

	// -------------------------------------------------------- la mesure ----

	function debit(fn) {
		let n = 20000;
		for (;;) {
			const t = performance.now(); fn(n); const d = performance.now() - t;
			if (d >= 80) { n = Math.max(2000, Math.round(n * (D.cibleMs / d))); break; }
			if (n >= 2 ** 30) break;
			n *= 4;
		}
		let meilleur = 0;
		for (let i = 0; i < D.essais; i++) {
			const t = performance.now();
			const c = fn(n);
			const d = performance.now() - t;
			if (d > 0) meilleur = Math.max(meilleur, c / (d / 1000));
		}
		return meilleur;
	}

	// ------------------------------------------------ 1. la page elle-même ----

	let w = null;
	try {
		w = await moteurWasm();
		sortie.page.wasm = true;
	} catch (e) {
		sortie.page.wasm = false;
		sortie.page.erreur = String(e && e.message || e).slice(0, 200);
	}

	if (w) {
		// Égalité : le même code, les mêmes registres, les mêmes drapeaux.
		const js = moteurJS();
		const n = 250000;
		js.executer(n);
		w.ex.run_burst(n);
		const d = w.ex.drapeaux_get();
		let egal = js.cycles === w.ex.cycles_get()
			&& js.N === !!(d & 1) && js.Z === !!(d & 2) && js.C === !!(d & 4) && js.V === !!(d & 8);
		for (let r = 0; r < 16; r++) if (js.regs[r] !== w.regs[r]) egal = false;
		sortie.page.egal = egal;

		const js2 = moteurJS();
		sortie.page.js = debit((k) => js2.executer(k));
		sortie.page.burst = debit((k) => w.ex.run_burst(k));
		const wcb = await moteurWasm();
		sortie.page.cb = debit((k) => wcb.ex.run_cb(k));
		const wstep = await moteurWasm();
		sortie.page.step = debit((k) => { for (let i = 0; i < k; i++) wstep.ex.step(); return k; });
	}

	// ------------------------------- 2. un worker blob:, comme la simulation ----

	sortie.worker = await new Promise((resolve) => {
		const code = `
			self.onmessage = async (e) => {
				try {
					const { instance } = await WebAssembly.instantiate(e.data.wasm, {
						env: { tick: () => {}, mmio_read: () => 0, mmio_write: () => {} },
					});
					const ex = instance.exports;
					const mem = new Uint8Array(ex.memory.buffer);
					mem.set(e.data.flash, ex.flash_ptr());
					mem.set(e.data.decode, ex.decode_ptr());
					const regs = new Uint32Array(ex.memory.buffer, ex.regs_ptr(), 16);
					regs.set(e.data.regs);
					ex.etat_set(0, 0, 0, 0);
					const t = performance.now();
					const fait = ex.run_burst(2000000);
					const d = performance.now() - t;
					self.postMessage({ wasm: true, fait, burst: d > 0 ? fait / (d / 1000) : 0 });
				} catch (err) {
					self.postMessage({ wasm: false, erreur: String(err && err.message || err).slice(0, 200) });
				}
			};`;
		let url;
		try {
			url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
		} catch (e) {
			resolve({ wasm: false, erreur: `blob refusé : ${e}` });
			return;
		}
		let fini = false;
		const stop = (v) => { if (!fini) { fini = true; try { URL.revokeObjectURL(url); } catch (_) {} resolve(v); } };
		let wk;
		try {
			wk = new Worker(url);
		} catch (e) {
			stop({ wasm: false, erreur: `worker refusé par la CSP : ${String(e && e.message || e).slice(0, 160)}` });
			return;
		}
		wk.onmessage = (e) => { wk.terminate(); stop(e.data); };
		wk.onerror = (e) => { stop({ wasm: false, erreur: `erreur worker : ${e.message || 'inconnue'}` }); };
		wk.postMessage({
			wasm: WASM, flash: FLASH, decode: DECODE, regs: Uint32Array.from(D.regs),
		});
		setTimeout(() => stop({ wasm: false, erreur: 'pas de réponse du worker en 30 s' }), 30000);
	});

	// ------------------------------------------------------- la remontée ----

	const texte = JSON.stringify(sortie);
	const octets = new TextEncoder().encode(texte);
	let brut = '';
	for (let i = 0; i < octets.length; i++) brut += String.fromCharCode(octets[i]);
	const b64 = btoa(brut);
	const TAILLE = 400;
	const total = Math.ceil(b64.length / TAILLE) || 1;
	for (let i = 0; i < total; i++) console.log(`KX ${i} ${total} ${b64.slice(i * TAILLE, (i + 1) * TAILLE)}`);
	document.getElementById('o').textContent = 'fini';
	setTimeout(() => window.close(), 100);
})().catch((e) => {
	console.log(`KXERREUR ${String(e && e.stack || e).replace(/"/g, "'").slice(0, 400)}`);
	setTimeout(() => window.close(), 100);
});
