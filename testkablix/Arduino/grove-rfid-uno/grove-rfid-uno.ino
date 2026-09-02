// Test lecteur RFID Grove 125 kHz : mode UART (cavalier à gauche).
// Le module envoie le numéro du badge en clair sur son fil Tx, à 9600 bauds,
// suivi d'un retour à la ligne, et le REDIT une fois par seconde tant que le
// badge reste dans la boucle. En simulation, la flèche du dessin fait entrer et
// sortir le badge ; le numéro envoyé s'affiche aussi dans la fenêtre du module.
#include <SoftwareSerial.h>

const int RFID_RX = 2;   // entrée : Tx du module
const int RFID_TX = 3;   // sortie inutilisée (le module n'écoute rien)

SoftwareSerial rfid(RFID_RX, RFID_TX);

char badge[16];
byte n = 0;
char c;

void setup(){
  Serial.begin(115200);
  rfid.begin(9600);
  Serial.println("Approchez un badge de la boucle.");
}

void loop() {
  while (rfid.available()) {
    c = rfid.read();
    if (c < ' ') {   // retour à la ligne : le numéro est complet
      if (n > 0) {
        badge[n] = 0;
        Serial.print("badge = ");
        Serial.println(badge);
        n = 0;
      }
    } else if (n < sizeof(badge) - 1) {
      badge[n++] = c;
    }
  }
}
