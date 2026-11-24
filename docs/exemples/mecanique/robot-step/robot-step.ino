// Démonstrateur de la vue 3D : montage importé d'un STEP.
// Le montage 3D vient de robot-mini.step (assemblage FreeCAD), importé par la
// commande « Importer un assemblage STEP… » de Kompix Editor. Les noms des
// pièces dans le STEP (servo:S1, aimant:A1, hall:U3) leur donnent leur rôle.
// Un STEP ne porte aucune liaison : le montage reste fixe dans la vue 3D. Le
// capteur U3 lit la distance de l'aimant A1 dans la scène.
#include <Servo.h>

const int HALL = 2;
Servo servo;

void setup() {
  pinMode(HALL, INPUT);
  pinMode(LED_BUILTIN, OUTPUT);
  servo.attach(9);
  Serial.begin(115200);
}

void loop() {
  bool aimant = digitalRead(HALL) == LOW;  // sortie active basse
  digitalWrite(LED_BUILTIN, aimant ? HIGH : LOW);
  Serial.println(aimant ? "AIMANT" : "rien");
  servo.write(aimant ? 0 : 180);
  delay(1000);
}
