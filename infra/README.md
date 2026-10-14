# Stack de Cloud Forecast

Un `docker-compose.yml`, un comando. Levanta 4 contenedores (5 si pides
exposición pública):

| Contenedor | Qué hace |
|---|---|
| `forecast-postgres` | El dato. Única fuente de verdad del revenue. |
| `forecast-api` | Sirve el dashboard y los endpoints (mismo origen). |
| `forecast-n8n` | Mismo volumen `n8n-data` que ya usabas con el n8n suelto — mismos workflows y credenciales. Ya hace el ETL completo (Drive → Postgres), ver `n8n/n8n_nola_completo.json`. |
| `forecast-nginx` | Puerta de entrada delante de n8n (local/LAN). |
| `forecast-ngrok` | *Opcional* (perfil `public`): túnel público a n8n, para webhooks de Drive/OAuth. |

## Arrancar

```bash
./forecast.sh up        # postgres + api + n8n + nginx
./forecast.sh public    # lo mismo + ngrok
```

- Dashboard: <http://localhost:3000/>
- n8n: <http://localhost:8080/> (vía nginx) o <http://localhost:5678/> (directo)
- n8n público (solo con `public`): la URL que fijes en `NGROK_DOMAIN`, o la
  que ngrok asigne al azar — se ve en <http://localhost:4040/>.

`public` necesita `NGROK_AUTHTOKEN` en `.env` (copia `.env.example`;
conseguilo en <https://dashboard.ngrok.com/get-started/your-authtoken>).
`NGROK_DOMAIN` es opcional (un dominio fijo gratis por cuenta en
<https://dashboard.ngrok.com/domains>) — sin él, la URL pública cambia cada
vez que se reinicia el contenedor.

**Si ya tenías n8n corriendo suelto (`podman run`, fuera de este compose):**
mismo puerto (5678), así que corre uno u otro (`podman stop n8n` antes de
`up`/`public`). Comparten el volumen `n8n-data`, no se pierde nada al cambiar.

**Máquina nueva (sin el volumen `n8n-data`):** se crea vacío solo; hay que
crear el usuario admin en n8n, cargar los flujos a mano, y crear ahí la
credencial Postgres (host `postgres`, puerto `5432`, mismas credenciales de
`.env` — n8n y Postgres ya están en la misma red del compose).

## Comandos

| Comando | Qué hace |
|---|---|
| `up` | Levanta postgres + api + n8n + nginx |
| `public` | Lo mismo + ngrok (perfil `public`) |
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
