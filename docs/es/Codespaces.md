# Kablix en el navegador con GitHub Codespaces

GitHub Codespaces abre VS Code en un navegador, en una máquina Linux remota. Kablix funciona allí: editor de cableado, simulación Uno, Mega y Pico, compilación Arduino, consola. Práctico en un equipo donde no se puede instalar nada (Chromebook, aula bloqueada).

## Lo que no funciona

- **Carga en una placa real** (Arduino o Pico por USB): la placa está conectada al equipo, el codespace se ejecuta en un servidor remoto.
- **Servidor Pico W local**: se ejecuta en el servidor, no en el equipo.
- vscode.dev y github.dev (VS Code sin servidor) no ejecutan Kablix.

## Configuración, una sola vez

1. Crear un repositorio GitHub para los proyectos (sketches `.ino`, programas `.py`, proyectos `.projix`).
2. Copiar en él la carpeta [`.devcontainer`](https://github.com/FrankSAURET/kablix/tree/main/docs/exemples/codespaces/.devcontainer) de la plantilla Kablix, en la raíz del repositorio.
3. Confirmar y enviar a GitHub.

La plantilla instala Kablix, arduino-cli y el núcleo `arduino:avr` cada vez que se crea un codespace. La primera creación tarda dos o tres minutos.

## Abrir un codespace

1. En la página del repositorio: botón **Code**, pestaña **Codespaces**, **Create codespace on main**.
2. VS Code se abre en el navegador. Esperar a que termine la instalación (terminal «postCreateCommand»).
3. Abrir un sketch o un `.projix`: Kablix funciona igual que en el equipo.

Un codespace detenido se vuelve a abrir desde la misma página, con sus archivos. Recordar confirmar y enviar los cambios: un codespace sin usar se elimina a los 30 días.

## Sin la plantilla

Instalar Kablix desde el panel Extensiones y, para compilar Arduino, en el terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sudo BINDIR=/usr/local/bin sh
arduino-cli core update-index && arduino-cli core install arduino:avr
```

## Coste

Una cuenta GitHub personal tiene 120 horas-núcleo gratuitas al mes, es decir 60 horas en una máquina de 2 núcleos. Las cuentas GitHub Education (alumnos, profesores) tienen más. Detener el codespace después de usarlo: se detiene solo tras 30 minutos de inactividad.
