// Gráfica de barras agrupadas verticales.

import { FORMATOS, escalaTexto, svgEl } from './grafica-base.js';
import { registrarGrafica } from './grafica-registro.js';
import { mostrarTooltip, moverTooltip, ocultarTooltip } from './grafica-tooltip.js';

/**
 * Gráfica de barras agrupadas vertical. Similar a horizontal pero con barras verticales.
 * datos = [{ etiqueta, series: [{ nombre, valor, color },...] }]
 * opciones.alClickar: callback(etiqueta) cuando se hace clic en un grupo
 */
export function crearGraficaBarrasAgrupadasVertical(svgId, datos, opciones) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  registrarGrafica(svg, () => crearGraficaBarrasAgrupadasVertical(svgId, datos, opciones));
  svg.innerHTML = '';
  svg.style.removeProperty('height');

  const op = opciones || {};
  const fmt = FORMATOS[op.formato] || FORMATOS.dinero;

  if (!datos.length) {
    svg.style.height = '120px';
    svg.setAttribute('viewBox', '0 0 600 120');
    const t = svgEl('text', { x: 300, y: 60, 'text-anchor': 'middle',
      'font-size': 13, fill: 'var(--text-dim)' });
    t.textContent = 'Sin datos para los filtros aplicados';
    svg.appendChild(t);
    return;
  }

  const ancho = svg.clientWidth || 900;
  const alto = 340;
  // Arriba: leyenda y, debajo, las etiquetas rotadas de la barra más alta.
  const margen = { top: 100, right: 16, bottom: 70, left: 70 };
  const areaAncho = ancho - margen.left - margen.right;
  const areaAlto = alto - margen.top - margen.bottom;

  svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
  svg.style.height = alto + 'px';
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Gráfica de barras agrupadas verticales');
  svg.setAttribute('title', 'Gráfica de barras agrupadas verticales');
  const g = svgEl('g', { transform: `translate(${margen.left},${margen.top})` });

  const maxValor = Math.max(...datos.flatMap(d => d.series.map(s => s.valor)), 1);
  const pasoGrupo = areaAncho / datos.length;
  const nSeries = datos.length ? datos[0].series.length : 0;
  const anchoBarra = Math.min(16, (pasoGrupo - 16) / nSeries);

  // Rejilla y eje Y
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

  // Grupos
  datos.forEach((grupo, ig) => {
    const xGrupo = ig * pasoGrupo + pasoGrupo / 2;
    const anchoTotal = nSeries * anchoBarra + (nSeries - 1) * 3;
    const xBase = xGrupo - anchoTotal / 2;

    grupo.series.forEach((serie, is) => {
      const xBarra = xBase + is * (anchoBarra + 3);
      const altura = Math.max(1, (serie.valor / maxValor) * areaAlto);
      const yBarra = areaAlto - altura;

      const barra = svgEl('rect', {
        x: xBarra, y: yBarra, width: anchoBarra, height: altura,
        fill: serie.color, rx: 2,
      });
      g.appendChild(barra);

      // Valor rotado -90, positioned ABOVE bar top
      const lblValor = svgEl('text', {
        'font-size': 10, 'font-weight': 600,
        fill: 'var(--text-primary)',
        'font-variant-numeric': 'tabular-nums',
        transform: `translate(${xBarra + anchoBarra / 2},${yBarra - 3}) rotate(-90)`,
        'text-anchor': 'start',  // start makes text go UP from rotation point
      });
      lblValor.textContent = fmt(serie.valor);
      g.appendChild(lblValor);

      // Tooltip
      const zona = svgEl('rect', {
        x: xBarra, y: 0, width: anchoBarra, height: areaAlto,
        fill: 'transparent',
      });
      zona.style.cursor = 'pointer';
      zona.addEventListener('mouseenter', e => {
        barra.setAttribute('opacity', '0.78');
        mostrarTooltip(e, grupo.etiqueta, [{
          color: serie.color,
          etiqueta: serie.nombre,
          valor: '$' + serie.valor.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        }]);
      });
      zona.addEventListener('mousemove', moverTooltip);
      zona.addEventListener('mouseleave', () => {
        barra.removeAttribute('opacity');
        ocultarTooltip();
      });
      // El clic va en la misma zona del tooltip: una capa aparte encima del
      // grupo tapaba los tooltips de cada barra.
      if (op.alClickar) {
        zona.setAttribute('role', 'button'); zona.setAttribute('tabindex', '0');
        zona.setAttribute('aria-label', `Filtrar por vendedor ${grupo.etiqueta}: ${serie.nombre}, ${fmt(serie.valor)}`);
        zona.addEventListener('click', () => op.alClickar(grupo.etiqueta));
        zona.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); op.alClickar(grupo.etiqueta); } });
      }
      g.appendChild(zona);
    });

    // Etiqueta del eje X (2 líneas si es largo)
    const texto = String(grupo.etiqueta);
    if (texto.length > 10) {
      const mitad = Math.floor(texto.length / 2);
      const espacio = texto.lastIndexOf(' ', mitad);
      const corte = espacio > mitad - 5 && espacio < mitad + 5 ? espacio : mitad;
      const linea1 = texto.slice(0, corte).trim();
      const linea2 = texto.slice(corte).trim();

      const lbl1 = svgEl('text', {
        x: xGrupo, y: areaAlto + 16, 'font-size': 10,
        'text-anchor': 'middle', fill: 'var(--text-secondary)',
      });
      lbl1.textContent = linea1.length > 12 ? linea1.slice(0, 11) + '…' : linea1;
      g.appendChild(lbl1);

      const lbl2 = svgEl('text', {
        x: xGrupo, y: areaAlto + 28, 'font-size': 10,
        'text-anchor': 'middle', fill: 'var(--text-secondary)',
      });
      lbl2.textContent = linea2.length > 12 ? linea2.slice(0, 11) + '…' : linea2;
      const titulo = svgEl('title', {});
      titulo.textContent = texto;
      lbl2.appendChild(titulo);
      g.appendChild(lbl2);
    } else {
      const lbl = svgEl('text', {
        x: xGrupo, y: areaAlto + 16, 'font-size': 10,
        'text-anchor': 'middle', fill: 'var(--text-secondary)',
      });
      lbl.textContent = texto;
      const titulo = svgEl('title', {});
      titulo.textContent = texto;
      lbl.appendChild(titulo);
      g.appendChild(lbl);
    }
  });

  // Leyenda arriba
  if (datos.length && datos[0].series.length) {
    let offset = 0;
    datos[0].series.forEach(s => {
      const gLey = svgEl('g', {});
      gLey.appendChild(svgEl('rect', {
        x: offset, y: -92, width: 11, height: 11, rx: 2, fill: s.color,
      }));
      const t = svgEl('text', {
        x: offset + 16, y: -83, 'font-size': 11, fill: 'var(--text-secondary)',
      });
      t.textContent = s.nombre;
      gLey.appendChild(t);
      g.appendChild(gLey);
      offset += 16 + s.nombre.length * 7.2 * escalaTexto() + 18;
    });
  }

  svg.appendChild(g);
}
