# 01: Resolver los prerrequisitos de plataforma

**What to build:** Determinar con evidencia dónde construir, cómo desplegar a runtime-int y qué integración corporativa permite recibir eventos de GitHub. Entregar pasos concretos para permisos, registro, almacenamiento, ingress interno, egress y secretos; no exponer otro receptor ni habilitar polling sin decisión del usuario.

**Blocked by:** None (can start immediately).

**Status:** needs-info

- [x] Registrar capacidades verificadas y restricciones pendientes con fuentes.
- [x] Resolver o documentar como dependencia externa el mecanismo corporativo de webhook.
- [x] Separar el namespace de build del destino runtime-int.
- [x] Preparar comandos de diagnóstico y solicitudes humanas concretas sin enviar mensajes a terceros.
- [x] No leer infra/.env ni valores de Secrets.

## Comments

Spec: [Despliegue oficial](../spec.md).

Diagnóstico de solo lectura y matriz de evidencia disponibles en
[Prerrequisitos](../../../openshift/PRERREQUISITOS.md). La ejecución inicial
terminó con código 2 por falta de cliente. Después se obtuvo `oc` oficial y se
completó la autenticación web corporativa. El diagnóstico corregido se ejecutó
contra el servidor esperado el 27 de noviembre de 2026 a las 20:30 de Bogotá:
código 3 y cero comprobaciones de permisos pendientes. Logs y port-forward se
consultan con subrecursos explícitos; todas las consultas tienen timeout.
Sintaxis Bash, ayuda del cliente y enlaces locales verificados.

El usuario aportó AppCode `NLFC-001`. Se verificaron tipos de namespace,
permisos de usuario para crear recursos de runtime/Tekton, cuotas disponibles,
clases de almacenamiento reales, existencia por nombre/tipo del Secret de push,
y zona internal y estado Ready en ambos TenantNamespace. No se leyeron valores
de secretos ni se crearon recursos.

No se cierra como `resolved`: faltan validación del AppCode y admisión de
almacenamiento, identidad y push/pull reales del build, webhook corporativo y
destino de backup de aplicación. La guía indica que ITUP no ofrece backups de
volúmenes de plataforma. Además `internal-1` permite comunicación intra-namespace
y egress amplio; una NetworkPolicy adicional no revoca esas reglas. Se requiere
un método soportado por plataforma para refinar la base, sin modificarla ni
borrarla por cuenta propia, y verificación efectiva de ingress interno.

Las solicitudes exactas y los criterios de aceptación están en el runbook de
prerrequisitos. No se enviaron solicitudes a terceros. Los tickets dependientes
siguen pendientes; no se declara el CI/CD ni el despliegue operativo.

## Actualización verificada

Admisión AppCode/PVC, registro corporativo, ingress interno, S3 y build reales confirmados. Pendientes externos: Argo central/webhook y refinamiento soportado de internal-1. No se envió ninguna solicitud a terceros.

Evidencia: [Estado del despliegue](../../../openshift/ESTADO-DESPLIEGUE.md).
