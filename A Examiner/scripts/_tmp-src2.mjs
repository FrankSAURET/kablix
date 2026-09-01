import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync('kablix_components/_sources.json', 'utf8'));
for (const c of j.components) {
  console.log((c.type + '                 ').slice(0, 22), (String(c.version) + '        ').slice(0, 12), c.experimental === true ? 'EXPERIMENTAL' : '');
}
