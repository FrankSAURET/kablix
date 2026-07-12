// Analyse d'un SVG « marqué » selon la convention de l'éditeur de composants :
// - cercle (ou ellipse) rouge pur rgb(255,0,0) d'opacité ≈ 0,8 → centre = broche ;
// - cercle vert pur rgb(0,255,0) d'opacité ≈ 0,5 → ancre de calage externe/interne
//   (posé sur une des broches côté externe, au même endroit côté interne) ;
// - texte rouge pur → nom de la broche la plus proche (deviendra l'infobulle).
// Les marqueurs sont retirés du SVG retourné. Les coordonnées sont exprimées en
// px CSS du rendu à l'échelle 1 (repère = coin haut-gauche du viewport), donc
// directement compatibles avec `CustomPin` et le canvas — les unités mm
// d'Inkscape sont converties par le rendu du navigateur.

import type { CustomPin } from './catalog.mjs';

export interface MarkedSvgResult {
  /** SVG nettoyé (marqueurs retirés), width/height normalisés en px. */
  svg: string;
  /** Taille rendue à l'échelle 1, en px. */
  width: number;
  height: number;
  /** Broches détectées (cercles rouges), nommées par les textes rouges voisins. */
  pins: CustomPin[];
  /** Centre du cercle vert de calage, ou null s'il est absent. */
  anchor: { x: number; y: number } | null;
}

/** Opacité effective d'un élément rendu (fill-opacity × opacity). */
function effectiveOpacity(cs: CSSStyleDeclaration): number {
  const fo = parseFloat(cs.fillOpacity);
  const o = parseFloat(cs.opacity);
  return (Number.isFinite(fo) ? fo : 1) * (Number.isFinite(o) ? o : 1);
}

/** Centre local (cx, cy) d'un cercle/ellipse ramené au repère du SVG racine. */
function centerInRoot(el: SVGGraphicsElement, rootRect: DOMRect): { x: number; y: number } | null {
  const m = el.getScreenCTM();
  if (!m) return null; // élément non rendu (defs, display:none…)
  const cx = (el as SVGCircleElement).cx?.baseVal?.value ?? 0;
  const cy = (el as SVGCircleElement).cy?.baseVal?.value ?? 0;
  const p = new DOMPoint(cx, cy).matrixTransform(m);
  return { x: p.x - rootRect.left, y: p.y - rootRect.top };
}

/**
 * Analyse et nettoie un SVG marqué. Lève une Error (message i18n-isable côté
 * appelant) si le texte ne contient pas de racine `<svg>` exploitable.
 */
export function analyzeMarkedSvg(svgText: string): MarkedSvgResult {
  // Rendu hors écran : nécessaire pour résoudre styles calculés, unités (mm…)
  // et transformations imbriquées via getScreenCTM.
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-100000px;top:0;';
  host.innerHTML = svgText;
  document.body.appendChild(host);
  try {
    const root = host.querySelector('svg');
    if (!root) throw new Error('no <svg> root');
    // Sans width/height, le SVG s'étale : fige la taille depuis le viewBox.
    if ((!root.getAttribute('width') || !root.getAttribute('height')) && root.getAttribute('viewBox')) {
      const vb = root.viewBox.baseVal;
      root.setAttribute('width', String(vb.width));
      root.setAttribute('height', String(vb.height));
    }
    const rootRect = root.getBoundingClientRect();
    const width = Math.round(rootRect.width) || 80;
    const height = Math.round(rootRect.height) || 60;

    // --- Marqueurs : cercles rouges (broches) et vert (ancre) ----------------
    const redCircles: { el: SVGGraphicsElement; x: number; y: number }[] = [];
    let anchor: { x: number; y: number } | null = null;
    const toRemove: Element[] = [];
    for (const el of root.querySelectorAll<SVGGraphicsElement>('circle, ellipse')) {
      if (el.closest('defs')) continue;
      const cs = getComputedStyle(el);
      const op = effectiveOpacity(cs);
      const c = centerInRoot(el, rootRect);
      if (!c) continue;
      if (cs.fill === 'rgb(255, 0, 0)' && op >= 0.6 && op <= 0.95) {
        redCircles.push({ el, x: c.x, y: c.y });
        toRemove.push(el);
      } else if (cs.fill === 'rgb(0, 255, 0)' && op >= 0.25 && op <= 0.7) {
        if (!anchor) anchor = { x: Math.round(c.x), y: Math.round(c.y) };
        toRemove.push(el);
      }
    }

    // --- Textes rouges : noms des broches ------------------------------------
    const labels: { text: string; x: number; y: number }[] = [];
    for (const el of root.querySelectorAll<SVGGraphicsElement>('text')) {
      if (el.closest('defs')) continue;
      // Le rouge peut être posé sur <text> ou sur ses <tspan> (Inkscape).
      const isRed = (n: Element) => getComputedStyle(n).fill === 'rgb(255, 0, 0)';
      if (!isRed(el) && ![...el.querySelectorAll('tspan')].some(isRed)) continue;
      const m = el.getScreenCTM();
      if (!m) continue;
      const bb = el.getBBox();
      const p = new DOMPoint(bb.x + bb.width / 2, bb.y + bb.height / 2).matrixTransform(m);
      const text = (el.textContent ?? '').trim();
      if (text) labels.push({ text, x: p.x - rootRect.left, y: p.y - rootRect.top });
      toRemove.push(el);
    }

    // --- Association nom ↔ broche : paires les plus proches d'abord ----------
    const pairs: { ci: number; li: number; d: number }[] = [];
    redCircles.forEach((c, ci) =>
      labels.forEach((l, li) => pairs.push({ ci, li, d: Math.hypot(c.x - l.x, c.y - l.y) }))
    );
    pairs.sort((a, b) => a.d - b.d);
    const nameOf = new Array<string | null>(redCircles.length).fill(null);
    const usedLabel = new Set<number>();
    for (const p of pairs) {
      if (nameOf[p.ci] !== null || usedLabel.has(p.li)) continue;
      nameOf[p.ci] = labels[p.li].text;
      usedLabel.add(p.li);
    }

    // Broches en ordre de lecture (lignes de haut en bas puis gauche → droite),
    // noms manquants complétés (pinN) et doublons suffixés pour rester uniques.
    const ordered = redCircles
      .map((c, i) => ({ x: Math.round(c.x), y: Math.round(c.y), name: nameOf[i] }))
      .sort((a, b) => (Math.abs(a.y - b.y) > 5 ? a.y - b.y : a.x - b.x));
    const seen = new Map<string, number>();
    const pins: CustomPin[] = ordered.map((p, i) => {
      let name = p.name ?? `pin${i + 1}`;
      const n = seen.get(name) ?? 0;
      seen.set(name, n + 1);
      if (n > 0) name = `${name}.${n + 1}`;
      return { name, x: p.x, y: p.y };
    });

    // --- Nettoyage + normalisation ---------------------------------------------
    for (const el of toRemove) el.remove();
    if (!root.getAttribute('viewBox')) root.setAttribute('viewBox', `0 0 ${width} ${height}`);
    root.setAttribute('width', String(width));
    root.setAttribute('height', String(height));
    const svg = new XMLSerializer().serializeToString(root);
    return { svg, width, height, pins, anchor };
  } finally {
    host.remove();
  }
}
