# 02: Primer módulo ES de punta a punta (estado y formateo)

**What to build:** El HTML carga un punto de entrada como módulo ES. El estado global y las funciones de formateo viven en módulos. El cargador de pruebas lee módulos sin tocar las aserciones, y la imagen de la API, la lista blanca de construcción y las pruebas de despliegue incluyen los archivos nuevos.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] El dashboard abre y se ve igual en el navegador
- [ ] La suite de pruebas del front pasa completa sin cambiar ninguna aserción
- [ ] La imagen de la API incluye los módulos y las pruebas de despliegue lo verifican
- [ ] El front sigue sirviéndose desde el mismo origen que la API, sin paso de build
