// Cartes filles (« shields ») décrites par LEUR MANIFESTE et non par du code.
//
// Le Grove Shield (Pico) est un composant natif : sa géométrie et ses pistes
// sont écrites en dur dans `grove-shield.mts`. Le Grove Shield (Uno), lui, vient
// de la bibliothèque `kablix_components/` : son paquet .kompix porte un bloc
// `shield` qui dit tout ce que Kablix doit savoir —
//   - `host`   : le genre de carte sur laquelle il s'emboîte (`mcu`) ; absent,
//                c'est LUI qui reçoit une carte (cas du shield Pico) ;
//   - `socket` : ses pastilles mâles, les seules qui entrent dans la carte hôte
//                (les prises Grove sont femelles : rien ne s'y enfiche) ;
//   - `strips` : les pistes internes — quelles pattes sont un seul et même fil ;
//   - `switch` : l'interrupteur du dessin, qui choisit le rail branché sur les
//                VCC des prises Grove.
// Le format est générique : un autre shield n'aura besoin d'aucune ligne de code.

/** Une position de l'interrupteur : le rail qu'elle branche, et le décalage du bouton. */
export interface ShieldSwitchOption {
  value: string;
  label: string;
  /** Nom de la patte d'alimentation reliée aux VCC dans cette position. */
  rail: string;
  /** Déplacement horizontal du bouton dans le dessin (px du dessin). */
  dx: number;
}

export interface ShieldSwitch {
  /** Attribut du composant qui garde la position (ex. `pwr`). */
  attr: string;
  /** Id du groupe SVG déplacé (le bouton lui-même). */
  knob: string;
  /** Bulle d'aide de la zone cliquable. */
  title?: string;
  /** Zone cliquable dans le repère du dessin. */
  zone: { x: number; y: number; w: number; h: number };
  /** Les pattes commutées (les VCC des prises). */
  pins: string[];
  options: ShieldSwitchOption[];
}

export interface ShieldSpec {
  host?: string;
  socket: string[];
  strips: string[][];
  switch?: ShieldSwitch;
}

/** La position courante de l'interrupteur (repli : la première déclarée). */
export function shieldOption(sw: ShieldSwitch, attrs?: Record<string, string>): ShieldSwitchOption {
  const v = attrs?.[sw.attr];
  return sw.options.find((o) => o.value === v) ?? sw.options[0];
}

/**
 * Pistes internes de la carte, interrupteur compris : le rail choisi rejoint
 * les VCC des prises. C'est la liste que la netlist fusionne (voir model.mts).
 */
export function shieldStrips(spec: ShieldSpec, attrs?: Record<string, string>): string[][] {
  const strips = spec.strips.map((s) => [...s]);
  if (spec.switch) strips.push([shieldOption(spec.switch, attrs).rail, ...spec.switch.pins]);
  return strips;
}

/**
 * À quelle broche de la carte hôte aboutit le signal d'une prise ? « UART.TX »
 * du shield Uno part sur la patte « 1 » de la carte : c'est ELLE qu'il faut
 * écrire dans le programme, la bulle de l'éditeur l'ajoute donc au nom affiché.
 * Rien à ajouter quand le nom du signal dit déjà où il va — « A0.A0 » part bien
 * sur A0, « D4.D5 » sur la patte 5 — ni pour les alimentations, qui ne mènent à
 * aucune entrée-sortie.
 */
export function shieldSignalTarget(spec: ShieldSpec, pinName: string): string | undefined {
  const court = pinName.slice(pinName.lastIndexOf('.') + 1);
  if (court === 'GND' || court === 'VCC') return undefined;
  const socket = new Set(spec.socket);
  if (socket.has(pinName)) return undefined;
  for (const strip of spec.strips) {
    if (!strip.includes(pinName)) continue;
    const cible = strip.find((n) => socket.has(n));
    if (!cible || cible === court || `D${cible}` === court) return undefined;
    return cible;
  }
  return undefined;
}
