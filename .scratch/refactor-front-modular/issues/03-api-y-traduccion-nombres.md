# 03: Acceso a la API y capa de traducción de nombres

**What to build:** La carga de datos y la conversión de nombres antiguos al vocabulario del glosario quedan en un solo módulo. Es el único lugar del front que conoce nombres como valor_of, acumulado_a_hoy o corte.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Ningún otro módulo usa nombres antiguos, solo vocabulario de GLOSSARY.md
- [ ] La suite de pruebas del front pasa completa
- [ ] El dashboard muestra las mismas cifras que antes
