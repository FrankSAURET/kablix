// Test clavier matriciel 4x4 : affiche la touche pressée.
#include <Keypad.h>

const byte LIGNES = 4, COLONNES = 4;
char touches[LIGNES][COLONNES] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'},
};
byte brochesLignes[LIGNES] = {2, 3, 4, 5};
byte brochesColonnes[COLONNES] = {6, 7, 8, 9};
Keypad clavier(makeKeymap(touches), brochesLignes, brochesColonnes, LIGNES, COLONNES);

void setup() {
  Serial.begin(115200);
}

void loop() {
  char touche = clavier.getKey();
  if (touche) {
    Serial.print("Touche : ");
    Serial.println(touche);
  }
}
