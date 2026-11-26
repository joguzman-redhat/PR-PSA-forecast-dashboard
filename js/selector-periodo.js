// Selector de periodo de revenue, compartido por varias pestañas.
import { estado } from './estado.js';
import { MESES_ES, PERIODOS, periodoActual, mesesActivos } from './calendario.js';

/**
 * Selector de periodo. Se dibuja en varias pestañas pero todas comparten el
 * mismo estado, para que cambiar de vista no pierda lo que ya elegiste.
 */
export function construirSelectorPeriodo(alCambiar) {
  const cont = document.createElement('div');
  cont.className = 'selector-periodo';

  const lbl = document.createElement('label');
  lbl.textContent = 'Periodo de revenue:';
  const sel = document.createElement('select');
  sel.className = 'select-periodo';
  const opcionesPeriodo=estado.forecast.timeline?[...PERIODOS,{...periodoActual(),id:'rango',etiqueta:estado.periodo==='rango'?periodoActual().etiqueta:'Rango personalizado'}]:PERIODOS;
  opcionesPeriodo.forEach(pr => {
    const o = document.createElement('option');
    o.value = pr.id;
    o.textContent = pr.etiqueta;
    if (pr.id === estado.periodo) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => {
    estado.periodo = sel.value;
    // Mantener sincronizados los selectores de las otras pestañas.
    document.querySelectorAll('.select-periodo').forEach(s2 => { s2.value = sel.value; });
    if(estado.forecast.timeline){const indices=mesesActivos();document.getElementById('forecast-desde').value=MESES_ES[indices[0]]||'';document.getElementById('forecast-hasta').value=MESES_ES[indices.at(-1)]||'';}
    alCambiar();
  });

  cont.append(lbl, sel);
  return cont;
}
