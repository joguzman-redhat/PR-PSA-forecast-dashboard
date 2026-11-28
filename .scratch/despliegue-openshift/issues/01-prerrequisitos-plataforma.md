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
[Prerrequisitos](../../../openshift/PRERREQUISITOS.md). El cliente `oc` no está
disponible en el entorno local inspeccionado; la ejecución del diagnóstico termina
con código 2 y no consulta el clúster. Sintaxis Bash verificada.

No se cierra este ticket como `resolved`: falta identificar el AppCode propio
exigido para almacenamiento persistente, verificar las capacidades y permisos
reales del build, elegir una clase soportada en RDU3, resolver el webhook
corporativo y acordar un destino de backup de aplicación. La guía vigente indica
que ITUP no ofrece backups de volúmenes de plataforma. El agente principal
registró observaciones autenticadas de consola, pero esas observaciones no
demuestran los prerrequisitos restantes.
