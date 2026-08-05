// Test transistor NPN generique (prototype de l'editeur de composant) :
// commande cote BAS. La LED est cablee au 5 V par sa resistance, le transistor
// ferme le circuit vers la masse quand la broche 7 passe au niveau haut.
// Les pattes du prototype sont numerotees : ici la base est sur la patte 1, le
// collecteur sur la 2 et l'emetteur sur la 3 (proprietes b / c / e).
const int COMMANDE = 7;

void setup() {
  pinMode(COMMANDE, OUTPUT);
}

void loop() {
  digitalWrite(COMMANDE, HIGH);   // transistor sature : LED allumee
  delay(800);
  digitalWrite(COMMANDE, LOW);    // transistor bloque : LED eteinte
  delay(800);
}
