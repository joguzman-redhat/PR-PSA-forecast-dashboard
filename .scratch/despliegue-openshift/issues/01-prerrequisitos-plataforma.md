# 01: Resolver los prerrequisitos de plataforma

**What to build:** Determinar con evidencia dónde construir, cómo desplegar a runtime-int y qué integración corporativa permite recibir eventos de GitHub. Entregar pasos concretos para permisos, registro, almacenamiento, ingress interno, egress y secretos; no exponer otro receptor ni habilitar polling sin decisión del usuario.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Registrar capacidades verificadas y restricciones pendientes con fuentes.
- [ ] Resolver o documentar como dependencia externa el mecanismo corporativo de webhook.
- [ ] Separar el namespace de build del destino runtime-int.
- [ ] Preparar comandos de diagnóstico y solicitudes humanas concretas sin enviar mensajes a terceros.
- [ ] No leer infra/.env ni valores de Secrets.

## Comments

Spec: [Despliegue oficial](../spec.md).
