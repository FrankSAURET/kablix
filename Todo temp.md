
1. Si aucun port n'est sélectionné pour arduino, clique sur la flèche de téléversemment provoque 10 tentatives puis une erreur. il faut afficher qqc de plus visible pour forcer la sélection d'un port. Dis comment interompre les tentatives et comment et si c'est dans kablix ou dans vscode-arduino-ide quil faut modifier qqc. Si c'est dans kablix eu le fais sinon tu me fais un prompt pour l'autre extension
1. j"ai modifié dmx-pico tu repars de celui-ci maintenant
1. Analyseur logique :
    1. Rajoute des fleches (fleche avec trait vertical ⏮ ⏭) qui permettent de sauter d'une trame à l'autre en positionnant le début de la trame à gauche. Et du coup pour tous les protocoles, tu prévois un déclenchement sur début de trame comme pour le DMX
    1. dsb1820
        1. je ne comprends pas ce qu'affiche l'analyseur. Explique
    1. DMX 
         1. Trés bien les tensions affichées mais pour le sn 75176A VOH = 3,7 V et VOL = 1,1 V ce sont ces tensions que je veux sur DMx- et DMx+
         1. Quand j'utilise la librairie arduino dmx simple je vois parfaitement le décodage des valeurs par canal. Si je ne l'utilise pas (par exemple avec dmx-pico) je ne vois pas le bon décodage mais des pauses et cadrages. Une fois ça à marché mais je n'ai pas réussis à le reproduire.
        1. Les trais des marqueur M1 et M2 doivent être pointillés
        1. Maintenant si je déplace l'onglet ou que je change un eparamètre (pae exemple le déclenchement) la courbe est bien gardée mais pas le facteur de zoom
        1. 
1. Vérifie (rp2040js 1.3.4 → 1.4.0) et si nécessaire fais la mise à jour
1. 
