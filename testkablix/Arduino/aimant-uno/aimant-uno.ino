// Test aimant (Beta) : l'aimant est fixe sur le palonnier du servo.
// Le servo balaie 0, 90 puis 180 degres ; le capteur a effet Hall, pose en
// face de la position 90 degres, ne doit voir l'aimant qu'a 90 degres.
#include <Servo.h>

const int HALL = 2;
Servo servo;

void mesure(int angle) {
  servo.write(angle);
  delay(1000);
  bool aimant = digitalRead(HALL) == LOW;  // sortie active basse
  digitalWrite(LED_BUILTIN, aimant ? HIGH : LOW);
  Serial.print(angle);
  Serial.println(aimant ? " degres : AIMANT" : " degres : rien");
}

void setup() {
  pinMode(HALL, INPUT);
  pinMode(LED_BUILTIN, OUTPUT);
  servo.attach(9);
  Serial.begin(115200);
}

void loop() {
  mesure(0);
  mesure(90);
  mesure(180);
}
