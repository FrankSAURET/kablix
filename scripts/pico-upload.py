#!/usr/bin/env python3
"""
Ecrit des fichiers sur une carte Raspberry Pi Pico branchee en USB.

Appele par l'extension (src/picoUploader.ts), jamais a la main :
    python pico-upload.py --port COM3 --files '[{"path": "...", "remote": "main.py"}]'
    python pico-upload.py --port COM3 --stop      (arrete le programme en cours)
    python pico-upload.py --port COM3 --bootloader (mode BOOTSEL, avant un firmware)
    python pico-upload.py --port COM3 --files '[...]' --monitor
        (envoi, redemarrage logiciel, puis le port reste ouvert : la sortie de
        la carte suit la ligne DONE sur stdout, la saisie arrive par stdin)

Le transfert passe par le RAW REPL de MicroPython (Ctrl-A / Ctrl-D / Ctrl-B),
le meme protocole que mpremote et ampy. L'ecriture ligne a ligne dans le REPL
normal ne marche pas : le REPL renvoie en echo ce qu'on lui envoie, reindente
tout seul les blocs et coupe les lignes longues -- le fichier arrivait tronque.
En raw REPL, la carte n'echo rien et confirme chaque bloc par « OK ».

Le contenu part en base64 (ubinascii) par blocs : un .py peut contenir des
guillemets, des accents et des sauts de ligne, qu'un envoi en clair casserait.

Un fichier deja identique sur la carte n'est PAS reecrit (comparaison par
empreinte SHA-256). L'horloge du Pico n'est pas conservee hors tension et repart
en 2021 a chaque demarrage : comparer les dates enverrait toujours tout, ou pire,
prendrait un fichier de la carte pour « plus recent ». L'empreinte, elle, dit
exactement ce qui a change.

Toute la sortie est en ASCII : la console Windows est en cp1252 et refusait
d'afficher un simple « OK ✓ » (UnicodeEncodeError, transfert perdu).

Prerequis : pip install pyserial
"""

import argparse
import base64
import hashlib
import json
import os
import sys
import time

try:
    import serial
except ImportError:
    print("ERROR: pyserial is missing. Install it with: pip install pyserial")
    sys.exit(2)


# Taille des blocs envoyes a la carte. 512 octets bruts font ~684 caracteres
# en base64 : assez gros pour aller vite, assez petit pour la RAM du RP2040.
CHUNK = 512

# Delai d'attente d'une reponse de la carte. Une ecriture en memoire flash peut
# prendre plusieurs centaines de millisecondes.
TIMEOUT = 10.0


class ReplError(Exception):
    """La carte a refuse une commande (l'erreur MicroPython est dans le message)."""


def read_until(ser, token: bytes, timeout: float = TIMEOUT) -> bytes:
    """
    Lit jusqu'a `token` inclus, et rend la reponse coupee juste apres.

    Ce qui suit le token est mis de cote pour la lecture suivante : la carte
    repond souvent « OK<sortie>\\x04\\x04> » d'un seul paquet USB, et rendre le
    tampon entier ferait prendre la sortie du programme pour l'accuse de
    reception. Leve ReplError si le delai expire.
    """
    buf = getattr(ser, "_reste", b"")
    deadline = time.time() + timeout
    while True:
        pos = buf.find(token)
        if pos >= 0:
            cut = pos + len(token)
            ser._reste = buf[cut:]
            return buf[:cut]
        if time.time() >= deadline:
            ser._reste = buf
            raise ReplError("no answer from the board (expected %r)" % token)
        chunk = ser.read(ser.in_waiting or 1)
        if chunk:
            buf += chunk
        else:
            time.sleep(0.005)


def enter_raw_repl(ser) -> None:
    """Interrompt le programme en cours et bascule la carte en raw REPL."""
    ser.write(b"\r\x03\x03")  # deux Ctrl-C : coupe meme une boucle infinie
    time.sleep(0.2)
    ser.reset_input_buffer()
    ser._reste = b""          # ce que disait le programme interrompu ne nous regarde pas
    ser.write(b"\r\x01")      # Ctrl-A : entree en raw REPL
    read_until(ser, b"raw REPL; CTRL-B to exit\r\n>", timeout=5.0)


def exit_raw_repl(ser) -> None:
    """Rend la carte au REPL normal (sinon elle reste muette apres l'envoi)."""
    ser.write(b"\r\x02")
    time.sleep(0.1)


def reboot(ser) -> None:
    """Redemarre la carte (machine.reset) : main.py tourne aussitot, sans geste.

    Pas de lecture de reponse : la carte coupe l'USB en repartant, donc la
    liaison tombe avant tout accuse de reception.
    """
    ser.write(b"import machine\nmachine.reset()")
    ser.write(b"\x04")
    try:
        ser.flush()
    except serial.SerialException:
        pass
    time.sleep(0.2)


def soft_reboot(ser) -> None:
    """Redemarrage logiciel (Ctrl-D au REPL normal) : main.py repart, le port reste ouvert.

    Contrairement a machine.reset, l'USB ne tombe pas : le moniteur qui suit voit
    la sortie du programme des sa premiere ligne. Une sortie emise pendant que
    personne ne tient le port est perdue (MicroPython n'ecrit sur l'USB que si
    l'hote est connecte) : un « print » au demarrage ne passerait jamais.
    """
    exit_raw_repl(ser)
    try:
        read_until(ser, b">>> ", timeout=2.0)
    except ReplError:
        pass  # banniere non vue : on tente le Ctrl-D quand meme
    ser.write(b"\x04")


def monitor(ser, port: str, baud: int) -> int:
    """
    Moniteur serie : carte -> stdout (octets bruts), stdin -> carte.

    stdin est la saisie du terminal de l'extension (Ctrl-C compris, c'est un
    octet comme un autre dans un tube). Un seul fil d'execution touche au port ;
    celui de stdin ne fait que remplir une file. Carte debranchee ou redemarree
    (USB qui tombe) : le port est rouvert des qu'il revient. Les changements
    d'etat sortent sur stderr (« STATUS: waiting » / « STATUS: open »).
    Fin de stdin = fin du moniteur, apres avoir vide ce que la carte avait dit.
    """
    import queue
    import threading

    entree = queue.Queue()
    fini = threading.Event()

    def lire_stdin():
        while True:
            try:
                data = os.read(sys.stdin.fileno(), 1024)
            except OSError:
                data = b""
            if not data:
                fini.set()
                return
            entree.put(data)

    threading.Thread(target=lire_stdin, daemon=True).start()
    sortie = sys.stdout.buffer
    sys.stdout.flush()
    reste = getattr(ser, "_reste", b"") if ser else b""
    if reste:
        sortie.write(reste)
        sortie.flush()
    calme = None  # instant de la derniere donnee recue apres la fin de stdin
    while True:
        if ser is None:
            if fini.is_set():
                return 0
            try:
                ser = serial.Serial(port, baud, timeout=0.05)
                sys.stderr.write("STATUS: open\n")
                sys.stderr.flush()
            except (serial.SerialException, OSError):
                time.sleep(0.3)
                continue
        try:
            while not entree.empty():
                ser.write(entree.get_nowait())
            data = ser.read(ser.in_waiting or 1)
        except (serial.SerialException, OSError):
            try:
                ser.close()
            except (serial.SerialException, OSError):
                pass
            ser = None
            sys.stderr.write("STATUS: waiting\n")
            sys.stderr.flush()
            continue
        if data:
            sortie.write(data)
            sortie.flush()
        if fini.is_set():
            if data or calme is None:
                calme = time.time()
            elif time.time() - calme > 0.3:
                try:
                    ser.close()
                except (serial.SerialException, OSError):
                    pass
                return 0


def exec_raw(ser, code: str) -> str:
    """Execute du code sur la carte et rend sa sortie. Leve ReplError sur erreur."""
    ser.write(code.encode("utf-8"))
    ser.write(b"\x04")  # Ctrl-D : fin d'envoi, la carte execute
    # La carte accuse reception par « OK », puis renvoie stdout, \x04, stderr, \x04.
    read_until(ser, b"OK", timeout=5.0)
    out = read_until(ser, b"\x04")[:-1]
    err = read_until(ser, b"\x04")[:-1]
    if err.strip():
        raise ReplError(err.decode("utf-8", "replace").strip().splitlines()[-1])
    return out.decode("utf-8", "replace")


def ensure_dirs(ser, remote: str) -> None:
    """Cree les dossiers parents du fichier sur la carte (equivalent de mkdir -p)."""
    parts = remote.replace("\\", "/").split("/")[:-1]
    path = ""
    for part in parts:
        if not part:
            continue
        path = path + "/" + part if path else part
        # Un dossier deja present leve OSError : c'est le cas normal, on l'ignore.
        exec_raw(ser, "import os\ntry:\n os.mkdir(%r)\nexcept OSError:\n pass\n" % path)


def remote_digest(ser, remote: str) -> str:
    """Empreinte SHA-256 du fichier sur la carte, ou '' s'il n'existe pas."""
    code = (
        "import uhashlib, ubinascii\n"
        "try:\n"
        " h = uhashlib.sha256()\n"
        " f = open(%r, 'rb')\n"
        " while True:\n"
        "  b = f.read(256)\n"
        "  if not b: break\n"
        "  h.update(b)\n"
        " f.close()\n"
        " print(ubinascii.hexlify(h.digest()).decode())\n"
        "except Exception:\n"
        " print('')\n"
    ) % remote
    try:
        return exec_raw(ser, code).strip()
    except ReplError:
        # Firmware sans uhashlib : on renonce a comparer et on reecrit toujours.
        return ""


def write_file(ser, local: str, remote: str) -> bool:
    """Ecrit un fichier sur la carte. Rend True s'il a ete envoye, False s'il etait deja a jour."""
    with open(local, "rb") as fh:
        data = fh.read()

    if remote_digest(ser, remote) == hashlib.sha256(data).hexdigest():
        print("SKIP: %s (already up to date, %d bytes)" % (remote, len(data)))
        return False

    ensure_dirs(ser, remote)
    exec_raw(ser, "import ubinascii\n_f = open(%r, 'wb')\n" % remote)
    for start in range(0, len(data), CHUNK):
        block = base64.b64encode(data[start : start + CHUNK]).decode("ascii")
        exec_raw(ser, "_f.write(ubinascii.a2b_base64('%s'))\n" % block)
    exec_raw(ser, "_f.close()\ndel _f\n")
    print("SENT: %s (%d bytes)" % (remote, len(data)))
    return True


def stop_program(port: str, baud: int) -> int:
    """
    Arrete le programme qui tourne sur la carte (Ctrl-C) et la laisse au REPL.

    Trois Ctrl-C espaces : un programme qui rattrape KeyboardInterrupt dans une
    boucle en laisse passer un ; le prompt « >>> » confirme l'arret.
    """
    try:
        ser = serial.Serial(port, baud, timeout=0.1)
    except serial.SerialException as exc:
        print("ERROR: cannot open %s (%s). Close any serial monitor using it." % (port, exc))
        return 2
    try:
        time.sleep(0.1)
        ser.reset_input_buffer()
        ser._reste = b""
        for _ in range(3):
            ser.write(b"\x03")
            time.sleep(0.1)
        ser.write(b"\r")
        try:
            read_until(ser, b">>> ", timeout=2.0)
        except ReplError:
            print("ERROR: the board did not come back to the >>> prompt "
                  "(program ignores Ctrl-C, or not MicroPython)")
            return 3
    finally:
        try:
            ser.close()
        except (serial.SerialException, OSError):
            pass
    print("DONE: program stopped, board at the >>> prompt")
    return 0


def enter_bootloader(port: str, baud: int) -> int:
    """
    Bascule la carte en mode BOOTSEL (machine.bootloader) : elle disparait du
    port serie et revient en lecteur USB « RPI-RP2 » / « RP2350 », pret a
    recevoir un .uf2. Pas d'accuse de reception : l'USB tombe aussitot.
    """
    try:
        ser = serial.Serial(port, baud, timeout=0.1)
    except serial.SerialException as exc:
        print("ERROR: cannot open %s (%s). Close any serial monitor using it." % (port, exc))
        return 2
    try:
        time.sleep(0.2)
        try:
            enter_raw_repl(ser)
        except ReplError as exc:
            print("ERROR: no MicroPython prompt on %s (%s). Is the board running MicroPython?"
                  % (port, exc))
            return 3
        ser.write(b"import machine\nmachine.bootloader()")
        ser.write(b"\x04")
        try:
            ser.flush()
        except serial.SerialException:
            pass
        time.sleep(0.3)
    finally:
        try:
            ser.close()
        except (serial.SerialException, OSError):
            pass
    print("DONE: board restarted in BOOTSEL mode")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Write files to a Raspberry Pi Pico")
    parser.add_argument("--port", required=True, help="COM3, /dev/ttyACM0, ...")
    parser.add_argument("--files", help='JSON: [{"path":..., "remote":...}]')
    parser.add_argument("--stop", action="store_true", help="stop the running program (Ctrl-C)")
    parser.add_argument("--bootloader", action="store_true",
                        help="restart the board in BOOTSEL mode (firmware update)")
    parser.add_argument("--monitor", action="store_true",
                        help="keep the port open and relay the board output (after --files: soft reboot)")
    parser.add_argument("--baud", type=int, default=115200)
    args = parser.parse_args()

    if args.stop:
        return stop_program(args.port, args.baud)
    if args.bootloader:
        return enter_bootloader(args.port, args.baud)
    if args.monitor and not args.files:
        return monitor(None, args.port, args.baud)
    if not args.files:
        print("ERROR: --files or --stop is required")
        return 2

    try:
        files = json.loads(args.files)
    except json.JSONDecodeError as exc:
        print("ERROR: bad --files payload: %s" % exc)
        return 2
    if not files:
        print("ERROR: nothing to upload")
        return 2

    for entry in files:
        if not os.path.isfile(entry["path"]):
            print("ERROR: file not found: %s" % entry["path"])
            return 2

    try:
        ser = serial.Serial(args.port, args.baud, timeout=0.1)
    except serial.SerialException as exc:
        # Cas courant : un moniteur serie (Thonny, terminal) tient deja le port.
        print("ERROR: cannot open %s (%s). Close any serial monitor using it." % (args.port, exc))
        return 2

    sent = skipped = 0
    redemarre = False
    try:
        time.sleep(0.2)
        try:
            enter_raw_repl(ser)
        except ReplError as exc:
            print("ERROR: no MicroPython prompt on %s (%s). Is the board running MicroPython?"
                  % (args.port, exc))
            return 3

        try:
            for entry in files:
                if write_file(ser, entry["path"], entry["remote"]):
                    sent += 1
                else:
                    skipped += 1
            # Tout est passe : la carte redemarre et lance main.py toute seule.
            if args.monitor:
                soft_reboot(ser)
            else:
                reboot(ser)
            redemarre = True
        except ReplError as exc:
            print("ERROR: %s" % exc)
            return 4
        finally:
            # Apres un reboot, la liaison est deja tombee : rien a rendre au REPL.
            if not redemarre:
                exit_raw_repl(ser)
        if args.monitor:
            # Le port reste ouvert : la ligne DONE marque le debut de la sortie
            # de la carte, relayee telle quelle a l'extension.
            print("DONE: %d sent, %d already up to date, board soft-rebooted" % (sent, skipped),
                  flush=True)
            garde, ser = ser, None
            return monitor(garde, args.port, args.baud)
    finally:
        if ser is not None:
            try:
                ser.close()
            except (serial.SerialException, OSError):
                pass

    print("DONE: %d sent, %d already up to date, board rebooted" % (sent, skipped))
    return 0


if __name__ == "__main__":
    sys.exit(main())
