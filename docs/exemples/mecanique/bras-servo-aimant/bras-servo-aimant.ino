// Démonstrateur de la vue 3D : bras servo + aimant.
// Ouvrir la vue 3D (bouton « 3D ») puis lancer la simulation : le palonnier
// tourne avec le servo et emporte l'aimant. Le capteur à effet Hall, posé en
// face de la position 90 degrés, ne voit l'aimant qu'à 90 degrés.
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
