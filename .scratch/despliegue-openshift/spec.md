Status: ready-for-agent

# Despliegue oficial interno de Cloud Forecast con CI/CD en OpenShift

Publicada en el tracker Markdown local configurado para este repositorio.
El estado indica que la especificación puede descomponerse e implementarse;
las dependencias de plataforma listadas abajo siguen pendientes de resolver.

## Problem Statement

El departamento necesita una instancia oficial y persistente de Cloud Forecast
en su clúster corporativo de OpenShift. Debe poder actualizar el dashboard y
la API desde GitHub sin repetir despliegues manuales, conservando el histórico
financiero y la configuración de n8n.

Los manifiestos existentes corresponden a un entorno anterior y no resuelven
el flujo requerido desde main, el aislamiento de red, la evolución automática
del esquema ni la recuperación. El usuario necesita instrucciones concretas
para las acciones que requieren su cuenta, sin tener que diseñar la integración.

## Solution

Desplegar dashboard/API, Postgres y una instancia nueva y persistente de n8n
en el namespace corporativo destinado a ejecución. El dashboard y sus endpoints
de lectura estarán disponibles únicamente desde la red corporativa/VPN, sin
login de aplicación en este release. Postgres y n8n permanecerán internos;
la administración de n8n será temporal mediante port-forward autenticado.

Cada cambio integrado en main activará las verificaciones, la construcción de
una imagen trazable, las migraciones pendientes y el despliegue automático de
la aplicación. Se prefiere webhook a través de una integración corporativa;
su conectividad y soporte siguen siendo una dependencia por resolver.

Se migrará el histórico financiero existente. El usuario configurará las
credenciales de la nueva instancia de n8n e importará el workflow actual después.
Se documentarán respaldo, restauración, reversión y las tareas manuales necesarias.

## User Stories

1. Como lector del departamento, quiero una dirección estable del dashboard oficial para consultar el forecast compartido.
2. Como lector conectado a la red corporativa/VPN, quiero abrir el dashboard sin un login adicional durante este primer release para acceder con facilidad.
3. Como responsable del dato, quiero que el dashboard no sea accesible desde Internet para mantener su consulta dentro de la organización.
4. Como lector, quiero que los endpoints de lectura funcionen bajo la dirección del dashboard para consultar los datos sin acceder directamente a servicios internos.
5. Como responsable del dato, quiero mantener Postgres sin exposición externa para limitar quién puede conectarse a la base.
6. Como mantenedor, quiero mantener n8n sin una ruta administrativa permanente para limitar su exposición.
7. Como mantenedor, quiero abrir y cerrar una conexión temporal a n8n desde mi equipo autenticado para configurarlo y mantenerlo.
8. Como mantenedor, quiero una instancia nueva y persistente de n8n para configurar sus credenciales sin copiar automáticamente las de mi equipo.
9. Como mantenedor, quiero importar posteriormente el workflow existente para conservar su comportamiento actual.
10. Como mantenedor, quiero decidir después la frecuencia de ejecución del ETL para separar esa configuración del despliegue de infraestructura.
11. Como desarrollador, quiero mantener GitHub y main como origen del despliegue para trabajar desde el repositorio existente.
12. Como desarrollador, quiero que los cambios integrados en main se desplieguen automáticamente tras pasar las verificaciones para reducir trabajo manual.
13. Como mantenedor, quiero recibir eventos de GitHub mediante una integración corporativa soportada para activar el pipeline sin publicar servicios adicionales innecesarios.
14. Como mantenedor, quiero que la falta de conectividad del webhook se haga explícita para elegir una alternativa informada.
15. Como desarrollador, quiero que una verificación fallida detenga la entrega para evitar promover una versión no validada.
16. Como mantenedor, quiero ejecuciones de despliegue serializadas para evitar cambios concurrentes en la instancia oficial.
17. Como mantenedor, quiero identificar el commit y la imagen desplegados para diagnosticar problemas y recuperar una versión conocida.
18. Como lector, quiero que las actualizaciones habituales del dashboard/API procuren mantener el servicio disponible para continuar consultando.
19. Como mantenedor, quiero actualizar dashboard/API sin cambiar implícitamente las versiones de n8n o Postgres para controlar los cambios operativos.
20. Como mantenedor, quiero versiones verificables de las imágenes de n8n y Postgres para evitar actualizaciones inesperadas.
21. Como desarrollador, quiero guardar los cambios de estructura de la base como migraciones versionadas para desplegarlos de forma repetible.
22. Como mantenedor, quiero que cada migración pendiente se ejecute una sola vez antes del rollout de la API para evitar aplicar cambios duplicados.
23. Como mantenedor, quiero que una migración fallida detenga el despliegue para evitar arrancar una API incompatible.
24. Como responsable del dato, quiero conservar el histórico financiero actual durante la instalación inicial para mantener las capturas anteriores.
25. Como responsable del dato, quiero que las actualizaciones conserven volúmenes, credenciales y configuración para evitar pérdidas por un despliegue habitual.
26. Como mantenedor, quiero respaldos recuperables de los datos y del estado necesario de n8n para poder restaurar el servicio.
27. Como responsable del servicio, quiero un objetivo de pérdida máxima de 24 horas y recuperación de 4 horas en horario laboral para dimensionar la operación inicial.
28. Como mantenedor, quiero consultar el resultado y los registros del pipeline para detectar fallos sin avisos por correo.
29. Como mantenedor, quiero un procedimiento de reversión que distinga código, esquema y datos para actuar sin asumir que revertir una imagen revierte la base.
30. Como responsable de seguridad, quiero aislamiento de red y permisos mínimos para limitar conexiones y operaciones a lo necesario.
31. Como mantenedor, quiero gestionar secretos fuera del código y de los logs para configurar el servicio sin exponer credenciales.
32. Como usuario que configura el despliegue, quiero una lista de pasos manuales con criterios de aceptación para completar las acciones que requieren mi cuenta.
33. Como mantenedor, quiero validar la entrega mediante el pipeline y las respuestas del dashboard/API para comprobar el resultado real sin crear otro entorno de base de datos.
34. Como mantenedor, quiero versionar y revisar los cambios futuros de workflow para conocer qué proceso corresponde a cada entrega.

## Implementation Decisions

- **Destino confirmado:** clúster `prod-scale-spoke1-dc-rdu3`, tenant `nola-consulting-services-tenant`; los componentes de la aplicación se crearán en `nola-consulting-services-tenant--runtime-int`.
- **Construcción por verificar:** el namespace `nola-consulting-services-tenant--pipeline` tiene tipo build. Eso permite investigarlo como ubicación del CI; no implica haber aprobado ni validado que allí pueda ejecutarse toda la integración requerida. No confundirlo con el destino de la aplicación.
- **Empaquetado existente:** mantener dashboard y API en una misma imagen y origen. El front actual usa módulos ES nativos y hojas CSS ordenadas, sin un build de frontend. La imagen debe incluir sus assets actuales; no volver al empaquetado monolítico anterior.
- **Plataforma corporativa:** basar la solución en capacidades soportadas. La documentación consultada contempla OpenShift Pipelines/Tekton y GitLab CI, depreca BuildConfig y prescribe el registro corporativo `images.paas.redhat.com`. Verificar su aplicabilidad efectiva al tenant antes de implementar.
- **Restricción pendiente:** la guía limita la integración de CI/CD con TenantCredentialManagement a preprod; no dar por hecho su funcionamiento en el clúster destino. La documentación también marca como deprecado el intercambio de credenciales entre clústeres mediante linkToClusters.
- **Disparo:** preferencia por webhook de GitHub mediante integración corporativa. Verificar receptor, conectividad, permisos y autenticidad de eventos. Filtrar eventos para el repositorio y la rama autorizados y construir el commit correspondiente. No aceptar referencias arbitrarias de una petición sin validar.
- **Sin alternativa implícita:** si no existe una integración soportada, presentar polling o un receptor técnico expuesto como alternativas. Ninguna ha sido aprobada; no publicar un receptor adicional por defecto.
- **Entrega automática:** proteger main, ejecutar verificaciones, construir una imagen identificable por commit y digest, aplicar migraciones pendientes, desplegar y comprobar salud. Serializar promociones para impedir que una ejecución antigua termine sustituyendo una entrega más reciente.
- **Persistencia:** conservar los volúmenes de Postgres y n8n entre entregas. Evitar operaciones de sincronización o limpieza que borren almacenamiento persistente.
- **Versiones:** fijar las imágenes de n8n y Postgres; sus actualizaciones serán explícitas. Cambiar el motor de Postgres es distinto de modificar el esquema y necesita un procedimiento propio, especialmente entre versiones mayores.
- **n8n inicial:** instalar una instancia nueva, persistir su estado y gestionar de forma recuperable su clave de cifrado. El usuario configurará credenciales e importará el workflow existente. No copiar automáticamente secretos locales ni alterar la lógica del ETL.
- **Workflow:** mantener la política acordada de exportación, revisión y versionado de cambios futuros. La promoción automática del workflow queda fuera de esta primera entrega.
- **Migraciones:** preparar un Job anterior al rollout de la API, con historial de versiones aplicadas, exclusión mutua y detención ante fallos. Reconciliar primero la creación del esquema con las migraciones existentes para evitar reaplicar cambios ya incluidos. No reinicializar una base existente durante cada entrega.
- **Compatibilidad recomendada:** favorecer cambios aditivos compatibles con la API anterior. Los cambios destructivos o incompatibles deberán tener una intervención planificada y recuperación documentada; no asumir reversión automática de esquema o datos.
- **Migración inicial:** preservar el histórico financiero existente y comprobar su integridad mediante conteos, períodos y comparaciones de resultados acordes con las reglas de datos. No reconstruir capturas históricas a partir de los Excel actuales.
- **Datos financieros:** preservar Postgres como fuente de verdad, la identidad canónica por Project ID (PA como respaldo), el Backlog continuo entre Años fuente y el Proyectado parcial. Los ADR aceptados siguen vigentes; este trabajo no cambia importes ni criterios de negocio. Conservar los Snapshots históricos al migrar.
- **Acceso:** exponer únicamente el dashboard y los endpoints de lectura que necesita, dentro de la red corporativa/VPN. Verificar la configuración de ingress; el nombre del namespace o del dominio no constituye prueba de aislamiento.
- **Sin login inicial:** no implementar autenticación de aplicación ni autorización por usuario. Documentar que cualquier persona con conectividad a la ruta podrá consultar; la distribución del enlace no impone una lista de acceso.
- **Operaciones administrativas:** mantenerlas fuera del acceso de lectores, incluido el endpoint actual de invalidación de caché. El dashboard debe poder consultar nuevas cargas sin publicar esa operación.
- **Administración n8n:** usar port-forward autenticado cuando sea compatible con los permisos del usuario. Una necesidad de callback OAuth requiere resolución específica; no justifica crear una ruta pública permanente.
- **Red y permisos:** añadir políticas que permitan únicamente las conexiones necesarias entre componentes y las salidas requeridas. Separar permisos de lectura de la API, escritura del ETL y migraciones. Usar identidades de ejecución con los mínimos permisos que permita la plataforma.
- **Secretos:** usar los mecanismos corporativos permitidos, evitar valores reales en Git y logs y documentar su carga y recuperación. El ejemplo de variables de entorno no cubre por sí solo todas las credenciales del workflow.
- **Contenedores:** comprobar compatibilidad con ejecución restringida de OpenShift y UID arbitrario, permisos de volúmenes, recursos y probes. La comprobación de vida de la API debe ser independiente de la disponibilidad de Postgres.
- **Continuidad:** uso de pocos usuarios y baja concurrencia, sin exigencia 24/7. Se aceptan interrupciones planificadas de n8n y Postgres; no se promete una arquitectura de alta disponibilidad.
- **Recuperación:** implementar y validar respaldos del histórico financiero y del estado necesario de n8n, con protección de la clave de cifrado. Objetivos aceptados: RPO de 24 horas y RTO de 4 horas durante horario laboral. Destino, retención, permisos y capacidad de restauración siguen pendientes de verificar; un volumen persistente por sí solo no cumple este requisito.
- **Operación:** dejar resultados y logs consultables, sin correos de fallos. Definir retención de registros y ejecuciones de n8n considerando que pueden contener datos financieros.
- **Tareas humanas:** entregar instrucciones concretas para credenciales, permisos, configuración inicial, restauración y solicitudes a plataforma. Usar el tracker Markdown local ya configurado, con un archivo por tarea. El responsable operativo permanente sigue pendiente de confirmar.

## Testing Decisions

- **Punto de validación confirmado por el usuario:** una ejecución del pipeline y el comportamiento observable del dashboard/API. Reutilizar pruebas existentes, sin crear una base temporal ni ejecutar pruebas destructivas sobre la base oficial.
- Un buen test comprueba un resultado visible: respuesta HTTP, contenido servido, estado de entrega, conservación de datos o rechazo de una conexión no permitida. Evitar pruebas que solo reproduzcan la estructura del YAML o detalles internos del código.
- Reutilizar las pruebas existentes del backend y de entrega del dashboard para rutas, salud, estados vacíos, interfaz, módulos y cierre del proceso. Ejecutar la suite existente y el lint del front; incluir en la imagen los módulos y CSS que consume el navegador. Mantener las verificaciones de reglas de negocio que puedan ejecutarse sin infraestructura nueva.
- Las pruebas existentes de integración de base, SQL y bucle n8n usan contenedores locales en algunos casos. No copiarlas sin adaptación a un pod restringido ni afirmar cobertura equivalente si no se ejecutan. No crear una base temporal para esta entrega, conforme a la decisión del usuario.
- Comprobar en la entrega real que el dashboard y sus consultas responden desde la red autorizada, que no se activa demo involuntariamente y que Postgres y la administración permanente de n8n no quedan expuestos a los lectores.
- Comprobar las conexiones permitidas y denegadas por las políticas de red mediante verificaciones no destructivas autorizadas. Distinguir aislamiento entre pods del acceso a través de ingress.
- Comprobar que un fallo previo al rollout impide promover la nueva imagen y deja una ejecución diagnosticable. No provocar fallos de migración deliberados contra la base oficial.
- Verificar historial de migraciones y ausencia de reaplicación de versiones ya registradas, sin reinicializar ni borrar datos. La validación de transformaciones complejas queda limitada al no disponer de una base aislada; debe constar en cada cambio que la necesite.
- Comprobar conservación del histórico en la migración inicial y persistencia de configuración tras actualizaciones controladas. La aceptación funcional del ETL después de importar y configurar el workflow corresponde a la etapa posterior del usuario.
- Verificar el procedimiento de restauración mediante una ejecución segura y acordada. Si requiere infraestructura temporal adicional, tratarla como dependencia pendiente de acordar; no afirmar que RPO/RTO están cumplidos sin evidencia ni sobrescribir la base oficial para probarlos.
- Registrar qué se ejecutó, qué pasó y qué no pudo comprobarse. No prometer servicio disponible durante un rollout ni aislamiento de Internet basándose únicamente en que los manifiestos fueron aceptados.

## Out of Scope

- Autenticación corporativa en la aplicación y control de acceso por usuario; quedan para futuros releases.
- Publicación del dashboard, n8n, Postgres o un receptor adicional en Internet.
- Cambios funcionales, programación horaria, automatización de cargas o configuración de credenciales del workflow en esta entrega; el usuario lo hará después.
- Publicación del agente conversacional incluido en el export de n8n.
- Copia automática de las credenciales o del estado completo de la instancia local de n8n.
- Entorno permanente adicional de pruebas y base temporal de integración.
- Alertas por correo y exigencia de disponibilidad 24/7 o alta concurrencia.
- Cambios de reglas financieras y reconstrucción de histórico que no exista en los datos de origen.
- Recuperar el ETL Python o los exports antiguos retirados del proyecto.
- Actualizaciones implícitas de versión del motor Postgres o de n8n en cada cambio del dashboard/API.
- Cambios destructivos de esquema sin procedimiento específico de intervención y recuperación.

## Further Notes

La especificación no implica que los recursos ya se hayan creado ni que el
despliegue se haya ejecutado. Hasta ahora se inspeccionaron el repositorio y
metadatos de la consola; no se desplegó la aplicación ni se migraron datos.

Dependencias abiertas que debe resolver la implementación antes de afirmar que
el CI/CD está operativo:

1. Ubicación soportada para construir en este tenant y permisos efectivos para desplegar en runtime-int.
2. Integración corporativa que permita recibir eventos de GitHub sin ampliar la exposición acordada.
3. Acceso al registro corporativo, imágenes admitidas, cuotas, almacenamiento, CA y salidas de red necesarias.
4. Mecanismo de secretos y permisos de las identidades de ejecución.
5. Origen concreto y acceso controlado al histórico que se migrará.
6. Destino y retención de backups, recuperación de la clave de n8n y evidencia de restauración.
7. Responsable operativo permanente. La lista de tareas humanas vive en este tracker local.

Referencias consultadas:

- [Registro de acuerdos de la conversación](../../docs/DESPLIEGUE_OPENSHIFT.md).
- [Guía inicial corporativa](https://source.redhat.com/departments/strategy_and_operations/it/datacenter_infrastructure/itcloudservices/itocp/itocp_wiki/getting_started_guide_to_managed_platform_plus).
- [Construcción y despliegue en ITOCP](https://source.redhat.com/departments/strategy_and_operations/it/datacenter_infrastructure/itcloudservices/itocp/itocp_wiki/building_and_deploying_in_itocp_platforms).
- [Soporte y escalamiento](https://source.redhat.com/departments/strategy_and_operations/it/datacenter_infrastructure/itcloudservices/itocp/itocp_wiki/support).

La configuración existente se conserva: [issue tracker](../../docs/agents/issue-tracker.md),
[triage](../../docs/agents/triage-labels.md) y [dominio](../../docs/agents/domain.md).
No hace falta repetir el setup ni crear issues en GitHub.

ADRs vigentes: [Proyectado](../../docs/adr/0001-backlog-proyectado-toda-la-vida.md),
[Backlog continuo](../../docs/adr/0002-backlog-continuo-entre-anios.md) e
[identidad por Project ID](../../docs/adr/0003-identidad-por-project-id.md).
La migración de identidad requiere respaldo previo y verificación local conforme
al ADR 0003; no se considera satisfecha por ejecutar automáticamente el Job.
Esto no autoriza crear una base temporal nueva. Si falta evidencia de esa
verificación local, queda como prerrequisito de la promoción a OpenShift.

## Implementation Issues

1. [Resolver los prerrequisitos de plataforma](issues/01-prerrequisitos-plataforma.md).
2. [Consultar el dashboard interno con Postgres](issues/02-dashboard-interno.md).
3. [Respaldar y recuperar la base financiera](issues/03-backup-financiero.md).
4. [Consultar el histórico existente en OpenShift](issues/04-historico-consultable.md).
5. [Administrar n8n temporalmente y conservar su estado](issues/05-n8n-interno.md).
6. [Actualizar la aplicación mediante un pipeline bajo demanda](issues/06-pipeline-bajo-demanda.md).
7. [Activar automáticamente el pipeline desde GitHub](issues/07-webhook-corporativo.md).
8. [Cerrar la entrega operativa](issues/08-entrega-operativa.md).
