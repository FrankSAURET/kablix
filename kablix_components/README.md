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

| | Type | Label | Version | Catégorie | Description |
|---|------|-------|---------|-----------|-------------|
| <img src="thumbnails/dmx-grove.webp" alt="Grove DMX512" width="64"> | `dmx-grove` | Grove DMX512 | 2026.8.1 | Misc | Grove DMX512 shield (SP3485 line driver): turns th |
| <img src="thumbnails/grove-light-sensor.webp" alt="Grove light sensor" width="64"> | `grove-light-sensor` | Grove light sensor | 2026.9.1 | Sensors | Grove ambient light sensor (LS06-S phototransistor |
| <img src="thumbnails/grove-rfid.webp" alt="Grove 125 kHz RFID reader" width="64"> | `grove-rfid` | Grove 125 kHz RFID reader | 2026.9.1 | Sensors | Grove 125 kHz RFID reader (EM4100 tags): while a t |
| <img src="thumbnails/grove-uno.webp" alt="Grove Shield (Uno)" width="64"> | `grove-uno` | Grove Shield (Uno) | 2026.9.1 | Boards | Grove Base Shield V2 for Arduino Uno: 16 Grove soc |
| <img src="thumbnails/ir-barrier.webp" alt="Through-beam IR barrier" width="64"> | `ir-barrier` | Through-beam IR barrier | 2026.9.0 | Sensors | Through-beam infrared barrier (emitter + receiver) |
| <img src="thumbnails/soil-moisture-sensor.webp" alt="Soil moisture sensor" width="64"> | `soil-moisture-sensor` | Soil moisture sensor | 2026.9.1 | Sensors | Resistive soil moisture probe (two prongs): wet so |
| <img src="thumbnails/spot.webp" alt="DMX PAR 38 spotlight" width="64"> | `spot` | DMX PAR 38 spotlight | 2026.8.1 | Systems | PAR 38 LED spotlight driven over DMX512 (Contest): |

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

Généré le 13/09/2026 18:10:39 — Kablix v2026.9.4
