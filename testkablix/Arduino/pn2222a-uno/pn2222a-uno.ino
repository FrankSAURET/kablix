// Test transistor PN2222A : le meme ventilateur 5 V / 120 mA sur les deux
// branches, commande par la broche 9 (base via 1 kOhm) et par la broche 10
// (base via 10 kOhm). Le transistor ne transmet que Gain x Ib :
//   broche 9  : Ib = (5 - 0,7) / 1000  = 4,3 mA  -> Ic max = 35 x 4,3  = 150 mA
//   broche 10 : Ib = (5 - 0,7) / 10000 = 0,43 mA -> Ic max = 35 x 0,43 = 15 mA
// Le premier ventilateur tourne, le second ne demarre JAMAIS : on vise la
// SATURATION, sinon le montage aval ne marche pas.
const int SATURE = 9;
const int PAS_SATURE = 10;

void setup() {
  Serial.begin(115200);
  pinMode(SATURE, OUTPUT);
  pinMode(PAS_SATURE, OUTPUT);
  Serial.println("Broche 10 : base sous-attaquee, son ventilateur ne tournera pas.");
}

void loop() {
  digitalWrite(SATURE, HIGH);
  digitalWrite(PAS_SATURE, HIGH);
  delay(2000);
  digitalWrite(SATURE, LOW);
  digitalWrite(PAS_SATURE, LOW);
  delay(1000);
}
