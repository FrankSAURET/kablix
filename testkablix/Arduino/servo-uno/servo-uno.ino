// Test servomoteur : le bras se positionne à 0°, 90° puis 180°.
#include <Servo.h>

Servo servo;

void setup() {
  servo.attach(9);
  Serial.begin(115200);
}

void loop() {
  servo.write(0);
  Serial.println("0 degres");
  delay(1000);
  servo.write(90);
  Serial.println("90 degres");
  delay(1000);
  servo.write(180);
  Serial.println("180 degres");
  delay(1000);
}
