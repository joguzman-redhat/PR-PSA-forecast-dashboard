// Columnas redimensionables de las tablas: anchos guardados en localStorage,
// arrastre del borde del encabezado y doble clic para restablecer.
import { estado } from './estado.js';

// El listado usa el nombre de columna para conservar el ancho al cambiar el orden.
const anchosColumnasGuardados = new Map();
// Control de drag
let dragInfo = null;
// Hasta cuándo se ignora el click en encabezados que sigue a un arrastre
let suprimirClickHasta = 0;
// Debounce para MutationObserver
let mutationTimeout;

/**
 * Extrae una clave única para una tabla (id o su primera clase)
 */
function obtenerTabllaKey(tabla) {
  return tabla.id || (tabla.className.split(' ')[0] || 'tabla-sin-id');
}

function claveAnchoColumna(tabla, th, indice) {
  let columna = tabla.id === 'tabla-proyectos' && th.dataset.columna
    ? `col:${th.dataset.columna}` : indice;
  if (tabla.id === 'tabla-proyectos' && th.dataset.columna === 'estatus') {
    columna += tabla.classList.contains('vista-vendedor') ? ':vendedor' : ':compacto';
  }
  return `${obtenerTabllaKey(tabla)}|${columna}`;
}

/**
 * Carga los anchos guardados de localStorage
 */
export function cargarAnchosDeStorage() {
  const stored = localStorage.getItem('anchosColumnas');
  if (!stored) return;
  try {
    const obj = JSON.parse(stored);
    for (const [k, v] of Object.entries(obj)) {
      anchosColumnasGuardados.set(k, v);
    }
    // Migrar el orden anterior antes de insertar Estatus al inicio; su ancho parte del nuevo valor por defecto.
    const anteriores = ['__identificador', ...estado.metadataProyectos.columnas.filter(c => c.verde).map(c => c.key), '__revenue_periodo'];
    let migrado = false;
    anteriores.forEach((campo, i) => {
      const viejo = `tabla-proyectos|${i}`, nuevo = `tabla-proyectos|col:${campo}`;
      const ancho = anchosColumnasGuardados.get(viejo);
      if (anchosColumnasGuardados.has(viejo)) {
        if (campo !== 'estatus' && Number.isFinite(ancho) && ancho > 0 && !anchosColumnasGuardados.has(nuevo)) {
          anchosColumnasGuardados.set(nuevo, ancho);
        }
        anchosColumnasGuardados.delete(viejo);
        migrado = true;
      }
    });
    const estatusAnterior = 'tabla-proyectos|col:estatus';
    const estatusVendedor = 'tabla-proyectos|col:estatus:vendedor';
    if (anchosColumnasGuardados.has(estatusAnterior)) {
      if (!anchosColumnasGuardados.has(estatusVendedor)) {
        anchosColumnasGuardados.set(estatusVendedor, anchosColumnasGuardados.get(estatusAnterior));
      }
      anchosColumnasGuardados.delete(estatusAnterior);
      migrado = true;
    }
    if (migrado) guardarAnchosEnStorage();
  } catch (e) {
    console.warn('Error cargando anchosColumnas:', e);
  }
}

/**
 * Guarda los anchos en localStorage
 */
function guardarAnchosEnStorage() {
  const obj = {};
  for (const [k, v] of anchosColumnasGuardados) {
    obj[k] = v;
  }
  localStorage.setItem('anchosColumnas', JSON.stringify(obj));
}

/**
 * Añade resizers a los th de una tabla y reaplica anchos guardados
 */
export function asegurarResizers(tabla) {
  if (!tabla || !tabla.tagName || tabla.tagName !== 'TABLE') return;

  const thead = tabla.querySelector('thead');
  if (!thead) return;

  // Buscar la última fila de headers
  const headerRows = thead.querySelectorAll('tr');
  if (!headerRows.length) return;
  const lastHeaderRow = headerRows[headerRows.length - 1];

  // Añadir resizers a los th que no los tengan
  lastHeaderRow.querySelectorAll('th').forEach((th, colIndex) => {
    if (!th.querySelector('.col-resizer')) {
      const resizer = document.createElement('span');
      resizer.className = 'col-resizer';
      th.appendChild(resizer);
    }
  });

  // Reaplica los anchos guardados
  const tBodyRows = tabla.querySelectorAll('tbody tr');
  lastHeaderRow.querySelectorAll('th').forEach((th, colIndex) => {
    const key = claveAnchoColumna(tabla, th, colIndex);
    const savedWidth = anchosColumnasGuardados.get(key);
    if (savedWidth) {
      th.style.width = savedWidth + 'px';
      th.style.minWidth = savedWidth + 'px';
      th.style.maxWidth = savedWidth + 'px';

      // Aplicar el mismo ancho a las celdas del tbody
      tBodyRows.forEach(row => {
        const cells = row.querySelectorAll('td, th');
        if (cells.length === lastHeaderRow.children.length && cells[colIndex]) {
          cells[colIndex].style.width = savedWidth + 'px';
          cells[colIndex].style.minWidth = savedWidth + 'px';
          cells[colIndex].style.maxWidth = savedWidth + 'px';
        }
      });
    }
  });
}

/**
 * Evento delegado: pointerdown en .col-resizer
 */
document.addEventListener('pointerdown', (e) => {
  if (!e.target.classList.contains('col-resizer')) return;

  e.preventDefault();
  e.stopPropagation();

  const th = e.target.closest('th');
  if (!th) return;

  const tabla = th.closest('table');
  if (!tabla) return;

  const thead = tabla.querySelector('thead');
  const lastHeaderRow = thead.querySelector('tr:last-child');
  const headerCells = lastHeaderRow.querySelectorAll('th');
  let colIndex = -1;
  for (let i = 0; i < headerCells.length; i++) {
    if (headerCells[i] === th) { colIndex = i; break; }
  }
  if (colIndex === -1) return;

  const startX = e.clientX;
  const startWidth = th.offsetWidth;

  dragInfo = {
    tabla,
    claveAncho: claveAnchoColumna(tabla, th, colIndex),
    colIndex,
    startX,
    startWidth,
    th,
    lastHeaderRow,
    headerCells,
  };

  document.body.classList.add('dragging-col-resizer');

  const onMove = (e) => {
    if (!dragInfo) return;
    const delta = e.clientX - dragInfo.startX;
    const newWidth = Math.max(60, dragInfo.startWidth + delta);

    // Actualizar header
    dragInfo.th.style.width = newWidth + 'px';
    dragInfo.th.style.minWidth = newWidth + 'px';
    dragInfo.th.style.maxWidth = newWidth + 'px';

    // Actualizar celdas del tbody
    const tbody = dragInfo.tabla.querySelector('tbody');
    if (tbody) {
      const rows = tbody.querySelectorAll('tr');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td, th');
        if (cells.length === dragInfo.headerCells.length && cells[dragInfo.colIndex]) {
          cells[dragInfo.colIndex].style.width = newWidth + 'px';
          cells[dragInfo.colIndex].style.minWidth = newWidth + 'px';
          cells[dragInfo.colIndex].style.maxWidth = newWidth + 'px';
        }
      });
    }
  };

  const onUp = (e) => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.body.classList.remove('dragging-col-resizer');

    if (!dragInfo) return;

    const finalWidth = Math.max(60, dragInfo.startWidth + (e.clientX - dragInfo.startX));
    const key = dragInfo.claveAncho;
    anchosColumnasGuardados.set(key, finalWidth);
    guardarAnchosEnStorage();

    // El click que el navegador dispara al soltar no debe ordenar la columna.
    suprimirClickHasta = Date.now() + 400;

    dragInfo = null;
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
});

document.addEventListener('click', (e) => {
  if (Date.now() < suprimirClickHasta && e.target.closest('th')) {
    e.preventDefault();
    e.stopPropagation();
    suprimirClickHasta = 0;
  }
}, true);

/**
 * Double-click en resizer: resetea el ancho de la columna
 */
document.addEventListener('dblclick', (e) => {
  if (!e.target.classList.contains('col-resizer')) return;

  e.preventDefault();
  e.stopPropagation();

  const th = e.target.closest('th');
  if (!th) return;

  const tabla = th.closest('table');
  if (!tabla) return;

  const thead = tabla.querySelector('thead');
  const lastHeaderRow = thead.querySelector('tr:last-child');
  const headerCells = lastHeaderRow.querySelectorAll('th');
  let colIndex = -1;
  for (let i = 0; i < headerCells.length; i++) {
    if (headerCells[i] === th) { colIndex = i; break; }
  }
  if (colIndex === -1) return;

  const key = claveAnchoColumna(tabla, th, colIndex);

  // Quitar estilos inline
  th.style.width = '';
  th.style.minWidth = '';
  th.style.maxWidth = '';

  const tbody = tabla.querySelector('tbody');
  if (tbody) {
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td, th');
      if (cells[colIndex]) {
        cells[colIndex].style.width = '';
        cells[colIndex].style.minWidth = '';
        cells[colIndex].style.maxWidth = '';
      }
    });
  }

  // Quitar del storage
  anchosColumnasGuardados.delete(key);
  guardarAnchosEnStorage();
});

/**
 * MutationObserver para detectar cambios en el DOM y reaplica resizers
 */
export function setupMutationObserver() {
  const observer = new MutationObserver(() => {
    if (mutationTimeout) clearTimeout(mutationTimeout);
    mutationTimeout = requestAnimationFrame(() => {
      document.querySelectorAll('table').forEach(tabla => {
        asegurarResizers(tabla);
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}
