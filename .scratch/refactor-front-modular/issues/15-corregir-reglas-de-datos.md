# 15: Corregir REGLAS_DE_DATOS.md

**What to build:** El documento de reglas deja de contradecir el ADR 0001 y usa el vocabulario del glosario (Booking, Backlog, Ejecutado, Proyectado, Snapshot).

**Blocked by:** 14

**Status:** done

- [x] La sección multianual del 22 de noviembre refleja el Backlog de toda la vida
- [x] No quedan los términos prohibidos del glosario en el documento

## Comments

Reescrito `docs/REGLAS_DE_DATOS.md` según el ADR 0001 y los tickets 13 y 14 (Booking y Backlog una sola vez, Ejecutado/Proyectado sobre la Vida del proyecto, Proyectado solo con Commit, Backlog sin planear, Fecha fin, mes sin cobertura = sin dato, Snapshots). Se conservan las reglas vigentes. Los únicos `Valor OF` que quedan son el nombre de la columna del Excel.

Textos visibles corregidos: ayudas de KPIs, etiquetas "Ejecutado" (KPI, vendedor, PM, tabla de PMs, gráficas de comparación, reporte), "Commit pendiente", Snapshot en lugar de corte, Año fuente en lugar de año de referencia, y la curva del detalle ahora es "Backlog" (serie renombrada; pruebas y auditoría ajustadas solo en esa clave). Sin cambios de valores esperados. Queda `fueraDeVigencia` (identificador, contrato de pruebas) y el rótulo "Valor Booking" (no es término prohibido).
