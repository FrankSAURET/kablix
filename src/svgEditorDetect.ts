// Trouver l'éditeur qui ouvrira les dessins SVG du créateur de composants.
//
// Rien ici ne dépend de `vscode` : ce module se charge aussi depuis Node, ce
// qui rend son analyse du registre et sa ligne de lancement vérifiables par
// `verify:creator-ui` sans lancer VS Code.
//
// Le principe : ne RIEN demander tant qu'on peut trouver. L'utilisateur a déjà
// associé les .svg à une application dans son système (Inkscape chez la
// plupart) — c'est celle-là qu'il attend, et la lui redemander est du bruit.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

/** Exécute une commande courte et rend sa sortie, ou `null` en cas d'échec. */
function run(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 4000, windowsHide: true }, (err, stdout) => {
      resolve(err ? null : stdout);
    });
  });
}

/** Remplace les `%VAR%` d'une valeur REG_EXPAND_SZ par leur contenu. */
export function expandEnv(value: string): string {
  return value.replace(/%([^%]+)%/g, (whole, name: string) => process.env[name] ?? whole);
}

/**
 * Extrait le chemin de l'exécutable d'une ligne de commande du registre :
 * `"C:\…\inkscape.exe" "%1"` ou `C:\…\app.exe %1` (sans guillemets, le chemin
 * peut alors contenir des espaces — on s'arrête au premier `.exe`).
 */
export function parseShellCommandExe(command: string): string | null {
  const text = expandEnv(command.trim());
  if (!text) return null;
  if (text.startsWith('"')) {
    const end = text.indexOf('"', 1);
    return end > 1 ? text.slice(1, end) : null;
  }
  // Sans guillemets : « C:\Program Files\App\app.exe %1 » — le premier
  // séparateur venu couperait le chemin en deux, on vise donc l'extension.
  const m = text.match(/^(.*?\.(?:exe|com|bat|cmd))(?:\s|$)/i);
  if (m) return m[1];
  const first = text.split(/\s+/)[0];
  return first || null;
}

/**
 * Applications à ne PAS retenir même si le système les a associées aux SVG :
 * elles AFFICHENT un dessin (ou son code) sans l'éditer, et le créateur promet
 * un aller-retour de retouche.
 */
const NOT_EDITORS =
  /(?:^|[\\/])(?:chrome|msedge|firefox|iexplore|opera|brave|vivaldi|safari|photoviewer|photos|rundll32|dllhost|notepad|wordpad|mspaint|code|code - insiders|codium)(?:\.exe)?$/i;

/** L'exécutable désigné sait-il retoucher un SVG (et non seulement l'afficher) ? */
export function isUsableSvgEditor(exe: string): boolean {
  const name = exe.replace(/\.(exe|com|bat|cmd)$/i, '');
  return !NOT_EDITORS.test(name) && !NOT_EDITORS.test(exe);
}

/** Éditeur associé aux .svg dans le registre Windows (`null` si introuvable). */
async function windowsDefaultSvgEditor(): Promise<string | null> {
  const value = (out: string | null, name: string): string | null => {
    if (!out) return null;
    // « ProgId    REG_SZ    Inkscape.SVG » — le nom de la valeur par défaut est
    // traduit ((Default) / (Par défaut)), on s'accroche donc au TYPE.
    const re = new RegExp(`^\\s*${name}\\s+REG_(?:SZ|EXPAND_SZ)\\s+(.*)$`, 'im');
    const m = out.match(re);
    return m ? m[1].trim() : null;
  };
  // 1. Choix explicite de l'utilisateur, puis association générale du système.
  const userChoice = await run('reg', [
    'query',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.svg\\UserChoice',
    '/v',
    'ProgId',
  ]);
  let progId = value(userChoice, 'ProgId');
  if (!progId) {
    const assoc = await run('reg', ['query', 'HKCR\\.svg', '/ve']);
    progId = value(assoc, '\\([^)]+\\)');
  }
  if (!progId) return null;
  // 2. Ligne de commande de ce type de fichier (utilisateur d'abord).
  for (const root of ['HKCU\\SOFTWARE\\Classes', 'HKCR']) {
    const out = await run('reg', ['query', `${root}\\${progId}\\shell\\open\\command`, '/ve']);
    const command = value(out, '\\([^)]+\\)');
    const exe = command ? parseShellCommandExe(command) : null;
    if (exe && existsSync(exe) && isUsableSvgEditor(exe)) return exe;
  }
  return null;
}

/** Éditeur associé au type image/svg+xml sur un bureau Linux. */
async function linuxDefaultSvgEditor(): Promise<string | null> {
  const desktop = (await run('xdg-mime', ['query', 'default', 'image/svg+xml']))?.trim();
  if (!desktop) return null;
  const dirs = [
    `${homedir()}/.local/share/applications`,
    '/usr/local/share/applications',
    '/usr/share/applications',
  ];
  for (const dir of dirs) {
    const file = `${dir}/${desktop}`;
    if (!existsSync(file)) continue;
    const out = await run('sh', ['-c', `grep -m1 '^Exec=' ${JSON.stringify(file)}`]);
    const exec = out?.replace(/^Exec=/, '').trim();
    if (!exec) continue;
    // « inkscape %U » — on ne garde que le programme, sans ses jokers.
    const prog = exec.split(/\s+/)[0].replace(/^"|"$/g, '');
    const resolved = prog.includes('/')
      ? prog
      : (await run('which', [prog]))?.trim().split('\n')[0] || '';
    if (resolved && existsSync(resolved) && isUsableSvgEditor(resolved)) return resolved;
  }
  return null;
}

/** Emplacements habituels des éditeurs de dessin vectoriel, par système. */
export function knownSvgEditorPaths(): string[] {
  if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles ?? 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    return [
      `${pf}\\Inkscape\\bin\\inkscape.exe`,
      `${pf}\\Inkscape\\inkscape.exe`,
      `${pf86}\\Inkscape\\bin\\inkscape.exe`,
      `${pf86}\\Inkscape\\inkscape.exe`,
      `${pf}\\Affinity\\Designer 2\\Designer.exe`,
    ];
  }
  if (process.platform === 'darwin') {
    return [
      '/Applications/Inkscape.app',
      '/Applications/Boxy SVG.app',
      '/Applications/Affinity Designer 2.app',
      '/Applications/Adobe Illustrator/Adobe Illustrator.app',
    ];
  }
  return ['/usr/bin/inkscape', '/usr/local/bin/inkscape', '/snap/bin/inkscape'];
}

/**
 * Éditeur SVG à utiliser sans rien demander : celui associé aux .svg dans le
 * système, à défaut un éditeur connu installé. `null` = il faudra demander.
 */
export async function detectSvgEditor(): Promise<string | null> {
  try {
    if (process.platform === 'win32') {
      const found = await windowsDefaultSvgEditor();
      if (found) return found;
    } else if (process.platform === 'linux') {
      const found = await linuxDefaultSvgEditor();
      if (found) return found;
    }
  } catch {
    // Registre illisible, `xdg-mime` absent : on passe aux chemins connus.
  }
  return knownSvgEditorPaths().find(existsSync) ?? null;
}

/**
 * Comment lancer cet éditeur sur ce fichier. Trois cas qu'un `spawn` direct
 * rate : le paquet `.app` de macOS (un DOSSIER, à ouvrir par `open -a`), le
 * script `.bat`/`.cmd` de Windows (Node refuse de l'exécuter sans interpréteur
 * depuis la correction CVE-2024-27980), et le cas ordinaire.
 */
export function svgEditorLaunch(exe: string, file: string): { cmd: string; args: string[] } {
  if (process.platform === 'darwin' && /\.app\/?$/i.test(exe)) {
    return { cmd: 'open', args: ['-a', exe.replace(/\/$/, ''), file] };
  }
  if (process.platform === 'win32' && /\.(bat|cmd)$/i.test(exe)) {
    return { cmd: process.env.ComSpec ?? 'cmd.exe', args: ['/c', exe, file] };
  }
  return { cmd: exe, args: [file] };
}

/**
 * Dossier où le système range ses applications : la fenêtre de choix s'ouvre
 * là plutôt que dans le dernier dossier visité (souvent le projet).
 */
export function defaultAppsDirPath(): string | undefined {
  if (process.platform === 'win32') {
    // « Program Files » de l'architecture courante, avec repli sur le 32 bits.
    const dir = process.env.ProgramFiles ?? process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files';
    return existsSync(dir) ? dir : undefined;
  }
  const dir = process.platform === 'darwin' ? '/Applications' : '/usr/bin';
  return existsSync(dir) ? dir : undefined;
}
