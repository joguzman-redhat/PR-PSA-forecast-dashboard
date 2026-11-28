# 05: Administrar n8n temporalmente y conservar su estado

**What to build:** Instalar n8n nuevo y persistente, con conexión interna a Postgres y acceso administrativo temporal por port-forward. Preservar y documentar recuperación del estado y clave; el usuario configura credenciales e importa el workflow después.

**Blocked by:** 02.

**Status:** resolved

- [x] Versión fija verificable, UID arbitrario y volúmenes escribibles.
- [x] Sin Route administrativa permanente ni copia automática de secretos locales.
- [x] Port-forward autenticado abre acceso y cerrarlo lo elimina.
- [x] Políticas permiten conexiones y DNS necesarios; egress corporativo documentado.
- [x] Estado y clave de cifrado recuperables, con procedimiento de respaldo/restauración.
- [x] No modificar lógica, frecuencia ni promoción automática del workflow.

## Comments

Spec: [Despliegue oficial](../spec.md).

## Answer

n8n 2.48.8 por digest corporativo, PVC y clave propios; sin Route. Port-forward autenticado probado. Backup coherente con pausa limitada y recuperación 1/1, S3 cifrado, descarga/hash y contenido SQLite+clave verificados. Cron 12h activo. El usuario configura workflow/credenciales después; no se modificó el workflow.

Evidencia: [Estado del despliegue](../../../openshift/ESTADO-DESPLIEGUE.md).
