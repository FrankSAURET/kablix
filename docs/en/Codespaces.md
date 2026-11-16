# Kablix in the browser with GitHub Codespaces

GitHub Codespaces opens VS Code in a browser, on a remote Linux machine. Kablix works there: wiring editor, Uno, Mega and Pico simulation, Arduino compilation, console. Handy on a computer where nothing can be installed (Chromebook, locked-down classroom).

## What does not work

- **Uploading to a real board** (Arduino or Pico over USB): the board is plugged into the computer, the codespace runs on a remote server.
- **Local Pico W server**: it runs on the server, not on the computer.
- vscode.dev and github.dev (VS Code without a server) do not run Kablix.

## One-time setup

1. Create a GitHub repository for the projects (`.ino` sketches, `.py` programs, `.projix` projects).
2. Copy the [`.devcontainer`](https://github.com/FrankSAURET/kablix/tree/main/docs/exemples/codespaces/.devcontainer) folder of the Kablix template into it, at the root of the repository.
3. Commit and push to GitHub.

The template installs Kablix, arduino-cli and the `arduino:avr` core each time a codespace is created. The first creation takes two to three minutes.

## Opening a codespace

1. On the repository page: **Code** button, **Codespaces** tab, **Create codespace on main**.
2. VS Code opens in the browser. Wait for the installation to finish ("postCreateCommand" terminal).
3. Open a sketch or a `.projix`: Kablix works as it does on the computer.

A stopped codespace reopens from the same page, with its files. Remember to commit and push your changes: an unused codespace is deleted after 30 days.

## Without the template

Install Kablix from the Extensions panel, then, to compile Arduino code, in the terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sudo BINDIR=/usr/local/bin sh
arduino-cli core update-index && arduino-cli core install arduino:avr
```

## Cost

A personal GitHub account has 120 free core-hours per month, i.e. 60 hours on a 2-core machine. GitHub Education accounts (students, teachers) get more. Stop the codespace after use: it stops on its own after 30 minutes of inactivity.
