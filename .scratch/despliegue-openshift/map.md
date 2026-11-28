# Implementación del despliegue oficial

Spec: [Despliegue oficial](spec.md).
Rama de integración: `codex/openshift-integracion`.

## Notes

Desglose de ocho entregas aprobado por el usuario. Bloqueos en cada ticket.
Los criterios operativos requieren evidencia del clúster; preparar código no los resuelve.

## Decisions-so-far

- Mantener configuración local del tracker y los ADR vigentes.
- Validar por pipeline y dashboard/API, sin nueva base temporal.

## Fog

- Webhook corporativo y permisos efectivos por comprobar.
- Destino de backups, origen del histórico y responsable por confirmar.

## Tickets

1. [Resolver los prerrequisitos de plataforma](issues/01-prerrequisitos-plataforma.md).
2. [Consultar el dashboard interno con Postgres](issues/02-dashboard-interno.md).
3. [Respaldar y recuperar la base financiera](issues/03-backup-financiero.md).
4. [Consultar el histórico existente en OpenShift](issues/04-historico-consultable.md).
5. [Administrar n8n temporalmente y conservar su estado](issues/05-n8n-interno.md).
6. [Actualizar la aplicación mediante un pipeline bajo demanda](issues/06-pipeline-bajo-demanda.md).
7. [Activar automáticamente el pipeline desde GitHub](issues/07-webhook-corporativo.md).
8. [Cerrar la entrega operativa](issues/08-entrega-operativa.md).
