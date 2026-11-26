// Gráfica de barras apiladas.

import { escalaTexto, svgEl } from './grafica-base.js';
import { registrarGrafica } from './grafica-registro.js';
import { mostrarTooltip, moverTooltip, ocultarTooltip } from './grafica-tooltip.js';

/**
 * Gráfica de barras apiladas horizontal. Para mostrar composición por categoría.
 * datos = [{ etiqueta, segmentos: [{ nombre, valor, color },...] }]
 */
export function crearGraficaBarrasApiladas(svgId, datos, opciones) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  registrarGrafica(svg, () => crearGraficaBarrasApiladas(svgId, datos, opciones));
  svg.innerHTML = '';
  svg.style.removeProperty('height');

  const op = opciones || {};

  if (!datos.length) {
    svg.style.height = '120px';
    svg.setAttribute('viewBox', '0 0 600 120');
    const t = svgEl('text', { x: 300, y: 60, 'text-anchor': 'middle',
      'font-size': 13, fill: 'var(--text-dim)' });
    t.textContent = 'Sin datos para los filtros aplicados';
    svg.appendChild(t);
    return;
  }

  const ancho = Math.max(300, svg.clientWidth || 300);
  const alturaPorBarra = 32;
  const margenBarra = 12;
  const segmentosLeyenda = op.todosSegmentos || (datos.length && datos[0].segmentos) || [];
  const anchoLeyenda = Math.max(120, ancho - 24);
  let filasLeyenda = 1, anchoFila = 0;
  segmentosLeyenda.forEach(s => {
    const w = 34 + s.nombre.length * 7.2 * escalaTexto();
    if (anchoFila && anchoFila + w > anchoLeyenda) { filasLeyenda++; anchoFila = 0; }
    anchoFila += w;
  });
  const margenTop = 24 + filasLeyenda * 18;
  const alto = Math.max(160, datos.length * (alturaPorBarra + margenBarra) + margenTop + 36);
  const margen = { top: margenTop, right: 50, bottom: 20, left: Math.round(140 * escalaTexto()) };  // right margin for total label
  svg.dataset.reporteCabecera = String(margen.top);
  svg.dataset.reporteCortes = JSON.stringify(datos.map((_, i) => ({
    inicio: margen.top + i * (alturaPorBarra + margenBarra),
    fin: margen.top + (i + 1) * (alturaPorBarra + margenBarra),
  })));
  const espacioTotal = 36;  // reserve space for total label at end of bar
  const areaAncho = ancho - margen.left - margen.right - espacioTotal;
  const areaAlto = alto - margen.top - margen.bottom;

  svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
  svg.style.height = alto + 'px';
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', op.unidad || 'Gráfica de barras apiladas');
  svg.setAttribute('title', op.unidad || 'Gráfica de barras apiladas');
  const g = svgEl('g', { transform: `translate(${margen.left},${margen.top})` });

  // Valor máximo = suma de segmentos de cada barra
  const maxTotal = Math.max(...datos.map(d =>
    d.segmentos.reduce((a, s) => a + s.valor, 0)), 1);

  // Dibujar barras
  datos.forEach((fila, i) => {
    const yBarra = i * (alturaPorBarra + margenBarra);
    const total = fila.segmentos.reduce((a, s) => a + s.valor, 0);

    // Etiqueta
    const lbl = svgEl('text', {
      x: -10, y: yBarra + alturaPorBarra / 2, 'font-size': 12,
      'text-anchor': 'end', fill: 'var(--text-primary)',
      'dominant-baseline': 'middle',
    });
    const texto = String(fila.etiqueta);
    lbl.textContent = texto.length > 18 ? texto.slice(0, 17) + '…' : texto;
    const titulo = svgEl('title', {});
    titulo.textContent = texto;
    lbl.appendChild(titulo);
    g.appendChild(lbl);

    // Segmentos
    let offsetX = 0;
    fila.segmentos.forEach((seg, si) => {
      const ancho = Math.max(0, (seg.valor / maxTotal) * areaAncho);

      const rect = svgEl('rect', {
        x: offsetX, y: yBarra, width: ancho, height: alturaPorBarra,
        fill: seg.color, rx: si === 0 ? 2 : 0,
      });
      if (si === fila.segmentos.length - 1) rect.setAttribute('rx', 2);
      g.appendChild(rect);

      // Valor dentro del segmento si cabe
      if (ancho > 30 && seg.valor > 0) {
        const lblSeg = svgEl('text', {
          x: offsetX + ancho / 2, y: yBarra + alturaPorBarra / 2,
          'font-size': 11, 'font-weight': 600,
          'text-anchor': 'middle', 'dominant-baseline': 'middle',
          fill: '#ffffff',
          'font-variant-numeric': 'tabular-nums',
        });
        lblSeg.textContent = String(seg.valor);
        g.appendChild(lblSeg);
      }

      // Tooltip
      const zona = svgEl('rect', {
        x: offsetX, y: yBarra, width: ancho, height: alturaPorBarra,
        fill: 'transparent',
      });
      zona.style.cursor = 'pointer';
      zona.addEventListener('mouseenter', e => {
        rect.setAttribute('opacity', '0.78');
        mostrarTooltip(e, fila.etiqueta, [{
          color: seg.color,
          etiqueta: seg.nombre,
          valor: `${seg.valor} proyecto${seg.valor === 1 ? '' : 's'}`,
        }]);
      });
      zona.addEventListener('mousemove', moverTooltip);
      zona.addEventListener('mouseleave', () => {
        rect.removeAttribute('opacity');
        ocultarTooltip();
      });
      g.appendChild(zona);

      offsetX += ancho;
    });

    // Total al final
    const lblTotal = svgEl('text', {
      x: offsetX + 8, y: yBarra + alturaPorBarra / 2,
      'font-size': 11, 'font-weight': 600,
      'dominant-baseline': 'middle',
      fill: 'var(--text-primary)',
      'font-variant-numeric': 'tabular-nums',
    });
    lblTotal.textContent = String(total);
    g.appendChild(lblTotal);
  });

  // Leyenda envuelta arriba, con espacio reservado en el SVG.
  if (segmentosLeyenda.length) {
    let offset = -margen.left + 8, filaLeyenda = 0;
    segmentosLeyenda.forEach(s => {
      const anchoItem = 34 + s.nombre.length * 7.2 * escalaTexto();
      if (offset > -margen.left + 8 && offset + anchoItem > ancho - margen.left - 8) { offset = -margen.left + 8; filaLeyenda++; }
      const gLey = svgEl('g', {});
      gLey.appendChild(svgEl('rect', {
        x: offset, y: -margenTop + 12 + filaLeyenda * 18, width: 11, height: 11, rx: 2, fill: s.color,
      }));
      const t = svgEl('text', {
        x: offset + 16, y: -margenTop + 21 + filaLeyenda * 18, 'font-size': 11, fill: 'var(--text-secondary)',
      });
      t.textContent = s.nombre;
      gLey.appendChild(t);
      g.appendChild(gLey);
      offset += anchoItem;
    });
  }

  svg.appendChild(g);
}
