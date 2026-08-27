1. Pour la barrière le nom qui doit apparaitre sur les patte des composant ne doit pas mettre ce qui suit le point. VCC, GND, OUT et VCC, GND
1. Multimètre : 
    1. en simulation les fils passent derrière le multimètre ce qui ne doit pas.
    1. Si je met un signal pwm (exemple sur oscillo-pico) le multimètre devrait afficher la valeur moyenne et non une tension qui oscille de 0 à 1,63
1. Oscilloscope : 
    1. la visu ne se fait plus dans l'écran mais dans text-info. Les 3 valeurs empilées.
    1. Ajoute un petit curseur à gauche de l'écran pour stabiliser la courbe (déclenchement). Jai rajouté au dessin un trigger-button pour choisir entre front montant et descendant. Par défaut on est toujours sur front montant à 50% du signal. Le curseur latéral peut se bouger à la main. La zone de texte en bas rajoute l'info "dec : x,y V" tension  de déclenchement.
    1. en simulation les fils passent derrière l'oscillo ce qui ne doit pas.
1. Le curseur de simulation du dht 22 ne permet jamais d'avoir des nombres à virgule -> résolution 0,1
1. ili9341-pico2 est super rapide (génial) mais le temps affiché est bizarre 8% - 12% puis à la fin oacille entre 0 et 200% le même pour pico se stabilise à 116%
1. neoixel ne marche plus complètement, seule la première led cligont un coup bref en  rouge. Pareil pico et pico2. Uno ok.
1. neopixel-matrix ne marche plus complètement, seule la diagonale blanche est remplie. Pareil pico et pico2. Uno ne fait plus rien.
1. us-sensor ne marche ni sur pico  ni su pico2. Distance figée à 19,8 cm pareil pour us-uno.
1. Sur la grove uno on retrouve les même problème que sur la pca9685 ou la grove pico : Le routage auto des fils passe par dessus des broches alignées.
1. Capteur de luminosité grove. Le texte est top court et passe sur 2 lignes (lx à la ligne) à agrandir pour afficher 3 digit (0 à 999) et 3 lettres (klx ou Mlx ou lx par exemple)
1. Grove-RFID rien ne se passe ni uno ni pico programme immédiatement arrêté.
1. **La flèche du dessin est repérée par un id automatique d'Inkscape** -> renommée `Fleche-Tag`.