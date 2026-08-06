// Copie FIDÈLE du calage de liste d'editor.mts (molette + recalage après un
// défilement venu du navigateur), pour la sonde _probe-fleche-ascenseur.mjs.
// `list` est la liste, `window.__haut` expose l'entrée calée en haut.
const list = liste;
let haut = 0;
let pose = 0;
let fond = false;
window.__haut = () => haut;
list.addEventListener('wheel', (ev) => {
  if (ev.deltaY === 0 || ev.ctrlKey) return;
  const rows = [...list.children];
  if (rows.length < 2) return;
  const dessus = list.getBoundingClientRect().top + list.clientTop - list.scrollTop;
  const pos = (i) => rows[i].getBoundingClientRect().top - dessus;
  const plafond = list.scrollHeight - list.clientHeight;
  if (Math.abs(list.scrollTop - pose) > 1) {
    haut = rows.reduce(
      (best, _, i) => (Math.abs(pos(i) - list.scrollTop) < Math.abs(pos(best) - list.scrollTop) ? i : best),
      0
    );
    fond = list.scrollTop >= plafond - 1;
  }
  let dernier = rows.length - 1;
  while (dernier > 0 && pos(dernier) > plafond) dernier--;
  if (ev.deltaY > 0) {
    if (list.scrollTop >= plafond - 1) { haut = dernier; fond = true; return; }
    ev.preventDefault();
    if (haut >= dernier) { list.scrollTop = plafond; fond = true; }
    else { haut += 1; list.scrollTop = pos(haut); }
  } else {
    if (list.scrollTop <= 0.5) { haut = 0; fond = false; return; }
    ev.preventDefault();
    if (fond) { fond = false; haut = dernier; }
    else { haut = Math.max(0, haut - 1); }
    list.scrollTop = pos(haut);
  }
  pose = list.scrollTop;
});
const recale = () => {
  const cible = list.scrollTop;
  if (Math.abs(cible - pose) <= 1) return;
  const rows = [...list.children];
  if (rows.length < 2) return;
  const dessus = list.getBoundingClientRect().top + list.clientTop - cible;
  const pos = (i) => rows[i].getBoundingClientRect().top - dessus;
  const plafond = list.scrollHeight - list.clientHeight;
  let dernier = rows.length - 1;
  while (dernier > 0 && pos(dernier) > plafond) dernier--;
  if (cible >= plafond - 1) { haut = dernier; fond = true; pose = cible; return; }
  const delta = cible - pose;
  const hauteurMoyenne = list.scrollHeight / rows.length;
  let cran;
  if (Math.abs(delta) <= hauteurMoyenne * 1.5) {
    cran = delta > 0 ? Math.min(haut + 1, dernier) : Math.max(haut - 1, 0);
  } else {
    cran = 0;
    for (let i = 1; i <= dernier; i++) {
      if (Math.abs(pos(i) - cible) < Math.abs(pos(cran) - cible)) cran = i;
    }
  }
  if (cran >= dernier && delta > 0 && haut >= dernier) { list.scrollTop = plafond; fond = true; }
  else { haut = cran; fond = false; list.scrollTop = pos(haut); }
  pose = list.scrollTop;
};
let finDefilement = null;
list.addEventListener('scroll', () => {
  if (finDefilement) clearTimeout(finDefilement);
  finDefilement = setTimeout(recale, 90);
});
list.addEventListener('scrollend', () => {
  if (finDefilement) clearTimeout(finDefilement);
  finDefilement = null;
  recale();
});
