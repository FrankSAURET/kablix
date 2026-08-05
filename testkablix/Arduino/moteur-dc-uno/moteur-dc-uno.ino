// Test moteur a courant continu. Trois moteurs 5 V / 100 mA :
//   - broche 9  : commande par un PN2222A, alimentation de laboratoire et diode
//     de roue libre en travers du moteur -> il tourne, tout est correct ;
//   - broche 11 : moteur branche EN DIRECT sur la broche. Une sortie Arduino ne
//     debite que 40 mA contre les 100 mA demandes : il ne demarre JAMAIS ;
//   - broche 10 : meme montage que le premier mais SANS diode de roue libre.
//     Un moteur est une bobine : couper son courant renvoie une surtension qui
//     detruit le transistor. Kablix le fait exploser.
const int BON = 9;
const int SANS_DIODE = 10;
const int EN_DIRECT = 11;

void setup() {
  Serial.begin(115200);
  pinMode(BON, OUTPUT);
  pinMode(SANS_DIODE, OUTPUT);
  pinMode(EN_DIRECT, OUTPUT);
  Serial.println("Broche 11 : moteur en direct, courant insuffisant.");
  Serial.println("Broche 10 : pas de diode de roue libre, le transistor va lacher.");
}

void loop() {
  // Montee et descente en PWM : la vitesse suit le rapport cyclique.
  for (int v = 0; v <= 255; v += 5) {
    analogWrite(BON, v);
    analogWrite(EN_DIRECT, v);
    delay(40);
  }
  for (int v = 255; v >= 0; v -= 5) {
    analogWrite(BON, v);
    analogWrite(EN_DIRECT, v);
    delay(40);
  }
  // Tout ou rien sur la branche sans diode : c'est la COUPURE qui tue.
  digitalWrite(SANS_DIODE, HIGH);
  delay(1000);
  digitalWrite(SANS_DIODE, LOW);
  delay(1000);
}
