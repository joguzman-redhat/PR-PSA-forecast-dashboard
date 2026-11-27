// Proyectos de un PM: fila expandida de la tabla y salto al listado.

import { identificador } from './campos-proyecto.js';
import { abrirDetalle } from './detalle.js';
import { backlogHoy, ejecutadoProyecto, porcentajeEjecucionProyecto, valorBooking } from './dinero-proyecto.js';
import { estado } from './estado.js';
import { aplicarFiltros } from './filtros-ui.js';
import { DIMENSIONES } from './filtros.js';
import { formatearDinero } from './formato.js';
import { colorDeEntidad } from './grafica-base.js';
import { vistas } from './vistas.js';

export function crearFilaProyectosPM(filaPM) {
  const tr = document.createElement('tr');
  tr.className = 'fila-proyectos-pm-expandida';
  const td = document.createElement('td');
  td.colSpan = 16; // all columns

  const cont = document.createElement('div');
  cont.className = 'contenedor-proyectos-pm';

  const tabla = document.createElement('table');
  tabla.className = 'tabla-proyectos-pm pf-v6-c-table pf-m-compact';

  // Header
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  ['PA', 'Proyecto', 'Cliente', 'Estado', 'Handover', 'Status', 'Valor Booking', 'Ejecutado', 'Backlog', '% ejecución']
    .forEach(txt => {
      const th = document.createElement('th');
      th.textContent = txt;
      trh.appendChild(th);
    });
  thead.appendChild(trh);
  tabla.appendChild(thead);

  // Sort projects: by estado order, then backlog desc
  const ordenEstado = (estado.metadataProyectos || {}).orden_estado || [];
  const proyectos = filaPM.proyectos.slice().sort((a, b) => {
    const iaEst = ordenEstado.indexOf(a.estado);
    const ibEst = ordenEstado.indexOf(b.estado);
    const estCmp = (iaEst < 0 ? 99 : iaEst) - (ibEst < 0 ? 99 : ibEst);
    if (estCmp !== 0) return estCmp;
    const blA = backlogHoy(a) || 0;
    const blB = backlogHoy(b) || 0;
    return blB - blA;
  });

  const tbody = document.createElement('tbody');
  proyectos.forEach(p => {
    const trp = document.createElement('tr');
    trp.className = 'fila-proyecto-pm';
    trp.addEventListener('click', () => abrirDetalle(p));

    // Sin cifra es sin dato ("—"), no cero.
    const booking = valorBooking(p);
    const acum = ejecutadoProyecto(p);
    const backlog = backlogHoy(p);
    const pctEjec = porcentajeEjecucionProyecto(p);

    // PA
    const tdPA = document.createElement('td');
    tdPA.textContent = identificador(p).valor;
    tdPA.className = 'celda-id';
    trp.appendChild(tdPA);

    // Proyecto name - ellipsis + title
    const tdNom = document.createElement('td');
    tdNom.textContent = p.nombre_del_proyecto || '—';
    tdNom.className = 'celda-nombre';
    tdNom.title = p.nombre_del_proyecto || '';
    trp.appendChild(tdNom);

    // Cliente
    const tdCli = document.createElement('td');
    tdCli.textContent = p.cliente || '—';
    trp.appendChild(tdCli);

    // Estado - colored chip
    const tdEst = document.createElement('td');
    const chipEst = document.createElement('span');
    chipEst.className = 'chip-estado-pm';
    chipEst.textContent = p.estado || '—';
    chipEst.style.color = colorDeEntidad('estado', p.estado || '—');
    tdEst.appendChild(chipEst);
    trp.appendChild(tdEst);

    // Handover
    const tdHandover = document.createElement('td');
    tdHandover.style.textAlign = 'center';
    if (p.executive_watchlist) {
      const span = document.createElement('span');
      span.className = 'chip-dato chip-bueno';
      span.textContent = '✓';
      span.style.fontSize = '0.875rem';
      tdHandover.appendChild(span);
    }
    trp.appendChild(tdHandover);

    // Semáforo
    const tdStatus = document.createElement('td');
    if (p.project_status) {
      const statusMap = { 'Red': 'Rojo', 'Yellow': 'Amarillo', 'Green': 'Verde' };
      const statusColor = { 'Red': '#c9190b', 'Yellow': '#f0ab00', 'Green': '#3e8635' };
      const dot = document.createElement('span');
      dot.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:50%;background:${statusColor[p.project_status] || '#8a8d90'};margin-right:4px;`;
      tdStatus.appendChild(dot);
      tdStatus.appendChild(document.createTextNode(statusMap[p.project_status] || p.project_status));
    } else {
      tdStatus.textContent = '—';
    }
    tdStatus.style.fontSize = '0.8125rem';
    trp.appendChild(tdStatus);

    // Valor Booking
    const tdBooking = document.createElement('td');
    tdBooking.textContent = formatearDinero(booking);
    tdBooking.className = 'celda-numero';
    trp.appendChild(tdBooking);

    // Ejecutado
    const tdAcum = document.createElement('td');
    tdAcum.textContent = formatearDinero(acum);
    tdAcum.className = 'celda-numero';
    trp.appendChild(tdAcum);

    // Backlog
    const tdBacklog = document.createElement('td');
    tdBacklog.textContent = formatearDinero(backlog);
    tdBacklog.className = 'celda-numero';
    trp.appendChild(tdBacklog);

    // % ejecución
    const tdPct = document.createElement('td');
    tdPct.textContent = pctEjec === null ? '—' : pctEjec.toFixed(1) + '%';
    tdPct.className = 'celda-numero';
    trp.appendChild(tdPct);

    tbody.appendChild(trp);
  });
  tabla.appendChild(tbody);

  // Footer with link to Listado
  const tfoot = document.createElement('tfoot');
  const trf = document.createElement('tr');
  const tdf = document.createElement('td');
  tdf.colSpan = 10;  // updated for new columns
  tdf.style.textAlign = 'center';
  tdf.style.padding = 'var(--spacing-sm)';
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'pf-v6-c-button pf-m-link pf-m-small';
  link.textContent = 'Ver en Listado de Proyectos';
  link.addEventListener('click', (e) => {
    e.stopPropagation();
    irAProyectosDePM(filaPM.pm);
  });
  tdf.appendChild(link);
  trf.appendChild(tdf);
  tfoot.appendChild(trf);
  tabla.appendChild(tfoot);

  cont.appendChild(tabla);
  td.appendChild(cont);
  tr.appendChild(td);
  return tr;
}

export function irAProyectosDePM(pm) {
  DIMENSIONES.forEach(d => { estado.filtros[d.campo] = []; });
  estado.filtros.texto = '';
  estado.filtros.pm_lider = [pm];
  const texto = document.getElementById('filtro-texto');
  if (texto) texto.value = '';
  aplicarFiltros();
  vistas.cambiarPestana('listado');
}
