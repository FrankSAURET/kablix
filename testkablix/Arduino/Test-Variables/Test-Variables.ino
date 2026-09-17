// Test d'affichage du panneau Variables : tableau, structure, chaîne, pointeur.
// ATTENTION : chaque variable doit être UTILISÉE dans loop(). Arduino compile
// avec --gc-sections : une globale que le programme ne touche jamais est
// supprimée par l'éditeur de liens et n'a plus d'adresse à afficher.
int notes[5] = {1, 2, 3, 4, 5};
struct Point
{
    int x;
    int y;
};
struct Point p1 = {3, 7};
char nom[6] = "salut";
int *ptr = &notes[1];

void setup() {}
void loop()
{
    notes[0]++;
    p1.x++;
    p1.y += 2;
    nom[0] = (nom[0] == 's') ? 'S' : 's';
    ptr = &notes[p1.y % 5];
    delay(100);
}
