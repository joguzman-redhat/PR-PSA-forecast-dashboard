# 10: Navegación e inicialización, y retiro de app.js

**What to build:** La navegación y el arranque pasan a módulos. app.js queda vacío y se borra (paso contraer del patrón expandir-contraer).

**Blocked by:** 05, 06, 08, 09

**Status:** done

- [x] El dashboard arranca solo desde los módulos
- [x] app.js ya no existe en el repo, en la imagen ni en las pruebas de despliegue
- [x] La suite de pruebas del front pasa completa

## Comments

`app.js` se borró. Su contenido pasó a `js/`: `carga-datos.js` (`cargarDatos`), `navegacion.js` (`cambiarPestana`), `actualizacion-ui.js` (`actualizarUI`), el informe PDF en `reporte-resumen.js` (página con marca y resumen de portada), `reporte-grafica.js` (reparto de una gráfica en páginas) y `reporte-pdf.js` (preparar, cerrar, inicializar), `inicializacion.js` (`inicializar`) y `main.js`, que solo registra las vistas (con lambdas que se resuelven al llamar) y arranca en `DOMContentLoaded`. Funciones movidas tal cual. `index.html` carga `js/main.js?v=44`; Dockerfile, `.dockerignore`, `deployment.test.js`, `modulos-front.js` y `forecast-modulos.test.js` ya no nombran `app.js` (prueba nueva de la estructura y de que `app.js` no existe). Los docs que aún lo nombran quedan para el ticket 12.

Bug heredado del ticket 07 corregido porque rompía el informe en el navegador: `prepararReporteGraficas` usaba `graficasRegistradas` sin importarlo (en las pruebas, con el ámbito unido, no se notaba). Ahora `grafica-registro.js` lo exporta y `reporte-pdf.js` lo importa.

`comparar.sh` da código 1 solo por la etiqueta `<script src="js/main.js?v=44">` que su filtro (`app\.js`) no excluye: es la única línea distinta en las 4 vistas, 0 errores de consola. `npm test` 68/68.
