# CLAUDE.md

Guía para Claude Code en este repo. Conceptos de producto, hallazgos de
negocio y metodología están en `docs/` y en `README.md` — no los repitas acá.

## Qué es

Drive (.xlsx) → **n8n** (`n8n/n8n_nola_completo.json`, ya hace el ETL completo
y escribe a Postgres — no es un TODO) → **Postgres** (fuente de verdad del
revenue) → **API Node.js** (sirve el dashboard y los endpoints) → dashboard.
Nginx queda delante de n8n. Todo se levanta con `infra/docker-compose.yml`.

El flujo de n8n también incluye un agente de IA (LangChain + OpenAI) con
herramientas que consultan Postgres, para preguntas conversacionales sobre el
dato — no es solo el ETL.

## Comandos

```bash
cd infra && ./forecast.sh up      # postgres + api + n8n + nginx
```

Detalle de comandos, puertos, credenciales y contrato de la API:
`infra/README.md`.

## Antes de afirmar algo sobre el estado del flujo de n8n

Revisa `n8n/n8n_nola_completo.json` (lista de nodos) en vez de asumir desde
este archivo o desde READMEs — este documento puede quedar desactualizado más
rápido que el propio export del workflow.

## Qué no está en este repo (a propósito)

El ETL en Python del PoC original (`etl.py`, `generar_historia.py`,
`actualizar.sh`, `serve.sh`, `data/*.json`) y los exports viejos de n8n
(`flows/` en el workspace original) se retiraron: ya no se usan. No los
reconstruyas.
