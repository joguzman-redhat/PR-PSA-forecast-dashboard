// Gráfica de barras de una serie.

import { FORMATOS, colorDeEntidad, svgEl } from './grafica-base.js';
import { registrarGrafica } from './grafica-registro.js';
import { mostrarTooltip, moverTooltip, ocultarTooltip } from './grafica-tooltip.js';

/**
 * opciones = {
 *   formato: 'dinero' | 'conteo' | 'porcentaje',
 *   campoColor: nombre de dimensión -> una color por categoría,
 *               o null -> una sola serie en azul (lo normal cuando el eje
 *               X ya identifica cada barra y el color no aporta nada),
 *   unidad: texto que acompaña el valor en el tooltip
 * }
 */
export function crearGraficaBarrasSimple(svgId, datos, opciones) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  registrarGrafica(svg, () => crearGraficaBarrasSimple(svgId, datos, opciones));
  svg.innerHTML = '';
  svg.style.removeProperty('height');

  const op = opciones || {};
  const fmt = FORMATOS[op.formato] || FORMATOS.dinero;

  if (!datos.length) {
    svg.style.height = '120px';
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Gráfica sin datos');
    svg.setAttribute('viewBox', '0 0 600 120');
    const t = svgEl('text', { x: 300, y: 60, 'text-anchor': 'middle',
      'font-size': 13, fill: 'var(--text-dim)' });
    t.textContent = 'Sin datos para los filtros aplicados';
    svg.appendChild(t);
    return;
  }

  const ancho = Math.max(300, svg.clientWidth || 300);
  const pasoPrevio = Math.max(1, (ancho - 78) / datos.length);
  const etiquetasLargas = datos.some(d => String(d.etiqueta).length > 9 || String(d.etiqueta).length * 7 > pasoPrevio);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', op.unidad ? `Gráfica de ${op.unidad}` : 'Gráfica de barras');
  svg.setAttribute('title', op.unidad ? `Gráfica de ${op.unidad}` : 'Gráfica de barras');
  if (etiquetasLargas) {
    const fila = 28;
    const alto = Math.max(120, datos.length * fila + 24);
    const margen = { top: 12, right: 18, bottom: 12, left: Math.min(190, Math.max(105, Math.round(ancho * 0.34))) };
    svg.dataset.reporteCabecera = String(margen.top);
    svg.dataset.reporteCortes = JSON.stringify(datos.map((_, i) => ({ inicio: margen.top + i * fila, fin: margen.top + (i + 1) * fila })));
    const areaAncho = Math.max(90, ancho - margen.left - margen.right);
    const maxValor = Math.max(...datos.map(d => d.valor), 0) || 1;
    const maxCaracteres = Math.max(8, Math.floor((margen.left - 12) / 6.3));
    svg.style.height = `${alto}px`;
    svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
    const g = svgEl('g', { transform: `translate(${margen.left},${margen.top})` });
    datos.forEach((d, i) => {
      const y = i * fila + 4;
      const texto = String(d.etiqueta);
      const label = svgEl('text', { x: -8, y: y + 8, 'font-size': 11, 'text-anchor': 'end', fill: 'var(--text-secondary)' });
      label.textContent = texto.length > maxCaracteres ? texto.slice(0, maxCaracteres - 1) + '…' : texto;
      const title = svgEl('title', {}); title.textContent = texto; label.appendChild(title); g.appendChild(label);
      const barW = Math.max(1, d.valor / maxValor * areaAncho);
      const bar = svgEl('rect', { x: 0, y, width: barW, height: 14, rx: 2, fill: op.campoColor ? colorDeEntidad(op.campoColor, d.etiqueta) : 'var(--series-1)' });
      g.appendChild(bar);
      const cercaDelBorde = barW > areaAncho - 52;
      const value = svgEl('text', { x: cercaDelBorde ? areaAncho - 3 : Math.min(barW + 5, areaAncho - 2), y: y + 11, 'font-size': 10, 'text-anchor': cercaDelBorde ? 'end' : 'start', fill: 'var(--text-primary)', 'font-variant-numeric': 'tabular-nums' });
      value.textContent = fmt(d.valor); g.appendChild(value);
      const hit = svgEl('rect', { x: 0, y: y - 2, width: areaAncho, height: 18, fill: 'transparent' });
      hit.addEventListener('mouseenter', e => mostrarTooltip(e, texto, [{ color: bar.getAttribute('fill'), etiqueta: op.unidad || 'Valor', valor: d.exacto || fmt(d.valor) }]));
      hit.addEventListener('mousemove', moverTooltip); hit.addEventListener('mouseleave', ocultarTooltip); g.appendChild(hit);
    });
    svg.appendChild(g);
    return;
  }
  // Las categorías cortas conservan las barras verticales.
  const alto = 280;
  const margen = {
    top: 16, right: 16,
    bottom: 44,
    left: 62,
  };
  const areaAncho = Math.max(80, ancho - margen.left - margen.right);
  const areaAlto = alto - margen.top - margen.bottom;

  svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
  svg.style.height = `${alto}px`;
  const g = svgEl('g', { transform: `translate(${margen.left},${margen.top})` });

  const maxValor = Math.max(...datos.map(d => d.valor), 0) || 1;
  const paso = areaAncho / datos.length;
  const anchoBarra = Math.max(6, Math.min(54, paso - 8)); // deja 2px+ entre barras

  // Rejilla y eje Y, recesivos.
  const lineas = 4;
  for (let i = 0; i <= lineas; i++) {
    const y = areaAlto - (areaAlto / lineas) * i;
    g.appendChild(svgEl('line', {
      x1: 0, y1: y, x2: areaAncho, y2: y,
      stroke: i === 0 ? 'var(--baseline-color)' : 'var(--grid-color)', 'stroke-width': 1,
    }));
    const lbl = svgEl('text', {
      x: -9, y: y + 4, 'font-size': 13, 'text-anchor': 'end',
      fill: 'var(--text-secondary)', 'font-variant-numeric': 'tabular-nums',
    });
    lbl.textContent = fmt((maxValor / lineas) * i);
    g.appendChild(lbl);
  }

  datos.forEach((d, i) => {
    const x = i * paso + (paso - anchoBarra) / 2;
    const altura = Math.max(1, (d.valor / maxValor) * areaAlto);
    const color = op.campoColor ? colorDeEntidad(op.campoColor, d.etiqueta) : 'var(--series-1)';

    // Esquinas redondeadas solo en el extremo del dato; la base queda anclada.
    const r = Math.min(4, anchoBarra / 2, altura);
    const y = areaAlto - altura;
    const barra = svgEl('path', {
      d: `M${x},${areaAlto} L${x},${y + r} Q${x},${y} ${x + r},${y}
          L${x + anchoBarra - r},${y} Q${x + anchoBarra},${y} ${x + anchoBarra},${y + r}
          L${x + anchoBarra},${areaAlto} Z`,
      fill: color,
    });
    g.appendChild(barra);

    // Etiqueta de valor sobre la barra
    const valorLbl = svgEl('text', {
      x: x + anchoBarra / 2,
      y: y - 5,
      'text-anchor': 'middle',
      'font-size': 11,
      'font-weight': 600,
      fill: 'var(--text-primary)',
      'font-variant-numeric': 'tabular-nums',
    });
    valorLbl.textContent = fmt(d.valor);
    g.appendChild(valorLbl);

    // El área sensible al mouse es toda la columna, no solo la barra.
    const zona = svgEl('rect', {
      x: i * paso, y: 0, width: paso, height: areaAlto, fill: 'transparent',
    });
    zona.style.cursor = 'pointer';
    zona.addEventListener('mouseenter', e => {
      barra.setAttribute('opacity', '0.78');
      mostrarTooltip(e, d.etiqueta, [{
        color, etiqueta: op.unidad || 'Valor', valor: d.exacto || fmt(d.valor),
      }]);
    });
    zona.addEventListener('mousemove', moverTooltip);
    zona.addEventListener('mouseleave', () => {
      barra.removeAttribute('opacity');
      ocultarTooltip();
    });
    g.appendChild(zona);

    const texto = String(d.etiqueta);
    const lbl = svgEl('text', {
      'font-size': 12, fill: 'var(--text-secondary)',
    });
    {
      lbl.setAttribute('x', i * paso + paso / 2);
      lbl.setAttribute('y', areaAlto + 16);
      lbl.setAttribute('text-anchor', 'middle');
      lbl.textContent = texto;
    }
    const titulo = svgEl('title', {});
    titulo.textContent = texto;
    lbl.appendChild(titulo);
    g.appendChild(lbl);
  });

  svg.appendChild(g);
}
