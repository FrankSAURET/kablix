# Test Wi-Fi complet : la carte se declare en POINT D'ACCES et sert une page
# web qui allume et eteint la LED. Un telephone ouvre l'adresse annoncee, appuie
# sur un bouton, la LED de GP15 obeit.
#
# En simulation, la puce Wi-Fi n'est pas emulee : Kablix tient la vraie prise TCP
# a la place de la carte, sur le reseau du PC. Le telephone reste donc sur le
# MEME reseau que le PC (au lieu de rejoindre le point d'acces de la carte) et
# ouvre l'adresse affichee au demarrage. Le programme, lui, est exactement celui
# qui tourne sur une vraie Pico W.
import network
import socket
import time
from machine import Pin

SSID = "Kablix-Pico"
MOT_DE_PASSE = "kablix2026"

led = Pin(15, Pin.OUT)
led.value(0)

# --- Point d'acces -----------------------------------------------------------
ap = network.WLAN(network.AP_IF)
ap.config(essid=SSID, password=MOT_DE_PASSE)
ap.active(True)
while not ap.active():
    time.sleep(0.5)
print("Point d'acces", SSID, "actif")
print("Adresse :", ap.ifconfig()[0])

# --- Serveur web -------------------------------------------------------------
ENTETE = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n"
PAGE = """<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LED du Pico W</title><style>
body{font-family:sans-serif;text-align:center;background:#111;color:#eee}
h1{font-size:1.4rem}
a{display:block;margin:1rem auto;padding:1rem;width:12rem;border-radius:1rem;
text-decoration:none;color:#fff;font-weight:bold}
.on{background:#2a7}.off{background:#a33}
</style></head><body><h1>LED : %s</h1>
<a class="on" href="/on">ALLUMER</a><a class="off" href="/off">ETEINDRE</a>
</body></html>
"""

adresse = socket.getaddrinfo("0.0.0.0", 80)[0][-1]
serveur = socket.socket()
serveur.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
serveur.bind(adresse)
serveur.listen(1)
print("Serveur en ecoute sur le port 80")

while True:
    client, _adr = serveur.accept()
    requete = client.recv(1024)
    if not requete:
        client.close()
        continue
    ligne = requete.split(b"\r\n")[0].decode()
    print("Requete :", ligne)
    # Le navigateur reclame une icone d'onglet : elle n'a pas a changer la LED.
    if "/favicon.ico" in ligne:
        client.send("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n")
        client.close()
        continue
    if "/on" in ligne:
        led.value(1)
    elif "/off" in ligne:
        led.value(0)
    etat = "ALLUMEE" if led.value() else "ETEINTE"
    client.send(ENTETE + PAGE % etat)
    client.close()
    print("LED", etat)
