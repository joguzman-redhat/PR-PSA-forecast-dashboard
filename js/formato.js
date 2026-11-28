// Formateo de dinero, porcentajes y fechas para mostrar en pantalla. Son
// funciones puras: no leen el estado ni el DOM.

export function formatearDinero(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return '—';
  const num = parseFloat(valor);
  if (num === 0) return '$0';
  // Hay notas de credito: sin tratar el signo aparte, -1792.5 salia como
  // '$-1793' en vez de '-$1.8K'.
  const signo = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  if (abs >= 1000000) return signo + '$' + (abs / 1000000).toFixed(2) + 'M';
  if (abs >= 10000) return signo + '$' + (abs / 1000).toFixed(0) + 'K';
  if (abs >= 1000) return signo + '$' + (abs / 1000).toFixed(1) + 'K';
  return signo + '$' + abs.toFixed(0);
}

export function formatearNumero(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return '—';
  return Math.round(parseFloat(valor)).toLocaleString('es-CO');
}

/**
 * Dinero al dólar exacto. La versión abreviada ($42K) es cómoda para leer de
 * lejos pero no se puede sumar: 14.179 y 27.361 se muestran como $14K y $27K,
 * que suman 41K, mientras su total 41.541 se muestra como $42K. Donde el
 * usuario está auditando cifras hay que dar el número completo.
 */
export function formatearDineroExacto(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return '—';
  const num = Math.round(parseFloat(valor));
  return (num < 0 ? '−$' : '$') + Math.abs(num).toLocaleString('en-US');
}

export function formatearPorcentaje(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return '—';
  return (parseFloat(valor) * 100).toFixed(1) + '%';
}

export function formatearFecha(valor) {
  if (!valor) return '—';
  try {
    const fecha = new Date(valor);
    return fecha.toLocaleDateString('es-CO');
  } catch {
    return valor;
  }
}

export function normalizarValor(valor) {
  if (valor === null || valor === undefined || valor === '' || valor === 'N/A') {
    return null;
  }
  return valor;
}

export function obtenerEtiquetaValor(valor) {
  if (valor === null || valor === undefined || valor === '' || valor === 'N/A') {
    return '—';
  }
  return String(valor);
}
