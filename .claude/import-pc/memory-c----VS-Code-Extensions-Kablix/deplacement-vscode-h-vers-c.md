---
name: deplacement-vscode-h-vers-c
description: Le dossier « - VS Code » a été déplacé de H:\OneDrive\4 Programation vers C:\ le 21 août 2026 ; historique et mémoires Claude rapatriés à la main.
metadata: 
  node_type: memory
  type: project
  originSessionId: 5648ce78-2edd-48cf-a8b6-5c22d789d364
  modified: 2026-08-21T19:47:41.832Z
---

Le 21 août 2026, Frank a déplacé tout `H:\OneDrive\4 Programation\- VS Code\` vers `C:\- VS Code\` (l'ancien chemin n'existe plus). Claude Code range ses transcripts et ses mémoires dans un dossier par chemin de travail (`~/.claude/projects/<chemin encodé>`), donc chaque projet a semblé repartir de zéro : historique vide et mémoires perdues.

Rapatriement fait le jour même par copie : 119 sessions + 26 mémoires pour Kablix, plus MaPageDAccueil, son worktree `jolly-johnson-90c3c2`, Arduino-VsCode-IDE et drawio-in-vscode. Les dossiers `h--OneDrive-…` d'origine sont intacts, rien n'a été écrasé.

Deux séquelles à connaître : le champ `cwd` des transcripts copiés pointe encore vers `h:\OneDrive\…` (trace informative, sans effet sur `/resume`), et le dossier `drawio-in-vscode` n'existe plus sous ce nom sur C: — sur le nouveau disque c'est `drawio-diagrams-editor`, donc ses deux mémoires ne seront pas relues tant que le mapping n'est pas tranché.

`cleanupPeriodDays: 365` a été ajouté à `~/.claude/settings.json` à cette occasion : la rétention par défaut de 30 jours allait effacer les sessions rapatriées de fin juillet (la copie préserve leur date d'origine).

**Why:** sans ça, un « historique trop court » après un déménagement de dossier ressemble à une perte de données alors que tout est encore là sous l'ancien chemin.

**How to apply:** à tout changement de chemin d'un projet, copier `~/.claude/projects/<ancien encodé>/` vers `<nouveau encodé>/` (encodage : tout caractère hors [a-zA-Z0-9] devient `-`) avant que la rétention ne passe.
