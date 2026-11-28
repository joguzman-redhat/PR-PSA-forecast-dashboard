// Tabla de proyectos no iniciados o en espera del Inicio.

import { identificador } from './campos-proyecto.js';
import { chip } from './chip.js';
import { backlogHoy, ejecutadoProyecto, porcentajeEjecucionProyecto, valorBooking } from './dinero-proyecto.js';
import { estado } from './estado.js';
import { formatearDinero, formatearDineroExacto, formatearNumero } from './formato.js';
import { vistas } from './vistas.js';

/**
 * Tabla de proyectos no iniciados o en espera
 */
export function renderizarTablaNoIniciados() {
  const tabla = document.getElementById('tabla-no-iniciados');
  if (!tabla) return;

  const tbody = tabla.querySelector('tbody');
  const tfoot = tabla.querySelector('tfoot');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (tfoot) tfoot.replaceChildren();
  const estadoElegido = document.getElementById('filtro-no-iniciados-estado')?.value || '';
  const noIniciados = estado.proyectosFiltrados.filter(p =>
    (p.estado === 'On Hold' || p.estado === 'Planned') && (!estadoElegido || p.estado === estadoElegido));

  if (noIniciados.length === 0) {
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 7;
    celda.className = 'tabla-no-iniciados-vacia';
    celda.textContent = 'No hay proyectos para el estado y los filtros seleccionados';
    fila.appendChild(celda);
    tbody.appendChild(fila);
    return;
  }

  // Ordenar por backlog desc
  const ordenados = noIniciados.slice().sort((a, b) => {
    const ba = backlogHoy(a) || 0;
    const bb = backlogHoy(b) || 0;
    return bb - ba;
  });

  // El denominador es el total de esta tabla, después del selector y los filtros globales.
  const importes = ordenados.map(backlogHoy).filter(Number.isFinite);
  const totalBacklog = importes.length ? importes.reduce((a, b) => a + b, 0) : null;
  const sinCifra = ordenados.length - importes.length;
  ordenados.forEach(p => {
    const tr = document.createElement('tr');
    tr.className = 'fila-clicable';
    tr.addEventListener('click', () => vistas.abrirDetalle(p));

    const nombre = p.nombre_del_proyecto || identificador(p).valor;
    const pm = p.pm_lider || '—';
    const cli = p.cliente || '—';
    const dias = p.dias_para_vencimiento;
    const meses = p.meses_transcurridos;
    const bl = backlogHoy(p);
    const porcentaje = porcentajeEjecucionProyecto(p);
    const etiquetaPorcentaje = porcentaje === null ? '—' : porcentaje.toFixed(1) + '%';

    const tdEstado = document.createElement('td');
    tdEstado.appendChild(chip(p.estado, p.estado === 'On Hold' ? 'chip-on-hold' : 'chip-estado',
      p.estado === 'Planned' ? 'Planned: proyecto no iniciado' : 'On Hold: proyecto en espera'));
    tr.appendChild(tdEstado);

    [[nombre, 'celda-nombre'], [pm, ''], [cli, ''],
      [dias !== null && dias !== undefined ? formatearNumero(dias) : '—', 'celda-numero'],
      [meses !== null && meses !== undefined ? formatearNumero(meses) : '—', 'celda-numero'],
    ].forEach(([txt, cls], idx) => {
      const td = document.createElement('td');
      td.textContent = txt;
      if (cls) td.className = cls;
      if (idx === 0 || idx === 1 || idx === 2) td.title = txt;  // title for Proyecto, PM, Cliente
      tr.appendChild(td);
    });

    // Columna de backlog con barra y valor
    const tdBl = document.createElement('td');
    tdBl.className = 'celda-backlog-barra';

    const wrapper = document.createElement('div');
    wrapper.className = 'backlog-participacion';

    const divBarra = document.createElement('div');
    divBarra.className = 'inline-backlog-barra-container';
    const contexto = porcentaje === null
      ? 'Sin importes suficientes para calcular la ejecución del contrato.'
      : `${etiquetaPorcentaje} ejecutado del Booking (${formatearDineroExacto(ejecutadoProyecto(p))} / ${formatearDineroExacto(valorBooking(p))}). El importe de backlog se muestra por separado.`;
    divBarra.title = contexto;
    divBarra.setAttribute('aria-label', `Ejecución de ${nombre}. ${contexto}`);
    if (porcentaje !== null) {
      divBarra.setAttribute('role', 'meter');
      divBarra.setAttribute('aria-valuemin', '0');
      divBarra.setAttribute('aria-valuemax', '100');
      divBarra.setAttribute('aria-valuenow', String(Math.max(0, Math.min(100, porcentaje))));
      divBarra.setAttribute('aria-valuetext', contexto);
    } else {
      divBarra.setAttribute('role', 'img');
    }

    const relleno = document.createElement('div');
    relleno.className = 'inline-backlog-relleno';
    relleno.style.width = `${porcentaje === null ? 0 : Math.max(0, Math.min(100, porcentaje))}%`;
    const lblPorcentaje = document.createElement('span');
    lblPorcentaje.className = 'inline-backlog-porcentaje';
    lblPorcentaje.textContent = etiquetaPorcentaje;

    divBarra.append(relleno, lblPorcentaje);

    const lblValor = document.createElement('span');
    lblValor.className = 'inline-backlog-valor';
    lblValor.textContent = formatearDinero(bl);
    lblValor.title = bl === null ? 'Sin cifra de BackLog NOLA' : formatearDineroExacto(bl);

    wrapper.appendChild(divBarra);
    wrapper.appendChild(lblValor);
    tdBl.appendChild(wrapper);
    tr.appendChild(tdBl);

    tbody.appendChild(tr);
  });

  // Fila total
  if (tfoot) {
    tfoot.innerHTML = '';
    const trTotal = document.createElement('tr');
    const tdEtq = document.createElement('td');
    trTotal.className = 'no-iniciados-total';
    tdEtq.colSpan = 6;
    tdEtq.textContent = `Total (${ordenados.length} proyecto${ordenados.length === 1 ? '' : 's'})`;
    if (sinCifra) tdEtq.textContent += ` · ${sinCifra} sin cifra de backlog`;
    trTotal.appendChild(tdEtq);
    const tdTotal = document.createElement('td');
    tdTotal.className = 'celda-numero';
    tdTotal.textContent = formatearDinero(totalBacklog);
    tdTotal.title = formatearDineroExacto(totalBacklog);
    trTotal.appendChild(tdTotal);
    tfoot.appendChild(trTotal);
  }
}
