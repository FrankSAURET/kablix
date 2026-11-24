// Démonstrateur de la vue 3D : robot à deux roues.
// Ouvrir la vue 3D (bouton « 3D ») puis lancer la simulation : chaque moteur
// fait tourner sa roue et le châssis roule sur le sol.
// Moteur gauche (Act1) : broche 9 ; moteur droit (Act2) : broche 10. Chacun
// est commandé par un PN2222A, avec une diode de roue libre.
const GAUCHE = 9;
const DROITE = 10;

void roule(int g, int d, int ms) {
  analogWrite(GAUCHE, g);
  analogWrite(DROITE, d);
  delay(ms);
}

void setup() {
  pinMode(GAUCHE, OUTPUT);
  pinMode(DROITE, OUTPUT);
}

void loop() {
  roule(255, 255, 2000);  // tout droit
  roule(255, 0, 1000);    // virage : seule la roue gauche tourne
  roule(0, 0, 1000);      // arrêt
}
