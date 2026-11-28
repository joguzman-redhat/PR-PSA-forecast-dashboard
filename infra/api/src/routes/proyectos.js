const express = require('express');
const { pool } = require('../db');
const { resolverForecast, metaForecast } = require('../forecast');

const router = express.Router();

/**
 * Arma la fila que ve el dashboard: las columnas normalizadas como base y
 * `datos_info` encima.
 *
 * El jsonb existe porque el Excel trae 36 columnas y la tabla solo normaliza
 * las ~30 que sirven para consultar por SQL; las demas (finalizacion,
 * ejecucion_acumulada, dif_consumido_2025...) solo viven ahi. Pero exigirle al
 * ETL que escriba cada campo DOS veces -columna y jsonb- es un contrato malo:
 * es redundante por construccion y, si solo llena las columnas, el dashboard
 * aparecia vacio sin decir por que.
 *
 * Con la union: llenar solo las columnas ya pinta el dashboard con lo
 * esencial, y llenar ademas el jsonb da la fidelidad completa del Excel. El
 * jsonb gana en los campos que trae, porque conserva el tipo original (num_pa
 * es numero en 310 filas y texto en 24) y el formato crudo de las fechas.
 */
function proyectoBase(f) {
  const base = {
    estado: f.estado,
    num_opp: f.num_opp,
    num_pa: f.num_pa,
    project_id: f.project_id,
    cliente: f.cliente,
    nombre_del_proyecto: f.nombre,
    pm_lider: f.pm_lider,
    pm_lider_psa: f.pm_lider_psa,
    zona: f.zona,
    pais: f.pais,
    vendedor: f.vendedor,
    tsm: f.tsm,
    billing_type: f.billing_type,
    billing_arrangement: f.billing_arrangement,
    valor_of: f.valor_of,
    valor_of_anterior: f.valor_of_anterior,
    acumulado_a_hoy: f.acumulado_a_hoy,
    consumido_2025: f.consumido_2025,
    backlog_2026: f.backlog_2026,
    ejecucion_deseada: f.ejecucion_deseada,
    pct_ejecucion_actual: f.pct_ejecucion_actual,
    pct_peso_contrato: f.pct_peso_contrato,
    fecha_fin: typeof f.fecha_fin === 'string'
      ? f.fecha_fin.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2/$3/$1') : f.fecha_fin,
    estado_contrato: f.estado_contrato,
    dias_para_vencimiento: f.dias_para_vencimiento,
    meses_transcurridos: f.meses_transcurridos,
    tipo_de_ejecucion: f.tipo_de_ejecucion,
    q_del_clawback: f.q_del_clawback,
    estatus: f.estatus,
    start_at_risk: f.start_at_risk,
    executive_watchlist: f.executive_watchlist,
    project_status: f.project_status,
    _errores: f.campos_con_error || {},
    _recalculado: f.campos_recalculados || {},
    _tipo_fila: 'proyecto',
  };
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined) delete base[k];
  }
  return { ...base, ...(f.datos_info || {}) };
}

// Las claves con guion bajo son internas (_fila_excel, _errores...): no son
// columnas que el negocio quiera ver en la tabla.
function columnasDerivadas(filas) {
  const vistas = new Map();
  for (const fila of filas) {
    for (const key of Object.keys(fila || {})) {
      if (key.startsWith('_') || vistas.has(key)) continue;
      vistas.set(key, {
        key,
        label: key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
        verde: true,
        recalculado: false,
      });
    }
  }
  return [...vistas.values()];
}

// Devuelve la misma forma que data/proyectos.json: { meta, proyectos: [...] }.
// Las filas salen del jsonb datos_info, que guarda la fila del Excel tal cual
// la dejo el ETL -- incluidos los tipos originales (num_pa llega como numero
// en 310 filas y como texto en 24) y las claves con guion bajo que el
// dashboard lee (_fila_excel, _errores, _recalculado, _tipo_fila).
router.get('/', async (req, res, next) => {
  try {
    const ctx = await resolverForecast(req.query);
    if (!ctx.carga) {
      return res.json({ meta: { ...metaForecast(ctx), columnas: [] }, proyectos: [] });
    }
    const carga = ctx.carga;

    // Se piden las columnas normalizadas Y el jsonb: la fila que se devuelve
    // es la union de las dos. Ver proyectoBase() para por que.
    const { rows } = await pool.query(
      `SELECT s.proyecto_id, s.atributos, s.origen,
              ra.valor_of, ra.acum_2025 AS acumulado_anterior, ra.backlog
         FROM proyecto_snapshot s
         LEFT JOIN revenue_anual ra ON ra.carga_id=s.carga_id AND ra.proyecto_id=s.proyecto_id
        WHERE s.carga_id = $1 ORDER BY s.proyecto_id`,
      [carga.id],
    );

    const proyectos = rows.map(r => ({ ...proyectoBase(r.atributos), _origen_atributos: r.origen,
      valor_of: r.valor_of, acumulado_anterior: r.acumulado_anterior, backlog: r.backlog }));
    const meta = { ...(carga.meta_proyectos || {}) };
    if (Array.isArray(meta.columnas)) {
      const vistos = new Set();
      meta.columnas = meta.columnas.map(col => ({ ...col,
        key: ({ backlog_2026: 'backlog', consumido_2025: 'acumulado_anterior' })[col.key] || col.key,
      })).filter(col => !vistos.has(col.key) && vistos.add(col.key));
    }

    // El dashboard hace metadataProyectos.columnas.filter(...) sin guarda: si
    // la carga no trajo meta, la pantalla se cae con un TypeError antes de
    // pintar nada. Se derivan de las claves que realmente llegaron, para que
    // falte la curaduria (que columnas son "verdes") pero no la pantalla.
    if (!Array.isArray(meta.columnas) || meta.columnas.length === 0) {
      meta.columnas = columnasDerivadas(proyectos);
      meta.columnas_derivadas = true;
      meta.aviso = 'La carga no trajo meta_proyectos.columnas; se dedujeron de los datos.';
    }

    res.json({
      meta: {
        ...meta,
        ...metaForecast(ctx),
      },
      proyectos,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

module.exports.proyectoBase = proyectoBase;
module.exports.columnasDerivadas = columnasDerivadas;
