---
name: claude-outillage-2026-07
description: "Outillage créé le 2026-07-04 après audit de 30 sessions : commands /reprend /tl (globaux), /livre /retouche /preview (Kablix), hook SessionStart, CLAUDE.md projets, qa_tl.py"
metadata: 
  node_type: memory
  type: project
  originSessionId: d4028312-c5c1-426d-8531-ba4cc535d774
---

Audit des 30 dernières sessions (2026-07-04) → outillage en place :
- **Globaux** (`C:\Users\Frank\.claude\commands\`) : `/reprend` (reprise sans question via todo.md/PROGRESSION.md), `/tl` (traduction Ren'Py + QA auto).
- **Kablix** (`.claude/commands/`) : `/livre` (typecheck→bump→todo.md→build→commit→push→vsix), `/retouche <type>` (intégration SVG en fork direct, cf. [[kablix-retouche-pipeline]]), `/preview <type>` (rendu headless, cf. [[kablix-webview-geometry-headless]]).
- **Hook SessionStart** (settings.json) : injecte `C:\Users\Frank\.claude\hooks\session-reminder.md` (français/CAVEMAN, Read-avant-Edit post-compactage, reprise auto, rituel de livraison) à chaque démarrage/reprise/compactage.
- **CLAUDE.md projet** créés : Kablix (architecture forks, conventions retouche, versioning) et `O:\Jeux\Traducteur` (QA obligatoire via `qa_tl.py` — nouveau script, les autres restent interdits de modification).
- Frictions mesurées qui ont motivé ça : ~25 « reprend » manuels, 39 erreurs Edit-sans-Read post-compactage, ~20 one-liners cassés (quoting), rituel vsix redemandé à chaque session, chaînes vides/anglaises découvertes par Frank.
