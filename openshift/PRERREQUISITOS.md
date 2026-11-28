# Prerrequisitos del despliegue oficial

Este documento es un registro de comprobación, no una autorización para
desplegar. La aplicación tiene como destino
`nola-consulting-services-tenant--runtime-int` en `prod-scale-spoke1-dc-rdu3`.
La ubicación permitida para construir se determina por separado.

## Estado de evidencia

| Capacidad | Evidencia disponible | Falta para habilitar la entrega |
| --- | --- | --- |
| Destino de ejecución | Confirmado por el usuario: `--runtime-int`; la inspección posterior de consola verificó `namespace-type=runtime` | Permisos efectivos y política de admisión para las identidades que desplegarán |
| Namespace de construcción | La inspección de consola de la conversación mostró `--pipeline` con etiqueta `namespace-type=build` | Confirmar build soportado en este clúster, SCC, cuotas y credenciales de registro |
| Tekton | La consola mostró la sección Pipelines y etiquetas de reconciliación | Consultar APIs y permisos; la presencia de un menú no acredita ejecución |
| Registro | La guía corporativa consultada prescribe `images.paas.redhat.com` | Repositorio del tenant, credenciales mínimas y comprobación efectiva de push/pull |
| Integración de credenciales | La guía limita la integración de CI/CD con TenantCredentialManagement a preprod y depreca linkToClusters | Procedimiento corporativo actual admitido para este tenant y clúster |
| Eventos GitHub | Se acordó preferir webhook corporativo sin publicar un receptor adicional | Receptor/relay soportado, ruta de entrega, permisos y validación de autenticidad |
| Ingress | Solo se autorizó dashboard/API de lectura por red corporativa/VPN | Clase/configuración real de ingress y evidencia de que no es accesible desde Internet |
| Almacenamiento | La guía vigente de Storage Offerings exige AppCode propio para persistencia; la consola mostró runtime sin despliegues, pods, PVC o rutas y cuotas compartidas no agotadas | AppCode del servicio, StorageClass admitida en RDU3, acceso, capacidades y cuota efectiva |
| Egress | Se necesitan dependencias de build y servicios del workflow cuando se configure | Destinos, proxy/CA y políticas admitidas; no asumir que permitir 443 equivale a restringir destinos |
| Secretos | Se acordó no guardar valores en Git ni logs | Mecanismo corporativo, identidades y procedimiento de carga y recuperación |
| Backups | RPO 24 horas; RTO 4 horas en horario laboral. Storage Offerings indica que los backups de volúmenes de plataforma no están disponibles en ITUP | Solución de backup de aplicación y destino independiente del volumen de trabajo, retención, permisos y restauración segura demostrada |
| Histórico | Se acordó preservar Snapshots, identidad y reglas vigentes | Origen autorizado, estado de esquema y evidencia de validación local exigida por ADR 0003 |
| Operación | No se requieren correos ni servicio 24/7 | Responsable operativo permanente y procedimiento de revisión de fallos |

Las observaciones de consola fueron comunicadas por el agente principal que
realizó la inspección autenticada; no proceden de una ejecución del script.
No sustituyen la comprobación de permisos,
conectividad ni capacidades disponibles al desplegar.

La ausencia de AppCode entre las etiquetas visibles del namespace no demuestra
que el servicio no tenga uno. El usuario debe identificar el AppCode propio que
autoriza el almacenamiento. No copiar una clase NetApp o AWS de los ejemplos de
la guía sin confirmar su soporte en RDU3.

La página antigua de Secrets and Routes Encryption enlazada desde la guía
inicial está archivada desde agosto de 2021: no usar sus ejemplos como autoridad
actual para el diseño de ingress o cifrado. Consultar el procedimiento vigente.

## Diagnóstico de solo lectura

El cliente `oc` debe obtenerse de la distribución oficial de OpenShift que
indique la consola y el usuario debe completar el inicio de sesión corporativo.
No pegar tokens en un chat, un archivo versionado o una línea de comandos
compartida. No leer `infra/.env`, que está fuera de límites en este repositorio.

Desde la raíz del repositorio:

```bash
bash openshift/scripts/preflight.sh
```

El script verifica el servidor antes de consultar namespaces, comprueba la
autenticación y consulta exclusivamente nombres/metadatos y permisos. No imprime
kubeconfig ni valores de Secrets o ConfigMaps, no crea recursos y no modifica
el proyecto actual. Limita cada consulta a 15 segundos.

Sus códigos de salida son:

- `2`: falta cliente, autenticación, contexto esperado o se invocó incorrectamente.
- `3`: diagnóstico completado, con validaciones externas todavía pendientes.

**Nunca devuelve éxito operativo.** No usarlo como un gate verde de despliegue:
una comprobación de permisos no valida admisión, almacenamiento, imágenes,
conectividad o aislamiento. Una denegación puede indicar una capacidad que solo
pueda comprobar plataforma; no implica solicitar permisos de administrador.

Antes de adjuntar una salida a un ticket, revisar que no incluya metadatos
internos innecesarios. Mantener el informe en el tracker local.

Para cuotas y límites, una persona con permisos puede consultar los valores
sin leer secretos:

```bash
oc describe appliedclusterresourcequota nola-consulting-services-tenant--general -n nola-consulting-services-tenant--runtime-int
oc describe appliedclusterresourcequota nola-consulting-services-tenant--notterminating -n nola-consulting-services-tenant--runtime-int
oc describe appliedclusterresourcequota nola-consulting-services-tenant--terminating -n nola-consulting-services-tenant--pipeline
oc get storageclasses -o custom-columns=NAME:.metadata.name,PROVISIONER:.provisioner,VOLUMEBINDING:.volumeBindingMode
```

No cambiar permisos ni clases de almacenamiento a partir de una denegación.
Solicitar a plataforma la evidencia relevante si el usuario no puede leerla.
Los límites publicados se deben comparar con las solicitudes y el consumo
actual del tenant antes de decidir recursos; los nombres por sí solos no bastan.

## Solicitudes concretas si la evidencia no está disponible

Preparar estas preguntas para soporte de plataforma. **No se ha enviado ninguna
solicitud**; el usuario decide cuándo y por qué canal enviarla.

1. Confirmar si el namespace build de este tenant permite ejecutar Tekton/builds
   en el clúster de destino. Pedir imágenes de herramientas admitidas, SCC,
   autenticación del registro y alternativa actual a linkToClusters. Aceptación:
   procedimiento soportado identificable y permisos mínimos enumerados.
2. Confirmar cómo entregar eventos de este repositorio GitHub a un receptor
   interno sin exponer otro endpoint de la aplicación a Internet. Aceptación:
   mecanismo corporativo identificado, evento de prueba entregado, autenticidad
   verificable y filtro por repositorio/main. Si no existe, presentar al usuario
   polling o una excepción de exposición; ninguna está aprobada.
3. Confirmar ingress exclusivamente corporativo, salidas necesarias y mecanismo
   de políticas para el tenant. Aceptación: selección/configuración de ingress,
   controles de red admitidos y método para verificar acceso permitido/denegado.
4. Identificar el AppCode propio del servicio y confirmar StorageClass y destino
   de backup permitidos en RDU3. La guía de almacenamiento no ofrece backups de
   volúmenes en ITUP: definir backup a nivel de aplicación. Aceptación: acceso,
   capacidad, retención y procedimiento de recuperación segura; un PVC adicional
   en el mismo dominio de fallo no demuestra por sí solo recuperación.
5. Confirmar procedimiento corporativo para cargar/rotar secretos y recuperar la
   clave de n8n sin publicarla. Aceptación: mecanismo y responsables definidos,
   sin solicitar tokens amplios antes de elegir la integración.

## Registro de verificación local

La implementación inicial de este diagnóstico comprobó que en el entorno del
agente no estaban disponibles `oc`, `kubectl` ni el archivo kubeconfig por
defecto. No se leyó ningún contenido de kubeconfig ni de secretos. El script
se comprobó sintácticamente y se ejecutó en ese entorno: terminó con código 2
porque falta `oc`. No hubo consultas al clúster ni validación de red o webhook.

No se añadió una prueba automatizada con mocks de `oc`: el punto de validación
acordado es el pipeline y el comportamiento HTTP, no un simulador de la CLI.
La comprobación operativa requiere ejecutar las consultas reales autorizadas y
registrar la evidencia restante. Hasta entonces el ticket 01 permanece pendiente.

## Referencias

- [Spec y dependencias abiertas](../.scratch/despliegue-openshift/spec.md).
- [Guía inicial corporativa](https://source.redhat.com/departments/strategy_and_operations/it/datacenter_infrastructure/itcloudservices/itocp/itocp_wiki/getting_started_guide_to_managed_platform_plus).
- [Construcción y despliegue](https://source.redhat.com/departments/strategy_and_operations/it/datacenter_infrastructure/itcloudservices/itocp/itocp_wiki/building_and_deploying_in_itocp_platforms).
- [Storage Offerings, actualizado el 25 de noviembre de 2026](https://source.redhat.com/departments/strategy_and_operations/it/datacenter_infrastructure/itcloudservices/itocp/itocp_wiki/storage_offerings).
- [Secrets and Routes Encryption, archivado; referencia histórica](https://source.redhat.com/departments/strategy_and_operations/it/datacenter_infrastructure/itcloudservices/itocp/managedplatformplushub/mppluswiki/secrets_and_routes_encryption).
- [Soporte](https://source.redhat.com/departments/strategy_and_operations/it/datacenter_infrastructure/itcloudservices/itocp/itocp_wiki/support).
