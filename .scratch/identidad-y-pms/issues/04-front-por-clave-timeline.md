# 04: Front por clave del timeline

**What to build:** el front localiza cada proyecto solo por la clave del timeline que entrega la API. Se borran los respaldos por PA y por nombre y sus mapas, y se ajusta la prueba que aún los usa. El PA sigue visible en el listado, el detalle y los filtros; el detalle muestra también el Project ID, y los proyectos «sin identificar» llevan una marca visible. Lo que no cambia en pantalla debe seguir idéntico.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Prueba (seam 2): `backlogDe` y la carga de datos resuelven por clave del timeline, sin mapas por PA ni por nombre
- [ ] El PA se ve en el listado, el detalle y los filtros, y buscar por PA sigue funcionando
- [ ] El detalle muestra el Project ID junto al PA; «sin identificar» lleva marca visible
- [ ] `npm test`, `npm run lint:front` y `scripts/comparar-front.sh` pasan; la comparación solo difiere donde el cambio es intencional
- [ ] Verificado en un navegador según `docs/VERIFICAR_FRONT.md`
