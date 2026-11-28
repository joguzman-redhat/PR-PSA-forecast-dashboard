# Diseño del despliegue oficial en OpenShift

Estado: acuerdos publicados en [la especificación del tracker local](../.scratch/despliegue-openshift/spec.md).
Este registro conserva acuerdos y dependencias; no representa cambios ya
aplicados al clúster ni capacidades técnicas pendientes ya verificadas.

## Acuerdos confirmados

- La aplicación alojada en `prod-scale-spoke1-dc-rdu3` será la aplicación
  oficial de uso interno del departamento y seguirá evolucionando.
- El usuario confirma `nola-consulting-services-tenant--runtime-int` como
  namespace de destino de los componentes de la aplicación. La ubicación de
  recursos de construcción se verificará aparte según las reglas de plataforma.
- GitHub seguirá siendo el origen del código y `main` la rama de despliegue.
  Se requiere CI/CD para automatizar actualizaciones.
- El dashboard será el único acceso permanente desde fuera del clúster,
  limitado a la red corporativa/VPN, sin autenticación de aplicación en
  el primer release. El control de acceso por usuario queda para un release futuro.
- Postgres y n8n permanecerán internos. Se necesita un mecanismo temporal de
  administración de n8n para configuración y mantenimiento, que se cierre después.
- La imagen de n8n debe poder verificarse y actualizarse de forma controlada.
- Los cambios del workflow se guardarán en Git y se revisarán antes de
  incorporarlos al despliegue oficial; la imagen de n8n llevará una versión fija.
- La administración temporal usará `oc port-forward`, sujeto a permisos y
  compatibilidad. Una eventual necesidad de callback OAuth se resolverá aparte.
- Cada cambio integrado en `main` se desplegará automáticamente después de
  superar las pruebas y verificaciones, sin otra aprobación manual. Se aceptan
  protección de main, despliegues serializados y comprobación de salud.
- En esta entrega no se modificará la lógica del workflow ni se agregará
  programación horaria al ETL. El usuario configurará su funcionamiento tras
  desplegar n8n; su importación inicial será manual, a cargo del usuario.
- Objetivos iniciales aceptados: hasta 24 horas de pérdida de cambios (RPO)
  y recuperación en 4 horas durante horario laboral (RTO). Son objetivos por
  implementar y validar, no garantías actuales de la plataforma.
- Se conservará el histórico de Postgres mediante una migración inicial controlada.
- n8n tendrá una instalación nueva y persistente; el usuario configurará sus
  credenciales e importará el workflow existente después del despliegue.
- Las actualizaciones habituales del dashboard/API no actualizarán automáticamente
  las versiones de Postgres y n8n. Cambiar sus imágenes será una decisión explícita.
- El usuario delegó el diseño de las actualizaciones del esquema: se propone
  ejecutarlas automáticamente con migraciones SQL versionadas y un Job previo
  al rollout de la API, con historial, exclusión mutua y detención ante fallos.
  Se deberá reconciliar el esquema inicial con las migraciones existentes para
  evitar aplicar dos veces cambios ya incluidos en `01_schema.sql`.
- Se aceptan interrupciones planificadas de n8n y Postgres. El uso tiene pocos
  usuarios y poca concurrencia; no se exige disponibilidad 24/7. Se intentará
  mantener continuidad durante las actualizaciones habituales del dashboard/API.
- El formato de las tareas manuales se aclaró como una lista de pasos concretos;
  se usa el tracker Markdown local configurado en `docs/agents/issue-tracker.md`.
  El responsable operativo permanente sigue pendiente de confirmar.
- No se implementará ahora una base temporal de integración ni otro entorno
  permanente de pruebas. Se mantienen verificaciones del pipeline y detención
  ante fallos; no se ha aprobado probar migraciones contra datos oficiales como
  sustituto de validación aislada.
- No habrá avisos por correo en esta entrega. El usuario revisará los fallos;
  el estado y los registros de las ejecuciones deberán quedar consultables.
- El usuario prefiere evaluar un webhook de GitHub. El polling de cinco minutos
  fue una propuesta, no una decisión aceptada.
- Se confirma mantener el dashboard como único acceso desde fuera del clúster
  y buscar una integración corporativa para recibir eventos de GitHub. Si no
  existe una solución soportada, se presentarán las alternativas antes de
  elegir polling o una excepción para publicar un receptor técnico.
- Para la especificación, el usuario confirmó validar mediante una ejecución
  del pipeline y respuestas del dashboard/API, reutilizando pruebas existentes,
  sin crear una base temporal ni ejecutar pruebas destructivas sobre la base oficial.

## Distinciones pendientes de confirmar

- Sin autenticación, distribuir el enlace a pocas personas no impone una
  lista de lectores autorizados: cualquier persona con conectividad a la ruta
  podría consultar el dashboard y los endpoints de lectura que este necesita.
- El navegador necesita consultar la API. El diseño debe permitir esos
  endpoints bajo la ruta del dashboard y mantener fuera las operaciones
  administrativas. El código actual incluye un `POST /api/reload` sin autenticación.
- La versión de la imagen de n8n y la versión del workflow son distintas;
  la política de revisión se acordó, pero la promoción técnica queda por diseñar.
- El export incluye un agente conversacional privado. No se ha solicitado
  publicarlo ni se ha confirmado su inclusión en el primer release.

## Hechos verificados

- Dashboard y API se empaquetan juntos. Los manifiestos anteriores apuntan
  a `v2`, no a `main`.
- El ETL del export `n8n/n8n_nola_completo.json` ya implementa Drive → Postgres;
  actualmente se inicia con Manual Trigger.
- La API y la UI admiten una base con esquema pero sin cargas; muestran estado
  vacío y no activan datos de demostración automáticamente.
- El dashboard consulta `/api/timeline` sin caché HTTP; no necesita que n8n
  invoque `/api/reload` para consultar nuevas cargas. La página no se refresca
  periódicamente por sí sola.
- Existen migraciones en `infra/db/migraciones/`. No hay `oc`, `kubectl` ni
  contexto kubeconfig disponible en el entorno local inspeccionado inicialmente;
  ese estado debe volver a verificarse antes de operar el clúster.
- La revisión posterior confirmó configuración existente en `docs/agents/`,
  vocabulario en `GLOSSARY.md` y ADR 0001–0003. No se requiere repetir el setup
  ni publicar issues en GitHub: specs y tareas se guardan en `.scratch/`.
- El front actual usa módulos ES en `js/` y CSS separado. La imagen debe
  empaquetar estos assets actuales. La migración debe conservar identidad por
  Project ID, Snapshots, Backlog continuo y Proyectado parcial según los ADR.
- La consola mostró los proyectos del tenant
  `nola-consulting-services-tenant--config`, `--pipeline` y `--runtime-int`.
  La existencia del proyecto pipeline no prueba sus capacidades ni permisos.
- En los detalles de `--pipeline` se verificó la etiqueta
  `tenant.paas.redhat.com/namespace-type=build`, reconciliación de OpenShift
  Pipelines 1.20.5 y cuotas compartidas del tenant. Se consultaron metadatos;
  no se crearon recursos ni se inspeccionaron valores de Secrets.
- La guía corporativa indica soporte para GitLab CI y OpenShift Pipelines,
  deprecación de BuildConfig, registro soportado `images.paas.redhat.com` e
  integración de CI/CD con TenantCredentialManagement disponible en preprod.
  Hay que contrastar las restricciones con las capacidades del tenant actual.
- La guía describe Tekton EventListener y Route para recibir webhooks de
  GitLab. Eso no prueba conectividad desde GitHub.com a las rutas internas;
  no se ha confirmado un intermediario corporativo ni autorizado exposición pública.

## Ramas abiertas del diseño

- Verificación del acceso exclusivamente interno y de los endpoints de lectura.
- Validación técnica de persistencia de n8n y de actualizaciones por componente.
- Actualización de caché y frescura del dato; programación del ETL diferida al usuario.
- Alcance de las verificaciones sin base temporal y estrategia de reversión.
- Ejecución y comprobación de la migración inicial del histórico financiero.
- Disponibilidad, backups, restauración, monitoreo y responsables.
- Capacidad de build, cuotas, almacenamiento, ingress interno, egress y secretos.
- Webhook de GitHub: verificar conectividad e integración corporativa antes
  de elegir el receptor. No exponerlo públicamente sin una decisión explícita.
- Ejecutar las tareas de [despliegue](../.scratch/despliegue-openshift/spec.md#implementation-issues)
  y completar los [pasos humanos](../.scratch/despliegue-openshift/issues/09-acciones-humanas.md)
  cuando se verifiquen las dependencias de plataforma.

## Referencias

- [Guía inicial de la plataforma](https://source.redhat.com/departments/strategy_and_operations/it/datacenter_infrastructure/itcloudservices/itocp/itocp_wiki/getting_started_guide_to_managed_platform_plus)
- [Construcción y despliegue](https://source.redhat.com/departments/strategy_and_operations/it/datacenter_infrastructure/itcloudservices/itocp/itocp_wiki/building_and_deploying_in_itocp_platforms)
- [Soporte y escalamiento](https://source.redhat.com/departments/strategy_and_operations/it/datacenter_infrastructure/itcloudservices/itocp/itocp_wiki/support)
