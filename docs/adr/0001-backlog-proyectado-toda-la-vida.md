---
status: accepted
---

# El Backlog cubre toda la vida del proyecto y se proyecta con el Commit futuro

Con FY26 y FY27 cargados, un proyecto contratado en octubre de 2026 puede terminar en 2027. Decidimos que el Backlog es un solo importe por proyecto, tomado del Excel más reciente, que cubre toda la vida restante, y que se muestra con dos métricas: **Ejecutado** (hasta hoy) y **Proyectado** (Ejecutado más el Commit de los meses futuros, incluido 2027). El Upside no entra en la Proyectada.

Esto reemplaza la regla del 22 de noviembre de 2026, que tomaba Booking y Backlog una sola vez desde un año de referencia y no proyectaba sobre el timeline. Esa regla no permitía saber si un proyecto multianual va en camino de ejecutar su Backlog.

## Considered Options

- **Sumar el Backlog de FY26 y FY27**: descartada, cuenta doble el saldo que ya trae el Excel más reciente.
- **Proyectar solo dentro del año fiscal**: descartada, no cubre proyectos que terminan en 2027.

## Consequences

- La vida del proyecto va hasta `Fecha fin` si existe. Si no existe, va hasta el último mes con Commit. Nunca se inventa una `Fecha fin` desde el Commit.
- `docs/REGLAS_DE_DATOS.md` queda en contradicción hasta que se actualice (ticket del refactor).
