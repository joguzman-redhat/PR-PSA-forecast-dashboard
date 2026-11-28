Status: ready-for-agent

# Refactor modular del front y Backlog proyectado de toda la vida

## Problem Statement

El dashboard funciona y cumple las reglas de dinero, pero todo el front vive en un solo script de más de seis mil líneas, una sola hoja de estilos de casi tres mil y un HTML grande. Un desarrollador, o un agente de IA, que busque "cómo se calcula el Ejecutado" tiene que leer miles de líneas, y los términos del proyecto (Booking, Backlog, Ejecutado, Snapshot, Carga) se usan de forma inconsistente entre pantalla, código, base de datos y documentos. Eso hace que los agentes se pierdan y que los cambios sean riesgosos.

Además, la regla multianual del 22 de noviembre de 2026 quedó mal planteada: toma el Booking y el Backlog una sola vez desde un año de referencia y no proyecta sobre el timeline. Con FY26 y FY27 cargados, un proyecto contratado en octubre de 2026 que termina en 2027 no permite saber si va camino de ejecutar su Backlog.

## Solution

Desde la vista de quien usa el dashboard, nada se ve distinto salvo lo decidido en el ADR 0001: cada proyecto muestra un solo Backlog de toda su vida restante, con dos métricas, **Ejecutado** (hasta hoy) y **Proyectado** (Ejecutado más el Commit de los meses futuros, incluido 2027), y la proyección llega hasta la Fecha fin.

Desde la vista de quien mantiene el código, el front pasa a ser HTML, CSS y JavaScript nativos divididos en módulos ES pequeños, uno por responsabilidad, que usan el vocabulario de `GLOSSARY.md`. Sin framework y sin paso de build; PatternFly se mantiene como base de estilos. El trabajo se hace en dos fases: primero mover el código sin cambiar el comportamiento, después aplicar las reglas nuevas.

## User Stories

1. Como desarrollador, quiero que los cálculos de dinero estén en módulos propios y con nombre claro, para encontrar "cómo se calcula el Ejecutado" en un solo lugar.
2. Como agente de IA, quiero que el código use los términos del glosario (Booking, Backlog, Commit, Upside, Ejecutado, Proyectado, Snapshot, Carga), para no confundir conceptos entre archivos.
3. Como agente de IA, quiero que los nombres antiguos (`valor_of`, `acumulado_a_hoy`, "corte") aparezcan solo en una capa que traduce la respuesta de la API, para que el resto del código hable un único idioma.
4. Como desarrollador, quiero que el HTML no contenga la lógica de ninguna pantalla, para poder editar una vista sin leer las demás.
5. Como desarrollador, quiero la hoja de estilos dividida por área (base, filtros, listado, detalle, gráficas), para localizar un estilo sin buscar en tres mil líneas.
6. Como usuario del dashboard, quiero que tras la Fase 1 las pantallas se vean y calculen exactamente igual, para confiar en que el refactor no cambió mis cifras.
7. Como persona de negocio, quiero que los estilos sigan basados en PatternFly, para mantener la identidad visual de la empresa.
8. Como desarrollador, quiero cargar el front sin instalar herramientas de build, para que el cambio y el despliegue sigan siendo rápidos.
9. Como desarrollador, quiero que el contenedor de la API siga sirviendo el dashboard en el mismo origen, para no introducir problemas de CORS.
10. Como responsable de despliegue, quiero que la imagen y las pruebas de despliegue incluyan todos los archivos nuevos del front, para que ningún módulo falte en producción.
11. Como PM, quiero ver el Booking de un proyecto una sola vez, sin sumarlo entre años, para no contar doble el contrato.
12. Como PM, quiero ver un solo Backlog por proyecto, tomado de la Carga más reciente, que cubra toda la vida restante incluido 2027, para saber cuánto falta por ejecutar.
13. Como PM, quiero ver el **Ejecutado** de mi proyecto sobre toda su vida (acumulado anterior más Commit hasta el mes actual), para saber cuánto se ha ejecutado de verdad.
14. Como PM, quiero ver el **Proyectado** (Ejecutado más el Commit de los meses futuros, incluidos los de 2027), para saber si el proyecto va camino de ejecutar su Backlog.
15. Como PM, quiero que la proyección use solo Commit y no Upside, para no mezclar lo cierto con lo potencial.
16. Como PM, quiero que, si registro Commit en febrero de 2027, ese importe descuente el Backlog en la gráfica y en la métrica Proyectado, para ver el efecto de mi planeación.
17. Como PM, quiero que la gráfica de un proyecto llegue hasta su Fecha fin cuando existe, aunque el último Commit sea anterior, para ver cuánto Backlog queda sin planear.
18. Como PM, quiero que un proyecto sin Fecha fin siga sin Fecha fin y que su vida llegue al último mes con Commit, para que el sistema no invente fechas.
19. Como PM, quiero que un Commit posterior a la Fecha fin se advierta sin borrar ni recortar el importe, para detectar inconsistencias sin perder dinero registrado.
20. Como PM, quiero que un mes sin cobertura permanezca como "sin dato" y no como cero, para no confundir ausencia con cero cargado.
21. Como director, quiero que los meses pasados muestren su Commit congelado y ningún Upside, para que lo ejecutado no cambie entre Snapshots.
22. Como director, quiero que el Upside exista solo del mes actual en adelante, para entenderlo como potencial que se convertirá en Commit o quedará en cero.
23. Como director, quiero que los totales de Booking y Backlog se calculen una vez por proyecto visible, para que cambiar el rango de meses no sume importes de varios años.
24. Como analista, quiero comparar dos Snapshots y ver qué cambió, para entender la evolución del forecast.
25. Como analista, quiero que el eje de tiempo hable de Snapshots y nunca de "cortes", para tener un único término.
26. Como analista, quiero que una Carga idéntica a la anterior no genere un Snapshot nuevo, para que el historial solo registre cambios reales.
27. Como desarrollador, quiero que `docs/REGLAS_DE_DATOS.md` no contradiga el ADR 0001, para que los documentos y el código coincidan.
28. Como desarrollador, quiero pruebas de caracterización de los cálculos actuales antes de mover código, para detectar cualquier cambio de cifras durante la Fase 1.
29. Como desarrollador, quiero que la misma suite de pruebas se apunte a los módulos nuevos, para comprobar que el comportamiento se conserva.
30. Como agente de IA, quiero tickets pequeños y verticales en `.scratch/`, para implementar y verificar un paso a la vez.
31. Como mantenedor, quiero que los filtros (rango Desde/Hasta, territorio, estado, Semáforo, Handover) vivan en su propio módulo, para cambiar un filtro sin tocar las gráficas.
32. Como mantenedor, quiero que el estado compartido de la aplicación esté en un único lugar con nombre claro, para saber de dónde sale cada valor mostrado.

## Implementation Decisions

- **Stack del front:** HTML, CSS y JavaScript nativos con módulos ES cargados directamente por el navegador. Sin framework, sin transpilador y sin paso de build. PatternFly (hoja vendorizada) se mantiene como base de estilos y no se sustituye.
- **Fases:** (1) mover el código a módulos sin cambiar comportamiento ni cifras; (2) aplicar el Backlog proyectado, Ejecutado/Proyectado y la regla de Fecha fin. Ninguna regla nueva entra durante la Fase 1.
- **Descomposición en módulos** por responsabilidad, con un punto de entrada que solo orquesta. Áreas previstas: acceso a la API y traducción de nombres (única capa que conoce nombres antiguos), estado compartido, calendario y periodos, cálculos de dinero (Booking, Backlog, Ejecutado, Proyectado, Commit, Upside), vida del proyecto y Fecha fin, filtros, listado de proyectos, detalle de proyecto, vista de PMs, gráficas, comparación de Snapshots, exportación a PDF, textos de ayuda. La división exacta la decide la implementación leyendo las secciones actuales del script.
- **Vocabulario:** los módulos nuevos, sus funciones, variables y textos de ayuda usan los términos de `GLOSSARY.md`. Los términos prohibidos (`Valor OF`, "acumulado a hoy", "acumulado al corte", "corte", "saldo contractual", "año de referencia") no se usan salvo en la capa de traducción de la API y en nombres de columnas de BD.
- **Sin cambios en esta spec:** nombres de columnas de BD y de campos de la API, el esquema de PostgreSQL y el flujo de n8n.
- **Regla de Backlog (ADR 0001):** un solo Backlog por proyecto, tomado de la Carga más reciente, que cubre toda la vida restante. No se suma entre años. Reemplaza la regla multianual del 22 de noviembre.
- **Ejecutado:** acumulado anterior más Commit de los meses hasta el actual, sobre toda la vida del proyecto. **Proyectado:** Ejecutado más Commit de los meses futuros. La proyección no incluye Upside.
- **Fecha fin y vida del proyecto:** si hay Fecha fin, gráficas y proyección llegan hasta ella; si no, queda vacía y la vida llega al último mes con Commit. No se deriva ninguna Fecha fin del Commit. Un importe posterior a la Fecha fin se advierte, nunca se recorta. Un mes sin cobertura es "sin dato", distinto de cero.
- **Commit y Upside:** el Commit de meses pasados no cambia; el Upside solo existe del mes actual en adelante.
- **Despliegue:** la imagen de la API y la lista blanca de archivos de construcción copian hoy una lista fija de archivos del front; debe cambiarse para incluir los módulos y las hojas de estilo nuevas. Las pruebas de despliegue que verifican esa lista se actualizan en consecuencia. El front se sigue sirviendo desde el mismo origen que la API.
- **Documentación:** `docs/REGLAS_DE_DATOS.md` se corrige para no contradecir el ADR 0001; `CLAUDE.md` y `README.md` se actualizan con la nueva estructura del front.

## Testing Decisions

- **Un buen test** comprueba comportamiento externo: dadas entradas de la API y una fecha, qué cifras y qué estado resultan. No comprueba nombres de funciones internas ni la forma de los módulos.
- **Un único seam:** el existente. Las pruebas cargan el front completo con una página simulada y llaman a las funciones de cálculo y de estado (Ejecutado, Booking, rangos, vida del proyecto, calendario, filtros, comparación de Snapshots). No se crea ningún seam nuevo.
- **Fase 1:** primero se usa `/tdd` para ampliar la suite sobre los cálculos de dinero que aún no estén cubiertos y se confirma que pasa contra el script actual. Luego se adapta solo el cargador de las pruebas para leer los módulos ES, sin tocar las aserciones, y la suite debe seguir verde tras cada ticket.
- **Fase 2:** se escriben primero las pruebas del Backlog de toda la vida, Ejecutado, Proyectado, la regla de Fecha fin y el Commit posterior a la Fecha fin, y después la implementación.
- **Antecedentes:** la suite de la interfaz del forecast y las auditorías de cifras renderizadas contra una respuesta real de la API, ambas en el directorio de pruebas de la API. La auditoría de datos renderizados debe seguir funcionando tras el refactor.
- **Verificación visual:** al cerrar la Fase 1, el dashboard se abre en el navegador y se compara contra la versión actual.

## Out of Scope

- Frameworks (React, PatternFly React) y cualquier paso de build.
- Cambios de esquema de PostgreSQL, incluido renombrar la tabla `carga`, que hoy guarda Snapshots.
- Cambios en el flujo de n8n, en los endpoints de la API o en los nombres de sus campos.
- Mostrar Upside en la proyección o crear un escenario optimista.
- Nuevas pantallas o nuevos filtros distintos de los ya existentes.
- Autenticación, despliegue en OpenShift/SPAship y cualquier cambio de infraestructura.

## Further Notes

- Una Carga idéntica a la anterior no crea Snapshot; esto ya lo hace el flujo de datos y no se modifica.
- Los términos abiertos del glosario (ninguno al momento de escribir esta spec) se registran con `/domain-modeling`, no aquí.
- Orden sugerido de tickets: pruebas de caracterización; cargador de pruebas compatible con módulos; extraer API y traducción de nombres; extraer estado y calendario; extraer cálculos de dinero; extraer filtros y vistas; partir la hoja de estilos; actualizar despliegue y documentación; Fase 2.
