// Reglas de filtrado: qué dimensiones se filtran y si un proyecto pasa cada
// filtro. Sin DOM de dropdowns ni render; la interfaz vive en filtros-ui.js.
import { estado } from './estado.js';
import { etiquetaPeriodoCalendario } from './calendario.js';
import { periodoFinProyecto, pasaPeriodoProyecto } from './vida-proyecto.js';

export const SIN_DATO = '(sin dato)';

// Dimensiones filtrables, en el orden en que aparecen en la barra.
export const DIMENSIONES = [
  { campo: 'estado', etiqueta: 'Estado' },
  { campo: 'cliente', etiqueta: 'Cliente' },
  { campo: 'pm_lider', etiqueta: 'PM/Líder' },
  { campo: 'vendedor', etiqueta: 'Vendedor' },
  { campo: 'tsm', etiqueta: 'TSM' },
  { campo: 'zona', etiqueta: 'Zona' },
  { campo: 'pais', etiqueta: 'País' },
  { campo: 'periodo_fin', etiqueta: 'Fecha finalización proyecto' },
  { campo: 'billing_type', etiqueta: 'Billing Type' },
  { campo: 'billing_arrangement', etiqueta: 'Billing Arrangement' },
  { campo: 'estado_contrato', etiqueta: 'Estado contrato' },
  { campo: 'riesgo', etiqueta: 'Riesgo' },
  { campo: 'executive_watchlist', etiqueta: 'Handover' },
  { campo: 'project_status', etiqueta: 'Project Status' },
];

// Muchos campos vienen nulos por los errores del Excel. En vez de esconder
// esos proyectos, se agrupan bajo una opción propia: "no sabemos" también
// es una respuesta que el negocio necesita poder filtrar.
export function valorDimension(proyecto, campo) {
  if (campo === 'periodo_fin') return periodoFinProyecto(proyecto) || SIN_DATO;
  if (campo === 'riesgo') {
    return proyecto.start_at_risk ? 'Start at risk' : 'Sin marca de riesgo';
  }
  if (campo === 'executive_watchlist') {
    const v = proyecto[campo];
    if (v === null || v === undefined) return SIN_DATO;
    return v ? 'Sí' : 'No';
  }
  if (campo === 'project_status') {
    const v = proyecto[campo];
    if (v === null || v === undefined || v === '') return SIN_DATO;
    // Map internal values to Spanish display
    const mapa = { 'Red': 'Rojo', 'Yellow': 'Amarillo', 'Green': 'Verde' };
    return mapa[v] || String(v);
  }
  const v = proyecto[campo];
  return (v === null || v === undefined || v === '') ? SIN_DATO : String(v);
}

export function etiquetaDimension(campo, valor) {
  return campo === 'periodo_fin' && valor !== SIN_DATO ? etiquetaPeriodoCalendario(valor) : valor;
}

export function pasaDimension(proyecto, campo) {
  const marcados = estado.filtros[campo];
  if (!marcados || marcados.length === 0) return true;
  return marcados.includes(valorDimension(proyecto, campo));
}

export function pasaTexto(proyecto) {
  const texto = (estado.filtros.texto || '').trim().toLowerCase();
  if (texto === '') return true;
  return [
    proyecto.cliente, proyecto.nombre_del_proyecto,
    proyecto.num_pa, proyecto.project_id,
  ].map(v => String(v ?? '')).join(' ').toLowerCase().includes(texto);
}

export function pasaTerritorio(proyecto) {
  const mexico=String(proyecto?.pais||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').trim().toLowerCase()==='mexico';
  return estado.territorio==='mexico'?mexico:estado.territorio==='nssa'?!mexico:true;
}

export function pasaVisibilidadProyecto(proyecto) {
  return (estado.incluirCompletados || proyecto?.estado !== 'Completed')
    && (estado.incluirCancelados || proyecto?.estado !== 'Canceled')
    && pasaTerritorio(proyecto) && pasaPeriodoProyecto(proyecto);
}

/**
 * Conteos de una dimensión aplicando todos los demás filtros MENOS el suyo.
 * Así el número junto a cada opción dice cuántos proyectos quedarían si la
 * marcas, no el total global. Sin esto los conteos mienten en cuanto hay
 * dos filtros puestos.
 */
export function conteosDe(campo) {
  const conteos = new Map();
  estado.proyectos.forEach(p => {
    if (!pasaVisibilidadProyecto(p)) return;
    if (!estado.incluirCancelados && p.estado === 'Canceled' && campo !== 'estado') return;
    const pasa = DIMENSIONES.every(d => d.campo === campo || pasaDimension(p, d.campo));
    if (!pasa || !pasaTexto(p)) return;
    const v = valorDimension(p, campo);
    conteos.set(v, (conteos.get(v) || 0) + 1);
  });
  return conteos;
}

export function opcionesDe(campo) {
  const vistos = new Set();
  estado.proyectos.forEach(p => vistos.add(valorDimension(p, campo)));
  const lista = Array.from(vistos);
  // El estado sigue el flujo del negocio, no el alfabeto.
  const orden = (estado.metadataProyectos || {}).orden_estado;
  if (campo === 'estado' && orden) {
    return lista.sort((a, b) => {
      const ia = orden.indexOf(a), ib = orden.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }
  // (sin dato) siempre al final; el resto alfabético, con los años al revés.
  lista.sort((a, b) => {
    if (a === SIN_DATO) return 1;
    if (b === SIN_DATO) return -1;
    return a.localeCompare(b, 'es', { numeric: true });
  });
  return lista;
}
