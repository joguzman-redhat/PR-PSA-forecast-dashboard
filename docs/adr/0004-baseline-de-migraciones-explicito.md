---
status: accepted
---

# El esquema inicial tiene baseline y el histórico restaurado se adopta explícitamente

El esquema inicial canónico ya incorpora las migraciones históricas, incluida la
reconstrucción de identidad por Project ID. En una base vacía se ejecuta ese
esquema y se registran, en la misma transacción, los hashes de las migraciones
absorbidas por un baseline versionado; no se reproducen todas sobre el esquema
actual. Las migraciones nuevas se ejecutan una vez, en orden, con bloqueo y
registro de su hash en la misma transacción que el cambio.

Una base restaurada sin registro no se considera actual por detectar unas
columnas. Su adopción requiere una orden administrativa explícita, referencia a
un backup verificado y coincidencia de su huella estructural con la fuente que
el operador verificó contra el baseline vigente. La huella confirma fidelidad
estructural del restore, no que los datos o las cifras sean correctos: siguen
siendo obligatorias las comprobaciones del histórico y del ADR 0003.

## Considered Options

- **Reejecutar las migraciones históricas en cada arranque:** rechazado; algunas
  transforman claves e historia, y el esquema inicial ya contiene sus resultados.
- **Detectar columnas y asumir una versión:** rechazado; no prueba que funciones,
  vistas, triggers e índices correspondan a la versión esperada.
- **Recrear la base para cada entrega:** rechazado; destruiría los Snapshots y la
  configuración que debe preservar el servicio oficial.

## Consequences

- Cambiar el esquema canónico exige actualizar intencionalmente su baseline.
- Una migración ya registrada no puede editarse ni desaparecer silenciosamente.
- El ejecutor controla las transacciones de migraciones nuevas; sus archivos no
  incorporan control transaccional propio.
- Revertir la imagen de la API no revierte cambios de esquema o de datos.
