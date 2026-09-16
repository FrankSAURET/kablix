// Test analyseur logique : les pinces (SD1..SD4) sont POSEES sur des
// pastilles de la carte, il n'y a AUCUN fil a tirer vers elles.
// D8 bat vite, D9 bat deux fois moins vite : dans l'onglet de l'analyseur,
// deux creneaux decales, chacun de la couleur de sa pince sur la planche.
// RIEN A CLIQUER : au demarrage de la simulation, l'onglet de l'analyseur
// s'ouvre tout seul parce qu'il y a au moins une pince sur la planche.
//   SD1 (D8)  : cas normal, nommee « horloge » ;
//   SD2 (D9)  : voie suivante, sans etiquette (elle s'appellera « 9 ») ;
//   SD3 (GND) : broche d'alimentation, l'analyseur explique qu'il n'y a
//               aucun front a montrer ;
//   SD4 (A0)  : broche analogique lisible en numerique — tracee, mais
//               signalee : on ne verra que 0 ou 1, pas la tension.
void setup() {
  pinMode(8, OUTPUT);
  pinMode(9, OUTPUT);
  pinMode(A0, INPUT);
}

void loop() {
  // D8 : un cycle complet par tour de boucle.
  digitalWrite(8, HIGH);
  delayMicroseconds(200);
  digitalWrite(8, LOW);
  delayMicroseconds(200);
  // D9 : un tour sur deux, donc deux fois plus lent que D8.
  static bool lent = false;
  lent = !lent;
  digitalWrite(9, lent ? HIGH : LOW);
}
