# PoC — Dashboard de proyectos y trazabilidad de revenue

Prototipo para validar con el negocio dos ideas antes de construir nada en producción:

1. **Ver los proyectos** — un listado filtrable por cualquier dimensión, y el detalle completo de cada proyecto al hacer clic.
2. **Ver cómo cambia el revenue en el tiempo** — hoy el Excel solo muestra la foto de hoy; el negocio necesita la película.

Todo sale del Excel `Copy of datos de prueba para Jose y Carlos.xlsx`, hojas **Info Proyectos** y **BackLog NOLA**.

---

## Cómo levantarlo

Esta sección (y el resto del documento) describe el PoC **original**, cuando
el dashboard leía `data/*.json` generados por un ETL en Python a partir del
Excel. Esa etapa ya pasó: hoy el dashboard lee en vivo de PostgreSQL a través
de la API, y `etl.py` / `generar_historia.py` / `actualizar.sh` / `serve.sh`
y `data/*.json` ya no existen en este repo. Se dejó el resto del documento
tal cual porque registra hallazgos del negocio y decisiones de validación que
siguen siendo ciertas sobre el dato — solo cambió **de dónde** sale.

Para levantar el stack actual (Postgres + API + dashboard + n8n):

```bash
cd infra
./forecast.sh up
```

Dashboard en <http://localhost:3000/>. Ver `infra/README.md` para el resto de
comandos (`seed`, `psql`, `logs`, `rebuild`, `down`).

### Si el Excel cambió de estructura

Las columnas se ubican **por el nombre del encabezado**, no por su posición. Si en producción insertan o mueven una columna, el ETL la sigue encontrando. Probado: con una columna extra insertada al principio de `BackLog NOLA`, el total sigue dando $23,627,486.69.

Lo que no se puede adivinar sí aborta, diciendo exactamente qué falta:

| Situación | Qué pasa |
|---|---|
| Columna renombrada (`Acum 2025` → `Acumulado 2025`) | Aborta y nombra la columna que no encontró |
| A un mes le falta su `Upside` a la derecha | Aborta y dice qué mes y en qué columna está |
| Falta la hoja `Info Proyectos` o `BackLog NOLA` | Aborta y lista las hojas que sí hay |
| Quarters o totales no reconcilian en ≥98% de las filas | Aborta: el mapeo quedó corrido |
| Menos del 95% de los proyectos cruzan entre las dos hojas | Aborta: sin ese cruce cada proyecto mostraría el revenue de otro |

**En todos esos casos no se escribe ningún JSON.** Los datos anteriores quedan intactos: es preferible seguir viendo los números viejos que pisarlos con números falsos.

> No es paranoia. Antes de poner esta red, una columna insertada hacía que el ETL terminara sin ningún error y escribiera `"Completed"` dentro de `num_opp`, el PA dentro de `nombre_del_proyecto`, y un total de $1.38M en vez de $23.6M. El dashboard se veía perfecto.

### Lo que sí hay que repasar a mano

- **Las columnas verdes** se detectan por el color de relleno del encabezado, y el tono **no es estable entre libros**: `Info Proyectos` usaba `#00A933` y en el FY26 pasó a `#00FF00`. Se aceptan ambos, y si una hoja queda sin ninguna columna verde el ETL **aborta** en vez de generar una tabla vacía.

  > Pasó de verdad: con el libro FY26, la detección devolvió 0 columnas verdes y el listado de proyectos quedó con solo dos columnas (PA y revenue). Por eso ahora es una regla que corta, no un aviso.
- **La trazabilidad se vuelve a simular desde cero** en cada corrida. En producción cada refresco **agregaría** un snapshot real al histórico en vez de reinventarlo. Es la pieza que falta construir.

El dashboard lee los JSON por `fetch`. Esa es la arquitectura real: cuando esto pase a producción, n8n regenera los JSON y el dashboard se actualiza sin tocar una línea de código.

---

## Lo que encontramos en el Excel (y que el negocio debería saber)

### 8 columnas están rotas hoy

En `Info Proyectos`, estas columnas muestran `#VALUE!` en **30 de 349 filas** (en el libro anterior eran 303 de 304, así que alguien ya arregló la mayoría en la fuente):

`Mes de finalización` · `Año de finalización` · `Días para vencimiento` · `Meses transcurridos` · `Estado contrato` · `Tipo de ejecución` · `Ejecución Deseada` · `Q del Clawback`

**La causa:** la columna `Finalizacion` arma la fecha con `CONCATENATE(...)`, lo que produce **texto**, no una fecha. Entonces `MONTH()`, `YEAR()` y la resta `N - TODAY()` fallan, y el error se propaga en cascada a todo lo que depende de ellas.

Tres de esas columnas (`Días para vencimiento`, `Meses transcurridos`, `Q del Clawback`) están marcadas en verde, o sea que el negocio las considera importantes — y hoy no sirven.

**Qué hicimos:** el ETL las recalcula desde `Fecha fin`, que sí tiene fechas reales. El valor original del Excel queda guardado en `_errores` de cada fila, así que la corrección es auditable. En el dashboard esos campos llevan un badge "recalculado".

Resultado del recálculo (319 de 349 proyectos tienen fecha válida):

| Estado del contrato | Proyectos |
|---|---:|
| Contrato vigente | 180 |
| Contrato vencido | 108 |
| Vence en menos de 30 días | 16 |
| Finaliza en menos de 60 días | 15 |
| Sin fecha válida | 30 |

### Reglas de negocio confirmadas

- `Q1 = Enero + Febrero + Marzo` contando **solo el revenue Fijo**. Los quarters **no** incluyen Upside. (Verificado en 1396 de 1396 casos.)
- `TOTAL EJECUTADO = Q1 + Q2 + Q3 + Q4 + Acum 2025`. (Verificado en 348 de 348 filas.)

### Las dos hojas no van fila a fila

En el libro anterior, la fila *N* de `Info Proyectos` y la fila *N* de `BackLog NOLA` eran el mismo proyecto. **En el FY26 ya no: 299 de 349 filas están desalineadas.** El cruce se hace por `# PA` y, para los proyectos que todavía no tienen PA, por nombre normalizado.

Si alguna vez ese cruce baja del 95%, el ETL aborta. Es la red más importante de todas: un cruce por posición no falla, simplemente le muestra a cada proyecto el revenue de otro.

### Cadencia real de actualización

La hoja `Auto Refresh Execution Log` muestra que el Excel de producción se refresca **cada 4 horas** desde un reporte de Salesforce (`Report Id: 00O3a000005euzwEAA`). Ese es el ritmo al que habría que enganchar la automatización.

---

## La simulación de trazabilidad

El Excel es una foto estática, así que reconstruimos la película hacia atrás.

**El modelo:** el estado final es el dato real del Excel, exacto. Los anteriores se reconstruyen **hacia atrás**, deshaciendo movimientos uno por uno.

Cada proyecto tiene **su propio calendario de cambios**: se mueve en sus fechas, con su intensidad, y en las dos direcciones (Upside → Commit, y también Commit → Upside cuando algo se desconfirma). Entre movimiento y movimiento el dato queda **exactamente quieto** — y eso es justo lo que hace legible el *"aquí cambió"*. El monto previsto de cada mes no cambia; lo que cambia es su clasificación.

> Una versión anterior aplicaba una sola curva global a todos los proyectos. El resultado: **160 de 188 proyectos tenían la curva idénticamente igual**, así que abrir un proyecto u otro mostraba la misma gráfica y la vista de detalle no decía nada. Hoy, entre los **174 proyectos con movimiento, las 174 curvas son distintas**: ninguna se repite.

Los **152 proyectos sin movimiento** no son un error: 113 simplemente no tienen revenue que mover, y el resto son proyectos `Completed` o `Canceled`, que ya no negocian nada. En esos casos el dashboard **no pinta una línea plana**: lo dice con palabras.

Esto no es un supuesto arbitrario — explica el patrón que ya está en el Excel: hoy el Upside existe **solo de agosto a diciembre** ($682K) y es cero de enero a julio, porque esos meses ya se cerraron.

**La línea de tiempo** son 32 snapshots:

- **11 mensuales** de noviembre 2025 a septiembre 2026. Tres de ellos (febrero, mayo, agosto) son deliberadamente planos: que "no pase nada" también es información.
- **20 intradía** entre el 14 y el 20 de septiembre de 2026, a ~3 por día, imitando el refresco de Salesforce: 26 proyectos confirman revenue de golpe, cada uno en su propio momento, y 5 sufren un retroceso a mitad de semana (revenue confirmado que vuelve a Upside). Esta concentración es un recurso del PoC para que se vea movimiento en poco tiempo; en producción la cadencia será pareja y el dashboard no la trata como nada especial.
- **1 final** = hoy, 6 de octubre de 2026. **Reproduce el Excel exactamente, por construcción.**

La historia que cuenta:

| | Nov 2025 | Hoy |
|---|---:|---:|
| Revenue fijo | $11.20M | $17.03M |
| Upside | $6.51M | $0.68M |
| Backlog | $14.84M | $9.22M |
| Proyectos activos | 335 | 349 |

### La trazabilidad es por proyecto, no solo global

`historia_revenue.json` tiene tres niveles, del más fino al más grueso:

| Nivel | Qué guarda | Dónde se ve |
|---|---|---|
| **Proyecto × mes × snapshot** | `series_por_proyecto[num_pa][i].meses` = 12 pares `[fijo, upside]` | Tabla "mes a mes" en el detalle del proyecto |
| **Proyecto × snapshot** | total, fijo, upside y backlog de ese proyecto | Gráfica de línea del proyecto |
| **Portafolio × snapshot** | los mismos agregados, sumados | Pestaña de Trazabilidad Global |

Es decir: para **cada uno de los 349 proyectos** se guarda, en **cada uno de los 32 snapshots**, cuánto revenue tenía en **cada uno de los 12 meses**, separado en Fijo y Upside. Son 349 × 32 × 12 × 2 ≈ 268 mil valores.

Eso es lo que permite responder, proyecto por proyecto: *"¿cuánto tenía este proyecto en septiembre, y cuándo cambió?"*. Ejemplo real del PA 64779, mes de enero:

| Snapshot | Fijo | Upside |
|---|---:|---:|
| Nov 2025 | $210,467 | $76,533 |
| Abr 2026 | $236,488 | $50,512 |
| Sep 2026 | $254,856 | $32,144 |
| 15 sep 14:00 | $247,206 | $39,794 ← retroceso |
| 18 sep 22:00 | $282,701 | $4,299 |
| Hoy | $287,000 | $0 |

Además se generan **797 eventos** de cambio (`upside_a_fijo`, `fijo_a_upside`, `alta_proyecto`), cada uno con marca de tiempo, proyecto, mes afectado y monto. Los eventos son el registro de movimientos *notables* (por encima de $1,000); la tabla mes a mes muestra el detalle completo aunque el movimiento haya sido pequeño. Esa es la estructura que en producción llenaría el flujo de n8n en cada refresco.

La simulación es **determinista** (semilla `20261006`): dos corridas producen exactamente lo mismo.

---

## El dashboard

Tres vistas, con el estado en la URL (`#listado`, `#detalle/64779`, `#trazabilidad`, y `?periodo=q2`) para poder compartir un enlace directo.

### Los dos ejes de tiempo

Es la distinción que ordena todo el dashboard:

| Eje | Qué es | Dónde se controla |
|---|---|---|
| **Calendario de revenue** | los 12 meses de 2026 y sus quarters — *"¿cuánto revenue hay en marzo?"* | el selector **Periodo de revenue** |
| **Línea de snapshots** | los 32 momentos en que se tomó la foto — *"¿cuándo cambió el dato?"* | el eje X de las gráficas de línea y los selectores *Comparar entre … y …* |

El **selector de periodo** (Todo el año · Q1–Q4 · cada mes) es estado global: filtra las gráficas, las tablas y los KPIs de revenue en las tres pestañas, y se mantiene al cambiar de vista. La segunda gráfica hace drill-down sola: con *Todo el año* muestra los 4 quarters, con un quarter muestra sus 3 meses, con un mes muestra ese mes.

**Listado** — 6 KPIs que se recalculan con cada filtro, 13 filtros multiselección (Estado, Cliente, Zona, País, Billing Type, Billing Arrangement, PM, Vendedor, TSM, Estado contrato, Tipo de ejecución, Año fin, Riesgo) más búsqueda libre, 4 gráficas y la tabla de las 16 columnas verdes, ordenable por cualquiera.

El KPI **Revenue fijo · periodo** y la última columna de la tabla salen de BackLog NOLA y responden al selector de periodo. El resto de indicadores y columnas son **totales anuales** de Info Proyectos, que no tiene apertura mensual: la pantalla lo dice explícitamente para que nadie lea un número anual como si fuera del trimestre.

Los conteos de cada filtro son **contextuales**: el número junto a una opción dice cuántos proyectos quedarían si la marcas *con los demás filtros ya puestos*, no el total global. Sin eso los conteos mienten en cuanto hay dos filtros activos.

**Detalle** — las 35 columnas agrupadas en 5 secciones. Los campos recalculados llevan badge `recalculado`, y los que el Excel tenía rotos llevan además `error`, para que la corrección sea evidente y auditable. Debajo van tres bloques de trazabilidad de ese proyecto:

1. la línea de cómo evolucionó su revenue Fijo vs Upside, con la semana de alta actividad sombreada;
2. una tabla **mes a mes** que compara dos snapshots cualesquiera (se eligen con dos selectores) y muestra el delta de Fijo y de Upside por mes, con fila de total;
3. el registro de movimientos con fecha, mes afectado, valor anterior, nuevo y delta.

Arriba de la gráfica va el resumen en una línea: *"11 movimientos en Todo el año · Jun 2026 · 14 sep 06:00 · 14 sep 14:00 …"*. Y en la línea solo se dibuja un punto **donde el valor se movió**, no en los 32 cortes: cada marca es una fecha en la que pasó algo.

En los deltas, el color sigue al negocio: que suba el Fijo es bueno, que suba el Upside no (significa que algo se desconfirmó).

Nueve proyectos traen meses en **negativo** (notas crédito y reversiones del Excel). Las gráficas los dibujan hacia abajo desde la línea de cero en vez de romperse.

**Trazabilidad global** — tres bloques, todos sobre los 349 proyectos:

1. **Revenue en el tiempo** y **desglose del periodo**: las líneas son la suma del portafolio completo para el periodo elegido.
2. **¿Qué cambió entre dos fechas?** — la vista que responde la pregunta del negocio. Se eligen dos snapshots (o se usan los atajos *Último movimiento*, *Último mes*, *Semana del 14-20 sep*, *Todo el histórico*) y muestra:
   - **Un resumen del rango leído como una ecuación**: *proyectos que se movieron* · *Upside → Commit* **−** *Commit → Upside* **=** *variación neta*. Los operadores entre tarjetas son lo que hace que se entienda de un vistazo que $6.14M − $143K = +$6.00M, en vez de ser cinco cifras sueltas.
   - **Una gráfica** con la curva de Commit de los 8 proyectos que más se movieron, cada uno con su color y su PA en la leyenda. Los puntos se dibujan **solo donde el valor cambió**, así que cada marca es una fecha en la que pasó algo.
   - **La tabla completa**, filtrada por defecto a los que se movieron. Cada fila lleva un chip con *qué pasó* — `Upside → Commit`, `Commit → Upside`, `Movimiento mixto` o `Entró al backlog` — con los **meses afectados** debajo, y **al pasar el mouse por una fila se resalta su línea en la gráfica** y se atenúan las demás. Eso resuelve el "¿cuál línea es cuál proyecto?" sin llenar el gráfico de etiquetas.
   - **El contador de movimientos se despliega.** Un "13" no dice nada; al hacer clic se abre el detalle de ese proyecto con un renglón por movimiento: *cuándo · qué mes se afectó · en qué dirección · cuánto · el Commit de ese mes antes y después*. Ahí es donde se ve el dato concreto que cambió.

   > **Las cifras del detalle van al dólar exacto, no abreviadas.** La abreviatura sirve para leer de lejos pero no se puede sumar: 14.179 y 27.361 se muestran como `$14K` y `$27K`, que suman 41K, mientras su total 41.541 se muestra como `$42K`. En la vista donde el usuario audita se dan los números completos y una fila de **Total** que cierra contra el Δ de arriba. En la tabla principal la cifra sigue abreviada, pero el valor exacto está en el tooltip de cada celda.

   Con el atajo *Último movimiento* la pregunta "¿de ayer a hoy qué cambió?" se responde en un clic: salta al último par de fechas con actividad real y lista solo esos proyectos.

3. **Movimientos registrados**: el log con fecha, proyecto, mes afectado y monto. Trae un tope de 2 por proyecto activado por defecto — sin él, el proyecto más grande del portafolio (PA 64779, el 20% del Valor OF) acapara la tabla entera y deja de ser una vista global. Se puede quitar el tope y filtrar por tipo o por proyecto.

Un par de decisiones que cambian números respecto al Excel:

- **% Ejecución global** se calcula ponderado (`acumulado / valor OF` = 70.7%), no como promedio simple de los porcentajes (que daba 78.0%). Un proyecto de $2M no puede pesar igual que uno de $20K.
- Los campos nulos **no cuentan como cero** en promedios. Con 26 proyectos en `#N/A`, tratarlos como cero sesgaría todo hacia abajo.
- El eje de tiempo de las gráficas está espaciado **por snapshot, no por fecha**: los refrescos intradía ocupan el mismo ancho que los meses. Se lee mejor como secuencia de eventos, pero no es una escala temporal lineal.
- **Info Proyectos no tiene trazabilidad**, y es correcto que no la tenga: sus campos (cliente, PM, zona, Valor OF) son atributos del proyecto, no valores que se muevan día a día. Lo que cambia —y lo que se rastrea— es el revenue de BackLog NOLA.

### Hallazgos que vale la pena mostrarle al negocio

- Un solo proyecto —**BANRESERVAS, PA 64779, $8.0M**— es el 20% del Valor OF de todo el portafolio y el 65% de República Dominicana. Por eso RD aparece primero por valor ($12.4M) pese a tener 32 proyectos contra los 125 de México.
- **108 de 349 contratos están vencidos** y 16 vencen en menos de 30 días. Ese dato no era visible en el Excel porque la columna estaba rota.

## Contraste con las notas de la reunión

Lo que el negocio anotó, verificado contra los datos reales.

### Confirmado

| Nota | Qué dicen los datos |
|---|---|
| "mientras no tiene PA nos guiamos por el PR" | **22 proyectos** traen un `PR-xxxxx` dentro de la columna `# PA`, y **14 no tienen PA** (13 de ellos cancelados). El dashboard muestra una columna `PA / PR` que cae al PR cuando no hay PA |
| "un cliente tiene varios proyectos" | **71 clientes con más de 1 proyecto**, cubren 235 de 349. Hay filtro por cliente y, en el detalle, un bloque *Otros proyectos de este cliente* con el Valor OF de la cuenta completa |
| "Valor OF sirve para determinar el backlog" | `backlog = Valor OF − Acum 2025 − Q1..Q4` |
| "fecha fin sirve para saber cuántos días quedan" | Es exactamente la columna que el Excel tiene rota y que el ETL recalcula |
| Fixed Price por entregable / T&M por bolsa de horas | 257 y 54 proyectos |
| "revenue es lo consumido" | `Acum 2025` es lo consumido y alimenta el TOTAL EJECUTADO |
| "el valor del mes está en commit, y upside" | Adoptado como vocabulario: el dashboard dice **Commit**, no "fijo". En el JSON el campo sigue siendo `<mes>_fijo` |

### Corregido o aclarado

- **"outgoing"** no existe como estado. Son **On Hold** (22 proyectos). Los cinco estados se ordenan ahora por el flujo del negocio: `Planned → In Progress → On Hold → Completed → Canceled`, no alfabéticamente.
- **Cancelados**: ocultos por defecto, con interruptor *Incluir cancelados*. Dato útil: los 26 tienen **Valor OF = $0**, así que esconderlos no mueve ninguna cifra de plata, solo el conteo (349 → 323).

### Falta en la fuente — hay que pedirlo antes de producción

- **`billing_arrangement`** (la manera de facturar, pedido como filtro): **ya existe en el libro FY26**, como columna `Billing Arrengement` (así, con la errata) al final de ambas hojas. Tiene 5 categorías reales — Multi Deliverable (149), Upfront (64), One Deliverable (61), Monthly (42), Interval (1) — y 32 proyectos sin dato. Ya está como filtro en el dashboard. En el libro anterior no existía.
- **`start_at_risk`**: tampoco existe en el libro. En el PoC está **simulado** con una semilla determinista (59 de 349, 17%), solo para poder enseñar el filtro y el badge. **Es un dato inventado**; queda marcado como tal en `meta.campos_simulados` de `proyectos.json`.

### Sin trazabilidad, a propósito

Info Proyectos no lleva historial y es correcto que no lo lleve: cliente, PM, zona y Valor OF son *atributos* del proyecto, no valores que se muevan a diario. Lo que cambia —y lo que se rastrea— es el revenue de BackLog NOLA. Las notas del negocio sí señalan que PM, zona, vendedor y TSM "a veces se ajustan manualmente"; si más adelante quieren auditar esos cambios, haría falta versionar también Info Proyectos.

## Validación

Los totales del JSON se compararon contra los del Excel, celda por celda. **11 de 11 métricas cuadran exacto:**

| Métrica | Valor |
|---|---:|
| Valor OF (Info Proyectos) | $39,405,567.97 |
| Acumulado a hoy | $26,142,756.78 |
| Consumido 2025 | $6,723,853.61 |
| Backlog 2026 | $32,750,174.09 |
| Valor OF (BackLog NOLA) | $37,784,078.31 |
| TOTAL EJECUTADO | $26,855,094.20 |
| Backlog (NOLA) | $10,997,443.84 |
| Acum 2025 | $6,601,108.96 |
| Q1 / Q2 / Q3 / Q4 | 4.79M / 5.61M / 6.22M / 3.63M |
| Revenue Commit (12 meses) | $20,253,985.24 |

Además se verificó el estado final de la trazabilidad **celda por celda**: las 8.376 combinaciones proyecto × mes × (fijo, upside) del último snapshot coinciden exacto con el Excel.

El reporte completo está en `data/validacion.md` y se regenera con cada corrida del ETL.

---

## Por qué JSON y no CSV

Los datos tienen texto con saltos de línea (la columna `ESTATUS` son bitácoras de varias líneas), comas dentro de los valores, y estructura jerárquica (los errores y valores recalculados por fila). En CSV eso se rompe o exige escapar todo. Además el dashboard consume los datos por `fetch` en el navegador, donde JSON es nativo.

---

## Archivos

Esta tabla es del PoC original (Excel → JSON). Ya no existe en este repo;
queda como referencia de lo que hacía cada pieza:

| Archivo (retirado) | Qué hacía |
|---|---|
| `actualizar.sh` | Regeneraba todos los datos desde el Excel. |
| `etl.py` | Excel → JSON. Recalculaba las columnas rotas, preservaba los errores, validaba las reglas de negocio. |
| `generar_historia.py` | Simulaba los 32 snapshots de trazabilidad y los eventos de cambio. |
| `data/*.json` | Los datos que consumía el dashboard antes de leer de Postgres. |
| `serve.sh` | Levantaba el servidor local (`http.server`). |
| `data/validacion.md` | Reporte de validación, regenerado en cada corrida. |

Lo que sí sigue en el repo:

| Archivo | Qué hace |
|---|---|
| `index.html` · `app.js` · `styles.css` · `vendor/` | Dashboard. Vanilla JS, sin dependencias ni CDNs: funciona sin internet. Lo sirve `infra/api` como estático. |
| `n8n/n8n_nola_completo.json` | Export del workflow de n8n (definitivo, no se edita a mano aquí). |
| `infra/` | Postgres + API + n8n + nginx, un solo `docker-compose`. Ver `infra/README.md`. |

---

## Qué falta para producción

Esto era un PoC: la idea de negocio puesta en pantalla para que el equipo dijera "sí, pero cámbiale esto". Estado actual de esa lista:

- **Resuelto:** Postgres es la fuente de verdad (`revenue_mes`/`revenue_anual`), la API lee de ahí y el dashboard ya no depende de JSON generados a mano. Ver `infra/README.md`.
- **Pendiente:** la conexión en vivo al Excel de producción (Drive Trigger → ETL → Postgres por n8n, sin pasar por JSON intermedios). Hoy la carga a Postgres sigue siendo manual. El diseño de esa pieza está en el `CLAUDE.md` de la raíz del repo.
- **Pendiente:** autenticación y control de acceso.
- Arreglar las 8 columnas rotas **en el Excel origen** (aquí se corrigen aguas abajo, pero el problema sigue en la fuente).
