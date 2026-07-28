// Test capteur ultrason HC-SR04 (Arduino Uno)
// TRIG -> D9, ECHO -> D10

const int TRIG_PIN = 10;
const int ECHO_PIN = 9;

void setup() {
	Serial.begin(9600);

	pinMode(TRIG_PIN, OUTPUT);
	pinMode(ECHO_PIN, INPUT);

	// Assure un niveau bas stable avant la premiere mesure.
	digitalWrite(TRIG_PIN, LOW);
	delay(100);
}

float readDistanceCm() {
	// Pulse de declenchement: 10 us minimum.
	digitalWrite(TRIG_PIN, LOW);
	delayMicroseconds(2);
	digitalWrite(TRIG_PIN, HIGH);
	delayMicroseconds(10);
	digitalWrite(TRIG_PIN, LOW);

	// Timeout a ~30 ms pour eviter le blocage si pas d'echo.
	unsigned long duration = pulseIn(ECHO_PIN, HIGH, 30000);
	if (duration == 0) {
		return -1.0;
	}

	// Conversion us -> cm (vitesse du son).
	return duration * 0.0343f / 2.0f;
}

void loop() {
	float distanceCm = readDistanceCm();

	if (distanceCm < 0) {
		Serial.println("Aucune mesure (timeout)");
	} else {
		Serial.print("Distance: ");
		Serial.print(distanceCm, 1);
		Serial.println(" cm");
	}

	delay(500);
}
