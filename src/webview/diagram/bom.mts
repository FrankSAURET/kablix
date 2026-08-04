// Nomenclature du schéma : la liste des composants, en CSV point-virgule.
//
// Le séparateur est le POINT-VIRGULE (et non la virgule) : c'est celui
// qu'attend un tableur configuré en français, où la virgule est la décimale.
// Le fichier commence par la marque d'ordre des octets UTF-8, sans quoi Excel
// affiche « RÃ©sistance » au lieu de « Résistance ».
//
// Cinq colonnes (v2026.7.244) : Repère ; Composant ; Type ; Valeur ; Commentaire.
// La VALEUR est celle qu'on lit sur le composant — « 10 µF », « 100 kΩ » —,
// avec son unité et son préfixe. Tout le reste passe en COMMENTAIRE, sous la
// forme « Tension max : 400 V ». Un transistor n'a pas de valeur : ses
// caractéristiques sont donc toutes en commentaire.
import { capacitorDefOf, partDef, propConditions, type PartDef, type PropDef } from './catalog.mjs';
import { icLabel, icMarking } from './ics.mjs';
import type { Part } from './model.mjs';
import { t } from '../i18n.mjs';
import { colorDisplayName } from './colors.mjs';
import { formatQuantity, labelUnit, SCALED_UNITS } from '../quantity.mjs';

/** Une ligne de la nomenclature. */
export interface BomRow {
  ref: string;
  label: string;
  type: string;
  value: string;
  comment: string;
}

/** Valeur effective d'un attribut : celle du composant, sinon celle par défaut. */
function attrOf(def: PartDef, part: Part, attr: string): string {
  return part.attrs?.[attr] ?? def.attrs?.[attr] ?? '';
}

// --- Unités et préfixes --------------------------------------------------------
// Le formatage vit dans ../quantity.mts : le potentiomètre affiche lui aussi sa
// résistance en simulation, et les deux doivent l'écrire pareil. Ré-exporté ici,
// où le banc de nomenclature va le chercher.
export { formatQuantity, labelUnit };

/** Le même libellé sans son unité : « Tension max (V) » → « Tension max ». */
function labelWithoutUnit(label: string): string {
  return label.replace(/\s*\([^()]+\)\s*$/, '').trim();
}

// --- Colonnes ------------------------------------------------------------------
/** Propriétés effectivement visibles dans l'inspecteur pour ce composant. */
function visibleProps(def: PartDef, part: Part): PropDef[] {
  return (def.props ?? []).filter((prop) =>
    propConditions(prop.showIf).every((c) => c.equals.includes(attrOf(def, part, c.attr)))
  );
}

/**
 * La propriété qui porte la VALEUR du composant : celle marquée `isValue`
 * (potentiomètre, dont `value` désigne déjà la position du curseur), sinon
 * l'attribut `value` mesuré dans une unité de composant (ohm, farad, henry).
 * La « Position (%) » d'un curseur porte le même nom d'attribut mais n'est pas
 * une valeur de nomenclature.
 */
function valueProp(props: readonly PropDef[]): PropDef | undefined {
  return props.find((p) => p.isValue) ?? props.find((p) => {
    if (p.attr !== 'value') return false;
    const unit = labelUnit(p.label);
    return !!unit && SCALED_UNITS.has(unit);
  });
}

/** Texte d'une propriété dans le commentaire : « Tension max : 400 V ». */
function propText(def: PartDef, part: Part, prop: PropDef): string | null {
  const value = attrOf(def, part, prop.attr);
  if (value === '') return null;
  // Une case cochée ne vaut que par son libellé.
  if (prop.kind === 'checkbox') return t(prop.label);
  const label = t(prop.label);
  if (prop.attr === 'color') {
    // Les couleurs n'ont pas de libellé de liste : l'inspecteur les montre en
    // pastilles, dont l'infobulle donne déjà le nom traduit.
    return `${label} : ${colorDisplayName(value)}`;
  }
  const optionLabel = prop.optionLabels?.[value];
  if (optionLabel) return `${label} : ${t(optionLabel)}`;
  const unit = labelUnit(prop.label);
  if (unit && prop.kind === 'number') {
    const text = `${labelWithoutUnit(label)} : ${formatQuantity(value, unit)}`;
    // Potentiomètre : « 50 % » ne dit pas ce qu'on mesure entre le curseur et
    // l'extrémité basse — la résistance correspondante suit entre parenthèses
    // (Frank, v2026.7.251).
    if (def.kind === 'potentiometer' && prop.attr === 'value') {
      const total = Number(attrOf(def, part, 'ohms'));
      const percent = Number(value);
      if (Number.isFinite(total) && Number.isFinite(percent)) {
        return `${text} (${formatQuantity(String((total * percent) / 100), 'Ω')})`;
      }
    }
    return text;
  }
  // Une inscription de boîtier tient sur plusieurs lignes : elle passe sur une
  // seule dans la cellule, sinon le CSV se lit de travers.
  return `${label} : ${value.replace(/\s*\n\s*/g, ' ')}`;
}

/**
 * Nom du composant. Les trois condensateurs sont un seul type dont `ctype`
 * change l'habillage : la nomenclature doit dire LEQUEL — « Condensateur
 * plastique », « Condensateur tantale », « Condensateur chimique ».
 */
export function partLabel(part: Part): string {
  let def: PartDef;
  try {
    def = partDef(part.type);
  } catch {
    return part.type; // type inconnu de ce poste (projet plus récent)
  }
  // Circuit intégré : chaque référence a son entrée de bibliothèque, mais la
  // référence reste changeable dans les propriétés — c'est celle du composant
  // POSÉ que la nomenclature nomme, pas celle de l'entrée d'où il vient.
  if (def.kind === 'logic-ic') return t(icLabel(attrOf(def, part, 'ref')));
  const label = t(def.label);
  if (def.kind !== 'capacitor') return label;
  const prop = (def.props ?? []).find((p) => p.attr === 'ctype');
  const option = prop?.optionLabels?.[attrOf(def, part, 'ctype')];
  if (!option) return label;
  // « Condensateur » + « Plastique » → « Condensateur plastique ».
  const kindName = t(option);
  return `${label} ${kindName.charAt(0).toLowerCase()}${kindName.slice(1)}`;
}

/**
 * Type du composant pour la nomenclature. Les trois condensateurs sont posés
 * depuis UNE seule entrée de palette : passer un `condo-np` en tantale ne
 * changeait que son dessin, la colonne Type disait `condo-np` pour les trois
 * (Frank, v2026.7.251). C'est le type du DESSIN affiché qui est écrit.
 */
export function partType(part: Part): string {
  let def: PartDef;
  try {
    def = partDef(part.type);
  } catch {
    return part.type;
  }
  // Même raison que pour le nom : le type suit la référence choisie, pas
  // l'entrée de palette d'origine.
  if (def.kind === 'logic-ic') return attrOf(def, part, 'ref').toLowerCase() || part.type;
  if (def.kind !== 'capacitor') return part.type;
  return capacitorDefOf(attrOf(def, part, 'ctype'))?.type ?? part.type;
}

/** Valeur lue sur le composant : « 220 Ω », « 10 µF ». Vide s'il n'en a pas. */
export function partValue(part: Part): string {
  let def: PartDef;
  try {
    def = partDef(part.type);
  } catch {
    return '';
  }
  // Ce qu'on lit sur un circuit intégré — et ce qu'on commande — c'est son
  // INSCRIPTION, famille comprise : un « 74xx08 » en famille LS s'achète 74LS08.
  if (def.kind === 'logic-ic') {
    return icMarking(attrOf(def, part, 'ref'), attrOf(def, part, 'family'));
  }
  const prop = valueProp(visibleProps(def, part));
  if (!prop) return '';
  const raw = attrOf(def, part, prop.attr);
  return raw === '' ? '' : formatQuantity(raw, labelUnit(prop.label));
}

/**
 * Les AUTRES caractéristiques, dans l'ordre de l'inspecteur, sous la forme
 * « Libellé : valeur ». La valeur du composant en est retirée (elle a sa
 * colonne) ainsi que le type de condensateur (il est déjà dans son nom).
 */
export function partComment(part: Part): string {
  let def: PartDef;
  try {
    def = partDef(part.type);
  } catch {
    return ''; // type inconnu de ce poste : la ligne garde au moins son repère
  }
  const props = visibleProps(def, part);
  const skip = new Set<PropDef>();
  const value = valueProp(props);
  if (value) skip.add(value);
  if (def.kind === 'capacitor') {
    const ctype = props.find((p) => p.attr === 'ctype');
    if (ctype) skip.add(ctype);
  }
  // Circuit intégré : la référence et la famille sont déjà dans l'inscription
  // (colonne Valeur) — les répéter en commentaire n'apprendrait rien.
  if (def.kind === 'logic-ic') {
    for (const p of props) if (p.attr === 'ref' || p.attr === 'family') skip.add(p);
  }
  const bits: string[] = [];
  for (const prop of props) {
    if (skip.has(prop)) continue;
    const text = propText(def, part, prop);
    if (text) bits.push(text);
  }
  return bits.join(' · ');
}

/** Découpe un repère en préfixe + numéro, pour trier R2 avant R10. */
function refKey(id: string): [string, number] {
  const m = /^([A-Za-zÀ-ÿ]+)(\d+)$/.exec(id);
  return m ? [m[1], Number(m[2])] : [id, 0];
}

/** Nomenclature du schéma, triée par famille puis par numéro de repère. */
export function bomRows(parts: readonly Part[]): BomRow[] {
  const rows = parts.map((p) => ({
    ref: p.id,
    label: partLabel(p),
    type: partType(p),
    value: partValue(p),
    comment: partComment(p),
  }));
  return rows.sort((a, b) => {
    const [pa, na] = refKey(a.ref);
    const [pb, nb] = refKey(b.ref);
    return pa === pb ? na - nb : pa.localeCompare(pb);
  });
}

/** Échappe une cellule : guillemets doublés dès qu'elle contient ; " ou un saut. */
function cell(value: string): string {
  return /[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Le fichier CSV complet (marque UTF-8 comprise) : une ligne d'en-tête traduite
 * puis un composant par ligne. Les fils ne sont pas de la nomenclature.
 */
export function partsCsv(parts: readonly Part[]): string {
  const head = [t('Ref.'), t('Part'), t('Type'), t('Value'), t('Comment')];
  const lines = [head.map(cell).join(';')];
  for (const r of bomRows(parts)) {
    lines.push([r.ref, r.label, r.type, r.value, r.comment].map(cell).join(';'));
  }
  // CRLF : le format le plus sûr pour les tableurs sous Windows.
  return `﻿${lines.join('\r\n')}\r\n`;
}
