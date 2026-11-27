// Gráfica de Commit y Upside apilados mes a mes de un proyecto, en el detalle.

import { etiquetaPeriodoCalendario } from './calendario.js';
import { formatearDinero } from './formato.js';
import { svgEl, escalaTexto } from './grafica-base.js';
import { registrarGrafica } from './grafica-registro.js';
import { mostrarTooltip, moverTooltip, ocultarTooltip } from './grafica-tooltip.js';

/**
 * Revenue mensual de un proyecto: Fijo y Upside apilados.
 *
 * Soporta valores negativos: 9 de los 304 proyectos traen meses en negativo
 * (notas crédito y reversiones del Excel). Cuando los hay, el eje baja del
 * cero y esas barras se dibujan hacia abajo.
 */
export function crearGraficaRevenueProyecto(svg, datos, meses) {
  if (!svg) return;
  registrarGrafica(svg, () => crearGraficaRevenueProyecto(svg, datos, meses));
  svg.innerHTML = '';
  svg.style.removeProperty('height');

  const SERIES = ['Commit', 'Upside'];
  const ancho = Math.max(300, svg.clientWidth || 300);
  const alto = 320;
  const margen = { top: 34, right: 18, bottom: 46, left: 72 };
  const areaAncho = ancho - margen.left - margen.right;
  const areaAlto = alto - margen.top - margen.bottom;
  svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
  svg.style.height = `${alto}px`;
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Revenue mensual del proyecto');
  svg.setAttribute('title', 'Revenue mensual del proyecto');

  const g = svgEl('g', { transform: `translate(${margen.left},${margen.top})` });

  // Los topes se calculan sobre el apilado, separando lo positivo de lo
  // negativo: si no, un mes con crédito descuadra la escala.
  let maxPos = 0, minNeg = 0;
  meses.forEach(m => {
    let pos = 0, neg = 0;
    SERIES.forEach(s => {
      const v = (datos[m] || {})[s] || 0;
      if (v >= 0) pos += v; else neg += v;
    });
    maxPos = Math.max(maxPos, pos);
    minNeg = Math.min(minNeg, neg);
  });
  if (maxPos === 0 && minNeg === 0) maxPos = 1;

  const rango = maxPos - minNeg;
  const y = v => areaAlto - ((v - minNeg) / rango) * areaAlto;
  const yCero = y(0);

  // Rejilla
  const lineas = 4;
  for (let i = 0; i <= lineas; i++) {
    const v = minNeg + (rango / lineas) * i;
    const vy = y(v);
    g.appendChild(svgEl('line', {
      x1: 0, y1: vy, x2: areaAncho, y2: vy,
      stroke: 'var(--grid-color)', 'stroke-width': 1,
    }));
    const lbl = svgEl('text', {
      x: -9, y: vy + 4, 'font-size': 11, 'text-anchor': 'end',
      fill: 'var(--text-dim)', 'font-variant-numeric': 'tabular-nums',
    });
    lbl.textContent = formatearDinero(v);
    g.appendChild(lbl);
  }
  // Línea del cero, más marcada cuando hay negativos.
  g.appendChild(svgEl('line', {
    x1: 0, y1: yCero, x2: areaAncho, y2: yCero,
    stroke: 'var(--baseline-color)', 'stroke-width': minNeg < 0 ? 1.5 : 1,
  }));

  const paso = areaAncho / meses.length;
  const anchoBarra = Math.max(1,Math.min(46, paso - 6));

  meses.forEach((m, i) => {
    const x = i * paso + (paso - anchoBarra) / 2;
    const vals = SERIES.map(s => (datos[m] || {})[s] || 0);
    let acumPos = 0, acumNeg = 0;

    SERIES.forEach((s, si) => {
      const v = vals[si];
      if (!v) return;
      let y0, y1;
      if (v > 0) { y0 = y(acumPos + v); y1 = y(acumPos); acumPos += v; }
      else { y0 = y(acumNeg); y1 = y(acumNeg + v); acumNeg += v; }
      const h = Math.max(1, Math.abs(y1 - y0) - (si > 0 ? 2 : 0)); // 2px de aire
      g.appendChild(svgEl('rect', {
        x, y: Math.min(y0, y1), width: anchoBarra, height: h,
        fill: `var(--series-${si + 1})`, rx: 2,
      }));
      const valor=svgEl('text',{x:x+anchoBarra/2,y:Math.max(10,Math.min(areaAlto-2,Math.min(y0,y1)-4)),'text-anchor':'middle',class:'valor-punto'});
      valor.textContent=formatearDinero(v);g.appendChild(valor);
    });

    // Zona sensible: toda la columna, no solo la barra.
    const zona = svgEl('rect', { x: i * paso, y: 0, width: paso, height: areaAlto, fill: 'transparent' });
    zona.style.cursor = 'pointer';
    zona.addEventListener('mouseenter', ev => mostrarTooltip(ev,
      etiquetaPeriodoCalendario(m),
      SERIES.map((s, si) => ({
        color: `var(--series-${si + 1})`,
        etiqueta: s,
        valor: Number.isFinite((datos[m]||{})[s])?'$'+vals[si].toLocaleString('en-US',{maximumFractionDigits:0}):'Sin dato',
      }))));
    zona.addEventListener('mousemove', moverTooltip);
    zona.addEventListener('mouseleave', ocultarTooltip);
    g.appendChild(zona);

    const lbl = svgEl('text', {
      x: i * paso + paso / 2, y: areaAlto + 16,
      'font-size': 10, 'text-anchor': 'middle', fill: 'var(--text-dim)',
    });
    lbl.textContent = (i%Math.ceil(meses.length/10)===0||i===meses.length-1)?etiquetaPeriodoCalendario(m):'';
    if(!SERIES.some(s=>Number.isFinite((datos[m]||{})[s]))) {
      const vacio=svgEl('text',{x:i*paso+paso/2,y:yCero-6,'font-size':9,'text-anchor':'middle',fill:'var(--text-dim)'});vacio.textContent='s/d';g.appendChild(vacio);
    }
    g.appendChild(lbl);
  });

  // Leyenda arriba, fuera del área de datos.
  let off = 0;
  SERIES.forEach((s, si) => {
    g.appendChild(svgEl('rect', {
      x: off, y: -26, width: 11, height: 11, rx: 2, fill: `var(--series-${si + 1})`,
    }));
    const t = svgEl('text', { x: off + 16, y: -17, 'font-size': 11, fill: 'var(--text-secondary)' });
    t.textContent = s;
    g.appendChild(t);
    off += 16 + s.length * 7.2 * escalaTexto() + 18;
  });

  svg.appendChild(g);
}
