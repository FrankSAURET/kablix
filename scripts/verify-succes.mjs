// Banc des succès (feuille de route n°6). Deux parties :
//   A. le module pur `succes.mts` : chaque badge se décerne sur son fait, et
//      SEULEMENT sur lui (jamais pour du temps passé, jamais deux fois) ;
//   B. le câblage (page, analyseur → hôte → page, hôte, interface).
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-succes');
mkdirSync(CACHE, { recursive: true });

let ok = 0;
const fails = [];
const check = (cond, label) => {
  if (cond) ok++;
  else {
    fails.push(label);
    console.log(`  ✗ ${label}`);
  }
};
const egal = (a, b, label) => check(JSON.stringify(a) === JSON.stringify(b), `${label} (obtenu ${JSON.stringify(a)})`);

const out = join(CACHE, 'succes.mjs');
await esbuild({ entryPoints: [join(ROOT, 'src/webview/succes.mts')], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
const S = await import(pathToFileURL(out).href + `?t=${Date.now()}`);

const info = (o = {}) => ({
  projet: 'P1', jour: '2026-10-03', source: 'void loop(){}', composants: 3, etiquettes: 0, fils: 2, filsPropres: 1,
  protocoles: [], transistor: false, ...o,
});
const snap = (o = {}) => ({
  tMs: 6000, ledSaine: false, grilles: [], defauts: [], moteurSain: false, frontsSortie: 0, frontsInterruption: 0,
  instrument: false, serie: false, courantMoyenA: null, ...o,
});
const nouveau = () => {
  const obtenus = [];
  const suivi = new S.SuiviSucces(S.etatVierge(), (d) => obtenus.push(d.id), () => 1000);
  return { suivi, obtenus };
};

// ------------------------------------------------------------- A0. le catalogue
check(S.SUCCES.length === 15, `15 badges au catalogue (${S.SUCCES.length})`);
check(new Set(S.SUCCES.map((s) => s.id)).size === S.SUCCES.length, 'ids uniques');
check(S.SUCCES.every((s) => s.titre && s.atteste.length > 30), 'chaque badge dit ce qu\'il atteste');
check(S.SUCCES.filter((s) => s.famille === 'maitrise').length === 7 && S.SUCCES.filter((s) => s.famille === 'effort').length === 8, 'deux familles : 7 maîtrise, 8 effort');
check(!S.SUCCES.some((s) => /time spent|an hour/i.test(s.atteste)), 'aucun badge pour du temps passé');

// ------------------------------------------------------------- A1. rien pour rien
{
  const { suivi, obtenus } = nouveau();
  suivi.lancement(info());
  for (let i = 1; i <= 120; i++) suivi.tick(snap({ tMs: i * 500 })); // une minute à regarder
  suivi.arret();
  egal(obtenus, [], 'une minute devant l\'écran sans rien faire : aucun badge');
}

// ------------------------------------------------------------- A2. maîtrise
{
  const { suivi, obtenus } = nouveau();
  suivi.lancement(info());
  suivi.tick(snap({ tMs: 1000, ledSaine: true }));
  egal(obtenus, [], 'Ohm : pas avant 2 s');
  suivi.tick(snap({ tMs: 2500, ledSaine: true }));
  egal(obtenus, ['ohm'], 'Ohm : LED saine, premier lancement');
  suivi.tick(snap({ tMs: 3000, ledSaine: true }));
  egal(obtenus, ['ohm'], 'Ohm : décerné une seule fois');
}
{
  const { suivi, obtenus } = nouveau();
  suivi.lancement(info());
  suivi.tick(snap({ tMs: 100, grilles: ['R1'] }));
  suivi.tick(snap({ tMs: 3000, ledSaine: true, grilles: ['R1'] }));
  check(!obtenus.includes('ohm'), 'Ohm : refusé si quelque chose a grillé');
  suivi.arret();
  suivi.lancement(info());
  suivi.tick(snap({ tMs: 3000, ledSaine: true }));
  check(!obtenus.includes('ohm'), 'Ohm : refusé au deuxième lancement (« du premier montage »)');
}
{
  const { suivi, obtenus } = nouveau();
  suivi.lancement(info({ source: 'void loop(){ if (millis()-t>500){ digitalWrite(8,!digitalRead(8)); t=millis(); } }' }));
  suivi.tick(snap({ frontsSortie: 5 }));
  egal(obtenus, [], 'sans attendre : 5 fronts ne suffisent pas');
  suivi.tick(snap({ frontsSortie: 6 }));
  egal(obtenus, ['sans-attendre'], 'sans attendre : millis(), pas de delay, 6 fronts');
}
{
  const { suivi, obtenus } = nouveau();
  suivi.lancement(info({ source: 'void loop(){ digitalWrite(8,1); delay(500); digitalWrite(8,0); delay(500); }' }));
  suivi.tick(snap({ frontsSortie: 40 }));
  egal(obtenus, [], 'sans attendre : delay() = rien');
  check(S.sansDelay('import time\nwhile True:\n  led.toggle()\n  time.sleep(1)') === false, 'sans attendre : time.sleep() = rien');
  check(S.sansDelay('t = time.ticks_ms()\nif time.ticks_diff(time.ticks_ms(), t) > 500: pass') === true, 'sans attendre : ticks_ms en MicroPython');
  check(S.sansDelay('// delay(5)\nvoid loop(){ millis(); }') === true, 'sans attendre : delay en commentaire ignoré');
  check(S.sansDelay('void loop(){ digitalWrite(8,1); }') === false, 'sans attendre : ni delay ni horloge = doute, rien');
}
{
  const { suivi, obtenus } = nouveau();
  suivi.lancement(info({ source: 'void setup(){ attachInterrupt(digitalPinToInterrupt(2), f, RISING); }' }));
  suivi.tick(snap({ frontsInterruption: 0 }));
  egal(obtenus, [], 'interruption : posée mais jamais déclenchée = rien');
  suivi.tick(snap({ frontsInterruption: 1 }));
  egal(obtenus, ['interruption'], 'interruption : attachInterrupt + un front reçu');
}
{
  const { suivi, obtenus } = nouveau();
  suivi.lancement(info({ source: 'b.irq(trigger=Pin.IRQ_FALLING, handler=f)' }));
  suivi.tick(snap({ frontsInterruption: 2 }));
  egal(obtenus, ['interruption'], 'interruption : pin.irq en MicroPython');
}
{
  const { suivi, obtenus } = nouveau();
  suivi.lancement(info({ transistor: true }));
  suivi.tick(snap({ tMs: 1000, moteurSain: true }));
  suivi.tick(snap({ tMs: 3900, moteurSain: true }));
  egal(obtenus, [], 'bon calibre : pas avant 3 s de marche');
  suivi.tick(snap({ tMs: 4100, moteurSain: true }));
  egal(obtenus, ['calibre'], 'bon calibre : moteur sain par un transistor, 3 s');
}
{
  const { suivi, obtenus } = nouveau();
  suivi.lancement(info({ transistor: false }));
  suivi.tick(snap({ tMs: 1000, moteurSain: true }));
  suivi.tick(snap({ tMs: 9000, moteurSain: true }));
  egal(obtenus, [], 'bon calibre : sans transistor = rien (un moteur branché direct ne prouve rien)');
}
{
  const { suivi, obtenus } = nouveau();
  suivi.lancement(info());
  suivi.tick(snap({ tMs: 9000, courantMoyenA: 0.0005 }));
  egal(obtenus, [], 'économe : pas avant 10 s de programme');
  suivi.tick(snap({ tMs: 10500, courantMoyenA: 0.0005 }));
  egal(obtenus, ['econome'], 'économe : 0,5 mA de moyenne sur 10 s');
  const b = nouveau();
  b.suivi.lancement(info());
  b.suivi.tick(snap({ tMs: 20000, courantMoyenA: 0.012 }));
  egal(b.obtenus, [], 'économe : 12 mA = rien');
}
{
  const { suivi, obtenus } = nouveau();
  suivi.bus('spi', true);
  egal(obtenus, [], 'bus : seule une trame I²C lisible compte');
  suivi.bus('i2c', false);
  egal(obtenus, [], 'bus : sans accusé de réception = rien');
  suivi.bus('i2c', true);
  egal(obtenus, ['bus'], 'bus : trame I²C avec adresse et ACK');
}
{
  const { suivi, obtenus } = nouveau();
  suivi.lancement(info({ projet: 'A', protocoles: ['i2c'] }));
  suivi.tick(snap());
  suivi.arret();
  suivi.lancement(info({ projet: 'A', protocoles: ['spi'] }));
  suivi.tick(snap({ serie: true }));
  suivi.arret();
  egal(obtenus, [], 'trois protocoles : dans UN seul projet, rien');
  suivi.lancement(info({ projet: 'B', protocoles: ['spi'] }));
  suivi.tick(snap());
  suivi.arret();
  suivi.lancement(info({ projet: 'C' }));
  suivi.tick(snap({ serie: true }));
  egal(obtenus, ['trois-protocoles'], 'trois protocoles : I²C en A, SPI en B, série en C');
  check(S.representantsDistincts({ i2c: ['A'], spi: ['A'], serie: ['A', 'B'] }) === false, 'représentants distincts : un seul projet partagé = non');
  check(S.representantsDistincts({ i2c: ['A'], spi: ['B'], serie: ['C'] }) === true, 'représentants distincts : trois projets = oui');
}

// ------------------------------------------------------------- A3. effort
{
  const { suivi, obtenus } = nouveau();
  suivi.lancement(info());
  suivi.tick(snap({ tMs: 500, grilles: ['R1'], defauts: ['burn:resistor'] }));
  egal(obtenus, ['fumee'], 'premier nuage de fumée');
  suivi.tick(snap({ tMs: 900, grilles: ['R1', 'D1'] }));
  egal(obtenus, ['fumee'], 'premier nuage : une seule fois');
  suivi.arret();
  // même projet, corrigé
  suivi.lancement(info());
  suivi.tick(snap({ tMs: 4000 }));
  check(!obtenus.includes('deux-fois'), 'deux fois : pas avant 5 s');
  suivi.tick(snap({ tMs: 5500 }));
  check(obtenus.includes('deux-fois'), 'deux fois vaut mieux : grillé puis tourne');
}
{
  const { suivi, obtenus } = nouveau();
  suivi.lancement(info({ projet: 'X' }));
  suivi.tick(snap({ tMs: 500, grilles: ['R1'] }));
  suivi.arret();
  suivi.lancement(info({ projet: 'AUTRE' }));
  suivi.tick(snap({ tMs: 9000 }));
  check(!obtenus.includes('deux-fois'), 'deux fois : un AUTRE projet ne compte pas');
}
{
  const { suivi, obtenus } = nouveau();
  const lance = (defauts) => {
    suivi.lancement(info());
    suivi.tick(snap({ tMs: 6000, defauts }));
    suivi.arret();
  };
  lance(['lint:pwm', 'lint:no-pinmode', 'burn:led']);
  lance(['lint:no-pinmode', 'burn:led']);
  egal(obtenus.filter((x) => x === 'chercheur'), [], 'chercheur : un défaut corrigé, pas assez');
  lance(['burn:led']);
  lance([]);
  egal(obtenus.filter((x) => x === 'chercheur'), ['chercheur'], 'chercheur de panne : trois défauts différents corrigés');
}
{
  const { suivi, obtenus } = nouveau();
  suivi.lancement(info());
  for (let i = 0; i < 12; i++) suivi.pas();
  egal(obtenus, [], 'pas à pas : sans point d\'arrêt = rien');
  suivi.pointsArret(1);
  egal(obtenus, ['pas-a-pas'], 'pas à pas : un point d\'arrêt et dix pas');
  const b = nouveau();
  b.suivi.lancement(info());
  b.suivi.pointsArret(1);
  for (let i = 0; i < 9; i++) b.suivi.pas();
  egal(b.obtenus, [], 'pas à pas : neuf pas ne suffisent pas');
}
{
  const { suivi, obtenus } = nouveau();
  suivi.lancement(info());
  suivi.tick(snap({ tMs: 4000, instrument: true }));
  suivi.arret();
  egal(obtenus, [], 'instrument : mesurer ne suffit pas, il faut CHANGER le montage ensuite');
  suivi.modification();
  egal(obtenus, ['instrument'], 'à l\'instrument : mesure puis modification');
  const b = nouveau();
  b.suivi.lancement(info());
  b.suivi.tick(snap({ tMs: 4000 }));
  b.suivi.arret();
  b.suivi.modification();
  egal(b.obtenus, [], 'instrument : modifier sans avoir mesuré = rien');
  const c = nouveau();
  c.suivi.lancement(info());
  c.suivi.tick(snap({ tMs: 1000, instrument: true }));
  c.suivi.arret();
  c.suivi.modification();
  egal(c.obtenus, [], 'instrument : une mesure de 1 s ne compte pas');
}
{
  const { suivi, obtenus } = nouveau();
  for (let i = 0; i < 4; i++) { suivi.lancement(info()); suivi.arret(); }
  egal(obtenus, [], 'persévérant : quatre lancements = rien');
  suivi.lancement(info());
  egal(obtenus, ['perseverant'], 'persévérant : cinq lancements le même jour');
  const b = nouveau();
  for (let i = 0; i < 4; i++) { b.suivi.lancement(info({ jour: `2026-10-0${i + 1}` })); b.suivi.arret(); }
  b.suivi.lancement(info({ jour: '2026-10-05' }));
  egal(b.obtenus, [], 'persévérant : cinq jours de suite, un lancement par jour = rien');
  const c = nouveau();
  for (let i = 0; i < 5; i++) { c.suivi.lancement(info({ projet: `P${i}` })); c.suivi.arret(); }
  egal(c.obtenus, [], 'persévérant : cinq projets différents = rien');
}
{
  const a = nouveau();
  a.suivi.lancement(info({ composants: 11, fils: 8, filsPropres: 8 }));
  egal(a.obtenus, ['au-propre'], 'au propre : 11 composants, tous les fils propres');
  const b = nouveau();
  b.suivi.lancement(info({ composants: 11, fils: 8, filsPropres: 7 }));
  egal(b.obtenus, [], 'au propre : un fil sale = rien');
  const c = nouveau();
  c.suivi.lancement(info({ composants: 10, fils: 8, filsPropres: 8 }));
  egal(c.obtenus, [], 'au propre : dix composants = pas assez');
  const d = nouveau();
  d.suivi.lancement(info({ composants: 12, fils: 0, filsPropres: 0 }));
  egal(d.obtenus, [], 'au propre : aucun fil = rien');
  const e = nouveau();
  e.suivi.lancement(info({ etiquettes: 2 }));
  egal(e.obtenus, [], 'documenté : deux étiquettes = rien');
  e.suivi.lancement(info({ etiquettes: 3 }));
  egal(e.obtenus, ['documente'], 'documenté : trois étiquettes');
}

// ------------------------------------------------------------- A4. état conservé
{
  const brut = { obtenus: { ohm: 5, inconnu: 1, fumee: 'x' }, protocoles: { i2c: ['A', 3], spi: 'zzz', serie: [] }, assidu: { A: { jour: 'j', n: 2 }, B: 4 } };
  const e = S.etatValide(brut);
  egal(Object.keys(e.obtenus), ['ohm'], 'état relu : badge inconnu ou mal formé écarté');
  egal(e.protocoles, { i2c: ['A'], spi: [], serie: [] }, 'état relu : protocoles filtrés');
  egal(Object.keys(e.assidu), ['A'], 'état relu : lancements du jour filtrés');
  egal(S.etatValide(null), S.etatVierge(), 'état relu : rien = vierge');
  const obtenus = [];
  const suivi = new S.SuiviSucces(S.etatValide({ obtenus: { fumee: 1 } }), (d) => obtenus.push(d.id));
  suivi.lancement(info());
  suivi.tick(snap({ grilles: ['R1'] }));
  egal(obtenus, [], 'un badge déjà obtenu d\'une autre séance n\'est pas redécerné');
}

// ------------------------------------------------------------- B. câblage
const sim = readFileSync(join(ROOT, 'src/webview/sim.mts'), 'utf8');
const panel = readFileSync(join(ROOT, 'src/panel.ts'), 'utf8');
const ana = readFileSync(join(ROOT, 'src/webview/analyseur.mts'), 'utf8');
const anaPanel = readFileSync(join(ROOT, 'src/analyseur-panel.ts'), 'utf8');
const html = readFileSync(join(ROOT, 'src/webview-html.ts'), 'utf8');
const css = readFileSync(join(ROOT, 'media/styles.css'), 'utf8');
const editor = readFileSync(join(ROOT, 'src/webview/diagram/editor.mts'), 'utf8');
check(/from '\.\/succes\.mjs'/.test(sim), 'sim.mts importe les succès');
check(/succesLancement\(\);/.test(sim) && /function succesArret\(/.test(sim) && /function stopRun\(\): void \{\s+succesArret\(\);/.test(sim), 'lancement et arrêt rapportés');
check(/window\.setInterval\(succesTick, 500\)/.test(sim), 'relevé périodique');
check(/function observerFronts\(/.test(sim) && /\n {2}observerFronts\(\);/.test(sim), 'fronts comptés à chaque image');
check(/succes\.pas\(\);/.test(sim) && /succes\.pointsArret\(nbPointsArret\)/.test(sim), 'pas et points d\'arrêt rapportés');
check(/if \(dirty && !engine\) succes\.modification\(\)/.test(sim), 'modification hors simulation rapportée');
check(/case 'succesBus':/.test(sim), 'la page reçoit les trames décodées par l\'analyseur');
check(/type: 'analyseurBus', protocole/.test(ana) && /type: 'analyseurBus'/.test(anaPanel) && /m\.type === 'analyseurBus'/.test(panel), 'analyseur → hôte → page');
check(/succes: this\.context\.globalState\.get<unknown>\(SUCCES_KEY\)/.test(panel) && /case 'succesSave':/.test(panel), 'l\'hôte conserve les succès (globalState)');
check(/id="open-succes"/.test(html) && /id="succes-panel"/.test(html) && /id="succes-toast"/.test(html), 'bouton, panneau et annonce dans l\'interface');
check(/\.succes-toast\b/.test(css) && /\.succes-panel\b/.test(css), 'styles posés');
check(/proprete\(\): \{ total: number; propres: number \}/.test(editor), 'l\'éditeur mesure la netteté du câblage');
check(/if \(!succesCharge\) \{\s+succesCharge = true;/.test(sim), 'l\'état n\'est chargé qu\'une fois');

console.log(`verify:succes — ${ok} contrôles OK, ${fails.length} échec(s)`);
process.exit(fails.length ? 1 : 0);
