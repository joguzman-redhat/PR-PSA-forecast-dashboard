# Troubleshooting del ETL (n8n) — 2026-10-15

Sesión de pruebas de robustez contra el workflow real de n8n
(`n8n/n8n_nola_completo.json`), inyectando datos corruptos a propósito en una
copia de prueba del Google Sheet fuente, para ver qué tolera el pipeline antes
de que llegue a producción con datos reales de Salesforce/Excel.

No se tocó el Excel real de producción: se usó una copia en el mismo Drive
del usuario, apuntada temporalmente desde el nodo "Descargar data.xlsx de
Drive" (`fileId`). Antes de volver a producción, confirmar que ese `fileId`
apunte de nuevo al archivo correcto.

## Metodología

Se identificaron las dos hojas que realmente lee el ETL (`Info Proyectos` y
`BackLog NOLA`, cruzadas por `# PA`) y se editaron 6 filas a mano, cada una
con un problema distinto, directamente en el Google Sheet (no subiendo un
`.xlsx` completo — ver nota de riesgo abajo). Se ejecutó el workflow después
de cada cambio y se verificó el resultado en Postgres y en el dashboard
(`http://localhost:3000/`).

**Nota de riesgo descubierta:** este Google Sheet está construido sobre
fórmulas en cadena entre ~30 pestañas (`VLOOKUP` cruzando `Info Proyectos` →
`CCProjects`, etc.). Reabrir el archivo con una librería externa
(`openpyxl`) y volverlo a subir como "nueva versión" del mismo archivo
**no es seguro**: se pierden los valores cacheados de todas las fórmulas del
libro, y la reconversión de Google Sheets puede romper pestañas enteras (nos
pasó: `BackLog NOLA` quedó con 1 sola fila tras una subida). Por eso, para
cualquier prueba futura sobre este Sheet, **editar las celdas a mano en el
navegador**, nunca subir el archivo completo como nueva versión.

## Casos probados y resultado

| # | Caso | Dónde | Resultado antes de los fixes | Severidad |
|---|---|---|---|---|
| 1 | `Valor OF` = texto (`ERROR_TEXT`) | Info Proyectos | Se guarda como `NULL`, se ve `—` en el dashboard. Sin errores. | OK, no requiere cambio |
| 2 | `Valor OF` = `-999999999999` | Info Proyectos | **Rompía los KPIs globales del dashboard**: "Valor OF Total" y "Backlog 2026" mostraban `-$999,966.02M`, "% Ejecución Global" quedaba en `—` (NaN) | 🔴 Alto — **corregido** |
| 3 | Nombre con `<script>alert('x')</script> "comillas" 'simples'` | Info Proyectos | Se guarda literal en Postgres. En la tabla de proyectos del dashboard se muestra como texto plano, **no se ejecuta** (no hay XSS ahí). No se verificó el comportamiento en los filtros/dropdowns de nombre. | Bajo — pendiente de confirmar en dropdowns |
| 4 | `Fecha fin` = `32/13/2026` (mes/día inválidos) | Info Proyectos | El parser de fechas (JS `Date.UTC`) no rechaza meses/días fuera de rango: los "normaliza" silenciosamente. `32/13/2026` se convirtió en `2028-08-13`, y el proyecto pasó de "Contrato vencido" (-289 días) a **"Contrato vigente" (668 días)**, sin ningún error ni aviso. | 🔴 Alto — **corregido** |
| 5 | Fila duplicada (mismo `# PA` dos veces) | Info Proyectos | El `UPSERT` por `clave` (PA) lo absorbe sin problema: solo queda 1 fila en Postgres. | OK, no requiere cambio |
| 6 | `# PA` de BackLog sin match en Info Proyectos | BackLog NOLA | Se descarta limpio, no genera fila basura ni rompe la carga. | OK, no requiere cambio |

## Fixes aplicados en `n8n/n8n_nola_completo.json`

### 1. Límite de rango en montos (nodo "Construir SQL de Carga", función `sqlNum`)

Antes: cualquier número, sin importar magnitud, se insertaba tal cual en
Postgres (`Valor OF`, `Valor OF Anterior`, `ACUMULADO A HOY`, `Consumido
2025`, `Backlog 2026`, y los montos mensuales de Commit/Upside).

Ahora: si `Math.abs(valor) > 100000000` ($100M), se descarta como `NULL` en
vez de insertarse. El límite es una constante (`LIMITE_MONTO`) fácil de subir
si algún día hay un proyecto legítimo más grande.

### 2. Validación de fechas (nodo "Recalcular Columnas Rotas", función `parseFechaFin`)

Antes: `MM/DD/YYYY` se parseaba con una regex que no validaba rangos; un mes
o día fuera de rango se "normalizaba" a otra fecha sin avisar.

Ahora: se valida `1 <= mes <= 12` y `1 <= dia <= 31`, y además se verifica
que la fecha construida por `Date.UTC(...)` coincida con el mes/día pedidos
(esto atrapa también casos tipo "30 de febrero", que no son >31 pero no
existen en ese mes y JS los habría movido a marzo sin avisar). Si no pasa la
validación, devuelve `null` → en Postgres queda `fecha_fin`,
`dias_para_vencimiento` y `estado_contrato` en `NULL`, que el dashboard
muestra como `—`.

## Pendiente / no verificado

- Confirmar si el texto `<script>...</script>` se ejecuta en algún dropdown
  de filtro del dashboard (`app.js`, función que arma las opciones de
  filtro) — en la tabla principal no se ejecuta, pero no se probó ahí.
- Volver a apuntar el `fileId` del nodo "Descargar data.xlsx de Drive" al
  archivo de producción antes de dejar el workflow corriendo "en serio".
- Reimportar este workflow actualizado en la UI de n8n si no se hizo ya
  (los cambios de este documento están en el `.json` del repo, pero n8n
  corre su propia copia interna hasta que se reimporte).
