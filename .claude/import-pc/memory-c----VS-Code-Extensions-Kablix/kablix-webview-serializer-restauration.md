---
name: kablix-webview-serializer-restauration
description: "Un onglet de webview sans WebviewPanelSerializer revient mort après un redémarrage de VS Code — cause racine de la page grise de l'analyseur (v2026.9.4.126)."
metadata:
  node_type: memory
  type: project
  originSessionId: 55d6b855-c14d-44f8-a992-002aa2e3448f
  modified: 2026-09-23T16:48:39.605Z
---

VS Code réaffiche au démarrage les onglets de webview qui étaient ouverts, mais il ne les rend à l'extension que si elle a enregistré un `registerWebviewPanelSerializer` sur leur `viewType`. Sans lui, l'onglet revient à l'écran en cadavre : absent du registre en mémoire (`AnalyseurPanel.ouverts`), donc le relais de l'hôte rend `undefined` et plus AUCUN message ne l'atteint — ni voies, ni départ, ni fronts.

C'était la cause racine de la « page grise » de l'analyseur, trouvée le 23/09/2026 (v2026.9.4.126), après que la fiche [[kablix-analyseur-page-grise-cause-racine]] eut corrigé un AUTRE défaut réel qui ne suffisait pas.

**Ce qui rendait le défaut invisible** : le journal CSV de session ne passe pas par l'onglet, il se remplissait parfaitement (257 414 lignes correctes). Données bonnes, affichage mort.

**Ce qu'il a fallu écarter avant, par la mesure** : rendu de l'onglet (20 131 px sur 3 enchaînements), relais de l'hôte (voies/depart/fronts dans le bon ordre), `restaure` à capture vide (61 596 px, plus que la référence). Trois hypothèses plausibles, trois fois fausses.

**Pourquoi 9 bancs verts n'avaient rien vu** : ils partent TOUS d'un onglet ouvert par `ouvrir()`. Aucun ne rejouait un onglet restauré. Angle mort commun à toute une série de bancs — ce type de trou ne se voit qu'en se demandant quel chemin d'entrée aucun banc n'emprunte.

**Le montage qui marche** : `brancher()` privé partagé entre `ouvrir()` et la restauration ; la clé du projet écrite dans la page (`KABLIX_ANALYSEUR_CLE`) puis confiée à VS Code par `setState` — posée par la page, jamais par l'hôte, car `acquireVsCodeApi()` ne s'appelle qu'une fois par page. L'atelier arrive APRÈS la restauration (VS Code restaure les webviews avant de rouvrir le `.projix`) : l'onglet est donc rendu vivant tout de suite et l'atelier cherché à chaque appel, `suivreAnalyseur()` lui repoussant son état quand il arrive. La capture n'est pas mémorisée : une mesure appartient à une simulation, pas à une fenêtre.

Banc : `scripts/verify-analyseur-restaure.mjs` (API vscode simulée, registre sur `globalThis` sinon deux instances de module ont chacune leur Map). Vaut pour tout autre onglet de webview du projet (oscilloscope, traceur) si un jour ils doivent survivre à un redémarrage.
