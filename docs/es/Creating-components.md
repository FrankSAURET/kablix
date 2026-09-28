# Crear un componente de Kablix (dibujo, esquema interno, simulación)

Esta guía describe la cadena completa que ha seguido cada componente añadido desde la v2026.7.229: **un dibujo en `Composants2D.svg` → un componente que se puede colocar, cablear, simular, probar y documentar**. Está pensada para quien trabaja en **el repositorio** (componente integrado, recompilación); para un componente que usted se queda, sin tocar el código, la vía rápida sigue siendo el archivo `.kablix-part.json` descrito en [Retocar el SVG de los componentes](Editing-svg-components.md).

Dos maneras de seguirla: [a mano](#a-mano-la-cadena-completa), paso a paso, o [confiándola a una IA](#con-una-ia) a la que usted proporciona el dibujo y las reglas del juego. Ambas pasan por los mismos archivos: la sección IA no es más que un atajo por el mismo camino.

---

## Lo que necesita

- El repositorio clonado, `npm install` hecho, Node 20+.
- **Inkscape** (o cualquier editor SVG) para dibujar en `Composants2D.svg`.
- **Chrome / Chromium** instalado: la extracción y las capturas de las ilustraciones pasan por un navegador sin interfaz (la geometría SVG —CTM, `getBBox`, `defs`— no se puede resolver con expresiones regulares).

---

## La cadena de un vistazo

| # | Paso | Archivo(s) afectado(s) |
| --- | --- | --- |
| 1 | Dibujar el componente y su esquema interno | `Composants2D.svg` |
| 2 | Extraer los SVG | `src/webview/composants/externe/<type>.svg`, `.../interne/<type>-interne.svg` |
| 3 | Escribir el elemento | `src/webview/composants/<type>-element.mts` + un import en `src/webview/sim.mts` |
| 4 | Registrarlo en el catálogo | `src/webview/diagram/catalog.mts`, `src/webview/diagram/refnames.mts` |
| 5 | Conectar el esquema interno | `src/webview/diagram/internal-wiring.mts` |
| 6 | Darle un comportamiento | `src/webview/diagram/model.mts` o `src/webview/engines/*.mts` |
| 7 | Traducir | `src/webview/i18n.mts` |
| 8 | Dos archivos de prueba (Uno + Pico) | `testkablix/_spec.mjs`, `testkablix/README.md` |
| 9 | La ficha de ayuda en FR + EN y su ilustración | `docs/{fr,en}/composants/<type>.md`, `docs/img/composants/<type>.webp` |
| 10 | Entregar | `todo.md`, `package.json`, build, `verify:all`, commit |

Un componente puramente decorativo se detiene en el paso 5. Un componente que debe *hacer* algo durante la simulación recorre todo el camino.

---

## A mano, la cadena completa

### 1. Dibujar en `Composants2D.svg`

`Composants2D.svg` es una plancha A3 de Inkscape (unidades en **mm**) que reúne los dibujos de los componentes **planos** de la biblioteca. Las piezas puestas en volumen (perfiles, ensamblajes, el robot araña) tienen su propia plancha, `Composants3D.svg`; ver [Dibujar sistemas en 3D](Drawing-systems.md). La antigua plancha única `Composants.svg` se sigue leyendo como respaldo mientras exista. Las reglas no son decorativas: el extractor se apoya en ellas.

- **Un componente = un grupo cuyo `id` es el nombre del componente** (`diode`, `relais`, `moteur-dc`). Ese nombre pasa a ser el `type` del componente en todo el resto de la cadena.
- **Su esquema interno = un grupo llamado `<nombre>-interne`** (`diode-interne`). Sin grupo interno, simplemente no hay botón **K** en el componente.
- El dibujo exterior y el esquema interno llevan **las mismas patas**: mismos nombres, mismo orden, mismas posiciones. Eso es lo que permite superponer uno al otro sin ningún realineamiento.
- Las **pastillas rojas** (círculos con `fill:#ee0000`) marcan los puntos de conexión; **el centro de la pastilla es donde se engancha el cable**. El texto colocado justo encima da **el nombre de la pata** (`A`, `K`, `B1`, `VCC`…). `nc` significa no conectada: dibujada, pero sin punto de enganche.
- Pastillas y etiquetas son **marcas de trabajo**: el extractor las quita del dibujo entregado.

> El paso de 10 px (0,1″, el paso de los agujeros de una protoboard) es la única restricción geométrica estricta. El extractor elige el marco entregado de modo que **cada pastilla caiga en un múltiplo de 10 px**, con al menos 10 px de margen alrededor; si su dibujo pone dos patas a 9,7 px, ningún marco lo salvará.

### 2. Extraer los SVG

```bash
node scripts/_extract-composants.mjs diode
```

Resultado: `src/webview/composants/externe/diode.svg` (dibujo limpio, en píxeles de la cuadrícula) y, si el grupo existe, `src/webview/composants/interne/diode-interne.svg`. El comando muestra el marco elegido y la posición de cada pata: **esa lista da las coordenadas que hay que copiar en `pinInfo`**.

| Opción | Efecto |
| --- | --- |
| `--png` | Produce solo una vista previa PNG, sin escribir nada en `src/`, para revisar un dibujo en curso. |
| `--drop=id1,id2` | Deja fuera del dibujo elementos por su `id` (una etiqueta de la plancha, una marca de construcción). |
| `--suffix=-libre` | Añade un sufijo al nombre del archivo producido (dos variantes del mismo grupo). |
| `NPN1@to92` | Extrae `NPN1` **como esquema interno**, alineado con el marco del encapsulado `to92` ya extraído (ver más abajo). |

Se pueden extraer varios nombres de una vez en la misma línea de comandos; un encapsulado citado como anfitrión (`…@to92`) debe aparecer **antes** en la línea.

> Volver a extraer un componente reescribe **también su dibujo exterior**. Si ese archivo exterior se había retocado desde entonces (una inscripción de encapsulado, por ejemplo), restáurelo con `git checkout` después de la extracción, y vuelva a capturar la ilustración de la ayuda.

### 3. Escribir el elemento

Un componente visible es un elemento Lit en `src/webview/composants/<type>-element.mts`. Desde la v2026.6.87 ya no queda ninguna dependencia de `@wokwi/elements`: son **forks locales**, etiquetas `kablix-*`, **Lit directo sin decoradores** (`static properties` + `declare`). El modelo más corto es [`diode-element.mts`](../../src/webview/composants/diode-element.mts):

```ts
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/diode.svg';

export class DiodeElement extends LitElement {
  // Threshold voltage (V) — informative on the drawing side, used by the model.
  declare vf: number;

  static properties = {
    vf: { type: Number },
  };

  constructor() {
    super();
    this.vf = 0.6;
  }

  // Pins: centre of the drawing pads (10 px grid, K on the band side).
  readonly pinInfo: ElementPin[] = [
    { name: 'K', x: 10, y: 10, signals: [] },
    { name: 'A', x: 50, y: 10, signals: [] },
  ];

  static get styles() {
    return css`
      :host { display: inline-block; }
    `;
  }

  render() {
    return html`
      <svg width="60" height="20" viewBox="0 0 60 20" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-diode')) {
  customElements.define('kablix-diode', DiodeElement);
}
```

Tres cosas que no hay que olvidar:

1. `width`, `height` y `viewBox` del `<svg>` repiten **exactamente** el marco anunciado por el extractor; `pinInfo` repite **exactamente** las posiciones anunciadas.
2. Cada propiedad se declara dos veces: `declare` (para TypeScript) y `static properties` (para Lit). Si olvida el lado `properties`, el atributo no redibuja nada.
3. El archivo no hace nada mientras no se **importe**: añada `import './composants/<type>-element.mjs';` a la lista del principio de [`src/webview/sim.mts`](../../src/webview/sim.mts) (extensión `.mjs`: es el nombre compilado).

#### Encapsulados compartidos (TO-92, TO-220…)

Un encapsulado sirve a decenas de componentes: **es un dibujo, no un componente**. Su SVG vive en `src/webview/composants/externe/<encapsulado>.svg` y el elemento lo **viste**: la inscripción (`PN`, `2222A`…) la escribe el componente, nunca el dibujo. Añadir un encapsulado significa **una entrada en la tabla `PACKAGES`** de [`transistor-element.mts`](../../src/webview/composants/transistor-element.mts), no un nuevo elemento:

```ts
export const PACKAGES = {
  to92:  { svg: to92,  w: 40, h: 50, pinY: 40, pinX: [10, 20, 30], tx: 19.77, cy: 15.47, tw: 11.8, font: 3.8, fill: '#e6e6e6' },
  to220: { svg: to220, w: 60, h: 90, pinY: 80, pinX: [20, 30, 40], tx: 30,    cy: 50.25, tw: 32,   font: 5.5, fill: '#e6e6e6' },
} as const;
```

Conviven dos niveles: la **referencia fija** (`pn2222a`: inscripción y parámetros fijados) y el **prototipo genérico** (`npn`, `pnp`: todo es propiedad). Un esquema interno se reutilizará: manténgalo genérico, patas numeradas 1/2/3 en el lado del prototipo, con nombre en el lado de la referencia.

### 4. Registrarlo en el catálogo

[`catalog.mts`](../../src/webview/diagram/catalog.mts) es la lista de componentes de la paleta. Basta con una entrada:

```ts
{
  type: 'diode', label: 'Diode', tag: 'kablix-diode', kind: 'diode', attrs: { vf: '0.6' },
  props: [
    { attr: 'vf', label: 'Threshold voltage (V)', kind: 'number', min: 0, max: 5, step: 0.1 },
  ],
},
```

| Campo | Papel |
| --- | --- |
| `type` | Identificador del componente: nombre del grupo SVG, nombre de la ficha de ayuda, nombre dentro de los archivos `.projix`. **No cambia nunca** una vez publicado (los proyectos guardados lo contienen). |
| `label` | Nombre mostrado, **escrito en inglés**: es la clave de traducción (paso 7). |
| `tag` | Etiqueta del elemento (`kablix-…`). |
| `kind` | Familia de comportamiento (`diode`, `resistor`, `transistor`, `logic-ic`, `motor`…). Decide a la vez la **simulación** y la **categoría de la paleta** (función al final de `catalog.mts`, orden en `CATEGORY_ORDER`). |
| `attrs` | Valores por defecto de las propiedades, como cadenas. |
| `props` | Lo que muestra el inspector: `number` (con `min`/`max`/`step`, `suffixes: true` para k/M), `select` (con `options`), `text`. |
| `simControl` | `true` si el componente lleva un cursor o un botón **durante la simulación** (ver paso 6). |
| `variant` | `true` para un tipo que sigue siendo válido pero **ya no aparece** en la paleta (una antigua variante de un componente fusionado). |

Añada por último su **prefijo de referencia** en [`refnames.mts`](../../src/webview/diagram/refnames.mts): la tabla `FAMILIES` da el prefijo por idioma (`diode: { en: 'D', fr: 'D' }`) y la tabla siguiente asocia el `kind` a su familia. Sin ello, el componente colocado recibiría el nombre del comodín por defecto.

### 5. Conectar el esquema interno

El esquema interno es el cableado que se muestra con el botón **K**. Se monta en [`internal-wiring.mts`](../../src/webview/diagram/internal-wiring.mts):

```ts
import diodeSchema from '../composants/interne/diode-interne.svg';
const DIODE_SCHEMA = parseSchema(diodeSchema);
```

Dos casos:

- **Esquema dibujado con el componente** (grupo `<nombre>-interne`): mismo `viewBox` que el dibujo exterior, así que **se superpone tal cual**, simplemente escalado a la caja del componente.
- **Esquema de encapsulado compartido** (`NPN1`, `PNP1`, `NMOS-D`…): se coloca **por traslación sobre la pata 1** (constante `TRANSISTOR_SCHEMA_PIN1`), **nunca con `scale`**. Eso es lo que hace que un TO-220, el doble de alto que un TO-92, conserve su símbolo a la misma distancia de sus patas. Si cambia el marco de un encapsulado, esa constante le sigue.

Un esquema puede variar según un atributo: el visualizador de siete segmentos orienta sus ocho diodos hacia la pata común según `attrs.common`, y los transistores eligen su símbolo según el atributo `schema`.

### 6. Darle un comportamiento de simulación

Tres vías, según la naturaleza del componente. **No invente nada**: el comportamiento esperado se decide caso por caso, no se deduce del dibujo.

**a. Componente eléctrico**: [`model.mts`](../../src/webview/diagram/model.mts). Aquí vive la netlist: propagación de niveles (`netLevel`), grafo resistivo, divisores, corrientes. El `kind` es el conmutador. Ejemplo del diodo: una arista **orientada** que solo deja pasar la corriente de A a K, perdiendo su tensión umbral (`vf`), lo que basta para bajar en esa cantidad la tensión de un LED situado aguas abajo.

**b. Componente ajustable durante la simulación**: `simControl: true` en el catálogo. El editor pone entonces el atributo `simulating` en el elemento mientras dura la simulación (y lo quita al detenerla); el elemento muestra su cursor o su botón **solo en ese estado**, y emite un evento `input` que `sim.mts` lee para actualizar el valor. Así están hechos la LDR, la NTC, el potenciómetro y los sensores de llama y de gas.

**c. Dispositivo de bus o componente de protocolo**: `src/webview/engines/`: `i2c-devices.mts` (LCD, OLED, PCA9685…), `ws2812.mts`, `ultrasonic.mts`, `dht22.mts`. Lo que se implementa ahí es la conversación, no la electricidad.

Un fallo de cableado (diodo de rueda libre ausente, alimentación fuera de rango, LED sin resistencia) se señala con un mensaje de error **traducido** y, cuando procede, haciendo estallar el componente culpable: la etiqueta explica la causa, no se limita a nombrarla.

### 7. Traducir

Las cadenas fuente están **en inglés**; [`i18n.mts`](../../src/webview/i18n.mts) contiene el diccionario francés, clave inglesa → traducción (y `i18n-es.mts`, `i18n-zh.mts` los demás idiomas, completados en el lote de traducción antes de publicar). Afecta a: el `label` del catálogo, los `label` de las propiedades, los nombres de patas mostrados, los textos de los mandos de simulación y los mensajes de fallo. Todo lo que lee el usuario pasa por ahí. `npm run verify:i18n` señala las claves huérfanas.

### 8. Los archivos de prueba

Cada componente nuevo recibe **dos** pruebas: una Arduino (`<type>-uno`) y una Pico (`<type>-pico`). No se escriben a mano: el montaje se describe en [`testkablix/_spec.mjs`](../../testkablix/_spec.mjs) (patas conocidas del tipo en `PART_PINS`, luego un bloque `test({ name, board, ext, parts, wires, code })`) y después se generan:

```bash
node testkablix/_generate.mjs diode-uno diode-pico
```

> **Nombre siempre las pruebas que hay que generar.** Sin argumento, `_generate.mjs` reescribe **todos** los archivos de la carpeta a partir de la spec, y varios `.ino`/`.py` se retocaron a mano después de generarse. Del mismo modo, un montaje de prueba ya retocado conserva los `x`/`y` de su spec: rehacer una prueba no redistribuye el montaje.

Añada la línea del componente en `testkablix/README.md` y luego una comprobación automática si el comportamiento se presta a ello: los scripts `scripts/verify-*.mjs` renderizan el editor real en Chrome sin interfaz y miden el resultado (`npm run verify:transistor`, `verify:motor`, `verify:capacitor`…).

### 9. La ficha de ayuda

Obligatoria, **en francés y en inglés**: `docs/fr/composants/<type>.md` y `docs/en/composants/<type>.md`, con al menos una ilustración (las versiones `docs/es/` y `docs/zh/` llegan con el lote de traducción). La ilustración se produce capturando el elemento real, nunca con una captura de pantalla hecha a mano:

```bash
node scripts/_capture-part.mjs diode
```

El script renderiza el elemento en Chrome sin interfaz, sobre fondo transparente, y escribe `docs/img/composants/<type>.webp`. Antes hay que describir la variante que se va a ilustrar en su tabla `PARTS` (módulo, etiqueta, atributos, anchura de salida si el componente es estrecho y alto). `npm run verify:docs` comprueba después la paridad FR/EN, la presencia de las ilustraciones y que ningún tipo del catálogo se haya quedado sin ficha.

### 10. Entregar

```bash
npm run typecheck
npm run build
npm run verify:all
```

Después, el ritual del repositorio: `todo.md` al día (número de versión **encima** de sus elementos), versión incrementada en `package.json` (`AÑO.MES.incremento`), commit, push. El `.vsix` solo se construye a petición.

---

## Con una IA

Una IA agéntica (Claude Code, por ejemplo) maneja muy bien los pasos 2 a 9: son pasos mecánicos, guiados por archivos existentes que sirven de modelo. **No** hace el paso 1 —el dibujo— y **no** adivina el comportamiento eléctrico esperado.

### Lo que ya sabe

El archivo `CLAUDE.md` en la raíz del repositorio describe las convenciones (la plancha `Composants2D.svg`, los encapsulados compartidos, las pruebas obligatorias, la ficha de ayuda obligatoria, el estilo de código). Una IA que lee el repositorio empieza, por tanto, con las reglas en la mano: no hace falta repetirlas en su petición.

### Lo que tiene que decirle

Estos cinco puntos no están escritos en ninguna parte del código:

1. **El nombre exacto del grupo** que acaba de dibujar en `Composants2D.svg`: el archivo también contiene trabajos en curso, que no hay que tomar.
2. **El comportamiento en simulación**, con palabras sencillas: «el diodo solo conduce de A a K, perdiendo `vf`», «por encima de 1,5 veces su tensión nominal el motor se quema», «sin diodo de rueda libre el transistor revienta». Sin esa frase, la IA inventará un modelo plausible y falso.
3. **Las propiedades** mostradas en el inspector, con sus unidades, sus límites y su valor por defecto.
4. Para un encapsulado compartido: **lo que lleva escrito** (una línea por salto de línea) y **qué esquema interno** lleva.
5. Lo que quiere ver en los **montajes de prueba**; si no, elegirá uno plausible, y le tocará a usted leerlo.

### Una plantilla de petición

```text
Añade el componente <nombre> a Kablix. El dibujo y su esquema interno
<nombre>-interne están en Composants2D.svg.

Patas: <lista y papel de cada pata>.
Propiedades: <nombre, unidad, límites, valor por defecto>.
Simulación: <el comportamiento en una o dos frases, fallos incluidos>.

Haz la cadena completa: extracción, elemento, catálogo, prefijo de referencia,
esquema interno, modelo de simulación, traducciones FR/EN, pruebas
<nombre>-uno y <nombre>-pico (generadas, no escritas a mano), ficha de ayuda
en FR + EN con su ilustración capturada. Luego typecheck, build, verify:all.
```

Señale un componente cercano ya integrado (`diode` para uno de dos patas, `transistor` para un encapsulado compartido, `moteur-dc` para un actuador con fallos): «hazlo como el diodo» ahorra muchas idas y vueltas.

### Lo que hay que revisar

| Qué revisar | Por qué |
| --- | --- |
| Las posiciones de `pinInfo` | Una cifra mal copiada desplaza todas las conexiones del componente. |
| El modelo de simulación | Es el único lugar donde una IA puede producir algo coherente **y** falso. |
| Los archivos de prueba regenerados | `git status` solo debe mostrar las pruebas del lote: generar sin argumento sobrescribe toda la carpeta. |
| La ilustración de la ficha de ayuda | Debe venir de `_capture-part.mjs`, no de una captura de pantalla. |
| La redacción de fichas y mensajes | Las frases traducidas palabra por palabra saltan a la vista. |

---

## Referencia rápida

- El nombre del grupo SVG = el `type` del componente = el nombre de su ficha de ayuda = el nombre de sus pruebas. Un solo nombre, en todas partes.
- El centro de una pastilla roja es el punto de conexión; todo cae en la cuadrícula de 10 px.
- Dibujo exterior y esquema interno llevan las mismas patas, en el mismo orden.
- Un encapsulado es un dibujo compartido: se viste, no se duplica.
- Nada aparece hasta que el elemento se importa en `sim.mts` **y** se registra en `catalog.mts`.
- Dos pruebas (Uno + Pico) y dos fichas de ayuda (FR + EN): no son opcionales.
- `_generate.mjs` sin argumento sobrescribe toda la carpeta de pruebas.
