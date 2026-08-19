// Test DMX512 : la carte Grove-DMX512 transforme l'UART matériel en ligne
// DMX, le projecteur PAR 38 prend la couleur envoyée sur ses trois canaux.
// Adresse du projecteur : 1 → canal 1 = rouge, 2 = vert, 3 = bleu.
#define ADRESSE 1
#define CANAUX 512
#define BROCHE_TX 1

// Octet de départ (0 = éclairage) puis les 512 canaux.
uint8_t trame[CANAUX + 1];

// Une trame DMX ne commence pas par un octet : le récepteur attend d'abord un
// BREAK (ligne au repos bas, au moins 88 us) puis un MAB (marque, au moins
// 8 us). L'UART ne sait pas les produire — on le coupe le temps de tenir la
// broche TX à la main, puis on le relance pour envoyer la trame.
void envoyer() {
  Serial.flush();
  Serial.end();
  pinMode(BROCHE_TX, OUTPUT);
  digitalWrite(BROCHE_TX, LOW);
  delayMicroseconds(120);   // BREAK
  digitalWrite(BROCHE_TX, HIGH);
  delayMicroseconds(12);    // MAB
  Serial.begin(250000, SERIAL_8N2);   // 250 kbauds, 8 bits, 2 stops : DMX512
  Serial.write(trame, sizeof(trame));
}

void setup() {
  Serial.begin(250000, SERIAL_8N2);
  memset(trame, 0, sizeof(trame));
}

void loop() {
  static const uint8_t COULEURS[3][3] = {{255, 0, 0}, {0, 255, 0}, {0, 0, 255}};
  for (uint8_t i = 0; i < 3; i++) {
    trame[ADRESSE] = COULEURS[i][0];
    trame[ADRESSE + 1] = COULEURS[i][1];
    trame[ADRESSE + 2] = COULEURS[i][2];
    envoyer();
    delay(1000);
  }
}
