# 01: Pruebas de caracterización de los cálculos de dinero

**What to build:** Ampliar la suite existente (usando /tdd) sobre los cálculos de dinero que hoy no cubre: Booking, Backlog, Ejecutado, rangos de periodo, vida del proyecto y KPIs. Todo se verifica contra el front actual, sin modificarlo. Es la red de seguridad de la Fase 1.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Cada cálculo de dinero listado tiene al menos una prueba de comportamiento externo (entradas de la API y fecha, cifras resultantes)
- [x] Toda la suite pasa contra el app.js actual, sin cambios en el código de producción
- [x] La auditoría de datos renderizados sigue funcionando

## Comments

Hecho en a00a7a3 y el commit de correcciones de la revisión. 21 pruebas nuevas; comprobadas por mutación (8 roturas de app.js detectadas). La auditoría audit-rendered-data no se corrió: necesita una captura de la API; no se tocó su lista de funciones.
