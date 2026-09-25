// Test UART : deux liaisons serie, ecoutees par l'analyseur logique.
// Les pinces (SD1, SD2) sont POSEES sur les broches d'emission, sans fil.
// RIEN A REGLER : le projet s'ouvre avec les deux decodages UART deja poses,
// les octets s'ecrivent sous les creneaux (cochez « Bits » dans le panneau P
// pour voir aussi chaque bit : start, 8 donnees poids faible d'abord, stop).
//   SD1 (D1) : TX de Serial, 9600 bauds 8N1 - aussi dans le moniteur serie ;
//   SD2 (D3) : TX d'une liaison logicielle, 4800 bauds 8N1 - deux fois plus
//              lente : chaque bit y dure 208 us au lieu de 104 us.
#include <SoftwareSerial.h>

SoftwareSerial ligne2(2, 3);  // RX = D2 (inutilisee), TX = D3

int compteur = 0;

void setup() {
  Serial.begin(9600);
  ligne2.begin(4800);
}

void loop() {
  compteur++;
  Serial.print("Bonjour ");
  Serial.println(compteur);
  ligne2.print("K");
  ligne2.println(compteur);
  delay(200);
}
