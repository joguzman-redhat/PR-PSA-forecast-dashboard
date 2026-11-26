// Registro de las gráficas: cada SVG conserva su función de dibujo y se
// repinta cuando cambia su ancho.

import { ocultarTooltip } from './grafica-tooltip.js';

// Cada SVG conserva su función de dibujo. El observador solo reacciona al
// ancho: abrir un panel o cambiar su altura no crea un bucle de renderizado.
// La gráfica de cambios de la trazabilidad expone un controlador que la tabla
// usa para resaltar series; se guarda aquí porque se actualiza al repintar.
let graficaQueCambio = null;

export function graficaQueCambioActual() {
  return graficaQueCambio;
}

export function fijarGraficaQueCambio(controlador) {
  graficaQueCambio = controlador;
}

const graficasRegistradas = new WeakMap();
const graficasPendientes = new Set();
let ajusteGraficasPendiente = 0;
const observadorGraficas = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entradas => {
  entradas.forEach(({ target, contentRect }) => {
    if (!target.isConnected) {
      observadorGraficas.unobserve(target);
      graficasRegistradas.delete(target);
      return;
    }
    const registro = graficasRegistradas.get(target);
    if (registro && contentRect.width > 0 && Math.abs(target.clientWidth - registro.ancho) > 1) {
      graficasPendientes.add(target);
    }
  });
  if (!graficasPendientes.size || ajusteGraficasPendiente) return;
  ajusteGraficasPendiente = requestAnimationFrame(() => {
    ajusteGraficasPendiente = 0;
    const pendientes = [...graficasPendientes];
    graficasPendientes.clear();
    pendientes.forEach(svg => {
      if (svg.isConnected && svg.clientWidth > 0) graficasRegistradas.get(svg)?.pintar();
    });
  });
});

export function registrarGrafica(svg, pintar) {
  if (!svg) return;
  delete svg.dataset.reporteCabecera;
  delete svg.dataset.reporteCortes;
  svg.style.minHeight = '0';
  const nuevo = !graficasRegistradas.has(svg);
  graficasRegistradas.set(svg, {
    pintar: () => {
      const controlador = pintar();
      if (svg.id === 'grafica-que-cambio' && controlador) graficaQueCambio = controlador;
    },
    ancho: svg.clientWidth,
  });
  if (nuevo) observadorGraficas?.observe(svg);
}

export function ajustarGraficasVisibles() {
  ocultarTooltip();
  document.querySelectorAll('.pestana-contenido.activa svg').forEach(svg => {
    if (svg.clientWidth > 0 && svg.getClientRects().length) graficasRegistradas.get(svg)?.pintar();
  });
}
