// Otros proyectos del mismo cliente, al pie del detalle.

import { identificador } from './campos-proyecto.js';
import { periodoActual } from './calendario.js';
import { revenuePeriodo, valorBooking } from './dinero-proyecto.js';
import { estado } from './estado.js';
import { pasaVisibilidadProyecto } from './filtros.js';
import { formatearDinero } from './formato.js';
import { vistas } from './vistas.js';

/**
 * Un cliente casi nunca tiene un solo proyecto: 63 clientes concentran 197 de
 * los 304. Ver los hermanos desde el detalle evita tener que volver al listado
 * y filtrar a mano para responder "¿qué más tenemos con esta cuenta?".
 */
export function renderizarHermanosDeCliente(contenedor, proyecto) {
  if (!proyecto.cliente) return;
  const todosHermanos = estado.proyectos.filter(
    p => p.cliente === proyecto.cliente && p !== proyecto);
  // Mantener el bloque si todos los hermanos están ocultos para poder mostrarlos.
  if (!todosHermanos.length) return;
  const hermanos = todosHermanos.filter(pasaVisibilidadProyecto);

  const div = document.createElement('div');
  div.className = 'detalle-trazabilidad otros-proyectos-cliente';
  const h4 = document.createElement('h4');
  h4.textContent = `Otros proyectos de ${proyecto.cliente} (${hermanos.length})`;
  div.appendChild(h4);

  const control = document.createElement('label');
  control.className = 'check-inline';
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.id = 'chk-completados-detalle';
  chk.dataset.mostrarCompletados = '';
  chk.checked = estado.incluirCompletados;
  control.append(chk, document.createTextNode('Mostrar completados'));
  div.appendChild(control);

  const totalCliente = [proyecto, ...todosHermanos].filter(pasaVisibilidadProyecto)
    .reduce((a, p) => a + (valorBooking(p) || 0), 0);
  const nota = document.createElement('p');
  nota.className = 'nota-tabla';
  nota.textContent = `Valor Booking de la cuenta con los estados visibles: ${formatearDinero(totalCliente)}`;
  div.appendChild(nota);

  const t = document.createElement('table');
  t.className = 'tabla-eventos-proyecto';
  const th = document.createElement('thead');
  const trh = document.createElement('tr');
  ['PA / PR', 'Proyecto', 'Estado', 'PM/Líder', 'Valor Booking', `Revenue · ${periodoActual().etiqueta}`]
    .forEach(x => { const e = document.createElement('th'); e.textContent = x; trh.appendChild(e); });
  th.appendChild(trh); t.appendChild(th);

  const tb = document.createElement('tbody');
  if (!hermanos.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.textContent = 'No hay otros proyectos con los estados visibles. Activa Mostrar completados para incluirlos.';
    tr.appendChild(td);
    tb.appendChild(tr);
  }
  hermanos
    .sort((a, b) => (valorBooking(b) || 0) - (valorBooking(a) || 0))
    .forEach(h => {
      const tr = document.createElement('tr');
      tr.className = 'fila-clicable';
      tr.addEventListener('click', () => vistas.abrirDetalle(h));
      const rev = revenuePeriodo(h);
      const booking = valorBooking(h);
      [[identificador(h).valor, 'celda-id'],
        [h.nombre_del_proyecto || '—', 'celda-nombre'],
        [h.estado || '—', ''],
        [h.pm_lider || '—', ''],
        [booking === null ? '—' : formatearDinero(booking), 'celda-numero'],
        [rev === null ? '—' : formatearDinero(rev), 'celda-numero'],
      ].forEach(([txt, c], i) => {
        const td = document.createElement('td');
        td.textContent = txt;
        td.className = c || "";if(td.textContent==="On Hold")td.classList.add("estado-on-hold");
        if (i === 1) td.title = txt;
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
  t.appendChild(tb);
  div.appendChild(t);
  contenedor.appendChild(div);
}
