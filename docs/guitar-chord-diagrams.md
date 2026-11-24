# Diagramas de acordes de guitarra

## Decisión de producto

Los diagramas de acordes son gratuitos e ilimitados para usuarios anónimos,
Free y Premium. No consumen cupos. El futuro afinador seguirá la misma regla,
pero no forma parte de esta implementación.

## Cobertura inicial

El diccionario local contiene 177 digitaciones:

- 12 raíces cromáticas y 14 calidades frecuentes: mayor, menor, 7, maj7,
  m7, sus2, sus4, dim, aug, add9, m7b5, 6, m6 y 9.
- 9 inversiones verificadas: C/E, C/G, D/F#, G/B, A/C#, F/A, Am/C,
  Em/G y Dm/F.
- Una posición principal por acorde. No se publican alternativas sin una
  revisión musical específica.

La fuente inicial es chords-db (MIT). Cada forma pasa validaciones automáticas
de notas requeridas, notas ajenas, bajo de inversiones, rango de dedos y
trastes, cejillas y reutilización coherente de dedos.

## Auditoría de comodidad

Se compararon las 177 formas con las posiciones válidas disponibles en la
fuente y se revisaron especialmente las 16 formas que comenzaban entre los
trastes 6 y 10. Se reemplazaron esas 16 por posiciones convencionales más
cercanas a la cejuela; D#sus2 conserva una forma estándar con cejilla en el
sexto traste porque no existe una posición abierta equivalente que sea a la
vez simple y conserve el bajo adecuado.

Además se simplificaron Fmaj7, Fm7, F#m7, F#add9 y A#sus2. En total hay 21
formas marcadas como `musum-curated`; las otras 156 conservan la posición
seleccionada de chords-db.

La validación teórica y estructural no certifica comodidad real. Antes de una
publicación se recomienda validar físicamente, con prioridad:

1. Las 21 formas `musum-curated`.
2. D#sus2 en el sexto traste.
3. Acordes aumentados, disminuidos, add9, m7b5, m6 y 9 en todas las raíces.
4. Lectura y tamaño del diagrama en iPad, vertical y horizontal.

La validación física en iPhone fue aprobada para acordes mayores, menores,
séptimas, cejillas, inversiones, transposición, micrófono y autoscroll. La
validación física en iPad queda expresamente pendiente.
