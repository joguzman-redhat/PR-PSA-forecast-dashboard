# Prerrequisitos del despliegue oficial

Este documento es un registro de comprobación, no una autorización para
desplegar. La aplicación tiene como destino
`nola-consulting-services-tenant--runtime-int` en `prod-scale-spoke1-dc-rdu3`.
La ubicación permitida para construir se determina por separado.

## Estado de evidencia

| Capacidad | Evidencia disponible | Falta para habilitar la entrega |
| --- | --- | --- |
| Destino de ejecución | `--runtime-int` confirmado con tipo runtime; la sesión de usuario puede crear Deployments, Services, PVC, ConfigMaps, Jobs, Routes, ServiceAccounts y NetworkPolicies, y actualizar Deployments | Permisos de las identidades de despliegue y admisión efectiva de pods/volúmenes |
| Namespace de construcción | `--pipeline` con tipo build; permisos de usuario para crear Pipelines, Tasks y PipelineRuns | Confirmar build soportado, identidad de ejecución y SCC; un permiso de usuario no acredita admisión del build |
| Tekton | APIs consultables y permisos de usuario verificados; reconciliación 1.20.5 en las etiquetas de namespace | Pipeline real con identidad y herramientas admitidas; no se ejecutó ningún build |
| Registro | Registro corporativo documentado y existencia de `images-paas-push-config` comprobada por nombre/tipo, sin leer su valor | Repositorio exacto del tenant, identidad autorizada y comprobación real de push/pull; la existencia del Secret no la sustituye |
| Integración de credenciales | La guía limita la integración de CI/CD con TenantCredentialManagement a preprod y depreca linkToClusters | Procedimiento corporativo actual admitido para este tenant y clúster |
| Eventos GitHub | Se acordó preferir webhook corporativo sin publicar un receptor adicional | Receptor/relay soportado, ruta de entrega, permisos y validación de autenticidad |
| Ingress | TenantNamespace de build y runtime declaran zona de seguridad internal y estado Ready | Configuración de Route/router y comprobación de acceso efectivo, incluida evidencia desde fuera de la VPN |
| Almacenamiento | AppCode `NLFC-001` aportado por el usuario; clases reales consultadas y cuota de almacenamiento restringido disponible | Validación del AppCode y clase apropiada por plataforma; admisión y aprovisionamiento de PVC todavía no comprobados |
| Red de pods | La política existente `internal-1` selecciona todos los pods, permite comunicación intra-namespace, egress a `0.0.0.0/0` e ingress desde router interno, rango corporativo y namespaces de infraestructura | Método soportado para refinar esa base: las NetworkPolicies se suman y una nueva política restrictiva no elimina los permisos existentes |
| Secretos | Se acordó no guardar valores en Git ni logs | Mecanismo corporativo, identidades y procedimiento de carga y recuperación |
| Backups | RPO 24 horas; RTO 4 horas en horario laboral. Storage Offerings indica que los backups de volúmenes de plataforma no están disponibles en ITUP | Solución de backup de aplicación y destino independiente del volumen de trabajo, retención, permisos y restauración segura demostrada |
| Histórico | Se acordó preservar Snapshots, identidad y reglas vigentes | Origen autorizado, estado de esquema y evidencia de validación local exigida por ADR 0003 |
| Operación | No se requieren correos ni servicio 24/7 | Responsable operativo permanente y procedimiento de revisión de fallos |

La evidencia combina inspección autenticada de consola y consultas CLI de solo
lectura. La sesión de usuario se autenticó mediante el flujo web corporativo
PKCE con el cliente oficial `oc` 4.21. No se versionó el kubeconfig ni se leyeron
valores de secretos. No se crearon recursos ni se ejecutaron builds.

El usuario proporcionó el AppCode `NLFC-001`; no se validó su registro en CMDB
ni se probó admisión de almacenamiento. La ausencia de una etiqueta AppCode en
el namespace no demuestra su ausencia o invalidez.

Las clases observadas son `aws-s3`, `rh-restricted-iscsi`,
`rh-restricted-iscsi-economy`, `rh-restricted-nfs`,
`rh-restricted-nfs-economy`, `static-block-storage` y `static-file-storage`.
`rh-restricted-iscsi` declara provisionador `csi.trident.netapp.io`, formato
`ext4`, clasificación restricted y política de reclaim `Delete`. Esa información
no demuestra disponibilidad de un volumen ni respaldo: no elegir una clase solo
porque aparece en la lista.

Las cuotas compartidas consultadas estaban sin uso: 25 PVC y 500 GiB de
almacenamiento restringido; para cargas no terminantes, requests de 32 CPU/64 GiB
y limits de 64 CPU/128 GiB; para terminantes, requests de 8 CPU/8 GiB y limits de
32 CPU/16 GiB. Son observaciones puntuales, no una reserva de recursos. Comparar
siempre las solicitudes con el consumo actual antes de desplegar.

La política `internal-1` permite por defecto más comunicación de la que necesita
la aplicación. Agregar una política de denegación o de permisos mínimos no
revoca las reglas de esa política: el resultado es aditivo. No modificar ni
borrar la política existente sin el procedimiento soportado por plataforma.
La lectura de configuración global de ingress y de recursos Tenant fue
denegada a esta cuenta. Sí se pudieron leer los TenantNamespace del namespace
de configuración: build y runtime declaran `network.security-zone=internal`,
`rbac=all` y estado Ready. Esto confirma la configuración interna del tenant,
pero no demuestra por sí solo el acceso efectivo de una Route futura desde
fuera de la VPN. La política `internal-1` tiene managedFields con manager
`manager`; no se ha cambiado ni borrado.

Los RoleBindings del namespace build incluyen `openshift-pipelines-edit`
(rol edit) y `pipelines-scc-rolebinding` (pipelines-scc-clusterrole); los
administradores del tenant disponen de tenant-egress-admin. Son evidencia de
configuración, no de la admisión de una imagen o identidad concreta. La API de
Repositories de Pipelines as Code está disponible y su listado estaba vacío:
no hay una integración GitHub configurada que podamos dar por operativa.
La descripción de `TenantEgress.spec` ofrece destinos por nombre DNS, CIDR o
selector de nodos, puertos y tipo; su listado en configuración estaba vacío.
La API advierte que TenantNamespaceEgress ya no está soportado ni tiene efecto,
y que debe usarse TenantEgress. No aplicar el recurso antiguo. La existencia
del esquema TenantEgress es una opción por verificar con plataforma, no prueba
que resuelva el ingress o el tráfico intra-namespace de `internal-1`. No se
aplicó ningún recurso de egress.

La página antigua de Secrets and Routes Encryption enlazada desde la guía
inicial está archivada desde agosto de 2021: no usar sus ejemplos como autoridad
actual para el diseño de ingress o cifrado. Consultar el procedimiento vigente.

## Diagnóstico de solo lectura

El cliente `oc` debe obtenerse de la distribución oficial de OpenShift que
indique la consola y el usuario debe completar el inicio de sesión corporativo.
Completar el flujo web que ofrece el cliente y usar un kubeconfig privado del
propio usuario, fuera del repositorio. No pegar tokens en un chat, un archivo
versionado o una línea de comandos compartida. No leer `infra/.env`, que está
fuera de límites en este repositorio.

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

1. Confirmar ejecución de builds con la identidad concreta del pipeline en
   este namespace build. Los permisos de creación de la cuenta ya se verificaron,
   pero faltan SCC/admisión, herramientas admitidas, repositorio Quay exacto,
   identidad de push/pull y alternativa vigente a linkToClusters. Aceptación:
   procedimiento soportado, permisos mínimos y comprobación de push/pull. No
   basta con que exista `images-paas-push-config`.
2. Confirmar cómo entregar eventos de este repositorio GitHub a un receptor
   interno sin exponer otro endpoint de la aplicación a Internet. Aceptación:
   mecanismo corporativo identificado, evento de prueba entregado, autenticidad
   verificable y filtro por repositorio/main. Si no existe, presentar al usuario
   polling o una excepción de exposición; ninguna está aprobada.
3. Confirmar qué selección/configuración garantiza ingress exclusivamente
   corporativo y cómo verificar el acceso desde fuera de la VPN; la cuenta no
   puede leer la configuración global. Pedir además el procedimiento soportado
   para refinar la política base `internal-1` sin modificarla/borrarla por cuenta
   propia. Aceptación: preservar ingress del router interno, restringir de forma
   efectiva las conexiones entre componentes y el egress, y demostrar conexiones
   permitidas/denegadas. Una NetworkPolicy adicional restrictiva por sí sola no
   cumple ese criterio mientras la base siga permitiéndolas. Verificar el uso de
   TenantEgress para las salidas; TenantNamespaceEgress ya no tiene efecto según
   la advertencia de la API. Esa opción no resuelve por sí sola el aislamiento
   entre componentes del mismo namespace.
4. Validar el AppCode aportado `NLFC-001`, confirmar la StorageClass adecuada
   entre las clases reales de RDU3 y definir un destino independiente de backup
   de aplicación con retención y permisos. La guía no ofrece backups de
   volúmenes en ITUP: definir backup a nivel de aplicación. Aceptación: acceso,
   capacidad, retención y procedimiento de recuperación segura; un PVC adicional
   en el mismo dominio de fallo no demuestra por sí solo recuperación.
5. Confirmar procedimiento corporativo para cargar/rotar secretos y recuperar la
   clave de n8n sin publicarla. Aceptación: mecanismo y responsables definidos,
   sin solicitar tokens amplios antes de elegir la integración.

## Registro de verificación

La primera ejecución local terminó con código 2 porque el cliente no estaba
instalado. Posteriormente el agente principal obtuvo el cliente oficial,
completó la autenticación web y ejecutó el diagnóstico real contra el API
esperado el 27 de noviembre de 2026 en horario de Bogotá. Terminó con código 3;
las comprobaciones de permisos de esa versión no reportaron denegaciones.

La revisión detectó que los permisos de logs y port-forward deben consultarse
con `--subresource=log` y `--subresource=portforward`, respectivamente, para no
interpretarlos como nombres de pods. La implementación corregida usa esos
argumentos explícitos y limita también `whoami --show-server` a 15 segundos.
La repetición corregida terminó el 27 de noviembre de 2026 a las 20:30 de
Bogotá (28 de noviembre, 01:30 UTC), con código 3 y cero comprobaciones de
permisos denegadas o no verificables. El resultado no acredita preparación
operativa: persisten las dependencias de la matriz.

No se añadió una prueba automatizada con mocks de `oc`: el punto de validación
acordado es el pipeline y el comportamiento HTTP, no un simulador de la CLI.
Se verificaron sintaxis Bash, ayuda oficial del cliente para los subrecursos y
enlaces Markdown locales. No se leyó `infra/.env`, kubeconfig ni valores de
Secrets. No se ha demostrado todavía la admisión real, el push/pull, el webhook,
el aislamiento completo de red o la recuperación. El ticket 01 sigue pendiente.

## Referencias

- [Spec y dependencias abiertas](../.scratch/despliegue-openshift/spec.md).
- [Guía inicial corporativa](https://source.redhat.com/departments/strategy_and_operations/it/datacenter_infrastructure/itcloudservices/itocp/itocp_wiki/getting_started_guide_to_managed_platform_plus).
- [Construcción y despliegue](https://source.redhat.com/departments/strategy_and_operations/it/datacenter_infrastructure/itcloudservices/itocp/itocp_wiki/building_and_deploying_in_itocp_platforms).
- [Storage Offerings, actualizado el 25 de noviembre de 2026](https://source.redhat.com/departments/strategy_and_operations/it/datacenter_infrastructure/itcloudservices/itocp/itocp_wiki/storage_offerings).
- [Secrets and Routes Encryption, archivado; referencia histórica](https://source.redhat.com/departments/strategy_and_operations/it/datacenter_infrastructure/itcloudservices/itocp/managedplatformplushub/mppluswiki/secrets_and_routes_encryption).
- [Soporte](https://source.redhat.com/departments/strategy_and_operations/it/datacenter_infrastructure/itcloudservices/itocp/itocp_wiki/support).
