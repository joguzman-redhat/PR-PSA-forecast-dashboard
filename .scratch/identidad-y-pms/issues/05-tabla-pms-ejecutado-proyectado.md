# 05: Tabla de PMs con Ejecutado y Proyectado

**What to build:** la tabla de PMs reemplaza «Total Ejecutado» por dos columnas con los términos del glosario: **Ejecutado** (hasta hoy) y **Proyectado** (Ejecutado más el Commit de los meses futuros, sin Upside, parcial si faltan meses, ADR 0002). Ambas usan las mismas reglas de dinero que las tarjetas de KPIs, por lo que los totales cuadran. La columna `total_ejecutado_acumulado` del Excel deja de usarse en esa tabla. Se mantienen los mismos proyectos excluidos que hoy (Canceled). Los proyectos sin cifras no cuentan como cero. Pruebas primero.

**Blocked by:** None (can start immediately). Por el orden acordado se hace después de 01 a 04.

**Status:** ready-for-agent

- [ ] Prueba (seam 2): la salida del cálculo de PMs trae Ejecutado y Proyectado por PM
- [ ] Prueba: la suma de Ejecutado de los PMs coincide con el Ejecutado de los KPIs
- [ ] Prueba: un Proyectado parcial queda marcado y un proyecto sin cifras no cuenta como cero
- [ ] Datos reales: los 25 PMs suman $18,10 M de Ejecutado, igual que los KPIs
- [ ] `npm test`, `npm run lint:front` y `scripts/comparar-front.sh` pasan; la comparación solo difiere en la tabla de PMs
- [ ] Verificado en un navegador según `docs/VERIFICAR_FRONT.md`
