// Prise TCP d'écoute tenue par l'hôte pour le compte du Pico W simulé.
//
// La puce Wi-Fi (CYW43439) n'est pas émulée : le Pico simulé ne peut pas créer
// de point d'accès, et aucun téléphone ne peut rejoindre un réseau qui n'existe
// pas. Le module `socket` du script est donc un shim (cf. `shared/pynet.ts`)
// qui délègue ici : c'est VS Code qui ouvre la vraie prise, sur le réseau de la
// machine. Le téléphone rejoint le Wi-Fi du PC et ouvre l'adresse annoncée —
// le script, lui, voit exactement ce qu'il verrait sur la vraie carte : une
// connexion acceptée, des octets de requête, des octets de réponse à écrire.
//
// Aucune interprétation du contenu : le serveur transporte des OCTETS. C'est
// donc le programme MicroPython qui parle HTTP, comme sur le matériel réel.
import { createServer, type Server, type Socket } from 'node:net';
import { networkInterfaces } from 'node:os';

/** Aucun octet. Partagé : il n'est jamais modifié. */
const VIDE = new Uint8Array(0);

/** Concatène deux paquets d'octets. */
function joindre(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** Octets → texte hexadécimal (le tunnel vers le script est du JSON texte). */
export function enHexa(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/** Texte hexadécimal → octets. */
export function depuisHexa(s: string): Uint8Array {
  const n = Math.floor(s.length / 2);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}

/** Connexion cliente en cours, vue du script. */
interface Conn {
  socket: Socket;
  /** Octets reçus et pas encore lus par le script. */
  buf: Uint8Array;
  /** Le client (ou le réseau) a fermé son côté. */
  ended: boolean;
  /** Lecture du script en attente d'octets. */
  waiting: ((data: Uint8Array) => void) | null;
}

/** Le script attend une connexion (`accept`). */
type AcceptWaiter = (c: { cid: number; peer: string; data: Uint8Array }) => void;

/**
 * Adresse IPv4 de la machine sur le réseau local — celle que le téléphone doit
 * viser. `localhost` ne servirait à rien : la page est faite pour être ouverte
 * depuis un AUTRE appareil.
 */
export function lanAddress(): string {
  for (const cartes of Object.values(networkInterfaces())) {
    for (const c of cartes ?? []) {
      if (c.family === 'IPv4' && !c.internal) return c.address;
    }
  }
  return '127.0.0.1';
}

export class PicoNetServer {
  private server: Server | null = null;
  private conns = new Map<number, Conn>();
  private nextCid = 1;
  /** Connexions ouvertes et pas encore remises au script, dans l'ordre d'arrivée. */
  private pending: number[] = [];
  private accepters: AcceptWaiter[] = [];
  private boundPort = 0;

  /** Port réellement ouvert (0 si le serveur est arrêté). */
  get port(): number {
    return this.boundPort;
  }

  /**
   * Ouvre la prise d'écoute. Le script demande presque toujours le port 80,
   * que la machine refuse le plus souvent (privilégié sous Linux/macOS, pris
   * par http.sys sous Windows) : on se rabat alors sur 8080 puis sur un port
   * libre, et on annonce celui qu'on a obtenu — mentir laisserait le
   * téléphone frapper à une porte fermée.
   */
  async listen(port: number): Promise<{ ip: string; port: number }> {
    const voulu = Number.isInteger(port) && port > 0 && port < 65536 ? port : 80;
    if (this.server) {
      // Le script a relancé son serveur : on garde la prise en place plutôt que
      // de rouvrir un port (et d'en changer sous le nez du téléphone).
      return { ip: lanAddress(), port: this.boundPort };
    }
    const candidats = voulu === 80 ? [80, 8080, 0] : [voulu, 0];
    let derniere: unknown;
    for (const p of candidats) {
      try {
        this.boundPort = await this.open(p);
        return { ip: lanAddress(), port: this.boundPort };
      } catch (err) {
        derniere = err;
      }
    }
    throw derniere instanceof Error ? derniere : new Error('listen failed');
  }

  /** Ouvre effectivement un port ; rejette si l'OS le refuse. */
  private open(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer((socket) => this.onConnection(socket));
      const onError = (err: Error): void => {
        server.close();
        reject(err);
      };
      server.once('error', onError);
      server.listen(port, '0.0.0.0', () => {
        server.off('error', onError);
        // Une erreur plus tard (réseau coupé) ne doit pas abattre l'extension.
        server.on('error', () => undefined);
        this.server = server;
        const addr = server.address();
        resolve(typeof addr === 'object' && addr ? addr.port : port);
      });
    });
  }

  /** Nouvelle connexion cliente : mise en file jusqu'à ce qu'elle porte des octets. */
  private onConnection(socket: Socket): void {
    const cid = this.nextCid++;
    const conn: Conn = { socket, buf: VIDE, ended: false, waiting: null };
    this.conns.set(cid, conn);
    socket.on('data', (d) => {
      conn.buf = joindre(conn.buf, new Uint8Array(d));
      this.pump(cid, conn);
    });
    socket.on('end', () => {
      conn.ended = true;
      this.pump(cid, conn);
    });
    socket.on('close', () => {
      conn.ended = true;
      this.pump(cid, conn);
      this.conns.delete(cid);
    });
    socket.on('error', () => {
      conn.ended = true;
      this.pump(cid, conn);
    });
    this.pending.push(cid);
  }

  /** Réveille ce qui attendait des octets sur cette connexion. */
  private pump(cid: number, conn: Conn): void {
    if (conn.waiting && (conn.buf.length > 0 || conn.ended)) {
      const w = conn.waiting;
      conn.waiting = null;
      const data = conn.buf;
      conn.buf = VIDE;
      w(data);
    }
    this.serveAccepters();
  }

  /**
   * Remet au script les connexions qui portent déjà des octets. Un navigateur
   * ouvre des connexions spéculatives qu'il n'utilise jamais : les rendre
   * ferait tourner le script à vide sur des requêtes vides.
   */
  private serveAccepters(): void {
    while (this.accepters.length > 0) {
      const i = this.pending.findIndex((cid) => {
        const c = this.conns.get(cid);
        return c ? c.buf.length > 0 : false;
      });
      if (i < 0) return;
      const cid = this.pending.splice(i, 1)[0];
      const conn = this.conns.get(cid);
      if (!conn) continue;
      const data = conn.buf;
      conn.buf = VIDE;
      const w = this.accepters.shift();
      w?.({ cid, peer: conn.socket.remoteAddress ?? '0.0.0.0', data });
    }
  }

  /** Attend une connexion cliente. Aucun délai : c'est un serveur, il attend. */
  accept(): Promise<{ cid: number; peer: string; data: Uint8Array }> {
    return new Promise((resolve) => {
      this.accepters.push(resolve);
      this.serveAccepters();
    });
  }

  /** Lit des octets ; rend un tampon vide si le client a raccroché. */
  recv(cid: number, max: number): Promise<Uint8Array> {
    const conn = this.conns.get(cid);
    if (!conn) return Promise.resolve(VIDE);
    const prendre = (): Uint8Array => {
      const d = conn.buf.subarray(0, max);
      conn.buf = conn.buf.subarray(d.length);
      return d;
    };
    if (conn.buf.length > 0) return Promise.resolve(prendre());
    if (conn.ended) return Promise.resolve(VIDE);
    return new Promise((resolve) => {
      conn.waiting = () => resolve(prendre());
    });
  }

  /** Écrit des octets vers le client. */
  send(cid: number, data: Uint8Array): number {
    const conn = this.conns.get(cid);
    if (!conn || conn.socket.destroyed) return 0;
    conn.socket.write(data);
    return data.length;
  }

  /** Ferme une connexion cliente (fin de la réponse HTTP). */
  closeConn(cid: number): void {
    const conn = this.conns.get(cid);
    if (!conn) return;
    conn.socket.end();
    this.conns.delete(cid);
    this.pending = this.pending.filter((c) => c !== cid);
  }

  /** Ferme la prise d'écoute et toutes les connexions. */
  stop(): void {
    for (const [, conn] of this.conns) conn.socket.destroy();
    this.conns.clear();
    this.pending = [];
    // Les lectures en attente rendent un tampon vide : le script verra une
    // connexion fermée plutôt que de rester bloqué sur stdin pour toujours.
    for (const w of this.accepters.splice(0)) {
      w({ cid: 0, peer: '', data: VIDE });
    }
    this.server?.close();
    this.server = null;
    this.boundPort = 0;
  }
}
