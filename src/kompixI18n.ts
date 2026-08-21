import * as vscode from 'vscode';

/**
 * Traduction des métadonnées d'un composant `.kompix`.
 *
 * Un composant de bibliothèque n'est pas un composant natif : ses libellés ne
 * sont pas dans `l10n/bundle.l10n.fr.json` — le catalogue de Kablix ne connaît
 * que ses propres chaînes. Le paquet emporte donc SES traductions, dans un bloc
 * `l10n` du manifeste :
 *
 * ```json
 * "l10n": { "fr": { "label": "…", "description": "…",
 *                   "params": { "address": "Adresse DMX" },
 *                   "control": { "label": "…", "unit": "…" } } }
 * ```
 *
 * Les champs de premier niveau (`label`, `description`, …) restent la LANGUE DE
 * BASE du paquet : un composant sans bloc `l10n`, ou dans une langue absente du
 * bloc, s'affiche tel qu'il a été écrit. Rien n'est jamais vide.
 */
export interface KompixL10nEntry {
  label?: string;
  description?: string;
  /** Libellé de chaque propriété, par `name` de `params`. */
  params?: Record<string, string>;
  /** Libellé et unité du contrôle de simulation. */
  control?: { label?: string; unit?: string };
}

/** Ce qu'une traduction peut retoucher, quel que soit l'objet qui la porte. */
interface Traduisible {
  label?: string;
  description?: string;
  params?: Array<{ name: string; label?: string; value?: number }>;
  control?: { label?: string; unit?: string; [k: string]: unknown } | null;
  l10n?: Record<string, KompixL10nEntry>;
}

/**
 * Langue à servir : celle de VS Code. `fr-CA` cherche d'abord `fr-ca`, puis
 * `fr` — une traduction régionale absente retombe sur la langue, jamais sur
 * l'anglais par surprise.
 */
export function langueCourante(): string {
  // `env` peut manquer hors de l'éditeur (bancs de test) : la langue de base du
  // paquet est alors servie telle quelle, ce qui est le bon repli.
  return (vscode.env?.language ?? 'en').toLowerCase();
}

/**
 * Traduction à appliquer pour une langue donnée, ou `undefined` s'il n'y en a
 * pas. Les clés du bloc sont comparées en minuscules : `fr-CA` et `fr-ca` sont
 * la même langue.
 */
export function choisirL10n(
  l10n: Record<string, KompixL10nEntry> | undefined,
  lang: string
): KompixL10nEntry | undefined {
  if (!l10n || typeof l10n !== 'object') return undefined;
  const table = new Map<string, KompixL10nEntry>();
  for (const [cle, valeur] of Object.entries(l10n)) {
    if (valeur && typeof valeur === 'object') table.set(cle.toLowerCase(), valeur);
  }
  const demandee = (lang || '').toLowerCase();
  return table.get(demandee) ?? table.get(demandee.split(/[-_]/)[0]) ?? undefined;
}

/**
 * Rend une COPIE de l'objet dont les libellés sont dans la langue demandée
 * (celle de VS Code par défaut). Un champ absent de la traduction garde sa
 * valeur d'origine — une traduction partielle ne troue pas la fiche.
 */
export function traduireKompix<T extends Traduisible>(entry: T, lang: string = langueCourante()): T {
  const tr = choisirL10n(entry.l10n, lang);
  if (!tr) return entry;

  const sortie: Traduisible = { ...entry };
  if (tr.label) sortie.label = tr.label;
  if (tr.description) sortie.description = tr.description;

  if (tr.params && Array.isArray(entry.params)) {
    const libelles = tr.params;
    sortie.params = entry.params.map((p) => (libelles[p?.name] ? { ...p, label: libelles[p.name] } : p));
  }

  if (tr.control && entry.control) {
    sortie.control = { ...entry.control };
    if (tr.control.label) sortie.control.label = tr.control.label;
    if (tr.control.unit) sortie.control.unit = tr.control.unit;
  }

  return sortie as T;
}
