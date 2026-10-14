# Especificación: de Excel en Drive a Postgres

Documento de entrega para quien construya la capa de datos. Describe **qué hay que
construir, con qué contrato y qué trampas tiene el dato**. Lo que ya está hecho y
funcionando está marcado como tal: no hay que rehacerlo.

---

## 1. Qué se quiere lograr

Hoy el dashboard lee tres archivos JSON generados a mano. Se quiere que el ciclo sea
automático y que el histórico sea **real** en vez de simulado:

```
Google Drive (.xlsx)
      │  evento de cambio
      ▼
    n8n (local hoy, OpenShift interno después)
      │  descarga el binario .xlsx
      ▼
    ETL en Python  ──►  ¿los datos cambiaron?  ──no──►  fin (no se escribe nada)
      │ sí
      ▼
    Postgres  ── tabla de proyectos (estado actual)
              ── tabla de revenue por mes y por carga (el histórico)
              ── tabla de movimientos (qué pasó entre dos cargas)
      │
      ├──► API REST ──► dashboard (el actual, sin rehacer vistas)
      └──► agente LLM que escribe SQL sobre estas mismas tablas
```

**Decisiones ya tomadas**, para que no se vuelvan a discutir:

| Decisión | Por qué |
|---|---|
| **Sin embeddings ni base vectorial** | Los datos son numéricos y tabulares. Un embedding no suma. Las preguntas de plata se responden con SQL generado por el LLM (*text-to-SQL*), no con búsqueda semántica |
| **El dashboard actual se mantiene** | Ya tiene listado, detalle, trazabilidad y la vista de cambios. Solo cambia de dónde saca los datos |
| **La fuente sigue siendo `.xlsx` en Drive** | No se convierte a Google Sheets nativo (ver §7, trampa 1) |
| **Postgres local primero, OpenShift interno después** | Ver §8 |

---

## 2. Reparto del trabajo

### Ya existe y funciona (no rehacer)

- **`etl.py`** — lee el `.xlsx` y produce los datos limpios de las dos hojas que
  importan: `Info Proyectos` y `BackLog NOLA`. Incluye recálculo de 8 columnas rotas,
  mapeo de columnas por nombre y seis validaciones que abortan si el Excel cambió de
  forma. Hoy escribe JSON; **hay que cambiarle la salida a Postgres**.
- **El dashboard** (`index.html`, `app.js`, `styles.css`) — todas las vistas.

### Hay que construir

1. El flujo de n8n (§3).
2. El esquema de Postgres (§4) y la escritura desde el ETL.
3. El cálculo de movimientos entre cargas (§5).
4. Las vistas para el LLM (§6).
5. La API que consume el dashboard (§7).

---

## 3. El flujo de n8n

| # | Nodo | Detalle |
|---|---|---|
| 1 | **Google Drive Trigger** | Vigila el archivo por `fileId`, no por carpeta. Evento: `fileUpdated` |
| 2 | **Google Drive · Download** | **Descargar el binario tal cual.** No usar "convert to", no exportar a CSV ni a Sheets |
| 3 | **Execute Command / Code** | Guarda el binario en disco y ejecuta `python3 etl.py <ruta.xlsx> --hoy --destino=postgres` |
| 4 | **IF** | Si el ETL devuelve código ≠ 0, no sigue: manda alerta y termina |
| 5 | **Notificación** | Solo si hubo carga nueva o si el ETL abortó |

**El paso 3 hace toda la lógica**, incluida la decisión de si escribe o no. n8n es
solo el disparador y el orquestador; no transformar datos dentro de n8n.

### Deduplicación: importante

El Excel de producción **se refresca solo cada 4 horas** desde un reporte de
Salesforce (está documentado en la hoja `Auto Refresh Execution Log`). Drive va a
disparar eventos todo el día aunque el negocio no haya tocado nada.

Si se inserta una carga por evento, el histórico se llena de ruido y la vista de
"qué cambió" deja de servir. La regla:

> Calcular un `sha256` sobre los datos **extraídos** (no sobre el archivo: el `.xlsx`
> cambia de bytes en cada refresco aunque el contenido sea idéntico). Si ese hash es
> igual al de la **última** carga, no se inserta nada y el proceso termina en éxito.

Comparar contra la última carga y no contra todas: si un valor vuelve a un estado
anterior, eso **es** un movimiento y debe quedar registrado.

---

## 4. Esquema de Postgres

> Todo el SQL de este documento —DDL, cálculo de movimientos y vistas— se ejecutó
> contra **PostgreSQL 16** con datos de prueba y los resultados se verificaron a
> mano. Se puede copiar y pegar.

```sql
-- ---------------------------------------------------------------------------
-- Cada corrida del ETL que encontró datos distintos a los de la corrida previa.
-- Es el eje del histórico: un snapshot = una carga.
-- ---------------------------------------------------------------------------
CREATE TABLE carga (
  id               bigserial PRIMARY KEY,
  ejecutada_en     timestamptz NOT NULL DEFAULT now(),
  archivo_nombre   text        NOT NULL,
  datos_hash       text        NOT NULL,   -- sha256 de lo extraído, para deduplicar
  fecha_referencia date        NOT NULL,   -- reemplaza al TODAY() del Excel
  filas_info       int         NOT NULL,
  filas_backlog    int         NOT NULL
);
CREATE INDEX ON carga (ejecutada_en DESC);

-- ---------------------------------------------------------------------------
-- Estado ACTUAL de cada proyecto. Se actualiza en cada carga (upsert por clave).
-- No lleva histórico: cliente, PM y zona son atributos, no series de tiempo.
-- ---------------------------------------------------------------------------
CREATE TABLE proyecto (
  id                    bigserial PRIMARY KEY,
  clave                 text NOT NULL UNIQUE,   -- ver §7 trampa 4
  num_pa                text,
  project_id            text,
  num_opp               text,
  nombre                text,
  cliente               text,
  pm_lider              text,
  pm_lider_psa          text,
  zona                  text,
  pais                  text,
  vendedor              text,
  tsm                   text,
  billing_type          text,
  billing_arrangement   text,
  estado                text,                   -- Planned/In Progress/On Hold/Completed/Canceled
  valor_of              numeric(14,2),
  valor_of_anterior     numeric(14,2),
  acumulado_a_hoy       numeric(14,2),
  consumido_2025        numeric(14,2),
  backlog_2026          numeric(14,2),
  ejecucion_deseada     numeric(14,2),
  pct_ejecucion_actual  numeric(10,6),
  pct_peso_contrato     numeric(10,6),
  fecha_fin             date,
  estado_contrato       text,                   -- RECALCULADO, ver §7 trampa 3
  dias_para_vencimiento int,                    -- RECALCULADO
  meses_transcurridos   numeric(10,4),          -- RECALCULADO
  tipo_de_ejecucion     text,                   -- RECALCULADO
  q_del_clawback        text,                   -- RECALCULADO
  estatus               text,                   -- texto libre, bitácora del PM
  start_at_risk         boolean,                -- SIMULADO, ver §7 trampa 9
  campos_con_error      jsonb,                  -- valor original de las celdas #VALUE!
  campos_recalculados   text[],
  primera_carga_id      bigint REFERENCES carga(id),
  ultima_carga_id       bigint REFERENCES carga(id),
  actualizado_en        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON proyecto (cliente);
CREATE INDEX ON proyecto (estado);
CREATE INDEX ON proyecto (pais, zona);

-- ---------------------------------------------------------------------------
-- Tabla de hechos. UNA FILA POR proyecto × mes × carga. Esto ES el histórico
-- de revenue: comparando dos carga_id se obtiene qué cambió entre dos fechas.
-- 'commit' = la columna del mes en el Excel; 'upside' = la columna pegada a su
-- derecha. En el Excel el commit se llama "fijo".
-- ---------------------------------------------------------------------------
CREATE TABLE revenue_mes (
  carga_id    bigint   NOT NULL REFERENCES carga(id) ON DELETE CASCADE,
  proyecto_id bigint   NOT NULL REFERENCES proyecto(id),
  mes         smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  commit_usd  numeric(14,2) NOT NULL DEFAULT 0,
  upside_usd  numeric(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (carga_id, proyecto_id, mes)
);
CREATE INDEX ON revenue_mes (proyecto_id, mes);

-- Valores anuales de BackLog NOLA que no se abren por mes.
CREATE TABLE revenue_anual (
  carga_id                  bigint NOT NULL REFERENCES carga(id) ON DELETE CASCADE,
  proyecto_id               bigint NOT NULL REFERENCES proyecto(id),
  acum_2025                 numeric(14,2),
  backlog                   numeric(14,2),
  total_ejecutado_acumulado numeric(14,2),
  PRIMARY KEY (carga_id, proyecto_id)
);

-- ---------------------------------------------------------------------------
-- Movimientos: se CALCULAN comparando la carga nueva con la anterior (§5).
-- No vienen del Excel. Es lo que alimenta la vista "¿qué cambió?".
-- ---------------------------------------------------------------------------
CREATE TABLE movimiento (
  id              bigserial PRIMARY KEY,
  carga_id        bigint   NOT NULL REFERENCES carga(id) ON DELETE CASCADE,
  carga_previa_id bigint   REFERENCES carga(id),
  proyecto_id     bigint   NOT NULL REFERENCES proyecto(id),
  mes             smallint CHECK (mes BETWEEN 1 AND 12),
  tipo            text     NOT NULL CHECK (tipo IN
                    ('upside_a_commit','commit_a_upside','alta_proyecto','baja_proyecto')),
  monto           numeric(14,2) NOT NULL,
  commit_anterior numeric(14,2),
  commit_nuevo    numeric(14,2),
  upside_anterior numeric(14,2),
  upside_nuevo    numeric(14,2)
);
CREATE INDEX ON movimiento (carga_id);
CREATE INDEX ON movimiento (proyecto_id);
```

### Orden de escritura dentro de una carga

Todo en **una sola transacción**. Si algo falla, no queda una carga a medias:

1. `INSERT INTO carga` → obtener `carga_id`
2. `UPSERT` de cada proyecto por `clave` (insertar los nuevos, actualizar los existentes)
3. `INSERT` de `revenue_mes` (349 × 12 filas) y `revenue_anual`
4. Calcular e insertar `movimiento` (§5)
5. `COMMIT`

---

## 5. Cálculo de los movimientos

Después de insertar el revenue de la carga nueva, se compara contra la anterior.
**Umbral: 1 dólar.** Por debajo de eso es redondeo, no una decisión de negocio.

> No subir este umbral. Con un umbral de 1.000 USD se perdían cambios reales y la
> tabla mostraba "sin movimiento" para proyectos que sí se habían movido.

```sql
WITH previa AS (
  SELECT id FROM carga WHERE id < :carga_nueva ORDER BY id DESC LIMIT 1
)
INSERT INTO movimiento (carga_id, carga_previa_id, proyecto_id, mes, tipo, monto,
                        commit_anterior, commit_nuevo, upside_anterior, upside_nuevo)
SELECT
  :carga_nueva,
  p.id,
  n.proyecto_id,
  n.mes,
  CASE WHEN n.commit_usd > a.commit_usd THEN 'upside_a_commit'
       ELSE 'commit_a_upside' END,
  abs(n.commit_usd - a.commit_usd),
  a.commit_usd, n.commit_usd,
  a.upside_usd, n.upside_usd
FROM revenue_mes n
JOIN previa p ON true
JOIN revenue_mes a
  ON a.carga_id = p.id AND a.proyecto_id = n.proyecto_id AND a.mes = n.mes
WHERE n.carga_id = :carga_nueva
  AND abs(n.commit_usd - a.commit_usd) >= 1.0;
```

Los proyectos que aparecen por primera vez (no existen en la carga previa) se
registran con `tipo = 'alta_proyecto'` y `mes = NULL`.

**Nota sobre la clasificación:** el movimiento se nombra por la dirección del
commit. Si el commit sube, la plata se confirmó (`upside_a_commit`); si baja, se
desconfirmó. En el 99% de los casos el upside se mueve en espejo exacto
(commit +X ⟺ upside −X), pero no hay que asumirlo: pueden cambiar los dos a la vez
si el negocio ajusta el monto total del mes.

---

## 6. Vistas para el agente LLM

El LLM genera SQL. Para que no se equivoque en las reglas de negocio, **las reglas
van en vistas**, no en el prompt. El prompt describe las vistas; el LLM consulta
las vistas.

```sql
-- La carga más reciente. Todo lo "actual" se cuelga de aquí.
-- Ordenar por id y no por ejecutada_en: dos cargas pueden compartir timestamp
-- (misma transacción, reintentos) y entonces "la última" queda indefinida.
-- El id es bigserial, así que siempre es monótono y desempata.
CREATE VIEW v_carga_actual AS
  SELECT * FROM carga ORDER BY id DESC LIMIT 1;

-- Proyectos con su revenue del mes, en el estado de hoy.
CREATE VIEW v_proyecto_actual AS
SELECT p.*, ra.acum_2025, ra.backlog, ra.total_ejecutado_acumulado
FROM proyecto p
LEFT JOIN revenue_anual ra
  ON ra.proyecto_id = p.id AND ra.carga_id = (SELECT id FROM v_carga_actual);

-- REGLA DE NEGOCIO: el quarter suma SOLO el commit. El upside NO entra.
-- Verificado en 1396 de 1396 casos contra el Excel.
CREATE VIEW v_revenue_quarter AS
SELECT
  r.proyecto_id,
  ceil(r.mes / 3.0)::int       AS quarter,
  sum(r.commit_usd)            AS commit_usd,
  sum(r.upside_usd)            AS upside_usd
FROM revenue_mes r
WHERE r.carga_id = (SELECT id FROM v_carga_actual)
GROUP BY r.proyecto_id, ceil(r.mes / 3.0);

-- REGLA DE NEGOCIO: TOTAL EJECUTADO = Q1+Q2+Q3+Q4 (commit) + Acum 2025.
-- Verificado en 348 de 348 filas.
CREATE VIEW v_total_ejecutado AS
SELECT p.id AS proyecto_id,
       coalesce(sum(r.commit_usd), 0) + coalesce(max(ra.acum_2025), 0) AS total_ejecutado
FROM proyecto p
LEFT JOIN revenue_mes r
  ON r.proyecto_id = p.id AND r.carga_id = (SELECT id FROM v_carga_actual)
LEFT JOIN revenue_anual ra
  ON ra.proyecto_id = p.id AND ra.carga_id = (SELECT id FROM v_carga_actual)
GROUP BY p.id;
```

### Qué decirle al LLM en el prompt del sistema

- Los **proyectos cancelados** (`estado = 'Canceled'`) se excluyen salvo que la
  pregunta los pida. Son 26 y todos tienen `valor_of = 0`, así que no mueven plata,
  pero sí distorsionan los conteos.
- `start_at_risk` **es un dato simulado**, no del Excel. Si alguien pregunta por
  proyectos en riesgo, hay que advertirlo en la respuesta.
- `estado_contrato`, `dias_para_vencimiento`, `tipo_de_ejecucion`,
  `meses_transcurridos` y `q_del_clawback` están **recalculados** por el ETL porque
  en el Excel están rotos. El valor original está en `campos_con_error`.
- Hay **revenue negativo**: notas de crédito. No filtrar `> 0` por defecto.
- Para "qué cambió", usar `movimiento`, no restar `revenue_mes` a mano.

---

## 7. La API que consume el dashboard

El dashboard ya funciona y **no se va a reescribir**. Hoy hace tres `fetch` a
archivos estáticos. La API debe devolver **exactamente las mismas formas**, para que
el único cambio en el front sea la URL.

| Endpoint | Reemplaza a | Forma de la respuesta |
|---|---|---|
| `GET /api/proyectos` | `data/proyectos.json` | `{ meta: {...}, proyectos: [ {...}, ... ] }` |
| `GET /api/backlog` | `data/backlog_nola.json` | `{ meta: {...}, backlog: [ {...}, ... ] }` |
| `GET /api/historia` | `data/historia_revenue.json` | `{ meta, snapshots: [], series_por_proyecto: {}, eventos: [] }` |

Las claves de cada objeto son las que ya produce `etl.py` — están en los JSON
actuales de `data/` y hay que respetarlas al pie de la letra, incluidos los nombres
en español y los campos con guion bajo (`_fila_excel`, `_errores`, `_tipo_fila`).

### Mapeo de tablas a la respuesta de `/api/historia`

- `snapshots[]` ← una entrada por fila de `carga`, con `id`, `timestamp`
  (`ejecutada_en`), `etiqueta` (texto legible de la fecha), `totales` y `por_mes` agregados.
- `series_por_proyecto` ← diccionario `clave_proyecto → [ {snapshot_id, commit, upside,
  meses: [[commit,upside] × 12]} ]`, un elemento por carga.
- `eventos[]` ← filas de `movimiento`, con `num_pa`, `nombre`, `tipo`, `campo` (nombre
  del mes en minúsculas: `"enero"`, `"febrero"`...), `delta`, `valor_anterior`,
  `valor_nuevo`.

### Cuándo paginar

Hoy `historia_revenue.json` pesa 2.8 MB con 32 snapshots. Con snapshots diarios, un
año son ~365 y el archivo se va a ~32 MB: eso ya no se descarga de un golpe. Cuando
pase de ~60 cargas, `/api/historia` debe aceptar `?desde=<carga_id>&hasta=<carga_id>`
y devolver solo ese rango. El dashboard ya razona en rangos, así que el cambio es
chico — pero hay que preverlo.

---

## 8. Trampas del dato (leer antes de escribir código)

Todas estas ya costaron un bug. Están resueltas en `etl.py`; si se reescribe la
extracción, hay que resolverlas de nuevo.

**1. Pasar el `.xlsx` binario, nunca una conversión.**
Las columnas que el negocio considera importantes se identifican por el **color de
relleno del encabezado**. Si n8n convierte a CSV, a JSON o a Google Sheets nativo,
el color se pierde y no hay forma de saber cuáles son.
Peor: **el tono cambia entre libros.** `Info Proyectos` usaba `#00A933` y en el FY26
pasó a `#00FF00`. Hay que aceptar un conjunto de tonos y **abortar si una hoja queda
sin ninguna columna verde** — pasó, y el listado quedó con dos columnas.

**2. `data_only=True` al abrir con openpyxl.**
Con `False` se obtienen las fórmulas como texto (`"='Info Proyectos'!AC2*AO2"`) en
vez de los valores, y todos los totales dan 0 sin que nada falle.

**3. Ocho columnas del Excel están rotas y hay que recalcularlas.**
`Finalizacion` arma la fecha con `CONCATENATE`, lo que produce **texto**; entonces
`MONTH()`, `YEAR()` y `N - TODAY()` fallan en cascada. Afecta a 30 de 349 filas en el
libro FY26 (en el anterior eran 303 de 304). Se recalculan desde `Fecha fin`:

```
dias = fecha_fin - fecha_referencia
  dias <= 0  → "Contrato vencido"
  dias <= 30 → "Contrato vence en menos de 30dias"
  dias <  60 → "Contrato finaliza en menos de 60dias"
  else       → "Contrato vigente"
```

**4. Las dos hojas NO van fila a fila.** ⚠️ *La más peligrosa.*
En el libro anterior la fila *N* de ambas hojas era el mismo proyecto. En el FY26,
**299 de 349 filas están desalineadas**. Cruzarlas por posición le asigna a cada
proyecto el revenue de otro y **no falla**: los totales globales siguen cuadrando.

La `clave` de cruce es: **`num_pa` si existe; si no, el nombre del proyecto
normalizado** (sin tildes, minúsculas, solo alfanuméricos). Nunca el número de fila.
Si menos del 95% de los proyectos cruzan, abortar.

**5. Encabezados repetidos en `BackLog NOLA`.**
`"Upside"` aparece 12 veces, y el mes en curso aparece **dos** veces (el Excel
arrastra una columna auxiliar que renombran cada mes: era `Julio`, hoy es `Octubre`).
Regla: **el mes de verdad es aquel cuya columna de la derecha dice "Upside"**. La
otra ocurrencia es columna de trabajo y se descarta.

**6. La hoja trae sus propias filas de total al final.**
En `BackLog NOLA` las filas 363 y 365 contienen los totales de la propia hoja. Si se
suma la columna entera se cuenta doble (daba exactamente 3× el valor correcto). Hay
que detectar la última fila con datos reales y parar ahí.

**7. Hay revenue negativo.** Nueve proyectos tienen notas de crédito. No asumir
valores positivos ni en el modelo ni en los gráficos.

**8. Filas vacías.** 14 filas no tienen ni PA ni nombre y su revenue es 0. Se
descartan como proyectos pero conviene registrarlas para que los conteos cuadren.

**9. Dos campos no son del Excel:**
- `start_at_risk` **no existe en ninguna de las 37 hojas** (se buscó). Está simulado
  de forma determinista con un hash del `project_id`, al 15%. **Es un dato inventado**
  y hay que pedírselo a la fuente antes de producción.
- La trazabilidad histórica actual está **simulada**. Con este pipeline deja de serlo:
  cada carga pasa a ser un snapshot real. El `historia_revenue.json` simulado se bota.

**10. `Billing Arrengement` está mal escrito en el origen.** Así, con la errata. No
"corregirlo" al buscar la columna. Es nuevo en el libro FY26; en los anteriores no
existe, así que debe tratarse como columna opcional.

**11. `num_pa` cambia de tipo.** Llega como número en una hoja y como texto en otra.
Guardar siempre como `text` y comparar siempre como `text`.

**12. Congelar la fecha de referencia.** El Excel usa `TODAY()`. El ETL recibe una
fecha de corte explícita (`--hoy` o `--fecha=AAAA-MM-DD`) y la guarda en
`carga.fecha_referencia`, para que una carga vieja se pueda reproducir igual.

### Validaciones que deben abortar la carga

Si cualquiera falla, **no se escribe nada** y la carga anterior queda intacta. Es
preferible ver datos viejos que datos falsos.

| Validación | Umbral |
|---|---|
| Quarters que reconcilian (`Q = suma de sus 3 meses, solo commit`) | ≥ 98% |
| Totales que reconcilian (`TOTAL = Q1..Q4 + Acum 2025`) | ≥ 98% |
| Proyectos leídos | ≥ 10 |
| `valor_of` numérico | ≥ 50% de las filas |
| Columnas verdes detectadas por hoja | ≥ 1 |
| Proyectos que cruzan entre las dos hojas | ≥ 95% |
| Existen las hojas `Info Proyectos` y `BackLog NOLA` | obligatorio |
| Todas las columnas esperadas están, buscadas por nombre | obligatorio |

---

## 9. Camino a OpenShift

Mientras sea local, Postgres y n8n conviven en la misma máquina y la API escucha en
`localhost`. Para mover esto al OpenShift interno de la empresa hay que tener presente:

- **Son tres Deployments**: n8n, Postgres y la API/dashboard. Postgres necesita un
  `PersistentVolumeClaim`; perder el volumen es perder todo el histórico, que es
  justamente lo que no se puede regenerar desde el Excel.
- **Exponer solo la API/dashboard** con una `Route`. Eso basta para que cualquiera en
  la VPN entre por el dominio interno. Postgres y n8n se quedan con `Service` interno,
  sin `Route`.
- **Credenciales en `Secret`**, nunca en el workflow de n8n exportado a JSON.
- **El OAuth de Google Drive** tiene que apuntar al callback definitivo. Mientras sea
  local con ngrok la URL cambia en cada arranque; en OpenShift será fija.
- **Requisito previo** (no es técnico): hace falta un proyecto en la PaaS interna y un
  App Code de ServiceNow. Eso se pide por ServiceNow, no se resuelve desde DevHub —
  DevHub es catálogo y documentación, no despliegue.

---

## 10. Fuera de alcance

- Autenticación de usuarios en el dashboard (hoy no tiene).
- Histórico de los atributos del proyecto (cliente, PM, zona). Solo se versiona el
  revenue. Si después quieren auditar cambios de PM o de zona, se agrega una tabla
  `proyecto_historial` con la misma lógica de cargas.
- Corregir las 8 columnas rotas **en el Excel de origen**. El ETL las recalcula, pero
  la fuente sigue mostrando `#VALUE!` a quien abra el archivo.
- Obtener `billing_arrangement` histórico y `start_at_risk` real desde la fuente.
