#!/usr/bin/env python3
"""
Utilitaire de transfert de fichiers vers un Pico connecté via REPL USB-CDC.
Utilise le protocole REPL de MicroPython pour uploader des fichiers.
Nécessite : pip install pyserial
"""

import sys
import os
import json
import time
import argparse
from pathlib import Path

try:
    import serial
except ImportError:
    print("ERROR: pyserial is not installed")
    print("Install it with: pip install pyserial")
    sys.exit(1)


def send_command(ser, cmd: str, timeout: float = 1.0) -> str:
    """Envoie une commande au REPL et retourne la réponse."""
    ser.write((cmd + '\r').encode())
    ser.flush()

    result = b''
    start_time = time.time()

    while time.time() - start_time < timeout:
        if ser.in_waiting:
            chunk = ser.read(1)
            result += chunk
            if result.endswith(b'>>> ') or result.endswith(b'... '):
                break
        time.sleep(0.01)

    return result.decode('utf-8', errors='replace')


def upload_file(ser, local_path: str, remote_path: str = 'main.py') -> bool:
    """Upload un fichier vers le Pico."""
    try:
        with open(local_path, 'rb') as f:
            content = f.read()

        file_size = len(content)

        # Envoyer la commande pour créer le fichier
        create_cmd = f'''with open('{remote_path}', 'wb') as f:
    f.write({repr(content)})'''

        print(f"Uploading {local_path} -> {remote_path} ({file_size} bytes)...")

        # Envoyer ligne par ligne au REPL
        for line in create_cmd.split('\n'):
            response = send_command(ser, line, timeout=2.0)
            if 'Traceback' in response:
                print(f"Erreur lors de l'upload: {response}")
                return False

        # Envoyer une ligne vide pour terminer
        send_command(ser, '', timeout=1.0)

        print(f"✓ {remote_path} uploadé")
        return True

    except Exception as e:
        print(f"Erreur lors du transfert: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description='Upload files to Pico via REPL')
    parser.add_argument('--port', required=True, help='Serial port (COM3, /dev/ttyUSB0, etc.)')
    parser.add_argument('--files', required=True, help='JSON list of {path, name} objects')
    parser.add_argument('--baud', type=int, default=115200, help='Baud rate')

    args = parser.parse_args()

    try:
        files = json.loads(args.files)
    except json.JSONDecodeError:
        print("Erreur: --files doit être du JSON valide")
        sys.exit(1)

    if not files:
        print("Aucun fichier à uploader")
        return

    # Ouvrir le port série
    try:
        ser = serial.Serial(args.port, args.baud, timeout=1)
        print(f"Connecté au {args.port} (115200 baud)")
    except serial.SerialException as e:
        print(f"Erreur: impossible de se connecter au {args.port}: {e}")
        sys.exit(1)

    try:
        time.sleep(0.5)  # Attendre la connexion

        # Envoyer Ctrl+C pour interrompre tout code en cours
        ser.write(b'\x03')
        time.sleep(0.2)

        # Entrer dans le mode REPL
        send_command(ser, '', timeout=0.5)

        uploaded = 0
        failed = 0

        for file_info in files:
            local_path = file_info['path']
            remote_name = file_info['name']

            # Renommer main.py si c'est le fichier principal
            if remote_name.endswith('.py') and remote_name != 'main.py':
                # Garder le chemin relatif
                pass

            if upload_file(ser, local_path, remote_name):
                uploaded += 1
            else:
                failed += 1

        print(f"\nRésumé: {uploaded} fichier(s) uploadé(s), {failed} erreur(s)")

        if failed == 0:
            sys.exit(0)
        else:
            sys.exit(1)

    finally:
        ser.close()


if __name__ == '__main__':
    main()
