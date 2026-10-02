1. Analyseur logique :
1. 
1. Actuellement si pas de carte ou pas de code : pas de simulation. Change ça.
1. Pour le message battery short circuit : saute une ligne aprés sever burns.
    - Mets en valeur (gras et couleur) "Rules to folow with cells en batteries:" et cahnge le messahe pour "Règle à suivre impérativement quand on utilise des piles et des batteries"
1. sur les courbes de l'analyseur logique  : 
Un zoom trop serré ne laisse plus une zone muette :
1-Wire : 0xF0 SEARCH ROM se replie sur 0xF0, et la bulle de survol donne SEARCH ROM. E
I²C : adr 0x48 W se replie sur 0x48, et la bulle donne le texte entier.
Sans place même pour l'octet : la bulle donne le texte entier.
Autres protocoles : ils avaient déjà un repli. La bulle s'applique à tous.

Ca a disparu. Pas de bulle de survol.
1. Deux échecs existaient déjà avant ce lot dans verify-batterie : « APRÈS stopRun ». Je ne les ai pas touchés. Leur cause est probablement les fins de ligne CRLF, mais je ne l'ai pas vérifié.
Corrige ce pb.



