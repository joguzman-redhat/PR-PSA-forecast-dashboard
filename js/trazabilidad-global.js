// Vista de trazabilidad global (pestaña Trazabilidad).

import { MESES_ES, coberturaCalendario, mesesActivos, periodoActual } from './calendario.js';
import { clavesProyectosOcultos } from './clave-proyecto.js';
import { estado } from './estado.js';
import { pasaVisibilidadProyecto } from './filtros.js';
import { crearGraficaLinea } from './grafica-linea.js';
import { actualizarOpcionesFiltro } from './opciones-filtro.js';
import { TIPO_MOVIMIENTO, actualizarTablaEventos, ordenarTablaEventos } from './snapshots-movimientos.js';
import { rangoPredefinido } from './snapshots-rango.js';
import { renderizarResumenProyectos } from './snapshots-resumen-proyectos.js';
import { renderizarGraficaBacklogVsRevenue } from './trazabilidad-backlog-revenue.js';

/** Meses de cada Snapshot sin los proyectos actualmente Completed; conserva el histórico original. */
function mesesVisiblesPorSnapshot() {
  const hist = estado.historia;
  const porSnapshot = new Map(hist.snapshots.map(s => [s.id,
    Object.fromEntries(Object.entries(s.por_mes).map(([mes, valores]) => [mes, { ...valores }]))]));
  clavesProyectosOcultos().forEach(clave => {
    (hist.series_por_proyecto[clave] || []).forEach(entrada => {
      const meses = porSnapshot.get(entrada.snapshot_id);
      if (!meses) return;
      MESES_ES.forEach((mes, i) => {
        if (!meses[mes]) return;
        meses[mes].fijo -= entrada.meses?.[i]?.[0] || 0;
        meses[mes].upside -= entrada.meses?.[i]?.[1] || 0;
      });
    });
  });
  return porSnapshot;
}

export function renderizarTrazabilidad() {
  if (!estado.historia) {
    const panel = document.getElementById('pestana-trazabilidad');
    const notificacion = panel.querySelector('.panel-trazabilidad') || panel;
    const control = panel.querySelector('[data-mostrar-completados]')?.closest('label');
    notificacion.innerHTML = '<div style="padding: var(--spacing-lg); color: var(--text-secondary);">' +
      'Historial de revenue no disponible (aún no generado).</div>';
    if (control) notificacion.prepend(control);
    return;
  }

  const snaps = estado.historia.snapshots;
  const mesesPorSnapshot = mesesVisiblesPorSnapshot();
  const meses = mesesActivos();
  const periodo = periodoActual();

  // --- gráfica 1: revenue del periodo elegido, a lo largo de los snapshots ---
  const serieTotal = {};
  snaps.forEach(snap => {
    let fijo = 0, upside = 0;
    meses.forEach(i => {
      const m = mesesPorSnapshot.get(snap.id)[MESES_ES[i]];
      if (!m) return;
      fijo += m.fijo || 0;
      upside += m.upside || 0;
    });
    serieTotal[snap.etiqueta] = { 'Commit': coberturaCalendario(snap)?fijo:null, 'Upside': coberturaCalendario(snap)?upside:null };
  });
  crearGraficaLinea(document.getElementById('grafica-revenue-tiempo'), serieTotal);

  // --- gráfica 2: se abre al nivel de detalle que siga al periodo elegido ---
  // Todo el año -> los 4 quarters. Un quarter -> sus 3 meses. Un mes -> ese mes.
  let desglose;
  if (periodo.id === 'anio') {
    desglose = [['Q1', [0, 1, 2]], ['Q2', [3, 4, 5]], ['Q3', [6, 7, 8]], ['Q4', [9, 10, 11]]];
  } else {
    desglose = meses.map(i => [MESES_ES[i].charAt(0).toUpperCase() + MESES_ES[i].slice(1), [i]]);
  }
  const serieDesglose = {};
  snaps.forEach(snap => {
    const fila = {};
    desglose.forEach(([nombre, idxs]) => {
      fila[nombre] = coberturaCalendario(snap,idxs)?idxs.reduce((acc,i)=>acc+((mesesPorSnapshot.get(snap.id)[MESES_ES[i]]||{}).fijo||0),0):null;
    });
    serieDesglose[snap.etiqueta] = fila;
  });
  crearGraficaLinea(document.getElementById('grafica-quarterly'), serieDesglose);

  // --- gráfica 3: Backlog vs Revenue, global o de un PM ---
  const selectorBVR = document.getElementById('selector-backlog-vs-revenue');
  if (selectorBVR && !selectorBVR.children.length) {
    const lbl = document.createElement('label');
    lbl.textContent = 'Ver: ';
    lbl.className = 'comparador-texto';
    const sel = document.createElement('select');
    sel.id = 'select-pm-backlog-revenue';
    const optTodos = document.createElement('option');
    optTodos.value = '';
    optTodos.textContent = 'Todos los proyectos (global)';
    sel.appendChild(optTodos);
    [...new Set(estado.proyectos.map(p => p.pm_lider).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es'))
      .forEach(pm => {
        const o = document.createElement('option');
        o.value = pm;
        o.textContent = pm;
        sel.appendChild(o);
      });
    sel.addEventListener('change', renderizarTrazabilidad);
    selectorBVR.append(lbl, sel);
  }
  actualizarOpcionesFiltro(document.getElementById('select-pm-backlog-revenue'),
    estado.proyectos.filter(pasaVisibilidadProyecto).map(p => p.pm_lider).filter(Boolean));
  renderizarGraficaBacklogVsRevenue();

  const tituloDesglose = document.getElementById('titulo-desglose');
  if (tituloDesglose) {
    tituloDesglose.textContent = periodo.id === 'anio'
      ? 'Revenue Commit por quarter'
      : `Revenue Commit por mes · ${periodo.etiqueta}`;
  }
  const tituloTotal = document.getElementById('titulo-revenue-tiempo');
  if (tituloTotal) {
    tituloTotal.textContent = periodo.id === 'anio'
      ? 'Evolución del forecast entre capturas'
      : `Forecast entre capturas · ${periodo.etiqueta}`;
  }

  // --- selectores de snapshot para la tabla por proyecto ---
  const selA = document.getElementById('select-snap-a');
  const selB = document.getElementById('select-snap-b');
  if (!selA.options.length) {
    snaps.forEach((snap, i) => {
      [selA, selB].forEach((sel, k) => {
        const o = document.createElement('option');
        o.value = i;
        o.textContent = snap.etiqueta;
        if ((k === 0 && i === 0) || (k === 1 && i === snaps.length - 1)) o.selected = true;
        sel.appendChild(o);
      });
    });
    // El rango manda sobre las dos tablas: la de proyectos y la de movimientos.
    const alCambiarRango = () => { renderizarResumenProyectos(); actualizarTablaEventos(); };
    selA.addEventListener('change', alCambiarRango);
    selB.addEventListener('change', alCambiarRango);

    const chk = document.getElementById('chk-solo-cambios');
    if (chk) chk.addEventListener('change', renderizarResumenProyectos);

    document.querySelectorAll('.atajo-rango').forEach(btn => {
      btn.addEventListener('click', () => {
        const [a, b] = rangoPredefinido(btn.dataset.rango, snaps);
        selA.value = a;
        selB.value = b;
        document.querySelectorAll('.atajo-rango').forEach(o => o.classList.remove('activo'));
        btn.classList.add('activo');
        alCambiarRango();
      });
    });
  }
  renderizarResumenProyectos();

  // --- filtros de la tabla de movimientos ---
  const filtroTipoEvento = document.getElementById('filtro-tipo-evento');
  if (!filtroTipoEvento.options.length) {
    filtroTipoEvento.innerHTML = '<option value="">Todos los tipos</option>';
    [...new Set(estado.historia.eventos.map(e => e.tipo))].forEach(tipo => {
      const opt = document.createElement('option');
      opt.value = tipo || '';
      opt.textContent = (TIPO_MOVIMIENTO[tipo] || { texto: tipo || 'sin tipo' }).texto;
      filtroTipoEvento.appendChild(opt);
    });
    filtroTipoEvento.addEventListener('change', actualizarTablaEventos);
    document.getElementById('buscar-evento-proyecto')
      .addEventListener('input', actualizarTablaEventos);
    document.getElementById('limitar-por-proyecto')
      .addEventListener('change', actualizarTablaEventos);
    document.querySelectorAll('#tabla-eventos-cambio thead th[data-columna]').forEach(th => {
      th.addEventListener('click', () => ordenarTablaEventos(th.dataset.columna));
      th.style.cursor = 'pointer';
    });
  }
  actualizarTablaEventos();
}
