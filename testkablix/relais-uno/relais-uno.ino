// Test relais OMRON G5V. Quatre cablages sur la meme carte :
//   Rl1 : CORRECT — bobine commandee par un PN2222A sature (base via 1 kOhm),
//         diode de roue libre entre B1 et B2, cathode vers le +. Il colle et
//         allume la LED cablee sur son contact de travail (NO).
//   Rl2 : bobine sur la broche 7 SANS diode de roue libre -> interdit.
//   Rl3 : diode montee a l'envers (anode vers le +) -> interdit aussi.
//   Rl4 : relais 12 V alimente en 5 V -> tension de commande insuffisante.
// Une bobine est une self : a la coupure elle renvoie une surtension qui detruit le transistor de commande. La diode de roue libre l'absorbe — elle n'est pas facultative.
const int COMMANDE = 8;          // Rl1, via le transistor
const int SANS_DIODE = 7;        // Rl2
const int DIODE_INVERSEE = 4;    // Rl3

void setup() {
  Serial.begin(115200);
  pinMode(COMMANDE, OUTPUT);
  pinMode(SANS_DIODE, OUTPUT);
  pinMode(DIODE_INVERSEE, OUTPUT);
}

void loop() {
  digitalWrite(COMMANDE, HIGH);
  digitalWrite(SANS_DIODE, HIGH);
  digitalWrite(DIODE_INVERSEE, HIGH);
  Serial.println("Seul Rl1 colle : les autres sont mal cables.");
  delay(1500);
  digitalWrite(COMMANDE, LOW);
  digitalWrite(SANS_DIODE, LOW);
  digitalWrite(DIODE_INVERSEE, LOW);
  delay(1500);
}
