---
status: accepted
---

# Un proyecto se identifica por su Project ID, no por el PA

El mismo proyecto puede cambiar de PA entre Años fuente, y a veces la columna PA trae un Project ID. El sistema usaba el PA como identidad (Project ID solo como respaldo), así que el cambio partía un proyecto en dos: su historial, sus Snapshots y sus series quedaban bajo dos claves.

Ejemplo real (2026-11-26): el proyecto «PA 69412 - MX-Telcel-Intelligent Data…» tiene Project ID PR-061990. En Snapshots anteriores la columna PA traía `PR-061990` y su historial quedó bajo `PA:PR-061990`; hoy su PA es 69412 y su clave es `PA:69412`. De los 348 proyectos, 30 traen un Project ID en la columna PA.

Decidimos que la identidad canónica es el **Project ID**. Si falta, se usa el PA; si faltan ambos, el proyecto queda **sin identificar** y se marca. El PA sigue visible en todas las pantallas porque es el número que el negocio más consulta, pero no identifica. Un mismo Project ID con dos PA en una Carga es un solo proyecto: se toma el PA de la fila más reciente y la Ejecución deja un aviso en su log. Se elimina el respaldo por nombre normalizado (0 filas dependían de él).

La misma regla rige en todos los lugares donde vivía: el flujo de n8n (ETL y herramienta del agente de IA, que acepta PA o Project ID), la tabla `proyecto`, la función SQL de la clave del timeline, la API y el front. Una migración reconstruye las claves del historial ya guardado.

## Considered Options

- **Dejar el PA como identidad y unir a mano los casos conocidos**: descartada, cada cambio de PA volvería a partir el proyecto.
- **Identificar por nombre normalizado**: descartada, los nombres se editan y se repiten entre proyectos distintos.
- **Cambiar solo el timeline y no el ETL**: descartada, el ETL seguiría guardando `proyecto` por PA y recrearía el duplicado en la siguiente Ejecución.

## Consequences

- El historial pasa de 349 a 348 claves: PR-061990 y PA 69412 quedan unidos con su historial.
- La migración reescribe claves guardadas y no tiene vuelta atrás automática: se hace `pg_dump` antes, se aplica primero en la base local y es idempotente. OpenShift se actualiza después de verificar que las cifras cuadran.
- Booking, Ejecutado y Backlog totales no cambian; solo cambia cómo se agrupan las filas de un mismo proyecto.
- `GLOSSARY.md` invierte las definiciones de **Project ID** y **PA**.
- «PA de la fila más reciente» es la mayor posición de fila en n8n y el mayor `proyecto_id` en SQL y API. Son equivalentes porque el ETL inserta los proyectos en el orden de las filas.
- La clave de un proyecto sin identificar es `SIN_ID:<año>:<posición de fila>` en n8n y `SIN_ID:<año>:<proyecto_id>` en SQL. Coinciden por la misma razón. Hoy hay 0 casos.
- Si tras la migración dos filas de `proyecto` caen en la misma clave nueva, la más reciente la toma y la otra conserva su clave vieja: no se borra ni se une su historial.
