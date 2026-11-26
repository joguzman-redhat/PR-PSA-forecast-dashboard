// Rango Desde/Hasta del forecast (y su unidad) y el selector de periodo de
// revenue. Al cambiar el rango se aplican los filtros y se repintan las vistas,
// que llegan por `vistas` (ver vistas.js).
import { estado } from './estado.js';
import { NOMBRES_MESES, etiquetaPeriodoCalendario } from './calendario.js';
import { aplicarFiltros } from './filtros-ui.js';
import { vistas } from './vistas.js';

function limitePeriodoForecast(valor, extremo) {
  const trimestre = /^(\d{4})-q([1-4])$/.exec(valor);
  if (!trimestre) return valor;
  const mes = (Number(trimestre[2]) - 1) * 3 + (extremo === 'desde' ? 1 : 3);
  return `${trimestre[1]}-${String(mes).padStart(2, '0')}`;
}

export function configurarSelectorForecast() {
  if (!estado.forecast.timeline) return;
  const unidad = document.getElementById('forecast-unidad');
  const desde = document.getElementById('forecast-desde');
  const hasta = document.getElementById('forecast-hasta');
  const periodos = estado.forecast.periodos;
  const trimestres = [...new Set(periodos.map(p => `${p.slice(0,4)}-q${Math.ceil(Number(p.slice(5))/3)}`))];
  unidad.value = estado.unidadTimeline;
  const poblar = () => {
    const porQ = unidad.value === 'trimestres';
    const opciones = porQ ? trimestres : periodos;
    for (const control of [desde, hasta]) {
      control.replaceChildren(...opciones.map(p => new Option(porQ
        ? `Q${p.at(-1)} ${p.slice(0,4)} · ${NOMBRES_MESES[(Number(p.at(-1))-1)*3].slice(0,3)}–${NOMBRES_MESES[Number(p.at(-1))*3-1].slice(0,3)}`
        : etiquetaPeriodoCalendario(p), p)));
      control.disabled = !opciones.length;
      control.setCustomValidity('');
    }
    const convertir = p => porQ && p ? `${p.slice(0,4)}-q${Math.ceil(Number(p.slice(5))/3)}` : p;
    desde.value = convertir(estado.rangoTimeline.desde);
    hasta.value = convertir(estado.rangoTimeline.hasta);
  };
  const cambiar = () => {
    const inicio = limitePeriodoForecast(desde.value, 'desde');
    const fin = limitePeriodoForecast(hasta.value, 'hasta');
    if (!inicio || !fin || inicio > fin) {
      hasta.setCustomValidity('El final debe ser igual o posterior al inicio');
      hasta.reportValidity(); return;
    }
    hasta.setCustomValidity('');
    estado.unidadTimeline = unidad.value;
    estado.rangoTimeline = {desde: inicio, hasta: fin}; estado.periodo = 'rango';
    const u = new URL(location.href); u.search = '';
    u.searchParams.set('desde', inicio); u.searchParams.set('hasta', fin);
    if (unidad.value === 'trimestres') u.searchParams.set('unidad', 'trimestres');
    history.replaceState(null, '', u);
    aplicarFiltros();
    if (estado.proyectoSeleccionado) vistas.renderizarDetalle();
    if (estado.historia) vistas.renderizarTrazabilidad();
    vistas.renderizarPMs();
  };
  poblar();
  unidad.disabled = !periodos.length;
  unidad.addEventListener('change', () => { poblar(); if (periodos.length) cambiar(); });
  desde.addEventListener('change', cambiar);
  hasta.addEventListener('change', cambiar);
}
