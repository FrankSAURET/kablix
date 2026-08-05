// Test du composant « Transistor » : un seul item de bibliotheque, le modele
// se choisit dans les proprietes. Ici cinq references du selecteur, une par
// famille. Les deux premieres commandent le MEME ventilateur 5 V / 60 mA a
// travers la MEME resistance de base 10 kOhm.
//   broche 9  : BC547  (NPN, gain 200)        -> Ic max = 200 x 0,43 mA = 86 mA
//   broche 10 : 2N3904 (NPN, gain 100)        -> Ic max = 100 x 0,43 mA = 43 mA
//   broche 11 : BC557  (PNP, gain 200)        -> LED cote HAUT, logique INVERSEE
//   broche 6  : BC517  (darlington, β 30 000) -> base 100 kOhm et pourtant 1,08 A
//   broche 5  : BS170  (MOSFET canal N)       -> grille DIRECTE, sans resistance
// Le premier ventilateur tourne, le second ne demarre JAMAIS : a montage egal,
// c'est le gain qui decide. Le troisieme tourne avec DIX FOIS moins de courant
// de base : c'est tout l'interet du darlington.
//
// Les transistors n'ont PAS le meme brochage (BC547 et BC557 = C-B-E, 2N3904 =
// E-B-C), et pourtant les fils sont identiques : les broches gardent toujours
// les noms E, B et C, seule la patte qui les porte change. Le MOSFET, lui,
// porte G, D et S : il se commande en TENSION, sa grille ne consomme rien.
const int FORT = 9;
const int FAIBLE = 10;
const int INVERSE = 11;   // PNP : conduit quand la broche est a LOW
const int DARLINGTON = 6; // base 100 kOhm : un NPN ordinaire ne suivrait pas
const int GRILLE = 5;     // MOSFET : commande en tension, sans resistance

void setup() {
  Serial.begin(115200);
  pinMode(FORT, OUTPUT);
  pinMode(FAIBLE, OUTPUT);
  pinMode(INVERSE, OUTPUT);
  pinMode(DARLINGTON, OUTPUT);
  pinMode(GRILLE, OUTPUT);
  Serial.println("Broche 10 : gain deux fois plus faible, son ventilateur ne tournera pas.");
  Serial.println("Broche 11 : PNP, sa LED s'allume quand les ventilateurs sont commandes.");
  Serial.println("Broche 6 : darlington, base 100 kOhm, son ventilateur tourne quand meme.");
}

void loop() {
  digitalWrite(FORT, HIGH);
  digitalWrite(FAIBLE, HIGH);
  digitalWrite(INVERSE, LOW);    // base tiree en bas : PNP sature, LED allumee
  digitalWrite(DARLINGTON, HIGH);
  digitalWrite(GRILLE, HIGH);    // canal ouvert : LED verte allumee
  delay(2000);
  digitalWrite(FORT, LOW);
  digitalWrite(FAIBLE, LOW);
  digitalWrite(INVERSE, HIGH);   // base au 5 V : PNP bloque, LED eteinte
  digitalWrite(DARLINGTON, LOW);
  digitalWrite(GRILLE, LOW);
  delay(1000);
}
