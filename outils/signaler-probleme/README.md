# Réception des rapports « Signaler un problème »

Le script [Code.gs](Code.gs) reçoit les rapports postés par Kablix et les renvoie par mail, zip en pièce jointe, au compte Google qui l'a déployé. Aucune adresse n'apparaît dans l'extension.

## Mise en place (une fois)

1. Ouvrir https://script.google.com avec le compte qui doit recevoir les rapports, puis « Nouveau projet ». Le nommer « Kablix — rapports ».
2. Remplacer le contenu de `Code.gs` par celui de ce dossier, puis enregistrer.
3. « Déployer » → « Nouveau déploiement » → type « Application Web ». Exécuter en tant que : **moi**. Qui a accès : **tout le monde**. Valider, puis accepter les autorisations demandées (envoi de mail en votre nom).
4. Copier l'URL de l'application Web (`https://script.google.com/macros/s/…/exec`). Ouverte dans un navigateur, elle doit afficher « Kablix : prêt ».
5. Coller cette URL dans la constante `URL_RAPPORT` de [src/signaler.ts](../../src/signaler.ts), puis reconstruire l'extension.

## Mise à jour du script

Modifier le code ne suffit pas : « Déployer » → « Gérer les déploiements » → crayon → version « Nouvelle version ». L'URL reste la même.

## Limites

Gmail gratuit : 100 mails par jour envoyés par un script, pièce jointe de 25 Mo au plus. Le script refuse au-delà de 18 Mo de zip et de 30 rapports par heure.
