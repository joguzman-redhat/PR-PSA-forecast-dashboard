// Páginas del informe PDF: la hoja con marca y el resumen de la portada.
import { estado } from './estado.js';
import { formatearNumero, formatearDineroExacto } from './formato.js';
import { periodoActual } from './calendario.js';
import { valorBooking, revenuePeriodo, ejecutadoProyecto, backlogHoy, ejecucionPonderada } from './dinero-proyecto.js';
import { SIN_DATO, valorDimension, pasaVisibilidadProyecto } from './filtros.js';
import { identificador } from './campos-proyecto.js';
import { calcularCambios } from './snapshots-cambios.js';
import { calcularPMs } from './pms-calculo.js';

export function crearPaginaReporte() {
  const pagina = document.createElement('section');
  pagina.className = 'reporte-pagina';
  const marca = document.createElement('header');
  marca.className = 'reporte-marca';
  const identidad = document.createElement('div');
  identidad.className = 'reporte-marca-identidad';
  const logo = document.querySelector('.rh-masthead .rh-logo')?.cloneNode(true);
  if (logo) {
    logo.setAttribute('class', 'reporte-logo');
    logo.removeAttribute('style');
    identidad.appendChild(logo);
  }
  const nombre = document.createElement('strong');
  nombre.textContent = 'Red Hat';
  identidad.appendChild(nombre);
  const producto = document.createElement('span');
  producto.className = 'reporte-producto';
  producto.textContent = 'LATAM Projects' + (estado.metadataProyectos?.demo ? ' - DEMO' : '');
  marca.append(identidad, producto);
  const contenido = document.createElement('main');
  contenido.className = 'reporte-contenido';
  const pie = document.createElement('footer');
  pie.className = 'reporte-pie';
  const periodo = document.createElement('span');
  periodo.textContent = `Revenue: ${periodoActual().etiqueta} - USD`;
  pie.append(periodo, document.createElement('span'));
  pagina.append(marca, contenido, pie);
  return { pagina, contenido };
}

export function construirResumenReporte(contenido, vista, nombreVista, partes) {
  const titulo = document.createElement('h1');
  titulo.textContent = `${nombreVista} - Informe de revenue`;
  const contexto = document.createElement('p');
  contexto.className = 'reporte-contexto';
  contexto.textContent = partes.join(' · ');
  contenido.append(titulo, contexto);

  const proyectos = vista.id === 'pestana-listado' ? estado.proyectosFiltrados
    : vista.id === 'pestana-detalle' ? [estado.proyectoSeleccionado].filter(Boolean)
    : vista.id === 'pestana-pms' ? calcularPMs().flatMap(f => f.proyectos)
    : estado.proyectos.filter(pasaVisibilidadProyecto);
  const sumar = fn => {
    const valores = proyectos.map(fn).filter(Number.isFinite);
    return valores.length || !proyectos.length ? valores.reduce((s, v) => s + v, 0) : null;
  };
  const booking = sumar(valorBooking), acumulado = sumar(ejecutadoProyecto);
  const perfiles = ['Timeline · '+periodoActual().etiqueta];
  if (vista.id === 'pestana-listado') {
    if (estado.filtros.pm_lider.length === 1) perfiles.push(`PM: ${estado.filtros.pm_lider[0]}`);
    if (estado.filtros.vendedor.length === 1) perfiles.push(`Vendedor: ${estado.filtros.vendedor[0]}`);
  } else if (vista.id === 'pestana-detalle') {
    const p = estado.proyectoSeleccionado;
    perfiles.push(`${identificador(p).valor} - ${p.nombre_del_proyecto || 'Proyecto'}`);
    perfiles.push(`PM: ${p.pm_lider || 'Sin dato'} · Vendedor: ${p.vendedor || 'Sin dato'}`);
  } else if (vista.id === 'pestana-pms') {
    perfiles.push(`${new Set(proyectos.map(p => p.pm_lider || SIN_DATO)).size} PMs en el portafolio`);
  }
  if (perfiles.length) {
    const perfil = document.createElement('h2');
    perfil.className = 'reporte-perfiles';
    perfil.textContent = perfiles.join(' · ');
    contenido.appendChild(perfil);
  }
  const kpis = document.createElement('div');
  kpis.className = 'reporte-kpis';
  const metricas = [
    ['Proyectos', formatearNumero(proyectos.length)],
    ['Booking', formatearDineroExacto(booking)],
    ['Ejecutado', formatearDineroExacto(acumulado)],
    ['Backlog', formatearDineroExacto(sumar(backlogHoy))],
    ['Ejecución', ejecucionPonderada(proyectos) === null ? '—' : ejecucionPonderada(proyectos).toFixed(1) + '%'],
    [`Commit · ${periodoActual().etiqueta}`, formatearDineroExacto(sumar(revenuePeriodo))],
  ];
  metricas.forEach(([etiqueta, valor]) => {
    const celda = document.createElement('div');
    celda.className = 'reporte-kpi';
    const cifra = document.createElement('strong');
    cifra.textContent = valor;
    const label = document.createElement('span');
    label.textContent = etiqueta;
    celda.append(cifra, label);
    kpis.appendChild(celda);
  });
  contenido.appendChild(kpis);

  const desglose = document.createElement('div');
  desglose.className = 'reporte-desglose';
  const bloque = (titulo, lineas) => {
    const seccion = document.createElement('section');
    const h2 = document.createElement('h2');
    h2.textContent = titulo;
    seccion.appendChild(h2);
    lineas.forEach(texto => {
      const p = document.createElement('p');
      p.textContent = texto;
      seccion.appendChild(p);
    });
    desglose.appendChild(seccion);
  };
  const estados = new Map();
  const status = new Map();
  proyectos.forEach(p => {
    const e = valorDimension(p, 'estado'), s = valorDimension(p, 'project_status');
    estados.set(e, (estados.get(e) || 0) + 1);
    status.set(s, (status.get(s) || 0) + 1);
  });
  bloque('Proyectos por estado', [...estados].map(([e, n]) => `${e}: ${n}`));
  const completos = proyectos.filter(p => [valorBooking(p), ejecutadoProyecto(p), backlogHoy(p)].every(Number.isFinite)).length;
  bloque('Semáforo y cobertura del dato', [
    ...[...status].map(([s, n]) => `${s === SIN_DATO ? 'Sin semáforo' : s}: ${n}`),
    `${completos} de ${proyectos.length} proyectos con cifras completas de BackLog NOLA.`,
  ]);
  contenido.appendChild(desglose);
  if (vista.id === 'pestana-trazabilidad' && estado.historia) {
    const { filas } = calcularCambios();
    const p = document.createElement('p');
    p.className = 'reporte-nota';
    p.textContent = `Variación neta del Commit en el rango seleccionado: ${formatearDineroExacto(filas.reduce((s, f) => s + f.dFijo, 0))}. Los indicadores superiores describen el portafolio actual.`;
    contenido.appendChild(p);
  }
}
