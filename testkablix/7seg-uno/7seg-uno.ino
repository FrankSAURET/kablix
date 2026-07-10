// Test afficheur 7 segments (cathode commune) : compte de 0 à 9.
// Segments A,B,C,D,E,F,G,DP sur D2..D9 ; commun COM sur GND.
const int SEGS[8] = {2, 3, 4, 5, 6, 7, 8, 9};
// Bits a..g (bit 0 = A, ... bit 6 = G) pour les chiffres 0..9.
const byte CHIFFRES[10] = {
  0b0111111, 0b0000110, 0b1011011, 0b1001111, 0b1100110,
  0b1101101, 0b1111101, 0b0000111, 0b1111111, 0b1101111,
};

void setup() {
  for (int i = 0; i < 8; i++) pinMode(SEGS[i], OUTPUT);
  Serial.begin(115200);
}

void loop() {
  for (int n = 0; n <= 9; n++) {
    for (int s = 0; s < 7; s++) digitalWrite(SEGS[s], (CHIFFRES[n] >> s) & 1);
    digitalWrite(SEGS[7], n % 2);   // point décimal sur les impairs
    Serial.println(n);
    delay(500);
  }
}
