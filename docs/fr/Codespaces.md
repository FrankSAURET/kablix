# Kablix dans le navigateur avec GitHub Codespaces

GitHub Codespaces ouvre VS Code dans un navigateur, sur une machine Linux distante. Kablix y fonctionne : éditeur de câblage, simulation Uno, Mega et Pico, compilation Arduino, console. Pratique sur un poste où rien ne peut être installé (Chromebook, salle verrouillée).

## Ce qui ne marche pas

- **Envoi vers une vraie carte** (Arduino ou Pico par USB) : la carte est branchée sur le poste, le codespace tourne sur un serveur distant.
- **Serveur Pico W local** : il tourne sur le serveur, pas sur le poste.
- vscode.dev et github.dev (VS Code sans serveur) ne lancent pas Kablix.

## Mise en place une fois pour toutes

1. Créer un dépôt GitHub pour les projets (sketchs `.ino`, programmes `.py`, projets `.projix`).
2. Copier dedans le dossier [`.devcontainer`](https://github.com/FrankSAURET/kablix/tree/main/docs/exemples/codespaces/.devcontainer) du modèle Kablix, à la racine du dépôt.
3. Enregistrer et envoyer sur GitHub.

Le modèle installe Kablix, arduino-cli et le cœur `arduino:avr` à la création de chaque codespace. La première création prend deux à trois minutes.

## Ouvrir un codespace

1. Sur la page du dépôt : bouton **Code**, onglet **Codespaces**, **Create codespace on main**.
2. VS Code s'ouvre dans le navigateur. Attendre la fin de l'installation (terminal « postCreateCommand »).
3. Ouvrir un sketch ou un `.projix` : Kablix fonctionne comme sur le poste.

Un codespace arrêté se rouvre depuis la même page, avec ses fichiers. Penser à enregistrer et envoyer ses modifications : un codespace inutilisé est supprimé au bout de 30 jours.

## Sans le modèle

Installer Kablix depuis le panneau Extensions, puis, pour compiler de l'Arduino, dans le terminal :

```bash
curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sudo BINDIR=/usr/local/bin sh
arduino-cli core update-index && arduino-cli core install arduino:avr
```

## Coût

Un compte GitHub personnel a 120 heures-cœur gratuites par mois, soit 60 heures sur une machine à 2 cœurs. Les comptes GitHub Education (élèves, enseignants) ont davantage. Arrêter le codespace après usage : il s'arrête seul après 30 minutes d'inactivité.
