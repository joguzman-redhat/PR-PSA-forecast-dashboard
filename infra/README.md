# Stack de Cloud Forecast

Cuatro contenedores, un solo `docker-compose.yml`, un solo comando:

- **Postgres** — el dato.
- **API** — sirve el dashboard y los endpoints desde el mismo origen.
- **n8n** — mismo contenedor/datos que ya usabas fuera de este compose (ver
  `setup.sh`, legacy). Ahora vive en la misma red que Postgres y la API, así
  que les habla por nombre de servicio sin pasos manuales.
- **nginx** — puerta de entrada delante de n8n.

```
Drive (.xlsx) ──► n8n ──► etl.py ──► Postgres ──► API ──► dashboard
                                      :5432       :3000    :3000/
```

> El tramo `n8n ──► etl.py ──► Postgres` todavía no existe (ver "Qué falta"
> más abajo); hoy la carga a Postgres es manual.

## Arrancar

```bash
./forecast.sh up      # levanta postgres, api, n8n y nginx
./forecast.sh seed    # carga datos a Postgres (ver aviso abajo)
```

Dashboard en <http://localhost:3000/> · n8n en <http://localhost:8080/> (vía
nginx) o <http://localhost:5678/> (directo).

> **Si ya tenías n8n corriendo manual (`setup.sh`/`podman run`):** usa el
> mismo nombre de contenedor (`n8n`) y el mismo puerto (`5678`), así que
> chocan con este compose. Para el contenedor viejo antes de levantar este
> (`podman stop n8n`) — comparten el volumen `n8n-data`, no se pierde ningún
> workflow ni credencial al pasar de uno a otro.
>
> **Primera vez en una máquina nueva (sin el volumen `n8n-data`):** se crea
> vacío automáticamente; hay que crear el usuario admin en
> `http://localhost:8080/` y cargar los flujos de n8n a mano (no son parte
> de este `up`).

## Comandos

| Comando | Qué hace |
|---|---|
| `./forecast.sh up` | Levanta el stack completo |
| `./forecast.sh seed` | Carga datos a Postgres e invalida la caché (ver aviso) |
| `./forecast.sh rebuild` | Reconstruye la imagen de la API **y recrea el contenedor** |
| `./forecast.sh logs` | Sigue los logs de la API |
| `./forecast.sh psql` | Consola SQL |
| `./forecast.sh down` | Apaga. Los volúmenes (Postgres y n8n) se conservan |
| `./forecast.sh destroy` | Apaga y **borra el volumen de Postgres**: se pierde el histórico (el de n8n no se toca) |

> **`seed` depende de `PoC/data/*.json`, que ya no está en este repo** (era
> del ETL en Python, retirado). En esta máquina no hace falta: el volumen
> `forecast_pgdata` ya tiene el histórico real cargado. En una máquina nueva
> (volumen vacío), `seed` va a fallar hasta que exista el ETL que escribe
> directo a Postgres (ver "Qué falta").

> `podman-compose up --build` reusa el contenedor viejo aunque la imagen cambie.
> Por eso `rebuild` hace `podman rm -f` antes de volver a subir: sin eso uno
> termina probando código que ya no existe.

## Endpoints

**Contrato completo: <http://localhost:3000/api/docs/>** (Swagger UI, servido
desde `node_modules`, funciona sin internet). El spec crudo está en
`api/src/openapi.yaml` y se sirve en `/api/openapi.yaml`.

| Endpoint | Devuelve | Reemplaza a |
|---|---|---|
| `GET /api/proyectos` | `{ meta, proyectos: [...] }` | `data/proyectos.json` |
| `GET /api/backlog` | `{ meta, backlog: [...] }` | `data/backlog_nola.json` |
| `GET /api/historia` | `{ meta, snapshots, series_por_proyecto, eventos }` | `data/historia_revenue.json` |
| `POST /api/reload` | Invalida la caché de historia | — |
| `GET /health` | `{ ok, cargas }` | — |
| `GET /api/docs/` | Swagger UI | — |

## Credenciales de la base de datos

Están en `.env`. Son de **desarrollo**: usuario, contraseña y nombre de BD son
todos `forecast`, y Postgres se publica solo en `127.0.0.1`.

| | |
|---|---|
| host | `localhost` (desde el host) · `postgres` (desde la red del compose) |
| puerto | `5432` |
| base | `forecast` |
| usuario | `forecast` |
| contraseña | `forecast` |

```bash
./forecast.sh psql                          # la via corta
psql -h localhost -U forecast -d forecast   # desde el host, pide la clave
```

Hay que cambiarlas antes de sacar esto de la máquina local.

## Cómo está organizado el dato

`revenue_mes` y `revenue_anual` son la **única** fuente de verdad de la plata.
Las columnas descriptivas del Excel que el dashboard muestra tal cual viven en
dos `jsonb` (`proyecto.datos_info`, `proyecto.datos_backlog`), de los que se
excluyen los campos de dinero para que no puedan divergir de las tablas de
hechos. Por eso los quarters y el total ejecutado se **recalculan** al leer en
vez de guardarse.

Eso es lo que permite que la API devuelva exactamente la misma forma que los
JSON de antes —incluidos los tipos originales (`num_pa` llega como número en
310 filas y como texto en 24) y las claves con guion bajo (`_fila_excel`,
`_errores`, `_recalculado`, `_tipo_fila`)— y que el dashboard no se reescriba.

Las 5 tablas y 5 vistas están en [`db/init/01_schema.sql`](db/init/01_schema.sql).
Los scripts de `db/init` **solo corren la primera vez**, cuando el volumen está
vacío: para re-aplicar el esquema hay que `./forecast.sh destroy` y volver a
`up` + `seed`.

## Conectar n8n

Con `./forecast.sh up`, n8n ya está en la misma red que Postgres y la API —
no hace falta ningún `podman network connect` manual. (Esto reemplaza el paso
que `setup.sh` tenía que repetir en cada despliegue cuando n8n corría afuera
del compose; `setup.sh` sigue existiendo para cuando necesites exponer n8n a
internet vía ngrok, y ahí sí sigue aplicando ese paso.)

Datos de la credencial **Postgres** en n8n:

| Campo | Valor |
|---|---|
| Host | `postgres` |
| Database | `forecast` |
| User | `forecast` |
| Password | `forecast` |
| Port | `5432` |
| SSL | desactivado |

> **El host NO es `host.containers.internal`.** Esa dirección es el loopback
> del host, y Postgres se publica solo en `127.0.0.1` para no dejar la BD
> expuesta a la LAN con credenciales de desarrollo. Desde un contenedor no se
> ve: la conexión da *timeout*. Verificado con un cliente `pg` real desde
> dentro de n8n — `postgres` y `forecast-postgres` autentican,
> `host.containers.internal` expira.

Después de cada carga, el flujo debe llamar a `POST http://forecast-api:3000/api/reload`
(dentro de la red) para que la historia se reconstruya.

## Qué tiene que escribir el flujo

El orden importa, porque hay llaves foráneas:

1. `INSERT INTO carga` → devuelve `carga_id`
2. `INSERT`/`UPSERT` en `proyecto` por `clave`
3. `INSERT` en `revenue_mes` (12 filas por proyecto) y `revenue_anual`
4. `INSERT` en `movimiento` (comparando contra la carga previa)

Todo en **una transacción**: si algo falla a mitad, no debe quedar una carga
incompleta que el dashboard lea como si fuera buena.

### Qué campos son obligatorios en `carga`

| Campo | ¿Obligatorio? | Si no lo mandas |
|---|---|---|
| `datos_hash` | **sí** | Falla. Deduplica **contra la última carga**, no contra todas |
| `etiqueta` | no | Se rellena sola desde `ejecutada_en`: `13 oct 2026 14:30` |
| `codigo` | no | La API usa `c<id>` como identificador del snapshot |
| `ejecutada_en` | no | `now()` |
| `meta_proyectos` | recomendado | Ver abajo |

El `etiqueta` lo pone un trigger `BEFORE INSERT`. Se dejó así para que el flujo
no tenga que formatear fechas en español dentro de n8n, que es donde esa lógica
no debería vivir. El `NOT NULL` sigue puesto: el trigger corre antes de que se
valide, así que la garantía de que siempre hay etiqueta no se perdió.

### Las dos trampas que hacen perder una tarde

**1. `proyecto.datos_info` enriquece, ya no es obligatorio.** `GET /api/proyectos`
arma cada fila como **columnas normalizadas + `datos_info` encima**. Si solo
llenas las columnas, el dashboard ya pinta lo esencial. Si ademas llenas el
jsonb, obtienes la fidelidad completa del Excel: las ~6 columnas que la tabla
no normaliza (`finalizacion`, `ejecucion_acumulada`, `dif_consumido_2025`…),
`_fila_excel`, y los tipos originales (`num_pa` es numero en 310 filas y texto
en 24). El jsonb gana donde trae dato.

> Antes la API devolvia **solo** el jsonb, y un ETL que llenara unicamente las
> columnas dejaba el dashboard vacio sin decir por que. Era un mal contrato:
> obligaba a escribir cada campo dos veces.

**2. `carga.meta_proyectos` define las columnas de la tabla.** De ahí sale
`columnas`, que decide qué pinta el listado y cuáles son las "verdes" que el
negocio marcó como importantes. Si no viene, la API las **deduce de las claves
que realmente llegaron** y marca todas como verdes, para que la pantalla no se
caiga — pero pierdes la curaduría y los nombres bonitos (`Nombre del proyecto`
en vez de `Nombre del proyecto` derivado de la clave). La respuesta lo avisa
con `meta.columnas_derivadas: true`.

### Cómo funciona la deduplicación

Se compara contra la **última** carga, no contra todo el histórico. Si el Excel
vuelve a un estado anterior eso **es** un movimiento y tiene que quedar
registrado — por eso `datos_hash` no lleva un `UNIQUE` global: lo tuvo, y
convertía "el dato volvió atrás" en un error.

Si el hash coincide con el de la última carga, un trigger aborta con un mensaje
explícito. Para que el flujo trate "no hubo cambios" como un camino normal en
vez de como una falla, está `abrir_carga()`, que devuelve `NULL` en ese caso:

```sql
SELECT abrir_carga(
  $1,                                        -- datos_hash
  'CLOUD FORECAST GENERAL - NOLA FY26.xlsx', -- archivo
  current_date,                              -- fecha de referencia
  $2, $3,                                    -- filas_info, filas_backlog
  $4::jsonb                                  -- meta_proyectos
) AS carga_id;
```

Devuelve el `carga_id` nuevo, o `NULL` si los datos son idénticos a la última
carga. Con un IF sobre ese valor el flujo termina limpio en vez de rojo.

> El hash debe calcularse sobre los datos **extraídos**, nunca sobre el
> archivo: el `.xlsx` cambia de bytes en cada refresco de Salesforce aunque el
> contenido sea idéntico, y entonces cada corrida crearía un snapshot falso.

### Lo que el flujo NO tiene que escribir

Tres cosas que el esquema tiene pero que la API deduce sola, para que el flujo
no cargue con ellas:

| Campo | Si no lo mandas |
|---|---|
| `carga.etiqueta` | Un trigger la deriva de `ejecutada_en` |
| `carga.codigo` | La API usa `c<id>` como id del snapshot |
| `proyecto.clave_historia` | Cae a `num_pa` y, si no hay, a `fila-<id>` |
| tabla `movimiento` | **Se calculan** restando la carga contra la anterior |

Lo de `movimiento` importa: es la parte mas dificil de escribir en un flujo,
porque hay que tener a mano los valores de la carga previa. Si la tabla esta
vacia para una carga, la API deriva los movimientos de `revenue_mes` con el
umbral de 1 USD y la vista "que cambio" funciona igual. Si el ETL si los
escribe, mandan los suyos — util cuando quieras clasificar un movimiento con
mas criterio del que da una resta.

> **La trazabilidad necesita dos cargas.** Con una sola, las series tienen un
> punto y no hay nada que comparar: no es un error, es que todavia no hay
> pelicula, solo una foto.

### Plantilla mínima que funciona

```sql
BEGIN;

INSERT INTO carga (tipo, archivo_nombre, datos_hash, fecha_referencia,
                   filas_info, filas_backlog, meta_proyectos)
VALUES ('etl', 'CLOUD FORECAST GENERAL - NOLA FY26.xlsx', $1, current_date,
        $2, $3, $4::jsonb)
RETURNING id;

-- por cada proyecto
INSERT INTO proyecto (clave, clave_historia, num_pa, nombre, cliente, estado,
                      valor_of, datos_info, datos_backlog,
                      primera_carga_id, ultima_carga_id)
VALUES (...)
ON CONFLICT (clave) DO UPDATE SET
  datos_info     = EXCLUDED.datos_info,
  datos_backlog  = EXCLUDED.datos_backlog,
  ultima_carga_id = EXCLUDED.ultima_carga_id,
  actualizado_en = now();

-- 12 filas por proyecto
INSERT INTO revenue_mes (carga_id, proyecto_id, mes, commit_usd, upside_usd) VALUES (...);
INSERT INTO revenue_anual (carga_id, proyecto_id, valor_of, acum_2025, backlog,
                           total_ejecutado_acumulado) VALUES (...);

COMMIT;
```

`clave` es `num_pa` si existe y, si no, el nombre normalizado (sin tildes,
minúsculas, solo alfanuméricos) — **nunca el número de fila**: en el libro FY26
299 de 349 filas están desalineadas entre las dos hojas.

## Qué falta

El ETL en Python (`etl.py`, Excel → JSON) y los JSON que producía se retiraron
de este repo: ya no se usan para levantar el dashboard, que lee de Postgres en
vivo. Lo que falta construir es su reemplazo: un `etl.py --destino=postgres`
(o equivalente) que escriba directo en una transacción, con la deduplicación
por `datos_hash` que la tabla `carga` ya tiene preparada — hoy no hay forma de
cargar datos nuevos a Postgres más que a mano. El diseño de esa pieza y del
workflow de n8n que la dispara está en el `CLAUDE.md` de la raíz del repo
("Cloud Forecast Flow — todavía no existe").

## Antes de producción

Cambiar las credenciales y moverlas a un `Secret`. Hoy están en texto plano en
`.env`, que no debe subirse a git.
