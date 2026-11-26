// Orquestación de las gráficas del Inicio: alimenta cada gráfica con los
// proyectos filtrados del estado.

import { identificador } from './campos-proyecto.js';
import { backlogHoy, ejecutadoProyecto, ejecucionPonderada, proyectadoProyecto, sumaConDato, valorBooking } from './dinero-proyecto.js';
import { estado } from './estado.js';
import { DIMENSIONES, SIN_DATO, valorDimension } from './filtros.js';
import { aplicarFiltros } from './filtros-ui.js';
import { formatearDinero } from './formato.js';
import { crearGraficaBarrasAgrupadasHorizontal } from './grafica-barras-agrupadas-horizontal.js';
import { crearGraficaBarrasApiladas } from './grafica-barras-apiladas.js';
import { crearGraficaBarrasSimple } from './grafica-barras-simple.js';
import { COLORES_SERIES_COMPARACION, colorDeEntidad, fijarColores } from './grafica-base.js';
import { renderizarResumenPM } from './resumen-pm.js';
import { renderizarSemaforoProyectos } from './semaforo-proyectos.js';
import { renderizarTablaNoIniciados } from './tabla-no-iniciados.js';

export function actualizarGraficas() {
  const proyectos = estado.proyectosFiltrados;

  const agrupar = (campo, medida) => {
    const acum = new Map();
    proyectos.forEach(p => {
      const k = valorDimension(p, campo);
      acum.set(k, (acum.get(k) || 0) + medida(p));
    });
    return Array.from(acum, ([etiqueta, valor]) => ({ etiqueta, valor }))
      .sort((a, b) => b.valor - a.valor);
  };
  const dinero = v => `$${(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  // Semáforo de proyectos
  renderizarSemaforoProyectos(proyectos);

  // Verificar si hay exactamente un vendedor filtrado
  const vendedorUnico = estado.filtros.vendedor.length === 1 ? estado.filtros.vendedor[0] : null;
  const cardVendedor = document.getElementById('card-vendedor-resumen');
  if (vendedorUnico && cardVendedor) {
    cardVendedor.style.display = 'block';
    // Calcular estadísticas del vendedor
    const proysVendedor = proyectos.filter(p => valorDimension(p, 'vendedor') === vendedorUnico);
    // Un proyecto sin cifras no cuenta como cero: se ignora en cada total.
    const bookingTotal = sumaConDato(proysVendedor, valorBooking);
    const acum = sumaConDato(proysVendedor, ejecutadoProyecto);
    const backlogTotal = sumaConDato(proysVendedor, backlogHoy);
    const ejecucionVendedor = ejecucionPonderada(proysVendedor);
    const pctEjec = ejecucionVendedor === null ? '—' : ejecucionVendedor.toFixed(1);

    const porEstado = new Map();
    proysVendedor.forEach(p => {
      const est = p.estado || SIN_DATO;
      porEstado.set(est, (porEstado.get(est) || 0) + 1);
    });

    const topClientes = new Map();
    proysVendedor.forEach(p => {
      const cli = p.cliente || SIN_DATO;
      topClientes.set(cli, (topClientes.get(cli) || 0) + (valorBooking(p) || 0));
    });
    const top5 = Array.from(topClientes, ([cli, val]) => ({ cli, val }))
      .sort((a, b) => b.val - a.val).slice(0, 5);

    document.getElementById('vendedor-nombre').textContent = vendedorUnico;
    document.getElementById('vendedor-n-proyectos').textContent = proysVendedor.length;
    document.getElementById('vendedor-booking').textContent = formatearDinero(bookingTotal);
    document.getElementById('vendedor-acumulado').textContent = formatearDinero(acum);
    document.getElementById('vendedor-backlog').textContent = formatearDinero(backlogTotal);
    document.getElementById('vendedor-pct-ejec').textContent = pctEjec + (pctEjec === '—' ? '' : '%');

    let htmlEstados = '';
    ['In Progress', 'On Hold', 'Planned', 'Completed'].forEach(est => {
      const n = porEstado.get(est) || 0;
      if (n > 0) htmlEstados += `<span class="vendedor-badge${est==='On Hold'?' estado-on-hold':''}">${est}: ${n}</span> `;
    });
    document.getElementById('vendedor-por-estado').innerHTML = htmlEstados || '—';

    let htmlClientes = '';
    top5.forEach(({ cli, val }) => {
      htmlClientes += `<div class="vendedor-cliente">${cli}: ${formatearDinero(val)}</div>`;
    });
    document.getElementById('vendedor-top-clientes').innerHTML = htmlClientes || '—';
  } else if (cardVendedor) {
    cardVendedor.style.display = 'none';
  }

  renderizarResumenPM(proyectos);

  // 1. Proyectos por estado
  const ordenEstado = (estado.metadataProyectos || {}).orden_estado || [];
  fijarColores('estado', ordenEstado);
  const porEstado = agrupar('estado', () => 1)
    .sort((a, b) => {
      const ia = ordenEstado.indexOf(a.etiqueta), ib = ordenEstado.indexOf(b.etiqueta);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  porEstado.forEach(d => { d.exacto = `${d.valor} proyecto${d.valor === 1 ? '' : 's'}`; });
  crearGraficaBarrasSimple('grafica-estado', porEstado, {
    formato: 'conteo', campoColor: 'estado', unidad: 'Proyectos',
  });

  // 2. Valor Booking por Zona
  const porZona = agrupar('zona', p => valorBooking(p) || 0);
  porZona.forEach(d => { d.exacto = dinero(d.valor); });
  crearGraficaBarrasSimple('grafica-zona', porZona, {
    formato: 'dinero', unidad: 'Valor Booking',
  });

  // 3. Top 10 Países
  const porPais = agrupar('pais', p => valorBooking(p) || 0).slice(0, 10);
  porPais.forEach(d => { d.exacto = dinero(d.valor); });
  crearGraficaBarrasSimple('grafica-paises', porPais, {
    formato: 'dinero', unidad: 'Valor Booking',
  });

  // 4. Ejecución por PM (recalculado: ejecutadoProyecto / valorBooking)
  const suma = new Map(), cuenta = new Map();
  proyectos.forEach(p => {
    if (!p.pm_lider) return;
    const booking = valorBooking(p);
    const acum = ejecutadoProyecto(p);
    if (booking === null || acum === null || booking <= 0) return;
    const pct = acum / booking;
    const k = String(p.pm_lider);
    suma.set(k, (suma.get(k) || 0) + pct);
    cuenta.set(k, (cuenta.get(k) || 0) + 1);
  });
  const porPM = Array.from(suma, ([etiqueta, s]) => ({
    etiqueta,
    valor: (s / cuenta.get(etiqueta)) * 100,
    n: cuenta.get(etiqueta),
  })).sort((a, b) => b.valor - a.valor).slice(0, 10);
  porPM.forEach(d => { d.exacto = `${d.valor.toFixed(1)}%  (${d.n} proyectos)`; });
  crearGraficaBarrasSimple('grafica-pm', porPM, {
    formato: 'porcentaje', unidad: 'Ejecución promedio',
  });

  // 5. Ejecutado vs. planeado por cliente (horizontal grouped bars)
  const porCliente = new Map();
  proyectos.forEach(p => {
    const cli = p.cliente || SIN_DATO;
    const zona = p.zona || SIN_DATO;
    if (!porCliente.has(cli)) {
      porCliente.set(cli, { booking: 0, acumulado: 0, proyectada: 0, backlog: 0, zona });
    }
    const acc = porCliente.get(cli);
    acc.booking += valorBooking(p) || 0;
    acc.acumulado += ejecutadoProyecto(p) || 0;
    acc.proyectada += proyectadoProyecto(p) || 0;
    acc.backlog += backlogHoy(p) || 0;
  });
  const datosCliente = Array.from(porCliente, ([cli, vals]) => ({
    etiqueta: cli,
    zona: vals.zona,
    booking: vals.booking,
    series: [
      { nombre: 'Valor Booking', valor: vals.booking, color: COLORES_SERIES_COMPARACION.booking },
      { nombre: 'Ejecutado', valor: vals.acumulado, color: COLORES_SERIES_COMPARACION.acumulado },
      { nombre: 'Proyectado', valor: vals.proyectada, color: COLORES_SERIES_COMPARACION.proyectada },
      { nombre: 'Backlog', valor: vals.backlog, color: COLORES_SERIES_COMPARACION.backlog },
    ],
  })).sort((a, b) => b.booking - a.booking).slice(0, 10);

  // Ordenar por zona, luego por booking
  datosCliente.sort((a, b) => {
    if (a.zona !== b.zona) return a.zona.localeCompare(b.zona, 'es');
    return b.booking - a.booking;
  });

  crearGraficaBarrasAgrupadasHorizontal('grafica-ejecutado-cliente', datosCliente, {
    formato: 'dinero', unidad: 'Ejecutado vs. planeado por cliente',
  });

  // Cada proyecto conserva sus cifras, aunque comparta cliente con otros.
  const datosProyecto = proyectos.map(p => {
    const id = identificador(p);
    const nombre = p.nombre_del_proyecto || 'Proyecto sin nombre';
    return {
      etiqueta: id.tipo ? `${id.valor} · ${nombre}` : nombre,
      lineasEtiqueta: id.tipo ? [id.valor, nombre] : [nombre],
      zona: p.zona || SIN_DATO,
      booking: valorBooking(p),
      series: [
        { nombre: 'Valor Booking', valor: valorBooking(p), color: COLORES_SERIES_COMPARACION.booking },
        { nombre: 'Ejecutado', valor: ejecutadoProyecto(p), color: COLORES_SERIES_COMPARACION.acumulado },
        { nombre: 'Proyectado', valor: proyectadoProyecto(p), color: COLORES_SERIES_COMPARACION.proyectada },
        { nombre: 'Backlog', valor: backlogHoy(p), color: COLORES_SERIES_COMPARACION.backlog },
      ],
    };
  }).sort((a, b) => (b.booking || 0) - (a.booking || 0)).slice(0, 10);
  datosProyecto.sort((a, b) => a.zona.localeCompare(b.zona, 'es') || (b.booking || 0) - (a.booking || 0));
  crearGraficaBarrasAgrupadasHorizontal('grafica-ejecutado-proyecto', datosProyecto, {
    formato: 'dinero', unidad: 'Ejecutado vs. planeado por proyecto',
  });

  // 6. Booking vs. ejecución por vendedor (barras horizontales, con filtro al hacer clic)
  const porVendedor = new Map();
  proyectos.forEach(p => {
    const vend = valorDimension(p, 'vendedor');
    if (!porVendedor.has(vend)) {
      porVendedor.set(vend, { booking: 0, acumulado: 0, proyectada: 0, backlog: 0 });
    }
    const acc = porVendedor.get(vend);
    acc.booking += valorBooking(p) || 0;
    acc.acumulado += ejecutadoProyecto(p) || 0;
    acc.proyectada += proyectadoProyecto(p) || 0;
    acc.backlog += backlogHoy(p) || 0;
  });
  const datosVendedor = Array.from(porVendedor, ([vend, vals]) => ({
    etiqueta: vend,
    booking: vals.booking,
    series: [
      { nombre: 'Valor Booking', valor: vals.booking, color: COLORES_SERIES_COMPARACION.booking },
      { nombre: 'Ejecutado', valor: vals.acumulado, color: COLORES_SERIES_COMPARACION.acumulado },
      { nombre: 'Proyectado', valor: vals.proyectada, color: COLORES_SERIES_COMPARACION.proyectada },
      { nombre: 'Backlog', valor: vals.backlog, color: COLORES_SERIES_COMPARACION.backlog },
    ],
  })).filter(d => d.etiqueta !== SIN_DATO)
    .sort((a, b) => b.booking - a.booking).slice(0, 6);

  crearGraficaBarrasAgrupadasHorizontal('grafica-booking-vendedor', datosVendedor, {
    formato: 'dinero',
    unidad: 'Booking y ejecución por vendedor',
    alClickar: (vendedor) => {
      // Aplicar filtro de vendedor y refrescar
      DIMENSIONES.forEach(d => { estado.filtros[d.campo] = []; });
      estado.filtros.texto = '';
      estado.filtros.vendedor = [vendedor];
      const texto = document.getElementById('filtro-texto');
      if (texto) texto.value = '';
      aplicarFiltros();
    },
  });

  // 7. Estado de ejecución por vendedor (stacked horizontal bars)
  const vendedorEstado = new Map();
  proyectos.forEach(p => {
    const vend = valorDimension(p, 'vendedor');
    const est = p.estado || SIN_DATO;
    if (!vendedorEstado.has(vend)) vendedorEstado.set(vend, new Map());
    const mapa = vendedorEstado.get(vend);
    mapa.set(est, (mapa.get(est) || 0) + 1);
  });
  const datosVendedorEstado = Array.from(vendedorEstado, ([vend, mapa]) => {
    const total = Array.from(mapa.values()).reduce((a, v) => a + v, 0);
    return { etiqueta: vend, total, mapa };
  }).filter(d => d.etiqueta !== SIN_DATO)  // excluir (sin dato)
    .sort((a, b) => b.total - a.total).slice(0, 10);

  // Todos los estados que existen en los datos (para la leyenda)
  const todosEstados = new Set();
  datosVendedorEstado.forEach(d => d.mapa.forEach((v, est) => todosEstados.add(est)));

  // Ordenar estados: primero los del orden de negocio, luego los demás
  const estadosOrdenados = ordenEstado.filter(e => todosEstados.has(e));
  Array.from(todosEstados).forEach(e => {
    if (!estadosOrdenados.includes(e)) estadosOrdenados.push(e);
  });

  datosVendedorEstado.forEach(d => {
    d.segmentos = estadosOrdenados.map(est => ({
      nombre: est,
      valor: d.mapa.get(est) || 0,
      color: colorDeEntidad('estado', est),
    })).filter(s => s.valor > 0);  // solo segmentos con valor para ESTE vendedor
  });

  crearGraficaBarrasApiladas('grafica-estado-vendedor', datosVendedorEstado, {
    todosSegmentos: estadosOrdenados.map(est => ({
      nombre: est, color: colorDeEntidad('estado', est)
    }))
  });

  // 8. Tabla de proyectos no iniciados / on hold
  renderizarTablaNoIniciados();
}
