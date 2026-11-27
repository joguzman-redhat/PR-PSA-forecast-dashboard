// Tabla del listado de proyectos: encabezados, filas, ordenamiento y lectura
// completa del estatus. Abrir el detalle sigue en app.js: llega por `vistas`
// (ver vistas.js) para no crear un ciclo de imports.
import { estado } from './estado.js';
import { formatearDinero, formatearNumero, formatearPorcentaje, normalizarValor, obtenerEtiquetaValor } from './formato.js';
import { anioRevenue, periodoActual } from './calendario.js';
import { valorBooking, acumuladoAnterior, revenuePeriodo, ejecutadoProyecto, backlogHoy } from './dinero-proyecto.js';
import { backlogDe } from './fila-backlog.js';
import { pasaVisibilidadProyecto } from './filtros.js';
import { CAMPOS_DINERO, CAMPOS_PORCENTAJE, CAMPOS_ID, identificador, chipsIdentidad, claseVencimiento } from './campos-proyecto.js';
import { vistas } from './vistas.js';

function abrirLecturaEstatus(proyecto) {
  let dialogo = document.getElementById('dialogo-estatus');
  if (!dialogo) {
    dialogo = document.createElement('dialog');
    dialogo.id = 'dialogo-estatus';
    dialogo.className = 'dialogo-estatus';
    dialogo.setAttribute('aria-labelledby', 'titulo-dialogo-estatus');
    dialogo.setAttribute('aria-describedby', 'proyecto-dialogo-estatus');
    const cabecera = document.createElement('div');
    cabecera.className = 'dialogo-estatus-cabecera';
    const titulo = document.createElement('h2');
    titulo.id = 'titulo-dialogo-estatus';
    titulo.textContent = 'Estatus del proyecto';
    const cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.className = 'pf-v6-c-button pf-m-secondary';
    cerrar.textContent = 'Cerrar';
    cerrar.autofocus = true;
    cerrar.addEventListener('click', () => dialogo.close());
    cabecera.append(titulo, cerrar);
    const nombre = document.createElement('p');
    nombre.id = 'proyecto-dialogo-estatus';
    nombre.className = 'dialogo-estatus-proyecto';
    const texto = document.createElement('div');
    texto.id = 'texto-dialogo-estatus';
    texto.className = 'dialogo-estatus-texto';
    texto.tabIndex = 0;
    texto.setAttribute('aria-label', 'Estatus completo');
    dialogo.append(cabecera, nombre, texto);
    document.body.appendChild(dialogo);
  }
  document.getElementById('proyecto-dialogo-estatus').textContent =
    `${identificador(proyecto).valor} · ${proyecto.nombre_del_proyecto || 'Proyecto sin nombre'}`;
  const texto = document.getElementById('texto-dialogo-estatus');
  texto.textContent = obtenerEtiquetaValor(proyecto.estatus);
  texto.scrollTop = 0;
  dialogo.showModal();
}

export function renderizarTabla() {
  const tabla = document.getElementById('tabla-proyectos');
  const thead = tabla.querySelector('thead tr');
  const tbody = tabla.querySelector('tbody');
  const vistaVendedor = estado.filtros.vendedor.length > 0;
  tabla.classList.toggle('vista-vendedor', vistaVendedor);

  // Limpiar
  thead.innerHTML = '';
  tbody.innerHTML = '';

  // Mantener el orden habitual; las notas pasan al inicio al filtrar por vendedor.
  let columnasVerdes = estado.metadataProyectos.columnas
    .filter(c => c.verde || c.key === 'estatus')
    .map(c => c.key);
  if (!columnasVerdes.includes('estatus')) columnasVerdes.push('estatus');

  // Headers
  const COL_ID = '__identificador';
  const COL_REVENUE = '__revenue_periodo';
  const columnasResumen = new Set(['estatus', 'fecha_fin', 'estado', 'nombre_del_proyecto', 'pm_lider', 'valor_of', 'backlog', 'backlog_2026', COL_REVENUE]);
  if (vistaVendedor) {
    columnasVerdes.splice(columnasVerdes.indexOf('estatus'), 1);
    columnasVerdes.unshift('estatus', COL_ID);
  } else columnasVerdes.unshift(COL_ID);
  columnasVerdes.push(COL_REVENUE);
  if(!columnasVerdes.includes('fecha_fin'))columnasVerdes.push('fecha_fin');
  const compacto=vistaVendedor?['estatus','fecha_fin','estado','nombre_del_proyecto','pm_lider']:['estado','nombre_del_proyecto','pm_lider','estatus','fecha_fin'];
  columnasVerdes=[...compacto,...columnasVerdes.filter(c=>!compacto.includes(c))];
  columnasVerdes.forEach((key) => {
    const col = estado.metadataProyectos.columnas.find(c => c.key === key)
      || { label: key === COL_ID ? 'PA / PR' : key === 'estatus' ? 'Estatus' : `Revenue · ${periodoActual().etiqueta}` };
    const th = document.createElement('th');
    const ord = estado.orden || {};
    const etiqueta = ({ acumulado_anterior: `Acumulado anterior a ${anioRevenue()}`, backlog: 'Backlog', consumido_2025: `Acumulado anterior a ${anioRevenue()}`, estatus: 'Estatus', valor_of: 'Valor Booking', backlog_2026: 'Backlog', pm_lider: 'PM/Líder', fecha_fin: 'Fecha finalización' })[key] || col.label;
    th.textContent = etiqueta + (ord.columna === key ? (ord.desc ? '  ↓' : '  ↑') : '');
    th.dataset.columna = key;
    if (key === 'estatus') th.classList.add('columna-estatus');
    if (!columnasResumen.has(key)) th.classList.add('columna-secundaria');
    th.title = `Ordenar por ${col.label}`;
    if (ord.columna === key) th.classList.add('col-ordenada');
    th.addEventListener('click', () => ordenarTabla(key));
    thead.appendChild(th);
  });

  // Rows
  estado.proyectosFiltrados.forEach((proyecto) => {
    const tr = document.createElement('tr');
    tr.addEventListener('click', () => vistas.abrirDetalle(proyecto));

    columnasVerdes.forEach(key => {
      const td = document.createElement('td');
      let valor;
      if (key === COL_REVENUE) {
        valor = revenuePeriodo(proyecto);
      } else if (key === 'valor_of') {
        valor = valorBooking(proyecto);
      } else if (key === 'acumulado_a_hoy') {
        valor = ejecutadoProyecto(proyecto);
      } else if ((key === 'consumido_2025' || key === 'acumulado_anterior')) {
        valor = acumuladoAnterior(proyecto);
      } else if ((key === 'backlog_2026' || key === 'backlog')) {
        valor = backlogHoy(proyecto);
      } else {
        valor = proyecto[key];
      }

      // Formatos especiales
      if(key==='estado'&&valor==='On Hold')td.classList.add('estado-on-hold');
      if (key === 'estatus') {
        td.className = 'columna-estatus';
        if (normalizarValor(valor) === null || String(valor).trim() === '') td.textContent = '—';
        else if (vistaVendedor) {
          const boton = document.createElement('button');
          boton.type = 'button';
          boton.className = 'estatus-lectura';
          boton.setAttribute('aria-haspopup', 'dialog');
          boton.setAttribute('aria-label', `Leer estatus completo de ${identificador(proyecto).valor}`);
          const vistaPrevia = document.createElement('span');
          vistaPrevia.className = 'estatus-vista-previa';
          vistaPrevia.textContent = String(valor);
          const indicacion = document.createElement('span');
          indicacion.className = 'estatus-leer-mas';
          indicacion.textContent = 'Leer completo';
          boton.append(vistaPrevia, indicacion);
          boton.addEventListener('click', e => {
            e.stopPropagation();
            abrirLecturaEstatus(proyecto);
          });
          td.appendChild(boton);
        } else {
          td.textContent = String(valor);
          td.title = String(valor);
        }
      } else if (key === COL_ID) {
        const id = identificador(proyecto);
        td.textContent = id.valor;
        td.className = 'celda-id';
        if (id.tipo === 'PR') td.title = 'Todavía sin PA asignado: se identifica por el PR';
        if (proyecto.start_at_risk) {
          const b = document.createElement('span');
          b.className = 'badge-riesgo';
          b.textContent = 'riesgo';
          b.title = 'Start at risk (dato simulado en el PoC)';
          td.appendChild(document.createTextNode(' '));
          td.appendChild(b);
        }
        chipsIdentidad(proyecto).filter(c => c.clase === 'chip-sin-identificar').forEach(c => {
          const marca = document.createElement('span');
          marca.className = c.clase;
          marca.textContent = c.texto;
          marca.title = c.titulo;
          td.appendChild(document.createTextNode(' '));
          td.appendChild(marca);
        });
        // "sin backlog" chip si no hay fila de backlog
        if (!backlogDe(proyecto)) {
          const chip = document.createElement('span');
          chip.className = 'chip-sin-backlog';
          chip.textContent = 'sin backlog';
          chip.title = 'Este proyecto no tiene fila en BackLog NOLA: las cifras de revenue son nulas';
          td.appendChild(document.createTextNode(' '));
          td.appendChild(chip);
        }
      } else if (key === COL_REVENUE) {
        td.textContent = valor === null ? '—' : formatearDinero(valor);
        td.className = 'celda-numero';
      } else if (key === 'executive_watchlist') {
        td.style.textAlign = 'center';
        if (proyecto.executive_watchlist) {
          const chip = document.createElement('span');
          chip.className = 'chip-dato chip-bueno';
          chip.textContent = '✓';
          chip.style.fontSize = '0.75rem';
          chip.style.padding = '2px 6px';
          td.appendChild(chip);
        } else {
          td.textContent = '';
        }
      } else if (key === 'project_status') {
        if (proyecto.project_status) {
          const statusMap = { 'Red': 'Rojo', 'Yellow': 'Amarillo', 'Green': 'Verde' };
          const statusColor = { 'Red': '#c9190b', 'Yellow': '#f0ab00', 'Green': '#3e8635' };
          const dot = document.createElement('span');
          dot.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:50%;background:${statusColor[proyecto.project_status] || '#8a8d90'};margin-right:4px;`;
          td.appendChild(dot);
          td.appendChild(document.createTextNode(statusMap[proyecto.project_status] || proyecto.project_status));
        } else {
          td.textContent = '—';
        }
        td.style.fontSize = '0.8125rem';
      } else if (CAMPOS_DINERO.has(key)) {
        td.textContent = formatearDinero(valor);
        td.className = 'celda-numero';
      } else if (CAMPOS_PORCENTAJE.has(key)) {
        td.textContent = formatearPorcentaje(valor);
        td.className = 'celda-numero';
      } else if (CAMPOS_ID.has(key)) {
        // Son identificadores, no cantidades: sin separador de miles.
        // "62.249" en vez de "62249" confunde y no se puede buscar.
        td.textContent = normalizarValor(valor) ? String(valor) : '—';
        td.className = 'celda-id';
      } else if (key === 'dias_para_vencimiento') {
        td.textContent = normalizarValor(valor) ? formatearNumero(valor) : '—';
        td.className = 'celda-numero ' + claseVencimiento(valor);
      } else if (key === 'estado') {
        td.textContent = obtenerEtiquetaValor(valor);
        td.className = 'celda-estado'+(valor==='On Hold'?' estado-on-hold':'');
      } else {
        td.textContent = obtenerEtiquetaValor(valor);
        td.title = obtenerEtiquetaValor(valor);
      }

      if (!normalizarValor(valor)) {
        td.className += ' celda-nulo';
      }

      if (!columnasResumen.has(key)) td.classList.add('columna-secundaria');
      tr.appendChild(td);
    });

    // Apply subtle row tinting based on project_status
    if (proyecto.project_status === 'Red') {
      tr.classList.add('fila-status-red');
    } else if (proyecto.project_status === 'Yellow') {
      tr.classList.add('fila-status-yellow');
    }

    tbody.appendChild(tr);
  });

  // Actualizar indicador
  document.getElementById('indicador-proyectos').textContent =
    `${estado.proyectosFiltrados.length} de ${estado.proyectos.filter(pasaVisibilidadProyecto).length} proyectos`;
}

export function ordenarTabla(columna) {
  // Segundo clic en la misma columna = invierte el orden.
  const orden = estado.orden || {};
  const desc = orden.columna === columna ? !orden.desc : true;
  estado.orden = { columna, desc };

  // El tipo se decide mirando TODA la columna, no la primera fila: muchas
  // traen null arriba por los errores del Excel y eso haría ordenar
  // números como si fueran texto.
  // La columna de revenue del periodo no vive en el proyecto: se calcula.
  const leer = p => {
    if (columna === '__revenue_periodo') return revenuePeriodo(p);
    if (columna === '__identificador') return identificador(p).valor;
    if (columna === 'valor_of') return valorBooking(p);
    if (columna === 'acumulado_a_hoy') return ejecutadoProyecto(p);
    if ((columna === 'consumido_2025' || columna === 'acumulado_anterior')) return acumuladoAnterior(p);
    if ((columna === 'backlog_2026' || columna === 'backlog')) return backlogHoy(p);
    return p[columna];
  };
  const esNumerica = estado.proyectosFiltrados.some(p => typeof leer(p) === 'number');

  estado.proyectosFiltrados.sort((a, b) => {
    const va = leer(a), vb = leer(b);
    // Los sin dato siempre al final, suba o baje el orden: no son "el menor",
    // son una ausencia, y arriba solo estorban.
    const na = va === null || va === undefined || va === '';
    const nb = vb === null || vb === undefined || vb === '';
    if (na && nb) return 0;
    if (na) return 1;
    if (nb) return -1;

    const cmp = esNumerica
      ? (Number(va) || 0) - (Number(vb) || 0)
      : String(va).localeCompare(String(vb), 'es', { numeric: true });
    return desc ? -cmp : cmp;
  });

  renderizarTabla();
}
