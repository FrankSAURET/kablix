// Banc : la bulle de survol des annotations de décodage (Frank, 02/10 : « Ca a
// disparu. Pas de bulle de survol »).
//
// Règle : tout texte écrit AUTREMENT qu'en entier — repli court (« 0xF0 » pour
// « 0xF0 SEARCH ROM »), tronqué (« 0xF… »), ou rien faute de place — se lit en
// entier dans la bulle (`annotationA`). Avant le correctif, seul le cas tronqué
// avait sa zone : le repli court et le « rien » n'en avaient pas.
//
// Vue réelle (analyseur-vue.mts) sur un canvas simulé : largeur de texte = 6 px
// par caractère, aucune peinture. La bulle est une propriété du MODÈLE de la
// vue, pas un pixel. Contre-épreuve : `git stash` puis relancer — doit échouer.
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-analyseur-bulle-'));
let ok = 0;
const echecs = [];
const check = (cond, titre, detail = '') => {
	if (cond) { ok++; console.log(`  ✓ ${titre}`); return; }
	echecs.push(titre);
	console.log(`  ✗ ${titre}${detail ? ` — ${detail}` : ''}`);
};

const sortie = join(tmp, 'vue.mjs');
await esbuild.build({
	stdin: {
		contents: "export { AnalyseurVue } from './src/webview/analyseur-vue.mts'; export { AnalyseurCapture } from './src/webview/analyseur-capture.mts';",
		resolveDir: ROOT, loader: 'ts',
	},
	bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'silent',
});
const { AnalyseurVue } = await import(pathToFileURL(sortie).href);
const { AnalyseurCapture } = await import(pathToFileURL(sortie).href);

// Canvas simulé : tout appel est accepté, measureText compte 6 px / caractère.
const ctx = new Proxy({}, {
	get: (c, k) => {
		if (k === 'measureText') return (t) => ({ width: String(t).length * 6 });
		if (k in c) return c[k];
		return () => undefined;
	},
	set: (c, k, v) => { c[k] = v; return true; },
});
const canvas = { clientWidth: 800, clientHeight: 300, width: 0, height: 0, getContext: () => ctx };
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: true }) };
globalThis.document = { body: { classList: { contains: () => true } }, documentElement: {}, createElement: () => canvas };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });

const capture = new AnalyseurCapture();
capture.declarerVoies([{ voie: 0, pin: '2', nom: 'D2' }]);
capture.reinitialiser();
capture.verser({ 2: [0, 0, 5, 1, 15, 0, 25, 1, 40, 0] });
const voie = { voie: 0, nom: 'D2', pin: 'GP2', probleme: null, analogique: false };
const textes = { aucuneSonde: '', aucuneDonnee: '', nowhere: '', notMcu: '', power: '', analogique: '', enAttente: '' };

/** Une annotation de `px` pixels de large dans une fenêtre de 100 ms sur 800 px. */
function bulleA(annot, px) {
	const vue = new AnalyseurVue(canvas);
	const plot = 800 - 116;
	const duree = (plot / px) * (annot.t1 - annot.t0);
	const e = {
		capture, voies: [voie], fenetre: { t0: annot.t0 - 1, duree }, annotations: [annot],
		souris: null, textes, lang: 'fr', marqueurs: [], marqueurPris: null,
	};
	try { vue.dessiner(e); } catch (x) { return { erreur: x.message }; }
	// Centre de l'annotation : on balaie y pour trouver la zone, x au milieu.
	const x = vue.xDe((annot.t0 + annot.t1) / 2, e.fenetre, 800);
	for (let y = 0; y < 300; y++) {
		const t = vue.annotationA(x, y);
		if (t !== null) return { texte: t };
	}
	return { texte: null };
}

const owi = { t0: 10, t1: 20, texte: '0xF0 SEARCH ROM', court: '0xF0', nature: 'donnee', voie: 0 };
const i2c = { t0: 10, t1: 20, texte: 'adr 0x48 W', court: '0x48', nature: 'donnee', voie: 0 };

// Entier : 15 car. × 6 + 4 = 94 px ; court : 0xF0 = 28 px ; rien : < 12 px.
const entier = bulleA(owi, 200);
check(!entier.erreur, 'la vue peint sur le canvas simulé', entier.erreur);
check(entier.texte === null, '1-Wire, place pour tout : pas de bulle (rien de caché)');
check(bulleA(owi, 50).texte === '0xF0 SEARCH ROM', '1-Wire : replié sur « 0xF0 » → la bulle donne SEARCH ROM');
check(bulleA(i2c, 30).texte === 'adr 0x48 W', 'I²C : replié sur « 0x48 » → la bulle donne le texte entier');
check(bulleA(owi, 20).texte === '0xF0 SEARCH ROM', 'tronqué « 0… » → la bulle donne le texte entier');
check(bulleA(owi, 6).texte === '0xF0 SEARCH ROM', 'sans place même pour l’octet → la bulle donne le texte entier');

rmSync(tmp, { recursive: true, force: true });
console.log(`\nRESULTAT: ${echecs.length === 0 ? 'OK' : 'ECHEC'} (${ok} ok, ${echecs.length} échec(s))`);
process.exit(echecs.length === 0 ? 0 : 1);
