// Test HC-SR04 (ultrason) : impulsion TRIG puis mesure d'ECHO (~58 µs/cm).
const int TRIG = 2, ECHO = 3;

void setup() {
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  Serial.begin(115200);
}

void loop() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long duree = pulseIn(ECHO, HIGH, 30000UL);
  Serial.print("distance = ");
  Serial.print(duree / 58);
  Serial.println(" cm");
  delay(400);
}
