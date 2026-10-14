# Stack de Cloud Forecast

Un `docker-compose.yml`, un comando. Levanta 4 contenedores:

| Contenedor | Qué hace |
|---|---|
| `forecast-postgres` | El dato. Única fuente de verdad del revenue. |
| `forecast-api` | Sirve el dashboard y los endpoints (mismo origen). |
| `forecast-n8n` | El mismo n8n que ya usabas fuera del compose (`setup.sh`, legacy) — mismo volumen `n8n-data`, mismos workflows y credenciales. Ya hace el ETL completo (Drive → Postgres), ver `n8n/n8n_nola_completo.json`. |
| `forecast-nginx` | Puerta de entrada delante de n8n. |

## Arrancar

```bash
./forecast.sh up
```

- Dashboard: <http://localhost:3000/>
- n8n: <http://localhost:8080/> (vía nginx) o <http://localhost:5678/> (directo)

**Si ya tenías n8n corriendo manual (`setup.sh`):** mismo nombre de puerto
(5678), así que corre uno u otro, no los dos (`podman stop n8n` antes de
`up`). Comparten el volumen `n8n-data`, no se pierde nada al cambiar.

**Máquina nueva (sin el volumen `n8n-data`):** se crea vacío solo; hay que
crear el usuario admin en n8n, cargar los flujos a mano, y crear ahí la
credencial Postgres (host `postgres`, puerto `5432`, mismas credenciales de
`.env` — n8n y Postgres ya están en la misma red del compose).

**`infra/setup.sh`** (n8n + ngrok, para exponer n8n a internet — webhooks de
Drive) necesita `NGROK_AUTHTOKEN` en `infra/.env` (copia `.env.example`;
consíguelo en <https://dashboard.ngrok.com/get-started/your-authtoken>). No
hace falta para `./forecast.sh up`.

## Comandos

| Comando | Qué hace |
|---|---|
| `up` | Levanta el stack completo |
| `seed` | Carga datos a Postgres e invalida caché — ver aviso abajo |
| `rebuild` | Reconstruye la imagen de la API y recrea el contenedor |
| `logs` / `psql` | Logs de la API / consola SQL |
| `down` | Apaga, conserva los volúmenes |
| `destroy` | Apaga y **borra el histórico de Postgres** (el de n8n no se toca) |

> `seed` depende de `PoC/data/*.json`, que ya no está en este repo (era del
> ETL en Python, retirado). En esta máquina no hace falta — el volumen
> `forecast_pgdata` ya tiene el histórico real. En una máquina nueva va a
> fallar hasta que se cargue dato por otra vía (hoy, el flujo de n8n).

## Credenciales de la BD

En `.env` (no se sube a git), de **desarrollo**: usuario/contraseña/base son
todos `forecast`, Postgres solo en `127.0.0.1:5432`. Cámbialas antes de sacar
esto de la máquina local.

## Contrato de la API

<http://localhost:3000/api/docs/> (Swagger, sin CDN). Spec crudo en
`api/src/openapi.yaml`. Esquema de Postgres (tablas y vistas) en
`db/init/01_schema.sql`.
