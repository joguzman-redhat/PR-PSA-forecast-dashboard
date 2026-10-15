const express = require('express');
const { pool } = require('../db');
const { MESES, QUARTERS } = require('../dominio');

const router = express.Router();

// Reconstruir la historia completa recorre todo revenue_mes, asi que se
// cachea. Antes la cache solo se limpiaba con POST /api/reload: si el ETL
// cargaba y no llamaba, el dashboard seguia mostrando la historia vieja sin
// ninguna senal de que estaba desactualizada -- y uno termina buscando el
// fallo en la base, que estaba bien. Ahora la cache se valida sola contra una
// huella barata del estado; /api/reload queda como atajo manual.
let cache = null;
let cacheHuella = null;
function invalidarCache() { cache = null; cacheHuella = null; }

async function huellaActual() {
  const { rows } = await pool.query(
    `SELECT (SELECT count(*) FROM carga)      AS n_carga,
            (SELECT max(id)  FROM carga)      AS max_carga,
            (SELECT count(*) FROM movimiento) AS n_mov,
            (SELECT max(id)  FROM movimiento) AS max_mov,
            (SELECT count(*) FROM proyecto)   AS n_proy`,
  );
  const r = rows[0];
  return `${r.n_carga}:${r.max_carga}:${r.n_mov}:${r.max_mov}:${r.n_proy}`;
}

function nuevoAcumuladoMes() {
  const porMes = {};
  for (const m of MESES) porMes[m] = { fijo: 0, upside: 0 };
  return porMes;
}

async function construirHistoria() {
  const { rows: cargas } = await pool.query(
    `SELECT id, codigo, etiqueta, tipo, fecha_referencia,
            to_char(ejecutada_en, 'YYYY-MM-DD"T"HH24:MI:SS') AS ejecutada_en
       FROM carga ORDER BY id`,
  );
  if (!cargas.length) return null;

  const { rows: filasMes } = await pool.query(
    `SELECT r.carga_id, r.mes, r.commit_usd, r.upside_usd,
            coalesce(nullif(p.clave_historia,''), nullif(p.num_pa,''), 'fila-' || p.id) AS clave_historia
       FROM revenue_mes r
       JOIN proyecto p ON p.id = r.proyecto_id
      ORDER BY r.carga_id, p.id, r.mes`,
  );
  const { rows: filasAnual } = await pool.query(
    `SELECT ra.carga_id, ra.acum_2025, ra.backlog,
            coalesce(nullif(p.clave_historia,''), nullif(p.num_pa,''), 'fila-' || p.id) AS clave_historia
       FROM revenue_anual ra
       JOIN proyecto p ON p.id = ra.proyecto_id`,
  );
  const { rows: filasMov } = await pool.query(
    `SELECT coalesce(c.codigo, 'c' || c.id) AS snapshot_id, p.num_pa,
            coalesce(nullif(p.clave_historia,''), nullif(p.num_pa,''), 'fila-' || p.id) AS clave_historia,
            to_char(c.ejecutada_en, 'YYYY-MM-DD"T"HH24:MI:SS') AS ejecutada_en,
            p.nombre, m.tipo, m.mes, m.monto,
            m.commit_anterior, m.commit_nuevo, m.upside_anterior, m.upside_nuevo
       FROM movimiento m
       JOIN carga c    ON c.id = m.carga_id
       JOIN proyecto p ON p.id = m.proyecto_id
      ORDER BY m.id`,
  );

  // Los movimientos se pueden CALCULAR: son la resta entre dos cargas. Que el
  // ETL los materialice en la tabla evita recalcularlos en cada lectura, pero
  // es la parte mas dificil de escribir en un flujo (hay que tener a mano la
  // carga anterior). Para las cargas que no los trajeron se derivan aqui, y
  // asi la vista "que cambio" funciona desde la segunda carga sin que el ETL
  // haga nada. Si el ETL si los escribio, mandan los suyos.
  const { rows: filasMovDerivadas } = await pool.query(
    `WITH pares AS (
       SELECT id AS carga_id, lag(id) OVER (ORDER BY id) AS previa_id FROM carga
     ), sin_movimientos AS (
       SELECT pr.* FROM pares pr
        WHERE pr.previa_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM movimiento m WHERE m.carga_id = pr.carga_id)
     )
     SELECT coalesce(c.codigo, 'c' || c.id) AS snapshot_id, p.num_pa,
            coalesce(nullif(p.clave_historia,''), nullif(p.num_pa,''), 'fila-' || p.id) AS clave_historia,
            to_char(c.ejecutada_en, 'YYYY-MM-DD"T"HH24:MI:SS') AS ejecutada_en,
            p.nombre, n.mes, NULL::text AS tipo,
            a.commit_usd AS commit_anterior, n.commit_usd AS commit_nuevo,
            a.upside_usd AS upside_anterior, n.upside_usd AS upside_nuevo
       FROM sin_movimientos s
       JOIN revenue_mes n ON n.carga_id = s.carga_id
       JOIN revenue_mes a ON a.carga_id = s.previa_id
                         AND a.proyecto_id = n.proyecto_id AND a.mes = n.mes
       JOIN carga c       ON c.id = s.carga_id
       JOIN proyecto p    ON p.id = n.proyecto_id
      -- Umbral de 1 USD en CUALQUIERA de los dos campos: por debajo es ruido
      -- de redondeo, no una decision de negocio. commit y upside se evaluan
      -- por separado (no se asume que uno se mueve porque el otro se movio).
      WHERE abs(n.commit_usd - a.commit_usd) >= 1.0
         OR abs(n.upside_usd - a.upside_usd) >= 1.0
      ORDER BY s.carga_id, p.id, n.mes`,
  );

  const movimientos = filasMov.concat(filasMovDerivadas);

  const codigoDeCarga = new Map(cargas.map((c) => [c.id, c.codigo || `c${c.id}`]));

  // series_por_proyecto[clave] = [{snapshot_id, fijo, upside, total, backlog, meses}]
  const series = {};
  const porSnapshot = new Map(); // carga_id -> acumulados del portafolio

  for (const c of cargas) {
    porSnapshot.set(c.id, {
      fijo: 0, upside: 0, acum_2025: 0, backlog: 0, porMes: nuevoAcumuladoMes(), activos: new Set(),
    });
  }

  const entradaDe = new Map(); // `${carga_id}|${clave}` -> entrada de la serie
  function obtenerEntrada(cargaId, clave) {
    const k = `${cargaId}|${clave}`;
    let e = entradaDe.get(k);
    if (!e) {
      e = {
        snapshot_id: codigoDeCarga.get(cargaId),
        fijo: 0, upside: 0, total: 0, backlog: null,
        meses: Array.from({ length: 12 }, () => [0, 0]),
      };
      entradaDe.set(k, e);
      if (!series[clave]) series[clave] = [];
      series[clave].push(e);
      porSnapshot.get(cargaId).activos.add(clave);
    }
    return e;
  }

  for (const f of filasMes) {
    if (!f.clave_historia) continue;
    const e = obtenerEntrada(f.carga_id, f.clave_historia);
    e.meses[f.mes - 1] = [f.commit_usd, f.upside_usd];
    e.fijo += f.commit_usd;
    e.upside += f.upside_usd;

    const agg = porSnapshot.get(f.carga_id);
    agg.fijo += f.commit_usd;
    agg.upside += f.upside_usd;
    const nombreMes = MESES[f.mes - 1];
    agg.porMes[nombreMes].fijo += f.commit_usd;
    agg.porMes[nombreMes].upside += f.upside_usd;
  }

  for (const f of filasAnual) {
    if (!f.clave_historia) continue;
    const e = obtenerEntrada(f.carga_id, f.clave_historia);
    // El backlog puede ser null (30 proyectos sin Valor OF). Se conserva: el
    // dashboard distingue "sin dato" de "cero".
    e.backlog = f.backlog;
    // REGLA DE NEGOCIO: TOTAL EJECUTADO = Q1..Q4 (commit) + Acum 2025.
    e.total = e.fijo + (f.acum_2025 || 0);

    const agg = porSnapshot.get(f.carga_id);
    agg.acum_2025 += f.acum_2025 || 0;
    agg.backlog += f.backlog || 0;
  }

  // Sin redondeo: los montos del Excel llegan con varios decimales (no solo
  // centavos) y achicarlos a 2 decimales aqui les recortaba precision real
  // antes de que el dashboard los viera. pg ya entrega el numeric exacto
  // (ver db.js), asi que se deja tal cual.

  const snapshots = cargas.map((c) => {
    const a = porSnapshot.get(c.id);
    const quarters = {};
    for (const [q, meses] of Object.entries(QUARTERS)) {
      quarters[q] = meses.reduce((acc, m) => acc + a.porMes[MESES[m - 1]].fijo, 0);
    }
    const porMes = {};
    for (const m of MESES) {
      porMes[m] = { fijo: a.porMes[m].fijo, upside: a.porMes[m].upside };
    }
    return {
      id: c.codigo || `c${c.id}`,
      timestamp: c.ejecutada_en,
      etiqueta: c.etiqueta,
      tipo: c.tipo,
      proyectos_activos: a.activos.size,
      totales: {
        fijo: a.fijo,
        upside: a.upside,
        acum_2025: a.acum_2025,
        total: a.fijo + a.acum_2025,
        backlog: a.backlog,
        ...quarters,
      },
      por_mes: porMes,
    };
  });

  // Un movimiento no es "paso de upside a commit": son dos campos que cada
  // uno puede cambiar o no. Se evaluan por separado y se emite un evento por
  // cada campo que de verdad cambio (puede ser uno, el otro, ambos, o -si el
  // movimiento ya traia tipo alta/baja_proyecto- el evento especial tal cual).
  // Umbral de medio centavo: por debajo es precision de punto flotante, no un
  // cambio real.
  const UMBRAL_CAMBIO = 0.005;
  const eventos = [];
  for (const m of movimientos) {
    const base = {
      snapshot_id: m.snapshot_id,
      timestamp: m.ejecutada_en,
      num_pa: m.num_pa !== null && m.num_pa !== undefined ? String(m.num_pa) : m.clave_historia,
      nombre: m.nombre,
      campo: m.mes ? MESES[m.mes - 1] : null, // mes afectado, no el campo de dinero
    };

    if (m.tipo === 'alta_proyecto' || m.tipo === 'baja_proyecto') {
      const anterior = m.commit_anterior === null ? 0 : m.commit_anterior;
      const nuevo = m.commit_nuevo === null ? 0 : m.commit_nuevo;
      eventos.push({
        ...base, tipo: m.tipo,
        valor_anterior: anterior, valor_nuevo: nuevo, delta: nuevo - anterior,
      });
      continue;
    }

    const commitAnterior = m.commit_anterior === null ? 0 : m.commit_anterior;
    const commitNuevo = m.commit_nuevo === null ? 0 : m.commit_nuevo;
    const deltaCommit = commitNuevo - commitAnterior;
    if (Math.abs(deltaCommit) >= UMBRAL_CAMBIO) {
      eventos.push({
        ...base, tipo: 'commit',
        valor_anterior: commitAnterior, valor_nuevo: commitNuevo, delta: deltaCommit,
      });
    }

    const upsideAnterior = m.upside_anterior === null ? 0 : m.upside_anterior;
    const upsideNuevo = m.upside_nuevo === null ? 0 : m.upside_nuevo;
    const deltaUpside = upsideNuevo - upsideAnterior;
    if (Math.abs(deltaUpside) >= UMBRAL_CAMBIO) {
      eventos.push({
        ...base, tipo: 'upside',
        valor_anterior: upsideAnterior, valor_nuevo: upsideNuevo, delta: deltaUpside,
      });
    }
  }

  return {
    meta: {
      origen: 'postgres',
      generado_en: new Date().toISOString(),
      total_snapshots: snapshots.length,
      total_proyectos: Object.keys(series).length,
      total_eventos: eventos.length,
      tipos_evento: [...new Set(eventos.map((e) => e.tipo))],
      formato_series:
        "series_por_proyecto[clave] = lista de snapshots. 'meses' son 12 pares "
        + '[commit, upside] en orden enero..diciembre.',
    },
    snapshots,
    series_por_proyecto: series,
    eventos,
  };
}

router.get('/', async (_req, res, next) => {
  try {
    const huella = await huellaActual();
    if (!cache || huella !== cacheHuella) {
      cache = await construirHistoria();
      cacheHuella = huella;
    }
    if (!cache) return res.status(503).json({ error: 'No hay historia en la base de datos' });
    res.json(cache);
  } catch (err) {
    next(err);
  }
});

module.exports = { router, invalidarCache };
