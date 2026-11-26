# Reglas del dato en el dashboard

Reglas confirmadas con el negocio (reuniones del 19 y 22 de oct 2026).
Corregido el 26 de nov 2026 según el ADR 0001
(`docs/adr/0001-backlog-proyectado-toda-la-vida.md`): esta versión reemplaza lo
del 22 y 24 de nov en lo que se contradice. Vocabulario en `GLOSSARY.md`. Si un
cálculo del dashboard, de la API o del agente de n8n contradice esto, el error
es del cálculo.

## El dinero sale de BackLog NOLA, nunca de Info Proyectos

`Info Proyectos` trae los montos **sin el factor de conversión**. `BackLog NOLA`
trae los mismos montos ya convertidos (el `Valor OF` de BackLog es el de
Info × `Factor`, columna AO; en pantalla es el Booking). Todo dinero se toma de BackLog NOLA.

Ejemplo, PA 65006 (HCS-BANRESERVAS, OIL DIA2):

| Campo | Info Proyectos (mal) | BackLog NOLA (bien) |
|---|---|---|
| Booking (`Valor OF`) | 974.930 | 920.541 |
| Acumulado año anterior | 352.766 (`Consumido 2025`) | 333.086 (`Acum 2025`) |
| Backlog | 622.164 | 13.547 |

Si un proyecto está en Info pero no en BackLog NOLA, se muestra **sin cifras
de dinero y marcado "sin backlog"**. No se cae a los valores de Info.

## Cómo se calcula cada cifra

Todo es por proyecto y sobre su **Vida del proyecto**. Booking y Backlog se
toman **una sola vez** de la Carga más reciente; no se suman entre Años fuente.

| Cifra | Regla |
|---|---|
| **Booking** | `Valor OF` de BackLog NOLA, una vez por proyecto. En la BD sigue siendo `valor_of` |
| **Backlog** | La columna `Backlog` de BackLog NOLA, tal cual (Carga más reciente). El Excel la calcula como Booking − acumulado anterior − Commit de los 12 meses de su Año fuente |
| **Ejecutado** | Acumulado anterior + Commit desde el inicio del calendario hasta el mes actual, inclusive. Se calcula; no se lee de la API |
| **Proyectado** | Ejecutado + Commit de los meses posteriores al actual, incluidos los de años posteriores al Año fuente. **Solo Commit, nunca Upside** |
| **Commit pendiente** | Commit de los meses posteriores al actual, hasta el fin de la Vida del proyecto |
| **% ejecución** | Ejecutado / Booking, ponderado por monto (no el promedio de porcentajes) |

El Backlog de la Carga solo descuenta el Commit de su Año fuente. El Commit de
años posteriores sigue sin descontar, y esa parte es el **Backlog sin planear**
(Backlog − Commit posterior al Año fuente). La identidad es:

**Booking = Ejecutado + Commit pendiente + Backlog sin planear.**

La columna y el KPI Backlog muestran el Backlog del Excel; el descuento del
Commit posterior se ve en el Proyectado, en la curva del detalle y en la
Diferencia vs. Booking. Es el número de las tablas dinámicas del negocio
(verificado el 22 de oct 2026: In Progress 142 · 5.244.100, On Hold 21 ·
2.120.585, Planned 34 · 1.569.347, total 197 · 8.934.032).

> Antes se calculaba como Booking − Ejecutado. Daba, por ejemplo, 7,09M en
> In Progress en vez de 5,24M, porque no restaba el Commit de noviembre y
> diciembre. No volver a esa fórmula.

## Vida del proyecto y Fecha fin

- La Vida del proyecto va desde el primer mes con Commit distinto de cero hasta
  la Fecha fin (Info Proyectos). Sin Fecha fin llega al último mes con Commit;
  la Fecha fin nunca se inventa desde el Commit.
- Con Fecha fin, las gráficas y la proyección llegan hasta ella.
- Un Commit o Upside posterior a la Fecha fin se advierte en el detalle, sin
  recortar el importe: se conserva en el Proyectado y en las gráficas.
- Un mes sin cobertura es **sin dato**, no cero. Con meses sin dato el
  Proyectado y el Commit pendiente quedan sin dato; no se rellena.
- La fecha de inicio real no se importa: el calendario comienza con las Cargas.
- La curva del detalle es el **Backlog** restante: parte de un Booking, incorpora
  una sola vez el acumulado anterior al calendario y descuenta el Commit mes a
  mes (Ejecutado hasta hoy, Proyectado después). No se fuerza a cero al terminar,
  y un crédito o un exceso de ejecución puede subirlo o volverlo negativo.

## Commit y Upside en el tiempo

- El Commit de un mes pasado es un hecho: queda congelado y no cambia.
- El Upside solo existe del mes actual en adelante; no entra en el Ejecutado ni
  en el Proyectado.

## Campos de Info Proyectos que sí se usan

Info Proyectos es la fuente de lo descriptivo (cliente, PM, zona, vendedor,
fechas, estado) y de estos dos campos:

| Columna del Excel | En el dashboard | Valores |
|---|---|---|
| `Executive Watchlist` | **Handover**: el proyecto ya pasó de un PM a otro, que recibió la explicación | booleano |
| `Project Status` | **Semáforo**. Rojo = el proyecto tiene problemas | `Red` / `Yellow` / `Green` |

Ambos tienen filtro en el Listado. Además, las filas en rojo y en amarillo
llevan un tinte sutil, para que se distingan sin cansar la vista.

## Cambios de esquema

`infra/db/init/01_schema.sql` solo corre con el volumen vacío. Cada cambio de
esquema va **en los dos lugares**:

- `01_schema.sql`, para que un clon nuevo arranque bien.
- Una migración idempotente en `infra/db/migraciones/`, que se aplica a una BD
  existente con `./forecast.sh migrate`.

El workflow de n8n vive en `n8n/n8n_nola_completo.json`. Se edita ese archivo y
se reimporta en n8n.

## Rangos, filtros y claves

- Cada periodo se identifica por año y mes (`2026-01`, `2027-01`); un quarter
  siempre incluye su año. Q1 es enero-marzo, Q2 abril-junio, Q3 julio-septiembre
  y Q4 octubre-diciembre.
- Desde/Hasta es el único rango global del listado, PMs y trazabilidad global,
  y se elige en el control «Ver por». Commit y Upside suman los meses del rango.
  Un proyecto entra si su Vida del proyecto se solapa con el rango; sin límite
  conocido (primer Commit o Fecha fin) se aplica solo el otro. El rango no recorta
  el detalle, que muestra la Vida del proyecto completa.
- Sin rango en la URL se selecciona el trimestre actual (hora de Colombia) hasta
  Q4 del año siguiente. Un enlace con rango explícito lo conserva.
- Booking, Ejecutado, Proyectado y Backlog son por proyecto, no por rango; los
  totales varían solo porque el rango incluye o excluye proyectos.
- Prioridad de la fuente por proyecto: Año fuente igual al Año fiscal en
  America/Bogota; si falta, el anterior más cercano; si solo hay futuro, el más
  cercano. La Carga más reciente desempata. No se rellena un importe ausente con
  Info Proyectos ni con cero.
- La clave de proyecto es PA. Sin PA se usa Project ID (PR); sin ambos, la
  identidad se aísla por año y exige conciliación manual. No se unen proyectos
  por tener nombres parecidos.
- El filtro rápido ofrece Todo NOLA, México y NSSA. México se identifica por
  País; NSSA es el complemento (los proyectos sin país quedan ahí, marcados sin
  dato). Cambiar el filtro limpia la selección de país.
- «Mes y año fin» se deriva de la Fecha fin; solo fechas ausentes o inválidas
  se agrupan como «sin dato».
- La barra de Planned/On Hold es Ejecutado / Booking del propio proyecto, no su
  participación en el Backlog filtrado. On Hold es naranja, distinto del
  Semáforo amarillo.

## Snapshots

- Las Cargas crudas siguen separadas por Año fuente en PostgreSQL. La tabla
  `forecast_revenue_mensual` es su consolidación de lectura, mantenida en la
  misma transacción por trigger; no sustituye la evidencia original.
- Un Snapshot es el estado completo del portafolio tras una Ejecución de n8n:
  aplica todas las Cargas de esa Ejecución y conserva la última conocida de
  cada Año fuente sin cambios. Una Ejecución sin cambios no crea Snapshot.
- `carga.ejecucion_id` combina workflow e ID de ejecución de n8n y une las
  fuentes aunque terminen en minutos distintos. Mientras una Ejecución está en
  progreso su Snapshot puede recibir la siguiente fuente (no es atómico entre
  los dos archivos).
- Las Cargas anteriores solo se agrupan si hay evidencia del mismo ID de
  Ejecución en el historial de n8n (`ejecucion_identificada` informa la
  cobertura). Sin evidencia se conserva el Snapshot independiente; no se
  fusionan por cercanía temporal ni se reescriben importes.
- Eventos y diferencias se calculan entre Snapshots completos; los meses que
  aún no tenían cobertura no son cero ni movimiento. El rango de comparación
  evita el mismo Snapshot en ambos extremos; Último mes y Últimos 7 días usan
  la última fecha disponible.
