// Arranque del dashboard: carga los datos, conecta los eventos y abre la pestaña de la URL.
import { estado } from './estado.js';
import { PERIODOS } from './calendario.js';
import { cargarDatos } from './carga-datos.js';
import { inicializarFiltroTerritorio, inicializarFiltros } from './filtros-ui.js';
import { configurarSelectorForecast } from './selector-forecast.js';
import { cargarAnchosDeStorage, asegurarResizers, setupMutationObserver } from './columnas-redimensionables.js';
import { ocultarTooltip } from './grafica-tooltip.js';
import { ajustarGraficasVisibles } from './grafica-registro.js';
import { renderizarTablaNoIniciados } from './tabla-no-iniciados.js';
import { inicializarReporteGraficas } from './reporte-pdf.js';
import { cambiarPestana } from './navegacion.js';
import { actualizarUI } from './actualizacion-ui.js';

export async function inicializar() {
  // Cargar datos
  const datosOK = await cargarDatos();
  configurarSelectorForecast();
  inicializarFiltroTerritorio();
  if (!datosOK || estado.metadataProyectos?.estado === 'sin_datos') return;

  // El periodo puede venir en la URL (?periodo=q2). Se lee ANTES del primer
  // render: si no, la vista se pinta con el periodo por defecto.
  const pedido = new URLSearchParams(location.search).get('periodo');
  if (pedido && PERIODOS.some(x => x.id === pedido)) estado.periodo = pedido;

  // Inicializar filtros
  inicializarFiltros();
  if (window.matchMedia('(max-width: 768px)').matches) {
    document.querySelector('.panel-filtros').open = false;
  }
  inicializarReporteGraficas();
  window.addEventListener('scroll', ocultarTooltip, { capture: true, passive: true });
  document.addEventListener('toggle', ocultarTooltip, true);
  document.getElementById('mostrar-columnas-completas').addEventListener('change', e => {
    document.getElementById('tabla-proyectos').classList.toggle('vista-completa', e.target.checked);
  });
  document.getElementById('filtro-no-iniciados-estado').addEventListener('change', renderizarTablaNoIniciados);

  // Configurar eventos de pestañas
  document.querySelectorAll('.pestana-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // currentTarget (no target): el botón real de PatternFly envuelve el
      // texto en un <span>, y un clic ahí dejaría target apuntando al span.
      const pestana = e.currentTarget.dataset.pestana;
      cambiarPestana(pestana);
    });
  });

  // Botón volver
  document.getElementById('btn-volver-listado').addEventListener('click', () => {
    cambiarPestana('listado');
  });

  // Renderizar inicial
  actualizarUI();

  // Inicializar sistema de redimensionamiento de columnas
  cargarAnchosDeStorage();
  document.querySelectorAll('table').forEach(tabla => {
    asegurarResizers(tabla);
  });
  setupMutationObserver();

  // Abrir la pestaña que venga en la URL (#trazabilidad, #detalle/65085...).
  const [vista, pa] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (vista === 'detalle' && pa) {
    const p = estado.proyectos.find(x => String(x.num_pa) === pa);
    if (p) { estado.proyectoSeleccionado = p; cambiarPestana('detalle', true); }
  } else if (vista === 'trazabilidad' || vista === 'detalle' || vista === 'pms') {
    cambiarPestana(vista, true);
  }

  // Ajustar tamaño de gráficas en resize (con debounce de 200ms)
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      ajustarGraficasVisibles();
    }, 200);
  });
}
