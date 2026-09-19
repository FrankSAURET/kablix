const BASE = (corps) => [
  'from machine import Pin', 'import onewire', 'import ds18x20', 'import time', '',
  'fil = onewire.OneWire(Pin(14))',
  'capteurs = ds18x20.DS18X20(fil)',
  'adresses = capteurs.scan()',
  "print('TROUVES', len(adresses))",
  ...corps,
  "print('KX_DONE')", '',
].join('\n');
const a = BASE([
  'for i in range(3):',
  '    capteurs.convert_temp()',
  '    time.sleep(0.8)',
  '    for a in adresses:',
  "        print('T', capteurs.read_temp(a))",
]);
const TETE = [
  'from machine import Pin', 'import onewire', 'import ds18x20', 'import time', '',
  'fil = onewire.OneWire(Pin(14))',
  'capteurs = ds18x20.DS18X20(fil)',
  'adresses = capteurs.scan()',
  "print('TROUVES', len(adresses))",
];
const BOUCLE_TRY = [
  'for i in range(3):', '    try:',
  '        capteurs.convert_temp()', '        time.sleep(0.8)',
  '        for a in adresses:', "            print('T', capteurs.read_temp(a))",
  '    except Exception as e:', "        print('RATEE', e)",
];
const b = [...TETE, ...BOUCLE_TRY, "print('KX_DONE')", ''].join('\n');
console.log('--- run3.officiel ---'); console.log(a);
console.log('--- run4.banc_sans_adresse ---'); console.log(b);
console.log('identiques ?', a === b);
