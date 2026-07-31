// Test transistor PNP generique (prototype de l'editeur de composant) :
// commande cote HAUT. L'emetteur est au 5 V, la LED pend sous le collecteur.
// Un PNP conduit quand sa base est TIREE VERS LE BAS : la LED s'allume quand la
// broche 8 est a LOW et s'eteint quand elle passe a HIGH — logique inversee.
const int COMMANDE = 8;

void setup() {
  pinMode(COMMANDE, OUTPUT);
  digitalWrite(COMMANDE, LOW);    // au repos : base tiree en bas, LED allumee
}

void loop() {
  digitalWrite(COMMANDE, LOW);    // transistor sature : LED allumee
  delay(800);
  digitalWrite(COMMANDE, HIGH);   // base au +5 V : transistor bloque
  delay(800);
}
