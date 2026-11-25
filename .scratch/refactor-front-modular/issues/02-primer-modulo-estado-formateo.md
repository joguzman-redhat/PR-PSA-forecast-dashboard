# 02: Primer módulo ES de punta a punta (estado y formateo)

**What to build:** El HTML carga un punto de entrada como módulo ES. El estado global y las funciones de formateo viven en módulos. El cargador de pruebas lee módulos sin tocar las aserciones, y la imagen de la API, la lista blanca de construcción y las pruebas de despliegue incluyen los archivos nuevos.

**Blocked by:** 01

**Status:** done

- [x] El dashboard abre y se ve igual en el navegador
- [x] La suite de pruebas del front pasa completa sin cambiar ninguna aserción
- [x] La imagen de la API incluye los módulos y las pruebas de despliegue lo verifican
- [x] El front sigue sirviéndose desde el mismo origen que la API, sin paso de build

## Comments

Hecho. Punto de entrada: app.js como módulo ES (transitorio; el ticket 10 lo retira). Módulos: js/estado.js y js/formato.js. El cargador de pruebas une el grafo de módulos en un solo ámbito (infra/api/test/modulos-front.js) y no se tocó ninguna aserción. Verificado en Chrome sin interfaz contra la versión anterior: DOM idéntico salvo la etiqueta script, 198 proyectos, mismos KPIs, sin errores de consola. Imagen construida y revisada: incluye js/. La auditoría audit-rendered-data solo cambió su línea de carga; no se corrió (necesita captura de la API). Pendiente de operación: ./forecast.sh rebuild para que el contenedor en :3000 sirva los módulos.
