// Liens de montage EN SIMULATION (piste 7, lot D0 de la piste 11) : l'aimant
// fixé sur un servo suit le palonnier tel qu'il est DESSINÉ, et les capteurs à
// effet Hall de la feuille le voient passer.
//
// Tout se mesure à l'écran (matrices des éléments : rotation, miroir, zoom et
// défilement compris) puis revient au repère du monde : aucun calcul de
// géométrie ne double celui du navigateur. Isolé de sim.mts pour être éprouvé
// sur les vrais éléments (scripts/verify-aimant.mjs).
import type { Diagram } from './diagram/model.mjs';
import { AIMANT_TYPE, angleDelta, hallSeesAimant, hasAimant, matrixAngle, mountLinks } from './diagram/montage.mjs';
import { t } from './i18n.mjs';

type XY = { x: number; y: number };

/** Ce que le montage demande à l'éditeur. */
export interface MontageEditor {
  elementOf(id: string): unknown;
  clientToWorld(clientX: number, clientY: number): XY;
  setSimPose(id: string, dx: number, dy: number, deg: number): void;
  setFaulty(id: string, faulty: boolean, note?: string): void;
}

interface Carrier {
  hornMatrix(): DOMMatrix | null;
}
interface Aimant {
  centerClient(): XY | null;
}
interface Hall {
  faceClient(): XY | null;
  external: boolean;
  field: boolean;
  trigger: number;
}

export class MontageSim {
  /** Aimant porté : son centre dans le repère du palonnier, relevé au lancement. */
  private mounts: Array<{ partId: string; carrier: Carrier; local: DOMPoint; center0: XY; angle0: number }> = [];
  private aimants: Aimant[] = [];
  private halls: Hall[] = [];
  private faulty = new Set<string>();
  private ed: MontageEditor | null = null;

  /**
   * Lancement : relève les aimants et, pour chaque aimant FIXÉ sur un servo,
   * exprime son centre dans le repère du palonnier tel qu'il est dessiné à cet
   * instant. Une propriété « Fixé sur » qui vise un repère absent ou un
   * composant qui ne porte rien est dite tout de suite (`say`) : l'aimant reste
   * alors à sa place.
   */
  start(diagram: Diagram, halls: readonly unknown[], ed: MontageEditor, say: (msg: string) => void): void {
    this.reset();
    this.ed = ed;
    const external = hasAimant(diagram);
    this.halls = halls as Hall[];
    for (const h of this.halls) {
      h.external = external;
      h.field = false;
    }
    if (!external) return;
    for (const p of diagram.parts) {
      if (p.type !== AIMANT_TYPE) continue;
      const el = ed.elementOf(p.id) as Aimant | undefined;
      if (el?.centerClient) this.aimants.push(el);
    }
    const { links, problems } = mountLinks(diagram);
    for (const pb of problems) {
      const msg = pb.reason === 'missing'
        ? t('Magnet {0}: no component named "{1}" to mount it on.', pb.partId, pb.target)
        : t('Magnet {0}: "{1}" cannot carry it — only a servo can, for now.', pb.partId, pb.target);
      this.faulty.add(pb.partId);
      say(msg);
      ed.setFaulty(pb.partId, true, msg);
    }
    for (const { partId, carrierId } of links) {
      const carrier = ed.elementOf(carrierId) as Carrier | undefined;
      const magnet = ed.elementOf(partId) as Aimant | undefined;
      const m = carrier?.hornMatrix?.();
      const c = magnet?.centerClient?.();
      if (!carrier || !m || !c) continue;
      this.mounts.push({
        partId,
        carrier,
        local: new DOMPoint(c.x, c.y).matrixTransform(m.inverse()),
        center0: ed.clientToWorld(c.x, c.y),
        angle0: matrixAngle(m),
      });
    }
  }

  /**
   * Chaque frame : replace les aimants portés (translation + rotation du
   * palonnier), puis dit à chaque capteur Hall si un aimant est à portée.
   */
  update(): void {
    const ed = this.ed;
    if (!ed || this.aimants.length === 0) return;
    for (const mt of this.mounts) {
      const m = mt.carrier.hornMatrix();
      if (!m) continue;
      const p = mt.local.matrixTransform(m);
      const w = ed.clientToWorld(p.x, p.y);
      ed.setSimPose(mt.partId, w.x - mt.center0.x, w.y - mt.center0.y, angleDelta(mt.angle0, matrixAngle(m)));
    }
    if (this.halls.length === 0) return;
    const centers: XY[] = [];
    for (const a of this.aimants) {
      const c = a.centerClient();
      if (c) centers.push(ed.clientToWorld(c.x, c.y));
    }
    for (const h of this.halls) {
      const f = h.faceClient?.();
      const seen = !!f && hallSeesAimant(ed.clientToWorld(f.x, f.y), centers, Number(h.trigger));
      if (h.field !== seen) h.field = seen;
    }
  }

  /** Arrêt : cadres rouges retirés (les poses, elles, sont rendues par l'éditeur). */
  reset(): void {
    for (const id of this.faulty) this.ed?.setFaulty(id, false);
    this.faulty.clear();
    this.mounts = [];
    this.aimants = [];
    this.halls = [];
  }
}
