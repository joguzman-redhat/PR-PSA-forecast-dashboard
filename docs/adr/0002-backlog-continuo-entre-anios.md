---
status: accepted
---

# El Backlog mostrado es continuo entre años

Este dashboard reemplaza a los dos Excel (FY26 y FY27): el negocio quiere verlos como un solo Excel continuo, sin «cambio de año». El Backlog de la fuente solo descuenta el Commit de su Año fuente, así que un Commit de 2027 en un Excel FY26 todavía figura como pendiente. Decidimos que el **Backlog** que se muestra (tarjeta, listado, detalle, PMs, vendedor, informe) es el **continuo**: el Backlog de la fuente menos el Commit posterior a su Año fuente, es decir, lo que falta por planear de toda la vida. El Backlog de la fuente queda como dato de entrada, solo visible en la ayuda de la tarjeta. La identidad **Booking = Ejecutado + Commit pendiente + Backlog** cierra con este número.

Ejemplo (PA 66600): la fuente dice $20.996, el Commit de 2027 es $19.975 y el Backlog mostrado es $1.021.

Decidimos también que el **Proyectado nunca desaparece**. Si la Fecha fin (o la Vida del proyecto) llega más allá del último mes cargado, el Proyectado se calcula con el Commit que existe y se marca **parcial** («cubre hasta dic 2027; faltan meses de 2028»). Los meses sin cobertura no se inventan ni cuentan como cero; cuando llegue otra fuente con ese Commit el cálculo se completa solo. En series mensuales y gráficas un mes sin cobertura sigue siendo sin dato.

Esto reemplaza lo decidido en el ticket 13 («el KPI y el listado muestran el Backlog de la fuente») y el «sin dato» total del Proyectado ante meses sin cobertura. El ADR 0001 sigue vigente en lo demás.

## Considered Options

- **Mostrar el Backlog de la fuente y el continuo por separado**: descartada, dos «Backlog» en pantalla confunden y el negocio verifica contra la suma de los dos Excel.
- **Dejar el Proyectado sin dato si falta cobertura**: descartada, impide ver cualquier Proyectado mientras no llegue el Commit futuro.

## Consequences

- El Backlog mostrado ya no coincide con la columna Backlog del Excel de un solo año (ni con sus tablas dinámicas) en los proyectos con Commit posterior al Año fuente. Eso es esperado.
- Con datos reales, el Backlog continuo coincide con el Backlog del Excel FY27 en 320 de 331 proyectos con cifras que están en ambas fuentes; las 11 diferencias son cambios de Booking o de acumulado entre los dos Excel, una señal para el negocio.
- Un proyecto sin cifras no cuenta como cero en el Backlog total ni en el % de ejecución.
- La Diferencia vs. Booking no se afirma mientras haya proyectos con cifras incompletas o Proyectado parcial.
