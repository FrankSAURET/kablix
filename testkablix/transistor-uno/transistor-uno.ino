// Test du composant « Transistor » : un seul item de bibliotheque, le modele
// se choisit dans les proprietes. Ici deux references du selecteur commandent
// le MEME ventilateur 5 V / 60 mA a travers la MEME resistance de base 10 kOhm.
//   broche 9  : BC547  (gain 200) -> Ic max = 200 x 0,43 mA = 86 mA
//   broche 10 : 2N3904 (gain 100) -> Ic max = 100 x 0,43 mA = 43 mA
// Le premier ventilateur tourne, le second ne demarre JAMAIS : a montage egal,
// c'est le gain qui decide.
//
// Les deux transistors n'ont PAS le meme brochage (BC547 = C-B-E, 2N3904 =
// E-B-C), et pourtant les fils sont identiques : les broches gardent toujours
// les noms E, B et C, seule la patte qui les porte change.
const int FORT = 9;
const int FAIBLE = 10;

void setup() {
  Serial.begin(115200);
  pinMode(FORT, OUTPUT);
  pinMode(FAIBLE, OUTPUT);
  Serial.println("Broche 10 : gain deux fois plus faible, son ventilateur ne tournera pas.");
}

void loop() {
  digitalWrite(FORT, HIGH);
  digitalWrite(FAIBLE, HIGH);
  delay(2000);
  digitalWrite(FORT, LOW);
  digitalWrite(FAIBLE, LOW);
  delay(1000);
}
