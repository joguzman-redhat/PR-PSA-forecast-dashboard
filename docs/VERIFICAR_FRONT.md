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

## Abrir el front en demo a mano

```bash
FORECAST_DEMO=true PORT=3100 PUBLIC_DIR=$PWD node infra/api/src/server.js
```
