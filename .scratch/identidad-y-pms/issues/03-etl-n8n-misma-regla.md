# 03: ETL de n8n y herramienta del agente con la misma regla

**What to build:** el flujo de n8n guarda y busca proyectos con la misma regla de identidad (Project ID → PA → «sin identificar»): el nodo «Recalcular Columnas Rotas» y la clave con la que el ETL actualiza la tabla `proyecto`. La herramienta Postgres del agente de IA acepta PA o Project ID. El respaldo por nombre normalizado desaparece del flujo. Con esto la siguiente Ejecución no recrea el duplicado. Antes de afirmar algo sobre el flujo, leer la lista de nodos de `n8n/n8n_nola_completo.json`.

**Blocked by:** 01

**Status:** done

- [x] Prueba nueva (seam 3): el código del nodo de n8n que calcula la clave, evaluado en `vm`, da la misma clave que la función SQL con las mismas entradas
- [x] El export de n8n trae la regla nueva en el nodo y en la actualización de `proyecto`
- [x] La herramienta del agente devuelve el mismo proyecto buscando por PA o por Project ID
- [x] Documentado cómo importar el export al n8n local; la importación la confirma el usuario
- [x] `npm test` pasa
