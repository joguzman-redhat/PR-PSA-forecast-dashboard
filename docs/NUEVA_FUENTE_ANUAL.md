# Incorporar el Excel del año siguiente (FY28 y siguientes)

El dashboard no tiene años fijos: el calendario, los selectores Desde/Hasta, el
rango por defecto, el Backlog continuo y el Proyectado se derivan de los
periodos que devuelve `/api/timeline`, que a su vez salen de las Cargas que hay
en la base. Incorporar un Año fuente nuevo es **una línea en n8n y una
Ejecución**; no hay cambios de código ni de esquema.

## Qué cambia en el Excel

Estructura, hojas (`Info Proyectos`, `BackLog NOLA`) y columnas son las mismas.
Solo cambian los nombres de las columnas que llevan el año. El workflow los
deduce del año fuente (nodo **Configurar Fuente Forecast**) y acepta, para 2028:

| Dato | Cabecera aceptada (sin distinguir mayúsculas ni espacios dobles) |
|---|---|
| Backlog | `Backlog 2028` |
| Acumulado anterior | `Total Ejecutado Acumulado 2025-2026-2027` o `Total Ejecutado Acumulado 2025-2027` o `Acumulado anterior` |
| Total ejecutado | `TOTAL EJECUTADO ACUMULADO 2025-2026-2027-2028` o `TOTAL EJECUTADO ACUMULADO 2025-2028`, con o sin ` (COPIAR)` |

`Valor OF`, los meses (`Enero`...`Diciembre`) y `Upside`, `Upside_1`...`Upside_11`
no cambian. Una cabecera `BACKLOG <otro año>` hace fallar la validación a
propósito (evita cargar un Excel con el año equivocado).

## Pasos

1. **Drive.** Sube o convierte el Excel a Google Sheets/xlsx y copia su ID (el
   tramo largo de la URL). La cuenta de n8n debe poder leerlo.
2. **n8n, un solo cambio.** Abre el nodo **Configurar Fuente Forecast** y agrega
   la entrada del año nuevo al objeto `archivos`. Nada más (los demás nodos ya
   son genéricos en el año):
   ```js
   const archivos = {
     2026: { archivo_id: '1_NNst0wIKXAlCa7fu8RRiBFAahcXzvuGEEt5IAhm-co', archivo_nombre: 'CLOUD FORECAST GENERAL - NOLA FY26' },
     2027: { archivo_id: '13ULKx3-9MmFrU6suvm8jSgIwIKsBh44wLH7i_l10tSE', archivo_nombre: '27-CLOUD FORECAST GENERAL - NOLA FY27' },
     2028: { archivo_id: '<ID_DEL_EXCEL_FY28>', archivo_nombre: '28-CLOUD FORECAST GENERAL - NOLA FY28' },
   };
   ```
   Si al validar (paso 3) alguna cabecera real no coincide con la tabla, no
   toques otros nodos: declara los nombres exactos en esa misma entrada:
   ```js
   2028: { archivo_id: '...', archivo_nombre: '...', campos: {
     valor_of: ['Valor OF'],
     acumulado_anterior: ['<cabecera real>'],
     backlog: ['<cabecera real>'],
     total_ejecutado: ['<cabecera real>'],
   } },
   ```
3. **Validar sin escribir.** En el mismo nodo pon `const MODO = 'validar';` y
   ejecuta desde **Manual Trigger**. El resumen debe mostrar tres fuentes y
   ningún error. Un error de «Columnas requeridas ausentes para FY2028: ...»
   nombra la cabecera que falta (paso 2, segundo bloque). Vuelve `MODO` a
   `'cargar'`.
4. **Cargar.** Ejecuta con `MODO = 'cargar'`. Cada año se compara por hash:
   FY26 y FY27 salen como `sin_cambios` si no cambiaron, y FY28 crea su primera
   Carga (`cargas_nuevas: 1`). Todos los años de una misma Ejecución forman un
   solo Snapshot para el usuario.
5. **Recarga el dashboard** (Ctrl+F5). No hace falta reiniciar la API ni tocar
   la base.

## Cómo verificar en el dashboard

- `curl -s localhost:3000/api/timeline | jq '.meta | {anios, desde, hasta, n: (.periodos|length)}'`:
  `anios` incluye 2028 y `hasta` es `2028-12` (36 periodos).
- Los selectores Desde/Hasta ofrecen hasta Q4 2028; el rango por defecto va del
  trimestre actual a dic 2028; hay opciones de año y trimestres de 2028.
- Un proyecto con Commit en 2028 muestra esos meses en la gráfica de revenue y
  en la trazabilidad (los Snapshots anteriores al alta de 2028 siguen sin dato
  en esos meses, y su incorporación no cuenta como movimiento).
- **Proyectado.** Un proyecto cuya Fecha fin cae en 2028 tenía «Proyectado
  parcial: cubre hasta dic 2027; faltan meses de 2028». Al cargar FY28 el aviso
  desaparece y el Proyectado suma el Commit de 2028, así que sube; la tarjeta
  Proyectado ya no cuenta ese proyecto como parcial. Si queda aviso, el Excel FY28
  no trae Commit (celda vacía, no cero) para algún mes de la vida de ese
  proyecto: esos meses siguen sin cobertura y no se cuentan como cero.
- **Backlog continuo.** Baja en los proyectos con Commit de 2028 (se descuenta
  de la fuente FY26 o FY27). Booking sigue contándose una sola vez por
  proyecto, y Booking = Ejecutado + Commit pendiente + Backlog debe seguir
  cerrando (Diferencia vs. Booking en cero).
- Atención: el Booking, el acumulado anterior y los atributos de cada proyecto
  salen de la Carga del año actual (si no existe, del anterior más cercano, y
  luego del futuro más cercano). Al cambiar el año calendario (enero 2027) la
  fuente preferida pasa a ser FY27; es esperado.

## Qué no cubre esto

- El agente de IA de n8n (nodos `Tool_Postgres_*`) consulta solo FY26 por
  diseño (`WHERE anio_forecast=2026`). No responde sobre FY27 ni FY28.
  Si se quiere, es un cambio aparte en esos tres nodos.
- Las columnas de Info Proyectos con año en el nombre (`Consumido 2025`,
  `Backlog 2026`) se guardan en la tabla `proyecto` pero el dashboard no las
  usa: si el Excel nuevo las renombra, quedan en `NULL` sin afectar nada. Toda
  la plata sale de BackLog NOLA.
- Los endpoints antiguos por año (`/api/backlog?anio=`, `/api/historia?anio=`)
  asumen 2026 por defecto; el dashboard usa solo `/api/timeline`.
