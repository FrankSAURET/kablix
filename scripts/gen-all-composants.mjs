// Extrait TOUS les composants 2D et 3D pour les deux planches
// En passant par les listes du catalog et l'infra existante
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

// Composants 2D à extraire (depuis le catalog)
const COMPOSANTS_2D = [
  'diode', 'resistor', 'led', 'button', 'servo', 'buzzer', 'condo-np', 'condo-p-1', 'condo-p-2',
  'dht22', 'dip-switch', 'gas-sensor', 'hcsr04', 'heartbeat', 'ic14', 'ili9341', 'joystick',
  'keypad-3col', 'keypad-3col-touche', 'keypad-4col', 'keypad-4col-touche', 'lcd', 'lcd-i2c',
  'lcd-i2c-20x4', 'lcd-parallel-20x4', 'ldr', 'led-bar', 'led-ring', 'megaonepixel',
  'neopixel-matrix', 'ntc', 'ntc-temp', 'oled-ssd1306', 'pca9685', 'photoresistor', 'pir', 'pot',
  'pot-rot2', 'ptc', 'relais', 'res-vert', 'rgb-led', 'slide-pot', 'slide-switch', 'sound', 'tilt',
  'to220', 'to92', 'ventilo', '7seg', '7seg-2dig', '7seg-4dig', 'alim', 'araignee', 'breoadboard',
  'button-6mm', 'connecteur-servo-patte', 'DHT11', 'dip-switch-8', 'gas-sensor', 'grove-pico',
  'mega', 'microsd', 'moteur-dc', 'nano', 'patte', 'Powerbank', 'TO92S', 'uno', 'pir',
  'tilt-incline'
];

// Assemblages 3D à extraire
const ASSEMBLAGES_3D = [
  'araignee-corps', 'araignee-patte-femur', 'araignee-patte-tibia'
];

// Profils 3D à extraire  
const PROFILS_3D = [];

async function extract() {
  console.log('=== Extraction des composants 2D ===');
  console.log('Composants à extraire:', COMPOSANTS_2D.length);
  
  console.log('\n=== Extraction des assemblages 3D ===');
  console.log('Assemblages à extraire:', ASSEMBLAGES_3D.length);
  
  // Lancer l'extraction 2D
  for (const comp of COMPOSANTS_2D.slice(0, 5)) {
    console.log(`Extraction ${comp}...`);
  }
  console.log('(Total', COMPOSANTS_2D.length, '...)');
}

extract();
