// Utilidades comunes de las gráficas SVG: formatos, colores por entidad,
// escala de texto y creación de elementos SVG.

import { SIN_DATO } from './filtros.js';
import { formatearDinero } from './formato.js';

export const FORMATOS = {
  dinero: v => formatearDinero(v),
  conteo: v => String(Math.round(v)),
  porcentaje: v => v.toFixed(1) + '%',
};

// Paleta de 4 colores para las series de comparación (Booking, Acumulado, Proyectada, Backlog)
export const COLORES_SERIES_COMPARACION = {
  booking: 'var(--series-1)',
  acumulado: 'var(--series-3)',
  proyectada: 'var(--series-4)',
  backlog: 'var(--series-7)',
};

// El color sigue a la entidad, no a su posición en el ranking: si un filtro
// cambia el orden de las barras, cada categoría conserva su color.
const _coloresEntidad = new Map();

export function colorDeEntidad(campo, valor) {
  // "(sin dato)" no es una categoría del negocio, es una ausencia: va en gris
  // para que no compita visualmente con las categorías reales.
  if (valor === SIN_DATO) return 'var(--series-otros)';
  if(campo==='estado' && valor==='On Hold')return 'var(--estado-on-hold)';
  const clave = campo + '|' + valor;
  if (!_coloresEntidad.has(clave)) {
    const usados = Array.from(_coloresEntidad.keys()).filter(k => k.startsWith(campo + '|')).length;
    _coloresEntidad.set(clave, usados < 8 ? `var(--series-${usados + 1})` : 'var(--series-otros)');
  }
  return _coloresEntidad.get(clave);
}

/** Reserva los colores de una dimensión en un orden fijo, antes de dibujar. */
export function fijarColores(campo, valores) {
  valores.forEach(v => colorDeEntidad(campo, v));
}

/** Escala del tamaño de fuente en gráficas respecto al root (16px). */
export function escalaTexto() {
  if (document.body.classList.contains('preparando-reporte')) return 1;
  return parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
}

export function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    // Escalar font-size en SVG con el factor de escala del root
    if (k === 'font-size' && typeof v === 'number') {
      el.setAttribute(k, String(Math.max(12, v) * escalaTexto()));
    } else {
      el.setAttribute(k, String(v));
    }
  });
  return el;
}
