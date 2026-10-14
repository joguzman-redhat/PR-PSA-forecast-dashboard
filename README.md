# Cloud Forecast — Dashboard de proyectos y trazabilidad de revenue

Dashboard de proyectos y revenue para NOLA, con trazabilidad de cómo cambia
el revenue en el tiempo (no solo la foto de hoy).

## Cómo levantarlo

```bash
cd infra
./forecast.sh up
```

Dashboard en <http://localhost:3000/>. Resto de comandos, puertos y cómo
conectar n8n: `infra/README.md`.

## Estructura

| Carpeta/archivo | Qué es |
|---|---|
| `index.html` · `app.js` · `styles.css` · `vendor/` | El dashboard (vanilla JS) |
| `n8n/n8n_nola_completo.json` | Export del workflow de n8n (definitivo, no se edita a mano aquí) |
| `infra/` | Postgres + API + n8n + nginx — ver `infra/README.md` |
| `docs/` | Hallazgos de negocio, reglas de validación y documentos de planeación |

## Qué falta

- Autenticación y control de acceso.
- Arreglar las 8 columnas rotas **en el Excel origen** (hoy se corrigen aguas abajo en el ETL, pero el problema sigue en la fuente — ver `docs/HALLAZGOS_Y_VALIDACION.md`).

Para los hallazgos sobre la calidad del Excel, las reglas de negocio
confirmadas y cómo se validaron los números, ver
[`docs/HALLAZGOS_Y_VALIDACION.md`](docs/HALLAZGOS_Y_VALIDACION.md).
