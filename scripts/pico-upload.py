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

# Forcer l'UTF-8 sur Windows
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

try:
    import serial
except ImportError:
    print("ERROR: pyserial is not installed")
    print("Install it with: pip install pyserial")
    sys.exit(1)


def send_raw(ser, data: bytes, timeout: float = 1.0) -> bytes:
    """Envoie des données brutes et retourne la réponse."""
    ser.write(data)
    ser.flush()

    result = b''
    start_time = time.time()

    while time.time() - start_time < timeout:
        if ser.in_waiting:
            chunk = ser.read(min(ser.in_waiting, 256))
            result += chunk
        time.sleep(0.01)

    return result


def send_command(ser, cmd: str, timeout: float = 1.0) -> str:
    """Envoie une commande et retourne la réponse."""
    response = send_raw(ser, (cmd + '\r').encode('utf-8'), timeout)
    return response.decode('utf-8', errors='replace')


def upload_file(ser, local_path: str, remote_path: str) -> bool:
    """Upload un fichier vers le Pico."""
    try:
        with open(local_path, 'r', encoding='utf-8') as f:
            content = f.read()

        file_size = len(content)
        print(f"Uploading {local_path} -> {remote_path} ({file_size} bytes)...")

        # Créer le fichier et écrire le contenu
        # Utiliser une approche simple : envoyer chaque ligne séparément

        # Ouvrir le fichier
        open_cmd = f"with open('{remote_path}', 'w') as f:"
        response = send_command(ser, open_cmd, timeout=2.0)
        if 'Traceback' in response or 'SyntaxError' in response:
            print(f"Error opening file: {response[:200]}")
            return False

        time.sleep(0.1)

        # Écrire le contenu ligne par ligne
        for line in content.split('\n'):
            # Indenter chaque ligne pour le bloc with
            write_cmd = f"    f.write({repr(line + chr(10))})"
            response = send_command(ser, write_cmd, timeout=2.0)
            if 'Traceback' in response or 'SyntaxError' in response:
                print(f"Error writing line: {response[:200]}")
                return False
            time.sleep(0.05)

        # Fermer le fichier (envoyer une ligne vide)
        response = send_command(ser, '', timeout=1.0)
        time.sleep(0.2)

        print(f"OK: {remote_path} uploaded ({file_size} bytes)")
        return True

    except Exception as e:
        print(f"Error: {e}")
        return False


def reset_pico(ser) -> bool:
    """Reset le Pico et attendre le prompt REPL."""
    try:
        # Envoyer Ctrl+C pour interrompre
        ser.write(b'\x03')
        time.sleep(0.2)

        # Envoyer Ctrl+C à nouveau
        ser.write(b'\x03')
        time.sleep(0.5)

        # Attendre le prompt
        for _ in range(10):
            response = send_raw(ser, b'', timeout=0.2)
            if b'>>>' in response:
                return True
            time.sleep(0.1)

        return False

    except Exception as e:
        print(f"Reset error: {e}")
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
        print("ERROR: --files must be valid JSON")
        sys.exit(1)

    if not files:
        print("No files to upload")
        return

    # Ouvrir le port série
    try:
        ser = serial.Serial(args.port, args.baud, timeout=1)
        print(f"Connected to {args.port} (115200 baud)")
    except serial.SerialException as e:
        print(f"ERROR: Cannot connect to {args.port}: {e}")
        sys.exit(1)

    try:
        time.sleep(0.5)  # Attendre la stabilisation

        # Reset le Pico et attendre le REPL
        if not reset_pico(ser):
            print("WARNING: Could not sync with Pico REPL")

        uploaded = 0
        failed = 0

        for file_info in files:
            local_path = file_info['path']
            remote_name = file_info['name']

            # Envoyer main.py en premier, les autres après
            if not os.path.exists(local_path):
                print(f"ERROR: File not found: {local_path}")
                failed += 1
                continue

            if upload_file(ser, local_path, remote_name):
                uploaded += 1
            else:
                failed += 1

        print(f"\nSummary: {uploaded} file(s) uploaded, {failed} error(s)")

        if failed == 0:
            sys.exit(0)
        else:
            sys.exit(1)

    finally:
        ser.close()


if __name__ == '__main__':
    main()
