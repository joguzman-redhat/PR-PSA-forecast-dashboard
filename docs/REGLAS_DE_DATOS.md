# Reglas del dato en el dashboard

Reglas confirmadas con el negocio (reuniones del 19 y 22 de oct 2026). Si un
cálculo del dashboard, de la API o del agente de n8n contradice esto, el error
es del cálculo.

## El dinero sale de BackLog NOLA, nunca de Info Proyectos

`Info Proyectos` trae los montos **sin el factor de conversión**. `BackLog NOLA`
trae los mismos montos ya convertidos (`Valor OF` de BackLog = `Valor OF` de
Info × `Factor`, columna AO). Todo dinero se toma de BackLog NOLA.

Ejemplo, PA 65006 (HCS-BANRESERVAS, OIL DIA2):

| Campo | Info Proyectos (mal) | BackLog NOLA (bien) |
|---|---|---|
| Valor OF | 974.930 | 920.541 |
| Acumulado año anterior | 352.766 (`Consumido 2025`) | 333.086 (`Acum 2025`) |
| Backlog | 622.164 | 13.547 |

Si un proyecto está en Info pero no en BackLog NOLA, se muestra **sin cifras
de dinero y marcado "sin backlog"**. No se cae a los valores de Info.

## Cómo se calcula cada cifra

| Cifra | Regla |
|---|---|
| **Valor Booking** | `Valor OF` de BackLog NOLA. En pantalla se llama "Valor Booking"; en la BD sigue siendo `valor_of` |
| **Revenue acumulado a hoy** | `Acum 2025` + commit de enero hasta el mes en curso, inclusive |
| **Backlog** | La columna `Backlog` de BackLog NOLA, tal cual. El Excel la calcula como Valor OF − Acum 2025 − commit de **los 12 meses** |
| **% ejecución** | Revenue acumulado / Valor Booking, ponderado por monto (no el promedio de porcentajes) |

El backlog **ya descuenta el commit planeado para el resto del año**, así que:

**Booking = Acumulado a hoy + commit planeado del resto del año + Backlog.**

Es el mismo número de las tablas dinámicas del negocio (Backlog por PM y
estado). Verificado el 22 de oct 2026: In Progress 142 · 5.244.100, On Hold
21 · 2.120.585, Planned 34 · 1.569.347, total 197 · 8.934.032.

> Antes se calculaba como Booking − Acumulado a hoy. Daba, por ejemplo,
> 7,09M en In Progress en vez de 5,24M, porque no restaba el commit de
> noviembre y diciembre. No volver a esa fórmula.

## Proyección de Backlog vs. Revenue después de 2026

El calendario mensual disponible comienza en enero de 2026. `Fecha fin` viene
de Info Proyectos. La fecha de inicio de CCProjects todavía no se importa.

Para proyectos que terminan después de diciembre de 2026, la gráfica reparte
el **Backlog de BackLog NOLA** uniformemente entre enero de 2027 y el mes de
finalización, ambos incluidos. Ese importe aumenta el Commit acumulado y
reduce el saldo pendiente. El tramo aparece como **proyección estimada**, con
líneas discontinuas. Es una estimación de la vista, no un cambio a los datos
del calendario fuente ni al Backlog almacenado.

Los proyectos con saldo y sin fecha fin futura válida conservan ese pendiente;
la gráfica no les asigna un calendario de ejecución estimado.

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


## Timeline multianual (requerimiento del 22 nov 2026)

La vista combinada sustituye la seleccion de archivo por un rango mensual.
Cada periodo se identifica por año y mes (`2026-01`, `2027-01`); un quarter
siempre incluye su año. Se conserva la semantica de cada columna financiera
anual: los acumulados de FY26 y FY27 NO se suman entre si.

- Todo dinero sigue procediendo de BackLog NOLA. Commit/Upside se concatenan
  por periodo. Booking, backlog fuente y acumulado anterior se seleccionan
  una sola vez por proyecto, sin sumarlos por año.
- Para esos atributos, prioridad por proyecto: año actual en America/Bogota;
  si falta, anterior mas cercano; si solo existe en el futuro, futuro mas cercano.
  La carga mas reciente resuelve empates en la misma fuente/año. No se rellena
  un importe ausente con el de Info Proyectos ni con cero.
- El acumulado a hoy parte del acumulado anterior de la fuente de referencia
  y suma los meses de ESA fuente hasta hoy. No vuelve a sumar los años que
  ya estan incluidos en su saldo anterior.
- La clave multianual es PA. Sin PA, se utiliza Project ID/PR; sin ambos, la
  identidad se aisla por año y proyecto existente y exige conciliacion manual.
  No se unen proyectos desconocidos solo por tener nombres parecidos.
- Desde/Hasta es el único rango global para listado, PMs y trazabilidad global.
  Se eligen meses o trimestres visibles en el control «Ver por»; Q1 es enero-marzo,
  Q2 abril-junio, Q3 julio-septiembre y Q4 octubre-diciembre, como en los Excel.
  El rango limita tanto el revenue como los proyectos cuya vigencia se solapa
  con él, desde el primer mes con commit distinto de cero registrado hasta el
  mes de Fecha fin, inclusive. Incluye créditos negativos como actividad registrada.
  No se toma la fecha de captura como fecha de inicio ni se inventa una fecha
  de inicio anterior al calendario cargado. Sin primer commit o sin fecha fin,
  solo se aplica el extremo conocido y se informa el dato faltante.
  Booking y backlog se toman una vez por cada proyecto visible; cambiar de
  periodo no cambia el año de referencia ni suma los importes de varios años.
  Por eso esos totales sí pueden variar cuando el rango excluye proyectos.
- «Mes y año fin» se deriva de Fecha fin, no de una columna de año ausente.
  Solo fechas ausentes o inválidas se agrupan como «sin dato».
- La grafica combinada muestra Commit/Upside fuente por mes y año, sin estimar
  importes para meses fuera de cobertura. Un mes no disponible es null, distinto
  de un cero cargado. Las reglas anteriores de proyeccion estimada se conservan
  solo para consumidores anuales anteriores, no se aplican sobre el timeline.
- Una fecha de inicio real no se inventa: el calendario disponible comienza
  con las fuentes cargadas. Fecha fin se conserva como atributo; no se borran
  montos de Excel por estar fuera de esa fecha. El detalle limita su gráfica
  mensual a toda la vigencia conocida, independientemente del rango global; si hay importes fuera de
  fecha fin, lo advierte sin borrar ni recortar el dinero fuente almacenado.

Los snapshots originales conservan el historial de cambios; la tabla
`forecast_revenue_mensual` es su consolidacion de lectura, mantenida en la
misma transaccion por trigger. No sustituye ni elimina la evidencia original.


## Ajustes de lectura del 24 nov 2026

- Sin un rango explícito en la URL, se selecciona el trimestre actual en la fecha
  de referencia de Colombia hasta Q4 del año siguiente. Un enlace con rango
  explícito conserva su selección. Meses futuros sin fuente siguen sin dato.
- El filtro rápido ofrece Todo NOLA, México y NSSA. México se identifica por
  País; NSSA es el complemento dentro del portafolio NOLA, no una etiqueta de
  Zona. Los proyectos sin país permanecen en el complemento y siguen marcados
  sin dato. Cambiar este filtro limpia la selección de país para evitar conflictos.
- La fila principal añade Upside del periodo, Commit pendiente del año de
  referencia, Acumulado proyectado y Diferencia vs. Booking. Proyectado es
  acumulado al corte más Commit de los meses posteriores del año de referencia.
  Diferencia es Booking menos proyectado menos Backlog fuente: positivo indica
  importe sin conciliar, negativo excedente, cero conciliación. No se modifica
  ningún importe para forzar la igualdad; con cifras incompletas se muestra
  ausencia de diferencia y se explica en la ayuda.
- Los iconos de ayuda explican por separado el rango, los importes del periodo
  y los importes del año financiero de referencia. No se mezclan ambas bases.
- La barra de Planned/On Hold es ahora ejecución del contrato: acumulado al
  corte / Booking del propio proyecto. No representa participación en el
  backlog de los proyectos filtrados. El Backlog fuente se conserva como importe
  separado. Para PA65723 es 81,1%, aunque solo quede ese proyecto visible.
- On Hold tiene color naranja, separado del semáforo amarillo de Project Status.
- El detalle muestra toda la vida disponible: primer Commit distinto de cero
  hasta Fecha fin inclusive, sin recortarla por los quarters del listado. Sin
  primer Commit no se inventa un inicio; sin Fecha fin se llega al último mes
  con Commit registrado. Los meses sin cobertura conservan el hueco.
- La curva del detalle se llama saldo contractual para distinguirla del Backlog
  fuente. Comienza en un solo Booking, incorpora una sola vez el arrastre anterior
  al calendario disponible y descuenta los Commit. El arrastre de un año posterior
  se descuenta de los meses ya representados para evitar duplicarlos. Se muestran
  saldo y revenue acumulado: no se fuerza el saldo a cero al finalizar ni se
  redistribuyen importes sin Commit. Los créditos pueden aumentar el saldo y
  una ejecución excedida puede volverlo negativo; ambos se muestran.
- Las capturas crudas siguen separadas por fuente/año en PostgreSQL. La
  comparación del dashboard usa cortes consolidados por ejecución n8n:
  aplica todas las cargas de esa corrida y conserva la última conocida de cada
  año sin cambios. Fecha/hora identifica el corte completo, no un Excel.
  Eventos y diferencias se calculan entre esos estados completos; los meses
  que aún no tenían cobertura no se consideran cero ni movimientos.
- `carga.ejecucion_id` combina workflow e ID de ejecución de n8n y permite
  unir fuentes aunque terminen en minutos distintos. Una corrida sin cambios
  no crea un corte; si solo cambia un año, conserva los demás. Mientras una
  corrida está en progreso su corte puede recibir la siguiente fuente; no es
  una transacción atómica entre los dos archivos.
- Las cargas anteriores solo se agrupan si hay evidencia del mismo ID de
  corrida en el historial guardado de n8n. Localmente se recuperaron esos IDs
  de los resultados de carga de ejecuciones exitosas. Sin evidencia se conserva
  el corte independiente; no se fusionan cargas por cercanía temporal ni se
  borran o reescriben sus importes. `ejecucion_identificada` informa la cobertura.
- El rango de comparación evita elegir el mismo corte en ambos extremos si hay
  varios; Último mes y Últimos 7 días usan la última fecha disponible.
