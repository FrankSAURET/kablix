// Recale les sondes du schéma de test sonde-logique-pico : leur pastille doit
// RECOUVRIR la pastille qu'elles accrochent.
//
// Elles avaient été posées à des coordonnées écrites à la main (220,10 /
// 300,10 / 380,10), jamais calées : mesuré au lot .98, jusqu'à 171 px d'écart —
// dix-sept carreaux. Le modèle les résolvait quand même (l'attribut `accroche`
// ne regarde pas le dessin), d'où des pinces qui pendaient dans le vide tout en
// marchant : exactement ce que montre sonde-logic-pico.png.
//
// Trois broches VOISINES (10 px) pour des pinces de 80 px : elles se
// chevaucheraient toutes si elles partaient du même côté. On les tourne donc en
// éventail, comme des pinces empilées sur un connecteur.
//
// Écrit le .projix EN PLACE. On ne passe PAS par _generate.mjs : il écrase tout
// le schéma et effacerait les retouches de Frank (la LED, la résistance et la
// quatrième pince qu'il a déplacées à la main).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const root = fileURLToPath(new URL('..', import.meta.url));
const cible = join(root, 'testkablix', 'sonde-logique-pico.projix');
const zip = await JSZip.loadAsync(readFileSync(cible));
const diagram = JSON.parse(await zip.file('diagram.json').async('string'));

// Décalage pastille → origine de la sonde, par quart de tour (mesuré dans le
// vrai éditeur, scripts/_diag-broches-pico.mjs) :
//   0° (10,70) · 90° (10,10) · 180° (70,10) · 270° (70,70).
const DECAL = { 0: [10, 70], 90: [10, 10], 180: [70, 10], 270: [70, 70] };

// Broches visées, mesurées dans le vrai éditeur APRÈS chargement — l'éditeur
// recolle de lui-même les positions fractionnaires (la carte est enregistrée en
// 36,75 et se retrouve sur la grille). Le 0,02 px qui reste dans la mesure est
// un résidu sous-pixel du rendu, pas une position : on vise le croisement.
const CIBLES = {
	SD1: { x: 230, y: 130, rot: 180 }, // GP14, broche du bas : la pince vient d'en dessous
	SD2: { x: 240, y: 130, rot: 270 }, // GP15, voisine : tournée d'un quart pour ne pas la recouvrir
	// GND.4 est sur la rangée du HAUT : une pince à 0° pendrait 70 px plus haut,
	// donc hors planche (l'éditeur la ramène à y=0 et l'écart réapparaît).
	// Un quart de tour la fait partir vers le bas, sur la planche.
	SD3: { x: 220, y: 60, rot: 90 },
};

let bouge = 0;
for (const [id, c] of Object.entries(CIBLES)) {
	const s = diagram.parts.find((p) => p.id === id);
	if (!s) { console.log(id, 'absente'); continue; }
	const d = DECAL[c.rot];
	s.x = c.x - d[0];
	s.y = c.y - d[1];
	if (c.rot) s.rotation = c.rot; else delete s.rotation;
	bouge++;
	console.log(`${id} → (${s.x},${s.y}) rot=${c.rot}`);
}

// JSON COMPACT et zip DÉFLATÉ, comme l'écrit l'extension.
zip.file('diagram.json', JSON.stringify(diagram));
writeFileSync(cible, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log(bouge, 'sonde(s) recalée(s).');
