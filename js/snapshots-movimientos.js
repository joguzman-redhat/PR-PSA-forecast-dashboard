// Tabla de movimientos registrados entre Snapshots.

import { MESES_ES, mesesActivos, periodoActual } from './calendario.js';
import { identificador } from './campos-proyecto.js';
import { claveProyecto, clavesProyectosOcultos } from './clave-proyecto.js';
import { abrirDetalle } from './detalle.js';
import { estado } from './estado.js';
import { SIN_DATO } from './filtros.js';
import { formatearDinero } from './formato.js';
import { actualizarOpcionesFiltro } from './opciones-filtro.js';
import { rangoSnapshots } from './snapshots-rango.js';

// Qué campo cambió, no "hacia dónde se movió": commit y upside se tratan
// como dos datos independientes, no como un cupo que se transfiere entre
// los dos (un commit que baja no implica que el upside haya subido).
export const TIPO_MOVIMIENTO = {
  commit: { texto: 'Commit', clase: 'mov-campo-commit' },
  upside: { texto: 'Upside', clase: 'mov-campo-upside' },
  alta_proyecto: { texto: 'Entró al backlog', clase: 'mov-nuevo' },
  baja_proyecto: { texto: 'Salió del backlog', clase: 'mov-desconfirma' },
};

/** Clic en una columna de "Movimientos registrados" ordena por ella; un
 * segundo clic en la misma invierte el orden. Por defecto se ordena por el
 * delta más grande, que es como se leía antes de que esto existiera. */
export function ordenarTablaEventos(columna) {
  const orden = estado.ordenEventos || {};
  const desc = orden.columna === columna ? !orden.desc : true;
  estado.ordenEventos = { columna, desc };
  actualizarTablaEventos();
}

export function actualizarTablaEventos() {
  const hist = estado.historia;
  const tabla = document.querySelector('#tabla-eventos-cambio tbody');
  if (!tabla) return;
  tabla.innerHTML = '';

  const tipo = document.getElementById('filtro-tipo-evento').value;
  const busca = (document.getElementById('buscar-evento-proyecto').value || '')
    .trim().toLowerCase();
  const limitar = document.getElementById('limitar-por-proyecto').checked;
  const ocultos = clavesProyectosOcultos();

  // Initialize PM filter
  const filtroPMEvento = document.getElementById('filtro-eventos-pm');
  if (filtroPMEvento) {
    const nombreDe = new Map(estado.proyectos.map(
      p => [claveProyecto(p), p.pm_lider || SIN_DATO]));
    actualizarOpcionesFiltro(filtroPMEvento, hist.eventos.filter(e => !ocultos.has(String(e.num_pa)))
      .map(e => nombreDe.get(String(e.num_pa))).filter(Boolean));
    if (!filtroPMEvento.dataset.wireado) {
      filtroPMEvento.dataset.wireado = '1';
      filtroPMEvento.addEventListener('change', actualizarTablaEventos);
    }
  }
  const pmEvento = filtroPMEvento ? filtroPMEvento.value : '';

  // Initialize Mes filter
  const filtroMesEvento = document.getElementById('filtro-eventos-mes');
  if (filtroMesEvento && filtroMesEvento.options.length === 1) {
    MESES_ES.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m.charAt(0).toUpperCase() + m.slice(1);
      filtroMesEvento.appendChild(opt);
    });
    filtroMesEvento.addEventListener('change', actualizarTablaEventos);
  }
  const mesEvento = filtroMesEvento ? filtroMesEvento.value : '';

  const nombreDe = new Map(estado.proyectos.map(
    p => [claveProyecto(p), p.nombre_del_proyecto || identificador(p).valor]));
  const pmDe = new Map(estado.proyectos.map(
    p => [claveProyecto(p), p.pm_lider || SIN_DATO]));

  const mesesOk = new Set(mesesActivos().map(i => MESES_ES[i]));
  // Solo los movimientos del rango "Desde / hasta": cada evento lleva la fecha
  // del snapshot que lo detectó, así que entra si cae en (Desde, hasta].
  const [iA, iB] = rangoSnapshots();
  const desde = new Date(hist.snapshots[iA].timestamp);
  const hasta = new Date(hist.snapshots[iB].timestamp);
  const enRango = hist.eventos.filter(e => {
    if (ocultos.has(String(e.num_pa))) return false;
    const t = new Date(e.timestamp);
    return t > desde && t <= hasta;
  });
  // Base del contador "N de M": los movimientos del rango y del periodo, sin los filtros de la tabla.
  const totalPeriodo = enRango.filter(e => !e.campo || mesesOk.has(e.campo)).length;
  let eventos = enRango.filter(e => {
    if (e.campo && !mesesOk.has(e.campo)) return false;   // mes fuera del periodo
    if (tipo && e.tipo !== tipo) return false;
    if (pmEvento) {
      const pmProyecto = pmDe.get(String(e.num_pa));
      if (pmProyecto !== pmEvento) return false;
    }
    if (mesEvento && e.campo !== mesEvento) return false;
    if (!busca) return true;
    const nombre = nombreDe.get(String(e.num_pa)) || e.nombre || '';
    return (nombre + ' ' + e.num_pa).toLowerCase().includes(busca);
  });

  const ordenEv = estado.ordenEventos;
  if (ordenEv && ordenEv.columna) {
    const leer = (e) => {
      if (ordenEv.columna === 'nombre') return nombreDe.get(String(e.num_pa)) || e.nombre || '';
      if (ordenEv.columna === 'tipo') return (TIPO_MOVIMIENTO[e.tipo] || { texto: e.tipo || '' }).texto;
      const v = e[ordenEv.columna];
      return v === null || v === undefined ? '' : v;
    };
    eventos = eventos.slice().sort((a, b) => {
      const va = leer(a), vb = leer(b);
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb : String(va).localeCompare(String(vb));
      return ordenEv.desc ? -cmp : cmp;
    });
  } else {
    eventos = eventos.slice().sort((a, b) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0));
  }

  document.querySelectorAll('#tabla-eventos-cambio thead th[data-columna]').forEach(th => {
    const activa = ordenEv && ordenEv.columna === th.dataset.columna;
    th.classList.toggle('col-ordenada', !!activa);
    const base = th.textContent.replace(/\s*[↑↓]\s*$/, '');
    th.textContent = base + (activa ? (ordenEv.desc ? '  ↓' : '  ↑') : '');
  });

  // Sin este tope, el proyecto más grande del portafolio se queda con todas
  // las filas y la tabla deja de ser una vista global.
  if (limitar) {
    const vistos = new Map();
    eventos = eventos.filter(e => {
      const n = (vistos.get(e.num_pa) || 0) + 1;
      vistos.set(e.num_pa, n);
      return n <= 2;
    });
  }

  const mostrados = eventos.slice(0, 80);
  mostrados.forEach(ev => {
    const tr = document.createElement('tr');
    const proy = estado.proyectos.find(p => claveProyecto(p) === String(ev.num_pa));
    if (proy) {
      tr.className = 'fila-clicable';
      tr.title = 'Ver la trazabilidad de este proyecto';
      tr.addEventListener('click', () => abrirDetalle(proy));
    }
    const nombre = (proy && proy.nombre_del_proyecto) || ev.nombre || '—';
    const pm = (proy && proy.pm_lider) || pmDe.get(String(ev.num_pa)) || '—';
    const fecha = new Date(ev.timestamp).toLocaleDateString('es-CO',
      { day: '2-digit', month: 'short', year: 'numeric' });
    const d = ev.delta || 0;
    const signo = Math.abs(d) < 0.5 ? '—' : (d > 0 ? '+' : '−') + formatearDinero(Math.abs(d));

    [[fecha, ''], [nombre, 'celda-nombre'], [pm, ''],
      [(TIPO_MOVIMIENTO[ev.tipo] || { texto: ev.tipo || '' }).texto, ''],
      [ev.campo ? ev.campo.charAt(0).toUpperCase() + ev.campo.slice(1) : '—', ''],
      [formatearDinero(ev.valor_anterior), 'celda-numero'],
      [formatearDinero(ev.valor_nuevo), 'celda-numero'],
      [signo, 'celda-numero ' + (Math.abs(d) < 0.5 ? '' : d > 0 ? 'delta-positivo' : 'delta-negativo')],
    ].forEach(([txt, c], i) => {
      const td = document.createElement('td');
      td.textContent = txt;
      td.className = c || "";if(td.textContent==="On Hold")td.classList.add("estado-on-hold");
      if (i === 1 || i === 2) td.title = txt;  // title for Proyecto and PM columns
      tr.appendChild(td);
    });
    tabla.appendChild(tr);
  });

  const distintos = new Set(mostrados.map(e => e.num_pa)).size;
  const indicador = document.getElementById('indicador-eventos');
  if (indicador) {
    indicador.textContent = `${mostrados.length} de ${totalPeriodo}`;
  }
  let pie = document.getElementById('pie-eventos');
  if (!pie) {
    pie = document.createElement('p');
    pie.id = 'pie-eventos';
    pie.className = 'nota-tabla';
    document.querySelector('#tabla-eventos-cambio').after(pie);
  }
  pie.textContent = `Mostrando ${mostrados.length} de ${eventos.length} movimientos ` +
    `de ${distintos} proyectos distintos · revenue de ${periodoActual().etiqueta}.`;
}
