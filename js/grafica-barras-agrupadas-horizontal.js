// Gráfica de barras agrupadas horizontales.

import { formatearDineroExacto } from './formato.js';
import { FORMATOS, escalaTexto, svgEl } from './grafica-base.js';
import { registrarGrafica } from './grafica-registro.js';
import { mostrarTooltip, moverTooltip, ocultarTooltip } from './grafica-tooltip.js';

/**
 * Gráfica de barras agrupadas horizontal. Para comparar múltiples series por categoría.
 * datos = [{ etiqueta, lineasEtiqueta?, zona, series: [{ nombre, valor, color },...] }]
 */
export function crearGraficaBarrasAgrupadasHorizontal(svgId, datos, opciones) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  registrarGrafica(svg, () => crearGraficaBarrasAgrupadasHorizontal(svgId, datos, opciones));
  svg.innerHTML = '';
  svg.style.removeProperty('height');

  const op = opciones || {};
  const fmt = FORMATOS[op.formato] || FORMATOS.dinero;
  const fmtValor = op.formato === 'dinero' ? formatearDineroExacto : fmt;
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', op.unidad || 'Gráfica de barras agrupadas');

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
  const escala = escalaTexto();
  const fuente = 12 * escala;
  const contextoTexto = document.createElement('canvas').getContext('2d');
  const familia = getComputedStyle(svg).fontFamily;
  const medirTexto = (texto, peso = 400) => {
    contextoTexto.font = `${peso} ${fuente}px ${familia}`;
    return contextoTexto.measureText(String(texto)).width;
  };
  const recortarTexto = (texto, maxAncho, peso = 400) => {
    let corto = String(texto);
    if (medirTexto(corto, peso) <= maxAncho) return corto;
    while (corto && medirTexto(corto + '…', peso) > maxAncho) corto = corto.slice(0, -1);
    return corto + '…';
  };
  const nSeriesGlobal = Math.max(...datos.map(d => d.series.length));
  const alturaBarra = Math.ceil(fuente + 2);
  const espacioEntreSeries = Math.ceil(7 * escala);
  const alturaPorGrupo = nSeriesGlobal * (alturaBarra + espacioEntreSeries) - espacioEntreSeries;
  const margenGrupo = Math.ceil(24 * escala);
  const alturaZona = Math.ceil(24 * escala);
  const zonas = [...new Set(datos.map(d => d.zona ?? null))];
  const seriesLeyenda = datos[0].series;
  const margenIzq = Math.min(230, Math.max(95, Math.round(ancho * 0.28)));
  const anchoValor = Math.max(...datos.flatMap(d => d.series.map(s => medirTexto(fmtValor(s.valor), 600))));
  const anchoMaxLeyenda = ancho - 16;
  const altoFilaLeyenda = Math.ceil(24 * escala);
  let leyendaFilas = 1, anchoFilaLeyenda = 0;
  seriesLeyenda.forEach(s => {
    const w = 40 + medirTexto(s.nombre);
    if (anchoFilaLeyenda && anchoFilaLeyenda + w > anchoMaxLeyenda) { leyendaFilas++; anchoFilaLeyenda = 0; }
    anchoFilaLeyenda += w;
  });
  const margenTop = Math.ceil(40 * escala) + leyendaFilas * altoFilaLeyenda;
  let altoTotal = margenTop;
  zonas.forEach(z => {
    const enZona = datos.filter(d => z === null ? d.zona == null : d.zona === z);
    altoTotal += (z !== null && z !== '' ? alturaZona : 0) + enZona.length * (alturaPorGrupo + margenGrupo);
  });
  const margen = { top: margenTop, right: Math.ceil(anchoValor + 16), bottom: 16, left: margenIzq };
  const alto = Math.max(120, altoTotal + margen.bottom);
  const areaAncho = Math.max(40, ancho - margen.left - margen.right);
  const areaAlto = alto - margen.top - margen.bottom;

  svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
  svg.style.height = alto + 'px';
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', op.unidad || 'Gráfica de barras agrupadas');
  svg.setAttribute('title', op.unidad || 'Gráfica de barras agrupadas');
  const g = svgEl('g', { transform: `translate(${margen.left},${margen.top})` });

  const valores = datos.flatMap(d => d.series.map(s => s.valor)).filter(Number.isFinite);
  const minValor = Math.min(0, ...valores);
  const maxValor = Math.max(0, ...valores) || 1;
  const escalaX = valor => (valor - minValor) / (maxValor - minValor) * areaAncho;

  // Leyenda envuelta dentro del ancho disponible.
  if (datos.length && datos[0].series.length) {
    let offsetX = 0, filaLeyenda = 0;
    const leyenda = svgEl('g', { class: 'leyenda-comparacion', transform: 'translate(8,12)' });
    seriesLeyenda.forEach(s => {
      const anchoLeyenda = 40 + medirTexto(s.nombre);
      if (offsetX && offsetX + anchoLeyenda > anchoMaxLeyenda) { offsetX = 0; filaLeyenda++; }
      const gLey = svgEl('g', {});
      gLey.appendChild(svgEl('rect', {
        x: offsetX, y: filaLeyenda * altoFilaLeyenda, width: 11, height: 11, rx: 2, fill: s.color,
      }));
      const t = svgEl('text', {
        x: offsetX + 16, y: filaLeyenda * altoFilaLeyenda + 10, 'font-size': 12, fill: 'var(--text-secondary)',
      });
      t.textContent = s.nombre;
      gLey.appendChild(t);
      leyenda.appendChild(gLey);
      offsetX += anchoLeyenda;
    });
    svg.appendChild(leyenda);
  }

  // Rejilla
  const anchoTick = Math.max(medirTexto(fmt(minValor)), medirTexto(fmt(maxValor))) + 20;
  const lineas = Math.max(1, Math.min(4, Math.floor(areaAncho / anchoTick)));
  for (let i = 0; i <= lineas; i++) {
    const x = (areaAncho / lineas) * i;
    g.appendChild(svgEl('line', {
      x1: x, y1: 0, x2: x, y2: areaAlto,
      stroke: 'var(--grid-color)', 'stroke-width': 1,
    }));
    const lbl = svgEl('text', {
      x, y: -8, 'font-size': 11, 'text-anchor': 'middle',
      fill: 'var(--text-secondary)', 'font-variant-numeric': 'tabular-nums',
    });
    lbl.textContent = fmt(minValor + (maxValor - minValor) / lineas * i);
    g.appendChild(lbl);
  }

  // Dibujar grupos por zona
  let offsetY = 0;
  const tramosReporte = [];
  zonas.forEach(zona => {
    const gruposZona = datos.filter(d => zona === null ? d.zona == null : d.zona === zona);
    if (gruposZona.length === 0) return;

    // Etiqueta de zona
    if (zona !== null && zona !== '') {
      const lblZona = svgEl('text', {
        x: -10, y: offsetY + fuente, 'font-size': 12, 'text-anchor': 'end',
        fill: 'var(--text-dim)', 'font-weight': 600, 'text-transform': 'uppercase',
      });
      lblZona.textContent = recortarTexto(zona, margen.left - 20, 600);
      const tituloZona = svgEl('title', {});
      tituloZona.textContent = zona;
      lblZona.appendChild(tituloZona);
      g.appendChild(lblZona);
      offsetY += alturaZona;
    }

    gruposZona.forEach((grupo, indiceGrupo) => {
      tramosReporte.push({
        inicio: margen.top + offsetY - (indiceGrupo === 0 && zona !== null && zona !== '' ? alturaZona : 0),
        fin: margen.top + offsetY + alturaPorGrupo + margenGrupo,
        zona,
      });
      const nSeries = grupo.series.length;
      const alturaGrupo = nSeries * alturaBarra + (nSeries - 1) * espacioEntreSeries;
      const yBase = offsetY + (alturaPorGrupo - alturaGrupo) / 2;

      // PA y nombre van en líneas separadas para distinguir proyectos de una misma cuenta.
      const lineasEtiqueta = grupo.lineasEtiqueta || [grupo.etiqueta];
      lineasEtiqueta.forEach((linea, i) => {
        const peso = grupo.lineasEtiqueta && i === 0 ? 600 : 400;
        const lblGrupo = svgEl('text', {
          class: 'etiqueta-grupo', x: -10,
          y: offsetY + alturaPorGrupo / 2 + (i - (lineasEtiqueta.length - 1) / 2) * (fuente + 5),
          'font-size': 12, 'font-weight': peso,
          'text-anchor': 'end', fill: 'var(--text-primary)', 'dominant-baseline': 'middle',
        });
        lblGrupo.textContent = recortarTexto(linea, margen.left - 20, peso);
        const titulo = svgEl('title', {});
        titulo.textContent = grupo.etiqueta;
        lblGrupo.appendChild(titulo);
        g.appendChild(lblGrupo);
      });

      // Barras
      grupo.series.forEach((serie, si) => {
        const yBarra = yBase + si * (alturaBarra + espacioEntreSeries);
        const valor = Number.isFinite(serie.valor) ? serie.valor : 0;
        const xBarra = escalaX(Math.min(0, valor));
        const anchoBarra = Math.abs(escalaX(valor) - escalaX(0));

        const barra = svgEl('rect', {
          x: xBarra, y: yBarra, width: anchoBarra, height: alturaBarra,
          fill: serie.color, rx: 1.5,
        });
        g.appendChild(barra);

        // Las cuatro series muestran el importe completo, también acumulado y proyectada.
        const lblValor = svgEl('text', {
          class: 'valor-serie', x: xBarra + anchoBarra + 6, y: yBarra + alturaBarra / 2,
          'font-size': 12, 'font-weight': 600, 'dominant-baseline': 'middle',
          fill: 'var(--text-primary)', 'font-variant-numeric': 'tabular-nums',
        });
        lblValor.textContent = fmtValor(serie.valor);
        g.appendChild(lblValor);

        // Tooltip
        const zona = svgEl('rect', {
          x: xBarra, y: yBarra, width: Math.max(anchoBarra, 30), height: alturaBarra,
          fill: 'transparent',
        });
        zona.style.cursor = 'pointer';
        if (op.alClickar) {
          zona.setAttribute('role', 'button'); zona.setAttribute('tabindex', '0');
          zona.setAttribute('aria-label', `${grupo.etiqueta}: ${serie.nombre}, ${fmt(serie.valor)}. Filtrar por ${grupo.etiqueta}`);
          zona.addEventListener('click', () => op.alClickar(grupo.etiqueta));
          zona.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); op.alClickar(grupo.etiqueta); } });
        }
        zona.addEventListener('mouseenter', e => {
          barra.setAttribute('opacity', '0.78');
          mostrarTooltip(e, grupo.etiqueta, [{
            color: serie.color,
            etiqueta: serie.nombre,
            valor: fmtValor(serie.valor),
          }]);
        });
        zona.addEventListener('mousemove', moverTooltip);
        zona.addEventListener('mouseleave', () => {
          barra.removeAttribute('opacity');
          ocultarTooltip();
        });
        g.appendChild(zona);
      });

      offsetY += alturaPorGrupo + margenGrupo;
    });
  });

  svg.appendChild(g);
  svg.dataset.reporteCabecera = String(margen.top);
  svg.dataset.reporteTramos = JSON.stringify(tramosReporte);
}
