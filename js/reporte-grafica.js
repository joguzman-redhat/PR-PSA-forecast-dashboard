// Reparto de una gráfica SVG en páginas del informe PDF.
import { svgEl } from './grafica-base.js';

// Reporte independiente del layout del dashboard. Los SVG siguen siendo
// vectoriales al guardar el resultado desde la impresión del navegador.
export const ANCHO_GRAFICA_REPORTE = 960;
const ALTO_GRAFICA_REPORTE = 440;
let identificadorRecorteReporte = 0;

/** Mantener el mismo tamaño de texto, repartiendo gráficas altas por filas completas. */
export function paginarGraficaReporte(svg) {
  const base = svg.cloneNode(true);
  base.removeAttribute('id');
  base.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  base.querySelectorAll('[tabindex]').forEach(el => el.removeAttribute('tabindex'));
  base.querySelectorAll('[role="button"]').forEach(el => el.removeAttribute('role'));
  const caja = svg.viewBox.baseVal;
  const ancho = caja.width || ANCHO_GRAFICA_REPORTE;
  const alto = ALTO_GRAFICA_REPORTE * ancho / ANCHO_GRAFICA_REPORTE;
  const cabecera = Number(svg.dataset.reporteCabecera) || 0;
  const espacioCuerpo = alto - cabecera;
  const cortes = JSON.parse(svg.dataset.reporteCortes || '[]');
  const segmentos = [];
  if (caja.height <= alto) segmentos.push({ inicio: cabecera, fin: caja.height });
  else if (cortes.length) {
    cortes.forEach(corte => {
      const anterior = segmentos[segmentos.length - 1];
      if (anterior && corte.fin - anterior.inicio <= espacioCuerpo) anterior.fin = corte.fin;
      else segmentos.push({ inicio: corte.inicio, fin: corte.fin });
    });
  } else {
    for (let inicio = cabecera; inicio < caja.height; inicio += espacioCuerpo) {
      segmentos.push({ inicio, fin: Math.min(inicio + espacioCuerpo, caja.height) });
    }
  }
  return segmentos.map(segmento => {
    const copia = svgEl('svg', {
      viewBox: `0 0 ${ancho} ${alto}`, preserveAspectRatio: 'xMidYMid meet',
      role: 'img', 'aria-label': svg.getAttribute('aria-label') || 'Gráfica de revenue',
    });
    const uid = `recorte-reporte-${++identificadorRecorteReporte}`;
    const defs = svgEl('defs');
    [['cabecera', 0, cabecera], ['cuerpo', cabecera, Math.min(espacioCuerpo, segmento.fin - segmento.inicio)]].forEach(([nombre, y, altura]) => {
      const recorte = svgEl('clipPath', { id: `${uid}-${nombre}` });
      recorte.appendChild(svgEl('rect', { x: 0, y, width: ancho, height: Math.max(0, altura) }));
      defs.appendChild(recorte);
    });
    copia.appendChild(defs);
    if (cabecera) {
      const superior = svgEl('g', { 'clip-path': `url(#${uid}-cabecera)` });
      [...base.childNodes].forEach(el => superior.appendChild(el.cloneNode(true)));
      copia.appendChild(superior);
    }
    const cuerpo = svgEl('g', { 'clip-path': `url(#${uid}-cuerpo)` });
    const interior = svgEl('g', { transform: `translate(0,${cabecera - segmento.inicio})` });
    [...base.childNodes].forEach(el => interior.appendChild(el.cloneNode(true)));
    cuerpo.appendChild(interior);
    copia.appendChild(cuerpo);
    return copia;
  });
}
