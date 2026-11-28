// Curvas de los proyectos que más se movieron entre dos Snapshots.

import { sumarMeses } from './calendario.js';
import { estado } from './estado.js';
import { svgEl } from './grafica-base.js';
import { crearGraficaLinea } from './grafica-linea.js';
import { fijarGraficaQueCambio, registrarGrafica } from './grafica-registro.js';


/**
 * "¿Qué cambió entre dos fechas?" — la pregunta real del negocio no es
 * cuánto hay en commit y cuánto en upside, sino QUIÉN se movió y hacia
 * dónde. Esta vista responde eso para cualquier par de snapshots: resumen
 * del rango, las curvas de los que más se movieron, y la lista completa.
 */

const MAX_LINEAS_CAMBIO = 8;

export function renderizarGraficaCambios(filas, snaps, iA, iB) {
  const svg = document.getElementById('grafica-que-cambio');
  const nota = document.getElementById('nota-que-cambio');
  if (!svg) return;
  registrarGrafica(svg, () => renderizarGraficaCambios(filas, snaps, iA, iB));
  fijarGraficaQueCambio(null);

  const movidos = filas.filter(f => f.cambio).slice(0, MAX_LINEAS_CAMBIO);
  if (!movidos.length || iB - iA < 1) {
    svg.innerHTML = '';
    svg.style.height = '110px';
    svg.setAttribute('viewBox', '0 0 600 90');
    const t = svgEl('text', { x: 300, y: 50, 'text-anchor': 'middle',
      'font-size': 13, fill: 'var(--text-dim)' });
    t.textContent = iB - iA < 1
      ? 'Elige dos fechas distintas para comparar'
      : 'Ningún proyecto se movió en este rango';
    svg.appendChild(t);
    if (nota) nota.textContent = '';
    return;
  }

  // Etiqueta corta y única: dos proyectos del mismo cliente comparten PA
  // truncado, así que se desempata con el nombre.
  const usadas = new Set();
  movidos.forEach(f => {
    let etq = f.etiquetaCorta;
    let n = 2;
    while (usadas.has(etq)) etq = `${f.etiquetaCorta} (${n++})`;
    usadas.add(etq);
    f.serie = etq;
  });

  const datos = {};
  for (let i = iA; i <= iB; i++) {
    const fila = {};
    movidos.forEach(f => {
      const s = estado.historia.series_por_proyecto[f.pa]
        .find(x => x.snapshot_id === snaps[i].id);
      fila[f.serie] = s ? sumarMeses(s.meses).fijo : 0;
    });
    datos[snaps[i].etiqueta] = fila;
  }
  fijarGraficaQueCambio(crearGraficaLinea(svg, datos, { soloCambios: true }));

  if (nota) {
    const resto = filas.filter(f => f.cambio).length - movidos.length;
    nota.textContent = `Los ${movidos.length} proyectos con mayor variación de Commit. ` +
      (resto > 0 ? `Otros ${resto} también se movieron: están en la tabla. ` : '') +
      'Pasa el mouse por un renglón de la tabla para resaltar su línea.';
  }
}
