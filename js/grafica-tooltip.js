// Tooltip compartido por todas las gráficas.

let _tooltipEl = null;

function tooltipEl() {
  if (!_tooltipEl) {
    _tooltipEl = document.createElement('div');
    _tooltipEl.className = 'viz-tooltip';
    document.body.appendChild(_tooltipEl);
  }
  return _tooltipEl;
}

/** `filas` = [{color, etiqueta, valor}]. `color` opcional. */
export function mostrarTooltip(evento, titulo, filas) {
  const tt = tooltipEl();
  const cuerpo = (filas || []).map(f => `
    <div class="tt-fila">
      ${f.color ? `<span class="tt-marca" style="background:${f.color}"></span>` : ''}
      <span class="tt-etiqueta">${f.etiqueta}</span>
      <span class="tt-valor">${f.valor}</span>
    </div>`).join('');
  tt.innerHTML = `<div class="tt-titulo">${titulo}</div>${cuerpo}`;
  tt.style.display = 'block';
  moverTooltip(evento);
}

export function moverTooltip(evento) {
  const tt = tooltipEl();
  const margen = 14;
  const ancho = tt.offsetWidth;
  const alto = tt.offsetHeight;
  // Se voltea al otro lado si no cabe, para no salirse de la ventana.
  let x = evento.clientX + margen;
  let y = evento.clientY + margen;
  if (x + ancho > window.innerWidth - 8) x = evento.clientX - ancho - margen;
  if (y + alto > window.innerHeight - 8) y = evento.clientY - alto - margen;
  tt.style.left = Math.max(8, x) + 'px';
  tt.style.top = Math.max(8, y) + 'px';
}

export function ocultarTooltip() {
  if (_tooltipEl) _tooltipEl.style.display = 'none';
}
