// Acceso a la API y traduccion de nombres. Es el unico modulo del front que
// conoce los nombres con que la API entrega el dinero de cada proyecto; el
// resto del front usa el vocabulario de GLOSSARY.md.

// El backend sirve el dashboard y la API desde el mismo origen, asi que la
// ruta es relativa: no hay CORS ni host que configurar.
const API = './api';

// Nombre de la API -> termino del glosario, para los campos de dinero de las
// filas de backlog.
const NOMBRES_DINERO = {
  valor_of: 'booking',
  acumulado_a_fecha: 'ejecutado',
  total_ejecutado_acumulado: 'proyectado',
};

/**
 * Renombra en la fila, sin copiarla, los campos de dinero al vocabulario del
 * glosario. Es idempotente: una fila ya traducida no cambia. acum_2025 era el
 * nombre anterior de acumulado_anterior y solo se usa si este no viene.
 */
export function traducirFilaBacklog(fila) {
  for (const [antiguo, nuevo] of Object.entries(NOMBRES_DINERO)) {
    if (antiguo in fila) {
      fila[nuevo] = fila[antiguo];
      delete fila[antiguo];
    }
  }
  if ('acum_2025' in fila) {
    fila.acumulado_anterior ??= fila.acum_2025;
    delete fila.acum_2025;
  }
  return fila;
}

/** Trae el timeline consolidado (respeta ?desde y ?hasta de la URL) ya traducido. */
export async function obtenerTimeline() {
  const url = new URLSearchParams(location.search);
  const params = new URLSearchParams();
  for (const k of ['desde','hasta']) if (url.has(k)) params.set(k,url.get(k));
  const resp = await fetch(`${API}/timeline?${params}`, {cache:'no-store'});
  const datos = await resp.json();
  if (!resp.ok) throw new Error(datos.error || 'No se pudo cargar el timeline');
  datos.backlog?.forEach(traducirFilaBacklog);
  return datos;
}
