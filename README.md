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

Para probar el contenedor en SPAship con datos ficticios y sin Postgres remoto,
ver [la guía de prueba](spaship/README.md).

## Estructura

| Carpeta/archivo | Qué es |
|---|---|
| `index.html` · `js/` · `css/` · `vendor/` | El dashboard (vanilla JS modular, sin build); ver [Front](#front) |
| `n8n/n8n_nola_completo.json` | Export del workflow de n8n (definitivo, no se edita a mano aquí) |
| `infra/` | Postgres + API + n8n + nginx — ver `infra/README.md` |
| `docs/` | Hallazgos de negocio, reglas de validación y documentos de planeación |

## Front

Sin build ni bundler: el navegador carga módulos ES nativos.

- **Punto de entrada:** `js/main.js` (registra las vistas y arranca en `DOMContentLoaded`); `index.html` lo carga con `<script type="module">`.
- **Módulos en `js/`**, uno por responsabilidad. Mapa por prefijo:
  - datos y estado: `estado`, `api` (traduce los nombres de la API), `carga-datos`, `calendario`, `formato`
  - cálculo de dinero: `dinero-proyecto`, `vida-proyecto`, `series-revenue`, `kpis`
  - filtros: `filtros` (reglas puras), `filtros-ui`, `selector-forecast`, `selector-periodo`
  - Inicio: `listado-proyectos`, `columnas-redimensionables`, `graficas-inicio`, `grafica-*` (una por tipo), `semaforo-proyectos`, `resumen-pm`, `tabla-no-iniciados`
  - Detalle de proyecto: `detalle*`
  - Trazabilidad y Snapshots: `trazabilidad-*`, `snapshots-*`
  - PMs: `pms-*`
  - navegación, arranque e informe PDF: `navegacion`, `actualizacion-ui`, `inicializacion`, `reporte-*`
- **Estilos en `css/`:** 22 archivos (`01-variables-base.css` a `22-ajustes-finales.css`) que `index.html` enlaza en orden tras PatternFly. **El orden importa** (cascada): el prefijo numérico lo fija; no uses `@import`.
- **PatternFly** está empaquetado en `vendor/`.
- **Forma de los módulos** (la comprueba `infra/api/test/modulos-front.js` y falla si no se cumple): ES nativo, imports con nombre y ruta relativa, sin alias (`as`), sin ciclos, exports en línea (sin `export default` ni `export { }`) y modo estricto. Una variable de módulo que otros deban reasignar se expone con funciones.

### Pruebas

```bash
cd infra/api
npm test              # toda la suite
npm run lint:front    # no-undef por módulo de js/
```

Las pruebas unen los módulos en un solo ámbito (`infra/api/test/modulos-front.js`), así que no detectan un `import` olvidado (en el navegador sería un `ReferenceError`). Por eso existe `lint:front`: corre ESLint sobre cada módulo por separado.

### Operación tras el refactor modular

La imagen de la API empaqueta `js/` y `css/`. Para que el contenedor sirva los módulos y las hojas nuevas hay que reconstruirla: `cd infra && ./forecast.sh rebuild`.

## Qué falta

- Autenticación y control de acceso.
- Arreglar las 8 columnas rotas **en el Excel origen** (hoy se corrigen aguas abajo en el ETL, pero el problema sigue en la fuente — ver `docs/HALLAZGOS_Y_VALIDACION.md`).

Para los hallazgos sobre la calidad del Excel, las reglas de negocio
confirmadas y cómo se validaron los números, ver
[`docs/HALLAZGOS_Y_VALIDACION.md`](docs/HALLAZGOS_Y_VALIDACION.md).

Cómo se calcula cada cifra de dinero (Booking, Revenue acumulado, Backlog), de
qué hoja sale y qué significan Handover y el semáforo:
[`docs/REGLAS_DE_DATOS.md`](docs/REGLAS_DE_DATOS.md).
