# Estándares de código

Solo reglas de criterio, las que ninguna herramienta comprueba. Lo mecánico ya
está automatizado; no lo repitas en una revisión: vocabulario del dominio
(`glosario.test.js`), imports (`npm run lint:front`), forma de los módulos
(`infra/api/test/modulos-front.js`).

## Módulos

- Un módulo cambia por una sola razón; si una modificación toca dos motivos distintos, divide el módulo.
- Una vista se consulta por el registro `js/vistas.js` cuando el que la llama no la conoce de antemano (navegación, render genérico); un módulo que depende de una función concreta la importa directamente.
- Un export nuevo nace con su importador; si nadie lo usa, no se exporta.

## Pruebas

- Una prueba verifica comportamiento externo (lo que ve el usuario o devuelve la función), no la forma interna de `ui.estado`.
- Un cambio de comportamiento llega con la prueba que lo habría detectado.

## Dinero y decisiones

- Toda cifra de dinero se deriva con las reglas de `docs/REGLAS_DE_DATOS.md` y los ADR de `docs/adr/`; ninguna se recalcula por otra vía.
- Un cambio de regla de cálculo se acompaña de un ADR nuevo y de la corrección de `docs/REGLAS_DE_DATOS.md`.
- Una decisión difícil de revertir y sorprendente para quien llega después lleva ADR.
