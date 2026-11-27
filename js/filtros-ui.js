// Interfaz de filtros: dropdowns, chips, territorio, limpiar y mostrar
// completados/cancelados. Aplicar un filtro repinta las vistas, que aún viven en
// app.js: llegan por `vistas` (ver vistas.js) para no crear un ciclo de imports.
import { estado } from './estado.js';
import { vidaProyecto } from './vida-proyecto.js';
import { DIMENSIONES, etiquetaDimension, pasaDimension, pasaTexto, pasaVisibilidadProyecto, conteosDe, opcionesDe } from './filtros.js';
import { vistas } from './vistas.js';

export function aplicarFiltros() {
  estado.proyectosFiltrados = estado.proyectos.filter(p => {
    if (!pasaVisibilidadProyecto(p)) return false;
    if (!estado.incluirCancelados && p.estado === 'Canceled') return false;
    return DIMENSIONES.every(d => pasaDimension(p, d.campo)) && pasaTexto(p);
  });
  DIMENSIONES.forEach(d => refrescarConteos(d.campo));
  renderizarChips();
  vistas.actualizarUI();
  actualizarResumenRango();
}

function actualizarResumenRango() {
  const visibles = estado.proyectos.filter(pasaVisibilidadProyecto);
  const sinInicio = visibles.filter(p => !vidaProyecto(p).inicio).length;
  const sinFin = visibles.filter(p => !vidaProyecto(p).fin).length;
  const aviso = document.getElementById('forecast-estado');
  if (aviso && estado.proyectos.length) aviso.textContent =
    `${visibles.length} proyectos en el rango · ${estado.proyectos.length} cargados` +
    (sinInicio ? ` · ${sinInicio} sin primer commit` : '') + (sinFin ? ` · ${sinFin} sin fecha fin` : '');
}

function sincronizarMostrarCompletados() {
  document.querySelectorAll('[data-mostrar-completados]').forEach(chk => {
    chk.checked = estado.incluirCompletados;
  });
}

function cambiarMostrarCompletados(incluir) {
  estado.incluirCompletados = incluir;
  sincronizarMostrarCompletados();
  aplicarFiltros();
  const vista = document.querySelector('.pestana-contenido.activa')?.id;
  if (vista === 'pestana-detalle') vistas.renderizarDetalle();
  if (vista === 'pestana-trazabilidad') vistas.renderizarTrazabilidad();
  if (vista === 'pestana-pms') vistas.renderizarPMs();
}

export function inicializarFiltroTerritorio() {
  document.querySelectorAll('[name="forecast-territorio"]').forEach(control=>{
    control.checked=control.value===estado.territorio;
    control.addEventListener('change',()=>{
      if(!control.checked)return;
      estado.territorio=control.value;estado.filtros.pais=[];
      aplicarFiltros();
      if(estado.proyectoSeleccionado)vistas.renderizarDetalle();
      if(estado.historia)vistas.renderizarTrazabilidad();
      vistas.renderizarPMs();
    });
  });
}

export function inicializarFiltros() {
  const fila = document.getElementById('fila-dropdowns');
  fila.innerHTML = '';
  DIMENSIONES.forEach(dim => fila.appendChild(construirDropdown(dim)));

  document.getElementById('filtro-texto').addEventListener('input', e => {
    estado.filtros.texto = e.target.value;
    aplicarFiltros();
  });

  document.getElementById('btn-limpiar-filtros').addEventListener('click', limpiarFiltros);

  sincronizarMostrarCompletados();
  // Delegación para incluir el control que se crea al abrir Otros proyectos del cliente.
  document.addEventListener('change', e => {
    if (!e.target.matches('[data-mostrar-completados]')) return;
    const id = e.target.id;
    cambiarMostrarCompletados(e.target.checked);
    document.getElementById(id)?.focus({ preventScroll: true });
  });

  const chk = document.getElementById('incluir-cancelados');
  if (chk) {
    chk.checked = estado.incluirCancelados;
    chk.addEventListener('change', () => {
      estado.incluirCancelados = chk.checked;
      aplicarFiltros();
    });
  }

  // Un clic fuera cierra cualquier dropdown abierto.
  document.addEventListener('click', e => {
    if (!e.target.closest('.dropdown-filtro')) cerrarDropdowns();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') cerrarDropdowns();
  });

  aplicarFiltros();
}

export function cerrarDropdowns(excepto) {
  document.querySelectorAll('.dropdown-filtro.abierto').forEach(d => {
    if (d !== excepto) {
      d.classList.remove('abierto');
      d.querySelector('.dropdown-boton').setAttribute('aria-expanded', 'false');
    }
  });
}

function construirDropdown(dim) {
  const cont = document.createElement('div');
  cont.className = 'dropdown-filtro';
  cont.dataset.campo = dim.campo;

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'dropdown-boton';
  boton.setAttribute('aria-expanded', 'false');
  boton.setAttribute('aria-controls', `opciones-${dim.campo}`);
  boton.innerHTML = `<span class="dropdown-etiqueta">${dim.etiqueta}</span>
                     <span class="dropdown-badge"></span>
                     <span class="dropdown-flecha" aria-hidden="true">▾</span>`;
  boton.addEventListener('click', e => {
    e.stopPropagation();
    const abierto = cont.classList.contains('abierto');
    cerrarDropdowns(cont);
    cont.classList.toggle('abierto', !abierto);
    boton.setAttribute('aria-expanded', String(!abierto));
  });

  const panel = document.createElement('div');
  panel.className = 'dropdown-panel';
  panel.id = `opciones-${dim.campo}`;

  const opciones = opcionesDe(dim.campo);
  if (opciones.length > 10) {
    const buscador = document.createElement('input');
    buscador.type = 'text';
    buscador.className = 'dropdown-buscar';
    buscador.placeholder = 'Filtrar opciones...';
    buscador.setAttribute('aria-label', `Buscar opciones de ${dim.etiqueta}`);
    buscador.addEventListener('click', e => e.stopPropagation());
    buscador.addEventListener('input', () => {
      const q = buscador.value.toLowerCase();
      panel.querySelectorAll('.dropdown-opcion').forEach(fila => {
        fila.style.display = (fila.dataset.valor+' '+etiquetaDimension(dim.campo,fila.dataset.valor)).toLowerCase().includes(q) ? '' : 'none';
      });
    });
    panel.appendChild(buscador);
  }

  const lista = document.createElement('div');
  lista.className = 'dropdown-lista';
  opciones.forEach(valor => {
    const fila = document.createElement('label');
    fila.className = 'dropdown-opcion';
    fila.dataset.valor = valor;
    fila.innerHTML = `<input type="checkbox" value="${valor.replace(/"/g, '&quot;')}">
                      <span class="opcion-texto">${etiquetaDimension(dim.campo,valor)}</span>
                      <span class="opcion-conteo" data-conteo-de="${valor.replace(/"/g, '&quot;')}"></span>`;
    fila.querySelector('input').addEventListener('change', ev => {
      const marcados = estado.filtros[dim.campo];
      if (ev.target.checked) marcados.push(valor);
      else marcados.splice(marcados.indexOf(valor), 1);
      aplicarFiltros();
    });
    lista.appendChild(fila);
  });
  panel.appendChild(lista);

  const pie = document.createElement('button');
  pie.type = 'button';
  pie.className = 'dropdown-limpiar';
  pie.textContent = 'Quitar selección';
  pie.addEventListener('click', e => {
    e.stopPropagation();
    estado.filtros[dim.campo] = [];
    aplicarFiltros();
  });
  panel.appendChild(pie);

  cont.appendChild(boton);
  cont.appendChild(panel);
  return cont;
}

function refrescarConteos(campo) {
  const cont = document.querySelector(`.dropdown-filtro[data-campo="${campo}"]`);
  if (!cont) return;
  const conteos = conteosDe(campo);
  const marcados = estado.filtros[campo];

  cont.querySelectorAll('.dropdown-opcion').forEach(fila => {
    const valor = fila.dataset.valor;
    const n = conteos.get(valor) || 0;
    fila.querySelector('.opcion-conteo').textContent = n;
    fila.querySelector('input').checked = marcados.includes(valor);
    // Una opción que no sumaría nada se atenúa, pero sigue marcable.
    fila.classList.toggle('vacia', n === 0 && !marcados.includes(valor));
  });

  const badge = cont.querySelector('.dropdown-badge');
  badge.textContent = marcados.length ? marcados.length : '';
  cont.classList.toggle('activo', marcados.length > 0);
}

function renderizarChips() {
  const zona = document.getElementById('chips-activos');
  if (!zona) return;
  const chips = [];
  DIMENSIONES.forEach(dim => {
    estado.filtros[dim.campo].forEach(valor => {
      chips.push({ campo: dim.campo, etiqueta: dim.etiqueta, valor });
    });
  });

  zona.innerHTML = '';
  if (chips.length === 0) { zona.classList.add('vacio'); return; }
  zona.classList.remove('vacio');

  chips.forEach(c => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.innerHTML = `<span class="chip-dim">${c.etiqueta}</span>
                      <span class="chip-valor">${etiquetaDimension(c.campo,c.valor)}</span>
                      <span class="chip-x" aria-hidden="true">×</span>`;
    chip.title = `Quitar filtro ${c.etiqueta}: ${c.valor}`;
    chip.addEventListener('click', () => {
      const m = estado.filtros[c.campo];
      m.splice(m.indexOf(c.valor), 1);
      aplicarFiltros();
    });
    zona.appendChild(chip);
  });
}

function limpiarFiltros() {
  estado.territorio='todos';
  document.querySelectorAll('[name="forecast-territorio"]').forEach(c=>{c.checked=c.value==='todos';});
  DIMENSIONES.forEach(d => { estado.filtros[d.campo] = []; });
  estado.filtros.texto = '';
  document.getElementById('filtro-texto').value = '';
  aplicarFiltros();
}
