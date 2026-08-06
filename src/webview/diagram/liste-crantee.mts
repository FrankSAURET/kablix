// Calage d'une liste défilante sur ses entrées : UN cran de molette (ou UN clic
// de flèche d'ascenseur) = UNE entrée, et la séparation entre deux entrées reste
// TOUJOURS au ras du haut de la fenêtre (demande de Frank pour le sélecteur de
// transistor). Le défilement libre du navigateur avance d'une centaine de
// pixels, soit deux ou trois entrées à la fois, et coupe des lignes en deux —
// on perd celle qu'on suivait.
//
// Le code vit ici, et pas dans editor.mts, pour que le banc puisse l'éprouver
// dans un vrai navigateur avec de VRAIS clics de souris sur la barre
// (scripts/verify-ascenseur.mjs) : une copie du code dans le banc ne prouverait
// rien sur celui qui tourne chez l'utilisateur.
//
// Les entrées n'ont pas toutes la même hauteur (le modèle personnalisé porte une
// explication plus longue) : leur position est MESURÉE, jamais supposée.

/**
 * Installe le calage sur une liste défilante (`overflow-y: auto`).
 * Les entrées sont ses enfants directs.
 */
export function installerListeCrantee(list: HTMLElement): void {
  // L'index de l'entrée calée en haut est MÉMORISÉ. Le redéduire du défilement à
  // chaque cran faisait dériver l'alignement (« ça décale petit à petit ») : le
  // navigateur arrondit `scrollTop` après chaque bond, et l'écart s'accumulait
  // jusqu'à couper une ligne en deux — 0,5 px dès la cinquième entrée, mesuré en
  // navigateur.
  //
  // La FIN de la liste demande un cran de plus. Aligner une entrée en haut sature
  // avant le bas du contenu : la dernière entrée alignable laisse sous elle un
  // reste (jusqu'à une hauteur d'entrée) que rien ne pouvait plus montrer — les
  // dernières entrées restaient coupées et les crans suivants ne faisaient rien.
  // Un cran de plus colle donc au bas.
  let haut = 0; // index de l'entrée calée en haut de la fenêtre
  let pose = 0; // défilement que NOUS avons posé, pour repérer un autre geste
  let fond = false; // collé au bas : l'entrée du haut n'est plus au ras

  list.addEventListener('wheel', (ev: WheelEvent) => {
    if (ev.deltaY === 0 || ev.ctrlKey) return; // Ctrl+molette = zoom du navigateur
    const rows = [...list.children] as HTMLElement[];
    if (rows.length < 2) return;
    // Position d'une entrée DANS le contenu défilé : le haut de la fenêtre
    // (bordure comprise) ramené à l'origine du contenu.
    const dessus = list.getBoundingClientRect().top + list.clientTop - list.scrollTop;
    const pos = (i: number): number => rows[i].getBoundingClientRect().top - dessus;
    // `scrollHeight` et `clientHeight` sont des entiers alors que le contenu ne
    // l'est pas : le plafond peut dépasser le vrai maximum d'un demi-pixel, d'où
    // la tolérance de 1 px sur les comparaisons de butée.
    const plafond = list.scrollHeight - list.clientHeight;
    // Défilement fait autrement (barre tirée à la souris, clavier) : on repart de
    // l'entrée réellement en haut.
    if (Math.abs(list.scrollTop - pose) > 1) {
      haut = rows.reduce(
        (best, _, i) =>
          Math.abs(pos(i) - list.scrollTop) < Math.abs(pos(best) - list.scrollTop) ? i : best,
        0
      );
      fond = list.scrollTop >= plafond - 1;
    }
    // Dernière entrée que le défilement peut réellement amener en haut : au delà
    // il sature, un cran de plus ne bougerait rien et l'index partirait en avance
    // sur l'écran.
    let dernier = rows.length - 1;
    while (dernier > 0 && pos(dernier) > plafond) dernier--;
    if (ev.deltaY > 0) {
      // Déjà tout en bas : le geste est RENDU au panneau, qui défile à notre
      // place. Le retenir pour ne rien faire donnait une molette morte.
      if (list.scrollTop >= plafond - 1) {
        haut = dernier;
        fond = true;
        return;
      }
      ev.preventDefault();
      // Dernière entrée alignable atteinte : le cran suivant montre la fin.
      if (haut >= dernier) {
        list.scrollTop = plafond;
        fond = true;
      } else {
        haut += 1;
        list.scrollTop = pos(haut);
      }
    } else {
      if (list.scrollTop <= 0.5) {
        haut = 0;
        fond = false;
        return; // rien à remonter : au panneau de jouer
      }
      ev.preventDefault();
      // Depuis le bas, on recale la dernière entrée alignable : elle est déjà
      // au-dessus du haut de la fenêtre, remonter d'un rang de plus sauterait une
      // entrée.
      if (fond) {
        fond = false;
        haut = dernier;
      } else {
        haut = Math.max(0, haut - 1);
      }
      list.scrollTop = pos(haut);
    }
    pose = list.scrollTop; // relu : le navigateur l'arrondit
  });

  // Les FLÈCHES de la barre de défilement n'émettent pas de `wheel` : elles font
  // défiler le navigateur de SON pas (~40 px), qui coupe les entrées en deux — la
  // molette calait proprement, les flèches non (signalé par Frank). Tout
  // défilement que nous n'avons pas posé est donc recalé sur une entrée, avec la
  // même règle : un petit pas (flèche, clavier) = UNE entrée, comme un cran de
  // molette ; un grand saut (pouce tiré, Page↑/↓) se cale sur l'entrée la plus
  // proche de l'endroit visé, sans quoi le pouce ne suivrait plus.
  //
  // Le recalage se fait à la FIN du défilement, jamais pendant. Chrome ANIME un
  // clic sur une flèche de barre (et le répète tant qu'on la maintient) : il émet
  // une dizaine d'événements `scroll` en chemin, et chaque pose faite au milieu
  // de son animation le voyait repartir de SA courbe à l'image suivante. Les deux
  // se disputaient la position et la liste sautait d'un bout à l'autre — « les
  // flèches passent directement du haut au bas » (retour de Frank sur la
  // v2026.8.2). Mesuré au clic réel : premier clic à 334 px puis le FOND au
  // cinquième, contre 37 px par clic une fois la correction posée.
  const recale = (): void => {
    const cible = list.scrollTop;
    if (Math.abs(cible - pose) <= 1) return; // c'est notre propre pose
    const rows = [...list.children] as HTMLElement[];
    if (rows.length < 2) return;
    const dessus = list.getBoundingClientRect().top + list.clientTop - cible;
    const pos = (i: number): number => rows[i].getBoundingClientRect().top - dessus;
    const plafond = list.scrollHeight - list.clientHeight;
    let dernier = rows.length - 1;
    while (dernier > 0 && pos(dernier) > plafond) dernier--;
    // Fin de liste : on colle au bas (le reste sous la dernière entrée alignable
    // ne se montre pas autrement).
    if (cible >= plafond - 1) {
      haut = dernier;
      fond = true;
      pose = cible;
      return;
    }
    const delta = cible - pose;
    const hauteurMoyenne = list.scrollHeight / rows.length;
    let cran: number;
    if (Math.abs(delta) <= hauteurMoyenne * 1.5) {
      cran = delta > 0 ? Math.min(haut + 1, dernier) : Math.max(haut - 1, 0);
    } else {
      cran = 0;
      for (let i = 1; i <= dernier; i++) {
        if (Math.abs(pos(i) - cible) < Math.abs(pos(cran) - cible)) cran = i;
      }
    }
    // Dernière entrée alignable dépassée : comme à la molette, le cran suivant
    // montre la fin de la liste.
    if (cran >= dernier && delta > 0 && haut >= dernier) {
      list.scrollTop = plafond;
      fond = true;
    } else {
      haut = cran;
      fond = false;
      list.scrollTop = pos(haut);
    }
    pose = list.scrollTop;
  };

  // `scrollend` quand le navigateur le fournit (Chrome ≥ 114) ; sinon un silence
  // de 90 ms fait office de fin de geste. Le maintien d'une flèche se répète
  // toutes les ~50 ms : rien ne bouge tant qu'on ne relâche pas.
  let finDefilement: ReturnType<typeof setTimeout> | null = null;
  list.addEventListener('scroll', () => {
    if (finDefilement) clearTimeout(finDefilement);
    finDefilement = setTimeout(recale, 90);
  });
  list.addEventListener('scrollend', () => {
    if (finDefilement) clearTimeout(finDefilement);
    finDefilement = null;
    recale();
  });
}
