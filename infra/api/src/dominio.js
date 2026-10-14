// Vocabulario compartido entre el seed y la API. En el Excel el commit se
// llama "fijo", y asi lo siguen nombrando las claves del JSON que consume el
// dashboard; en la BD la columna es commit_usd.

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const QUARTERS = { q1: [1, 2, 3], q2: [4, 5, 6], q3: [7, 8, 9], q4: [10, 11, 12] };

// Claves de BackLog NOLA que son dinero y viven en revenue_mes / revenue_anual.
// Se excluyen del jsonb descriptivo para que no puedan divergir de las tablas
// de hechos: la plata tiene un solo dueño.
const CLAVES_DINERO_BACKLOG = new Set([
  'valor_of', 'acum_2025', 'backlog', 'total_ejecutado_acumulado',
  ...Object.keys(QUARTERS),
  ...MESES.flatMap((m) => [`${m}_fijo`, `${m}_upside`]),
]);

/** Clave de cruce entre las dos hojas: PA si existe, si no el nombre normalizado. */
function normalizarNombre(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, '');
}

function claveDe(numPa, nombre) {
  if (numPa !== null && numPa !== undefined && String(numPa).trim() !== '') {
    return `pa:${String(numPa).trim()}`;
  }
  const n = normalizarNombre(nombre);
  return n ? `nombre:${n}` : null;
}

/** Reconstruye las 24 claves de mes + q1..q4 a partir de las filas de revenue_mes. */
function mesesAClaves(filasMes) {
  const salida = {};
  const commitPorMes = new Array(12).fill(0);
  for (const m of MESES) {
    salida[`${m}_fijo`] = 0;
    salida[`${m}_upside`] = 0;
  }
  for (const f of filasMes || []) {
    const i = f.mes - 1;
    if (i < 0 || i > 11) continue;
    salida[`${MESES[i]}_fijo`] = f.commit_usd;
    salida[`${MESES[i]}_upside`] = f.upside_usd;
    commitPorMes[i] = f.commit_usd;
  }
  // REGLA DE NEGOCIO: el quarter suma SOLO el commit. El upside no entra.
  for (const [q, meses] of Object.entries(QUARTERS)) {
    salida[q] = meses.reduce((acc, m) => acc + commitPorMes[m - 1], 0);
  }
  return salida;
}

module.exports = { MESES, QUARTERS, CLAVES_DINERO_BACKLOG, normalizarNombre, claveDe, mesesAClaves };
