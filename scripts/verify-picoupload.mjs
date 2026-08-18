// Banc du téléversement sur une VRAIE carte Pico (bouton ⇧ de l'onglet Python).
//
// Deux moitiés, toutes deux exécutées pour de vrai :
//
//  1. Le PLAN d'envoi (src/picoUploader.ts, bundlé par esbuild) : quel fichier
//     part, sous quel nom. On vérifie que le programme ouvert devient `main.py`,
//     que seuls les modules IMPORTÉS l'accompagnent (pas les autres .py du
//     dossier — Frank en a « deux tonnes »), et que `lib/` garde son chemin.
//
//  2. Le PROTOCOLE (scripts/pico-upload.py) : le script tourne réellement,
//     branché sur un FAUX Pico qui parle le raw REPL et exécute pour de bon les
//     commandes reçues (open/write/close, mkdir, sha256) dans un système de
//     fichiers en mémoire. On relit ensuite ce que la « carte » a reçu : c'est
//     le seul moyen de prouver que le fichier arrive entier et sous le bon nom
//     sans avoir une carte branchée.
//
// Utilisation : npm run verify:picoupload
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = join(ROOT, 'node_modules', '.cache-verify-picoupload');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

function eq(actual, expected, what) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what} : attendu ${e}, obtenu ${a}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Préparation : un dossier de programmes comme celui de Frank — un programme
// principal, deux modules qu'il importe (dont un dans lib/), et du bruit autour.
// ─────────────────────────────────────────────────────────────────────────────
rmSync(WORK, { recursive: true, force: true });
mkdirSync(join(WORK, 'lib'), { recursive: true });

writeFileSync(
  join(WORK, 'blink.py'),
  [
    'from machine import Pin',
    'import utime',
    'import lcd_api',
    'from helpers import blink',
    '',
    'led = Pin(25, Pin.OUT)',
    'blink(led)',
  ].join('\n')
);
writeFileSync(join(WORK, 'helpers.py'), 'import lcd_api\n\ndef blink(p):\n    p.toggle()\n');
writeFileSync(join(WORK, 'lib', 'lcd_api.py'), 'class LcdApi:\n    pass\n');
// Bruit : jamais importés par blink.py, donc jamais envoyés.
writeFileSync(join(WORK, 'autre-programme.py'), 'print("je ne dois pas partir")\n');
writeFileSync(join(WORK, 'encore-un.py'), 'print("moi non plus")\n');
writeFileSync(join(WORK, 'notes.txt'), 'pas du python\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Le plan d'envoi
// ─────────────────────────────────────────────────────────────────────────────
const bundle = join(WORK, 'uploader.mjs');
await build({
  entryPoints: [join(ROOT, 'src', 'picoUploader.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
  // `vscode` n'existe pas hors de l'hôte d'extension : le plan n'y touche pas,
  // mais le module l'importe en tête. Un bouchon suffit.
  external: ['vscode'],
  plugins: [
    {
      name: 'stub-vscode',
      setup(b) {
        b.onResolve({ filter: /^vscode$/ }, () => ({ path: 'vscode', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: 'export const commands={executeCommand(){}};export const window={};export const l10n={t:(s)=>s};export const ProgressLocation={Notification:15};',
          loader: 'js',
        }));
      },
    },
  ],
});
const { planUpload } = await import(`file://${bundle.replace(/\\/g, '/')}`);

const plan = planUpload(join(WORK, 'blink.py'));
const remotes = plan.map((p) => p.remotePath).sort();

check('le programme ouvert devient main.py', () => {
  const main = plan.find((p) => p.isMain);
  if (!main) throw new Error('aucun fichier marqué « programme principal »');
  eq(main.remotePath, 'main.py', 'nom sur la carte');
  if (!main.localPath.endsWith('blink.py')) {
    throw new Error(`source attendue blink.py, obtenue ${main.localPath}`);
  }
});

check('les modules importés partent avec lui', () => {
  if (!remotes.includes('helpers.py')) throw new Error(`helpers.py manque : ${remotes}`);
  if (!remotes.includes('lib/lcd_api.py')) throw new Error(`lib/lcd_api.py manque : ${remotes}`);
});

check('un module de lib/ garde son chemin (il est dans sys.path)', () => {
  const lcd = plan.find((p) => p.remotePath.endsWith('lcd_api.py'));
  eq(lcd.remotePath, 'lib/lcd_api.py', 'chemin sur la carte');
});

check('les .py NON importés du dossier restent à terre', () => {
  for (const bruit of ['autre-programme.py', 'encore-un.py']) {
    if (remotes.some((r) => r.includes(bruit))) {
      throw new Error(`${bruit} n'aurait jamais dû être envoyé : ${remotes}`);
    }
  }
});

check('un import transitif est suivi (blink → helpers → lcd_api)', () => {
  // lcd_api n'est importé qu'à travers helpers.py : sans le parcours transitif,
  // le programme planterait sur la carte avec ImportError.
  writeFileSync(join(WORK, 'seul.py'), 'from helpers import blink\nblink(None)\n');
  const p = planUpload(join(WORK, 'seul.py')).map((x) => x.remotePath).sort();
  eq(p, ['helpers.py', 'lib/lcd_api.py', 'main.py'], 'plan transitif');
});

check('un programme sans import ne part pas accompagné', () => {
  writeFileSync(join(WORK, 'solo.py'), 'print("bonjour")\n');
  const p = planUpload(join(WORK, 'solo.py'));
  eq(p.length, 1, 'nombre de fichiers');
  eq(p[0].remotePath, 'main.py', 'nom sur la carte');
  // C'est ce cas qui NE doit poser aucune question : un seul fichier.
});

check('un fichier déjà nommé main.py n’est pas envoyé deux fois', () => {
  writeFileSync(join(WORK, 'main.py'), 'print("principal")\n');
  writeFileSync(join(WORK, 'depuis-main.py'), 'import main\nprint(main)\n');
  const p = planUpload(join(WORK, 'depuis-main.py')).map((x) => x.remotePath);
  eq(p.filter((r) => r === 'main.py').length, 1, 'occurrences de main.py');
  rmSync(join(WORK, 'main.py'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Le protocole, contre un faux Pico
// ─────────────────────────────────────────────────────────────────────────────
const python = process.platform === 'win32' ? 'python' : 'python3';
let pythonOk = true;
try {
  execFileSync(python, ['-c', 'import serial'], { stdio: 'ignore' });
} catch {
  pythonOk = false;
}

if (!pythonOk) {
  console.log('  … protocole : ignoré (python + pyserial absents de cette machine)');
} else {
  writeFileSync(join(WORK, 'faux-pico.py'), sourceFauxPico());
  const plan2 = planUpload(join(WORK, 'blink.py'));
  const payload = JSON.stringify(
    plan2.map((p) => ({ path: p.localPath, remote: p.remotePath }))
  );

  let out = '';
  let ran = true;
  try {
    out = execFileSync(python, [join(WORK, 'faux-pico.py'), payload], {
      encoding: 'utf-8',
      cwd: WORK,
    });
  } catch (err) {
    ran = false;
    out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }

  check('le transfert va au bout sur une carte qui répond', () => {
    if (!ran) throw new Error(`le script a échoué :\n${out}`);
    if (!/DONE: 3 sent/.test(out)) throw new Error(`résumé inattendu :\n${out}`);
  });

  const landed = existsSync(join(WORK, 'recu.json'))
    ? JSON.parse(readFileSync(join(WORK, 'recu.json'), 'utf-8'))
    : {};

  check('la carte reçoit bien main.py, et c’est le programme ouvert', () => {
    if (!landed['main.py']) throw new Error(`main.py absent : ${Object.keys(landed)}`);
    const source = readFileSync(join(WORK, 'blink.py'), 'utf-8');
    eq(landed['main.py'], source, 'contenu de main.py sur la carte');
  });

  check('le fichier arrive ENTIER (rien de tronqué par le REPL)', () => {
    const source = readFileSync(join(WORK, 'lib', 'lcd_api.py'), 'utf-8');
    eq(landed['lib/lcd_api.py'], source, 'contenu du module');
  });

  check('les dossiers sont créés sur la carte', () => {
    if (!landed['lib/lcd_api.py']) {
      throw new Error(`le module de lib/ n'est pas arrivé : ${Object.keys(landed)}`);
    }
  });

  check('un fichier déjà identique n’est PAS réécrit', () => {
    // Deuxième passage : la carte a déjà tout, en mémoire du faux Pico.
    const again = execFileSync(python, [join(WORK, 'faux-pico.py'), payload, '--garder'], {
      encoding: 'utf-8',
      cwd: WORK,
    });
    if (!/DONE: 0 sent, 3 already up to date/.test(again)) {
      throw new Error(`le second envoi aurait dû tout sauter :\n${again}`);
    }
  });

  check('un contenu modifié est bien réécrit, lui', () => {
    writeFileSync(join(WORK, 'lib', 'lcd_api.py'), 'class LcdApi:\n    VERSION = 2\n');
    const again = execFileSync(python, [join(WORK, 'faux-pico.py'), payload, '--garder'], {
      encoding: 'utf-8',
      cwd: WORK,
    });
    if (!/DONE: 1 sent, 2 already up to date/.test(again)) {
      throw new Error(`seul le module modifié devait repartir :\n${again}`);
    }
  });

  check('un port muet (pas de MicroPython) est signalé, pas planté', () => {
    let text = '';
    try {
      execFileSync(python, [join(WORK, 'faux-pico.py'), payload, '--muet'], {
        encoding: 'utf-8',
        cwd: WORK,
      });
      throw new Error('le script aurait dû sortir en erreur');
    } catch (err) {
      text = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }
    if (!/ERROR: no MicroPython prompt/.test(text)) {
      throw new Error(`message d'erreur attendu, obtenu :\n${text}`);
    }
  });
}

console.log(`\n${passed} contrôle(s) OK, ${failed} échec(s)`);
process.exit(failed === 0 ? 0 : 1);

// ─────────────────────────────────────────────────────────────────────────────
// Le faux Pico : un module `serial` de substitution qui joue le raw REPL et
// EXÉCUTE les commandes reçues. Il est écrit dans le dossier de travail puis
// lancé à la place du vrai script — celui-ci importe `serial` sans savoir.
// ─────────────────────────────────────────────────────────────────────────────
function sourceFauxPico() {
  return `# Faux Pico : rejoue le raw REPL de MicroPython en memoire.
import sys, os, json, types, builtins, hashlib, binascii

MUET = '--muet' in sys.argv
GARDER = '--garder' in sys.argv
ETAT = 'recu.json'

# Le systeme de fichiers de la « carte » survit d'un lancement a l'autre quand on
# passe --garder : c'est ce qui permet de tester le saut des fichiers a jour.
FICHIERS = {}
if GARDER and os.path.isfile(ETAT):
    with open(ETAT) as fh:
        FICHIERS = json.load(fh)

class SerialException(Exception):
    pass

class Serial:
    """Carte simulee. Recoit des blocs de code, les execute, repond comme le raw REPL."""

    def __init__(self, port, baud, timeout=0.1):
        self.buf = b''       # ce que la carte a a dire
        self.pending = b''   # code recu, pas encore execute
        self.raw = False
        self.ns = {}         # espace de noms du « MicroPython » simule

    # -- cote PC : ecriture vers la carte ------------------------------------
    def write(self, data):
        for byte in bytes(data):
            b = bytes([byte])
            if b == b'\\x03':          # Ctrl-C : interruption
                self.pending = b''
            elif b == b'\\x01':        # Ctrl-A : entree en raw REPL
                if not MUET:
                    self.raw = True
                    self.buf += b'raw REPL; CTRL-B to exit\\r\\n>'
            elif b == b'\\x02':        # Ctrl-B : sortie du raw REPL
                self.raw = False
            elif b == b'\\x04':        # Ctrl-D : execute ce qui a ete recu
                self._executer()
            elif self.raw:
                self.pending += b

    def flush(self):
        pass

    def _executer(self):
        code = self.pending.decode('utf-8')
        self.pending = b''
        sortie = []
        # Les builtins de la « carte » : open() et les imports tapent dans le
        # systeme de fichiers simule, jamais dans celui de la machine. Sans ca,
        # « import os » rendrait le vrai os et os.mkdir creerait un vrai dossier.
        bi = dict(vars(builtins))
        bi['open'] = _ouvrir
        bi['print'] = lambda *a, **k: sortie.append(' '.join(str(x) for x in a))
        bi['__import__'] = _importer
        # self.ns persiste entre deux blocs : « _f = open(...) » d'un bloc doit
        # rester visible du bloc suivant qui ecrit dedans.
        env = self.ns
        env['__builtins__'] = bi
        try:
            exec(code, env)
            self.buf += b'OK' + ('\\n'.join(sortie)).encode() + b'\\x04\\x04>'
        except Exception as exc:
            self.buf += b'OK\\x04' + repr(exc).encode() + b'\\x04>'

    # -- cote PC : lecture depuis la carte -----------------------------------
    @property
    def in_waiting(self):
        return len(self.buf)

    def read(self, n=1):
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def reset_input_buffer(self):
        self.buf = b''

    def close(self):
        with open(ETAT, 'w') as fh:
            json.dump(FICHIERS, fh)


class _Fichier:
    """Fichier de la carte : accumule les octets ecrits, les depose a la fermeture."""

    def __init__(self, nom, mode):
        self.nom = nom
        self.mode = mode
        self.data = b''
        if 'r' in mode:
            if nom not in FICHIERS:
                raise OSError(2, 'No such file')
            self.data = FICHIERS[nom].encode('utf-8')
        self.pos = 0

    def write(self, b):
        self.data += bytes(b)

    def read(self, n=-1):
        if n < 0:
            n = len(self.data) - self.pos
        out = self.data[self.pos:self.pos + n]
        self.pos += len(out)
        return out

    def close(self):
        if 'w' in self.mode:
            FICHIERS[self.nom] = self.data.decode('utf-8')


def _ouvrir(nom, mode='r'):
    return _Fichier(nom, mode)


DOSSIERS = set()


def _mkdir(chemin):
    if chemin in DOSSIERS:
        raise OSError(17, 'EEXIST')   # deja la : le script doit l'avaler
    DOSSIERS.add(chemin)


# Les modules que la « carte » expose. uhashlib/ubinascii n'existent pas en
# CPython : sans cette table, le script planterait des le calcul d'empreinte.
FAUX_OS = types.SimpleNamespace(mkdir=_mkdir)
MODULES = {'os': FAUX_OS, 'uhashlib': hashlib, 'ubinascii': binascii}


def _importer(nom, *a, **k):
    return MODULES.get(nom) or __import__(nom, *a, **k)


# Branche la fausse carte a la place de pyserial, puis lance le VRAI script.
faux = types.ModuleType('serial')
faux.Serial = Serial
faux.SerialException = SerialException
sys.modules['serial'] = faux

ici = os.path.dirname(os.path.abspath(__file__))
vrai = os.path.join(ici, '..', '..', 'scripts', 'pico-upload.py')
sys.argv = ['pico-upload.py', '--port', 'FAKE', '--files', sys.argv[1]]
code = open(vrai, encoding='utf-8').read()
exec(compile(code, vrai, 'exec'), {'__name__': '__main__', '__file__': vrai})
`;
}
