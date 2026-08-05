// Trois circuits RC sur la MEME broche de commande. Seule la constante de
// temps RC change : 100 kOhm x 1 uF = 0,1 s (film), 33 kOhm x 10 uF = 0,33 s
// (tantale), 10 kOhm x 100 uF = 1 s (chimique). A un RC la tension a fait
// 63 % du chemin, a 5 RC la charge est pleine — d'ou les 5 s par phase.
//
// Le TRACEUR DE COURBES affiche les trois exponentielles SANS une seule ligne
// de code : la tension du condensateur est posee sur A0, A1 et A2, et toute
// tension posee sur une entree analogique est tracee par une sonde interne.
// Le moniteur serie ne sert ici qu'a relire les memes valeurs en clair.
const int CHARGE = 8;
const int MESURE[3] = { A0, A1, A2 };

void phase(int niveau, const char *nom) {
  digitalWrite(CHARGE, niveau);
  for (int i = 0; i < 10; i++) {   // 10 x 500 ms = 5 s = 5 RC du plus lent
    delay(500);
    Serial.print(nom);
    for (int c = 0; c < 3; c++) {
      Serial.print("   ");
      Serial.print(analogRead(MESURE[c]) * 5.0 / 1023.0, 2);
      Serial.print(" V");
    }
    Serial.println();
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(CHARGE, OUTPUT);
  Serial.println("          film(A0) tantale(A1) chimique(A2)");
}

void loop() {
  phase(HIGH, "charge  ");
  phase(LOW, "decharge");
}
