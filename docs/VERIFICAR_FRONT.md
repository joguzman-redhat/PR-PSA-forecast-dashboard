# Verificar el front sin la base real

El modo demo (`FORECAST_DEMO=true`) sirve `/api/timeline` con datos ficticios y
deterministas (30 proyectos, 24 periodos, 3 Snapshots con eventos; generador en
`infra/api/src/preview-timeline.js`). Con él el front se ejecuta sin Postgres ni
contenedores. Ningún dato de la demo es real.

## Cuándo usarlo

Antes de commitear cambios al front que no deben alterar la pantalla
(refactors, renombres, limpieza).

```bash
scripts/comparar-front.sh [REF_BASE]   # por defecto HEAD: árbol de trabajo vs último commit
```

Requiere Chrome (`google-chrome` o `chromium`); `compare` de ImageMagick es opcional.
Sale con 0 si todo es idéntico y con 1 si hay diferencias o errores de consola.

## Qué compara

Levanta dos servidores demo (puertos desde 3200): uno sirve el front de
`REF_BASE` (en un `git worktree` temporal) y otro el árbol de trabajo; ambos
con el código de servidor del árbol actual. Con Chrome sin interfaz, para
`/`, `/#trazabilidad`, `/#pms` y `/#detalle/DEMO-001` compara:

- el DOM (las etiquetas `<link>`/`<script>` de archivos del front se igualan para tolerar renombres);
- la captura a 1400x3000 (`cmp` y `compare -metric AE`);
- los errores de consola.

## Qué no cubre

Solo el estado inicial de esas 4 vistas: no hace clic, no cambia filtros ni
exporta el PDF.

## Cifras con datos reales

Antes de dar por buena una tarea que toca dinero, comprueba que las vistas
cuadran con las reglas sobre los datos de la API real:

```bash
node scripts/cifras-reales.cjs [URL_DEL_TIMELINE]   # por defecto http://localhost:3000/api/timeline
```

Es de solo lectura (un GET). Imprime Booking, Backlog, Ejecutado y Proyectado
sumando las reglas por proyecto, y comprueba que las columnas de la tabla de PMs
sean esa misma suma. Sale con 0 si cuadra y con 1 si no. Con la demo
(`FORECAST_DEMO=true`) funciona igual; ver la sección siguiente.

## Abrir el front en demo a mano

```bash
FORECAST_DEMO=true PORT=3100 PUBLIC_DIR=$PWD node infra/api/src/server.js
```
