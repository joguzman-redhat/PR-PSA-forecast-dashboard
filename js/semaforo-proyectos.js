// Semáforo de proyectos del Inicio.

import { estado } from './estado.js';
import { SIN_DATO, valorDimension } from './filtros.js';
import { aplicarFiltros } from './filtros-ui.js';

/**
 * Semáforo de proyectos: resumen de Red/Yellow/Green/Sin dato como pills
 * clickables. Clic en uno aplica (o quita) el filtro de Semáforo.
 */
export function renderizarSemaforoProyectos(proyectos) {
  let contenedor = document.getElementById('card-semaforo-proyectos');
  if (!contenedor) return;

  // Get the card body, or use the container itself
  const cardBody = contenedor.querySelector('.pf-v6-c-card__body');
  if (cardBody) contenedor = cardBody;

  // Contar por status
  const conteos = { 'Rojo': 0, 'Amarillo': 0, 'Verde': 0, 'Sin dato': 0 };
  proyectos.forEach(p => {
    const val = valorDimension(p, 'project_status');
    if (val === '(sin dato)') conteos['Sin dato']++;
    else if (conteos[val] !== undefined) conteos[val]++;
  });

  contenedor.innerHTML = '';

  const titulo = document.createElement('h4');
  titulo.className = 'semaforo-titulo';
  titulo.textContent = 'Semáforo de proyectos';
  contenedor.appendChild(titulo);

  const pills = document.createElement('div');
  pills.className = 'semaforo-pills';

  const statusConfig = [
    { key: 'Rojo', color: '#c9190b', internal: 'Rojo' },
    { key: 'Amarillo', color: '#f0ab00', internal: 'Amarillo' },
    { key: 'Verde', color: '#3e8635', internal: 'Verde' },
    { key: 'Sin dato', color: '#8a8d90', internal: SIN_DATO },
  ];

  statusConfig.forEach(({ key, color, internal }) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'semaforo-pill';

    const activo = estado.filtros.project_status.includes(internal);
    if (activo) pill.classList.add('activo');

    const dot = document.createElement('span');
    dot.className = 'semaforo-dot';
    dot.style.background = color;

    const label = document.createElement('span');
    label.className = 'semaforo-label';
    label.textContent = key;

    const count = document.createElement('span');
    count.className = 'semaforo-count';
    count.textContent = conteos[key];

    pill.append(dot, label, count);
    pill.title = `${activo ? 'Quitar' : 'Aplicar'} filtro: Semáforo = ${key}`;

    pill.addEventListener('click', () => {
      const filtro = estado.filtros.project_status;
      const idx = filtro.indexOf(internal);
      if (idx >= 0) {
        filtro.splice(idx, 1);
      } else {
        filtro.push(internal);
      }
      aplicarFiltros();
    });

    pills.appendChild(pill);
  });

  contenedor.appendChild(pills);
}
