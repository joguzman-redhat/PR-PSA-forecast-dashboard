# Implementación del despliegue oficial

Spec: [Despliegue oficial](spec.md).
Rama de integración: `codex/openshift-integracion`.

## Notes

Desglose de ocho entregas aprobado por el usuario. Bloqueos en cada ticket.
Los criterios operativos requieren evidencia del clúster; preparar código no los resuelve.

## Decisions-so-far

- Mantener configuración local del tracker y los ADR vigentes.
- Validar por pipeline y dashboard/API, sin nueva base temporal.
- El usuario autorizó probar CI manual antes de resolver toda la entrega:
  `forecast-ci-prueba-mfjnj` arrancó en el namespace build y falló al conectar
  por HTTPS a GitHub. No ejecutó tests ni tocó Postgres.
- El usuario indicó usar Argo CD para CD. Investigar su incorporación al tenant;
  no tratar webhook externo como prerrequisito de sincronización GitOps.
- Se identificó `TenantEgress/default` en el namespace de build; la consulta
  anterior en `--config` no describía su egress efectivo. Parche limitado
  GitHub/npm validado en dry-run, rechazado en aplicación por revisión automática:
  requirió aprobación explícita del usuario por su alcance persistente.
- El usuario aprobó el egress limitado y se aplicó con las reglas previas y
  Deny final conservados. `egressReady=true`. La ejecución `forecast-ci-prueba-rbknc`
  clonó main, commit `ccbdcaf67fd6f4636b81feac59914cb6d58a319a`, pero falló por
  falta de lockfile. Ese main tampoco define test/lint; integrar primero los
  cambios versionados de la rama de trabajo, sin omitir verificaciones.

Evidencia y comandos: [Prueba manual de CI](../../openshift/ci/README.md).
- AppCode aportado por el usuario: `NLFC-001`; validación de CMDB/admisión pendiente.
- [Diagnóstico y evidencia de plataforma](../../openshift/PRERREQUISITOS.md):
  sesión corporativa autenticada y preflight corregido ejecutado; cero permisos
  denegados, salida 3 porque no acredita preparación operativa.
- TenantNamespace build/runtime con zona internal y Ready; confirmar acceso
  efectivo de ingress además de la configuración declarada.

## Fog

- Webhook corporativo sin integración configurada; Repositories de Pipelines as Code vacío.
- Identidad de build, repositorio y push/pull de registro; AppCode y admisión de almacenamiento.
- Método soportado para refinar `internal-1`: las políticas son aditivas y la
  base permite tráfico amplio. No modificar/borrar esa política por cuenta propia.
- Destino de backups de aplicación (sin backups de volumen de plataforma ITUP),
  origen del histórico y responsable por confirmar.

## Tickets

1. [Resolver los prerrequisitos de plataforma](issues/01-prerrequisitos-plataforma.md).
2. [Consultar el dashboard interno con Postgres](issues/02-dashboard-interno.md).
3. [Respaldar y recuperar la base financiera](issues/03-backup-financiero.md).
4. [Consultar el histórico existente en OpenShift](issues/04-historico-consultable.md).
5. [Administrar n8n temporalmente y conservar su estado](issues/05-n8n-interno.md).
6. [Actualizar la aplicación mediante un pipeline bajo demanda](issues/06-pipeline-bajo-demanda.md).
7. [Activar automáticamente el pipeline desde GitHub](issues/07-webhook-corporativo.md).
8. [Cerrar la entrega operativa](issues/08-entrega-operativa.md).
