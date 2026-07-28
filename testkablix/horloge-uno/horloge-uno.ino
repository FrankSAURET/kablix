// Horloge 4 chiffres 7 segments (cathode commune), version Arduino Uno.
// Equivalent exact de testkablix/Horloge.py (Pico).
//
// Segments a..g : D2..D8
// Chiffres 1..4 : D10..D13
// Les 2 points du milieu (DP) sont cables en dur au 3,3 V a travers une
// resistance : ils restent allumes en permanence, comme sur une vraie horloge.

const uint8_t SEG_PINS[7] = { 2, 3, 4, 5, 6, 7, 8 };   // a, b, c, d, e, f, g
const uint8_t DIGIT_PINS[4] = { 10, 11, 12, 13 };      // chiffre 1..4

// Cathode commune : segment allume a 1, chiffre actif a 0.
const uint8_t SEG_ON = HIGH;
const uint8_t SEG_OFF = LOW;
const uint8_t DIGIT_ON = LOW;
const uint8_t DIGIT_OFF = HIGH;

// Encodage des chiffres (bit0 = a … bit6 = g).
const uint8_t CHIFFRES[10] = {
	0x3F, // 0
	0x06, // 1
	0x5B, // 2
	0x4F, // 3
	0x66, // 4
	0x6D, // 5
	0x7D, // 6
	0x07, // 7
	0x7F, // 8
	0x6F, // 9
};

int heures = 12;
int minutes = 0;
int secondes = 0;
unsigned long t0 = 0;

void eteindreTousLesChiffres() {
	for (uint8_t i = 0; i < 4; i++) digitalWrite(DIGIT_PINS[i], DIGIT_OFF);
}

void afficherMotif(uint8_t motif) {
	for (uint8_t i = 0; i < 7; i++) {
		digitalWrite(SEG_PINS[i], ((motif >> i) & 1) ? SEG_ON : SEG_OFF);
	}
}

void afficherUnChiffre(uint8_t index, uint8_t valeur) {
	eteindreTousLesChiffres();
	afficherMotif(CHIFFRES[valeur]);
	digitalWrite(DIGIT_PINS[index], DIGIT_ON);
	delay(2);
	digitalWrite(DIGIT_PINS[index], DIGIT_OFF);
}

void rafraichirAffichage(int h, int m) {
	afficherUnChiffre(0, h / 10);
	afficherUnChiffre(1, h % 10);
	afficherUnChiffre(2, m / 10);
	afficherUnChiffre(3, m % 10);
}

void setup() {
	for (uint8_t i = 0; i < 7; i++) pinMode(SEG_PINS[i], OUTPUT);
	for (uint8_t i = 0; i < 4; i++) pinMode(DIGIT_PINS[i], OUTPUT);
	eteindreTousLesChiffres();
	t0 = millis();
}

void loop() {
	// Multiplexage permanent : un chiffre a la fois, ~2 ms chacun.
	rafraichirAffichage(heures, minutes);

	// Avance de l'heure chaque seconde.
	if (millis() - t0 >= 1000) {
		t0 += 1000;
		if (++secondes >= 60) {
			secondes = 0;
			if (++minutes >= 60) {
				minutes = 0;
				heures = (heures + 1) % 24;
			}
		}
	}
}
