// Test oscilloscope : O1 (repere M1) regarde le milieu d'un pont diviseur
// D9 -> R1 1 kohm -> point A -> R2 1 kohm -> masse. D9 bascule toutes les
// 500 ms : l'ecran dessine un creneau entre 0 V et environ 2,5 V.
// Les deux boutons se tournent A LA SOURIS pendant la simulation :
//   Volts/Div (gauche) : hauteur d'un carreau, cinq crans avec butee ;
//   s/Div (droite)     : largeur d'un carreau, sans butee, un tour = x10.
// Depart : 1 V par carreau, 0,5 s par carreau -> une periode = deux carreaux.
void setup() {
  pinMode(9, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  digitalWrite(9, HIGH);
  Serial.println("D9 haut -> environ 2,5 V a l'ecran");
  delay(500);
  digitalWrite(9, LOW);
  Serial.println("D9 bas  -> retour a 0 V");
  delay(500);
}
