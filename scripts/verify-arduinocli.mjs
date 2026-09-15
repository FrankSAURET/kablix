// Kablix doit retrouver l'arduino-cli installé par l'extension « Arduino VS Code
// IDE » (electropol-fr.arduino-vscode-ide), qui depuis sa v2026.9.3 le range
// dans son STOCKAGE GLOBAL et non plus dans son dossier d'installation.
//
// Le banc fabrique de FAUX arbres de fichiers (vrais fichiers sur disque, dans
// un dossier temporaire) et vérifie l'ordre des pistes, le refus d'un dossier
// vide, et le calcul du dossier frère depuis globalStorageUri. Rien n'est simulé
// côté résolution : c'est le vrai `chercherArduinoCli()` de src/compiler.ts.
import esbuild from 'esbuild';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-cli-'));
const EXE = process.platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli';

let ok = 0;
const fails = [];
const check = (cond, label, detail = '') => {
  if (cond) ok++;
  else {
    fails.push(label);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

/** Crée un faux exécutable (fichier réel) et renvoie son chemin. */
const faireExe = (...segments) => {
  const chemin = join(tmp, ...segments);
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, '#!/bin/sh\necho faux arduino-cli\n');
  if (process.platform !== 'win32') chmodSync(chemin, 0o755);
  return chemin;
};

const bundle = async (src, out) => {
  const fichier = join(tmp, out);
  await esbuild.build({
    entryPoints: [join(ROOT, src)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    external: ['vscode'],
    outfile: fichier,
  });
  return import(pathToFileURL(fichier).href);
};

const { chercherArduinoCli, diagnosticCliIntrouvable, findArduinoCli } = await bundle(
  'src/compiler.ts',
  'compiler.mjs'
);

// Le PATH du système hôte porte peut-être un vrai arduino-cli : il fausserait
// toutes les mesures d'ordre. On le vide pour la durée du banc.
const PATH_REEL = process.env.PATH;
process.env.PATH = join(tmp, 'path-vide');
mkdirSync(join(tmp, 'path-vide'), { recursive: true });

console.log('\nRésolution de arduino-cli — ordre des pistes :');

// --- A. stockage global de l'extension sœur (emplacement depuis sa v2026.9.3)
const stockage = join(tmp, 'globalStorage', 'electropol-fr.arduino-vscode-ide');
const exeStockage = faireExe('globalStorage', 'electropol-fr.arduino-vscode-ide', 'arduino-cli', EXE);
let r = chercherArduinoCli({ autreStockageGlobal: stockage });
check(r.chemin === exeStockage, 'le CLI du stockage global est trouvé', r.chemin ?? 'null');
check(/stockage global/i.test(r.origine ?? ''), 'origine annoncée : stockage global', r.origine);

// --- B. ancien emplacement : dossier d'installation de l'extension (< 2026.9.3)
const install = join(tmp, 'extensions', 'electropol-fr.arduino-vscode-ide-2026.9.2');
const exeInstall = faireExe(
  'extensions',
  'electropol-fr.arduino-vscode-ide-2026.9.2',
  'arduino-cli',
  EXE
);
r = chercherArduinoCli({ autreInstallation: install });
check(r.chemin === exeInstall, 'le CLI de l’ancien emplacement est trouvé', r.chemin ?? 'null');

// --- C. un dossier arduino-cli VIDE ne doit pas être pris pour une trouvaille.
//     C'est exactement ce que laisse la migration de l'autre extension.
const stockageVide = join(tmp, 'vide', 'electropol-fr.arduino-vscode-ide');
mkdirSync(join(stockageVide, 'arduino-cli'), { recursive: true });
r = chercherArduinoCli({ autreStockageGlobal: stockageVide });
check(r.chemin === null, 'un dossier arduino-cli VIDE ne vaut pas trouvaille', r.chemin ?? 'null');

// --- D. ordre : le stockage global passe AVANT l'ancien emplacement, et le
//     réglage Kablix passe avant tout le reste.
r = chercherArduinoCli({ autreStockageGlobal: stockage, autreInstallation: install });
check(r.chemin === exeStockage, 'stockage global prioritaire sur l’ancien emplacement');

const exeReglage = faireExe('a-moi', EXE);
r = chercherArduinoCli({
  arduinoCli: exeReglage,
  autreStockageGlobal: stockage,
  autreInstallation: install,
});
check(r.chemin === exeReglage, 'le réglage kablix.arduinoCliPath prime sur tout');

// --- E. réglages de l'AUTRE extension : `arduino.commandPath` est un nom
//     d'exécutable RELATIF à `arduino.path` (lu dans son propre manifeste),
//     pas un chemin indépendant.
const dossierAutre = join(tmp, 'outils');
const exeAutre = faireExe('outils', EXE);
r = chercherArduinoCli({ autrePath: dossierAutre, autreStockageGlobal: stockage });
check(r.chemin === exeAutre, 'arduino.path seul : exécutable cherché dans ce dossier');

const exeEnrobe = faireExe('outils', process.platform === 'win32' ? 'cli-a-moi.exe' : 'cli-a-moi');
r = chercherArduinoCli({
  autrePath: dossierAutre,
  autreCommandPath: process.platform === 'win32' ? 'cli-a-moi.exe' : 'cli-a-moi',
  autreStockageGlobal: stockage,
});
check(r.chemin === exeEnrobe, 'arduino.commandPath est RELATIF à arduino.path', r.chemin ?? 'null');
check(
  chercherArduinoCli({ autreCommandPath: exeAutre }).chemin === exeAutre,
  'un arduino.commandPath absolu reste accepté'
);
r = chercherArduinoCli({
  autrePath: dossierAutre,
  autreCommandPath: 'cli-a-moi',
  autreStockageGlobal: stockage,
  arduinoCli: '',
});
check(r.chemin !== exeStockage, 'les réglages de l’autre extension priment sur son stockage');

// --- F. réglage qui ne mène nulle part : on continue, on ne s'arrête pas.
r = chercherArduinoCli({
  arduinoCli: join(tmp, 'nexiste-pas', 'arduino-cli'),
  autreStockageGlobal: stockage,
});
check(r.chemin === exeStockage, 'un réglage invalide ne bloque pas les pistes suivantes');

// --- G. rien trouvé : le message doit NOMMER les emplacements consultés.
r = chercherArduinoCli({});
check(r.chemin === null, 'sans aucune piste : rien trouvé (PATH vidé)');
const diag = diagnosticCliIntrouvable(r);
check(/Emplacements cherchés/.test(diag), 'le diagnostic annonce les emplacements cherchés');
check(/kablix\.arduinoCliPath/.test(diag), 'le diagnostic cite le réglage Kablix');
check(/Arduino IDE 2/.test(diag), 'le diagnostic cite Arduino IDE 2');
check(/Arduino VS Code IDE/.test(diag), 'le diagnostic cite l’extension sœur');
check(r.pistes.length >= 6, 'toutes les pistes sont consignées', String(r.pistes.length));
check(
  findArduinoCli({ autreStockageGlobal: stockage }) === exeStockage,
  'findArduinoCli() suit la même résolution'
);

process.env.PATH = PATH_REEL;

// ------------------------------------------- H. branchements côté VS Code
console.log('\nBranchement dans l’extension :');
const pistesSrc = readFileSync(join(ROOT, 'src/arduinoCliPistes.ts'), 'utf8');
const panelSrc = readFileSync(join(ROOT, 'src/panel.ts'), 'utf8');
const compilerSrc = readFileSync(join(ROOT, 'src/compiler.ts'), 'utf8');
const extSrc = readFileSync(join(ROOT, 'src/extension.ts'), 'utf8');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const nlsEn = JSON.parse(readFileSync(join(ROOT, 'package.nls.json'), 'utf8'));

// Le dossier frère se DÉRIVE de notre globalStorageUri : reconstruire depuis
// %APPDATA% serait faux sous VSCodium, VS Code Insiders, macOS et Linux.
check(
  /dirname\(context\.globalStorageUri\.fsPath\)/.test(pistesSrc),
  'le stockage de l’extension sœur est dérivé de globalStorageUri'
);
// Interdit précis : reconstruire le stockage global depuis les variables
// d'environnement. `LOCALAPPDATA` reste légitime ailleurs — c'est une racine
// d'installation d'Arduino IDE 2, pas le chemin du stockage global.
const codePistes = pistesSrc.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
check(
  !/env\.(APPDATA|LOCALAPPDATA|HOME)/i.test(codePistes),
  'le stockage global n’est pas reconstruit depuis l’environnement'
);
check(
  !/['"]globalStorage['"]|globalStorage[\/\\]/.test(codePistes),
  'aucun segment « globalStorage » écrit en dur'
);
check(
  /getExtension\(\s*EXT_ARDUINO_IDE\s*\)\?\./.test(pistesSrc),
  'le dossier d’installation vient de getExtension(), cas absent géré'
);
check(
  /getConfiguration\('arduino'\)/.test(pistesSrc),
  'les réglages de l’autre extension sont lus'
);

// Résolution à CHAQUE besoin, pas mémorisée à l'activation.
check(
  /pistesArduinoIde\(this\.context\)/.test(panelSrc),
  'panel.ts recalcule les pistes à chaque toolPaths()'
);
check(
  /chercherArduinoCli\(toolPaths\)/.test(compilerSrc),
  'compile() résout le CLI à chaque compilation'
);

// Commande de redétection manuelle.
const cmd = pkg.contributes.commands.find((c) => c.command === 'kablix.redetectArduinoCli');
check(!!cmd, 'package.json : commande kablix.redetectArduinoCli');
check(!!nlsEn['kablix.cmd.redetectArduinoCli'], 'titre EN de la commande');
check(
  /registerCommand\('kablix\.redetectArduinoCli'/.test(extSrc),
  'extension.ts enregistre la commande'
);
check(
  /diagnosticCliIntrouvable/.test(pistesSrc),
  'sans CLI, la commande affiche les emplacements cherchés'
);
// Le message d'erreur de compilation doit lui aussi être parlant.
check(
  /diagnosticCliIntrouvable\(recherche\)/.test(compilerSrc),
  'l’erreur de compilation liste les emplacements cherchés'
);

// Multi-plateforme : nom d'exécutable et racines d'Arduino IDE 2 par système.
check(
  /process\.platform === 'win32' \? 'arduino-cli\.exe' : 'arduino-cli'/.test(compilerSrc),
  'nom d’exécutable selon la plateforme'
);
check(/darwin/.test(compilerSrc) && /opt\/homebrew/.test(compilerSrc), 'racines macOS et Linux');
check(/ProgramFiles\(x86\)/.test(compilerSrc), 'Arduino IDE 2 en 32 bits aussi');

console.log(`\n${ok} contrôles verts, ${fails.length} rouge(s).`);
console.log(fails.length ? 'RESULTAT: ECHEC' : 'RESULTAT: OK');
process.exit(fails.length ? 1 : 0);
