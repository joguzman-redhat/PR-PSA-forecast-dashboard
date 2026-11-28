# 05: Administrar n8n temporalmente y conservar su estado

**What to build:** Instalar n8n nuevo y persistente, con conexión interna a Postgres y acceso administrativo temporal por port-forward. Preservar y documentar recuperación del estado y clave; el usuario configura credenciales e importa el workflow después.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] Versión fija verificable, UID arbitrario y volúmenes escribibles.
- [ ] Sin Route administrativa permanente ni copia automática de secretos locales.
- [ ] Port-forward autenticado abre acceso y cerrarlo lo elimina.
- [ ] Políticas permiten conexiones y DNS necesarios; egress corporativo documentado.
- [ ] Estado y clave de cifrado recuperables, con procedimiento de respaldo/restauración.
- [ ] No modificar lógica, frecuencia ni promoción automática del workflow.

## Comments

Spec: [Despliegue oficial](../spec.md).
