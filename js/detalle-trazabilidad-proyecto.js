// Trazabilidad de UN proyecto, al pie de su detalle (la global es otra vista).

import { MESES_ES, compararMeses } from './calendario.js';
import { claveProyecto } from './clave-proyecto.js';
import { backlogDe } from './fila-backlog.js';
import { estado } from './estado.js';
import { formatearDinero } from './formato.js';
import { crearGraficaLinea } from './grafica-linea.js';
import { serieSaldoProyecto } from './series-revenue.js';
import { MINIMO_CAMBIO } from './umbral-cambio.js';
import { indicesVidaProyecto } from './vida-proyecto.js';

/**
 * Tres bloques, de lo general a lo específico:
 *   1. cómo evolucionó el revenue total del proyecto
 *   2. mes a mes, cuánto había antes y cuánto hay ahora (el delta)
 *   3. el registro de los movimientos concretos, con fecha
 */
export function renderizarTrazabilidadProyecto(contenedor, proyecto) {
  const indices=indicesVidaProyecto(proyecto);
  const sumarVida=meses=>indices.reduce((a,i)=>({fijo:a.fijo+(meses?.[i]?.[0]||0),upside:a.upside+(meses?.[i]?.[1]||0)}),{fijo:0,upside:0});
  const hist = estado.historia;
  const pa = claveProyecto(proyecto);
  const serie = hist && hist.series_por_proyecto && hist.series_por_proyecto[pa];

  const div = document.createElement('div');
  div.className = 'detalle-trazabilidad';
  const h4 = document.createElement('h4');
  h4.textContent = 'Trazabilidad de Revenue · vida completa del proyecto';
  div.appendChild(h4);

  // --- Backlog vs. Revenue, mes a mes del año actual. Va antes del resto a
  // propósito: solo necesita el estado actual (BackLog NOLA), no el
  // histórico de snapshots, así que se ve aunque el proyecto no tenga
  // histórico todavía.
  if (backlogDe(proyecto)) {
    const divBVR = document.createElement('div');
    divBVR.className = 'detalle-revenue';
    const h4bvr = document.createElement('h4');
    h4bvr.textContent = 'Backlog vs. revenue acumulado · Vida del proyecto';
    divBVR.appendChild(h4bvr);
    const notaBVR = document.createElement('p');
    notaBVR.className = 'nota-grafica';
    divBVR.appendChild(notaBVR);
    const svgBVR = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgBVR.id = 'grafica-backlog-proyecto';
    svgBVR.setAttribute('class', 'grafica-svg');
    divBVR.appendChild(svgBVR);
    const saldo=serieSaldoProyecto(proyecto);
    crearGraficaLinea(svgBVR,saldo.datos,{ejeX:'categoria',unidad:'Backlog y revenue acumulado',etiquetasValores:true});
    notaBVR.textContent=saldo.nota;
    div.appendChild(divBVR);
  }

  if (!serie || serie.length < 2) {
    const p = document.createElement('p');
    p.className = 'aviso-sin-datos';
    p.textContent = 'Todavía no hay suficientes capturas para comparar cambios de este proyecto.';
    div.appendChild(p);
    contenedor.appendChild(div);
    return;
  }

  const etiquetaDe = id => {
    const s = hist.snapshots.find(x => x.id === id);
    return s ? s.etiqueta : id;
  };

  // --- 1. evolución del total (el movimiento: Commit vs Upside) ---
  const evolucion = {};
  serie.forEach(s => {
    const t = sumarVida(s.meses);          // solo los meses del periodo
    evolucion[etiquetaDe(s.snapshot_id)] = { 'Commit': t.fijo, 'Upside': t.upside };
  });
  // ¿Hubo algún movimiento en el periodo elegido? Una línea plana no comunica
  // nada: si el dato nunca se movió, es más honesto decirlo con palabras.
  const etiquetas = Object.keys(evolucion);
  const valores = Object.values(evolucion);
  const fechasCambio = etiquetas.filter((_, i) => {
    if(!i)return false;
    if(estado.forecast.timeline){const c=compararMeses(serie[i-1],serie[i],indices);return Math.abs(c.fijoB-c.fijoA)>.5||Math.abs(c.upsideB-c.upsideA)>.5;}
    return Math.abs(valores[i].Commit-valores[i-1].Commit)>.5||Math.abs(valores[i].Upside-valores[i-1].Upside)>.5;
  });

  const resumen = document.createElement('p');
  resumen.className = 'resumen-cambios';
  div.appendChild(resumen);

  if (!fechasCambio.length) {
    const t = sumarVida(serie[serie.length - 1].meses);
    resumen.innerHTML = estado.forecast.timeline && serie.some((x,i)=>i&&compararMeses(serie[i-1],x,indices).nuevos>0)
      ? 'Se incorporaron meses de otro año. No se detectaron variaciones en los meses comparables.'
      : (Math.abs(t.fijo) < 1 && Math.abs(t.upside) < 1)
      ? `Este proyecto no tiene revenue en <strong>vida completa del proyecto</strong>.`
      : `El revenue de <strong>vida completa del proyecto</strong> nunca se movió: ` +
        `${formatearDinero(t.fijo)} en Commit desde el primer Snapshot hasta hoy.`;
  } else {
    resumen.innerHTML = `<strong>${fechasCambio.length}</strong> ` +
      `movimiento${fechasCambio.length === 1 ? '' : 's'} en ` +
      `<strong>vida completa del proyecto</strong> · ` +
      `${fechasCambio.slice(0, 6).join(' · ')}${fechasCambio.length > 6 ? ' …' : ''}`;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.className.baseVal = 'grafica-svg';
    div.appendChild(svg);
    // soloCambios: el punto se dibuja donde pasó algo, no en los 32 Snapshots.
    crearGraficaLinea(svg, evolucion, { soloCambios: true, etiquetasValores:true });
  }

  // --- 2. comparador mes a mes ---
  const comp = document.createElement('div');
  comp.className = 'comparador-meses';

  const selA = document.createElement('select');
  const selB = document.createElement('select');
  serie.forEach((s, i) => {
    [selA, selB].forEach((sel, k) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = etiquetaDe(s.snapshot_id);
      if ((k === 0 && i === 0) || (k === 1 && i === serie.length - 1)) o.selected = true;
      sel.appendChild(o);
    });
  });

  const lbl = document.createElement('span');
  lbl.className = 'comparador-texto';
  lbl.textContent = 'Comparar revenue mes a mes entre';
  const lbl2 = document.createElement('span');
  lbl2.className = 'comparador-texto';
  lbl2.textContent = 'y';
  comp.append(lbl, selA, lbl2, selB);
  div.appendChild(comp);

  const tablaMeses = document.createElement('table');
  tablaMeses.className = 'tabla-meses';
  div.appendChild(tablaMeses);

  const idxMeses = indices;

  function pintarTablaMeses() {
    const a = serie[Number(selA.value)];
    const b = serie[Number(selB.value)];
    tablaMeses.innerHTML = '';

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    ['Mes', `Commit · #${a.snapshot_id.replace(/^t/,'')}`, `Commit · #${b.snapshot_id.replace(/^t/,'')}`,
      'Δ Commit', `Upside · #${a.snapshot_id.replace(/^t/,'')}`, `Upside · #${b.snapshot_id.replace(/^t/,'')}`, 'Δ Upside']
      .forEach(t => { const th = document.createElement('th'); th.textContent = t; trh.appendChild(th); });
    thead.appendChild(trh);
    tablaMeses.appendChild(thead);

    const tbody = document.createElement('tbody');
    let tfa = 0, tfb = 0, tua = 0, tub = 0;

    idxMeses.forEach(i => {
      const m = MESES_ES[i];
      const [fa, ua] = a.meses[i] || [0, 0];
      const [fb, ub] = b.meses[i] || [0, 0];
      const comparable=!estado.forecast.timeline||(Number.isFinite(fa)&&Number.isFinite(fb)&&Number.isFinite(ua)&&Number.isFinite(ub));
      if(comparable){tfa+=fa;tfb+=fb;tua+=ua;tub+=ub;}
      // Los meses que nunca tuvieron plata solo alargan la tabla.
      if (!fa && !fb && !ua && !ub) return;

      const tr = document.createElement('tr');
      const celda = (txt, clase) => {
        const td = document.createElement('td');
        td.textContent = txt;
        if (clase) td.className = clase;
        tr.appendChild(td);
      };
      celda(m.charAt(0).toUpperCase() + m.slice(1));
      celda(formatearDinero(fa), 'celda-numero');
      celda(formatearDinero(fb), 'celda-numero');
      celda(comparable?delta(fb-fa):'—', 'celda-numero '+(comparable?claseDelta(fb-fa):''));
      celda(formatearDinero(ua), 'celda-numero');
      celda(formatearDinero(ub), 'celda-numero');
      celda(comparable?delta(ub-ua):'—', 'celda-numero '+(comparable?claseDelta(ub-ua,true):''));
      tbody.appendChild(tr);
    });

    const trt = document.createElement('tr');
    trt.className = 'fila-total';
    [[estado.forecast.timeline?'Total comparable':'Total', ''], [formatearDinero(tfa), 'celda-numero'], [formatearDinero(tfb), 'celda-numero'],
      [delta(tfb - tfa), 'celda-numero ' + claseDelta(tfb - tfa)],
      [formatearDinero(tua), 'celda-numero'], [formatearDinero(tub), 'celda-numero'],
      [delta(tub - tua), 'celda-numero ' + claseDelta(tub - tua, true)]]
      .forEach(([t, c]) => { const td = document.createElement('td'); td.textContent = t; td.className = c || "";if(td.textContent==="On Hold")td.classList.add("estado-on-hold"); trt.appendChild(td); });
    tbody.appendChild(trt);

    tablaMeses.appendChild(tbody);
  }

  function delta(v) {
    if (Math.abs(v) < 0.5) return '—';
    return (v > 0 ? '+' : '−') + formatearDinero(Math.abs(v)).replace('$', '$');
  }
  // Para el revenue fijo, subir es bueno. Para el upside es al revés: que baje
  // significa que se confirmó, que suba significa que algo se desconfirmó.
  function claseDelta(v, invertido) {
    if (Math.abs(v) < 0.5) return '';
    const bueno = invertido ? v < 0 : v > 0;
    return bueno ? 'delta-positivo' : 'delta-negativo';
  }

  selA.addEventListener('change', pintarTablaMeses);
  selB.addEventListener('change', pintarTablaMeses);
  pintarTablaMeses();

  // --- 3. movimientos registrados ---
  // Ojo: num_pa es número en proyectos.json y texto en la historia.
  const mesesOk = new Set(idxMeses.map(i => MESES_ES[i]));
  const eventos = hist.eventos.filter(
    e => String(e.num_pa) === pa && (!e.campo || mesesOk.has(e.campo)));
  const h5 = document.createElement('h5');
  h5.className = 'subtitulo-eventos';
  h5.textContent = `Movimientos registrados (${eventos.length})`;
  div.appendChild(h5);

  if (!eventos.length) {
    const p = document.createElement('p');
    p.className = 'aviso-sin-datos';
    p.textContent = 'Sin movimientos por encima del umbral de ' +
      formatearDinero(hist.meta.umbral_evento_usd ?? MINIMO_CAMBIO) + '. La tabla de arriba muestra el detalle completo.';
    div.appendChild(p);
  } else {
    const t = document.createElement('table');
    t.className = 'tabla-eventos-proyecto';
    const th = document.createElement('thead');
    const trh = document.createElement('tr');
    ['Fecha', 'Mes afectado', 'Tipo', 'Anterior', 'Nuevo', 'Delta']
      .forEach(x => { const e = document.createElement('th'); e.textContent = x; trh.appendChild(e); });
    th.appendChild(trh); t.appendChild(th);

    const tb = document.createElement('tbody');
    eventos.slice()
      .sort((x, y) => Math.abs(y.delta || 0) - Math.abs(x.delta || 0))
      .slice(0, 40)
      .forEach(ev => {
        const tr = document.createElement('tr');
        const fecha = new Date(ev.timestamp).toLocaleDateString('es-CO',
          { day: '2-digit', month: 'short', year: 'numeric' });
        const campo = ev.campo ? ev.campo.charAt(0).toUpperCase() + ev.campo.slice(1) : '—';
        [[fecha, ''], [campo, ''], [ev.tipo.replace(/_/g, ' '), ''],
          [formatearDinero(ev.valor_anterior), 'celda-numero'],
          [formatearDinero(ev.valor_nuevo), 'celda-numero'],
          [delta(ev.delta || 0), 'celda-numero ' + claseDelta(ev.delta || 0)]]
          .forEach(([txt, c]) => {
            const td = document.createElement('td'); td.textContent = txt; td.className = c || "";if(td.textContent==="On Hold")td.classList.add("estado-on-hold"); tr.appendChild(td);
          });
        tb.appendChild(tr);
      });
    t.appendChild(tb);
    div.appendChild(t);
  }

  contenedor.appendChild(div);
}
