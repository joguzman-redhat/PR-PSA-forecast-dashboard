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
