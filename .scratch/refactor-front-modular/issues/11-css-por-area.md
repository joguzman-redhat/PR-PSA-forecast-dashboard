# 11: Hoja de estilos dividida por área

**What to build:** styles.css se parte en archivos por área (base, filtros, listado, detalle, gráficas). PatternFly sigue como base. Puede avanzar en paralelo con los tickets 03 a 10.

**Blocked by:** 02

**Status:** done

- [x] La apariencia es idéntica a la anterior
- [x] El archivo único styles.css ya no existe
- [x] La imagen de la API y las pruebas de despliegue incluyen los archivos nuevos

## Comments

`styles.css` se partió en 22 archivos contiguos en `css/` (`01-variables-base` a `22-ajustes-finales`, el prefijo numérico fija el orden de la cascada). Cada archivo es un tramo literal de la hoja original, así que `cat css/*.css` es byte a byte el `styles.css` anterior; los `@media`, `@media print`, `@keyframes` y `:root` quedaron enteros en el archivo de su sección. `index.html` carga PatternFly y luego los 22 `<link>` en ese orden (sin `@import`). Dockerfile (`COPY css ./public/css`), `.dockerignore` (`!css/`, `!css/**`), `deployment.test.js` (copia y assets `text/css`) y `forecast-modulos.test.js` (enlaces en orden, `styles.css` ausente, archivos autocontenidos) actualizados.

Riesgo encontrado y corregido: un primer corte partió el comentario de cabecera de «Movement filters» entre dos archivos y el CSS suelto se tragó la primera regla; el DOM no lo delata, solo las capturas. Por eso hay una prueba de comentarios y llaves balanceados por archivo. Capturas de las 4 vistas (1400x1000 y 1400x5000) antes/después: idénticas (`cmp` y `compare -metric AE` = 0). `comparar.sh` da código 1 solo por las líneas de `<link>` de CSS y la de `<script>` (línea base de :3000 es la versión anterior); 0 errores de consola. `npm test` 70/70.
