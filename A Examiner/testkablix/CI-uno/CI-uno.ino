// Test des DOUZE circuits integres logiques de la bibliotheque, en un seul
// montage. Tous sont des boitiers DIL-14 alimentes en 5 V : patte 14 (VDD ou
// VCC) au rail rouge, patte 7 (GND) a la masse noire.
//
// Les douze boitiers recoivent les MEMES deux entrees : D2 (A) et D3 (B). Les
// quatre portes d'un meme boitier (six pour les inverseurs) font la meme chose
// sur les memes entrees : elles sortent donc le meme niveau et se relient sans
// conflit sur UNE broche de lecture. Les 52 portes du montage sont ainsi
// toutes cablees, avec seulement quatorze broches.
//
//   D2 = A, D3 = B ; D4..D13, A0 et A1 : lecture des douze boitiers.
//
// Le programme balaye les quatre combinaisons A/B et compare chaque sortie a la
// table de verite : « OK » ou « ERREUR » sur le moniteur serie.
const int A_PIN = 2;
const int B_PIN = 3;
const int NB = 12;
// Fonction : 0 ET, 1 OU, 2 OU EXCLUSIF, 3 NON-ET, 4 NON-OU, 5 NON.
const char* NOMS[NB] = {
  "CD4081  ET        ", "CD4071  OU        ", "CD4070  OU EXCLUSIF",
  "CD4011  NON-ET    ", "CD4001  NON-OU    ", "CD40106 NON       ",
  "74HC08  ET        ", "74HC32  OU        ", "74HC86  OU EXCLUSIF",
  "74HC00  NON-ET    ", "74HC02  NON-OU    ", "74HC14  NON       ",
};
const int LECTURE[NB] = {4, 5, 6, 7, 8, 9, 10, 11, 12, 13, A0, A1};
const int FONCTION[NB] = {0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5};

int attendu(int fonction, int a, int b) {
  switch (fonction) {
    case 0: return a && b;
    case 1: return a || b;
    case 2: return a != b;
    case 3: return !(a && b);
    case 4: return !(a || b);
    default: return !a;   // l'inverseur ne regarde que l'entree A
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(A_PIN, OUTPUT);
  pinMode(B_PIN, OUTPUT);
  for (int i = 0; i < NB; i++) pinMode(LECTURE[i], INPUT);
  Serial.println("Portes logiques : A et B communes aux douze boitiers.");
}

void loop() {
  for (int combo = 0; combo < 4; combo++) {
    int a = combo & 1;
    int b = (combo >> 1) & 1;
    digitalWrite(A_PIN, a);
    digitalWrite(B_PIN, b);
    delay(200);   // laisse les sorties se propager
    Serial.print("A=");
    Serial.print(a);
    Serial.print("  B=");
    Serial.println(b);
    for (int i = 0; i < NB; i++) {
      int lu = digitalRead(LECTURE[i]);
      Serial.print("  ");
      Serial.print(NOMS[i]);
      Serial.print(" = ");
      Serial.print(lu);
      Serial.println(lu == attendu(FONCTION[i], a, b) ? "   OK" : "   ERREUR");
    }
    delay(800);
  }
}
