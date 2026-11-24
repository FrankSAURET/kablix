// Vue 3D du montage (piste 11, lot D6c).
//
// Trois étages :
//   A. pas de dérive : `modele3d.mts` et `montage3d.mts` sont des COPIES de
//      `model3d.ts` et `montage.ts` de kompix-core ; on les compare, lignes
//      `import` et `// Kablix :` exceptées (comme `verify:cinematique`) ;
//   B. sous Node, avec three.js : le robot à deux roues de Kompix Editor (VRAIS
//      paquets de `components/meca/`), enrichi d'un repère absent du schéma,
//      d'un rôle et d'une pièce au paquet inconnu → `vue3D` puis
//      `construireScene` : pièces posées, roues à ±73,5 mm, défauts répartis et
//      marqués en rouge, bulle de survol ;
//   C. Chrome headless (WebGL logiciel) piloté en CDP, VRAIE souris : la vue
//      s'ouvre, un glisser fait tourner la caméra, le survol d'une pièce ouvre
//      sa bulle, la molette rapproche la caméra ;
//   D. pilotage par la simulation (lot D6d) : sous Node, les rôles mènent les
//      pivots (moteur intégré en angle, servo absolu, butée, pièce inerte,
//      roulage du robot, retour à la pose du document) ; dans Chrome,
//      `simuler` déplace le châssis et `arreter` le ramène.
// A et B sont sautés (avec un avis) sans le dépôt de Kompix Editor ; C sans
// Chrome. Contre-épreuve : sans `src/webview/vue3d.mts`, B et C échouent.
//
// Usage : node scripts/verify-vue3d.mjs
import esbuild from 'esbuild';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-vue3d-'));
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0;
const fails = [];
const check = (cond, label, detail = '') => {
  if (cond) ok++;
  else {
    fails.push(label);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const editeur = [process.env.KOMPIX_EDITOR, join(ROOT, '../Kablix/kompix_editor'), join(ROOT, 'kompix_editor')]
  .filter(Boolean).find((d) => existsSync(join(d, 'packages/kompix-core/src/montage.ts')));

// ------------------------------------------------ A. pas de dérive
const corps = (txt) => txt.replace(/\r\n/g, '\n').split('\n')
  .filter((l) => !/^import\s/.test(l) && !/^\/\/ Kablix :/.test(l));
if (editeur) {
  console.log('A. copies comparées à kompix-core');
  for (const [orig, copie] of [['model3d.ts', 'modele3d.mts'], ['montage.ts', 'montage3d.mts']]) {
    const a = corps(readFileSync(join(editeur, 'packages/kompix-core/src', orig), 'utf8'));
    const b = corps(readFileSync(join(ROOT, 'src/webview/mecanique', copie), 'utf8'));
    const i = a.findIndex((l, k) => l !== b[k]);
    check(i < 0 && a.length === b.length, `${copie} identique à ${orig}`,
      i < 0 ? `longueurs ${a.length} / ${b.length}` : `ligne ${i + 1} : « ${a[i]} » / « ${b[i] ?? ''} »`);
  }
} else {
  console.log('A. ⚠ dépôt de Kompix Editor absent : comparaison sautée (KOMPIX_EDITOR pour l\'indiquer)');
}

// ------------------------------------------------ B. scène sous Node
let donnees;
if (editeur && existsSync(join(editeur, 'components/meca'))) {
  console.log('B. robot à deux roues, scène three.js sous Node');
  const sortie = join(tmp, 'vue3d.mjs');
  const p = (f) => JSON.stringify(join(ROOT, f).replace(/\\/g, '/'));
  await esbuild.build({
    stdin: {
      contents: [
        `export * from ${p('src/webview/mecanique/vue3d-donnees.mts')};`,
        `export * from ${p('src/webview/mecanique/scene3d.mts')};`,
        `export { lireSysteme } from ${p('src/systeme.ts')};`,
        `export { volumesDuSysteme } from ${p('src/systemeVolumes.ts')};`,
        `export * from ${p('src/webview/mecanique/pilotage.mts')};`,
        `export { montageCinematique } from ${p('src/webview/mecanique/volumes.mts')};`,
      ].join('\n'),
      resolveDir: ROOT, loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'esm', outfile: sortie, logLevel: 'error',
    external: ['lit', 'lit/*'],
  });
  const M = await import(pathToFileURL(sortie).href);

  const meca = join(editeur, 'components/meca');
  const paquets = new Map();
  for (const f of readdirSync(meca)) if (f.endsWith('.kompix')) paquets.set(f.replace(/\.kompix$/, ''), readFileSync(join(meca, f)));
  const md = readFileSync(join(editeur, 'docs/bibliotheque.md'), 'utf8').replace(/\r\n/g, '\n');
  const bloc = /## Exemple de `system\.json`[^\n]*\n[\s\S]*?```json\n([\s\S]*?)\n```/.exec(md);
  check(!!bloc, 'exemple du robot trouvé dans bibliotheque.md');
  const brut = JSON.parse(bloc[1]);
  // Enrichi : repère absent du schéma (mg), rôle (md), paquet inconnu (x).
  brut.pieces.find((q) => q.id === 'mg').ref = 'M1';
  brut.pieces.find((q) => q.id === 'md').nom = 'moteur:M2';
  brut.pieces.find((q) => q.id === 'rd').nom = 'roue:M2';
  brut.pieces.push({ id: 'x', source: { kind: 'kompix', type: 'introuvable' }, pose: { pos: { x: 0, y: 80, z: 10 }, rot: { x: 0, y: 0, z: 0 } } });
  const { systeme: doc, problemes } = M.lireSysteme(brut);
  check(doc && problemes.length === 0, 'robot enrichi lu sans problème', JSON.stringify(problemes));
  const stl = 'solid sol\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 100 0 0\nvertex 0 100 0\nendloop\nendfacet\nendsolid sol\n';
  const volumes = await M.volumesDuSysteme(doc, (t) => paquets.get(t), [{ path: 'sol.glb', data: new Uint8Array([1, 2, 3, 4]) }]);
  donnees = { doc, volumes, problemes: [{ cle: 'ref-absente', cible: 'M1' }, { cle: 'version-future', cible: '9' }] };

  const vue = M.vue3D(donnees);
  const par = Object.fromEntries(vue.pieces.map((q) => [q.id, q]));
  check(vue.pieces.length === 7, '7 pièces dans la vue', vue.pieces.length);
  check(near(par.rg.matrice.t.x, -73.5, 1e-6) && near(par.rd.matrice.t.x, 73.5, 1e-6), 'roues posées à ±73,5 mm',
    `${par.rg.matrice.t.x} / ${par.rd.matrice.t.x}`);
  check(par.mg.defauts.includes('ref-absente'), 'repère absent : défaut sur mg', JSON.stringify(par.mg.defauts));
  check(par.x.defauts.includes('paquet-absent'), 'paquet inconnu : défaut sur x', JSON.stringify(par.x.defauts));
  check(par.rg.defauts.length === 0 && par.chassis.defauts.length === 0, 'roue et châssis sains');
  check(vue.generaux.includes('version-future'), 'problème sans pièce : rangé à part', JSON.stringify(vue.generaux));
  check(par.md.role?.nom === 'moteur' && par.md.repere === 'M2', 'rôle et repère lus dans le nom', JSON.stringify(par.md.role));
  const textes = { role: 'rôle', repere: 'repère', mecanique: 'pièce mécanique', defauts: { 'ref-absente': 'Repère absent' } };
  const bm = M.bulleDePiece(par.md, textes);
  check(bm.join('|') === 'moteur:M2|rôle : moteur|repère : M2', 'bulle d\'une pièce à rôle', bm.join('|'));
  const bg = M.bulleDePiece(par.mg, textes);
  check(bg.join('|') === 'mg|repère : M1|⚠ Repère absent', 'bulle d\'une pièce en défaut', bg.join('|'));
  check(M.bulleDePiece(par.rg, textes).join('|') === 'rg|pièce mécanique', 'bulle d\'une pièce mécanique');

  const sc = await M.construireScene(M.vue3D(donnees));
  check(sc.pieces.size === 7, 'scène : un groupe par pièce', sc.pieces.size);
  const enDefaut = [...sc.enDefaut].sort().join(',');
  check(enDefaut === 'mg,sol,x', 'scène : mg, sol (maillage illisible) et x marqués', enDefaut);
  check(!!sc.racine.getObjectByName('defaut:mg') && !sc.racine.getObjectByName('defaut:rg'), 'scène : cadre rouge sur la pièce en défaut seulement');
  check(sc.objets.length > 0 && sc.objets.every((o) => typeof o.userData.piece === 'string'), 'scène : objets touchables portent leur pièce', sc.objets.length);
  sc.racine.updateMatrixWorld(true);
  const xRoue = new (sc.racine.position.constructor)().setFromMatrixPosition(sc.pieces.get('rg').matrixWorld).x;
  check(near(xRoue, -73.5, 1e-6), 'scène : groupe de la roue gauche à x = −73,5', xRoue);
  // Sol en STL lisible : plus de défaut.
  const v2 = await M.volumesDuSysteme(doc, (t) => paquets.get(t), [{ path: 'sol.glb', data: new TextEncoder().encode(stl) }]);
  const brut2 = structuredClone(brut);
  brut2.pieces.find((q) => q.id === 'sol').source.path = 'sol.stl';
  const doc2 = M.lireSysteme(brut2).systeme;
  const v3 = await M.volumesDuSysteme(doc2, (t) => paquets.get(t), [{ path: 'sol.stl', data: new TextEncoder().encode(stl) }]);
  const sc2 = await M.construireScene(M.vue3D({ doc: doc2, volumes: v3, problemes: [] }));
  check(!sc2.enDefaut.has('sol'), 'sol en STL lisible : pas de défaut', [...sc2.enDefaut].join(','));
  void v2;
  sc.dispose();
  sc2.dispose();

  // ---------------------------------------------- D. pilotage sous Node
  console.log('D. pilotage par la simulation (Node)');
  const INERTE = new Set(['role-inconnu', 'role-sans-repere', 'role-doublon', 'role-type', 'role-repere-absent', 'ref-absente']);
  const pilote = (dn) => {
    const v = M.vue3D(dn);
    const { tree } = M.montageCinematique(dn.doc, dn.volumes);
    return new M.Pilotage(tree, v.pieces.map((q) => ({ id: q.id, role: q.role, repere: q.repere, inerte: q.defauts.some((c) => INERTE.has(c)) })));
  };
  // Robot : chaque roue suit son moteur.
  const br = structuredClone(brut);
  br.pieces = br.pieces.filter((q) => q.id !== 'x');
  for (const [id, nom] of [['mg', 'moteur:M1'], ['md', 'moteur:M2'], ['rg', 'roue:M1'], ['rd', 'roue:M2']]) {
    const q = br.pieces.find((z) => z.id === id);
    q.nom = nom;
    delete q.ref;
  }
  const dr = M.lireSysteme(br).systeme;
  const vr = await M.volumesDuSysteme(dr, (t) => paquets.get(t), [{ path: 'sol.glb', data: new TextEncoder().encode(stl) }]);
  const pr = pilote({ doc: dr, volumes: vr, problemes: [] });
  const cmds = pr.commandes.map((c) => `${c.liaison}<${c.repere}`).sort().join(',');
  check(cmds === 'Pd<M2,Pg<M1', 'robot : chaque roue menée par son moteur', cmds);
  // 1 s au régime nominal, en 4 images : 200 tr/min → 1200°, 32,5 × 2π × 10/3 mm.
  let im;
  for (let k = 0; k < 4; k++) im = pr.pas({ servos: {}, moteurs: { M1: 1, M2: 1 } }, 0.25);
  check(near(im.solution.values.Pg, 1200, 1e-6) && near(im.solution.values.Pd, 1200, 1e-6), 'moteur : vitesse intégrée en angle (1200° en 1 s)', JSON.stringify(im.solution.values));
  const c1 = im.solution.poses.chassis.pos;
  const att = 32.5 * 2 * Math.PI * (200 / 60);
  check(near(Math.hypot(c1.x, c1.y), att, 1e-6) && near(im.solution.poses.chassis.rot.z, 0, 1e-9), 'deux moteurs égaux : ligne droite de 680,7 mm', `${c1.x.toFixed(3)}, ${c1.y.toFixed(3)} pour ${att.toFixed(3)}`);
  check(near(im.solution.poses.chassis.pos.z, 43.75, 1e-9), 'le châssis garde sa hauteur', im.solution.poses.chassis.pos.z);
  check(near(im.solution.poses.rg.pos.y - c1.y, -45, 1e-6), 'la roue suit le châssis', im.solution.poses.rg.pos.y);
  const r0 = pr.remettre();
  check(near(r0.solution.poses.chassis.pos.x, 0) && near(r0.solution.poses.chassis.pos.y, 0) && near(r0.solution.values.Pg, 0), 'arrêt : retour à la pose du document');
  im = pr.pas({ servos: {}, moteurs: { M1: 1, M2: 0 } }, 0.25);
  const lacet = im.solution.poses.chassis.rot.z;
  const lacetAtt = (32.5 * (300 * Math.PI / 180) / 147) * 180 / Math.PI;
  check(near(Math.abs(lacet), lacetAtt, 1e-6), 'un seul moteur : le robot tourne (voie 147 mm)', `${lacet} pour ±${lacetAtt}`);
  pr.remettre();
  im = pr.pas({ servos: {}, moteurs: { M1: 1 } }, 0.25);
  check(im.sansSource.join() === 'Pd', 'moteur absent de la simulation : liaison signalée', JSON.stringify(im.sansSource));
  check(pr.pas({ servos: {}, moteurs: { M1: 1, M2: 1 } }, 0).solution.values.Pg === im.solution.values.Pg, 'temps nul : rien ne tourne');

  // Servo + aimant : pivot borné, servo absolu, pièce inerte.
  const servoDoc = (nomServo, max) => M.lireSysteme({
    format: 'kablix-system', version: 1,
    pieces: [
      { id: 's', nom: nomServo, source: { kind: 'kompix', type: 'servo' }, pose: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } } },
      { id: 'a', source: { kind: 'kompix', type: 'aimant' }, pose: { pos: { x: 20, y: 0, z: 30.7 }, rot: { x: 0, y: 0, z: 0 } } },
    ],
    liaisons: [{ id: 'P', type: 'pivot', a: { piece: 'a', axe: 'pose' }, b: { piece: 's', axe: 'horn' }, params: { min: 0, max } }],
  }).systeme;
  const ds = servoDoc('servo:Act1', 120);
  const vs = await M.volumesDuSysteme(ds, (t) => paquets.get(t), []);
  const ps = pilote({ doc: ds, volumes: vs, problemes: [] });
  check(ps.commandes.length === 1 && ps.commandes[0].liaison === 'P' && ps.commandes[0].repere === 'Act1', 'servo : le pivot dont il est le parent le suit', JSON.stringify(ps.commandes));
  im = ps.pas({ servos: { Act1: 90 }, moteurs: {} }, 0.02);
  const pa = im.solution.poses.a.pos;
  check(near(pa.x, 0, 1e-6) && near(pa.y, 20, 1e-6) && near(pa.z, 30.7, 1e-6), 'servo à 90° : l\'aimant tourne autour du palonnier', JSON.stringify(pa));
  check(Object.keys(im.saturees).length === 0, 'servo à 90° : pas de butée');
  im = ps.pas({ servos: { Act1: 180 }, moteurs: {} }, 0.02);
  check(im.saturees.P === 'max' && near(im.solution.values.P, 120), 'servo à 180°, borne 120° : butée signalée', JSON.stringify(im.saturees));
  const pi = pilote({ doc: ds, volumes: vs, problemes: [{ cle: 'role-type', cible: 's' }] });
  check(pi.commandes.length === 0, 'pièce en défaut de rôle : inerte, rien n\'est piloté', JSON.stringify(pi.commandes));
} else {
  console.log('B. ⚠ dépôt de Kompix Editor absent : scène sautée');
}

// ------------------------------------------------ C. Chrome, vraie souris
const chrome = [process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((c) => c && existsSync(c));
if (!donnees) {
  console.log('C. ⚠ pas de données (étage B sauté) : Chrome sauté');
} else if (!chrome) {
  console.log('C. ⚠ Chrome introuvable : étage sauté');
} else {
  console.log('C. Chrome headless, gestes réels');
  const CACHE = join(ROOT, 'node_modules', '.cache-vue3d');
  mkdirSync(CACHE, { recursive: true });
  const b = await esbuild.build({
    entryPoints: [join(ROOT, 'src/webview/vue3d.mts')], bundle: true, format: 'iife', write: false,
    platform: 'browser', logLevel: 'error',
  });
  const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
  const textes = { role: 'rôle', repere: 'repère', mecanique: 'pièce mécanique', sansWebgl: 'sans WebGL', butee: 'En butée', sansSource: 'Non piloté', defauts: { 'ref-absente': 'Repère absent' } };
  writeFileSync(join(CACHE, 'p.html'),
    `<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
    `<div id="vue3d" class="vue3d" style="left:0;top:0;width:800px;height:600px"><div class="vue3d__head">3D</div>` +
    `<div id="vue3d-scene" class="vue3d__scene"></div></div>` +
    `<script>${b.outputFiles[0].text}</script>` +
    `<script>window.donnees = ${JSON.stringify(donnees).replace(/</g, '\\u003c')};` +
    `KablixVue3D.ouvrir(document.getElementById('vue3d-scene'), window.donnees, ${JSON.stringify(textes)})` +
    `.then((v) => { window.vue = v; window.pret = true; }, (e) => { window.erreur = String(e && e.stack || e); });</script></body>`);

  const profil = join(CACHE, 'profil');
  rmSync(profil, { recursive: true, force: true });
  // Port 0 : Chrome choisit un port libre et l'écrit dans DevToolsActivePort
  // (les bancs tournent en parallèle, un port fixe se disputerait).
  const proc = spawn(chrome, ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--remote-debugging-port=0', `--user-data-dir=${profil}`, '--window-size=900,700',
    `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { stdio: 'ignore' });
  let ws = null;
  try {
    let port = 0;
    for (let i = 0; i < 60 && !port; i++) {
      try { port = Number(readFileSync(join(profil, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch { await attendre(250); }
    }
    if (!port) throw new Error('Chrome n\'a pas ouvert de port de mise au point');
    let liste = null;
    for (let i = 0; i < 40 && !liste; i++) {
      try { liste = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await attendre(250); }
    }
    const cible = liste.find((c) => c.type === 'page');
    ws = new WebSocket(cible.webSocketDebuggerUrl);
    let id = 0;
    const attentes = new Map();
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && attentes.has(m.id)) { attentes.get(m.id)(m); attentes.delete(m.id); }
    });
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    const cdp = (method, params = {}) => new Promise((res) => {
      const n = ++id;
      attentes.set(n, res);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
    const ev = async (expr) => {
      const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
      return r.result?.result?.value;
    };
    for (let i = 0; i < 80 && !(await ev('window.pret === true || !!window.erreur')); i++) await attendre(250);
    const err = await ev('window.erreur || ""');
    check(!err && (await ev('window.pret === true')), 'la vue s\'ouvre', err || 'délai dépassé');
    if (await ev('window.pret === true')) {
      check(await ev('!!document.querySelector(".vue3d__canvas")'), 'un canvas WebGL est posé (pas le message sans WebGL)');
      const etat = async () => JSON.parse(await ev('JSON.stringify(window.vue.etat())'));
      const e0 = await etat();
      check(e0.pieces === 7 && e0.enDefaut.sort().join(',') === 'mg,sol,x', 'état : 7 pièces, 3 en défaut', JSON.stringify(e0));
      const bouge = async (x, y, buttons = 0) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons, button: buttons ? 'left' : 'none' });

      // Survol : chercher un point de la roue gauche, puis y mener la VRAIE souris.
      // Point du MILIEU de la zone de mg (le premier trouvé serait un bord).
      const pt = JSON.parse(await ev(`(() => { const r = document.querySelector('.vue3d__canvas').getBoundingClientRect();
        const pts = [];
        for (let y = Math.ceil(r.top) + 5; y < r.bottom; y += 4) for (let x = Math.ceil(r.left) + 5; x < r.right; x += 4)
          if (window.vue.pieceSous(x, y) === 'mg') pts.push({ x, y });
        return pts.length ? JSON.stringify(pts[Math.floor(pts.length / 2)]) : 'null'; })()`));
      check(!!pt, 'la pièce mg est visible à l\'écran');
      if (pt) {
        await bouge(pt.x - 3, pt.y - 3);
        await bouge(pt.x, pt.y);
        await attendre(150);
        const bulle = JSON.parse(await ev(`(() => { const b = document.querySelector('.vue3d__bulle');
          return JSON.stringify({ visible: !b.hidden && getComputedStyle(b).display !== 'none', piece: b.dataset.piece, texte: b.innerText }); })()`));
        check(bulle.visible && bulle.piece === 'mg', 'survol réel : la bulle de mg s\'ouvre', JSON.stringify(bulle));
        check(/Repère absent/.test(bulle.texte), 'la bulle montre le défaut', bulle.texte);
        await bouge(5, 300); // hors de toute pièce
        await bouge(3, 300);
        await attendre(100);
        check(await ev('document.querySelector(".vue3d__bulle").hidden'), 'hors des pièces : la bulle se ferme');
      }

      // Orbite : glisser réel du bouton gauche.
      await bouge(400, 350);
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 400, y: 350, button: 'left', buttons: 1, clickCount: 1 });
      for (let k = 1; k <= 10; k++) await bouge(400 + k * 15, 350, 1);
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 550, y: 350, button: 'left', buttons: 0, clickCount: 1 });
      await attendre(150);
      const e1 = await etat();
      const d = Math.hypot(e1.camera[0] - e0.camera[0], e1.camera[1] - e0.camera[1], e1.camera[2] - e0.camera[2]);
      const r0 = Math.hypot(...e0.camera.map((c, i) => c - e0.cible[i]));
      const r1 = Math.hypot(...e1.camera.map((c, i) => c - e1.cible[i]));
      check(d > r0 * 0.1, 'glisser réel : la caméra tourne', `déplacement ${d.toFixed(1)} pour un recul de ${r0.toFixed(1)}`);
      check(near(r0, r1, r0 * 1e-3) && near(e0.cible[0], e1.cible[0]) && near(e0.cible[1], e1.cible[1]), 'orbite : même recul, même cible', `${r0} / ${r1}`);
      check(near(Math.atan2(e1.camera[2] - e1.cible[2], 1), Math.atan2(e0.camera[2] - e0.cible[2], 1), 1e-3), 'glisser horizontal : la hauteur de la caméra ne change pas (Z en haut)');

      // Molette : rapproche.
      await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 400, y: 350, deltaX: 0, deltaY: -300 });
      await attendre(150);
      const e2 = await etat();
      const r2 = Math.hypot(...e2.camera.map((c, i) => c - e2.cible[i]));
      check(r2 < r1 * 0.95, 'molette réelle : la caméra se rapproche', `${r1.toFixed(1)} → ${r2.toFixed(1)}`);

      // D. pilotage dans Chrome : la roue droite suit M2, le robot tourne.
      const p0 = JSON.parse(await ev('JSON.stringify(window.vue.pose("chassis"))'));
      for (let k = 0; k < 5; k++) await ev('window.vue.simuler({ servos: {}, moteurs: { M2: 1 } }, 0.1)');
      const p1 = JSON.parse(await ev('JSON.stringify(window.vue.pose("chassis"))'));
      check(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 10, 'simuler : le châssis roule dans la vue', `${p0} → ${p1}`);
      await ev('window.vue.simuler({ servos: {}, moteurs: {} }, 0.1)');
      const lg = JSON.parse(await ev('JSON.stringify(window.vue.lignesEtat())'));
      check(lg.some((l) => /Pd/.test(l)) && await ev('!document.querySelector(".vue3d__etat").hidden'), 'moteur absent : l\'encart d\'état le dit', JSON.stringify(lg));
      await ev('window.vue.arreter()');
      const p2 = JSON.parse(await ev('JSON.stringify(window.vue.pose("chassis"))'));
      check(near(p2[0], p0[0]) && near(p2[1], p0[1]) && near(p2[2], p0[2]), 'arreter : retour à la pose du document', `${p2}`);
      check(await ev('document.querySelector(".vue3d__etat").hidden'), 'arreter : encart d\'état masqué');

      await ev('window.vue.fermer()');
      check(await ev('document.getElementById("vue3d-scene").childElementCount === 0'), 'fermer vide la scène');
    }
  } catch (e) {
    check(false, 'étage C sans exception', (e && e.stack) || String(e));
  } finally {
    try { ws?.close(); } catch { /* déjà fermé */ }
    proc.kill();
  }
}

if (ok + fails.length === 0) check(false, 'au moins un contrôle joué');
console.log(fails.length ? `vue3d : ${fails.length} échec(s) sur ${ok + fails.length}.` : `vue3d : ${ok} contrôles OK.`);
process.exit(fails.length ? 1 : 0);
