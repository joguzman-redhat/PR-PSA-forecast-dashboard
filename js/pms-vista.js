// Vista de PMs (pestaña PMs): tabla, gráficas y orden.

import { mesesActivos } from './calendario.js';
import { backlogHoy, sumaConDato, valorBooking } from './dinero-proyecto.js';
import { estado } from './estado.js';
import { formatearDinero, formatearDineroExacto, formatearNumero } from './formato.js';
import { crearGraficaBarrasSimple } from './grafica-barras-simple.js';
import { calcularPMs } from './pms-calculo.js';
import { crearFilaProyectosPM, irAProyectosDePM } from './pms-proyectos.js';

const COLUMNAS_PM_DINERO = new Set([
  // completedN is NOT money, it's a count
  'inProgresoBacklog', 'onHoldBacklog', 'plannedBacklog', 'totalBacklog',
  'commit', 'upside', 'totalEjecutado', 'promedioMensual', 'promedioProyecto',
]);

function ordenarTablaPMs(columna) {
  const orden = estado.ordenPMs || {};
  const desc = orden.columna === columna ? !orden.desc : true;
  estado.ordenPMs = { columna, desc };
  renderizarPMs();
}

/**
 * Tres gráficas que responden de un vistazo lo que antes solo se veía
 * ordenando la tabla: quién mueve más plata, quién tiene más backlog
 * pendiente, y quién carga más proyectos. Cada una ordena su propio top,
 * sin importar cómo esté ordenada la tabla en ese momento.
 */
function renderizarGraficasPMs(filas) {
  const top = (campo, n, formato) => filas
    .slice()
    .sort((a, b) => b[campo] - a[campo])
    .slice(0, n)
    .filter(f => f[campo])
    .map(f => ({
      etiqueta: f.pm,
      valor: f[campo],
      exacto: formato === 'dinero' ? formatearDineroExacto(f[campo]) : formatearNumero(f[campo]),
    }));

  crearGraficaBarrasSimple('grafica-pm-commit', top('commit', 10, 'dinero'), {
    formato: 'dinero', unidad: 'Commit',
  });
  crearGraficaBarrasSimple('grafica-pm-backlog', top('totalBacklog', 10, 'dinero'), {
    formato: 'dinero', unidad: 'Backlog total',
  });
  crearGraficaBarrasSimple('grafica-pm-proyectos', top('nProyectos', 15, 'conteo'), {
    formato: 'conteo', unidad: 'Proyectos',
  });
}

export function renderizarPMs() {
  const thead = document.querySelector('#tabla-pms > thead tr');
  if (thead && !thead.dataset.wireado) {
    thead.dataset.wireado = '1';
    thead.querySelectorAll('th[data-columna]').forEach(th => {
      th.style.cursor = 'pointer';
      th.title = `Ordenar por ${th.textContent}`;
      th.addEventListener('click', () => ordenarTablaPMs(th.dataset.columna));
    });
  }

  let filas = calcularPMs();

  // Renderizar KPIs resumen
  const kpisData = {
    totalPMs: filas.length,
    inProgress: filas.reduce((a, f) => a + f.inProgresoN, 0),
    onHold: filas.reduce((a, f) => a + f.onHoldN, 0),
    planned: filas.reduce((a, f) => a + f.plannedN, 0),
    completed: filas.reduce((a, f) => a + f.completedN, 0),
    totalBooking: sumaConDato(filas.flatMap(f => f.proyectos), valorBooking),
    // Total Backlog (continuo): suma de backlogHoy; los proyectos sin cifra no cuentan como cero.
    totalBacklog: sumaConDato(filas.flatMap(f => f.proyectos), backlogHoy),
  };
  document.getElementById('kpi-pms-total').textContent = kpisData.totalPMs;
  document.getElementById('kpi-pms-in-progress').textContent = kpisData.inProgress;
  document.getElementById('kpi-pms-on-hold').textContent = kpisData.onHold;
  document.getElementById('kpi-pms-planned').textContent = kpisData.planned;
  document.getElementById('kpi-pms-completed').textContent = kpisData.completed;
  document.getElementById('kpi-pms-total-booking').textContent = formatearDinero(kpisData.totalBooking);
  document.getElementById('kpi-pms-total-backlog').textContent = formatearDinero(kpisData.totalBacklog);

  renderizarGraficasPMs(filas);

  // Por defecto, el que más Commit tiene primero: es la pregunta más
  // frecuente ("¿quién tiene más plata?").
  const orden = estado.ordenPMs || { columna: 'commit', desc: true };
  filas = filas.slice().sort((a, b) => {
    const va = a[orden.columna], vb = b[orden.columna];
    const cmp = typeof va === 'number' && typeof vb === 'number'
      ? va - vb : String(va || '').localeCompare(String(vb || ''), 'es');
    return orden.desc ? -cmp : cmp;
  });

  thead && thead.querySelectorAll('th[data-columna]').forEach(th => {
    const activa = orden.columna === th.dataset.columna;
    th.classList.toggle('col-ordenada', activa);
    const base = th.textContent.replace(/\s*[↑↓]\s*$/, '');
    th.textContent = base + (activa ? (orden.desc ? '  ↓' : '  ↑') : '');
  });

  const fmt = (col, v) => (COLUMNAS_PM_DINERO.has(col) ? formatearDinero(v) : formatearNumero(v));

  const tbody = document.querySelector('#tabla-pms > tbody');
  tbody.innerHTML = '';
  const columnas = ['inProgresoN', 'inProgresoBacklog', 'onHoldN', 'onHoldBacklog',
    'plannedN', 'plannedBacklog', 'completedN', 'totalN', 'totalBacklog',
    'commit', 'upside', 'totalEjecutado', 'promedioMensual', 'promedioProyecto'];

  filas.forEach(f => {
    const tr = document.createElement('tr');
    tr.className = 'fila-pm-principal';
    tr.dataset.pm = f.pm;

    // Toggle button column
    const tdToggle = document.createElement('td');
    tdToggle.className = 'celda-toggle';
    const btnToggle = document.createElement('button');
    btnToggle.type = 'button';
    btnToggle.className = 'btn-toggle-pm pf-v6-c-button pf-m-plain pf-m-small';
    btnToggle.innerHTML = '<span class="chevron-pm">›</span>';
    btnToggle.title = 'Ver proyectos de este PM';
    btnToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleProyectosPM(f.pm);
    });
    tdToggle.appendChild(btnToggle);
    tr.appendChild(tdToggle);

    // PM name column - clickable for navigation to listado
    const tdPM = document.createElement('td');
    tdPM.textContent = f.pm;
    tdPM.className = 'celda-nombre celda-pm-nombre';
    tdPM.title = `Ver los proyectos de ${f.pm} en Listado de Proyectos`;
    tdPM.style.cursor = 'pointer';
    tdPM.addEventListener('click', () => irAProyectosDePM(f.pm));
    tr.appendChild(tdPM);

    columnas.forEach(col => {
      const td = document.createElement('td');
      td.className = 'celda-numero';
      const v = f[col];
      td.textContent = fmt(col, v);
      if (COLUMNAS_PM_DINERO.has(col)) td.title = formatearDineroExacto(v);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);

    // If this PM is expanded, render the sub-table
    if (estado.expandedPMs.has(f.pm)) {
      tbody.appendChild(crearFilaProyectosPM(f));
      btnToggle.classList.add('expandido');
      btnToggle.querySelector('.chevron-pm').textContent = '▾';
    }
  });

  // Fila de totales, igual a "Total Result" de la tabla de negocio.
  const tfoot = document.querySelector('#tabla-pms > tfoot');
  tfoot.innerHTML = '';
  if (filas.length) {
    const trTotal = document.createElement('tr');
    const tdVacio = document.createElement('td'); // toggle column
    trTotal.appendChild(tdVacio);
    const tdEtq = document.createElement('td');
    tdEtq.textContent = `Total (${filas.length} PM${filas.length === 1 ? '' : 's'})`;
    tdEtq.className = 'celda-nombre';
    trTotal.appendChild(tdEtq);
    const totalProyectos = filas.reduce((a, f) => a + f.nProyectos, 0);
    const totalCommit = filas.reduce((a, f) => a + f.commit, 0);
    const nMeses = mesesActivos().length || 1;
    columnas.forEach(col => {
      const td = document.createElement('td');
      td.className = 'celda-numero';
      let v;
      if (col === 'promedioMensual') v = totalCommit / nMeses;
      else if (col === 'promedioProyecto') v = totalProyectos ? totalCommit / totalProyectos : 0;
      else v = filas.reduce((a, f) => a + (f[col] || 0), 0);
      td.textContent = fmt(col, v);
      trTotal.appendChild(td);
    });
    tfoot.appendChild(trTotal);
  }
}

function toggleProyectosPM(pm) {
  if (estado.expandedPMs.has(pm)) {
    estado.expandedPMs.delete(pm);
  } else {
    estado.expandedPMs.add(pm);
  }
  renderizarPMs();
}
