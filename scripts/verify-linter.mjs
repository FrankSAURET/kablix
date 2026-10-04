// Banc du linter électronique (feuille de route n°3) : relire le code face au
// schéma. Deux parties :
//   A. le module pur `linter.mts` exécuté en Node, sur des schémas fabriqués :
//      chaque contrôle sort quand il est CERTAIN, et se TAIT au moindre doute ;
//   B. le câblage (hôte → webview → cadre rouge, réglage).
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import JSZip from 'jszip';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-linter');
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

const out = join(CACHE, 'linter.mjs');
await esbuild({
  entryPoints: [join(ROOT, 'src/webview/linter.mts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const { lint, piegesExecution } = await import(pathToFileURL(out).href + `?t=${Date.now()}`);

/** Schéma : une carte + des fils {pin → type de pièce au bout}. */
const schema = (carte, fils = {}, extra = []) => {
  const parts = [{ id: 'B', type: carte, x: 0, y: 0 }, ...extra];
  const wires = [];
  let k = 0;
  for (const [pin, type] of Object.entries(fils)) {
    const id = `P${k++}`;
    parts.push({ id, type, x: 0, y: 0 });
    wires.push({ id: `w${k}`, a: { partId: 'B', pin }, b: { partId: id, pin: 'A' } });
  }
  return { parts, wires };
};
const regles = (src, lang, d) => lint(src, lang, d).map((f) => `${f.rule}:${f.pin}`).sort();
const egal = (a, b, label) => check(JSON.stringify(a) === JSON.stringify(b), `${label} (obtenu ${JSON.stringify(a)})`);

// ------------------------------------------------------------- A1. PWM
const D2 = (...pins) => schema('uno', Object.fromEntries(pins.map((p) => [p, 'led'])));
egal(regles('void setup(){pinMode(4,OUTPUT);} void loop(){analogWrite(4,128);}', 'cpp', D2('4')), ['pwm:4'], 'pwm : analogWrite sur 4 (Uno)');
egal(regles('void setup(){pinMode(9,OUTPUT);} void loop(){analogWrite(9,128);}', 'cpp', D2('9')), [], 'pwm : 9 est PWM, rien');
egal(regles('void setup(){pinMode(12,OUTPUT);} void loop(){analogWrite(12,1);}', 'cpp', schema('mega', { 12: 'led' })), [], 'pwm : 12 est PWM sur le Mega');
egal(regles('void setup(){pinMode(22,OUTPUT);} void loop(){analogWrite(22,1);}', 'cpp', schema('mega', { 22: 'led' })), ['pwm:22'], 'pwm : 22 ne l\'est pas sur le Mega');
egal(regles('#define LED 4\nvoid setup(){pinMode(LED,OUTPUT);} void loop(){analogWrite(LED,1);}', 'cpp', D2('4')), ['pwm:4'], 'pwm : broche sous un #define');
egal(regles('int led = 4;\nvoid setup(){pinMode(led,OUTPUT);} void loop(){analogWrite(led,1);}', 'cpp', D2('4')), ['pwm:4'], 'pwm : variable globale jamais réaffectée');
egal(regles('int led = 4;\nvoid setup(){pinMode(led,OUTPUT);} void loop(){led = 9; analogWrite(led,1);}', 'cpp', D2('4')), [], 'pwm : variable réaffectée = doute, rien');
egal(regles('void setup(){} void loop(){ // analogWrite(4,1)\n /* analogWrite(4,1) */ Serial.println("analogWrite(4,1)"); }', 'cpp', D2('4')), [], 'pwm : commentaires et chaînes ignorés');
egal(regles('void setup(){pinMode(A0,OUTPUT);} void loop(){analogWrite(14,1);}', 'cpp', D2('A0')), ['pwm:A0'], 'pwm : A0 = 14 (alias numérique)');

// ------------------------------------------------------------- A2. pinMode oublié
const lu = (setup) => `void setup(){${setup}} void loop(){ if (digitalRead(2)) {} }`;
egal(regles(lu('pinMode(3,OUTPUT);'), 'cpp', D2('2', '3')), ['no-pinmode:2'], 'pinMode : lecture sans pinMode');
egal(regles(lu('pinMode(2,INPUT);'), 'cpp', D2('2')), [], 'pinMode : déclaré, rien');
egal(regles(lu('pinMode(2,INPUT_PULLUP);'), 'cpp', D2('2')), [], 'pinMode : INPUT_PULLUP, rien');
egal(regles('void loop(){ if (digitalRead(2)) {} }', 'cpp', D2('2')), [], 'pinMode : pas de setup() lisible, rien');
egal(regles(lu('for(int i=0;i<8;i++) pinMode(i,INPUT);'), 'cpp', D2('2')), [], 'pinMode : pinMode dans une boucle = doute, rien');

// ------------------------------------------------------------- A3. lue sans rien de branché
const src3 = 'void setup(){pinMode(2,INPUT);} void loop(){ digitalRead(2); }';
egal(regles(src3, 'cpp', schema('uno')), ['read-unwired:2'], 'lue : rien de branché');
egal(regles(src3, 'cpp', D2('2')), [], 'lue : câblée, rien');
egal(regles('void setup(){pinMode(2,INPUT_PULLUP);} void loop(){ digitalRead(2); }', 'cpp', schema('uno')), [], 'lue : rappel interne, rien');
egal(regles(src3, 'cpp', schema('uno', {}, [{ id: 'S', type: 'grove-shield-uno', x: 0, y: 0 }])), [], 'lue : shield présent = broches sans fil, rien');
egal(regles('void setup(){} void loop(){ analogRead(A0); }', 'cpp', schema('uno')), ['read-unwired:A0'], 'lue : analogRead A0 non câblée');
egal(regles('void setup(){attachInterrupt(digitalPinToInterrupt(2),f,RISING);} void f(){} void loop(){}', 'cpp', schema('uno')), ['read-unwired:2'], 'lue : attachInterrupt sur broche libre');

// ------------------------------------------------------------- A4. pilotée sans rien / câblée sans code
egal(regles('void setup(){pinMode(8,OUTPUT);} void loop(){digitalWrite(8,HIGH);}', 'cpp', schema('uno')), ['write-unwired:8'], 'pilotée : rien de branché');
egal(regles('void setup(){pinMode(13,OUTPUT);} void loop(){digitalWrite(13,HIGH);}', 'cpp', schema('uno')), [], 'pilotée : D13 = LED de la carte, rien');
egal(regles('void setup(){pinMode(8,OUTPUT);} void loop(){digitalWrite(8,HIGH);}', 'cpp', D2('8', '7')), ['wired-unused:7'], 'inverse : LED sur D7, le code ne la touche pas');
const inv = lint('void setup(){pinMode(8,OUTPUT);} void loop(){digitalWrite(8,HIGH);}', 'cpp', D2('8', '7'));
check(inv[0]?.partId === 'P0', 'inverse : le cadre va sur la LED câblée, pas sur la carte');
egal(regles('#include <Servo.h>\nvoid setup(){pinMode(8,OUTPUT);} void loop(){digitalWrite(8,HIGH);}', 'cpp', D2('8', '7')), [], 'inverse : bibliothèque tierce = doute, rien');
egal(regles('void setup(){pinMode(8,OUTPUT);Serial.begin(9600);} void loop(){digitalWrite(8,HIGH); digitalWrite(i,LOW);}', 'cpp', D2('8', '7')), [], 'inverse : Serial / broche calculée = doute, rien');
egal(regles('void setup(){pinMode(8,OUTPUT);} void loop(){digitalWrite(8,HIGH);}', 'cpp', schema('uno', { 8: 'led', 7: 'breadboard' })), [], 'inverse : fil vers une platine = on ne sait pas, rien');
egal(regles('void setup(){pinMode(8,OUTPUT);} void loop(){digitalWrite(8,HIGH);}', 'cpp', D2('8')), [], 'code et schéma d\'accord : aucun constat');

// ------------------------------------------------------------- A5. MicroPython
const py = (s) => `from machine import Pin\n${s}\n`;
egal(regles(py('b = Pin(15, Pin.IN)\nb.value()'), 'py', schema('pico')), ['read-unwired:GP15'], 'py : Pin.IN non câblée');
egal(regles(py('b = Pin(15, Pin.IN)\nb.value()'), 'py', schema('pico', { GP15: 'pushbutton' })), [], 'py : câblée, rien');
egal(regles(py('b = Pin(15, Pin.IN, Pin.PULL_UP)'), 'py', schema('pico')), [], 'py : PULL_UP, rien');
egal(regles(py('l = Pin(16, Pin.OUT)\nl.on()'), 'py', schema('pico')), ['write-unwired:GP16'], 'py : Pin.OUT non câblée');
egal(regles(py('l = Pin(25, Pin.OUT)'), 'py', schema('pico')), [], 'py : GP25 = LED de la carte, rien');
egal(regles(py('BTN = 14\nb = Pin(BTN, Pin.IN)'), 'py', schema('pico')), ['read-unwired:GP14'], 'py : constante résolue');
egal(regles('from machine import ADC\na = ADC(26)\na.read_u16()', 'py', schema('pico')), ['read-unwired:GP26'], 'py : ADC(26) non câblée');
egal(regles('from machine import ADC, Pin\na = ADC(Pin(26))', 'py', schema('pico')), ['read-unwired:GP26'], 'py : ADC(Pin(26)) vu une seule fois');
egal(regles(py('for i in range(4):\n    Pin(i, Pin.OUT)'), 'py', schema('pico', { GP5: 'led' })), [], 'py : numéro calculé = doute, rien');
egal(regles(py('l = Pin(16, Pin.OUT)'), 'py', schema('pico', { GP16: 'led', GP17: 'led' })), ['wired-unused:GP17'], 'py : inverse, GP17 câblée jamais utilisée');
egal(regles('import dht\nfrom machine import Pin\nl = Pin(16, Pin.OUT)', 'py', schema('pico', { GP16: 'led', GP17: 'led' })), [], 'py : module tiers = doute, rien');
egal(regles('void setup(){} void loop(){analogWrite(4,1);}', 'cpp', schema('pico')), [], 'langue contraire à la carte : rien');
egal(regles('', 'cpp', schema('uno')), [], 'source vide : rien');

egal(regles('from machine import Pin\nl = Pin(14, Pin.OUT)', 'py', schema('pico', {}, [{ id: 'SD', type: 'sonde-logique', x: 0, y: 0, attrs: { accroche: 'B/GP14' } }])), [], 'pince de sonde posée sur la broche (sans fil) : rien');


// ------------------------------------------------------------- A7. pièges à l'exécution (n°4)
const boucles = (src, lang, d) => piegesExecution(src, lang, d).boucles.map((b) => `${b.pin}:${b.niveau ? 'H' : 'L'}:${b.line}`);
const B2 = D2('2');
egal(boucles('void loop(){\n while (digitalRead(2) == LOW);\n}', 'cpp', B2), ['2:L:2'], 'boucle : while (digitalRead(2) == LOW);');
egal(boucles('void loop(){ while (digitalRead(2) == HIGH) {} }', 'cpp', B2), ['2:H:1'], 'boucle : corps {} vide, niveau haut');
egal(boucles('void loop(){ while (!digitalRead(2)); }', 'cpp', B2), ['2:L:1'], 'boucle : while (!digitalRead)');
egal(boucles('void loop(){ while (digitalRead(2) != LOW); }', 'cpp', B2), ['2:H:1'], 'boucle : != LOW');
egal(boucles('#define BTN 2\nvoid loop(){ while (digitalRead(BTN) == 0); }', 'cpp', B2), ['2:L:2'], 'boucle : broche sous un #define');
egal(boucles('void loop(){ while (digitalRead(2) == LOW) { n++; } }', 'cpp', B2), [], 'boucle : corps non vide = rien');
egal(boucles('void loop(){ while (digitalRead(2) == LOW) delay(10); }', 'cpp', B2), [], 'boucle : delay dans le corps = rien');
egal(boucles('void loop(){ while (digitalRead(p) == LOW); }', 'cpp', B2), [], 'boucle : broche calculée = doute, rien');
egal(boucles('void loop(){ // while (digitalRead(2) == LOW);\n}', 'cpp', B2), [], 'boucle : en commentaire = rien');
egal(boucles(py('b = Pin(15, Pin.IN)\nwhile b.value() == 0: pass'), 'py', schema('pico', { GP15: 'pushbutton' })), ['GP15:L:3'], 'py : while b.value() == 0: pass');
egal(boucles(py('b = Pin(15, Pin.IN)\nwhile not b.value():\n    pass'), 'py', schema('pico', { GP15: 'pushbutton' })), ['GP15:L:3'], 'py : while not b.value(): pass (ligne suivante)');
egal(boucles(py('b = Pin(15, Pin.IN)\nwhile b.value() == 0:\n    print(1)'), 'py', schema('pico', { GP15: 'pushbutton' })), [], 'py : corps non vide = rien');
egal(boucles(py('b = Pin(i, Pin.IN)\nwhile b.value(): pass'), 'py', schema('pico', {})), [], 'py : variable de broche inconnue = rien');
egal(piegesExecution('void setup(){pinMode(8,OUTPUT);} void loop(){ while (digitalRead(2)==LOW); digitalWrite(8,HIGH);}', 'cpp', D2('2', '8')).pilotees, ['8', '8'], 'pilotées : les broches que le code écrit');
egal(piegesExecution('void loop(){ digitalWrite(i,1); while (digitalRead(2)==LOW); }', 'cpp', B2).boucles, [], 'broche pilotée calculée = doute, rien');
egal(lint('void setup(){pinMode(2,INPUT);} void loop(){ digitalRead(2); }', 'cpp', schema('uno'))[0]?.lecture, 'digital', 'broche en l\'air : lecture numérique');
egal(lint('void loop(){ analogRead(A0); }', 'cpp', schema('uno'))[0]?.lecture, 'analog', 'broche en l\'air : lecture analogique');

// ------------------------------------------------------------- A6. zéro faux positif sur testkablix
// Les projets de testkablix tournent : leur code est correct. Le linter ne doit
// rien y trouver, sauf la seule vraie trouvaille connue (mesure-pico : le
// transistor est câblé sur GP13, que le code n'utilise pas).
{
  const marcher = (d) => readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? marcher(p) : [p];
  });
  const constats = [];
  let projets = 0;
  for (const f of marcher(join(ROOT, 'testkablix')).filter((f) => f.endsWith('.projix'))) {
    const zip = await JSZip.loadAsync(readFileSync(f));
    const diag = zip.file('diagram.json');
    const man = zip.file('kablix.json');
    if (!diag || !man) continue;
    const code = JSON.parse(await man.async('string')).codeFile;
    const chemin = code ? join(dirname(f), code) : '';
    if (!code || !existsSync(chemin)) continue;
    projets++;
    for (const x of lint(readFileSync(chemin, 'utf8'), code.endsWith('.py') ? 'py' : 'cpp', JSON.parse(await diag.async('string')))) {
      constats.push(`${f.split(/[\\/]/).pop()}:${x.rule}:${x.pin}`);
    }
  }
  check(projets > 50, `testkablix : ${projets} projets relus`);
  egal(constats, ['mesure-pico.projix:wired-unused:GP13'], 'testkablix : aucun faux positif');
}

// ------------------------------------------------------------- B. câblage
const sim = readFileSync(join(ROOT, 'src/webview/sim.mts'), 'utf8');
const panel = readFileSync(join(ROOT, 'src/panel.ts'), 'utf8');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
check(/from '\.\/linter\.mjs'/.test(sim), 'sim.mts importe le linter');
check(/function runLinter\(/.test(sim) && /\n {2}runLinter\(\);/.test(sim), 'startRun appelle runLinter');
check(/if \(!lintEnabled \|\| !lintSource\) return;/.test(sim), 'le réglage coupe le linter');
check(/editor\.setFaulty\(id, true/.test(sim), 'cadre rouge posé sur la pièce');
check(/case 'lintSource':/.test(sim), 'webview reçoit lintSource');
check(/type: 'lintSource',\s+text: \['\.ino'/.test(panel), "l'hôte envoie le code avant le lancement");
check(/lintCode: cfg\.get<boolean>\('lintCode', true\)/.test(panel), 'le réglage descend vers la webview, actif par défaut');
check(pkg.contributes.configuration.properties['kablix.lintCode']?.default === true, 'kablix.lintCode déclaré, true par défaut');

check(/function armerPieges\(/.test(sim) && /armerPieges\(constats\);/.test(sim), 'runLinter arme les pièges à code');
check(/engine\.setInput\(c\.pin, Math\.random\(\) < 0\.5\)/.test(sim) && /engine\.setAnalog\(c\.pin, Math\.random\(\)\)/.test(sim), 'la broche en l\'air oscille');
check(/maintenant - depuisMs < 3000/.test(sim), 'la boucle bloquante attend 3 s simulées');
check(/function stopPieges\(/.test(sim) && /function stopRun\(\): void \{[^}]{0,120}\bstopPieges\(\);/.test(sim), 'les minuteries sont coupées à l\'arrêt');

{
  const f = lint('void setup(){pinMode(14,OUTPUT);} void loop(){digitalWrite(14,HIGH);}', 'cpp', schema('uno'));
  egal(f.map((x) => x.args[1]), ['14 (A0)'], 'le message nomme la broche comme le code : « 14 (A0) »');
  egal(f.map((x) => x.carteId), ['B'], 'le constat porte la carte (pour signaler la broche)');
  const g = lint('void setup(){pinMode(8,OUTPUT);} void loop(){digitalWrite(8,HIGH);}', 'cpp', schema('uno'));
  egal(g.map((x) => x.args[1]), ['D8'], 'broche numérique : D8, inchangé');
}

console.log(`verify:linter — ${ok} contrôles OK, ${fails.length} échec(s)`);
process.exit(fails.length ? 1 : 0);
