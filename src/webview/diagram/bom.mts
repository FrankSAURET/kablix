// Nomenclature du schéma : la liste des composants, en CSV point-virgule.
//
// Le séparateur est le POINT-VIRGULE (et non la virgule) : c'est celui
// qu'attend un tableur configuré en français, où la virgule est la décimale.
// Le fichier commence par la marque d'ordre des octets UTF-8, sans quoi Excel
// affiche « RÃ©sistance » au lieu de « Résistance ».
import { partDef, type PartDef } from './catalog.mjs';
import type { Part } from './model.mjs';
import { t } from '../i18n.mjs';
import { colorDisplayName } from './colors.mjs';

/** Une ligne de la nomenclature. */
export interface BomRow {
  ref: string;
  label: string;
  type: string;
  specs: string;
}

/** Valeur effective d'un attribut : celle du composant, sinon celle par défaut. */
function attrOf(def: PartDef, part: Part, attr: string): string {
  return part.attrs?.[attr] ?? def.attrs?.[attr] ?? '';
}

/**
 * Caractéristiques lisibles d'un composant : ses propriétés d'inspecteur, dans
 * l'ordre où elles y figurent, sous la forme « Libellé : valeur ». Les
 * propriétés masquées par une condition (`showIf`) et les valeurs vides sont
 * sautées — elles ne disent rien de plus que le type du composant.
 */
export function partSpecs(part: Part): string {
  let def: PartDef;
  try {
    def = partDef(part.type);
  } catch {
    return ''; // type inconnu de ce poste : la ligne garde au moins son repère
  }
  const bits: string[] = [];
  for (const prop of def.props ?? []) {
    if (prop.showIf && !prop.showIf.equals.includes(attrOf(def, part, prop.showIf.attr))) continue;
    const value = attrOf(def, part, prop.attr);
    if (value === '') continue;
    if (prop.kind === 'checkbox') {
      bits.push(t(prop.label));
      continue;
    }
    if (prop.attr === 'color') {
      // Les couleurs n'ont pas de libellé de liste : l'inspecteur les montre en
      // pastilles, dont l'infobulle donne déjà le nom traduit.
      bits.push(`${t(prop.label)} : ${colorDisplayName(value)}`);
      continue;
    }
    const optionLabel = prop.optionLabels?.[value];
    // Une inscription de boîtier tient sur plusieurs lignes : elle passe sur une
    // seule dans la cellule, sinon le CSV se lit de travers.
    bits.push(`${t(prop.label)} : ${(optionLabel ? t(optionLabel) : value).replace(/\s*\n\s*/g, ' ')}`);
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
  const rows = parts.map((p) => {
    let label = p.type;
    try {
      label = t(partDef(p.type).label);
    } catch {
      /* type inconnu : on garde le type brut */
    }
    return { ref: p.id, label, type: p.type, specs: partSpecs(p) };
  });
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
  const head = [t('Ref.'), t('Part'), t('Type'), t('Characteristics')];
  const lines = [head.map(cell).join(';')];
  for (const r of bomRows(parts)) lines.push([r.ref, r.label, r.type, r.specs].map(cell).join(';'));
  // CRLF : le format le plus sûr pour les tableurs sous Windows.
  return `﻿${lines.join('\r\n')}\r\n`;
}
