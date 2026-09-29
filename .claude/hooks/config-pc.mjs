// Configuration Claude du PC de Frank, rendue aux sessions CLOUD (v2026.9.6.174).
//
// Une session cloud part d'un conteneur neuf : elle ne voit ni
// C:\Users\Frank\.claude\ ni la mémoire du projet. Leur copie vit dans le dépôt,
// sous .claude/import-pc/ ; ce script la remet en place à chaque démarrage,
// reprise et compactage :
//   - CLAUDE.md global : injecté dans le contexte (sortie du script) ;
//   - commandes globales (/reprend, /caveman, /tl) : copiées dans ~/.claude/commands/ ;
//   - mémoire du projet : copiée dans ~/.claude/projects/<chemin encodé>/memory/,
//     son index injecté avec le chemin des fiches dans le dépôt.
//
// Sur le PC, il ne fait RIEN : la vraie configuration est déjà là, et ce script
// ne doit jamais l'écraser. En Node et non en bash : Node tourne des deux côtés.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

if (process.env.CLAUDE_CODE_REMOTE !== 'true') process.exit(0);

const racine = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const src = join(racine, '.claude', 'import-pc');
if (!existsSync(src)) process.exit(0);
const memoire = join(src, 'memory-c----VS-Code-Extensions-Kablix');
const claude = join(homedir(), '.claude');

/** Copie les .md d'un dossier dans un autre (écrase : le dépôt fait foi). */
const copierMd = (de, vers) => {
	if (!existsSync(de)) return;
	mkdirSync(vers, { recursive: true });
	for (const f of readdirSync(de)) if (f.endsWith('.md')) copyFileSync(join(de, f), join(vers, f));
};

copierMd(join(src, 'commands'), join(claude, 'commands'));
// Chemin encodé comme le fait Claude Code : tout caractère hors [a-zA-Z0-9] devient « - ».
copierMd(memoire, join(claude, 'projects', racine.replace(/[^a-zA-Z0-9]/g, '-'), 'memory'));

// npm : la construction et les bancs en ont besoin.
if (!existsSync(join(racine, 'node_modules'))) {
	try { execSync('npm install --no-audit --no-fund', { cwd: racine, stdio: 'ignore' }); }
	catch { console.log('(config-pc : npm install a échoué)'); }
}

// Contexte : consignes globales, puis index de la mémoire.
const sortie = [];
if (existsSync(join(src, 'CLAUDE.md'))) {
	sortie.push(
		'=== Consignes GLOBALES de Frank (copie de C:\\Users\\Frank\\.claude\\CLAUDE.md) ===',
		"Session cloud Linux : la section « Environnement Windows » ne s'applique pas ici (pas de lettre de lecteur ni de PowerShell) ; le reste vaut tel quel.",
		'',
		readFileSync(join(src, 'CLAUDE.md'), 'utf8'),
	);
}
if (existsSync(join(memoire, 'MEMORY.md'))) {
	sortie.push(
		"=== Mémoire du projet Kablix (index) — fiches dans .claude/import-pc/memory-c----VS-Code-Extensions-Kablix/ ; lire la fiche avant d'appliquer une règle ===",
		readFileSync(join(memoire, 'MEMORY.md'), 'utf8'),
	);
}
process.stdout.write(sortie.join('\n'));
