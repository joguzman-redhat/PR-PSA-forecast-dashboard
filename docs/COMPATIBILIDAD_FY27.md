# Compatibilidad FY26/FY27

El workflow `n8n/n8n_nola_completo.json` permite cargar FY26 y FY27 en
capturas separadas por año/fuente. Esta version revisa FY26 y FY27 en orden
en cada ejecucion, en modo `cargar` por defecto y con ambos IDs configurados. El cambio esta preparado en
el archivo local; importarlo en n8n no ejecuta una carga automaticamente.
Las herramientas del agente permanecen limitadas explicitamente a FY26.

## Configuracion

En el nodo **Configurar Fuente Forecast**:

```js
const ANIOS_FORECAST = [2026, 2027];
const MODO = 'cargar';
```

No hay que cambiar el año entre ejecuciones. `MODO = 'validar'` revisa ambas
fuentes sin consultar ni escribir PostgreSQL. Solo para diagnostico se puede
reducir `ANIOS_FORECAST` a `[2026]` o `[2027]`; se rechazan años duplicados.

Ambos años admiten `cargar` y `validar`. El hash y el constructor SQL
rechazan años no soportados, modo distinto de cargar, ausencia de ID de
fuente y filas normalizadas de otro año. Aplicar primero la migracion y
actualizar API/dashboard: una instalacion antigua no es compatible con la
carga FY27 solo por importar el JSON.

Fuentes configuradas:

- FY26: `1_NNst0wIKXAlCa7fu8RRiBFAahcXzvuGEEt5IAhm-co`.
- FY27: `13ULKx3-9MmFrU6suvm8jSgIwIKsBh44wLH7i_l10tSE`.

El archivo antiguo `data.xlsx` de Drive no es la fuente predeterminada.
Las hojas utilizadas siguen siendo **Info Proyectos** y **BackLog NOLA**.
No se selecciona automaticamente **NEW BackLog NOLA**.

## Flujo

Manual Trigger → configuracion de las dos fuentes → bucle (una fuente) →
Drive → extraccion de ambas hojas → normalizacion por año → enriquecimiento
→ validacion de calidad → carga/sin cambios → siguiente fuente → resumen final.

- Si falla la calidad, se aborta antes de escribir esa fuente. Las fuentes
  completadas anteriormente conservan sus cargas; no hay una transaccion global
  para los dos archivos. Un error real detiene el bucle y no se oculta.
- Si el modo es `validar`, **Resumen Validacion Forecast (sin escritura)**
  devuelve cobertura y muestras, y continua con la siguiente fuente.
- Si es FY26 o FY27 en modo `cargar`, sigue por hash y SQL, particionados por año/archivo.

Se conservan los encabezados crudos y se agrega `_forecast` en cada fila de
backlog: `anio_forecast`, `valor_of`, `acumulado_anterior`, `backlog`,
`total_ejecutado` y doce pares mensuales de Commit/Upside. El SQL utiliza
estos valores normalizados. La columna fisica legacy `revenue_anual.acum_2025`
almacena el acumulado anterior del año de cada carga: 2025 para FY26 y
2025–2026 para FY27. La API lo expone como `acumulado_anterior`; consultar
esa columna SQL exige filtrar siempre por año/fuente de la carga.

El mapeo financiero FY27 utiliza **Total Ejecutado Acumulado 2025-2026**,
**Backlog 2027** y **TOTAL EJECUTADO ACUMULADO 2025-2026-2027**.
No vuelve a sumar FY26 al acumulado anterior de FY27. Los ceros se conservan;
los valores ausentes/invalidos no se convierten en cero en los totales anuales.

La validacion exige encabezados financieros y mensuales, al menos un valor
numerico util por campo financiero, llaves sin duplicados y los controles
anteriores de cruce y numero minimo de filas. Esto no prueba exactitud de
negocio ni sustituye una conciliacion financiera por proyecto.

VERSION_ETL sube a 5 e incluye año y archivo origen en el hash. La primera
carga FY26 con esta version puede generar un nuevo snapshot aunque el Excel
no haya cambiado. El mismo contenido posterior se deduplica; los campos
enriquecidos dependientes de la fecha siguen pudiendo cambiar el hash otro dia.

## Pruebas

Desde la raiz del repositorio, con Node.js y Podman:

```bash
node n8n/test/forecast-compatibility.test.js
node n8n/test/carga-sql.test.js
node n8n/test/forecast-loop.test.cjs
```

La primera suite verifica mapeos, configuracion, controles de escritura, modo de
validacion y errores de estructura. La segunda usa PostgreSQL efimero sin
red, puertos ni volumenes compartidos; no necesita el stack real.

## Almacenamiento por año y fuente

Migracion: `infra/db/migraciones/2026-11-14_forecast_por_anio.sql`, incluida
tambien en el esquema inicial y su copia OpenShift. Es transaccional e
idempotente; no elimina tablas, cargas ni importes.

- `carga.anio_forecast`: año del calendario, independiente de la fecha de carga.
- `carga.archivo_id`: ID de Drive, desconocido (`NULL`) en cargas anteriores.
- `proyecto_snapshot`: atributos descriptivos por proyecto/carga, capturados
  automaticamente con cada upsert. Los importes siguen en las tablas de hechos.
- El hash y la carga previa del workflow se consultan por año y archivo.
- PostgreSQL rechaza movimientos entre años o archivos diferentes. La API
  tambien particiona por ambos campos al reconstruir movimientos no materializados.
- `v_carga_actual_por_forecast`, `v_proyecto_por_forecast` y
  `v_revenue_mes_por_forecast` ofrecen datos identificados por año y fuente
  para los consumidores que seleccionan año/fuente. Las vistas legacy siguen
existiendo; no deben usarse para consultas multianuales.

El historico existente se clasifica FY26, que es su alcance previo. Si hay
una carga etiquetada FY27 aun clasificada FY26, la migracion aborta para
exigir revision. No se deduce un ID de archivo del nombre del documento.
La primera carga del workflow nuevo con un ID conocido establece su propia
linea base; no genera movimientos contra cargas de origen desconocido.

La migracion recupera solo los atributos actuales de cada proyecto, asociados
a su `ultima_carga_id`, con origen `estado_actual_migracion`. No reconstruye
PM, zona u otros atributos de capturas anteriores que nunca se guardaron.

Pruebas adicionales, sin tocar los volumenes reales:

```bash
node infra/db/test/forecast-year.test.cjs
```

Para otra instalacion, respaldar primero y aplicar la migracion antes de
importar el JSON de esta etapa. `./forecast.sh migrate` detiene la ejecucion
ante cualquier error SQL. No ejecutar el esquema inicial sobre una base
existente ni borrar volumenes para actualizarla.

En esta maquina se aplico la migracion con respaldo externo al repositorio:
se conservaron 6 cargas, 22.812 registros mensuales y 1.901 anuales. Las
huellas MD5 de todas las filas de ambas tablas financieras coincidieron antes
y despues. Se capturaron 349 filas descriptivas existentes y los endpoints
del dashboard siguieron respondiendo HTTP 200. No se ejecuto el ETL ni se cargo FY27.

Se probo tambien la copia local `data/data2.xlsx`: 343 filas validas por hoja,
343 acumulados anteriores y totales ejecutados, 326 importes OF y backlog
numericos; 17 ausentes/invalidos permanecen nulos. Es un archivo de prueba:
estas cifras no son metricas del negocio ni verifican el contenido de Drive.

El JSON no se importa automaticamente en n8n. Antes de sustituir un workflow
local, exportarlo como respaldo y conservar sus referencias de credenciales;
las referencias del archivo Git pueden ser placeholders o IDs de otro entorno.
Ejecutar siempre desde Manual Trigger despues de importar, para no reutilizar
salidas antiguas sin metadatos de fuente.

## API y dashboard por año (etapa 3)

- `GET /api/forecasts` entrega años y fuentes disponibles, incluida su ultima captura.
- `/api/proyectos`, `/api/backlog` y `/api/historia` aceptan `anio` (2026 por
  defecto), `archivo_id` y `carga_id`. Las consultas son parametrizadas.
- Omitir `archivo_id` selecciona la fuente mas reciente del año. Enviarlo
  vacio selecciona solamente el historico anterior sin origen identificado.
- El dashboard fija el mismo `carga_id` para sus tres consultas. Cambiar año
  reinicia graficas, filtros y detalles; nunca muestra FY26 como sustituto de FY27.
- FY27 sin cargar devuelve HTTP 200, `meta.estado=sin_datos` y colecciones
  vacias. No es un error de conexion y validar en n8n no lo llena.
- El selector de fuente permite consultar el historico anterior sin mezclarlo
  con la nueva linea de cargas identificadas por ID de Drive.
- Los atributos descriptivos proceden de `proyecto_snapshot`; los importes
  proceden de `revenue_anual` y `revenue_mes` de esa misma captura.
- `acumulado_anterior` representa el ejecutado previo al año elegido. El
  calendario, el corte mensual (hora Colombia) y la proyeccion parten de ese
  año. `acum_2025` queda como alias de compatibilidad solo en FY26.

Pruebas de esta etapa (API con PostgreSQL temporal; no modifica datos reales):

```bash
npm --prefix infra/api ci --ignore-scripts
npm --prefix infra/api test
node infra/api/test/run-forecast-years.cjs
node infra/db/test/forecast-year.test.cjs
```

Las suites cubren ruta base/proxy, modo demo, selector, corte temporal,
misma captura en los tres endpoints, atributos historicos, aislamiento de
cache por año/fuente y respuestas vacias. La prueba de integracion usa datos
sinteticos en contenedores efimeros. No sustituye revisar visualmente las
cifras del dashboard contra los libros originales.

## Carga FY27 preparada (etapa 4)

Se habilito la escritura FY27 y se probo el SQL real con PostgreSQL temporal:
7 pruebas SQL y 9 de compatibilidad aprobadas. Una secuencia FY26 → FY27 →
FY26 → FY27 conserva atributos y montos por captura, y calcula movimientos
solo dentro de cada año/fuente. Las consultas SQL reales de las herramientas
del agente tambien se ejecutaron contra esa base y permanecieron en FY26.

El agente no admite aun preguntas FY27 ni comparaciones multianuales. Sus
herramientas PostgreSQL usan atributos capturados de FY26 y el mensaje de
sistema declara el alcance; los resultados limitados no son conteos totales.

Para ejecutar en n8n:

1. Exportar el workflow actual como respaldo e importar el JSON completo.
2. Conservar/seleccionar las credenciales existentes de Drive y PostgreSQL;
   los IDs de credenciales no son portables entre instalaciones.
3. En **Configurar Fuente Forecast**, verificar `ANIOS_FORECAST = [2026, 2027]`
   y `MODO = 'cargar'`, y ejecutar desde **Manual Trigger**.
4. Esperar **Ejecutar Carga en Postgres** y comprobar que devuelve `carga_id`,
   proyectos y filas_revenue. Primera carga de una fuente: cero movimientos.
5. En el dashboard seleccionar FY27 y conciliar proyectos, Valor Booking,
   acumulado anterior, backlog y meses contra **BackLog NOLA** del libro real.
   Volver a FY26 y verificar que conserva su captura anterior.
6. Repetir sin cambios pasa por **Sin Cambios (siguiente fuente)** para cada
   archivo y termina en **Resumen Actualizacion Forecast**. El hash puede
   variar otro dia por atributos que dependen de la fecha de referencia.

La version de carga individual ya fue ejecutada por el usuario: FY26 esta en
carga 7 y FY27 en carga 8, con 343 proyectos cada una. Se conciliaron los dos
Excel locales con la API: 19.208 comparaciones de campos anuales/mensuales,
sin diferencias mayores a un centavo. Esto verifica las copias locales y las
capturas cargadas; no garantiza que Drive no cambie despues.

## Revision automatica de ambas fuentes (etapa 5)

El nuevo bucle reutiliza una sola cadena de extraccion y SQL. La referencia
a la fuente de **Combinar JSON** toma la iteracion actual explicitamente;
no reutiliza la primera fuente del bucle. Cada salida correcta regresa al
bucle: validacion, sin cambios o escritura confirmada con carga_id.
La salida done genera **Resumen Actualizacion Forecast**, con resultado por
año, numero de cargas nuevas y numero de fuentes sin cambios/solo validadas.

Se ejecutaron 5 escenarios en un motor n8n temporal sin red ni credenciales:
ambas fuentes cambian, ninguna cambia, solo FY26, solo FY27, y validar ambas.
Drive/extraccion/llamadas PostgreSQL se sustituyen por datos sinteticos en esa
suite; el resto usa los nodos reales, incluido el bucle, Merge, expresiones,
normalizacion, hash y constructor SQL. Las 7 pruebas SQL con PostgreSQL real
pero efimero y las 9 pruebas de compatibilidad tambien pasan (21 en total).

No se ha importado ni ejecutado automaticamente este bucle en el n8n del
usuario. No se hizo commit ni push. No hay cambios en API, dashboard ni
esquema para esta etapa y no se recalcularon importes. Mantiene VERSION_ETL 5:
la logica financiera y la estructura del hash no cambian al añadir el bucle.
No se agrego un Schedule Trigger; el disparador sigue siendo manual.

Verificacion local de etapa 3 (antes de cargar FY27): 11 pruebas de API/UI,
8 de integracion y 10 de PostgreSQL aprobadas. Tras reconstruir la API local,
los tres endpoints FY26 respondieron HTTP 200 con carga 7 (343 proyectos y
343 filas de backlog). FY27 respondio sin_datos con cero proyectos y un año
invalido devolvio HTTP 400. El HTML servido incluye el selector. No hubo
revision visual en navegador porque esta sesion no tiene uno conectado.


### Correccion de respuesta PostgreSQL (15 nov 2026)

En la primera ejecucion real del bucle, PostgreSQL confirmo FY26 (carga 9),
pero **Carga Completada (siguiente fuente)** fallo al resolver `.item` a traves
de una respuesta SQL con multiples sentencias (`pairedItem`). La prueba
inicial usaba un doble Code para PostgreSQL y no reproducia ese enlace.

El SQL devuelve ahora `anio_forecast`, `archivo_id` y `archivo_nombre` junto
con `carga_id`. El nodo de confirmacion usa exclusivamente esa respuesta,
exige una sola captura identificada y ya no recorre enlaces entre nodos.
Se añadio una prueba con los nodos PostgreSQL reales dentro del motor n8n,
ambos conectados solo entre contenedores efimeros: primera ejecucion carga
los dos años, repetir conserva exactamente dos capturas, una por año.
Las 6 pruebas del bucle, 7 SQL y 9 de compatibilidad pasan (22 en total).

Se respaldo el workflow local fuera de Git y se aplicaron solo los parametros
de esos dos nodos al workflow existente, conservando credenciales y conexiones.
No se ejecuto el ETL real durante la correccion. Recargar el editor de n8n
antes de volver a ejecutar; no guardar una pestaña antigua sobre la correccion.


### Organizacion del canvas

Las salidas de carga completada, sin cambios y solo validacion confluyen en
**Siguiente Excel**, un No Operation que conserva el resultado sin calcular
ni escribir datos. Desde alli sale una unica conexion de retorno al bucle,
ubicada debajo de la cadena principal. El resumen final permanece en la
salida done. Se mantienen los mismos años, hashes, consultas y credenciales.


## Timeline consolidado (22 nov 2026)

Esta etapa reemplaza en el dashboard la seleccion de año/fuente por Desde/Hasta.
La API entrega `/api/timeline` en una sola transaccion de lectura consistente:
proyectos unificados, meses YYYY-MM, importes de referencia y snapshots.
Las rutas anuales anteriores siguen disponibles para diagnostico y compatibilidad.
El agente continua limitado a FY26; no esta conectado al timeline combinado.

Migracion `infra/db/migraciones/2026-11-22_timeline.sql`, incorporada al esquema
inicial y a su copia OpenShift. Crea `forecast_revenue_mensual` con clave unica
(proyecto, periodo), trigger de actualizacion transaccional y vistas
`v_carga_timeline`, `v_revenue_timeline`, `v_proyecto_timeline`. Selecciona una
fuente por año: prefiere las cargas con ID identificado sobre el historico
sin ID y, entre equivalentes, la carga mas reciente. No requiere ETL de años
inmutables al agregar otro año. Los atributos siguen REGLAS_DE_DATOS.md.

Para agregar FY28 u otro año, añadir su entrada en `archivos` dentro del nodo
Configurar Fuente Forecast: ID y nombre. Los años se recorren automaticamente.
Los mapeos financieros se generan desde el año (incluyen encabezados con lista
completa y rango comprimido de años). Se puede sobreescribir `campos` en una
entrada si cambia la estructura; un encabezado faltante aborta la validacion.
No hay un archivo FY28 real configurado: las pruebas usan uno sintetico.

Los snapshots consolidados reconstruyen el vector de cargas disponible en
cada fecha. No generan eventos ficticios para meses que aun no existian. La
trazabilidad anual original se conserva en las tablas originales y las rutas
anteriores. El historial completo aun se devuelve en una respuesta: para miles
de capturas sera necesario paginar por fecha de captura (eje distinto al mes).

Respaldo local anterior a la migracion:
`/tmp/forecast-antes-timeline-2026-11-22.dump` (fuera de Git, permisos 0600).
Se aplico la migracion dos veces para comprobar idempotencia. Se conservaron
39.276 filas mensuales y 3.273 anuales. Sus huellas MD5 completas coincidieron
antes y despues. La vista actual contiene 8.232 meses-proyecto, 343 proyectos,
enero 2026 a diciembre 2027. Evidencia local en
`/tmp/forecast-huellas-timeline-2026-11-22.json`.

Verificacion adicional: pruebas de integracion con dos y tres años, prioridad
de atributos, identidades sin PA, rangos entre años y ausencia de doble conteo;
pruebas UI de rango Q4 2026-Q4 2027 y meses sin cobertura; pruebas del SQL ETL
y del bucle n8n con PostgreSQL temporal. No se ejecuto el ETL real para esta
migracion, no se agrego programacion horaria ni se hicieron commits/pushes.


Cierre local de esta etapa: tabla consolidada y API en funcionamiento, n8n
actualizado conservando sus credenciales/conexiones y API/dashboard reconstruidos.
Se conciliaron 16.464 valores mensuales de la respuesta combinada contra las
rutas anuales existentes, sin diferencias. El navegador de pruebas renderizo
Listado, Detalle (lineas y barras con 2026/2027), Trazabilidad con rango
2026-10 a 2027-12 y PMs. Se corrigio que la primera incorporacion de FY27
apareciese como un movimiento: los deltas y curvas historicas comparables no
tratan meses sin cobertura como cero. Las capturas anteriores se conservan.
La fecha de inicio real sigue pendiente de incorporacion desde la fuente;
se muestra el calendario disponible y no se inventa una duracion contractual.
