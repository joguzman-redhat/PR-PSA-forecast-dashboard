// Encabezado del detalle: de quién es el proyecto y cómo va.

import { identificador, chipsIdentidad } from './campos-proyecto.js';
import { chip } from './chip.js';
import { anioRevenue } from './calendario.js';
import { acumuladoAnterior, backlogHoy, ejecutadoProyecto, proyectadoProyecto, textoProyectadoParcial, valorBooking } from './dinero-proyecto.js';
import { formatearDinero } from './formato.js';

const ESTADO_CONTRATO_NIVEL = {
  'Contrato vigente': 'bueno',
  'Contrato finaliza en menos de 60dias': 'advertencia',
  'Contrato vence en menos de 30dias': 'serio',
  'Contrato vencido': 'critico',
};


/**
 * Cabecera del detalle: de quién es el proyecto y cómo va, en una sola mirada.
 *
 * Antes esta información estaba repartida en cuadrículas de etiqueta/valor,
 * todas con el mismo peso visual. Lo que el negocio mira primero —cuánto vale,
 * cuánto se ejecutó y cuánto queda— tiene que verse primero.
 */
export function renderizarEncabezadoProyecto(contenedor, proyecto) {
  const booking = valorBooking(proyecto);
  const acum = ejecutadoProyecto(proyecto);
  const backlog = backlogHoy(proyecto);
  const proyectado = proyectadoProyecto(proyecto);
  const parcial = textoProyectadoParcial(proyecto);
  const consumido = acumuladoAnterior(proyecto);
  const pct = (booking && acum !== null) ? (acum / booking) * 100 : null;

  const hero = document.createElement('div');
  hero.className = 'hero-proyecto';

  // --- título e identidad ---
  const cab = document.createElement('div');
  cab.className = 'hero-cabecera';
  const cli = document.createElement('div');
  cli.className = 'hero-cliente';
  cli.textContent = proyecto.cliente || 'Cliente sin dato';
  const nom = document.createElement('h2');
  nom.className = 'hero-nombre';
  nom.textContent = proyecto.nombre_del_proyecto || identificador(proyecto).valor;
  cab.append(cli, nom);

  const chips = document.createElement('div');
  chips.className = 'hero-chips';
  chipsIdentidad(proyecto).forEach(c => chips.appendChild(chip(c.texto, c.clase, c.titulo)));
  if (proyecto.estado) chips.appendChild(chip(proyecto.estado, 'chip-estado'));
  if (proyecto.billing_type) chips.appendChild(chip(proyecto.billing_type));
  if (proyecto.zona) chips.appendChild(chip(proyecto.zona));
  if (proyecto.pais) chips.appendChild(chip(proyecto.pais));
  if (proyecto.start_at_risk) {
    chips.appendChild(chip('Start at risk', 'chip-critico',
      'Dato simulado en el PoC: no viene del Excel'));
  }
  const ec = proyecto.estado_contrato;
  if (ec) chips.appendChild(chip(ec, 'chip-' + (ESTADO_CONTRATO_NIVEL[ec] || '')));
  // Handover y Semáforo
  if (proyecto.executive_watchlist) chips.appendChild(chip('Handover', 'chip-bueno'));
  if (proyecto.project_status) {
    const statusMap = { 'Red': 'Rojo', 'Yellow': 'Amarillo', 'Green': 'Verde' };
    const statusDisplay = statusMap[proyecto.project_status] || proyecto.project_status;
    const statusClass = proyecto.project_status === 'Green' ? 'chip-bueno'
      : proyecto.project_status === 'Yellow' ? 'chip-advertencia' : 'chip-critico';
    chips.appendChild(chip(statusDisplay, statusClass));
  }
  cab.appendChild(chips);
  hero.appendChild(cab);

  // --- cifras grandes ---
  const cifras = document.createElement('div');
  cifras.className = 'hero-cifras';
  [
    ['Valor Booking', booking, 'Por cuánto se vendió el proyecto'],
    ['Ejecutado', acum, 'Acumulado anterior más el Commit hasta el mes actual, sobre toda la vida del proyecto'],
    ['Proyectado', proyectado, 'Ejecutado más el Commit de los meses futuros de toda su vida. No incluye Upside' + (parcial ? '. ' + parcial : '')],
    ['Backlog', backlog, 'Backlog continuo entre años: el de la fuente menos el Commit posterior a su Año fuente; lo que falta por planear de toda la vida'],
    [`Acumulado anterior a ${anioRevenue()}`, consumido, `Revenue acumulado previo al Año fuente ${anioRevenue()}`],
  ].forEach(([et, v, tip]) => {
    const d = document.createElement('div');
    d.className = 'hero-cifra';
    d.title = tip;
    const n = document.createElement('div');
    n.className = 'hero-cifra-valor';
    n.textContent = v === null ? '—' : formatearDinero(v);
    const l = document.createElement('div');
    l.className = 'hero-cifra-etq';
    l.textContent = et;
    const ayuda=document.createElement('button');ayuda.type='button';ayuda.className='ayuda-kpi';ayuda.textContent='?';ayuda.title=tip;ayuda.setAttribute('aria-label',tip);l.appendChild(ayuda);
    d.append(n, l);
    if (et === 'Proyectado' && parcial) {
      d.classList.add('hero-cifra-parcial');
      const marca = document.createElement('div');
      marca.className = 'hero-cifra-parcial-nota';
      marca.textContent = parcial;
      d.appendChild(marca);
    }
    cifras.appendChild(d);
  });
  hero.appendChild(cifras);

  // --- barra de ejecución ---
  if (booking && acum !== null) {
    const bloque = document.createElement('div');
    bloque.className = 'hero-avance';

    const fila = document.createElement('div');
    fila.className = 'hero-avance-cab';
    const izq = document.createElement('span');
    izq.innerHTML = `Ejecución del contrato · <strong>${pct.toFixed(1)}%</strong>`;
    const der = document.createElement('span');
    der.className = 'hero-avance-nota';
    der.textContent = `${formatearDinero(acum)} de ${formatearDinero(booking)}`;
    fila.append(izq, der);

    const barra = document.createElement('div');
    barra.className = 'barra-avance';
    const relleno = document.createElement('div');
    // Por encima del 100% se marca distinto: ejecutar de más no es "ir bien".
    relleno.className = 'barra-avance-relleno' + (pct > 100 ? ' excedido' : '');
    relleno.style.width = Math.min(100, Math.max(0, pct)) + '%';
    barra.appendChild(relleno);
    bloque.append(fila, barra);

    const tipo = proyecto.tipo_de_ejecucion;
    if (tipo) {
      const nivel = { Normal: 'bueno', Baja: 'advertencia', 'Muy Baja': 'critico' }[tipo] || '';
      const pie = document.createElement('div');
      pie.className = 'hero-avance-pie';
      pie.appendChild(chip('Ritmo: ' + tipo, 'chip-' + nivel,
        'Compara lo ejecutado contra lo que debería llevar a estas alturas'));
      const dias = proyecto.dias_para_vencimiento;
      if (typeof dias === 'number') {
        pie.appendChild(chip(
          dias < 0 ? `Venció hace ${Math.abs(dias)} días` : `Quedan ${dias} días`,
          'chip-' + (ESTADO_CONTRATO_NIVEL[ec] || ''),
          'Calculado desde Fecha fin'));
      }
      bloque.appendChild(pie);
    }
    hero.appendChild(bloque);
  }

  contenedor.appendChild(hero);
}
