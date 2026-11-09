const express = require('express');
const { pool } = require('../db');

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
    fecha_fin: f.fecha_fin,
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
router.get('/', async (_req, res, next) => {
  try {
    const { rows: cargas } = await pool.query('SELECT * FROM v_carga_actual');
    if (!cargas.length) {
      return res.status(503).json({ error: 'No hay ninguna carga en la base de datos' });
    }
    const carga = cargas[0];

    // Se piden las columnas normalizadas Y el jsonb: la fila que se devuelve
    // es la union de las dos. Ver proyectoBase() para por que.
    const { rows } = await pool.query(
      `SELECT num_pa, project_id, num_opp, nombre, cliente, pm_lider, pm_lider_psa,
              zona, pais, vendedor, tsm, billing_type, billing_arrangement, estado,
              valor_of, valor_of_anterior, acumulado_a_hoy, consumido_2025,
              backlog_2026, ejecucion_deseada,
              -- Si el ETL no la trajo se calcula: verificado contra el Excel,
              -- coincide en las 309 filas que tienen los dos operandos.
              coalesce(pct_ejecucion_actual,
                       CASE WHEN valor_of <> 0
                            THEN acumulado_a_hoy / valor_of END) AS pct_ejecucion_actual,
              pct_peso_contrato, estado_contrato, dias_para_vencimiento,
              meses_transcurridos, tipo_de_ejecucion, q_del_clawback, estatus,
              start_at_risk, executive_watchlist, project_status,
              campos_con_error, campos_recalculados, datos_info,
              to_char(fecha_fin, 'FMMM/FMDD/YYYY') AS fecha_fin
         FROM proyecto
        WHERE ultima_carga_id = $1
        ORDER BY id`,
      [carga.id],
    );

    const proyectos = rows.map(proyectoBase);
    const meta = { ...(carga.meta_proyectos || {}) };

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
        carga_id: carga.id,
        carga_etiqueta: carga.etiqueta,
        carga_ejecutada_en: carga.ejecutada_en,
        origen: 'postgres',
      },
      proyectos,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
