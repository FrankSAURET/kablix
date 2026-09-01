import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync('kablix_components/_sources.json', 'utf8'));
const liste = Array.isArray(j) ? j : (j.components ?? j.sources ?? Object.entries(j));
console.log('type racine:', Array.isArray(j) ? 'tableau' : 'objet', '| clés:', Array.isArray(j) ? '' : Object.keys(j).join(' '));
console.log(JSON.stringify(j, null, 2).slice(0, 3000));
