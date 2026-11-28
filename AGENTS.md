# AGENTS.md

Guía para cualquier agente en este repo. Conceptos de producto, hallazgos de
negocio y metodología están en `docs/` y en `README.md` — no los repitas acá.

## Dónde leer

- `GLOSSARY.md`: vocabulario obligatorio; léelo antes de nombrar un concepto de dominio.
- `docs/adr/`: decisiones tomadas; léelas antes de cambiar una regla de cálculo o la arquitectura.
- `CODING_STANDARDS.md`: reglas de criterio; léelo al escribir o revisar código.
- `docs/VERIFICAR_FRONT.md`: cómo verificar el front en un navegador; léelo antes de dar por buena una tarea del front.
- `docs/NUEVA_FUENTE_ANUAL.md`: cómo incorporar el Excel de un nuevo Año fuente.

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
cd infra && ./forecast.sh up       # postgres + api + n8n + nginx
cd infra && ./forecast.sh public   # lo mismo + ngrok (tunel publico para n8n)
```

Detalle de comandos, puertos y contrato de la API: `infra/README.md`.
Credenciales de desarrollo: `infra/README.md`; `infra/.env` está fuera de límites.

## Front

Módulos ES nativos, sin build. Entrada `js/main.js`; módulos por responsabilidad
en `js/`; 22 hojas en `css/` que `index.html` enlaza en orden (el orden importa,
no las reordenes ni uses `@import`); PatternFly en `vendor/`. Mapa y detalle en
`README.md` (sección Front).

Forma de los módulos (la impone `infra/api/test/modulos-front.js`): imports con
nombre y ruta relativa, sin alias, sin ciclos, exports en línea, sin
`export default`. Las pruebas unen los módulos en un solo ámbito, por eso no ven
un `import` olvidado: corre también `npm run lint:front`.

```bash
cd infra/api && npm test && npm run lint:front
```

## Antes de afirmar algo sobre el estado del flujo de n8n

Revisa `n8n/n8n_nola_completo.json` (lista de nodos) en vez de asumir desde
este archivo o desde READMEs — este documento puede quedar desactualizado más
rápido que el propio export del workflow.

## Antes de tocar un cálculo de dinero

Lee `docs/REGLAS_DE_DATOS.md`: todo el dinero sale de BackLog NOLA (Info
Proyectos no tiene el factor de conversión) y el Backlog mostrado es el continuo
(ADR 0002: el de la fuente menos el Commit posterior a su Año fuente), no
Booking − Acumulado.
Los cambios de esquema van en `01_schema.sql` y en una migración en
`infra/db/migraciones/`.

## Qué no está en este repo (a propósito)

El ETL vive solo en n8n. El repo no contiene el ETL en Python del PoC original
(`etl.py`, `generar_historia.py`, `actualizar.sh`, `serve.sh`, `data/*.json`) ni
los exports viejos de n8n (`flows/` en el workspace original): se retiraron
porque ya no se usan.

## Agent skills

### Issue tracker

Los issues y specs viven como markdown local en `.scratch/<feature>/`. Ver `docs/agents/issue-tracker.md`.

### Triage labels

Vocabulario por defecto (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). Ver `docs/agents/triage-labels.md`.

### Domain docs

Single-context: un `GLOSSARY.md` y `docs/adr/` en la raíz. Ver `docs/agents/domain.md`.
