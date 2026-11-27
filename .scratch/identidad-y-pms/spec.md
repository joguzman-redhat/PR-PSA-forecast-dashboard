Status: ready-for-agent

# Identidad por Project ID y tabla de PMs con Ejecutado y Proyectado

## Problem Statement

El mismo proyecto puede cambiar de PA entre Años fuente, y a veces la columna PA trae un Project ID. El sistema identifica los proyectos por PA, así que un proyecto cuyo PA cambia se parte en dos: su historial y sus Snapshots quedan bajo dos claves. Caso real (2026-11-26): el proyecto con Project ID PR-061990 aparece en el historial como `PA:PR-061990` y hoy como `PA:69412`; el timeline trae 349 claves en las series para 348 proyectos. Además 30 proyectos traen un Project ID en la columna PA y quedarían partidos si algún día reciben un PA real.

Por otro lado, la pestaña de PMs muestra un «Total Ejecutado» que suma la columna `TOTAL EJECUTADO ACUMULADO` del Excel: acumulado anterior más el Commit de los 12 meses del Año fuente. Incluye el Commit de meses que aún no ocurren. Con los datos reales de hoy, 88 de los 198 proyectos de la tabla difieren del Ejecutado del glosario, todos por esa causa, y el total de PMs ($19,12 M) no cuadra con los KPIs ($18,10 M). En enero de 2027 la diferencia cambia de signo. El negocio necesita ver las dos cifras, Ejecutado hasta hoy y el total proyectado de 2026 y 2027, y que ambas cuadren con los KPIs.

## Solution

El **Project ID** es la identidad del proyecto en todo el sistema (ADR 0003). Si falta se usa el PA; si faltan ambos el proyecto queda «sin identificar» y se marca. El PA sigue visible en todas las pantallas, pero no identifica. El historial ya guardado se reconstruye para que los proyectos partidos queden unidos.

La tabla de PMs muestra dos columnas con los términos del glosario: **Ejecutado** (revenue hasta hoy) y **Proyectado** (Ejecutado más el Commit de los meses futuros, sin Upside; parcial si faltan meses, ADR 0002). Ambas salen de la misma regla que las tarjetas de KPIs, por lo que los totales cuadran.

Después de ambos cambios se revisan con datos reales las demás pantallas (KPIs, listado, detalle, informe) para ver si hay más desajustes de dinero; solo si aparecen se evalúa un módulo de dinero por proyecto.

## User Stories

1. Como analista de negocio, quiero que un proyecto cuyo PA cambia entre FY26 y FY27 siga siendo un solo proyecto, para que su historial no se parta en dos.
2. Como analista, quiero ver el historial completo del proyecto PR-061990 / PA 69412 bajo un único proyecto, para entender su evolución real.
3. Como analista, quiero que el PA siga visible en el listado, el detalle, los filtros y los informes, para buscar los proyectos por el número que uso a diario.
4. Como analista, quiero que la búsqueda por PA siga funcionando aunque la identidad sea el Project ID, para no cambiar mi forma de trabajar.
5. Como analista, quiero que un proyecto sin Project ID se identifique por su PA, para no perderlo de las vistas.
6. Como analista, quiero que un proyecto sin Project ID ni PA aparezca marcado como «sin identificar», para saber que hay un dato faltante en el Excel.
7. Como analista, quiero que dos filas de una Carga con el mismo Project ID y distinto PA cuenten como un solo proyecto, para no duplicar su Booking ni su Backlog.
8. Como operador de la Ejecución, quiero un aviso en el log cuando un mismo Project ID aparezca con dos PA, para revisar el Excel de origen.
9. Como operador, quiero que las Ejecuciones nuevas guarden los proyectos por Project ID, para que el duplicado no se recree.
10. Como operador, quiero que la migración reconstruya las claves del historial, para que las series y los Snapshots existentes se unan.
11. Como operador, quiero hacer `pg_dump` antes de la migración y aplicarla primero en mi base local, para poder recuperar el estado anterior.
12. Como operador, quiero que la migración sea idempotente, para poder correrla dos veces sin dañar los datos.
13. Como operador, quiero actualizar OpenShift solo después de verificar las cifras en local, para no arriesgar el ambiente de evaluación.
14. Como analista, quiero que Booking, Ejecutado y Backlog totales no cambien tras la migración, para confiar en que solo se reagruparon las filas.
15. Como analista, quiero que el historial pase de 349 a 348 claves, para confirmar que el duplicado conocido quedó resuelto.
16. Como usuario del agente de IA, quiero preguntar por un proyecto con su PA o con su Project ID y obtener la misma respuesta, para no memorizar el identificador interno.
17. Como PM, quiero ver en la tabla de PMs mi Ejecutado hasta hoy, para saber cuánto he reconocido realmente.
18. Como PM, quiero ver en la tabla de PMs mi Proyectado de 2026 y 2027, para saber hacia dónde va mi cartera.
19. Como analista, quiero que la suma de Ejecutado de los PMs coincida con el Ejecutado de los KPIs, para no explicar dos totales distintos.
20. Como analista, quiero que el Proyectado parcial se marque en la tabla de PMs cuando falten meses de Commit, para no leer una cifra incompleta como completa.
21. Como analista, quiero que la tabla de PMs no incluya el Commit de diciembre en el Ejecutado, para que el dato no cambie de signo en enero.
22. Como analista, quiero que un proyecto sin cifras no cuente como cero en los totales de PMs, para no subestimar nada (ADR 0002).
23. Como analista, quiero que los proyectos Canceled sigan fuera de los totales de PMs como hoy, para no cambiar esa regla sin pedirlo.
24. Como analista, quiero que el glosario defina Project ID y PA como en esta decisión, para que el código y las pantallas usen los mismos términos.
25. Como desarrollador, quiero que la regla de identidad viva con la misma lógica en n8n y SQL, para que no puedan divergir sin que una prueba falle.
26. Como desarrollador, quiero que el front busque el proyecto solo por su clave del timeline, para borrar los respaldos por PA y por nombre.
27. Como analista, quiero una revisión con datos reales de KPIs, listado, detalle e informe tras el cambio, para saber si hay más desajustes.
28. Como responsable del producto, quiero decidir sobre un módulo de dinero por proyecto solo con evidencia de más desajustes, para no hacer un rediseño grande sin necesidad.
29. Como analista, quiero que el detalle de un proyecto muestre su identidad (Project ID) junto al PA, para distinguirlos cuando difieran.
30. Como analista, quiero que las gráficas y los Snapshots sigan funcionando para proyectos unidos por la migración, para no perder trazabilidad.

## Implementation Decisions

- **Identidad:** Project ID → PA → «sin identificar» (con marca visible). Se elimina el respaldo por nombre normalizado, que hoy no sostiene ninguna fila.
- **Reglas de borde:** un mismo Project ID con dos PA en una Carga es un solo proyecto, se toma el PA de la fila más reciente y se registra un aviso en el log de la Ejecución.
- **Lugares que cambian de forma coordinada:** el nodo de n8n que calcula la clave de cada fila, la tabla `proyecto` (su clave única y la clave con la que el ETL actualiza), la función SQL de la clave del timeline, la clave de proyecto de la API y el front. La herramienta Postgres del agente de IA en n8n acepta PA o Project ID.
- **Front:** `backlogDe` y la carga de datos dejan de mantener mapas por PA y por nombre; solo se indexa por clave del timeline, que la API siempre entrega.
- **Migración:** reconstruye las claves del historial a partir de los datos ya guardados. Se acompaña de un cambio equivalente en el esquema inicial. Requiere `pg_dump` previo, se aplica primero en la base local y es idempotente. OpenShift se actualiza después de verificar las cifras.
- **Glosario y ADR:** Project ID y PA ya están redefinidos en `GLOSSARY.md` y la decisión está en el ADR 0003.
- **Tabla de PMs:** reemplaza «Total Ejecutado» por dos columnas, Ejecutado y Proyectado, que usan las mismas reglas de dinero de las tarjetas de KPIs (Ejecutado hasta el mes actual, Proyectado con el Commit de meses futuros, sin Upside, parcial si faltan meses). La columna `total_ejecutado_acumulado` del Excel deja de usarse en esa tabla y sigue como dato de entrada. Los PMs excluyen los mismos proyectos que hoy (Canceled).
- **Módulo de dinero por proyecto:** no se construye en este spec. Se decide al final con una comparación con datos reales de KPIs, listado, detalle e informe.
- **Orden de entrega:** primero la identidad, luego la tabla de PMs, luego la revisión de las demás pantallas.

## Testing Decisions

- Una buena prueba verifica comportamiento externo (claves, totales, columnas que ve el usuario), no detalles de SQL ni funciones internas.
- **Seam 1, contrato de `/api/timeline` sobre Postgres temporal:** el mismo Project ID con distinto PA entre FY26 y FY27 da un solo proyecto; una base con claves partidas, tras la migración, queda unida con su historial; un proyecto sin Project ID cae al PA, y sin ambos queda «sin identificar»; un mismo Project ID con dos PA en una Carga es un solo proyecto. Referencia: la prueba de integración de años del forecast, que ya inserta en `proyecto` y consulta `/api/timeline`.
- **Seam 2, cargador del front (`pagina()` y `ui`):** a partir de una respuesta del timeline, la salida del cálculo de PMs trae Ejecutado y Proyectado por PM, y la suma coincide con los KPIs. Referencia: las pruebas existentes de `forecast-ui` y `forecast-proyectado`.
- **Seam 3, nuevo y pequeño:** el código del nodo de n8n que calcula la clave se evalúa en `vm` y debe dar la misma clave que la función SQL con las mismas entradas. No se prueba el flujo completo de n8n.
- **Criterios con datos reales, antes y después:** las series pasan de 349 a 348 claves; PR-061990 y PA 69412 quedan unidos con su historial; Booking, Ejecutado y Backlog totales no cambian; los 25 PMs suman $18,10 M de Ejecutado, igual que los KPIs.
- Deben pasar `npm test`, `npm run lint:front` y `scripts/comparar-front.sh` (esta última solo debe diferir donde el cambio es intencional: la tabla de PMs).

## Out of Scope

- El módulo de dinero por proyecto (se decide tras la revisión con datos reales).
- La API de estado global del front y el calendario (candidato 4) y la separación de cálculo y DOM en las pruebas (candidato 5).
- Aplicar la migración en OpenShift (se hace después de verificar en local).
- Cambiar la regla de Backlog continuo (ADR 0002) o del Proyectado parcial.
- Cambiar los proyectos excluidos de la tabla de PMs.

## Further Notes

- Hallazgos verificados con los datos reales del 2026-11-26: 348 proyectos, todos con Project ID y sin repetidos; 1 sin PA (PR-038290, Canceled); 30 con un Project ID en la columna PA; 88 de 198 proyectos de la tabla de PMs con diferencia entre su columna y el Ejecutado; diferencia total de $1,02 M.
- La diferencia de la tabla de PMs cambia de signo en enero de 2027, porque la columna del Excel se detiene en diciembre de 2026.
- Ningún proyecto activo termina después de 2027, así que hoy Proyectado equivale al total de 2026 y 2027.
- La decisión de identidad está en `docs/adr/0003-identidad-por-project-id.md`; las reglas de dinero, en los ADR 0001 y 0002.
