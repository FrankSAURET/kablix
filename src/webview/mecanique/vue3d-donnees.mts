// Ce que montre la vue 3D d'un document système (piste 11, lot D6c).
//
// Module pur (ni DOM, ni three.js) : il sert le paquet `vue3d.mts` et les
// bancs. Pour chaque pièce : sa source de volume (`volumes.mts`), sa pose
// monde (solveur à la pose du document : chaque variable vaut son `zero`),
// son rôle (`rôle:repère`, lot D5) et ses défauts — problèmes du document
// (lecture, contrôle contre le schéma, rôles), de volume et du solveur.

import { lireRole, repereEffectif, type DocumentSysteme, type NomRole, type ProblemeSysteme } from '../../systeme.js';
import { montageCinematique, problemesVolumes, volumeDePiece, type SourceVolume, type VolumesSysteme } from './volumes.mjs';
import { poseToMat, solve, type KinProblem, type Mat } from './cinematique.mjs';

/** Ce que l'extension envoie à l'ouverture de la vue. */
export interface DonneesVue3D {
  /** Document déjà lu par `lireSysteme` côté extension. */
  doc: DocumentSysteme;
  volumes: VolumesSysteme;
  /** Problèmes de lecture et de contrôle (`problemesSysteme` du panneau). */
  problemes: ProblemeSysteme[];
}

/** Une pièce telle que la vue la pose. */
export interface PieceVue {
  id: string;
  nom?: string;
  /** Repère effectif (`ref`, sinon celui du rôle propre). */
  repere?: string;
  /** Rôle lu dans le nom ; `entraine` = repère d'un autre composant (roue). */
  role?: { nom: NomRole; repere: string };
  source: SourceVolume;
  /** Pose monde, miroir NON compris (voir `miroir`). */
  matrice: Mat;
  /** Pièce en miroir : reflet par le plan X = 0 de son repère (lot D6b). */
  miroir: boolean;
  /** Maillages des pièces `mesh` de son paquet, en base64 (par chemin). */
  maillages?: Record<string, string>;
  /** Codes des défauts qui la touchent (vide = pièce saine). */
  defauts: string[];
}

export interface Vue3D {
  pieces: PieceVue[];
  /** Problèmes sans pièce désignée (format, version…), codes seuls. */
  generaux: string[];
}

/** Rôles des problèmes du document dont la cible est l'ID de la pièce
 *  (les autres visent un repère, un fichier ou rien). */
const CIBLE_ID = new Set([
  'piece-invalide', 'piece-doublon',
  'role-inconnu', 'role-sans-repere', 'role-ref-different', 'role-doublon', 'role-type', 'role-repere-absent',
]);

/** Tout ce que la vue affiche, à la pose du document. */
export function vue3D(d: DonneesVue3D): Vue3D {
  const { doc, volumes } = d;
  const defauts = new Map<string, Set<string>>(doc.pieces.map((p) => [p.id, new Set<string>()]));
  const generaux = new Set<string>();
  const marquer = (id: string | undefined, code: string): boolean => {
    const s = id !== undefined ? defauts.get(id) : undefined;
    if (s) s.add(code);
    return !!s;
  };

  // Problèmes du document : par ID de pièce, par repère, par chemin de fichier.
  for (const pb of d.problemes) {
    let touche = false;
    if (pb.cible !== undefined) {
      if (CIBLE_ID.has(pb.cle)) touche = marquer(pb.cible, pb.cle);
      else {
        for (const p of doc.pieces) {
          const visee =
            repereEffectif(p) === pb.cible ||
            (p.source.kind === 'fichier' && p.source.path === pb.cible) ||
            p.id === pb.cible;
          if (visee) touche = marquer(p.id, pb.cle) || touche;
        }
        // Liaison en cause : le défaut va à ses deux pièces.
        const l = doc.liaisons.find((x) => x.id === pb.cible);
        if (l) touche = marquer(l.a.piece, pb.cle) || marquer(l.b.piece, pb.cle) || touche;
      }
    }
    if (!touche) generaux.add(pb.cle);
  }

  for (const pb of problemesVolumes(doc, volumes)) marquer(pb.target, pb.code);

  // Solveur : à la pose du document (aucune variable fournie).
  const { tree, problems } = montageCinematique(doc, volumes);
  const sol = solve(tree);
  const kin: KinProblem[] = [...problems, ...sol.problems];
  for (const pb of kin) {
    const l = doc.liaisons.find((x) => x.id === pb.target);
    // Le défaut d'une liaison se voit sur l'enfant (`a`), la pièce laissée à sa pose.
    if (l) marquer(l.a.piece, pb.code);
    else if (!marquer(pb.target, pb.code)) generaux.add(pb.code);
  }

  const pieces = doc.pieces.map((p): PieceVue => {
    const r = lireRole(p.nom);
    const role = r && !('faute' in r) ? { nom: r.role, repere: r.repere } : undefined;
    const repere = repereEffectif(p);
    return {
      id: p.id,
      ...(p.nom !== undefined ? { nom: p.nom } : {}),
      ...(repere ? { repere } : {}),
      ...(role ? { role } : {}),
      source: volumeDePiece(p, volumes),
      ...(p.source.kind === 'kompix' && volumes.paquets[p.source.type]?.maillages ? { maillages: volumes.paquets[p.source.type].maillages } : {}),
      matrice: sol.poses[p.id]?.matrix ?? poseToMat(p.pose),
      miroir: !!p.pose.miroir,
      defauts: [...(defauts.get(p.id) ?? [])],
    };
  });
  return { pieces, generaux: [...generaux] };
}

/** Textes de la bulle de survol, fournis traduits par la page. */
export interface TextesBulle {
  role: string;
  repere: string;
  mecanique: string;
  defauts: Record<string, string>;
}

/** Lignes de la bulle d'une pièce : nom, rôle et repère, puis ses défauts. */
export function bulleDePiece(p: PieceVue, t: TextesBulle): string[] {
  const lignes = [p.nom ?? p.id];
  if (p.role) lignes.push(`${t.role} : ${p.role.nom}`);
  if (p.repere) lignes.push(`${t.repere} : ${p.repere}`);
  else if (p.role?.repere) lignes.push(`${t.repere} : ${p.role.repere}`);
  if (!p.role && !p.repere) lignes.push(t.mecanique);
  for (const c of p.defauts) lignes.push(`⚠ ${t.defauts[c] ?? c}`);
  return lignes;
}
