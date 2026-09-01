import { lireKompix } from './_lire-kompix.mjs';
const p = await lireKompix('grove-rfid');
console.log(JSON.stringify(p.rfid, null, 2));
console.log('--- clés paquet:', Object.keys(p).join(' '));
