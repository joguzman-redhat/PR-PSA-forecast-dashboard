// Resumen por proyecto de la comparación de Snapshots, con el detalle de movimientos desplegable.

import { periodoActual } from './calendario.js';
import { chip } from './chip.js';
import { abrirDetalle } from './detalle.js';
import { estado } from './estado.js';
import { formatearDinero, formatearDineroExacto } from './formato.js';
import { graficaQueCambioActual } from './grafica-registro.js';
import { actualizarOpcionesFiltro } from './opciones-filtro.js';
import { calcularCambios, direccionDe } from './snapshots-cambios.js';
import { renderizarGraficaCambios } from './snapshots-grafica-cambios.js';
import { renderizarKpisRango } from './snapshots-kpis.js';
import { TIPO_MOVIMIENTO } from './snapshots-movimientos.js';
import { MINIMO_CAMBIO } from './umbral-cambio.js';

function capitalizar(t) {
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/**
 * La fila que se despliega bajo un proyecto: un renglón por movimiento, con
 * el mes afectado, la fecha, la dirección y cuánto se movió el Commit de ese
 * mes. Es lo que convierte "13 movimientos" en información.
 */
export function filaDetalleMovimientos(f) {
  const tr = document.createElement('tr');
  tr.className = 'fila-detalle-mov';
  const td = document.createElement('td');
  td.colSpan = 8;

  const caja = document.createElement('div');
  caja.className = 'detalle-mov-caja';

  const titulo = document.createElement('div');
  titulo.className = 'detalle-mov-titulo';
  titulo.textContent = `Qué se movió en ${f.nombre}`;
  caja.appendChild(titulo);

  const tabla = document.createElement('table');
  tabla.className = 'detalle-mov-tabla';
  tabla.innerHTML = '<thead><tr>' +
    '<th>Cuándo</th><th>Mes afectado</th><th>Campo</th>' +
    '<th>Delta</th><th>Antes → Después</th></tr></thead>';
  const tbody = document.createElement('tbody');

  const ordenados = [...f.lista].sort(
    (a, b) => String(a.ev.timestamp).localeCompare(String(b.ev.timestamp)));

  ordenados.forEach(({ ev, snapshot }) => {
    const fila = document.createElement('tr');
    const tipo = TIPO_MOVIMIENTO[ev.tipo] || { texto: ev.tipo, clase: 'mov-nada' };
    const celdas = [
      { txt: snapshot.etiqueta },
      { txt: capitalizar(ev.campo) || '—' },
      { chip: tipo },
      {
        txt: (ev.delta >= 0 ? '+' : '−') + formatearDineroExacto(Math.abs(ev.delta || 0)),
        clase: 'celda-numero ' + (ev.delta >= 0 ? 'delta-positivo' : 'delta-negativo'),
      },
      {
        txt: `${formatearDineroExacto(ev.valor_anterior)} → ${formatearDineroExacto(ev.valor_nuevo)}`,
        clase: 'celda-numero',
      },
    ];
    celdas.forEach(c => {
      const celda = document.createElement('td');
      if (c.chip) {
        const span = document.createElement('span');
        span.className = 'chip-movimiento ' + c.chip.clase;
        span.textContent = c.chip.texto;
        celda.appendChild(span);
      } else {
        celda.textContent = c.txt;
      }
      if (c.clase) celda.className = c.clase;
      fila.appendChild(celda);
    });
    tbody.appendChild(fila);
  });

  // Un total por campo, no uno solo: sumar un delta de Commit con uno de
  // Upside en la misma cifra mezclaría dos datos independientes.
  const pie = document.createElement('tfoot');
  const porTipo = new Map();
  ordenados.forEach(({ ev }) => {
    if (!porTipo.has(ev.tipo)) porTipo.set(ev.tipo, []);
    porTipo.get(ev.tipo).push(ev);
  });
  porTipo.forEach((evs, tipo) => {
    const total = evs.reduce((acc, ev) => acc + (ev.delta || 0), 0);
    const etiquetaTipo = (TIPO_MOVIMIENTO[tipo] || { texto: tipo }).texto;
    const trTotal = document.createElement('tr');
    const tdEtq = document.createElement('td');
    tdEtq.colSpan = 3;
    tdEtq.textContent = `Total ${etiquetaTipo} · ${evs.length} movimiento${evs.length === 1 ? '' : 's'}`;
    trTotal.appendChild(tdEtq);
    const tdTot = document.createElement('td');
    tdTot.className = 'celda-numero ' + (total >= 0 ? 'delta-positivo' : 'delta-negativo');
    tdTot.textContent = (total >= 0 ? '+' : '−') + formatearDineroExacto(Math.abs(total));
    trTotal.appendChild(tdTot);
    const tdNota = document.createElement('td');
    tdNota.className = 'detalle-mov-nota';
    tdNota.textContent = `abreviado: ${(total >= 0 ? '+' : '−') + formatearDinero(Math.abs(total))}`;
    trTotal.appendChild(tdNota);
    pie.appendChild(trTotal);
  });

  tabla.appendChild(tbody);
  tabla.appendChild(pie);
  caja.appendChild(tabla);
  td.appendChild(caja);
  tr.appendChild(td);
  return tr;
}

export function renderizarResumenProyectos() {
  const tbody = document.querySelector('#tabla-resumen-proyectos tbody');
  if (!tbody || !estado.historia) return;
  const { filas, iA, iB, snaps } = calcularCambios();

  renderizarKpisRango(filas, snaps, iA, iB);
  renderizarGraficaCambios(filas, snaps, iA, iB);

  // Los Completed pueden revelar PMs y movimientos nuevos al activar el control.
  const filtroPM = document.getElementById('filtro-resumen-pm');
  actualizarOpcionesFiltro(filtroPM, filas.map(f => f.pm).filter(Boolean));

  const filtroQuePaso = document.getElementById('filtro-resumen-que-paso');
  actualizarOpcionesFiltro(filtroQuePaso, filas.map(f => direccionDe(f).texto));
  if (!filtroQuePaso.dataset.wireado) {
    filtroQuePaso.dataset.wireado = '1';
    // Wire up filter events
    const filtroTexto = document.getElementById('filtro-resumen-texto');
    filtroTexto.addEventListener('input', renderizarResumenProyectos);
    filtroPM.addEventListener('change', renderizarResumenProyectos);
    filtroQuePaso.addEventListener('change', renderizarResumenProyectos);
  }

  // Apply filters
  const textoFiltro = (document.getElementById('filtro-resumen-texto').value || '').trim().toLowerCase();
  const pmFiltro = document.getElementById('filtro-resumen-pm').value;
  const quePasoFiltro = document.getElementById('filtro-resumen-que-paso').value;
  const soloCambios = document.getElementById('chk-solo-cambios');
  
  let visibles = (soloCambios && soloCambios.checked)
    ? filas.filter(f => f.cambio) : filas;

  // Apply text filter
  if (textoFiltro) {
    visibles = visibles.filter(f =>
      (f.nombre || '').toLowerCase().includes(textoFiltro) ||
      (f.pa || '').toLowerCase().includes(textoFiltro)
    );
  }

  // Apply PM filter
  if (pmFiltro) {
    visibles = visibles.filter(f => f.pm === pmFiltro);
  }

  // Apply "Qué pasó" filter
  if (quePasoFiltro) {
    visibles = visibles.filter(f => direccionDe(f).texto === quePasoFiltro);
  }

  // Update indicator
  const indicador = document.getElementById('indicador-resumen-proyectos');
  if (indicador) {
    const total = soloCambios.checked ? filas.filter(f => f.cambio).length : filas.length;
    indicador.textContent = `${visibles.length} de ${total}`;
  }

  tbody.innerHTML = '';
  visibles.forEach(f => {
    const tr = document.createElement('tr');
    tr.className = 'fila-clicable';
    tr.title = 'Ver la trazabilidad de este proyecto';
    if (f.proyecto) tr.addEventListener('click', () => abrirDetalle(f.proyecto));
    if (f.serie && graficaQueCambioActual()) {
      tr.addEventListener('mouseenter', () => graficaQueCambioActual().destacar(f.serie));
      tr.addEventListener('mouseleave', () => graficaQueCambioActual().destacar(null));
      tr.classList.add('fila-en-grafica');
    }

    const celda = (txt, clase, titulo) => {
      const td = document.createElement('td');
      td.textContent = txt;
      if (clase) td.className = clase;
      if (titulo) td.title = titulo;
      tr.appendChild(td);
      return td;
    };
    const signo = v => (Math.abs(v) < MINIMO_CAMBIO ? '—'
      : (v > 0 ? '+' : '−') + formatearDinero(Math.abs(v)));
    const clase = (v, invertido) => (Math.abs(v) < MINIMO_CAMBIO ? ''
      : ((invertido ? v < 0 : v > 0) ? 'delta-positivo' : 'delta-negativo'));

    celda(f.nombre, 'celda-nombre', f.nombre);
    celda(f.pm);
    // Las cifras se abrevian para que la tabla se lea, pero el valor exacto
    // queda en el tooltip: abreviado no se puede auditar una suma.
    celda(f.nuevo ? '—' : formatearDinero(f.fijoA), 'celda-numero',
      f.nuevo ? '' : formatearDineroExacto(f.fijoA));
    celda(formatearDinero(f.fijoB), 'celda-numero', formatearDineroExacto(f.fijoB));
    celda(signo(f.dFijo), 'celda-numero ' + clase(f.dFijo), formatearDineroExacto(f.dFijo));
    celda(signo(f.dUpside), 'celda-numero ' + clase(f.dUpside, true),
      formatearDineroExacto(f.dUpside));
    const dir = direccionDe(f);
    const td = celda('', 'celda-movimiento');
    const chip = document.createElement('span');
    chip.className = 'chip-movimiento ' + dir.clase;
    chip.textContent = dir.texto;
    td.appendChild(chip);
    const meses = [...new Set(f.lista.map(x => x.ev.campo).filter(Boolean))];
    if (meses.length) {
      const sub = document.createElement('div');
      sub.className = 'celda-submeses';
      sub.textContent = meses.length <= 3
        ? meses.map(capitalizar).join(', ')
        : `${meses.slice(0, 2).map(capitalizar).join(', ')} y ${meses.length - 2} meses más`;
      sub.title = meses.map(capitalizar).join(', ');
      td.appendChild(sub);
    }

    // "13 movimientos" no dice nada por si solo. El boton abre el detalle:
    // que mes, en que fecha, en que direccion y cuanto.
    const tdMov = celda('', 'celda-numero celda-detalle');
    if (f.eventos > 0) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'boton-detalle-mov';
      btn.innerHTML = `<span>${f.eventos}</span> <span class="chevron">▾</span>`;
      btn.title = 'Ver qué se movió exactamente';
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        const abierta = tr.nextSibling && tr.nextSibling.classList
          && tr.nextSibling.classList.contains('fila-detalle-mov');
        if (abierta) {
          tr.nextSibling.remove();
          btn.classList.remove('abierto');
          return;
        }
        tr.after(filaDetalleMovimientos(f));
        btn.classList.add('abierto');
      });
      tdMov.appendChild(btn);
    } else {
      tdMov.textContent = '—';
    }
    tbody.appendChild(tr);
  });

  const nota = document.getElementById('nota-tabla-cambios');
  if (nota) {
    const conCambio = filas.filter(f => f.cambio).length;
    nota.textContent = `${conCambio} de ${filas.length} proyectos se movieron entre ` +
      `${snaps[iA].etiqueta} y ${snaps[iB].etiqueta} · revenue de ${periodoActual().etiqueta}. ` +
      'Clic en un renglón para abrir su trazabilidad.';
  }
}
