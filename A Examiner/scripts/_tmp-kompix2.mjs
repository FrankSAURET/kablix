import { lireKompix } from './_lire-kompix.mjs';
const p = await lireKompix('grove-rfid');
console.log('control =', JSON.stringify(p.control, null, 2));
console.log('toggles =', JSON.stringify(p.toggles, null, 2));
console.log('pins =', JSON.stringify(p.pins));
console.log('kind =', p.kind, ' category =', p.category);
