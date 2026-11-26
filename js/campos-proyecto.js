// Qué columnas de un proyecto son plata, porcentaje o identificadores, y cómo se
// identifica y se clasifica un proyecto en el listado y en el detalle.
// Qué columnas son plata y cuáles porcentaje. Sin esto el detalle muestra
// cosas como "7610377.23" en vez de "$7.61M".
export const CAMPOS_DINERO = new Set([
  'valor_of', 'valor_of_anterior', 'ejecucion_deseada', 'ejecucion_acumulada',
  'acumulado_a_hoy', 'diferencias_acumulado_of', 'consumido_2025',
  'backlog_2026', 'backlog', 'acumulado_anterior', 'consumido_2025_ref', 'dif_consumido_2025',
]);
export const CAMPOS_PORCENTAJE = new Set(['pct_ejecucion_actual', 'pct_peso_contrato']);
export const CAMPOS_ID = new Set(['num_pa', 'num_opp', 'project_id']);

export function identificador(p) {
  const pa = p.num_pa;
  if (pa !== null && pa !== undefined && !String(pa).startsWith('PR')) {
    return { valor: 'PA ' + pa, tipo: 'PA' };
  }
  const pr = (pa && String(pa).startsWith('PR')) ? String(pa) : p.project_id;
  return pr ? { valor: String(pr), tipo: 'PR' } : { valor: '—', tipo: null };
}

/** Semáforo de vencimiento. El color nunca va solo: la celda muestra los días
    y el title explica el estado, para quien no distingue los colores. */
export function claseVencimiento(dias) {
  if (typeof dias !== 'number') return '';
  if (dias <= 0) return 'venc-critico';
  if (dias <= 30) return 'venc-serio';
  if (dias < 60) return 'venc-advertencia';
  return 'venc-bueno';
}
