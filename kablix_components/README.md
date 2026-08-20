# Composants Kablix

Bibliothèque publique de composants Kablix au format **.kompix**.

## Format .kompix

Fichier ZIP contenant :
- `manifest.json` : métadonnées du composant
- `schema.svg` : dessin externe et optionnel schéma interne
- `thumbnail.webp` : miniature optionnelle
- `behavior.mjs` : code de simulation optionnel
- `help/<lang>.md` : fiche d'aide du composant, ouverte par le bouton **Aide du
  composant** du volet des propriétés (ses illustrations sont posées à côté)

Voir [kompix_specification.md](../docs/kompix_specification.md) pour les détails.

## Composants disponibles

| Type | Label | Version | Catégorie | Description |
|------|-------|---------|-----------|-------------|
| `dmx-grove` | Grove DMX512 | 1.0.0 | Misc | Grove DMX512 shield (SP3485 line driver): turns th |
| `spot` | DMX PAR 38 spotlight | 1.1.0 | Systems | PAR 38 LED spotlight driven over DMX512 (Contest): |

## Utilisation

1. Ouvrir un schéma dans Kablix
2. Clic sur **⚙ Gérer les composants** dans la palette
3. Sélectionner les composants et clic sur **Télécharger**

## Contribution

Pour proposer un composant :
1. Créer un dossier local `kablix_components/`
2. Concevoir le composant avec Kablix (bouton **+ Créer un composant**)
3. Exporter en **⇩** (fichier .kompix)
4. Proposer une pull request sur le dépôt

---

Généré le 20/08/2026 18:30:12 — Kablix v2026.8.93
