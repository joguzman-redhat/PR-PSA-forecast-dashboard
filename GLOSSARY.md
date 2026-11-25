# Cloud Forecast NOLA

Dashboard que muestra el forecast de revenue de los proyectos de servicios de la región NOLA: cuánto está contratado, cuánto se ha ejecutado y cuánto falta por ejecutar.

## Dinero

**Booking**:
Importe total contratado de un proyecto, ya convertido a USD. Es el valor contra el que se mide la ejecución.
_Avoid_: Valor OF, valor_of, valor del contrato

**Backlog**:
Importe del Booking que falta por ejecutar en toda la vida restante del proyecto, incluidos los años posteriores. Es el saldo pendiente y se descuenta a medida que se ejecuta el Commit.
_Avoid_: Saldo contractual, saldo pendiente, remanente

**Commit**:
Revenue que se planea reconocer en un mes con alta certeza. En meses ya pasados es un hecho ejecutado y no cambia; solo puede cambiar del mes actual en adelante.
_Avoid_: Forecast comprometido, compromiso

**Upside**:
Revenue potencial de un mes con menos certeza que el Commit. Solo existe del mes actual en adelante: al llegar el mes, o se convierte en Commit o queda en cero. Un mes pasado nunca tiene Upside.
_Avoid_: Potencial, oportunidad

**Ejecutado**:
Revenue de un proyecto hasta hoy: el acumulado anterior más el Commit de los meses hasta el actual, sobre toda la vida del proyecto.
_Avoid_: Acumulado a hoy, acumulado al corte

**Proyectado**:
Ejecutado más el Commit de los meses futuros, sobre toda la vida del proyecto. No incluye Upside.
_Avoid_: Acumulado proyectado

## Proyectos

**PA**:
Identidad canónica de un proyecto en todos los años. Es la clave que une el mismo proyecto entre fuentes.
_Avoid_: Número de proyecto, código

**Project ID**:
Identificador alternativo de un proyecto (también escrito PR), usado solo cuando no hay PA. No es sinónimo de PA.
_Avoid_: ID de proyecto

**Fecha fin**:
Fecha de terminación del proyecto, tomada de Info Proyectos. Si existe, gráficas y proyección llegan hasta ella. Si no existe, se deja vacía y nunca se deriva del Commit.
_Avoid_: Fecha de cierre, mes y año fin

**Vida del proyecto**:
Periodo desde el primer mes con Commit distinto de cero hasta la Fecha fin; sin Fecha fin, hasta el último mes con Commit.
_Avoid_: Vigencia, duración

**Handover**:
Marca de que el proyecto pasó de un PM a otro y el nuevo PM recibió la explicación. Viene de la columna `Executive Watchlist` del Excel.
_Avoid_: Watchlist, seguimiento ejecutivo

**Semáforo**:
Estado de salud del proyecto: Rojo (tiene problemas), Amarillo o Verde. Viene de la columna `Project Status` del Excel.
_Avoid_: Project Status, estado de salud

## Proceso de datos

**Ejecución**:
Una corrida del flujo de n8n que lee los Excel y actualiza la base de datos.
_Avoid_: Run, corrida, job

**Carga**:
El Excel crudo que llega desde Google Drive. Hay una Carga por Año fuente.
_Avoid_: Archivo, importación

**Snapshot**:
Versión guardada de la base de datos que se crea cuando una Carga trae datos distintos a los anteriores. Si el Excel no cambió, no se crea. El dashboard compara Snapshots en el eje del tiempo.
_Avoid_: Corte, foto, captura

## Años

**Año fiscal**:
El año fiscal vigente, hoy FY26.
_Avoid_: Año financiero

**Año fuente**:
El año al que pertenece una Carga (FY26, FY27).
_Avoid_: Año de referencia, año del archivo
