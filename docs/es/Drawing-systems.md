# Dibujar sistemas en 3D (araña, patas, placas)

El robot araña y su pata no son archivos SVG pegados en pantalla: son **volúmenes calculados en cada imagen** por el motor isométrico [`iso3d.mts`](../../src/webview/composants/iso3d.mts). Eso es lo que permite que una pata se levante de verdad: un dibujo plano producía la misma imagen tanto si se giraba la coxa como si se doblaba la patela.

El precio era que las formas estaban **fijadas en el código**: el chasis era `regularPoly(8, 55)`, un octógono; los huesos, cajas. Ni un solo trazo de lápiz. Esta guía describe el camino abierto en la v2026.8.23: **usted dibuja el contorno de una pieza y el motor la convierte en volumen**. El dibujo sigue siendo suyo; la cinemática, el sombreado y la ordenación en profundidad siguen siendo del motor.

Hay **dos maneras** de dibujar, y la guía las trata en orden:

| | Lo que usted dibuja | Lo que sale | Para |
| --- | --- | --- | --- |
| **Perfil** | **una** pieza plana, a cualquier escala | la pieza, escalada por el componente | una silueta: el chasis del robot, un hueso de pata, una placa |
| **Ensamblaje** | **varias** piezas planas, **en milímetros**, cada una con su pose | el montaje completo, cotas conservadas | un cuerpo en sándwich: dos flancos de 3 mm con los servos entre ellos |

La diferencia cabe en una frase: en un perfil solo cuentan las **proporciones**; en un ensamblaje **las cotas son la información**: entre dos flancos, 3 mm de material y 25 mm de hueco no se recalculan, se miden.

Esta guía está dirigida a quienes trabajan en **el repositorio**. Para un componente plano corriente (un diodo, un sensor), la cadena es otra y se describe en [Crear un componente de Kablix](Creating-components.md).

¿Tiene prisa? Vaya a [dibujo original, y lo que sale](#dibujo-original-y-lo-que-sale): tres imágenes valen la página. ¿Viene por el cuerpo en sándwich? Es [Ensamblar varias piezas](#ensamblar-varias-piezas). ¿Atascado con una pata que no se monta como quería? Es [Dibujar una pata, de la coxa al pie](#dibujar-una-pata-de-la-coxa-al-pie), y su tabla de síntomas.

---

## Lo que necesita

- El repositorio clonado, `npm install` hecho, Node 20+.
- **Inkscape** (o cualquier editor SVG) para dibujar en `Composants3D.svg`.
- **Chrome / Chromium** instalado: los contornos se leen a través de un navegador sin interfaz. Aplanar a mano en Node curvas de Bézier y arcos elípticos sería escribir dos veces código erróneo: `getPointAtLength` lo hace bien, y gratis.

### Dos planchas, no una

Los dibujos originales viven en **dos** planchas A3 en la raíz del repositorio:

| Plancha | Lo que se dibuja en ella | Quién la lee |
| --- | --- | --- |
| `Composants2D.svg` | los componentes **planos** de la biblioteca: dibujo exterior y esquema interno de un diodo, un relé, un transistor | `node scripts/_extract-composants.mjs` |
| `Composants3D.svg` | las piezas puestas **en volumen**: perfiles, ensamblajes, el robot araña | `npm run profil`, `npm run assemblage`, `npm run montre` |

Esta guía solo trata la **segunda**. Las herramientas la eligen solas; `--source=` lee una plancha aparte (los ejemplos de esta guía vienen de `docs/exemples/`). La antigua plancha única `Composants.svg` se sigue leyendo como respaldo mientras exista: nada se rompe durante la separación.

---

## La cadena de un vistazo

**Un perfil**: una pieza, a cualquier escala:

| # | Paso | Comando / archivo |
| --- | --- | --- |
| 1 | Dibujar el contorno de la pieza | `Composants3D.svg`, grupo `<nombre>-profil` |
| 2 | Leerlo | `npm run profil <nombre>` → `src/webview/composants/profils.mts` |
| 3 | Mirarlo | `node scripts/_capture-profil.mjs <nombre>:plat` y luego `<nombre>:plaque` o `<nombre>:piece` |
| 4 | Ponerlo en volumen | nada que hacer si el nombre ya se espera (tabla más abajo); si no, el elemento |
| 5 | Comprobar | `npm run verify:profils` |

**Un ensamblaje**: varias piezas, en milímetros:

| # | Paso | Comando / archivo |
| --- | --- | --- |
| 1 | Dibujar las piezas, cada una con su **etiqueta de pose** | `Composants3D.svg`, grupos `<ensamblaje>-<pieza>` |
| 2 | Leerlo y **verlo girar** | `npm run montre <prefijo>` |
| 3 | Solo guardarlo (sin ventana) | `npm run assemblage <ensamblaje>` → `src/webview/composants/assemblages.mts` |
| 4 | Producir las imágenes de la documentación | `node scripts/_capture-profil.mjs <ensamblaje>:assemblage` y `:eclate` |
| 5 | Comprobar | `npm run verify:assemblage` |

El paso 4 de la cadena de perfiles está vacío en el caso habitual: los componentes **ya buscan** sus perfiles por nombre y recurren a la forma fijada en el código mientras el dibujo no existe. Dibujar `araignee-chassis` y extraerlo basta para cambiar la silueta del robot, sin tocar una línea de TypeScript.

En el lado de los ensamblajes, `npm run montre` hace los pasos 1 a 3 de una vez: relee el dibujo, lo guarda y abre la escena en una ventana donde se puede girar. Ese es **el** bucle de trabajo: redibujar en Inkscape, clic en **↻ recharger**, mirar. Dele un prefijo y aparece todo el robot de golpe.

---

## Qué es un perfil

Un **perfil** es el contorno de una pieza, **en plano**, como un plano de corte láser: la silueta, más los agujeros. El motor lo convierte en volumen de dos maneras, y solo de dos.

| Puesta en escena | El dibujo se ve | El volumen obtenido | Función |
| --- | --- | --- | --- |
| **Placa** | desde **arriba** | contorno extruido **hacia arriba**, según su espesor | `prismFaces` |
| **Pieza** | de **lado**, tumbada | contorno colocado **entre dos puntos**, según su espesor | `extrudeProfile` |

Una placa es el chasis del robot, una tarjeta, una escuadra plana. Una pieza es un hueso de pata, un bloque de servo, una biela: algo que va **de una articulación a la siguiente** y sigue el movimiento.

Los agujeros no se tallan de verdad en el material: se colocan como **calcomanías oscuras** sobre la cara que se ve (`decalFaces`). La imagen es idéntica, y se evita triangular un polígono con agujeros, lo que aquí no aportaría nada.

---

## Orientación: adónde va la parte superior del dibujo

Es lo único que no se puede adivinar por usted, y lo primero que hay que mirar cuando un dibujo no da lo esperado.

### El sistema de referencia del mundo

**X a la derecha, Y hacia atrás, Z hacia arriba.** Es el sistema de referencia del motor, y es el que se dibuja en una esquina de **cada** imagen 3D de esta guía, así como en el visor (casilla **repère X Y Z**). Gira con la escena: cuando se hace pivotar el robot, el sistema pivota también, y dice en todo momento dónde está la parte delantera.

![El sistema de referencia del mundo, y los x / y de cada uno de los tres planos](../img/systemes/repere.webp)

La misma pieza en L, colocada en los tres planos. Las flechas **violeta** y **naranja** son los `x` e `y` **de su hoja de dibujo**; la gris es la dirección del espesor.

| Plano | El dibujo se ve | `x` del dibujo va | `y` del dibujo va | El espesor va | Ejemplos |
| --- | --- | --- | --- | --- | --- |
| `dessus` | desde arriba, **delante arriba** | a la derecha | hacia **atrás** | en vertical | placas, bandejas, puentes |
| `flanc` | de lado, **delante a la izquierda** | hacia **atrás** | hacia **abajo** | a lo ancho del robot | los dos flancos, un servo tumbado |
| `face` | de frente | a la derecha | hacia **abajo** | de delante hacia atrás | tabique, separador, tapa frontal |

Dos maneras de recordarlo, y bastan:

- **La vista superior conserva el sentido de un plano de planta**: la parte de arriba de la hoja es la parte delantera del robot, como en cualquier dibujo visto desde arriba.
- **Los otros dos se levantan tal como se dibujaron**: el dibujo se yergue **exactamente como lo trazó**, parte superior de la hoja hacia arriba. Lo que dibuja arriba queda arriba; lo que dibuja a la izquierda apunta hacia delante (`flanc`) o hacia la izquierda (`face`).

Un `y` de SVG va **hacia abajo**, lo que explica la columna «hacia abajo», y por qué una pieza dibujada hacia la parte baja de la hoja acaba en la parte baja del robot.

### La parte superior del dibujo, para un perfil

- **Placa**: dibujada **vista desde arriba**, la **parte superior del dibujo es la delantera** del robot.
- **Pieza**: dibujada **de lado, tumbada en horizontal**. El **borde izquierdo** cae en la primera articulación, el **borde derecho** en la segunda. La parte superior del dibujo sigue arriba.

Dos consecuencias que ahorran muchas sorpresas:

1. **Las dimensiones del dibujo no importan, sus proporciones sí.** Una placa se escala al diámetro del chasis; una pieza se escala **en bloque** (longitud *y* altura con el mismo factor) para ir de una articulación a la otra. El mismo fémur sirve así para la pata suelta y para las patas más largas del robot sin deformarse. Dibuje a un tamaño cómodo, no «exacto».
2. **El centrado es automático**, en el centro del rectángulo envolvente. No hace falta alinear el dibujo con el origen de la hoja.

Las coordenadas guardadas están en **píxeles de la cuadrícula de 10 px** del lienzo. Si su hoja de Inkscape está en milímetros —como `Composants3D.svg`—, la conversión se hace a la entrada.

---

## Dibujar el perfil

En `Composants3D.svg`, la plancha A3 de las piezas que se ponen en volumen:

- **Un perfil es un grupo (o un simple trazado) cuyo `id` es `<nombre>-profil`.** El nombre sin sufijo se acepta como respaldo, pero el sufijo evita confundir un perfil con el dibujo plano de un componente del mismo nombre.
- **Un contorno cerrado para la pieza.** Los contornos **totalmente contenidos** en él son sus **agujeros** (agujeros de fijación, vaciados). Un contorno que no es la pieza ni está contenido en ella se señala y se ignora: dos piezas en un grupo es un dibujo que corregir, no algo que adivinar.
- **El contorno no debe cruzarse a sí mismo.** Una silueta en forma de ocho, un borde replegado sobre sí mismo: triangular eso no tiene sentido, y `verify:profils` lo rechaza.
- **Las curvas son bienvenidas**: Bézier, arcos, círculos, rectángulos, polígonos. Todo se aplana y luego se simplifica: un círculo muestreado acaba con unos treinta puntos, no doscientos.
- **El sentido de recorrido no importa** (horario o antihorario): se normaliza al leer.
- **Las pastillas rojas no forman parte del contorno**, pero una pastilla **con nombre** se guarda con la pieza: es una articulación (`coxa`, `patella`), lleva un **eje** (una recta, no un punto), y su **primera palabra** dice a qué se encaja. Ver [Ejes](#ejes): la convención es exactamente la de los ensamblajes; un perfil se lee como una pieza plana, así que sus ejes son verticales. Una pastilla sin nombre y cualquier texto siguen siendo simples marcas de la hoja, y se ignoran.

> La trampa clásica es el **contorno que retrocede**. En el chasis de ejemplo, la muesca delantera se dibujó primero más ancha que los hombros que la enmarcan: el trazado volvía sobre sí mismo y se replegaba. Los bordes de una muesca están **sobre** el círculo del cuerpo, nunca más allá.

Los nombres que el código ya busca; basta con dibujarlos, no hay nada que conectar:

| Nombre del grupo | Pieza | Puesta en escena | Respaldo sin dibujo |
| --- | --- | --- | --- |
| `araignee-chassis` | placa del robot araña | placa | octógono de ocho lados |
| `araignee-picow` | placa Pico W posada en el lomo del robot | placa | caja de 46 × 18 |
| `araignee-pca9685` | placa de 16 servos, sobre la placa | placa | caja de 40 × 24 |
| `araignee-batterie` | paquete de pilas, sobre la placa | placa | caja de 34 × 18 |
| `patte-femur` | hueso coxa → patela | pieza | caja |
| `patte-tibia` | hueso patela → pie | pieza | caja |

> **La electrónica de a bordo se puede redibujar como todo lo demás** (v2026.8.26). Dibuje cada tarjeta **vista desde arriba, conector a la izquierda**: el contorno se escala según su **longitud** (46, 40 o 34 unidades de escena), sus agujeros se colocan como calcomanías en un tono oscurecido de la tarjeta, y **su lugar en la placa no cambia**: lo mantiene el código, para que nada se superponga. En la Pico W, el blindaje de radio y el conector USB los sigue añadiendo el código encima.

---

## Leerlo

```bash
npm run profil araignee-chassis patte-femur     # = node scripts/_extract-profils.mjs
```

Salida:

```text
  ✓ araignee-chassis : 24 points, 112.4×110.8 px, 5 trou(s)
  ✓ patte-femur : 30 points, 73.83×13.98 px, 2 trou(s)

  → src/webview/composants/profils.mts (3 profil(s))
```

| Opción | Efecto |
| --- | --- |
| `--list` | Muestra lo que ya está guardado, sin leer ni escribir nada. |
| `--source=archivo.svg` | Lee otro archivo que no sea `Composants3D.svg` (los ejemplos de esta guía vienen de `docs/exemples/`). |
| `--step=0.35` | Paso de muestreo de las curvas, en unidades del dibujo. Más fino que el ojo por defecto. |
| `--tol=0.25` | Tolerancia de simplificación, en píxeles de la cuadrícula. Por debajo, un punto ya no cambia la silueta y solo hace más pesado el renderizado. |

El módulo generado, `src/webview/composants/profils.mts`, **es su propio archivo de respaldo**: la herramienta lo relee antes de reescribirlo, así que extraer un solo perfil no hace desaparecer los demás. Se lee bien en un `git diff` —es dibujo versionado—, pero **no se edita a mano**: la siguiente extracción sobrescribiría el cambio.

---

## Ponerlo en volumen

Un componente pide su perfil por nombre y recurre a su forma fijada en el código si todavía no existe. Ese es todo el cableado, y cabe en tres líneas. Para un hueso de pata ([`patte-element.mts`](../../src/webview/composants/patte-element.mts)):

```ts
function bone(name: string, a: Vec3, b: Vec3, t: number): Face[] {
  if (!hasProfile(name)) return boxFaces(a, b, t, t, COLORS.bone);
  const p = profile(name);
  return extrudeProfile(p, a, b, t, COLORS.bone, p.holes);
}
```

Para una placa ([`araignee-element.mts`](../../src/webview/composants/araignee-element.mts)), el contorno además se escala al diámetro esperado y se gira según la guiñada de presentación, **para que el dibujo decida la silueta y no las dimensiones**: coxas, patas, tarjetas y regleta se quedan donde el resto del componente las espera.

```ts
const plate = prismFaces(outline.poly, CHASSIS.height, CHASSIS.height + CHASSIS.thickness, COLORS.chassis);
const faces = [
  ...plate,
  ...outline.holes.flatMap((h) => decalFaces(h, CHASSIS.height + CHASSIS.thickness, '#8fb3c4', plate)),
];
```

Tres detalles del motor que explican el resto del código:

1. **Todas las caras de la escena se ordenan juntas**, de lejos a cerca (algoritmo del pintor). Ordenar cada pieza por separado rompería la ilusión: la ordenación común es la que pone una pata trasera detrás de la placa y la pata delantera delante.
2. **Las caras grandes se subdividen** en trozos de tamaño comparable. Una cara se ordena por su profundidad **media**: una placa entera de una sola pieza pasaría delante —o detrás— de todo lo que lleva, y la Pico posada en su borde desaparecía debajo.
3. **Una calcomanía se ordena justo delante de la cara que la lleva**, no solo elevada unas décimas: la placa está hecha de decenas de triángulos, y los del borde trasero pasan delante de lo que está en el centro. Nada más queda oculto: una pata que sobrevuela la placa sigue estando mucho más cerca del ojo que cualquier trozo de ella.

---

## Dibujo original, y lo que sale

Dos ejemplos completos, uno de cada tipo. Los dibujos están en [`docs/exemples/`](../exemples/), los perfiles guardados con los nombres `chassis-demo` y `femur-demo`, y **las imágenes de la derecha las produce el motor real**, nunca una captura de pantalla.

### Una placa: `chassis-demo`

| El dibujo | Lo que entendió el lector | Lo que hace el motor |
| --- | --- | --- |
| ![Dibujo original del chasis](../exemples/chassis-demo.svg) | ![Contorno leído, en la cuadrícula de 10 px](../img/systemes/chassis-demo-plat.webp) | ![El chasis en volumen](../img/systemes/chassis-demo.webp) |
| Visto desde arriba: cuatro brazos a ±45°, una muesca en V delante, cinco agujeros. Dibujado en un editor SVG, `fill-rule: evenodd`. | 20 puntos (las pastillas rojas), 106×106 px. Las curvas se aplanaron y luego se simplificaron; los cinco agujeros se reconocieron como tales porque están **contenidos** en la pieza. | `prismFaces` extruye el contorno sobre 8 px de espesor, `decalFaces` coloca los agujeros encima. La muesca está realmente hueca: se ve el suelo a través. |

### Una pieza: `femur-demo`

| El dibujo | Lo que entendió el lector | Lo que hace el motor |
| --- | --- | --- |
| ![Dibujo original del fémur](../exemples/femur-demo.svg) | ![Contorno leído, en la cuadrícula de 10 px](../img/systemes/femur-demo-plat.webp) | ![El fémur en volumen](../img/systemes/femur-demo.webp) |
| De lado, pieza tumbada: dos cabezas redondas, un cuerpo estrechado, dos agujeros de eje. El borde izquierdo caerá en la primera articulación, el derecho en la segunda. | 30 puntos, 73.83×13.98 px. El cuerpo estrechado necesita unos pocos puntos, cada cabeza redonda unos diez. | `extrudeProfile` coloca la pieza entre las dos articulaciones y le da 10 px de espesor. Los agujeros de eje se colocan en **ambos flancos**: la pieza se lee como taladrada de lado a lado. |

El renderizado del centro —el modo `:plat`— es el **primer sitio que mirar** cuando un dibujo da un volumen inesperado. Muestra exactamente lo que el lector ha conservado: el contorno, sus agujeros y un punto rojo por cada vértice superviviente. Un contorno replegado se ve ahí de inmediato.

---

## Mirar y comprobar

Las tres puestas en escena del script de captura:

```bash
node scripts/_capture-profil.mjs chassis-demo:plat     # el contorno leído, en la cuadrícula
node scripts/_capture-profil.mjs chassis-demo:plaque   # extruido hacia arriba
node scripts/_capture-profil.mjs femur-demo:piece      # colocado entre dos articulaciones
```

Las imágenes van a `docs/img/systemes/`, sobre fondo transparente, en WebP. `--width=720` da una imagen más grande para examinar de cerca un renderizado dudoso.

Después, el banco de pruebas:

```bash
npm run verify:profils
```

Es **cálculo puro**: sin navegador, en menos de un segundo. Comprueba el motor (la triangulación cubre toda la superficie, ningún triángulo sale de la forma, ninguna cara desmesurada, una calcomanía pasa delante de su placa, una pieza va de verdad de una articulación a la otra) **y después cada perfil guardado**: contorno utilizable, dimensiones coherentes, centrado, triangulación completa y estrictamente interior, cada agujero dentro de la pieza. Una contraprueba cierra la lista: un contorno que se cruza **debe fallar**; si no, el banco no probaría nada.

---

## Ensamblar varias piezas

Un perfil dice una sola cosa: una silueta. No puede decir **dónde** está una pieza respecto a otra, y eso es exactamente lo que necesita un **cuerpo en sándwich**: dos flancos de PMMA de 3 mm, los servos de coxa apretados entre ellos, un separador delante. Nada de eso se ve en la hoja plana, y una imagen fija no le dirá si los servos caben.

Un **ensamblaje** responde a eso. Es un conjunto de piezas planas, **en milímetros**, cada una con su **pose** escrita en palabras dentro del dibujo. El dibujo sigue siendo lo que debe ser: un **plano de corte láser**, con las piezas colocadas una junto a otra en la hoja. El lugar de una pieza en la hoja no importa; su etiqueta, sí.

### El dibujo

En `Composants3D.svg` (o en una plancha aparte, ver `--source=`):

- **Una pieza = un grupo cuyo `id` empieza por el nombre del ensamblaje**, seguido del nombre de la pieza: `araignee-corps-flanc`, `araignee-corps-servo`. El sufijo `-profil` se sigue tolerando (`araignee-corps-flanc-profil`); el nombre que se conserva es lo que sigue al nombre del ensamblaje.
- **La hoja debe estar en milímetros.** `Composants3D.svg` ya lo está (`width="…mm"` con un `viewBox` del mismo número: 1 unidad = 1 mm). Una hoja en píxeles CSS se convierte, pero ya no se sabe qué se está acotando.
- **Un texto dentro del grupo da la pose**: `flanc pos=28,0,0 ep=12 mat=servo miroir=x`. Es un simple `<text>`, colocado donde quiera dentro del grupo; debajo de la pieza se lee bien.
- **Contorno, agujeros y curvas** siguen exactamente las reglas de un perfil (contorno cerrado, agujeros contenidos, ningún trazado que se cruce).
- **Una pastilla roja con nombre = una articulación.** La nombra su **id de Inkscape**, y si no, el texto **encima** de ella, y su centro pasa a ser un **eje** 3D del ensamblaje: una recta dirigida como el espesor de su pieza, centrada en su cero. Su **primera palabra** es la familia: es lo que dice a qué otro dibujo se encaja ([detalles](#ejes)).

### La etiqueta de pose

Una palabra de plano, luego pares `clave=valor` en cualquier orden:

```text
flanc pos=28,0,0 ep=12 mat=servo miroir=x
```

| Palabra | Papel | Por defecto |
| --- | --- | --- |
| `dessus` / `flanc` / `face` | **obligatoria, la primera**: cómo está colocado el dibujo (arriba / lado / frente) | — |
| `pos=x,y,z` | centro de la pieza en el sistema del ensamblaje, en mm | `0,0,0` |
| `ep=3` | espesor de la pieza, en mm | `3` |
| `mat=pmma` | material, **solo para una pieza sin relleno**: el color del dibujo manda | `pmma` |
| `miroir=x` | la pieza se coloca **dos veces**, en espejo | sin espejo |

`miroir` solo (sin `=`) significa `miroir=y`. Un valor desconocido (`mat=titane`, `pos=3,4`) se ignora y se aplica el valor por defecto: la pieza aparece entonces visiblemente mal, en lugar de en silencio.

#### El separador decimal es el PUNTO

Es la trampa número uno de la etiqueta, porque no se ve en la imagen: un teclado numérico francés escribe una coma, y la coma ya separa las tres coordenadas.

```text
dessus pos=24,501,-38,083,0 ep=21,5     ← cinco números en lugar de tres: ilegible
dessus pos=24.501,-38.083,0 ep=21.5     ← correcto
```

Una etiqueta ilegible no es un error: la pieza **vuelve al centro, con 3 mm de espesor**. Está ahí, pero no donde usted cree. La lectura ahora lo dice claramente:

```text
  ! araignee-patte-tibia-servo : « pos=24,501,-38,083,0 » illisible, pièce remise au centre
    — le séparateur décimal est le POINT : pos=24.501,-38.083,0
```

Lo mismo para una palabra desconocida o un material desconocido: cada uno se señala al leer. **Lea la salida de `npm run montre` antes de sospechar del dibujo.**

Las palabras clave siguen en francés, como los id del dibujo: se escriben en Inkscape junto a `plaque` y `flanc`, y un solo idioma por plancha es una confusión menos.

### La etiqueta de tamaño del sistema

El montaje se acota en milímetros, pero el dibujo terminado se coloca en una **hoja de componente**, en píxeles de la cuadrícula de 10 px. ¿Cuántos píxeles de ancho? Se **escribe en la plancha**, junto a las piezas:

```text
système : araignee largeur : 800
système : patte largeur : 456
```

Un simple `<text>`, **fuera de cualquier grupo de pieza** (no pertenece a ninguna pieza, habla del sistema entero). El nombre es el del componente —`araignee`, `patte`—, la anchura es la **anchura total de su hoja**, conector y márgenes incluidos. Se aceptan acentos, mayúsculas, `=` en lugar de `:` y el orden invertido: `Largeur=456 Systeme=patte` se lee igual de bien.

| Lo que se escribe                   | Lo que hace                                              |
| ----------------------------------- | -------------------------------------------------------- |
| `système : araignee largeur : 800`  | la hoja del robot mide 800 px de ancho                    |
| `système : patte largeur : 456`     | la de la pata suelta, 456 px                              |
| sin etiqueta                        | el componente conserva su **tamaño de respaldo**, escrito en el código |
| `système : araignee` (sin anchura)  | se ignora, con un mensaje al leer                         |

Los tamaños se guardan en `assemblages.mts` y los lee `systemeLargeur('araignee')`. **Agrandar el robot se hace, por tanto, en Inkscape**, ya no en el código: todo lo que se mide en píxeles —afinado del contorno, grano de las caras, sombras, márgenes— sigue ese único número.

### Los tres planos

Son exactamente los mismos tres planos que para los perfiles, y la figura muestra el `x` y el `y` de la hoja para cada uno.

**X a la derecha, Y hacia atrás, Z hacia arriba.** Es el sistema de referencia del motor, y es el que se dibuja en una esquina de **cada** imagen 3D de esta guía, así como en el visor (casilla **repère X Y Z**). Gira con la escena: cuando se gira el robot, el sistema gira también, y dice en todo momento dónde está la parte delantera.

![El sistema de referencia del mundo, y los x / y de cada uno de los tres planos](../img/systemes/repere.webp)

La misma pieza en L, colocada en los tres planos. Las flechas **violeta** y **naranja** son los `x` e `y` **de su hoja de dibujo**; la gris es la dirección del espesor.

**Una pieza se coloca por su CENTRO** (el centro de su rectángulo envolvente): `pos` es el centro de la pieza, no su esquina. Eso es lo que hace inmediato el espejo: un flanco en `pos=-9,0,0` con `miroir=x` da los dos flancos, **con sus centros a 18 mm**.

Dos trampas en esa sola línea, y son las dos que cuestan un corte:

- **`miroir` va sobre la NORMAL del plano**, no sobre cualquier eje: `flanc` lleva su espesor según **x**, `dessus` según **z**, `face` según **y** (la tabla de los tres planos, más arriba). Un `flanc` con `miroir=y` no separa los dos flancos: coloca uno delante y otro detrás, en el mismo plano.
- **18 mm es de CENTRO a CENTRO**, sin contar el espesor. Dos flancos de 3 mm en `pos=±9` dejan **15 mm** entre ellos y **21 mm** en total. Lo que hay que acotar es el hueco que se desea: para 18 mm libres entre dos flancos de 3 mm, `pos=-10.5,0,0`, es decir `(hueco + ep) / 2`.

### Colores: el dibujo decide

**Una pieza tiene, en 3D, el color que tiene en la hoja**, transparencia incluida. Rellene un flanco de PMMA de azul al 55 % y lo verá azul y verá a través; pinte una tarjeta de verde oscuro y será verde oscuro. Nada que escribir en la etiqueta: el color ya está en el dibujo, y es lo único que el motor lee.

Algunos detalles que evitan sorpresas:

- Es el relleno **efectivo**, el que calcula el navegador: `fill`, `fill-opacity`, y la opacidad de cada grupo que lleva la forma; Inkscape suele poner la transparencia en la capa, no en la pieza.
- El color que se conserva es el de la **forma rellena más grande** del grupo: el contorno de la pieza. Un agujero, una marca o un texto no deciden el color del conjunto.
- Una pieza **sin relleno** (un contorno de corte, dibujado solo con trazo) no tiene color que dar: responde entonces `mat=`, o el PMMA por defecto.

`mat=` sigue siendo útil, por tanto, para una pieza sin pintar, o para forzar un tono sin tocar el plano de corte:

| `mat=` | Color | Para |
| --- | --- | --- |
| `pmma` | azul claro | PMMA cortado con láser, por defecto |
| `alu` | gris claro | escuadras, separadores metálicos |
| `servo` | negro | un servo, un motor, un bloque macizo |
| `carte` | verde | una placa de circuito impreso |
| `laiton` | dorado | tornillos, separadores roscados |
| `pile` | gris pizarra | pilas, paquetes de baterías |

La palabra da el color, y nada más: ni simulación, ni masa.

**Un material translúcido no lleva trazo de juntura.** Una placa se corta en decenas de triángulos; en cada arista interior, el trazo que rellena las junturas se superpone a sí mismo. Opaco, nunca se nota; translúcido, dibujaría una telaraña sobre toda la pieza. El trazo se suprime, por tanto, en cuanto el color es transparente.

### Una imagen colocada sobre la pieza

Un color basta para el PMMA, no para una tarjeta electrónica. **Coloque la foto sobre el contorno, dentro del grupo de la pieza**: se aplicará sobre ella en 3D, en su sitio y a su tamaño.

```svg
<g id="corps-demo-entretoise-profil">
  <path class="piece" d="M 135,75 H 175 V 100 H 135 Z" />
  <image x="140" y="79" width="30" height="18" opacity="0.85" href="pico.webp" />
  <text x="155" y="107">face pos=0,-36,0 ep=3</text>
</g>
```

Lo que hay que saber, y nada más:

- **Donde la coloca en la hoja es donde estará en la pieza**: mismos milímetros, mismo sistema que el contorno. Una foto que desborda el contorno se **recorta al contorno**: en una placa con muesca, se detiene en el borde de la placa. Una foto más pequeña sigue siendo más pequeña: se aplica, no rellena.
- **La transparencia es la del dibujo** (`opacity` de la imagen, o de la capa que la lleva), así que está a un cursor de distancia en Inkscape: al 100 % la foto oculta el material, al 40 % se ve la placa a través.
- **Se aplica en la cara que se VE.** No en una cara elegida de antemano: se proyectan las dos caras de la pieza y la más cercana al ojo se la queda. Media vuelta de la vista la pasa sola al otro lado.
- **Si la gira, sigue**: Inkscape escribe una matriz, la imagen la conserva. Una tarjeta colocada torcida sigue torcida en 3D.
- **Una imagen por pieza**: es una piel, no un collage. La segunda se ignora.
- **Formatos aceptados: `.webp`, `.png`, `.jpg`.** Una imagen enlazada se busca **junto a la plancha** y se **incrusta** en el módulo guardado: la webview nunca lee un archivo del disco. Prefiera, pues, el WebP: un JPEG de 4 MB sobre una placa de 30 mm no se verá mejor, pero pesará 4 MB dentro de la extensión. Enlace ausente o formato no admitido: la imagen se ignora, con un mensaje al extraer. ¿Inkscape no importa el WebP? Coloque el **PNG** en la plancha, el resultado es el mismo.

El separador de [`corps-demo.svg`](../exemples/corps-demo.svg) lleva una: es la pequeña tarjeta verde que se ve de canto en las imágenes de abajo.

#### Una imagen SOLA forma la pieza, y su recorte da el contorno

Una imagen es una piel: sin pieza debajo no tiene nada que cubrir, y el grupo desaparece del montaje. En lugar de dejar que una tarjeta se evapore sin decir nada, **una imagen sola cuenta como contorno**:

| Lo que contiene el grupo                 | El contorno de la pieza                                   |
| ---------------------------------------- | --------------------------------------------------------- |
| un trazado cerrado (con o sin imagen)    | el **trazado**, como siempre; la imagen solo es una calcomanía |
| una imagen **recortada** (recorte de Inkscape) | el **recorte**: la silueta real, muescas y agujeros  |
| una imagen sin más                       | el **rectángulo** del mapa de bits                         |

El recorte es `Objeto → Recorte → Establecer`: coloque un trazado sobre la foto, seleccione ambos, recorte. La foto conserva su silueta **y** se la da a la pieza: la placa de 16 servos del robot sale así con sus esquinas cortadas y sus cinco agujeros de tornillo, sin trazado que redibujar. La lectura lo anuncia como cualquier otra pieza:

```text
  ✓ pca9685 : 100 points, 40×29.18 mm, dessus ép.1 carte, 5 trou(s)
```

Un trazado de corte sigue siendo preferible cuando la pieza **se corta** con láser: es el plano. El recorte es para las piezas que no se cortan: una tarjeta comprada, un paquete de pilas, una foto colocada en el lomo del robot.

### Ejes

Una **pastilla roja** en el grupo de una pieza marca una articulación: un eje de coxa, una patela, un pivote. Sus coordenadas se calculan **en el sistema del ensamblaje**, pose incluida.

#### Una pastilla lleva una RECTA, no un punto

Es lo que el plano de corte dice sin decirlo, y es lo que encaja las piezas unas en otras:

> **Una pieza en espejo se coloca dos veces, y entre sus dos copias pasa un eje de rotación, dirigido como la flecha `ep`: la dirección de su espesor.** La pastilla dice *por dónde* pasa esa recta; el **plano de la pieza** dice *en qué sentido*.

| La pieza es un… | Su espesor va      | El eje de sus pastillas es | Lo que hace                                  |
| --------------- | ------------------ | -------------------------- | -------------------------------------------- |
| `dessus`        | en vertical        | **vertical: Z**            | una coxa: la pata barre a izquierda y derecha |
| `flanc`         | a lo ancho del robot | **transversal: X**       | una patela: la pata se dobla arriba y abajo   |
| `face`          | de delante atrás   | **de delante atrás: Y**    | una bisagra de tapa                           |

Las dos placas de soporte del cuerpo (`dessus pos=0,0,-13.75 ep=3 miroir=z`) están a ∓13,75 mm: el servo de coxa se sujeta entre ellas, y su eje es la vertical que pasa **a medio camino**. Es ese centro —el **cero del eje**— lo que se guarda, nunca la pastilla tal como está dibujada en una de las dos placas. Una pieza sin espejo sigue la misma regla: su eje se guarda en el cero del ensamblaje.

Así que **no hay nada más que hacer**: dibuje la pastilla en la pieza; la dirección y el punto medio se deducen del plano y del espejo. La lectura lo anuncia familia por familia, y es la línea que hay que releer cuando un montaje sale torcido:

```text
    famille « coxa » : 4 pastille(s), axe Z — coxa-gh, coxa-dh, coxa-gb, coxa-db
```

En el visor, la casilla **axes dessinés** traza la recta entera, en discontinua roja, sobre el punto y su nombre.

Dos maneras de nombrar una pastilla, en este orden:

1. su **id de Inkscape**: seleccione el punto, `Objeto → Propiedades del objeto`, escriba `coxa-gh`;
2. si no, el **texto libre más cercano**, preferentemente el de encima, exactamente como un nombre de pata en la plancha de componentes.

El id va primero porque **está pegado al punto**: sobrevive a un desplazamiento, a un texto añadido al lado, y no llena la hoja con cuatro etiquetas cuando la pieza lleva cuatro pastillas. Si el punto está **agrupado** (Inkscape agrupa en cuanto se mueve una guía), el nombre del **grupo** sirve igual: la lectura sube hasta el primer padre nombrado a mano. Un id que Inkscape inventó solo (`circle91`, `path102`, `g1-1`) no nombra nada: la pastilla se **ignora** entonces, con un aviso al leer.

Ese es el punto clave del protocolo: **el dibujo dice dónde está la coxa**, no una constante del código. Mueva el agujero en Inkscape y el eje le sigue.

> **Una pieza roja redonda se dibuja como TRAZADO, nunca como círculo.** Una pastilla es un `<circle>` rojo: un ojo de robot dibujado con la herramienta círculo lo sería, y la pieza se convertiría en articulación en lugar de cortarse. Dibuje el disco con la herramienta de trazado (`Trayecto → Objeto a trayecto` convierte un círculo existente) y vuelve a ser lo que es: una pieza.

#### Una pastilla = una articulación, y su primera palabra dice a qué se encaja

Todo cabe en una frase, y el resto de esta sección no es más que el detalle:

> **Una pastilla roja es una articulación por sí sola.** Su **primera palabra** es la **familia**: dice *a qué se encaja*; lo que sigue solo da **id distintos** a dos pastillas vecinas, como exige Inkscape.

| Nombre de la pastilla | Familia = a qué se encaja | Qué hace el resto del nombre           |
| --------------------- | ------------------------- | -------------------------------------- |
| `coxa-gh`             | `coxa`                    | distingue las cuatro coxas del cuerpo  |
| `coxa-db`             | `coxa`                    | ídem                                   |
| `coxa`                | `coxa`                    | sola en su familia: nada que distinguir |
| `patella-f`           | `patella`                 | la patela **del lado del fémur**       |
| `patella-t`           | `patella`                 | el mismo punto, **del lado de la tibia** |
| `pied`                | `pied`                    | una simple referencia, sin contraparte |

No hay nada que agrupar, nada que emparejar: **tantas pastillas, tantas articulaciones**.

#### Cuatro pastillas `coxa…` = cuatro patas

De ahí sale el número de copias, y no se ve en la imagen:

```text
cuerpo : coxa-gh ─┐
         coxa-dh  ├─ CUATRO pastillas de la familia «coxa»
         coxa-gb  │
         coxa-db ─┘

fémur :  coxa     ─── UNA pastilla de la misma familia
                        → el fémur se duplica CUATRO veces
```

El fémur lleva una `patella-f` en su otro extremo; la tibia lleva una `patella-t`. **Misma primera palabra, así que mismo eje de contacto**: la `-f` y la `-t` solo están porque Inkscape rechaza dos id idénticos. Cuatro fémures ofrecen, pues, cuatro patelas, y nacen **cuatro tibias**.

> ¿Una sola pata en el centro del cuerpo? Las cuatro coxas se dibujaron con el **mismo nombre** (se lee una pastilla), o tres de ellas no tienen nombre: la lectura enumera las familias y sus pastillas, ahí se ve.

#### Una familia común = dos dibujos que se encajan

Las articulaciones no solo sirven para girar: **son el modo en que los dibujos se montan unos en otros**, sin una sola cota que trasladar.

La regla es corta:

1. Dos conjuntos cuyas pastillas comparten la **misma primera palabra** se encajan: el cuerpo tiene `coxa…`, el fémur también → el fémur se coloca en el cuerpo. A igualdad de nombres, gana la familia cuyos **dos ejes apuntan en el mismo sentido**: una coxa vertical busca una coxa vertical.
2. **El que ofrece más articulaciones lleva al otro.** El cuerpo tiene cuatro, el fémur dos: el cuerpo lleva, y nacen **cuatro fémures**.
3. **Los dos ejes se superponen —misma recta— y se centran en su cero**, el de cada dibujo. El fémur no viene, pues, a pegarse contra un flanco: se **centra entre los dos**, porque su propio cero es el centro de sus dos flancos. La posición no se calcula, se lee en el dibujo.
4. Cuando la familia tiene **varias** pastillas en el padre (las cuatro coxas), cada copia se **orienta hacia la suya**: las patas se abren solas. Cuando solo tiene **una** (la patela del fémur), el hijo conserva el rumbo de su padre: la tibia prolonga el fémur.

Una cadena completa necesita, por tanto, tres dibujos y seis nombres:

```text
araignee-corps          coxa-gh  coxa-dh  coxa-gb  coxa-db
araignee-patte-femur    coxa          ← se encaja en el cuerpo (familia «coxa»)
                        patella-f         ← ofrece una patela
araignee-patte-tibia    patella-t         ← se encaja en el fémur (familia «patella»)
```

En pantalla: **un cuerpo, cuatro fémures, cuatro tibias**, cada uno en su sitio, sin una línea de código. Es lo que hace `npm run montre araignee`.

Un conjunto que no comparte ninguna familia se queda en **su propio origen**: no se adivina, simplemente se coloca. Y si ningún conjunto comparte una con otro, el visor lo dice y vuelve a la presentación lado a lado.

#### Los perfiles también

Una pieza dibujada sola (un perfil) sigue la **misma convención**: sus pastillas con nombre se guardan con su contorno, en el mismo sistema centrado. Cuando el componente la coloca entre dos articulaciones, `profileAxes` las lleva consigo, a escala y en su sitio. Una patela dibujada en el fémur sigue siendo la patela del fémur, alargue o no la pata.

### Verlo girar

```bash
npm run montre araignee            # TODO lo que empieza por «araignee»
npm run montre araignee-corps      # un solo ensamblaje
```

El argumento es un **prefijo**, no un nombre exacto: la herramienta toma **todos los ensamblajes y todos los perfiles** de la plancha que empiezan por él, y los muestra **juntos, a la misma escala**. La plancha se lee **una sola vez** para todo el prefijo (la lectura pasa por Chrome: esa es la espera, así que se paga una vez).

**Pedir el prefijo global es pedir el robot entero.** `npm run montre araignee` no coloca tres dibujos uno junto a otro: los **monta**, cada uno sobre las articulaciones del anterior, ejes superpuestos: un cuerpo, cuatro fémures, cuatro tibias. Tres dibujos en la plancha, un robot en pantalla. Es la casilla **monté sur ses articulations**, marcada por defecto; desmárquela para recuperar los dibujos separados.

Un perfil, dibujado solo y sin cotas, se trata como un ensamblaje de una pieza: su cuadrícula de 10 px pasa a ser milímetros y se coloca plano, con 3 mm de espesor, junto a los ensamblajes reales.

Lo que se lee también se **guarda**: `assemblages.mts` y `profils.mts` se reescriben, exactamente como lo harían `npm run assemblage` y `npm run profils`.

| En la ventana | Para qué sirve |
| --- | --- |
| Botón **↻ recharger** | releer `Composants3D.svg` **sin salir de la ventana**: retocar en Inkscape, clic, mirar. Ángulo, zoom y casillas marcadas se conservan |
| **Arrastrar en la vista** (o el cursor *lacet*) | girar alrededor: el ángulo en que algo choca nunca es el primero |
| Cursor **éclaté** | separar las piezas según su espesor: la única manera de ver lo que hay entre dos flancos a 3 mm |
| Cursor **zoom** | examinar un detalle |
| **Casilla del título** de un conjunto | ocultar un ensamblaje entero: mirar el fémur solo sin volver a lanzar el comando |
| Casilla **×4** junto al título | el conjunto recibió cuatro copias (cuatro coxas, cuatro patas). Desmárquela para conservar **una**: cuatro patas ocultan el cuerpo que quería ver. Lo que lleva le sigue: un fémur solo sostiene una tibia |
| Casillas **pièces** | ocultar un flanco para ver el interior |
| Casilla **axes dessinés** | mostrar las articulaciones con nombre en su lugar 3D: el punto, su nombre y la **recta del eje en discontinua roja**. Así se comprueba que están donde se cree, y que apuntan en el sentido correcto |
| Casilla **repère X Y Z** | el sistema del mundo en una esquina, girando con la escena: dice en todo momento dónde está la parte delantera |
| Casilla **monté sur ses articulations** | **el robot ensamblado**: cada conjunto colocado sobre las articulaciones del anterior, ejes superpuestos y ceros coincidentes, una copia por articulación. Desmarcada, se vuelve a los dibujos separados |
| Casilla **côte à côte** (solo sin montar) | desmarcada, cada conjunto vuelve a **su propio origen**: su propio sitio, tal como se dibujó |

El panel muestra el **tamaño total en milímetros** (`100 × 80 × 31 mm`): la cifra que se lee en un plano de conjunto, y el primer indicio de que una pieza está colocada al revés.

Las opciones: `--source=docs/exemples/corps-demo.svg` para leer otra plancha, `--sans-lire` para volver a abrir sobre lo ya guardado (cuando solo ha cambiado el motor), `--sans-ranger` para mirar sin reescribir los módulos generados, `--sans-ouvrir` para servir la página sin abrir ventana, `--port=8731` para elegir el puerto.

### Dibujo original, y lo que sale

El ejemplo completo está en [`docs/exemples/corps-demo.svg`](../exemples/corps-demo.svg): un cuerpo de robot en sándwich, **tres piezas dibujadas** que se convierten en **cinco** una vez colocadas.

| El dibujo | Ensamblado | Despiece |
| --- | --- | --- |
| ![Plano de corte del cuerpo de demostración](../exemples/corps-demo.svg) | ![El cuerpo ensamblado](../img/systemes/corps-demo.webp) | ![El mismo cuerpo, en despiece](../img/systemes/corps-demo-eclate.webp) |
| Tres grupos uno junto a otro, como un plano de corte: la placa (`dessus pos=0,0,14 ep=3 miroir=z`), el servo (`flanc pos=28,0,0 ep=12 mat=servo miroir=x`), el separador (`face pos=0,-36,0 ep=3`). | Las dos placas a 14 mm a cada lado del plano medio: 25 mm de aire entre ellas, justo lo que necesita un servo tumbado. Tamaño total: 100 × 80 × 31 mm. | Cada pieza separada según su espesor. Aparecen los servos: es la vista que responde a «¿cabe?». |

El PMMA del plano está relleno **al 55 %**: las placas son translúcidas en 3D, y los servos se ven sin necesidad de despiezar el cuerpo. El servo mismo está pintado de gris oscuro en la hoja: su `mat=servo` ya no sirve para nada, y con razón: el plano de corte habla por sí solo.

Las dos imágenes de la derecha las produce el motor real:

```bash
node scripts/_capture-profil.mjs corps-demo:assemblage corps-demo:eclate
```

### Guardarlo y comprobarlo

```bash
npm run assemblage araignee-corps      # lee y guarda, sin ventana
npm run assemblage -- --list           # lo que ya está guardado
npm run verify:assemblage              # el banco de pruebas
```

Salida de la lectura:

```text
  ✓ entretoise : 5 points, 40×25 mm, face ép.3 #bcdff08c
  ✓ plaque : 10 points, 100×80 mm, dessus ép.3 #bcdff08c miroir=z, 3 trou(s)
  ✓ servo : 5 points, 23×23 mm, flanc ép.12 #3f4750ff miroir=x, 1 trou(s)
    famille « coxa » : 2 pastille(s), axe Z — coxa-g, coxa-d
  → corps-demo : 3 pièce(s), 2 axe(s), 100×80×31 mm
```

La línea `famille « coxa »` es la que hay que leer: **dos pastillas, así que dos coxas**, y dos patas por venir. Es el número de patas, visible antes incluso de abrir la ventana: un cuerpo de araña debe mostrar ahí `4 pastille(s)`. `axe Z` dice en qué sentido girará la articulación; una familia cuyas pastillas están repartidas en planos distintos muestra `axe X/Z` y un aviso: se dibujó en la pieza equivocada. Una pastilla sin nombre se señala en esa misma línea (`! …-supports : pastille sans nom (id « circle91 »), ignorée`): es el momento de darle un id en Inkscape.

El color mostrado es el **leído en el dibujo** (`#rrggbbaa`, transparencia incluida): el `8c` final es el PMMA al 55 %. Una pieza sin pintar muestra en su lugar la palabra de su `mat=`.

`src/webview/composants/assemblages.mts` es **generado**, y es **su propio archivo de respaldo**: la herramienta lo relee antes de reescribirlo, así que extraer un ensamblaje no hace desaparecer los demás. Como `profils.mts`, se lee bien en un `git diff` pero no se edita a mano.

El banco `verify:assemblage` es cálculo puro, como el de los perfiles. Pone a prueba el **análisis de la etiqueta** (una posición negativa debe sobrevivir entera: `pos=0,-9,0` ya se leyó una vez como tres palabras), los **planos** (una placa de 100 mm colocada plana mide 100 × 80 × 3, nunca 103 × 83 × 35), el **espejo**, el **despiece** (cada pieza se desplaza hacia el lado en que ya está, una pieza central no se mueve), y después **cada ensamblaje guardado**: plano y material conocidos, contorno centrado, cotas coherentes, tamaño total coherente con el cálculo, ejes dentro de la caja. Pone a prueba también los **colores leídos en el dibujo** —el tono dibujado gana a `mat=`, la transparencia sobrevive a la iluminación, y una cara translúcida sale sin trazo de juntura— y las **articulaciones**: cada pastilla es una, su primera palabra forma su familia, ninguna pastilla guardada lleva un número de duplicación de Inkscape, y las pastillas de un perfil siguen a la pieza cuando se amplía.

Pone a prueba la regla de los **ejes** por sí sola: una pastilla lleva una recta dirigida por la normal de su pieza (`dessus`→Z, `flanc`→X, `face`→Y), guardada en su **cero** —a medio camino entre las dos copias de una pieza en espejo—, y cada ensamblaje guardado pasa por esa comprobación.

Por último pone a prueba el **montaje**, en un robot de prueba y después **en la araña tal como está dibujada**: un cuerpo con cuatro coxas, un fémur, una tibia: el cuerpo lleva (ofrece más articulaciones), nacen cuatro fémures y cuatro tibias, cada uno en una coxa distinta, ejes **superpuestos al milímetro, ceros coincidentes**, cada copia enganchada por un eje que apunta en el **mismo sentido** que el que la lleva, las cuatro patas orientadas a cuatro rumbos distintos, la tibia conservando el rumbo de su fémur. Un conjunto que no comparte ninguna familia se queda donde está, y dos dibujos sin nada en común no montan nada en lugar de inventar.

---

## Dibujar una pata, de la coxa al pie

El caso completo, el que encadena todo lo anterior: un cuerpo, un fémur, una tibia, y **cuatro patas** al final. Solo tres dibujos: las cuatro copias no se dibujan, nacen de las cuatro coxas.

### 1. Tres grupos, tres ensamblajes

```text
araignee-corps-…          el cuerpo: placas, tarjetas, pilas
araignee-patte-femur-…    el hueso coxa → patela, y el servo de patela que lleva
araignee-patte-tibia-…    el hueso patela → pie
```

Cada uno se dibuja **donde quiera en la hoja**, uno junto a otro como un plano de corte. Su lugar en la hoja no importa: su etiqueta de pose y sus pastillas, sí.

### 2. El cuerpo: cuatro pastillas, cuatro coxas

Una coxa gira alrededor de una **vertical**: se dibuja, pues, en una pieza **`dessus`**, cuyo espesor va hacia arriba ([por qué](#una-pastilla-lleva-una-recta-no-un-punto)). En los soportes que sujetan realmente los servos de coxa —dos placas planas en espejo, el servo apretado entre ellas—, **una** pastilla roja por coxa:

```text
coxa-gh        delante izquierda
coxa-dh        delante derecha
coxa-gb        detrás izquierda
coxa-db        detrás derecha
```

Las cuatro empiezan por `coxa`: esa palabra, y solo ella, es la que trae el fémur. Lo que sigue solo les da **cuatro id distintos**: Inkscape rechaza dos veces el mismo. **Ponga cada pastilla donde pasa realmente el eje del servo**: ahí girará la pata. ¿La placa es `miroir=z`? Dibuje la pastilla **una sola vez**, en el dibujo: el eje se coloca solo a medio camino entre las dos placas.

La lectura debe anunciar `famille « coxa » : 4 pastille(s), axe Z`. Si anuncia `axe X`, las pastillas se dibujaron en un flanco: la coxa se doblaría arriba y abajo en lugar de barrer.

Nómbrelas por su **id de Inkscape** (`Objeto → Propiedades del objeto`): cuatro textos en la hoja llenarían el dibujo.

### 3. El fémur: dos articulaciones, no una

Aquí es donde más a menudo falla. El fémur lleva **dos** articulaciones, y necesita ambas:

| Pastilla    | Para qué sirve                                                                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `coxa`      | **donde el fémur se engancha al cuerpo.** Familia `coxa`: es la palabra que usa también el cuerpo, y basta para que se encajen. Dibújela en una pieza plana, como la del cuerpo: los dos ejes deben ser **verticales** |
| `patella-f` | **el eje que el fémur ofrece a la tibia.** Familia `patella`. En un `flanc`, así que **transversal (X)**: la tibia se dobla arriba y abajo                                                                            |

Un fémur con solo su coxa sí se coloca en el cuerpo, pero la tibia ya no tiene dónde engancharse, y se queda sola en su rincón. **La patela se dibuja en el fémur**, no solo en la tibia.

El fémur es un `flanc`: dibujado de lado, se levanta **tal como se trazó**. Lo que dibuja arriba acaba arriba del robot. Si la pata sale al revés, es el dibujo el que está invertido, no el motor: marque **repère X Y Z** y mire hacia dónde apunta Z.

### 4. La tibia: la patela

```text
patella-t         misma primera palabra que la «patella-f» del fémur: los dos ejes se superponen
```

La pastilla `patella-t` debe estar **en el mismo sitio de la tibia** que `patella-f` en el fémur: es el eje de contacto, y es lo que se superpone. Dibújela en un `flanc`, como el fémur: dos ejes que no apuntan en el mismo sentido no se encajan. La `-f` y la `-t` no significan más que «lado fémur» y «lado tibia»: simplemente hacen falta dos id distintos.

El fémur solo ofrece **una** pastilla de la familia `patella`: la tibia hereda, pues, el rumbo del fémur y lo prolonga, en lugar de abrirse como las patas alrededor del cuerpo.

### 5. Mirar

```bash
npm run montre araignee
```

Marque **axes dessinés**, **repère X Y Z** y **monté sur ses articulations**. Debe ver un cuerpo, cuatro fémures, cuatro tibias. Las casillas **×4** aparecen junto al fémur y la tibia: desmarque una para conservar una sola pata y ver el cuerpo.

Luego retoque en Inkscape, clic en **↻ recharger**, mire. El ángulo y las casillas se conservan.

### No sale así: por qué

| Lo que ve                                                              | La causa, casi siempre                                                                                                                                                                              |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Una sola pata**, en el centro del cuerpo                             | el cuerpo solo tiene **una** pastilla `coxa…`. Necesita cuatro: una por coxa, en su lugar real                                                                                                      |
| **Dos patas** en lugar de cuatro                                       | solo dos pastillas `coxa…`. El número de patas es el número de pastillas de la familia, nada más                                                                                                   |
| **Cinco patas**, una de ellas duplicada en el mismo sitio              | una pastilla duplicada en Inkscape: se llama `coxa-gh-3`. Renómbrela, o bórrela si es un duplicado (la lectura lo señala)                                                                           |
| **La tibia se queda sola**                                             | el fémur no tiene pastilla `patella…`. La patela se dibuja en **las dos** piezas                                                                                                                    |
| **No se monta nada**, el visor lo dice en amarillo                     | ninguna familia común: los dos dibujos no usan la misma primera palabra (`coxa` por un lado, `epaule` por el otro)                                                                                  |
| **La pata apunta mal**, o de través                                    | la coxa no está donde usted cree: marque **axes dessinés**, el nombre aparece en el lugar real de la pastilla                                                                                       |
| **La pata pivota en el sentido equivocado** (se dobla en lugar de barrer) | el eje lo dirige el **plano de la pieza**: una coxa vertical se dibuja en un `dessus`, una patela transversal en un `flanc`. Marque **axes dessinés**: la discontinua roja muestra la recta      |
| **La pata está pegada a una placa** en lugar de centrada entre dos     | la pastilla se dibujó dos veces a mano, una por placa, en lugar de una sola en una pieza con `miroir`. El cero del eje es entonces falso, y nacen dos articulaciones en lugar de una               |
| **Dos dibujos no se encajan**, aunque tengan la misma familia          | sus ejes no apuntan en el mismo sentido: la lectura muestra `axe X/Z` y un aviso. Uno de los dos está dibujado en la pieza equivocada                                                               |
| **Una pieza está en el centro del cuerpo**, con 3 mm de espesor        | su etiqueta es ilegible: una coma decimal, casi siempre. Lea la salida del comando, lo dice                                                                                                         |
| **Una pastilla no aparece**                                            | no tiene nombre: su id de Inkscape sigue siendo `circle97`. La lectura lo señala                                                                                                                    |
| **Una tarjeta ha desaparecido** del ensamblaje                         | su grupo solo contiene la foto, y no está recortada: recórtela (`Objeto → Recorte → Establecer`) o vuelva a dibujar un contorno                                                                     |
| **Una pieza redonda se ha convertido en articulación**                 | está trazada como `<circle>` rojo: `Trayecto → Objeto a trayecto`                                                                                                                                   |
| **El dibujo conserva su tamaño** tras cambiar la etiqueta              | el nombre del sistema no corresponde al componente (`araignee`, `patte`), o la etiqueta está **dentro** de un grupo de pieza: entonces cae junto a las piezas                                        |

---

## Chuleta

**Perfiles** (una pieza):

- Un perfil es **un contorno cerrado** más sus agujeros, en un grupo llamado `<nombre>-profil`.
- Placa = vista desde **arriba**, parte superior del dibujo = delante. Pieza = vista de **lado**, izquierda → derecha = primera → segunda articulación.
- Cuentan las **proporciones**, no las dimensiones: todo se reescala.
- Un agujero debe estar **totalmente contenido** en la pieza; si no, se ignora (con un aviso).
- El contorno **nunca debe cruzarse**: es el único trazado que el motor no puede poner en volumen.
- Una **pastilla roja con nombre** se guarda con la pieza: es una articulación —un **eje**, vertical para un perfil— y sigue a la pieza cuando se escala.
- `profils.mts` es **generado**: se lee, no se edita.
- Extraer un perfil no hace perder los demás.
- Mire el modo `:plat` **antes** de sospechar del motor.

**Ensamblajes** (varias piezas):

- Una pieza = un grupo `<ensamblaje>-<pieza>` más **una etiqueta de pose** en palabras.
- Todo está en **milímetros**, y las cotas se conservan: es un plano de corte, no una proporción.
- La etiqueta empieza **siempre** por el plano: `dessus`, `flanc` o `face`.
- `pos` es el **centro** de la pieza, no su esquina.
- `miroir` coloca la pieza **dos veces**: un dibujo de flanco da los dos flancos. Va sobre la **normal del plano** (`flanc`→`x`, `dessus`→`z`, `face`→`y`), y la separación obtenida es **de centro a centro**: `pos=(hueco + ep) / 2`.
- El separador decimal es el **punto**: `pos=24.501,-38.083,0 ep=21.5`. Una coma hace la etiqueta ilegible y la pieza vuelve al centro; la lectura lo dice.
- Una **pastilla roja con nombre = una articulación**: el dibujo dice dónde está la coxa. Nómbrela por su **id de Inkscape**; el texto de encima sigue funcionando.
- La **primera palabra** del nombre es la **familia**: dice a qué se encaja. Lo que sigue solo da **id distintos** (`coxa-gh`, `patella-f` / `patella-t`).
- **Una pastilla = una articulación.** Cuatro pastillas `coxa…` en el cuerpo = **cuatro coxas**, así que cuatro patas. Dos pastillas nunca se agrupan.
- **Una pastilla lleva un EJE, no un punto**: una recta dirigida como el espesor de su pieza: `dessus`→**Z** (una coxa que barre), `flanc`→**X** (una patela que se dobla), `face`→**Y**. Una pieza con `miroir` la coloca dos veces: el eje pasa **entre** las dos copias.
- El eje se guarda en su **cero**: a medio camino entre las dos copias en espejo. Nada que calcular, nada que dibujar dos veces.
- **Misma familia = los dibujos se encajan**, **ejes superpuestos y ceros coincidentes**: el que más ofrece lleva al otro, y nace una copia **por pastilla** (cuatro coxas → cuatro fémures → cuatro patelas → cuatro tibias). Dos ejes que apuntan en sentidos distintos no se encajan: la lectura muestra `axe X/Z` y avisa.
- El fémur lleva **dos** familias: `coxa` para engancharse al cuerpo, `patella-f` para llevar la tibia.
- Un nombre que termina en **`-3`, `-1`…** es casi siempre el sufijo que Inkscape pega a un copiar-pegar: la lectura lo señala, renómbrelo.
- El **color de la pieza es el color del dibujo**, transparencia incluida; `mat=` solo es el respaldo para una pieza sin pintar.
- Una **imagen colocada sobre el contorno** (`.webp`, `.png`, `.jpg`) se aplica a la pieza, **en la cara que se ve**, **recortada al contorno** y con **la transparencia del dibujo**. Una por pieza; un archivo enlazado se incrusta al extraer.
- **Una imagen SOLA forma la pieza**: su **recorte** (el de Inkscape) da el contorno —silueta, muescas y agujeros—, y si no, el rectángulo del mapa de bits. Borrar el trazado de una tarjeta ya no la hace desaparecer.
- Una **pieza roja redonda se traza como TRAZADO**: un `<circle>` rojo se lee como **pastilla** (una articulación), no como pieza.
- `npm run montre <prefijo>` lee, guarda y abre **todo lo que empieza por él**, a la misma escala: es el bucle de trabajo. Retoque en Inkscape, clic en **↻ recharger**.
- El cursor **éclaté** es la única manera de ver lo que hay entre dos flancos.
- `assemblages.mts` es **generado**, y es su propio archivo de respaldo.
- El **tamaño del sistema terminado** se escribe **en la plancha**, fuera de los grupos: `système : araignee largeur : 800`. El robot se encuadra para llenarlo, la pata tiene el suyo (`système : patte largeur : 456`, toda la hoja), y todo lo que se mide en píxeles (simplificación del contorno, grano de las caras, sombras, márgenes) le sigue. Agrandar o reducir se hace, por tanto, en Inkscape; sin etiqueta, el componente conserva su tamaño de respaldo.
