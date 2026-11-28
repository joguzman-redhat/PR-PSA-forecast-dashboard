// Gráfica de línea multiserie.

import { formatearDinero } from './formato.js';
import { escalaTexto, svgEl } from './grafica-base.js';
import { registrarGrafica } from './grafica-registro.js';
import { mostrarTooltip, ocultarTooltip } from './grafica-tooltip.js';

/**
 * Gráfica de línea multiserie.
 *
 * `datos` = { "etiqueta del punto": { "Serie A": n, "Serie B": n }, ... }
 */
export function crearGraficaLinea(svg, datos, opciones) {
  if (!svg) return;
  registrarGrafica(svg, () => crearGraficaLinea(svg, datos, opciones));
  svg.innerHTML = '';
  svg.style.removeProperty('height');
  const op = opciones || {};

  const puntos = Object.keys(datos);
  const series = puntos.length ? Object.keys(datos[puntos[0]]) : [];

  // Con una sola carga no hay linea que dibujar, pero el dato SI existe.
  // Decir "sin historico" se lee como "no hay datos" y manda a buscar un fallo
  // que no esta: se muestran los valores de esa carga y por que falta la linea.
  if (puntos.length === 1 && series.length && op.ejeX !== 'categoria') {
    svg.style.height = '130px';
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Valores de la única carga disponible');
    svg.setAttribute('viewBox', '0 0 600 130');
    const etq = svgEl('text', { x: 300, y: 26, 'text-anchor': 'middle',
      'font-size': 12, fill: 'var(--text-dim)' });
    etq.textContent = `Una sola carga (${puntos[0]}) · la línea aparece desde la segunda`;
    svg.appendChild(etq);
    const paso = 600 / (series.length + 1);
    series.forEach((nombre, i) => {
      const x = paso * (i + 1);
      const valor = svgEl('text', { x, y: 76, 'text-anchor': 'middle',
        'font-size': 20, fill: `var(--series-${(i % 8) + 1})`,
        'font-variant-numeric': 'tabular-nums' });
      valor.textContent = formatearDinero(datos[puntos[0]][nombre] || 0);
      svg.appendChild(valor);
      const lab = svgEl('text', { x, y: 100, 'text-anchor': 'middle',
        'font-size': 11, fill: 'var(--text-dim)' });
      lab.textContent = nombre;
      svg.appendChild(lab);
    });
    return;
  }

  if (!puntos.length || !series.length) {
    svg.style.height = '120px';
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Sin histórico disponible');
    svg.setAttribute('viewBox', '0 0 600 120');
    const t = svgEl('text', { x: 300, y: 60, 'text-anchor': 'middle',
      'font-size': 13, fill: 'var(--text-dim)' });
    t.textContent = 'Sin histórico disponible';
    svg.appendChild(t);
    return;
  }

  const ancho = Math.max(300, svg.clientWidth || 300);
  // Se calcula el número real de filas de leyenda con el mismo algoritmo que
  // dibuja los elementos, dejando el área del gráfico libre.
  const margenIzq = Math.min(100, Math.round(ancho * 0.24));
  const anchoLeyenda = Math.max(100, ancho - margenIzq - 44);
  let leyendaFilas = 1, anchoFilaLeyenda = 0;
  series.forEach(s => {
    const w = 19 + s.length * 7.2 * escalaTexto() + 16;
    if (anchoFilaLeyenda && anchoFilaLeyenda + w > anchoLeyenda) { leyendaFilas++; anchoFilaLeyenda = 0; }
    anchoFilaLeyenda += w;
  });
  const margen = { top: 24 + leyendaFilas * 18, right: 44, bottom: 40, left: margenIzq };
  const alto = Math.max(340, margen.top + margen.bottom + 200);
  const areaAncho = Math.max(120, ancho - margen.left - margen.right);
  const areaAlto = alto - margen.top - margen.bottom;
  svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
  svg.style.height = `${alto}px`;
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', op.unidad || 'Evolución de revenue');
  svg.setAttribute('title', op.unidad || 'Evolución de revenue');

  const g = svgEl('g', { transform: `translate(${margen.left},${margen.top})` });

  const todos = puntos.flatMap(p => series.map(s => datos[p][s])).filter(Number.isFinite);
  const maxV = Math.max(...todos, 0) || 1;
  const minV = Math.min(...todos, 0);
  const x = i => puntos.length === 1 ? areaAncho / 2 : (areaAncho / (puntos.length - 1)) * i;
  const y = v => areaAlto - ((v - minV) / (maxV - minV || 1)) * areaAlto;
  const colorSerie = i => `var(--series-${Math.min(i + 1, 8)})`;
  const desdeEstimado = Number.isInteger(op.desdeEstimado) && op.desdeEstimado >= 0 && op.desdeEstimado < puntos.length
    ? op.desdeEstimado : null;
  const esEstimado = i => desdeEstimado !== null && i >= desdeEstimado;
  if (desdeEstimado !== null) {
    const inicio = desdeEstimado ? (x(desdeEstimado - 1) + x(desdeEstimado)) / 2 : 0;
    g.appendChild(svgEl('rect', {
      x: inicio, y: 0, width: areaAncho - inicio, height: areaAlto,
      fill: 'var(--series-1)', opacity: 0.06,
    }));
    const aviso = svgEl('text', {
      x: areaAncho, y: -8, 'font-size': 12, 'text-anchor': 'end', fill: 'var(--text-secondary)',
    });
    aviso.textContent = 'Proyección estimada';
    g.appendChild(aviso);
  }

  // Rejilla + eje Y
  const lineas = 4;
  for (let i = 0; i <= lineas; i++) {
    const vy = areaAlto - (areaAlto / lineas) * i;
    g.appendChild(svgEl('line', {
      x1: 0, y1: vy, x2: areaAncho, y2: vy,
      stroke: i === 0 ? 'var(--baseline-color)' : 'var(--grid-color)', 'stroke-width': 1,
    }));
    const lbl = svgEl('text', {
      x: -9, y: vy + 4, 'font-size': 11, 'text-anchor': 'end',
      fill: 'var(--text-dim)', 'font-variant-numeric': 'tabular-nums',
    });
    lbl.textContent = formatearDinero(minV + ((maxV - minV) / lineas) * i);
    g.appendChild(lbl);
  }

  // Eje X: fecha breve y horizontal; el title conserva la etiqueta exacta.
  const maxTicks = Math.max(2, Math.min(6, Math.floor(areaAncho / 76)));
  const salto = Math.max(1, Math.ceil((puntos.length - 1) / (maxTicks - 1)));
  puntos.forEach((p, i) => {
    if (i % salto !== 0 && i !== puntos.length - 1) return;
    const lbl = svgEl('text', {
      'font-size': 10, fill: 'var(--text-dim)',
      x: x(i), y: areaAlto + 24, 'text-anchor': 'middle',
    });
    const fecha = new Date(p);
    const fechaValida = !Number.isNaN(fecha.getTime());
    const tieneHora = /(?:T|\s)\d{1,2}:\d{2}/.test(p);
    lbl.textContent = op.ejeX === 'categoria' ? p : fechaValida
      ? new Intl.DateTimeFormat('es-CO', tieneHora
        ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }
        : { day: '2-digit', month: 'short' }).format(fecha).replace(',', '')
      : (p.length > 12 ? p.slice(0, 11) + '…' : p);
    const fechaCompleta = svgEl('title', {}); fechaCompleta.textContent = p; lbl.appendChild(fechaCompleta);
    g.appendChild(lbl);
  });

  // Líneas
  const trazos = {};
  series.forEach((s, si) => {
    const segmentos = desdeEstimado === null
      ? [{ inicio: 0, fin: puntos.length, estimado: false }]
      : [{ inicio: 0, fin: desdeEstimado, estimado: false },
        { inicio: Math.max(0, desdeEstimado - 1), fin: puntos.length, estimado: true }];
    trazos[s] = [];
    segmentos.forEach(segmento => {
      if (segmento.fin <= segmento.inicio) return;
      let continuo=false;
      const d = puntos.slice(segmento.inicio, segmento.fin).map((p,i)=>{
        const v=datos[p][s];if(!Number.isFinite(v)){continuo=false;return '';}
        const cmd=continuo?'L':'M';continuo=true;return `${cmd}${x(i+segmento.inicio)},${y(v)}`;
      }).join(' ');
      const trazo = svgEl('path', {
        d, fill: 'none', stroke: colorSerie(si), 'stroke-width': 2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      });
      if (segmento.estimado) { trazo.setAttribute('stroke-dasharray', '6 4'); trazo.dataset.estimado = 'true'; }
      trazos[s].push(trazo);
      g.appendChild(trazo);
    });
    // Con `soloCambios`, el punto se dibuja unicamente donde el valor se
    // movio. Es lo que hace legible "aqui cambio": entre un cambio y otro la
    // linea va limpia, y cada marca es una fecha en la que paso algo.
    puntos.forEach((p, i) => {
      const v = datos[p][s];
      if(!Number.isFinite(v))return;
      const cambio = i === 0 || Math.abs(v - (datos[puntos[i - 1]][s] || 0)) > 0.5;
      if (op.soloCambios && !cambio) return;
      const punto = svgEl('circle', {
        cx: x(i), cy: y(v), r: op.soloCambios ? 5 : 4,
        fill: esEstimado(i) ? 'var(--surface-1)' : colorSerie(si),
        stroke: esEstimado(i) ? colorSerie(si) : 'var(--surface-1)', 'stroke-width': 2,
      });
      trazos[s].push(punto);
      g.appendChild(punto);
      if(op.etiquetasValores){
        const label=svgEl('text',{x:x(i),y:Math.max(10,Math.min(areaAlto-2,y(v)+(si%2?17:-10))),'text-anchor':i===0?'start':i===puntos.length-1?'end':'middle',class:'valor-punto'});
        label.textContent=formatearDinero(v);g.appendChild(label);trazos[s].push(label);
      }
    });
  });

  // Leyenda arriba, fuera del área de datos para no taparlos.
  const leyenda = svgEl('g', {});
  const etiquetasLeyenda = [];
  let offset = 0, filaLeyenda = 0;
  series.forEach((s, si) => {
    const anchoItem = 19 + s.length * 7.2 * escalaTexto() + 16;
    if (offset && offset + anchoItem > anchoLeyenda) { offset = 0; filaLeyenda++; }
    const item = svgEl('g', {});
    item.setAttribute('transform', `translate(${offset},${-margen.top + 16 + filaLeyenda * 18})`);
    item.appendChild(svgEl('line', {
      x1: 0, y1: -4, x2: 14, y2: -4,
      stroke: colorSerie(si), 'stroke-width': 2, 'stroke-linecap': 'round',
    }));
    const t = svgEl('text', {
      x: 19, y: 0, 'font-size': 11, fill: 'var(--text-secondary)',
    });
    t.textContent = s;
    item.appendChild(t);
    leyenda.appendChild(item);
    etiquetasLeyenda.push(item);
    offset += anchoItem;
  });
  g.appendChild(leyenda);

  // --- crosshair + tooltip ---
  const guia = svgEl('line', {
    y1: 0, y2: areaAlto, stroke: 'var(--baseline-color)',
    'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0,
  });
  g.appendChild(guia);
  const marcas = series.map((_, si) => {
    const c = svgEl('circle', {
      r: 6, fill: colorSerie(si), stroke: 'var(--surface-1)',
      'stroke-width': 2, opacity: 0,
    });
    g.appendChild(c);
    return c;
  });

  const captura = svgEl('rect', {
    x: 0, y: 0, width: areaAncho, height: areaAlto, fill: 'transparent',
  });
  captura.addEventListener('mousemove', ev => {
    const caja = svg.getBoundingClientRect();
    // El SVG escala con viewBox: hay que pasar de píxeles de pantalla a
    // coordenadas del lienzo antes de buscar el punto más cercano.
    const escala = ancho / caja.width;
    const px = (ev.clientX - caja.left) * escala - margen.left;
    const i = Math.max(0, Math.min(puntos.length - 1,
      Math.round(px / (areaAncho / Math.max(1, puntos.length - 1)))));

    guia.setAttribute('x1', x(i));
    guia.setAttribute('x2', x(i));
    guia.setAttribute('opacity', 1);
    series.forEach((s, si) => {
      marcas[si].setAttribute('cx', x(i));
      marcas[si].setAttribute('cy', y(datos[puntos[i]][s] || 0));
      marcas[si].setAttribute('opacity', Number.isFinite(datos[puntos[i]][s])?1:0);
    });
    mostrarTooltip(ev, puntos[i] + (esEstimado(i) ? ' · Estimado' : ''), series.map((s, si) => ({
      color: colorSerie(si),
      etiqueta: s,
      valor: Number.isFinite(datos[puntos[i]][s])?'$'+datos[puntos[i]][s].toLocaleString('en-US',{maximumFractionDigits:0}):'Sin dato',
    })));
  });
  captura.addEventListener('mouseleave', () => {
    guia.setAttribute('opacity', 0);
    marcas.forEach(m => m.setAttribute('opacity', 0));
    ocultarTooltip();
  });
  g.appendChild(captura);

  svg.appendChild(g);

  // Con muchas líneas juntas, saber cuál es cuál solo por la leyenda es
  // difícil. Esto deja atenuar todas menos una desde fuera (la tabla).
  return {
    destacar(serie) {
      series.forEach(s => {
        const activa = !serie || s === serie;
        trazos[s].forEach(el => {
          el.setAttribute('opacity', activa ? 1 : 0.12);
          if (el.tagName === 'path') {
            el.setAttribute('stroke-width', serie && s === serie ? 3.5 : 2);
          }
        });
      });
      etiquetasLeyenda.forEach((el, i) => {
        el.setAttribute('opacity', !serie || series[i] === serie ? 1 : 0.25);
      });
    },
  };
}
