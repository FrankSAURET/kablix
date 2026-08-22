# rp2350js — copie vendorisée

Ne rien modifier ici à la main : ce dossier est **régénéré** par
`node scripts/_vendor-rp2350js.mjs --source=<clone>`. Toute correction va dans
`patches/rp2350js/`, sinon elle disparaît à la prochaine mise à jour.

| | |
|---|---|
| Dépôt | https://github.com/c1570/rp2350js |
| Licence | MIT (voir `LICENSE`) |
| Commit | `757566f36ab3ae4d4286484af269ac70943099e5` |
| Daté du | 2026-08-13T22:43:52+02:00 |
| Sujet | Easier running of RP2040 NO_FLASH firmwares |
| Vendorisé le | 2026-08-22 |

## Patchs appliqués

- `patches/rp2350js/01-irq-gpio-et-csr-mcycle.patch`
- `patches/rp2350js/02-table-decodage-thumb16.patch`
- `patches/rp2350js/03-gpioc-mcrr.patch`

## Écarté de la copie

- `src/gdb/`
- `src/mcp/`
- `src/rp2-emu-cli/`
- `src/test/`
- `src/utils/emulator-controller.ts`
- tous les `*.spec.ts`

Ces modules parlent au disque, au réseau ou à stdio : ils ne peuvent pas tourner
dans une webview, et le moteur ne les appelle pas.

## Bouchons

`src/shims/` remplace deux imports Node que le cœur traîne encore :

- `fs`
- `uf2`

Ils ne sont atteints que par le chargement d'un firmware **depuis un fichier**,
chemin dont Kablix ne se sert pas : l'extension décode l'UF2 elle-même et pousse
des segments déjà prêts. Les bouchons lèvent une exception explicite si jamais
quelqu'un passe par là. Le reste de `load-firmware.ts` — dont la poignée de main
du démarrage RAM du RP2350 — reste utilisable tel quel.

## Différence avec l'amont

Les imports relatifs ont reçu leur extension `.js` explicite et le dossier est
déclaré `"type": "module"` — exigé par le `moduleResolution: Node16` du projet.
Transformation mécanique faite par le script, aucune ligne de logique touchée.
