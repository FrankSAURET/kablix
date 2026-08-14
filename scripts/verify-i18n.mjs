// Complétude des traductions FR de la BIBLIOTHÈQUE (v2026.7.235).
//
// Tout ce que l'utilisateur lit dans la palette et l'inspecteur passe par `t()`
// avec la chaîne anglaise pour clé : un libellé absent de i18n.mts sort donc en
// anglais, sans le moindre avertissement. C'est exactement ce qui est arrivé au
// condensateur : renommé « Capacitor » quand il est devenu l'entrée unique de la
// palette (v2026.7.232), il y est resté en anglais — les trois anciens libellés
// « Capacitor (film) »… étaient bien traduits, mais plus personne ne les
// demandait. Ce banc relit le catalogue et exige une traduction pour chaque
// libellé de composant, de propriété et de valeur de liste.
import esbuild from 'esbuild';
import { readFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const checks = [];
const ok = (name, cond, detail = '') => { checks.push({ name, ok: !!cond, detail: String(detail) }); };

const tmp = mkdtempSync(join(tmpdir(), 'kablix-i18n-'));
const out = join(tmp, 'catalog.mjs');
await esbuild.build({
  entryPoints: [join(root, 'src/webview/diagram/catalog.mts')],
  outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
});
const { CATALOG, PALETTE_CATALOG } = await import(pathToFileURL(out).href);

// Clés du dictionnaire, relues dans la source : `FR` n'est pas exporté (et n'a
// pas à l'être — c'est `t()` qui est l'interface).
const src = readFileSync(join(root, 'src/webview/i18n.mts'), 'utf8');
const KEYS = new Set();
// La valeur peut être écrite entre apostrophes OU entre guillemets (« Platine
// d'essai » contient une apostrophe) : les deux ouvertures sont acceptées.
for (const m of src.matchAll(/^\s*'((?:[^'\\]|\\.)*)':\s*['"]/gm)) KEYS.add(m[1].replace(/\\'/g, "'"));
ok(`dictionnaire FR relu (${KEYS.size} entrées)`, KEYS.size > 300, `${KEYS.size} clés`);

// Une clé traduite par elle-même n'en est pas une (« Diode » → « Diode » est en
// revanche parfaitement légitime : on ne vérifie que la PRÉSENCE).
const missing = (s) => typeof s === 'string' && s.trim() !== '' && !KEYS.has(s);

// --- Libellés des composants --------------------------------------------------
const labels = CATALOG.map((d) => d.label).filter(missing);
ok(`catalogue : les ${CATALOG.length} libellés de composant sont traduits`,
  labels.length === 0, labels.join(' · '));

// --- Libellés de propriétés et de valeurs de liste ----------------------------
const props = new Set();
const options = new Set();
const groupes = new Set();
for (const def of CATALOG) {
  for (const p of def.props ?? []) {
    if (missing(p.label)) props.add(`${def.type}/${p.attr}: ${p.label}`);
    // Titre de section repliable : affiché tel quel en tête du groupe.
    if (missing(p.group)) groupes.add(`${def.type}: ${p.group}`);
    for (const v of Object.values(p.optionLabels ?? {})) {
      if (missing(v)) options.add(`${def.type}/${p.attr}: ${v}`);
    }
  }
}
ok('inspecteur : tous les libellés de propriété sont traduits', props.size === 0, [...props].join(' · '));
ok('inspecteur : tous les titres de section repliable sont traduits',
  groupes.size === 0, [...groupes].join(' · '));
ok('inspecteur : tous les libellés de valeur (listes) sont traduits', options.size === 0, [...options].join(' · '));

// --- Ce que la palette montre vraiment ----------------------------------------
// Les variantes (`variant: true`) restent des types valides mais ne sont plus
// dans la bibliothèque : c'est le libellé de l'entrée RESTANTE qui se voit.
const palette = PALETTE_CATALOG.map((d) => d.label).filter(missing);
ok(`palette : les ${PALETTE_CATALOG.length} entrées visibles sont traduites`,
  palette.length === 0, palette.join(' · '));

let fail = 0;
for (const r of checks) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok && r.detail ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `i18n : ${fail} échec(s).` : `i18n : ${checks.length} contrôles OK — rien ne sort en anglais.`);
process.exit(fail ? 1 : 0);
