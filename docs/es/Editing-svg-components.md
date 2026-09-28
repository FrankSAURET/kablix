# Editar los SVG de los componentes (y sus esquemas internos)

Esta guía explica **cómo retocar usted mismo el dibujo SVG de un componente de Kablix**, y **cómo funcionan / cómo modificar los esquemas internos** (el cableado que se muestra en transparencia cuando se selecciona un componente).

> Si lo hace, probablemente sea por una buena razón. Envíeme la versión corregida o haga una solicitud de publicación.
---

## 1. Las dos familias de componentes

| Familia | Dibujo SVG | ¿Editable por el usuario? |
| --- | --- | --- |
| **Componentes integrados** (`@wokwi/elements`: Uno, LED, resistencia…) | dentro del paquete `node_modules/@wokwi/elements` | No directamente (solo lectura) — vea §4 |
| **Componentes personalizados** (`.kablix-part.json`) | campo `svg` del archivo JSON | **Sí**, libremente |

La forma más sencilla de controlar un dibujo es por tanto pasar por un **componente personalizado**: creando uno, o exportando un componente existente para partir de su base.

---

## 2. La regla de oro: la cuadrícula de 10 px

Todos los pines deben caer en una **cuadrícula de 10 px** (= 0,1″, el paso de los agujeros de una protoboard y de la cuadrícula del lienzo). Si no, el componente no se inserta limpiamente.

- Trabaje con un **documento SVG cuya cuadrícula sea de 10 px**.
- Coloque cada punto de conexión (`pins[].x` / `pins[].y`) en un múltiplo de 10.
- `x`/`y` están en **píxeles, respecto a la esquina superior izquierda** de la etiqueta `<svg>` (dependen por tanto de `width`/`height` y del `viewBox`).

> Consejo: las placas `@wokwi/elements` usan el paso físico de 9,6 px; Kablix las escala automáticamente (`pinScale = 10/9.6`, vea `catalog.mts`). Para un componente **personalizado**, dibuje directamente al paso de 10 px.

---

## 3. Editar el SVG de un componente personalizado

### a. Conseguir una base

- Paleta → **⇪ Importar (.json)** de un archivo existente, o
- botón **+ Crear un componente** (paleta) → el editor integrado, o
- partir del ejemplo de referencia de la carpeta [`parts/`](../../parts) (`hc-sr04.kablix-part.json`).

Un `.kablix-part.json` tiene este aspecto:

```json
{
  "label": "Mi LED especial",
  "kind": "led",
  "svg": "<svg width=\"40\" height=\"56\" xmlns=\"http://www.w3.org/2000/svg\">…</svg>",
  "pins": [
    { "name": "A", "x": 10, "y": 50 },
    { "name": "K", "x": 30, "y": 50 }
  ],
  "pinRoles": { "A": "plus", "C": "minus" },
  "attrs": {}
}
```

(Formato completo: vea la ayuda integrada, sección *Formato de archivo de componente*, o [`docs/es/USAGE.md`](USAGE.md).)

### b. Editar el dibujo

Dos métodos:

1. **A mano (texto)**: el campo `svg` es una cadena SVG. Modifique los colores (`fill`, `stroke`), las formas (`rect`, `circle`, `path`)… Recuerde **escapar las comillas** (`\"`), ya que el SVG está dentro de una cadena JSON.

2. **En Inkscape / un editor SVG**:
   - ponga el documento con una cuadrícula de 10 px;
   - dibuje el componente, coloque los pines en la cuadrícula;
   - **Archivo → Guardar como → SVG simple**;
   - abra el `.svg`, copie todo el contenido `<svg>…</svg>` en **una sola línea** y péguelo (escapado) en el campo `svg` del JSON.

### c. Restricciones del dibujo

- Dé un `width`/`height` razonable (de 40 a 200 px) — es su tamaño en pantalla. No dude en contar los cuadros (10 px) en Kablix para un componente parecido.
- **Evite `<style>` y los scripts**; prefiera los atributos de presentación (`fill`, `stroke`, `stroke-width`…). Sobreviven a la exportación SVG del esquema.
- Dibuje un pad visible (un circulito) donde declare cada `pin`, para orientarse — el punto de conexión sigue siendo el **centro** de `(x, y)`.

### d. Volver a importar

Paleta → **⇪ Importar (.json)**. El componente (★) aparece, listo para colocar. Para afinarlo, **+ Crear / Editar** abre el editor: la vista previa se puede ampliar (−/+) y cada pin tiene **campos X / Y editables** directamente.

---

## 4. ¿Y los componentes integrados (@wokwi/elements)?

Sus SVG viven en `node_modules/@wokwi/elements/dist/esm/*-element.js` (licencia MIT) y se **incorporan al compilar**: no se modifican desde la interfaz. Dos opciones:

- **Recomendada**: rehacer una variante como **componente personalizado** (§3) y usarla en su lugar.
- **Avanzada** (recompilación): la placa Pico es un elemento «propio» ([`src/webview/composants/pico-board.mts`](../../src/webview/composants/pico-board.mts)), que parte del dibujo de Frank y le añade márgenes + nombres de pines. Es el modelo que seguir para construir un elemento integrado propio.

---

## 5. Editar los esquemas internos (vista K)

El **esquema interno** es el cableado mostrado en transparencia (sobre fondo blanco) o el patillaje (para las placas de microcontrolador) cuando se selecciona un componente y se pulsa el botón **K**. **No** se guarda en el `.kablix-part.json`: lo **genera el código**, en [`src/webview/diagram/internal-wiring.mts`](../../src/webview/diagram/internal-wiring.mts) (modificarlo = recompilar la extensión).

### Principio

- Una función por tipo de componente (`led`, `resistor`, `buzzer`, `led-bar`, `7segment`, `pushbutton`…).
- El reparto se hace por **`kind`** en `internalWiringSvg(kind, pins, attrs)`.
- Los trazados están en el **mismo sistema de coordenadas que los pines de `pinInfo`**: siguen por tanto automáticamente la rotación y el volteo del componente.

### Herramientas disponibles

```ts
line(a, b)                 // segmento entre dos puntos {x,y}
dot(p, r?)                 // pad negro (nodo)
mid(a, b)                  // punto medio de [a,b]
diode(from, to, catEnd)    // símbolo de diodo A→K (barra del lado `to` si catEnd)
find(pins, 'NAME')         // posición {x,y} de un pin por su nombre (o null)
```

### Añadir / modificar un esquema

1. Escriba una función `miComponente(pins, attrs?): string | null` que devuelva un fragmento SVG (montado con `line`/`dot`/`diode`), o `null` si faltan los pines esperados (`find` devuelve `null`).
2. Añada un `case '<kind>':` al `switch` de `internalWiringSvg`.
3. Recompile (`npm run build`). El botón K aparece automáticamente en los componentes de ese `kind` (cf. `editor.mts`, `internalWiringSvg(...)`).

> Ejemplo: `sevenSegment(pins, attrs)` lee `attrs.common` (`cathode`/`anode`) para orientar sus 8 diodos hacia el común — un esquema puede por tanto **variar según un atributo** del componente.

---

## 6. Resumen

| Quiero… | Dónde actuar |
| --- | --- |
| Cambiar el **dibujo** de un componente personalizado | campo `svg` del `.kablix-part.json` (§3) |
| Añadir mis **pines** al paso de 10 px | tabla `pins` del JSON (§2) |
| Modificar un componente **integrado** | rehacerlo como versión personalizada (§4) |
| Cambiar el **esquema interno** (vista K) | `src/webview/diagram/internal-wiring.mts` (§5) |
