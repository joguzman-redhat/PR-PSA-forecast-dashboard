// Navegación entre pestañas. El hash de la URL guarda la pestaña activa.
import { estado } from './estado.js';
import { ajustarGraficasVisibles } from './grafica-registro.js';
import { renderizarDetalle } from './detalle.js';
import { renderizarTrazabilidad } from './trazabilidad-global.js';
import { renderizarPMs } from './pms-vista.js';

export function cambiarPestana(nombre, omitirHash) {
  // La pestaña queda en el hash de la URL: así se puede compartir un enlace
  // directo a la trazabilidad o a un proyecto concreto.
  if (!omitirHash) {
    const clave = (nombre === 'detalle' && estado.proyectoSeleccionado)
      ? '/' + estado.proyectoSeleccionado.clave_timeline : '';
    history.replaceState(null, '', '#' + nombre + clave);
  }

  // Ocultar todas
  document.querySelectorAll('.pestana-contenido').forEach(p => {
    p.classList.remove('activa');
  });
  document.querySelectorAll('.pestana-btn').forEach(b => {
    b.classList.remove('activa');
    b.setAttribute('aria-selected', 'false');
    // pf-v6-c-tabs marca la pestaña activa en el <li>, no en el botón
    if (b.parentElement) b.parentElement.classList.remove('pf-m-current');
  });

  // Mostrar seleccionada
  const pestana = document.getElementById(`pestana-${nombre}`);
  if (pestana) {
    pestana.classList.add('activa');
  }

  const btn = document.querySelector(`[data-pestana="${nombre}"]`);
  if (btn) {
    btn.classList.add('activa');
    btn.setAttribute('aria-selected', 'true');
    if (btn.parentElement) btn.parentElement.classList.add('pf-m-current');
  }

  // Renderizar contenido específico
  if (nombre === 'detalle') {
    renderizarDetalle();
  } else if (nombre === 'trazabilidad') {
    renderizarTrazabilidad();
  } else if (nombre === 'pms') {
    renderizarPMs();
  }
  if (nombre === 'detalle') window.scrollTo(0, 0);
  requestAnimationFrame(ajustarGraficasVisibles);
}
