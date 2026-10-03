// Dictionnaire espagnol de la webview : clé = chaîne source anglaise (voir
// i18n.mts). Mêmes clés que le dictionnaire français.

export const ES: Record<string, string> = {
  'Ready':
    'Listo',
  'Stopped':
    'Detenido',
  'Running…':
    'En ejecución…',
  'Compiling…':
    'Compilando…',
  'Starting MicroPython… (a few seconds)':
    'Iniciando MicroPython… (unos segundos)',
  'Starting REPL…':
    'Iniciando el REPL…',
  'Restarting in debug mode…':
    'Reiniciando en modo depuración…',
  'REPL ready — type your commands in the console':
    'REPL listo — escriba sus órdenes en la consola',
  'Board: {0}':
    'Placa: {0}',
  'Error: {0}':
    'Error: {0}',
  'Wokwi project loaded':
    'Proyecto Wokwi cargado',
  'Wokwi project loaded ({0} unsupported part(s) ignored)':
    'Proyecto Wokwi cargado ({0} componente(s) no compatible(s) ignorado(s))',
  'Paused':
    'En pausa',
  'Pause':
    'Pausa',
  'Pause - resume the simulation':
    'Pausar / reanudar la simulación',
  'Resume':
    'Reanudar',
  'Reset':
    'Reiniciado',
  'Line {0}':
    'Línea {0}',
  'Slowed down: {0}× real time':
    'Ralentizada: {0}× el tiempo real',
  'The page cannot keep up with the simulation.':
    'La página ya no puede seguir el ritmo de la simulación.',
  'The emulated processor is at its limit: this program computes without ever pausing.':
    'El procesador emulado está al límite: este programa calcula sin hacer nunca una pausa.',
  'Flyback diode is reversed':
    'Diodo invertido',
  'A flyback diode is required':
    'Se requiere un diodo de rueda libre',
  'Coil voltage too low: the relay does not pull in':
    'Tensión de bobina insuficiente: el relé no conmuta',
  'The supply cannot deliver the coil current':
    'La alimentación no puede suministrar la corriente de la bobina',
  'The supply cannot deliver the motor current':
    'La alimentación no puede suministrar la corriente del motor',
  'Motor overvoltage: it burned out':
    'Sobretensión: el motor se ha quemado',
  'Motor voltage too low: it does not turn':
    'Tensión demasiado baja: el motor no gira',
  'Diode reversed':
    'Diodo invertido',
  'A relay coil is an inductor: when the current is cut it sends back a surge that destroys the driving transistor. The flyback diode absorbs it — it is not optional.':
    'La bobina de un relé es una inductancia: al cortar la corriente devuelve una sobretensión que destruye el transistor de mando. El diodo de rueda libre la absorbe — no es opcional.',
  'Coil voltage too low: this relay does not pull in. Supply the coil at its rated voltage.':
    'Tensión de bobina demasiado baja: este relé no conmuta. Alimente la bobina a su tensión nominal.',
  'Too little voltage to overcome the motor friction: the rotor stays stalled and the winding heats up. Supply it at its rated voltage, or cut the losses in series with it.':
    'Demasiado poca tensión para vencer el rozamiento del motor: el rotor queda bloqueado y el bobinado se calienta. Aliméntelo a su tensión nominal o reduzca las pérdidas en serie con él.',
  'The supply cannot deliver the coil current: raise its maximum current, or share fewer coils on the same source.':
    'La alimentación no suministra la corriente de la bobina: aumente su corriente máxima o ponga menos bobinas en la misma fuente.',
  'This LED burned out: with no series resistor (or far too small a one) the current goes past what the junction can take.':
    'Este LED se ha quemado: sin resistencia en serie (o con una demasiado pequeña), la corriente supera lo que soporta la unión.',
  'This capacitor broke down: the voltage across it went past its rated working voltage. Pick one rated well above the supply voltage.':
    'Este condensador se ha perforado: la tensión en sus bornes superó su tensión de trabajo. Elija uno con una tensión nominal muy superior a la del montaje.',
  'This board burned out: the V+ servo terminal takes 5 V, no more. Beyond 5.5 V the chip is destroyed.':
    'Esta placa se ha quemado: el borne V+ de los servos admite 5 V, no más. Por encima de 5,5 V el chip se destruye.',
  'This motor burned out: it was fed more than 1.5 times its rated voltage. Its windings do not take that.':
    'Este motor se ha quemado: recibió más de 1,5 veces su tensión nominal. Sus bobinados no lo soportan.',
  'This transistor was destroyed: a motor is a coil, and cutting its current sends back a surge. A flyback diode across the motor absorbs it — it is not optional.':
    'Este transistor se ha destruido: un motor es una bobina, y cortar su corriente devuelve una sobretensión. Un diodo de rueda libre en bornes del motor la absorbe — no es opcional.',
  'The supply cannot deliver the current this motor draws: a board pin is far too weak for a motor. Use a power supply and a transistor.':
    'La alimentación no suministra la corriente que pide este motor: un pin de placa se queda muy corto. Use una fuente de alimentación y un transistor.',
  'Hall sensor is not powered':
    'El sensor de efecto Hall no está alimentado',
  'This sensor is not powered: V+ must reach a supply rail (5 V / 3V3 / V+ of a supply) and GND a ground.':
    'Este sensor no está alimentado: V+ debe llegar a un raíl de alimentación (5 V / 3V3 / V+ de una fuente) y GND a una masa.',
  'Hall sensor output is shorted to the supply':
    'Salida del sensor de efecto Hall en cortocircuito con la alimentación',
  'The output is wired straight to the supply rail: when the sensor switches it would short the supply. Put a pull-up resistor (10 kΩ) in between.':
    'La salida está conectada directamente al raíl de alimentación: al conmutar, el sensor pondría la alimentación en cortocircuito. Intercale una resistencia de pull-up (10 kΩ).',
  'The Hall sensor output needs a pull-up':
    'La salida del sensor de efecto Hall necesita una resistencia de pull-up',
  'The output is open drain: it can only pull down to ground, never up. Add a pull-up resistor to VCC, or turn on the internal pull-up of the board pin (INPUT_PULLUP / Pin.PULL_UP).':
    'La salida es de drenador abierto: solo puede tirar hacia masa, nunca hacia arriba. Añada una resistencia de pull-up a VCC o active el pull-up interno del pin de la placa (INPUT_PULLUP / Pin.PULL_UP).',
  'Incompatible supply voltage':
    'Tensión de alimentación incompatible',
  'Incompatible supply voltage: this chip is fed below the minimum of its family, so it does nothing. Check the supply against the family printed on the package.':
    'Tensión de alimentación incompatible: este circuito está alimentado por debajo del mínimo de su familia, así que no hace nada. Compare la alimentación con la familia impresa en el encapsulado.',
  'This chip was destroyed: it was fed above the maximum supply voltage of its family. The family printed on the package sets that limit.':
    'Este circuito se ha destruido: se alimentó por encima de la tensión máxima de su familia. La familia impresa en el encapsulado fija ese límite.',
  'Engine':
    'Motor',
  'Rendering':
    'Renderizado',
  'Browser':
    'Navegador',
  'Components':
    'Componentes',
  'Search a component…':
    'Buscar un componente…',
  'No component matches this search.':
    'Ningún componente coincide con esta búsqueda.',
  'Recently used':
    'Usados recientemente',
  'Show recently used':
    'Mostrar los usados recientemente',
  'Hide recently used':
    'Ocultar los usados recientemente',
  'R':
    'F',
  'Component help':
    'Ayuda del componente',
  'Open the help for this part':
    'Abrir la ayuda de este componente',
  'Expand all categories':
    'Desplegar todas las categorías',
  'Collapse all categories':
    'Plegar todas las categorías',
  'Show the component library':
    'Mostrar la biblioteca de componentes',
  'Collapse the component library':
    'Plegar la biblioteca de componentes',
  'Show the properties panel':
    'Mostrar el panel de propiedades',
  'Collapse the properties panel':
    'Plegar el panel de propiedades',
  'Auto (accordion)':
    'Auto (acordeón)',
  'Folding mode':
    'Modo de plegado',
  'All components':
    'Todos los componentes',
  'Alphabetical':
    'Orden alfabético',
  'By category':
    'Por categoría',
  'Boards':
    'Placas y protoboards',
  'Displays & LEDs':
    'Pantallas y LED',
  'Controls':
    'Mandos',
  'Sensors':
    'Sensores',
  'Actuators':
    'Actuadores',
  'Systems':
    'Sistemas',
  'Instruments':
    'Instrumentos de medida',
  'Misc':
    'Varios',
  'Passive':
    'Pasivos',
  'Custom parts':
    'Componentes personalizados',
  '+ Create a part':
    '+ Crear un componente',
  '⇪ Import (.json)':
    '⇪ Importar (.json)',
  'Click: place on canvas — double-click: edit the model':
    'Clic: colocar en el lienzo — doble clic: editar el modelo',
  'Export this part (.json)':
    'Exportar este componente (.json)',
  'Export this part (.kompix)':
    'Exportar este componente (.kompix)',
  'Delete this part model':
    'Eliminar este modelo de componente',
  'Import failed: {0}':
    'Importación imposible: {0}',
  'invalid JSON.':
    'JSON no válido.',
  'missing "label" field.':
    'falta el campo «label».',
  'missing or invalid "svg" field.':
    'campo «svg» ausente o no válido.',
  'missing "pins" field.':
    'falta el campo «pins».',
  'each pin needs name, x and y.':
    'cada pin necesita name, x e y.',
  'Delete':
    'Eliminar',
  'Right-click drag to move':
    'Arrastre con el clic derecho para mover',
  '⚠ Simulation running: wiring is locked.':
    '⚠ Simulación en curso: el cableado está bloqueado.',
  '⚠ Simulation running: editing is disabled.':
    '⚠ Simulación en curso: edición desactivada.',
  '⚠ Simulation running (speed {0} %): editing is disabled.':
    '⚠ Simulación en curso (velocidad {0} %): edición desactivada.',
  'Simulation thread stopped — restarting on the main thread…':
    'El hilo de simulación se ha detenido — se reanuda en el hilo principal…',
  'Drag to move — Ctrl: H/V alignment':
    'Arrastre para mover — Ctrl: alineación H/V',
  '+ or − to rotate the part':
    '+ o − para girar el componente',
  '+ or − to rotate the parts':
    '+ o − para girar los componentes',
  'Drag a part to move the whole selection.':
    'Arrastrar un componente mueve toda la selección.',
  'Ctrl+C / Ctrl+V: copy / paste, from one project to another too — Ctrl+D: duplicate.':
    'Ctrl+C / Ctrl+V: copiar / pegar, también de un proyecto a otro — Ctrl+D: duplicar.',
  '{0} parts selected':
    '{0} componentes seleccionados',
  '{0} × {1} — shared properties':
    '{0} × {1} — propiedades comunes',
  'Changing a property applies to the whole selection.':
    'Cambiar una propiedad la aplica a toda la selección.',
  'Delete the selection':
    'Eliminar la selección',
  'Right-click to move it.':
    'Clic derecho para moverlo.',
  'Reset the view (zoom 100%)':
    'Restablecer la vista (zoom 100 %)',
  'Flip':
    'Voltear',
  'Orientation':
    'Orientación',
  'Rotate left (−90°)':
    'Girar a la izquierda (−90°)',
  'Rotate right (+90°)':
    'Girar a la derecha (+90°)',
  'Flip horizontally':
    'Voltear horizontalmente',
  'Flip vertically':
    'Voltear verticalmente',
  'Show/hide the internal wiring':
    'Mostrar/ocultar el cableado interno',
  'Show/hide the full pinout':
    'Mostrar/ocultar el patillaje completo',
  'Cross handle: move a corner.':
    'La cruz mueve una esquina.',
  'Ctrl: horizontal/vertical alignment.':
    'Ctrl: alineación horizontal/vertical.',
  'Double-click the wire: add a corner.':
    'Doble clic en el cable: añadir una esquina.',
  'Click a corner then Del: remove it.':
    'Clic en una esquina y luego Supr: eliminarla.',
  'Cross handle: move a corner (hold Ctrl to align it with its neighbours).':
    'La cruz mueve una esquina (con Ctrl pulsado, alineada con sus vecinas).',
  'Drag a straight segment: it moves sideways, the neighbouring segments follow.':
    'Arrastre un tramo recto: se desplaza de lado y los tramos vecinos lo siguen.',
  'Segment move snaps to the grid; hold Ctrl to move it freely.':
    'El tramo sigue la cuadrícula; con Ctrl pulsado se mueve libremente.',
  'Drag to move — Ctrl: H/V alignment — Del: remove this corner':
    'Arrastre para mover — Ctrl: alineación H/V — Supr: eliminar esta esquina',
  'No file':
    'Sin código asociado',
  'Code file to run / debug — click to change, double-click to open':
    'Archivo de código que ejecutar / depurar — clic para cambiar, doble clic para abrir',
  'Code file: {0} — click to change, double-click to open':
    'Archivo de código: {0} — clic para cambiar, doble clic para abrir',
  'Code file {0} not found on this computer — click to choose the file to run':
    'Archivo de código {0} no encontrado en este equipo — clic para elegir el archivo que ejecutar',
  'Code file {0} has been deleted — click to choose the file to run':
    'El archivo de código {0} se ha eliminado — clic para elegir el archivo que ejecutar',
  'Current project':
    'Proyecto actual',
  'Current project: {0}':
    'Proyecto actual: {0}',
  'Project {0} has been deleted from disk — save it again to keep it':
    'El proyecto {0} se ha borrado del disco — guárdelo de nuevo para conservarlo',
  'Unsaved changes':
    'Cambios sin guardar',
  'Properties':
    'Propiedades',
  'Click a part or a wire to edit it. Wiring: click a pin, add corners by clicking the background, finish on a pin (Esc: cancel).':
    'Haga clic en un componente o un cable para editarlo. Cableado: haga clic en un pin, añada esquinas haciendo clic en el fondo y termine en un pin (Esc: cancelar).',
  'Wire {0} → {1}':
    'Cable {0} → {1}',
  'Node {0}':
    'Nodo {0}',
  'Select every wire of this node':
    'Seleccionar todos los cables de este nodo',
  'Color (Dupont cables)':
    'Color (cables Dupont)',
  'Delete the wire':
    'Eliminar el cable',
  'Delete the part':
    'Eliminar el componente',
  'No editable property for this part.':
    'Ningún parámetro editable para este componente.',
  'Suffixes allowed: p n µ m k M G (e.g. 2.2k)':
    'Sufijos permitidos: p n µ m k M G (p. ej. 2.2k)',
  'no':
    'no',
  'Wokwi help':
    'Ayuda de Wokwi',
  'Open the online Wokwi documentation for this part':
    'Abrir la documentación en línea de Wokwi para este componente',
  'Available online only':
    'Solo disponible en línea',
  'Create a part':
    'Crear un componente',
  'Edit the part':
    'Editar el componente',
  'Name':
    'Nombre',
  'My sensor':
    'Mi sensor',
  'Simulation model':
    'Modelo de simulación',
  'SVG drawing':
    'Dibujo SVG',
  'Click the preview to add a connection point.':
    'Haga clic en la vista previa para añadir un punto de conexión.',
  'Preview':
    'Vista previa',
  'External view':
    'Vista externa',
  'Internal view':
    'Vista interna',
  'Load an SVG…':
    'Cargar un SVG…',
  'Overlay':
    'Superponer',
  'Remove the internal view':
    'Quitar la vista interna',
  'Same scale as the external drawing; the green anchor aligns both views.':
    'Misma escala que el dibujo externo; el ancla verde alinea ambas vistas.',
  'Fit the drawing in the view':
    'Ajustar el dibujo a la vista',
  'Import simulation models (.json)':
    'Importar modelos de simulación (.json)',
  'Imported models':
    'Modelos importados',
  '{0} model(s) available.':
    '{0} modelo(s) disponible(s).',
  'Markers: red circle (opacity 0.8) = pin, green circle (0.5) = alignment anchor, red text = pin name. They are removed from the final part.':
    'Marcadores: círculo rojo (opacidad 0,8) = pin, círculo verde (0,5) = ancla de alineación, texto rojo = nombre del pin. Se eliminan del componente final.',
  'invalid SVG file.':
    'archivo SVG no válido.',
  '{0} pin(s) detected.':
    '{0} pin(es) detectado(s).',
  'No red circle found — click the preview to place the pins.':
    'No se ha encontrado ningún círculo rojo — haga clic en la vista previa para colocar los pines.',
  'Green anchor missing in one of the two views — top-left corners aligned.':
    'Falta el ancla verde en una de las dos vistas — esquinas superiores izquierdas alineadas.',
  'Internal view aligned on the green anchor.':
    'Vista interna alineada con el ancla verde.',
  'Alignment anchor':
    'Ancla de alineación',
  'No internal view — load an SVG (optional).':
    'Sin vista interna — cargue un SVG (opcional).',
  'Part parameters':
    'Parámetros del componente',
  'Add a parameter (usable in the characteristic)':
    'Añadir un parámetro (utilizable en la característica)',
  'Delete this parameter':
    'Eliminar este parámetro',
  'name':
    'nombre',
  'label':
    'etiqueta',
  'value':
    'valor',
  'Simulation control':
    'Control de simulación',
  'Add a simulation control (slider, switch)':
    'Añadir un control de simulación (cursor, interruptor)',
  'Remove the simulation control':
    'Quitar el control de simulación',
  'None':
    'Ninguno',
  'Slider (analog output)':
    'Cursor (salida analógica)',
  'Switch (digital output)':
    'Interruptor (salida digital)',
  'Control label':
    'Etiqueta del control',
  'Unit':
    'Unidad',
  'Min':
    'Mín',
  'Max':
    'Máx',
  'Step':
    'Paso',
  'Characteristic (V)':
    'Característica (V)',
  'linear (min→max)':
    'lineal (mín→máx)',
  'Output voltage in volts — empty = linear ramp. Variables: x{0}.':
    'Tensión de salida en voltios — vacío = rampa lineal. Variables: x{0}.',
  'Valid expression. Variables: x{0}.':
    'Expresión válida. Variables: x{0}.',
  'Invalid expression: {0}':
    'Expresión no válida: {0}',
  'Connection points':
    'Puntos de conexión',
  'No point — click the preview.':
    'Ningún punto — haga clic en la vista previa.',
  'Delete this point':
    'Eliminar este punto',
  'Pin for role "{0}"':
    'Pin para el rol «{0}»',
  'Maximum collector-emitter voltage':
    'Tensión colector-emisor máxima',
  'Current gain: Ic = β × Ib once saturated':
    'Ganancia de corriente: Ic = β × Ib en saturación',
  'Maximum collector current':
    'Corriente de colector máxima',
  'Free drawing':
    'Dibujo libre',
  'Draws the package in the external view, pins included':
    'Dibuja el encapsulado en la vista externa, patillas incluidas',
  'Package “{0}” drawn — {1} pin(s).':
    'Encapsulado «{0}» dibujado — {1} patilla(s).',
  'Symbol':
    'Símbolo',
  'Draws the symbol in the internal view':
    'Dibuja el símbolo en la vista interna',
  'Open in the SVG editor…':
    'Abrir en el editor SVG…',
  'Opens the drawing in the SVG editor of your choice (asked once, then remembered); it is reloaded here at every save.':
    'Abre el dibujo en el editor SVG que elija (se pregunta una vez y se recuerda); se recarga aquí en cada guardado.',
  'Drawing opened in your editor — it is reloaded at every save.':
    'Dibujo abierto en su editor — se recarga en cada guardado.',
  'Drawing updated from the external editor.':
    'Dibujo actualizado desde el editor externo.',
  'Drag to resize':
    'Arrastre para redimensionar',
  'Cancel':
    'Cancelar',
  'Save':
    'Guardar',
  'Arduino Uno':
    'Arduino Uno',
  'Arduino Nano':
    'Arduino Nano',
  'Arduino Mega 2560':
    'Arduino Mega 2560',
  'Raspberry Pi Pico':
    'Raspberry Pi Pico',
  'Raspberry Pi Pico W':
    'Raspberry Pi Pico W',
  'Raspberry Pi Pico 2':
    'Raspberry Pi Pico 2',
  'Raspberry Pi Pico 2 W':
    'Raspberry Pi Pico 2 W',
  'LED':
    'LED',
  'Buzzer':
    'Zumbador',
  'NeoPixel':
    'NeoPixel',
  'DIP switch ×8':
    'Interruptor DIP ×8',
  'TFT display (ILI9341, SPI)':
    'Pantalla TFT (ILI9341, SPI)',
  'microSD card (SPI)':
    'Tarjeta microSD (SPI)',
  'Breadboard':
    'Protoboard',
  'Grove Shield (Pico)':
    'Grove Shield (Pico)',
  'Grove VCC rail':
    'Alimentación de los puertos Grove (VCC)',
  '3.3 V':
    '3,3 V',
  '5 V (VBUS)':
    '5 V (VBUS)',
  'RGB LED':
    'LED RGB',
  'Pushbutton':
    'Pulsador',
  'Resistor':
    'Resistencia',
  'Mounting':
    'Montaje',
  'Horizontal':
    'Horizontal',
  'Vertical':
    'Vertical',
  'Diode':
    'Diodo',
  'Threshold voltage (V)':
    'Tensión umbral (V)',
  'Capacitor':
    'Condensador',
  'Capacitor (film)':
    'Condensador (film)',
  'Capacitor (tantalum)':
    'Condensador (tántalo)',
  'Capacitor (electrolytic)':
    'Condensador (electrolítico)',
  'Non-polarized':
    'No polarizado',
  'Polarized':
    'Polarizado',
  'Plastic':
    'Plástico',
  'Tantalum':
    'Tántalo',
  'Electrolytic':
    'Electrolítico',
  'Nominal value (F)':
    'Valor nominal (F)',
  'Max voltage (V)':
    'Tensión máx. (V)',
  'Nominal value (Ω)':
    'Valor nominal (Ω)',
  'Power rating (W)':
    'Potencia admisible (W)',
  'Film (¼ W)':
    'Capa (¼ W)',
  'Power, finned aluminium':
    'Potencia, aluminio con aletas',
  'Power, ceramic':
    'Potencia, cerámica',
  'Potentiometer':
    'Potenciómetro',
  'Slide potentiometer':
    'Potenciómetro deslizante',
  'Trimmer potentiometer':
    'Potenciómetro de ajuste',
  '7-segment display':
    'Display de 7 segmentos',
  'LED bar graph':
    'Barra de LED',
  'Slide switch':
    'Interruptor deslizante',
  'Analog joystick':
    'Joystick analógico',
  'Light sensor':
    'Sensor de luz',
  'Sensitivity (%)':
    'Sensibilidad (%)',
  'PIR motion sensor':
    'Detector de movimiento (PIR)',
  'Tilt sensor':
    'Sensor de inclinación',
  'Hall effect sensor':
    'Sensor de efecto Hall',
  'V+ pin':
    'Patilla V+',
  'GND pin':
    'Patilla GND',
  'S (output) pin':
    'Patilla S (salida)',
  'Trigger distance (mm)':
    'Distancia de disparo (mm)',
  'Servo motor':
    'Servomotor',
  'Spider leg':
    'Pata de araña',
  'Spider robot':
    'Robot araña',
  'Pulse at 0° (µs)':
    'Pulso a 0° (µs)',
  'Pulse at 180° (µs)':
    'Pulso a 180° (µs)',
  'Rotation time (s/turn)':
    'Tiempo de giro (s/vuelta)',
  'Configure the 16-servo board':
    'Configurar la placa de 16 servos',
  'Wire the servos':
    'Cablear los servos',
  'Reverse the servos':
    'Invertir los servos',
  'Set the servo zeros':
    'Ajustar el cero de los servos',
  'Servo parameters':
    'Parámetros de los servos',
  'Type the output each servo is plugged into: 0 to 15, marked 1 to 16 on the board. The same channel cannot be used twice, and a servo left empty does not move.':
    'Indique la salida en la que está conectado cada servo: 0 a 15, marcadas 1 a 16 en la placa. Un mismo canal no puede usarse dos veces, y un servo que se deje vacío no se mueve.',
  'Channel {0} to {1} (marked {2} to {3} on the board).':
    'Canal {0} a {1} (marcados {2} a {3} en la placa).',
  'Channel {0} is already used by another servo.':
    'El canal {0} ya lo usa otro servo.',
  '{0} servo(s) have no channel: fill in the "Wire the servos" drawer — 0 to 15, marked 1 to 16 on the board. Without it, these joints do not move.':
    '{0} servo(s) sin canal: rellene la sección «Cablear los servos» — 0 a 15, marcados 1 a 16 en la placa. Sin ello, estas articulaciones no se mueven.',
  'Channel {0} is wired to two servos at once.':
    'El canal {0} está conectado a dos servos a la vez.',
  'Front-left coxa channel':
    'Canal de la coxa delantera izquierda',
  'Front-left patella channel':
    'Canal de la patella delantera izquierda',
  'Front-right coxa channel':
    'Canal de la coxa delantera derecha',
  'Front-right patella channel':
    'Canal de la patella delantera derecha',
  'Rear-left coxa channel':
    'Canal de la coxa trasera izquierda',
  'Rear-left patella channel':
    'Canal de la patella trasera izquierda',
  'Rear-right coxa channel':
    'Canal de la coxa trasera derecha',
  'Rear-right patella channel':
    'Canal de la patella trasera derecha',
  'Reverse the coxa servo':
    'Invertir el servo de la coxa',
  'Reverse the patella servo':
    'Invertir el servo de la patella',
  'Reverse the front-left coxa':
    'Invertir la coxa delantera izquierda',
  'Reverse the front-left patella':
    'Invertir la patella delantera izquierda',
  'Reverse the front-right coxa':
    'Invertir la coxa delantera derecha',
  'Reverse the front-right patella':
    'Invertir la patella delantera derecha',
  'Reverse the rear-left coxa':
    'Invertir la coxa trasera izquierda',
  'Reverse the rear-left patella':
    'Invertir la patella trasera izquierda',
  'Reverse the rear-right coxa':
    'Invertir la coxa trasera derecha',
  'Reverse the rear-right patella':
    'Invertir la patella trasera derecha',
  'Coxa angle at 0° (horn offset)':
    'Ángulo de la coxa a 0° (calado del brazo)',
  'Patella angle at 0° (horn offset)':
    'Ángulo de la patella a 0° (calado del brazo)',
  'Front-left coxa angle at 0°':
    'Ángulo a 0° de la coxa delantera izquierda',
  'Front-left patella angle at 0°':
    'Ángulo a 0° de la patella delantera izquierda',
  'Front-right coxa angle at 0°':
    'Ángulo a 0° de la coxa delantera derecha',
  'Front-right patella angle at 0°':
    'Ángulo a 0° de la patella delantera derecha',
  'Rear-left coxa angle at 0°':
    'Ángulo a 0° de la coxa trasera izquierda',
  'Rear-left patella angle at 0°':
    'Ángulo a 0° de la patella trasera izquierda',
  'Rear-right coxa angle at 0°':
    'Ángulo a 0° de la coxa trasera derecha',
  'Rear-right patella angle at 0°':
    'Ángulo a 0° de la patella trasera derecha',
  'I²C address':
    'Dirección I²C',
  'AD0 (bit 0)':
    'AD0 (bit 0)',
  'AD1 (bit 1)':
    'AD1 (bit 1)',
  'AD2 (bit 2)':
    'AD2 (bit 2)',
  'AD3 (bit 3)':
    'AD3 (bit 3)',
  'AD4 (bit 4)':
    'AD4 (bit 4)',
  'AD5 (bit 5)':
    'AD5 (bit 5)',
  'Ultrasonic sensor':
    'Sensor de ultrasonidos',
  'Min distance (cm)':
    'Distancia mín. (cm)',
  'Max distance (cm)':
    'Distancia máx. (cm)',
  'Air temperature (°C)':
    'Temperatura del aire (°C)',
  'Temp/humidity sensor (DHT22)':
    'Sensor de temp./humedad (DHT22)',
  'Temp/humidity sensor (DHT11)':
    'Sensor de temp./humedad (DHT11)',
  'Fan':
    'Ventilador',
  'Rated voltage (V)':
    'Tensión nominal (V)',
  'Current draw (A)':
    'Corriente consumida (A)',
  'DC motor':
    'Motor de corriente continua',
  'No-load current (A)':
    'Corriente en vacío (A)',
  'Transistor':
    'Transistor',
  'Max Ic at least':
    'Ic máx. de al menos',
  'Max Vce at least':
    'Vce máx. de al menos',
  'Gain at least':
    'Ganancia de al menos',
  'Any':
    'Cualquiera',
  'TO-92':
    'TO-92',
  'TO-220':
    'TO-220',
  'Matching models':
    'Modelos que coinciden',
  'No model matches these criteria.':
    'Ningún modelo cumple estos criterios.',
  'Custom NPN':
    'NPN personalizado',
  'Custom PNP':
    'PNP personalizado',
  'Custom {0}':
    '{0} personalizado',
  'NPN Darlington':
    'Darlington NPN',
  'PNP Darlington':
    'Darlington PNP',
  'N-channel MOSFET':
    'MOSFET de canal N',
  'Max Id at least':
    'Id máx. de al menos',
  'Max Vds at least':
    'Vds máx. de al menos',
  'Rds(on) at most':
    'Rds(on) de como máximo',
  'Every characteristic stays editable':
    'Todas las características siguen siendo ajustables',
  'Change transistor…':
    'Cambiar de transistor…',
  'Save to my parts…':
    'Guardar en mis componentes…',
  'Add this transistor to the library, under “Custom parts”':
    'Añade este transistor a la biblioteca, en «Componentes personalizados»',
  '“{0}” saved: you will find it in the library, under “Custom parts”.':
    '«{0}» guardado: lo encontrarás en la biblioteca, en «Componentes personalizados».',
  '“{0}” updated in the library, under “Custom parts”.':
    '«{0}» actualizado en la biblioteca, en «Componentes personalizados».',
  'Pinout (flat face)':
    'Patillaje (cara plana)',
  'Pick a model, or a custom NPN/PNP to set everything yourself.':
    'Elige un modelo, o un NPN/PNP personalizado para ajustarlo todo tú mismo.',
  'Transistor PN2222A (NPN)':
    'Transistor PN2222A (NPN)',
  'Transistor NPN (generic)':
    'Transistor NPN (genérico)',
  'Transistor PNP (generic)':
    'Transistor PNP (genérico)',
  'Package':
    'Encapsulado',
  'Emitter on pin':
    'Emisor en la patilla',
  'Base on pin':
    'Base en la patilla',
  'Collector on pin':
    'Colector en la patilla',
  'Gate on pin':
    'Puerta en la patilla',
  'Drain on pin':
    'Drenador en la patilla',
  'Source on pin':
    'Fuente en la patilla',
  'Current gain (β)':
    'Ganancia de corriente (β)',
  'Vce(sat) (V)':
    'Vce(sat) (V)',
  'Rds(on) (Ω)':
    'Rds(on) (Ω)',
  'Vgs(th) (V)':
    'Vgs(th) (V)',
  'Marking':
    'Inscripción',
  'Max Vce (V)':
    'Vce máx. (V)',
  'Max Ic (A)':
    'Ic máx. (A)',
  'Max Vds (V)':
    'Vds máx. (V)',
  'Max Id (A)':
    'Id máx. (A)',
  'Integrated circuits':
    'Circuitos integrados',
  'Model':
    'Modelo',
  '74 series family':
    'Familia (serie 74)',
  'CD4081 quad 2-input AND gate':
    'CD4081 4 puertas AND de 2 entradas',
  'CD4071 quad 2-input OR gate':
    'CD4071 4 puertas OR de 2 entradas',
  'CD4070 quad 2-input XOR gate':
    'CD4070 4 puertas XOR de 2 entradas',
  'CD4011 quad 2-input NAND gate':
    'CD4011 4 puertas NAND de 2 entradas',
  'CD4001 quad 2-input NOR gate':
    'CD4001 4 puertas NOR de 2 entradas',
  'CD40106 hex Schmitt-trigger inverter':
    'CD40106 6 inversores Schmitt trigger',
  '74xx08 quad 2-input AND gate':
    '74xx08 4 puertas AND de 2 entradas',
  '74xx32 quad 2-input OR gate':
    '74xx32 4 puertas OR de 2 entradas',
  '74xx86 quad 2-input XOR gate':
    '74xx86 4 puertas XOR de 2 entradas',
  '74xx00 quad 2-input NAND gate':
    '74xx00 4 puertas NAND de 2 entradas',
  '74xx02 quad 2-input NOR gate':
    '74xx02 4 puertas NOR de 2 entradas',
  '74xx14 hex Schmitt-trigger inverter':
    '74xx14 6 inversores Schmitt trigger',
  'Relay OMRON G5V':
    'Relé OMRON G5V',
  'Coil voltage (V)':
    'Tensión de bobina (V)',
  'Membrane keypad':
    'Teclado matricial',
  'Text LCD':
    'LCD de texto',
  'Interface':
    'Interfaz',
  'I²C (4 wires)':
    'I²C (4 hilos)',
  'I²C (SDA/SCL)':
    'I²C (SDA/SCL)',
  'SPI (4 wires)':
    'SPI (4 hilos)',
  'Parallel (HD44780)':
    'Paralelo (HD44780)',
  '16 × 2':
    '16 × 2',
  '20 × 4':
    '20 × 4',
  'OLED display (SSD1306)':
    'Pantalla OLED (SSD1306)',
  'NeoPixel matrix':
    'Matriz NeoPixel',
  'NeoPixel ring':
    'Anillo NeoPixel',
  'Pushbutton (6mm)':
    'Pulsador (6 mm)',
  'NTC temperature sensor':
    'Sensor de temperatura (NTC)',
  'LDR (photoresistor)':
    'Fotorresistencia (LDR)',
  'NTC thermistor':
    'Termistor NTC',
  'PTC thermistor':
    'Termistor PTC',
  'Resistance at 1 lx (Ω)':
    'Resistencia a 1 lx (Ω)',
  'Sensitivity coefficient (γ)':
    'Coeficiente de sensibilidad (γ)',
  'Resistance at 25 °C (Ω)':
    'Resistencia a 25 °C (Ω)',
  'Beta coefficient (K)':
    'Coeficiente B (K)',
  'Slider Tmin (°C)':
    'Tmín del cursor (°C)',
  'Slider Tmax (°C)':
    'Tmáx del cursor (°C)',
  'Temp. coefficient (%/°C)':
    'Coeficiente de temperatura (%/°C)',
  'Gas sensor (MQ)':
    'Sensor de gas (MQ)',
  'Heart-beat sensor':
    'Sensor de pulso',
  'Flame sensor':
    'Sensor de llama',
  'Sound sensor':
    'Sensor de sonido',
  '16-channel PWM driver (PCA9685)':
    'Controlador PWM de 16 canales (PCA9685)',
  'Bench power supply':
    'Fuente de alimentación de laboratorio',
  'Voltage (V)':
    'Tensión (V)',
  'Max current supplied (A)':
    'Corriente máx. suministrada (A)',
  'Power bank':
    'Batería externa',
  'Voltage':
    'Tensión',
  'Current limit':
    'Corriente límite',
  'Photodiode':
    'Fotodiodo',
  'Phototransistor':
    'Fototransistor',
  'Max irradiance (mW/cm²)':
    'Irradiancia máx. (mW/cm²)',
  'Resistance at max irradiance (Ω)':
    'Resistencia a la irradiancia máx. (Ω)',
  'Dark resistance (Ω)':
    'Resistencia en oscuridad (Ω)',
  'Multimeter':
    'Multímetro',
  'Measurement':
    'Medida',
  'DC voltage':
    'Tensión continua',
  'DC current':
    'Corriente continua',
  'Current':
    'Corriente',
  'Oscilloscope':
    'Osciloscopio',
  'Volts/div':
    'Voltios/div',
  'Seconds/div':
    'Segundos/div',
  'Trigger edge':
    'Flanco de disparo',
  'Rising edge':
    'Flanco de subida',
  'Falling edge':
    'Flanco de bajada',
  'Label':
    'Etiqueta',
  'The ammeter is short-circuiting the supply':
    'El amperímetro pone la alimentación en cortocircuito',
  'In current mode the multimeter is a plain wire: put it IN SERIES, inside the branch whose current you want. Straight across the supply it shorts it out.':
    'En modo corriente, el multímetro es un simple cable: colóquelo EN SERIE, dentro de la rama cuya corriente quiere conocer. Colocado directamente sobre la alimentación, la pone en cortocircuito.',
  'Function generator':
    'Generador de funciones',
  'Waveform':
    'Forma de onda',
  'Frequency (Hz)':
    'Frecuencia (Hz)',
  'Amplitude, peak-to-peak (V)':
    'Amplitud pico a pico (V)',
  'DC offset (V)':
    'Desplazamiento continuo (V)',
  'Duty cycle (%)':
    'Ciclo de trabajo (%)',
  'Sine':
    'Senoidal',
  'Triangle':
    'Triangular',
  'Square':
    'Cuadrada',
  'sine':
    'senoidal',
  'triangle':
    'triangular',
  'square':
    'cuadrada',
  'Simulation speed cannot be measured (engine clock)':
    'Velocidad de simulación no medible (reloj del motor)',
  '{0}: this board cannot hear a UART reader — set the jumper to the other mode.':
    '{0}: esta placa no oye a un lector en serie — ponga el puente en el otro modo.',
  'Wiring error':
    'Error de cableado',
  'Ref.':
    'Ref.',
  'Part':
    'Componente',
  'Characteristics':
    'Características',
  'Value':
    'Valor',
  'Comment':
    'Comentario',
  'Color':
    'Color',
  'Type':
    'Tipo',
  'Size':
    'Tamaño',
  'Mini':
    'Mini',
  'Medium':
    'Mediano',
  'Large':
    'Grande',
  'Flipped':
    'Volteado',
  'Value (Ω)':
    'Valor (Ω)',
  'Position (%)':
    'Posición (%)',
  'Brightness (%)':
    'Luminosidad (%)',
  'Motion detected':
    'Movimiento detectado',
  'Tilted':
    'Inclinado',
  'Temperature (%)':
    'Temperatura (%)',
  'Gas level (%)':
    'Nivel de gas (%)',
  'Pulse (%)':
    'Pulso (%)',
  'Flame detected':
    'Llama detectada',
  'Sound detected':
    'Sonido detectado',
  'Horn':
    'Brazo',
  'Single horn':
    'Brazo simple',
  'Double horn':
    'Brazo doble',
  'Cross horn':
    'Brazo en cruz',
  'State (0/1)':
    'Estado (0/1)',
  'Common pin':
    'Pin común',
  'New project':
    'Nuevo proyecto',
  'Project saved':
    'Proyecto guardado',
  'Category':
    'Categoría',
  'Submit to Kablix…':
    'Enviar a Kablix…',
  'Share your component':
    'Comparta su componente',
  'Export the component as .json (⇩ button next to it in the palette), then send it:':
    'Exporte el componente en .json (botón ⇩ junto a él en la biblioteca) y luego envíelo:',
  'open a GitHub issue with the “Submit new component” template and attach the .json;':
    'abra una issue en GitHub con la plantilla «Submit new component» y adjunte el .json;',
  'or propose a pull request on the Kablix repository.':
    'o proponga una pull request en el repositorio de Kablix.',
  'Open the GitHub form':
    'Abrir el formulario de GitHub',
  'Close':
    'Cerrar',
  'Hard keys (instead of membrane)':
    'Teclas duras (en lugar de membrana)',
  'All names':
    'Todos los nombres',
  'Selected parts only':
    'Solo los componentes seleccionados',
  'Show part ids':
    'Mostrar el id de los componentes',
  'Ctrl+click to lock the position':
    'Ctrl + clic para bloquear la posición',
  '{0} wire(s) selected':
    '{0} cable(s) seleccionado(s)',
  'Delete these wires':
    'Eliminar estos cables',
  '{0} label(s) selected':
    '{0} etiqueta(s) seleccionada(s)',
  'Delete these labels':
    'Eliminar estas etiquetas',
  'Common cathode (K)':
    'Cátodo común (K)',
  'Common anode (A)':
    'Ánodo común (A)',
  'Digits':
    'Dígitos',
  '1 digit':
    '1 dígito',
  '2 digits':
    '2 dígitos',
  '4 digits':
    '4 dígitos',
  'Colon (clock)':
    'Dos puntos (reloj)',
  'Clock colon (:)':
    'Dos puntos de reloj (:)',
  'Distance (cm)':
    'Distancia (cm)',
  'Temperature (°C)':
    'Temperatura (°C)',
  'Humidity (%)':
    'Humedad (%)',
  'Columns':
    'Columnas',
  '3 columns (3×4)':
    '3 columnas (3×4)',
  '4 columns (4×4)':
    '4 columnas (4×4)',
  'LED (lit when A=high and K=low)':
    'LED (encendido si A=alto y K=bajo)',
  'Pushbutton (pulls the pin to GND)':
    'Pulsador (lleva el pin a GND)',
  'Resistor (joins its two pins)':
    'Resistencia (une sus dos pines)',
  'Buzzer (active when voltage across 1 and 2)':
    'Zumbador (activo si hay tensión entre 1 y 2)',
  'Bipolar transistor (saturated switch C→E)':
    'Transistor bipolar (interruptor saturado C→E)',
  'Relay (coil B1/B2 switches Com from NF to NO)':
    'Relé (la bobina B1/B2 pasa Com de NC a NA)',
  'Digital source (state set in Properties)':
    'Fuente digital (estado fijado en Propiedades)',
  'Analog source (value set in Properties)':
    'Fuente analógica (valor fijado en Propiedades)',
  'Decorative (no behavior)':
    'Decorativo (sin comportamiento)',
  'Red':
    'Rojo',
  'Yellow':
    'Amarillo',
  'Green':
    'Verde',
  'Blue':
    'Azul',
  'Purple':
    'Violeta',
  'Gray':
    'Gris',
  'Fuchsia':
    'Fucsia',
  'Black':
    'Negro',
  'Brown':
    'Marrón',
  'Orange':
    'Naranja',
  'White':
    'Blanco',
  'GYR':
    'VAR',
  'Logic probe':
    'Sonda lógica',
  'Colour':
    'Color',
  'Amber':
    'Ámbar',
  'Dark green':
    'Verde oscuro',
  'Teal':
    'Verde azulado',
  'Pink':
    'Rosa',
  '{0} — already used by another probe':
    '{0} — ya la usa otra sonda',
  'Pin {0}':
    'Pin {0}',
  'unclipped':
    'suelta',
  'No logic probe on the board — clip one onto a pin.':
    'Ninguna sonda lógica en el montaje — engánchela a un pin.',
  'No edge captured yet.':
    'Todavía no se ha capturado ningún flanco.',
  'Probe not clipped: drop its tip right onto a pad.':
    'Sonda suelta: coloque su punta justo sobre un pad.',
  'Nothing to listen to here: this point never reaches a board pin. Clip onto the signal pad.':
    'Nada que escuchar aquí: este punto no llega a ningún pin de la placa. Enganche la sonda al pad de la señal.',
  'Power pad (VCC/GND): a steady level, no edge. Clip onto the signal pad.':
    'Pad de alimentación (VCC/GND): un nivel fijo, sin flancos. Enganche la sonda al pad de la señal.',
  'analog-capable pin: only 0/1 shown':
    'pin analógico: solo se muestran los 0/1',
  'Waiting for the trigger edge…':
    'Esperando el flanco de disparo…',
  'Show hidden channels ({0})':
    'Volver a mostrar los canales ocultos ({0})',
  'Capturing… {0} (waiting for the trigger edge)':
    'Capturando… {0} (esperando el flanco de disparo)',
  'Capturing… {0}':
    'Capturando… {0}',
  'Last capture: {0} ms':
    'Última captura: {0} ms',
  'No trigger':
    'Sin disparo',
  'No decoding':
    'Sin decodificación',
  'Bus':
    'Bus',
  'none':
    'ninguna',
  'Mode':
    'Modo',
  'Format':
    'Formato',
  'Sensor':
    'Sensor',
  'Remove':
    'Quitar',
  'Remove this decoding':
    'Quitar esta decodificación',
  'Active-low line: read the channel upside down (idle high).':
    'Línea activa a nivel bajo: leer el canal invertido (reposo a nivel alto).',
  'Hide this channel: it keeps its capture, it just leaves the screen.':
    'Ocultar este canal: conserva su captura, solo sale de la pantalla.',
  'Hide':
    'Ocultar',
  'Baud':
    'Baudios',
  'auto':
    'auto',
  'Tolerance %':
    'Tolerancia %',
  'Capture full: {0} kept ({1} edges per channel). Click Restart capture to capture anew.':
    'Captura llena: {0} de medida ({1} flancos por canal). Haga clic en Reiniciar la captura para capturar de nuevo.',
  'Frame start':
    'Inicio de trama',
  'Values':
    'Valores',
  'Write each bit under the signal, with a marker between bits.':
    'Escribir cada bit bajo la señal, con una marca entre bits.',
  'Bits':
    'Bits',
  'Invert':
    'Invertir',
  'Channel settings: name, invert, hide, baud rate, tolerance':
    'Ajustes del canal: nombre, inversión, ocultación, velocidad en baudios, tolerancia',
  'Trigger: wait for an edge on this channel, then freeze the capture on it':
    'Disparo: esperar un flanco en este canal y congelar la captura en él',
  'Trigger on this channel: {0}. Click to change or remove it.':
    'Disparo en este canal: {0}. Haga clic para cambiarlo o quitarlo.',
  'Decoding: read a bus on this channel (I²C, SPI, UART, 1-Wire, DHT, DMX512)':
    'Decodificación: leer un bus en este canal (I²C, SPI, UART, 1-Wire, DHT, DMX512)',
  'Decoding: {0}. Click for its settings or to remove it.':
    'Decodificación: {0}. Haga clic para ver sus ajustes o quitarla.',
  'Marker {0}: drag it along the curves; drop it back in the names column to park it.':
    'Marcador {0}: arrástrelo a lo largo de las curvas; suéltelo en la columna de nombres para guardarlo.',
  'Marker {0}: drag it onto the curves. With M1 and M2 placed, the time between them is shown and the exports keep only that span.':
    'Marcador {0}: arrástrelo sobre las curvas. Con M1 y M2 colocados, se muestra el tiempo entre ellos y las exportaciones solo conservan ese intervalo.',
  'Window marker {0}: drag it onto the curves. F1 and F2 frame a span set relative to the trigger: ⏮ ⏭ carry it to the same place in the frame they reach, so the same spot can be checked frame after frame.':
    'Marcador de ventana {0}: arrástrelo sobre las curvas. F1 y F2 enmarcan un intervalo fijado respecto al disparo: ⏮ ⏭ lo llevan al mismo lugar de la trama a la que saltan, para comprobar el mismo punto trama tras trama.',
  'Bring M1 and M2 back to their starting place':
    'Devolver M1 y M2 a su posición inicial',
  'Bring F1 and F2 back to their starting place':
    'Devolver F1 y F2 a su posición inicial',
  'START rep.':
    'START rep.',
  'truncated':
    'truncado',
  'addr {0} {1}':
    'dir {0} {1}',
  'framing':
    'encuadre',
  'parity':
    'paridad',
  'checksum ✓':
    'suma ✓',
  'CHECKSUM ✗':
    'SUMA ✗',
  'REQUEST':
    'PETICIÓN',
  'PRESENCE':
    'PRESENCIA',
  '{0} %RH':
    '{0} %HR',
  'In simulation: Ctrl+click keeps it pressed.':
    'En simulación: Ctrl+clic lo mantiene pulsado.',
  'Ctrl+click to lock the unstable state':
    'Ctrl+clic para bloquear el estado inestable',
  'No readable variable here (C: global variables only).':
    'Ninguna variable legible aquí (C: solo variables globales).',
  'ℹ Only global variables are shown':
    'ℹ Solo se muestran las variables globales',
  'In C/Arduino, declare a variable outside setup() and loop() (global) to inspect it here.':
    'En C/Arduino, declare una variable fuera de setup() y loop() (global) para verla aquí.',
  'No readable variable (define module-level variables to inspect them).':
    'Ninguna variable legible (defina variables a nivel de módulo para inspeccionarlas).',
  'No readable variable here.':
    'Ninguna variable legible aquí.',
  'ℹ Only global and static variables are shown':
    'ℹ Solo se muestran las variables globales y static',
  'In C/Arduino, a variable declared inside setup() or loop() has no fixed address. Declare it outside any function (global), or add “static” before its type, to inspect it here.':
    'En C/Arduino, una variable declarada dentro de setup() o loop() no tiene dirección fija. Declárela fuera de toda función (global), o añada «static» delante de su tipo, para verla aquí.',
  'Variables not readable here:':
    'Variables no legibles aquí:',
  'and {0} more':
    'y {0} más',
  'To be seen, declare variables outside any function, or add the word static in front (e.g. static int myVar = analogRead(A0);).':
    'Para verlas, declare las variables fuera de toda función, o añada la palabra static delante (p. ej. static int miVar = analogRead(A0);).',
  'Show the hidden variables':
    'Mostrar las variables ocultas',
  'Click to hide':
    'Clic para ocultar',
  'Show this variable again':
    'Volver a mostrar esta variable',
  'Show all again':
    'Volver a mostrarlo todo',
  'No hidden variable — click the 👁 of a variable to hide it.':
    'Ninguna variable oculta — haga clic en el 👁 de una variable para ocultarla.',
  'All variables are hidden (click “Variables” to show them again).':
    'Todas las variables están ocultas (haga clic en «Variables» para volver a mostrarlas).',
  'Display of “{0}”':
    'Visualización de «{0}»',
  'Click to change the display base':
    'Clic para cambiar la base de visualización',
  'Binary':
    'Binario',
  'Hexadecimal':
    'Hexadecimal',
  'Decimal':
    'Decimal',
  'Character':
    'Carácter',
  'Serial monitor':
    'Monitor serie',
  'Console':
    'Consola',
  'Click to hide/show this curve':
    'Clic para ocultar/mostrar esta curva',
  'Freeze the display (data keeps being collected)':
    'Congelar la visualización (las medidas se siguen recogiendo)',
  'Resume the display (data keeps being collected)':
    'Reanudar la visualización (las medidas se siguen recogiendo)',
  '⚙ Manage components':
    '⚙ Gestionar los componentes',
  'Auto-route the wires (right angles)':
    'Enrutado automático de los cables (ángulos rectos)',
  'Auto-routing the wires…':
    'Enrutando los cables…',
  'Re-routing the wires from scratch…':
    'Retrazando todos los cables…',
  'Auto-routing stopped: {0} of {1} wires routed':
    'Enrutado interrumpido: {0} de {1} cables enrutados',
  'Zoom in':
    'Acercar',
  'Zoom out':
    'Alejar',
  'Drag a pin endpoint onto another pin to reconnect it.':
    'Arrastre el extremo de un cable sobre otro pin para reconectarlo.',
  'Free text label. Drag it to move it; with the text mode (T) on, click it to edit it.':
    'Etiqueta de texto libre. Arrástrela para moverla; en modo texto (T), haga clic en ella para editarla.',
  'Text color':
    'Color del texto',
  'Background color':
    'Color del fondo',
  'Background opacity':
    'Opacidad del fondo',
  'Text size':
    'Tamaño del texto',
  'Workshop size':
    'Tamaño del taller',
  'Font':
    'Fuente',
  'Workshop font':
    'Fuente del taller',
  'Sans serif':
    'Sin serifa',
  'Serif':
    'Con serifa',
  'Monospace':
    'Monoespaciada',
  'Handwriting':
    'Manuscrita',
  'Delete this label':
    'Eliminar esta etiqueta',
  'The driving transistor cannot pass enough current':
    'El transistor de mando no puede dejar pasar suficiente corriente',
  'This transistor saturates: it only passes gain × base current, less than the motor draws, so the motor stays stalled. Lower the base resistor to drive more base current, or use a transistor with more gain.':
    'Este transistor se satura: solo deja pasar ganancia × corriente de base, menos de lo que pide el motor, así que el motor queda bloqueado. Baje la resistencia de base para inyectar más corriente de base, o use un transistor de mayor ganancia.',
  // Lot de traduction avant publication 2026.9.8
  'Capacity (mAh)':
    'Capacidad (mAh)',
  'Custom…':
    'Personalizado…',
  'Time window, for example 1h30 or 45 min or 90 s':
    'Ventana de tiempo, por ejemplo 1h30, 45 min o 90 s',
  'Board current':
    'Corriente de la placa',
  'Charge used':
    'Carga consumida',
  'The board does not start: {0} gives {1} V on {2}, which needs {3} to {4} V.':
    'La placa no arranca: {0} da {1} V en {2}, que necesita de {3} a {4} V.',
  '{0} was short-circuited: its + is wired straight to its −.':
    '{0} está en cortocircuito: su + está conectado directamente a su −.',
  'Please read ({0} s)':
    'Lea con atención ({0} s)',
  'I have read this':
    'He leído esto',
  '{0}: charge':
    '{0}: carga',
  '{0}: voltage':
    '{0}: tensión',
  '{0}: battery life':
    '{0}: autonomía',
  '{0}: battery is running low ({1} %)':
    '{0}: carga baja ({1} %)',
  '{0} is empty: the board switched off after {1} of program.':
    '{0} está vacía: la placa se apagó tras {1} de programa.',
  '{0} dropped to {1} V: the board switched off after {2} of program ({3} needs at least {4} V).':
    '{0} bajó a {1} V: la placa se apagó tras {2} de programa ({3} necesita al menos {4} V).',
  'Running without a program…':
    'Ejecutando sin programa…',
  'This board was destroyed: one of its pins was fed above {0} V. A Pico runs on 3.3 V and its GPIOs are NOT 5 V tolerant — a 5 V sensor or a generator wired straight to a pin destroys it. Use a voltage divider or a level shifter.':
    'Esta placa se destruyó: uno de sus pines recibió más de {0} V. Una Pico funciona a 3,3 V y sus GPIO NO toleran 5 V: un sensor de 5 V o un generador conectado directamente a un pin la destruye. Use un divisor de tensión o un adaptador de nivel.',
  'This battery was destroyed: its + is wired straight to its − (short circuit). A real one would have heated up in seconds, then caught fire or exploded.':
    'Esta batería se destruyó: su + está conectado directamente a su − (cortocircuito). Una real se habría calentado en segundos y luego se habría incendiado o explotado.',
  'This board was destroyed: {0} gave {1} V on {2}, which takes at most {3} V. A 9 V battery on VSYS/VBUS has no regulator to protect it.':
    'Esta placa se destruyó: {0} dio {1} V en {2}, que admite como máximo {3} V. Una batería de 9 V en VSYS/VBUS no tiene regulador que la proteja.',
  'Batteries':
    'Pilas / Baterías',
  'Vgs(th) max (V)':
    'Vgs(th) máx (V)',
  'Max power (W)':
    'Potencia máx (W)',
};
