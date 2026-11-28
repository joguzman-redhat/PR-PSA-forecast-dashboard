// KPIs del rango de Snapshots comparado.

import { periodoActual } from './calendario.js';
import { formatearDinero } from './formato.js';

export function renderizarKpisRango(filas, snaps, iA, iB) {
  const cont = document.getElementById('kpis-rango');
  if (!cont) return;
  const movidos = filas.filter(f => f.cambio);
  // Commit que subió y Commit que bajó se miran por separado: no se asume
  // que lo uno explica lo otro (ver direccionDe más arriba).
  const subioCommit = filas.reduce((a, f) => a + (f.dFijo > 0 ? f.dFijo : 0), 0);
  const bajoCommit = filas.reduce((a, f) => a + (f.dFijo < 0 ? -f.dFijo : 0), 0);
  const neto = filas.reduce((a, f) => a + f.dFijo, 0);
  const nuevos = filas.filter(f => f.nuevo).length;
  const pct = filas.length ? Math.round(movidos.length / filas.length * 100) : 0;

  cont.innerHTML = '';

  const encabezado = document.createElement('div');
  encabezado.className = 'resumen-rango-titulo';
  encabezado.innerHTML =
    `Entre <strong>${snaps[iA].etiqueta}</strong> y <strong>${snaps[iB].etiqueta}</strong>` +
    `<span class="resumen-rango-periodo">revenue de ${periodoActual().etiqueta}</span>`;
  cont.appendChild(encabezado);

  const fila = document.createElement('div');
  fila.className = 'resumen-rango-fila';
  cont.appendChild(fila);

  // El valor y la etiqueta se separan en dos lineas con tamanos muy
  // distintos: la cifra se lee de lejos y el texto solo si hace falta.
  const tarjeta = (op) => {
    const d = document.createElement('div');
    d.className = 'tarjeta-rango' + (op.tono ? ' tono-' + op.tono : '') +
      (op.destacada ? ' destacada' : '');

    if (op.icono) {
      const ic = document.createElement('span');
      ic.className = 'tarjeta-rango-icono';
      ic.textContent = op.icono;
      ic.setAttribute('aria-hidden', 'true');
      d.appendChild(ic);
    }

    const cuerpo = document.createElement('div');
    cuerpo.className = 'tarjeta-rango-cuerpo';

    const v = document.createElement('div');
    v.className = 'tarjeta-rango-valor';
    v.textContent = op.valor;
    cuerpo.appendChild(v);

    const e = document.createElement('div');
    e.className = 'tarjeta-rango-etq';
    e.textContent = op.etiqueta;
    cuerpo.appendChild(e);

    if (op.detalle) {
      const s = document.createElement('div');
      s.className = 'tarjeta-rango-detalle';
      s.textContent = op.detalle;
      cuerpo.appendChild(s);
    }
    if (op.barra !== undefined) {
      const barra = document.createElement('div');
      barra.className = 'tarjeta-rango-barra';
      const relleno = document.createElement('span');
      relleno.style.width = Math.max(2, op.barra) + '%';
      barra.appendChild(relleno);
      cuerpo.appendChild(barra);
    }
    d.appendChild(cuerpo);
    fila.appendChild(d);
    return d;
  };

  const operador = (signo) => {
    const s = document.createElement('div');
    s.className = 'resumen-rango-operador';
    s.textContent = signo;
    s.setAttribute('aria-hidden', 'true');
    fila.appendChild(s);
  };

  tarjeta({
    valor: `${movidos.length}`,
    etiqueta: 'proyectos se movieron',
    detalle: `de ${filas.length} · ${pct}% del portafolio`,
    barra: pct,
  });

  tarjeta({
    icono: '↑', tono: 'bueno',
    valor: formatearDinero(subioCommit),
    etiqueta: 'Commit que subió',
    detalle: 'suma de los proyectos donde subió',
  });

  operador('−');

  tarjeta({
    icono: '↓', tono: 'malo',
    valor: formatearDinero(bajoCommit),
    etiqueta: 'Commit que bajó',
    detalle: 'suma de los proyectos donde bajó',
  });

  operador('=');

  tarjeta({
    destacada: true, tono: neto >= 0 ? 'bueno' : 'malo',
    valor: (neto >= 0 ? '+' : '−') + formatearDinero(Math.abs(neto)),
    etiqueta: 'variación neta del Commit',
    detalle: nuevos > 0 ? `incluye ${nuevos} proyecto${nuevos === 1 ? '' : 's'} nuevo${nuevos === 1 ? '' : 's'}` : 'sin proyectos nuevos',
  });

  const titulo = document.getElementById('titulo-que-cambio');
  if (titulo) {
    titulo.textContent = `Commit de los que más se movieron · ${snaps[iA].etiqueta} → ${snaps[iB].etiqueta}`;
  }
}
