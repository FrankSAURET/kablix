/**
 * Fronts d'une ligne série, calculés depuis la trame — partagé par les deux
 * moteurs (Pico et Arduino).
 *
 * Pourquoi ce calcul existe : dans les deux émulateurs, l'UART matériel ne
 * pilote JAMAIS sa broche TX. L'octet écrit dans le registre de données part
 * directement au consommateur (moniteur série, décodeur DMX) et la broche ne
 * bouge pas d'un cheveu. Une pince d'analyseur posée dessus voyait donc une
 * ligne plate pendant que le projecteur DMX changeait sagement de couleur.
 *
 * On ne peut pas « émuler mieux » à moindre frais : l'émulateur n'a pas de
 * modèle de sérialiseur, et en fabriquer un ferait tourner le décalage bit à
 * bit à chaque cycle pour rien la plupart du temps. On fait comme pour la
 * salve du générateur BF (lot .93) : le signal est CONNU exactement, on le
 * rejoue depuis sa formule. Un octet à 250 kbauds, c'est un bit de départ,
 * ses bits de données du poids faible au poids fort, une parité éventuelle et
 * ses bits d'arrêt — tous de la même durée.
 *
 * Les temps rendus sont RELATIFS au début de la trame, en microsecondes ; c'est
 * l'appelant qui les date, puisque lui seul connaît l'heure simulée.
 */

/** Forme d'une trame série, telle que le périphérique la déclare. */
export interface TrameSerie {
  value: number;
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: 'none' | 'even' | 'odd';
}

/**
 * Fronts d'UNE trame, en microsecondes depuis son début, sous la forme attendue
 * par les journaux de l'analyseur : [instant, niveau, instant, niveau…].
 *
 * La ligne est au repos à l'état HAUT — c'est la convention série, et c'est
 * pour ça qu'un bit de départ est un front DESCENDANT. Seuls les CHANGEMENTS
 * sont émis : dix bits identiques ne font qu'un seul front, ce que verrait un
 * vrai analyseur.
 *
 * Le dernier front rendu est toujours le retour au repos, de sorte que deux
 * trames qui se suivent n'ont pas besoin de se connaître.
 */
export function frontsDeTrame(trame: TrameSerie): number[] {
  const baud = trame.baudRate > 0 ? trame.baudRate : 9600;
  const bitUs = 1_000_000 / baud;
  const bits: number[] = [0]; // bit de départ : la ligne descend
  for (let i = 0; i < trame.dataBits; i++) bits.push((trame.value >> i) & 1); // poids faible d'abord
  if (trame.parity !== 'none') {
    let uns = 0;
    for (let i = 0; i < trame.dataBits; i++) uns += (trame.value >> i) & 1;
    const pair = uns % 2 === 0;
    bits.push(trame.parity === 'even' ? (pair ? 0 : 1) : pair ? 1 : 0);
  }
  for (let i = 0; i < trame.stopBits; i++) bits.push(1); // arrêt : retour au repos

  const out: number[] = [];
  let niveau = 1; // repos
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === niveau) continue; // pas de changement : pas de front
    niveau = bits[i];
    out.push(i * bitUs, niveau);
  }
  // La trame doit se terminer au repos, même si le dernier bit émis était bas
  // (cas impossible avec un bit d'arrêt, mais `stopBits` vient d'un registre).
  if (niveau !== 1) out.push(bits.length * bitUs, 1);
  return out;
}

/** Durée d'une trame complète, en microsecondes (bit de départ compris). */
export function dureeTrameUs(trame: TrameSerie): number {
  const baud = trame.baudRate > 0 ? trame.baudRate : 9600;
  const n = 1 + trame.dataBits + (trame.parity === 'none' ? 0 : 1) + trame.stopBits;
  return (n * 1_000_000) / baud;
}

/**
 * Fronts d'un BREAK : la ligne est tenue BASSE plus longtemps qu'une trame
 * entière, puis relâchée. C'est le début de trame du DMX512. La norme
 * distingue l'émetteur — au moins 92 µs de bas, puis 12 µs de haut (la
 * « marque après break ») — du récepteur, qui accepte dès 88 et 8 µs. On émet
 * les minima de l'ÉMETTEUR quand le débit ne donne pas mieux : l'émulateur ne
 * date pas la pose et la levée du bit BRK séparément, seule la levée nous
 * parvient. Émettre 88 µs pile, c'était tomber sur le seuil du récepteur : à
 * l'heure absolue près, l'arrondi flottant le faisait passer dessous, et
 * l'analyseur lisait un octet mal cadré au lieu du BREAK (Frank, 25/09/2026).
 */
export function frontsDeBreak(baudRate: number): { fronts: number[]; dureeUs: number } {
  const baud = baudRate > 0 ? baudRate : 250_000;
  const basUs = Math.max(92, (1_000_000 / baud) * 12); // 12 temps-bit, minimum émetteur DMX
  return { fronts: [0, 0, basUs, 1], dureeUs: basUs + 12 };
}
