// Qué cambió entre dos Snapshots: filas por proyecto y su dirección.

import { MESES_ES, compararMeses, mesesActivos, sumarMeses } from './calendario.js';
import { identificador } from './campos-proyecto.js';
import { claveProyecto, clavesProyectosOcultos } from './clave-proyecto.js';
import { estado } from './estado.js';
import { rangoSnapshots } from './snapshots-rango.js';
import { MINIMO_CAMBIO } from './umbral-cambio.js';

export function calcularCambios() {
  const hist = estado.historia;
  const snaps = hist.snapshots;
  const [iA, iB] = rangoSnapshots();
  const idA = snaps[iA].id, idB = snaps[iB].id;

  const porProyecto = new Map(estado.proyectos.map(p => [claveProyecto(p), p]));
  const ocultos = clavesProyectosOcultos();
  const mesesOk = new Set(mesesActivos().map(i => MESES_ES[i]));

  // Eventos del rango, agrupados por proyecto. Commit y Upside se tratan
  // independientes: la magnitud real de cada uno sale de dFijo/dUpside (la
  // resta entre snapshots), no de sumar montos de eventos por "dirección".
  const porPA = new Map();
  hist.eventos.forEach(e => {
    if (ocultos.has(String(e.num_pa))) return;
    if (e.campo && !mesesOk.has(e.campo)) return;
    const i = snaps.findIndex(s => s.id === e.snapshot_id);
    if (i <= iA || i > iB) return;
    const k = String(e.num_pa);
    if (!porPA.has(k)) porPA.set(k, { n: 0, nuevo: false, lista: [] });
    const acc = porPA.get(k);
    acc.n += 1;
    acc.lista.push({ ev: e, snapshot: snaps[i] });
    if (e.tipo === 'alta_proyecto') acc.nuevo = true;
  });

  const filas = [];
  Object.entries(hist.series_por_proyecto).forEach(([pa, serie]) => {
    if (ocultos.has(pa)) return;
    const a = serie.find(s => s.snapshot_id === idA);
    const b = serie.find(s => s.snapshot_id === idB);
    if (!b) return;
    const proy = porProyecto.get(pa);
    const comparables=estado.forecast.timeline?compararMeses(a,b):null;
    const sa = comparables?{fijo:comparables.fijoA,upside:comparables.upsideA}:a?sumarMeses(a.meses):{fijo:0,upside:0};
    const sb = comparables?{fijo:comparables.fijoB,upside:comparables.upsideB}:sumarMeses(b.meses);
    const ev = porPA.get(pa) || { n: 0, nuevo: false, lista: [] };
    const dFijo = sb.fijo - sa.fijo;
    filas.push({
      pa,
      nombre: (proy && proy.nombre_del_proyecto) || `PA ${pa}`,
      etiquetaCorta: proy ? identificador(proy).valor : `PA ${pa}`,
      pm: (proy && proy.pm_lider) || '—',
      fijoA: sa.fijo, fijoB: sb.fijo,
      dFijo, dUpside: sb.upside - sa.upside,
      nuevo: !a || ev.nuevo,
      eventos: ev.n,
      lista: ev.lista,
      cambio: Math.abs(dFijo) >= MINIMO_CAMBIO || ev.n > 0,
      proyecto: proy,
    });
  });
  filas.sort((x, y) => Math.abs(y.dFijo) - Math.abs(x.dFijo));
  return { filas, iA, iB, snaps };
}

// Commit y Upside son dos datos independientes: un proyecto puede subir en
// los dos, bajar en los dos, o moverse distinto en cada uno. No se asume que
// lo que baja de un lado "se fue" al otro.
export function direccionDe(f) {
  if (f.nuevo) return { texto: 'Entró al backlog', clase: 'mov-nuevo' };
  const subeFijo = f.dFijo > MINIMO_CAMBIO;
  const bajaFijo = f.dFijo < -MINIMO_CAMBIO;
  const subeUpside = f.dUpside > MINIMO_CAMBIO;
  const bajaUpside = f.dUpside < -MINIMO_CAMBIO;
  const partes = [];
  if (subeFijo) partes.push('Commit subió');
  if (bajaFijo) partes.push('Commit bajó');
  if (subeUpside) partes.push('Upside subió');
  if (bajaUpside) partes.push('Upside bajó');
  if (!partes.length) return { texto: 'Sin movimiento', clase: 'mov-nada' };
  const clase = subeFijo && !bajaFijo ? 'mov-confirma'
    : bajaFijo && !subeFijo ? 'mov-desconfirma'
    : 'mov-mixto';
  return { texto: partes.join(' · '), clase };
}
