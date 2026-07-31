// Test condensateur : circuit RC 10 kOhm + 10 uF (RC = 0,1 s) charge par la
// broche 8 et mesure sur A0. La tension atteint 63 % de 5 V au bout d'un RC et
// la charge est pleine a 5 RC (0,5 s) — de meme pour la decharge.
const int CHARGE = 8;
const int MESURE = A0;

void trace(const char *phase) {
  for (int i = 0; i < 12; i++) {
    delay(50);
    Serial.print(phase);
    Serial.print(" t=");
    Serial.print((i + 1) * 50);
    Serial.print(" ms  U=");
    Serial.print(analogRead(MESURE) * 5.0 / 1023.0, 2);
    Serial.println(" V");
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(CHARGE, OUTPUT);
}

void loop() {
  digitalWrite(CHARGE, HIGH);
  trace("charge  ");
  digitalWrite(CHARGE, LOW);
  trace("decharge");
}
