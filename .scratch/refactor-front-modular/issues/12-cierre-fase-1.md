# 12: Cierre de la Fase 1: verificación visual y documentación

**What to build:** Comprobar que el dashboard es idéntico al anterior, correr la auditoría de cifras con datos reales y actualizar la documentación con la nueva estructura.

**Blocked by:** 10, 11

**Status:** done

- [x] Comparación visual de todas las vistas contra la versión previa sin diferencias
- [x] audit-rendered-data corre sin discrepancias con datos reales
- [x] README.md y CLAUDE.md describen la estructura modular

## Comments

Verificación visual hecha antes por quien coordina: capturas de 4 vistas idénticas a la versión original del puerto 3000 y `comparar.sh` con 0 diferencias de DOM salvo las etiquetas `<link>`/`<script>`; no se repitió.

Auditoría de cifras: corrió con datos reales. `timeline.json` salió de `GET /api/timeline` (solo lectura) y `pantallas.json` se construyó leyendo los KPI renderizados por Chrome contra un servidor propio en :3100 (rangos 2026-10..2027-12 y 2027-01..2027-12, y la vista PMs); ambos en /tmp/forecast-audit, fuera del repo. Resultado literal: `{"checks":209974,"issues":[],"failures":0}`. Se tocó el script en dos puntos que los tickets previos habían dejado rotos: `acumuladoHoy` -> `ejecutadoProyecto` en la lista de funciones y `structuredClone(data)` en el fetch simulado (la traducción de nombres de `js/api.js` mutaba el mismo objeto que usa la auditoría como esperado). Alcance: consistencia de la UI con los datos guardados, no frescura del Excel.

Documentación: README.md (sección Front, pruebas, nota de `./forecast.sh rebuild`), CLAUDE.md, infra/README.md, y referencias a `app.js`/`styles.css` corregidas en HANDOFF_CODEX.md, openshift/README.md y docs/ (README_CLOUDFORECAST, ARQUITECTURA_SIMPLE, VIABILIDAD, ESPECIFICACION_BACKEND, TROUBLESHOOTING). AGENTS.md no menciona archivos del front. Quedan sin tocar RESUMEN_EJECUTIVO.txt (histórico) y el `app.js` de `infra/api/src` en HANDOFF. Pendiente de operación (no ejecutado): `./forecast.sh rebuild`.
