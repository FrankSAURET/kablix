/*
 _______       _            _     _          ______        _                 _ 
(_______)     (_)       _  (_)   | |        (____  \      (_)               | |
 _______  ____ _  ___ _| |_ _  __| |_____    ____)  ) ____ _ _____ ____   __| |
|  ___  |/ ___) |/___|_   _) |/ _  | ___ |  |  __  ( / ___) (____ |  _ \ / _  |
| |   | | |   | |___ | | |_| ( (_| | ____|  | |__)  ) |   | / ___ | | | ( (_| |
|_|   |_|_|   |_(___/   \__)_|\____|_____)  |______/|_|   |_\_____|_| |_|\____|
    
Auteur: Frank SAURET(frank.sauret.prof@gmail.com) 
rv.ino(Ɔ) 2026
Description : Saisissez la description puis « Tab »
Créé le :  samedi 18 juillet 2026 à 10:58:00 
Dernière modification : 
*/

const uint8_t PIN_LDR = A0;
const uint8_t PIN_CTP = A1;
const uint8_t PIN_CTN = A2;

void setup() {
	Serial.begin(115200);
}

void loop() {
	int valeurLdr = analogRead(PIN_LDR);
	int valeurCtp = analogRead(PIN_CTP);
	int valeurCtn = analogRead(PIN_CTN);

	Serial.print("LDR A0 = ");
	Serial.print(valeurLdr);
	Serial.print(" | CTP A1 = ");
	Serial.print(valeurCtp);
	Serial.print(" | CTN A2 = ");
	Serial.println(valeurCtn);

	delay(300);
}

