# 07: Activar automáticamente el pipeline desde GitHub

**What to build:** Conectar el webhook corporativo resuelto en prerrequisitos al pipeline para que cambios válidos de main desplieguen automáticamente sin publicar accesos adicionales.

**Blocked by:** 06.

**Status:** needs-info

- [ ] Validar firma/autenticidad, repositorio, evento, main y commit exacto.
- [ ] Rechazar eventos no autorizados y no ejecutar campos arbitrarios.
- [ ] Reintentos o duplicados no provocan promociones fuera de orden.
- [ ] Demostrar evento real hasta resultado del pipeline sin ampliar exposición.
- [ ] Si la integración soportada no existe, mantener pendiente y presentar alternativas al usuario.

## Comments

Spec: [Despliegue oficial](../spec.md).

## Actualización verificada

No hay receptor corporativo/webhook configurado. Argo central rechazó alta del repositorio. Usuario eligió registrar él mismo AppProject/Application preparados; esto no sustituye el trigger de build ni el commit del digest a Git.

Evidencia: [Estado del despliegue](../../../openshift/ESTADO-DESPLIEGUE.md).
