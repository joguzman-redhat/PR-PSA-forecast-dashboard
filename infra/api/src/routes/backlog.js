const express = require('express');
const { pool } = require('../db');
const { mesesAClaves } = require('../dominio');

const router = express.Router();

// Misma forma que data/backlog_nola.json: { meta, backlog: [...] }.
// Las columnas descriptivas vienen del jsonb; la plata se reconstruye desde
// revenue_mes / revenue_anual, que son su unica fuente de verdad. Por eso los
// quarters se recalculan en vez de leerse: si alguna vez dejan de cuadrar, es
// que el dato cambio, no que la vista mienta.
router.get('/', async (_req, res, next) => {
  try {
    const { rows: cargas } = await pool.query('SELECT * FROM v_carga_actual');
    if (!cargas.length) {
      return res.status(503).json({ error: 'No hay ninguna carga en la base de datos' });
    }
    const carga = cargas[0];

    const { rows } = await pool.query(
      `SELECT p.id,
              p.datos_backlog,
              p.num_pa, p.num_opp, p.nombre, p.estado, p.pm_lider,
              p.billing_type, p.billing_arrangement,
              ra.valor_of,
              ra.acum_2025,
              ra.backlog,
              ra.total_ejecutado_acumulado,
              coalesce(rm.meses, '[]'::jsonb) AS meses
         FROM proyecto p
         LEFT JOIN revenue_anual ra
           ON ra.proyecto_id = p.id AND ra.carga_id = $1
         LEFT JOIN LATERAL (
              SELECT jsonb_agg(jsonb_build_object(
                       'mes', r.mes, 'commit_usd', r.commit_usd, 'upside_usd', r.upside_usd)) AS meses
                FROM revenue_mes r
               WHERE r.proyecto_id = p.id AND r.carga_id = $1
         ) rm ON true
        WHERE p.ultima_carga_id = $1
        ORDER BY p.id`,
      [carga.id],
    );

    // Misma union que en /api/proyectos: columnas normalizadas de base y el
    // jsonb encima. Un ETL que solo llene las columnas ya pinta el dashboard.
    const backlog = rows
      .map((r) => ({
        estado: r.estado,
        num_opp: r.num_opp,
        num_pa: r.num_pa,
        nombre_del_proyecto: r.nombre,
        pm_lider: r.pm_lider,
        billing_type: r.billing_type,
        billing_arrangement: r.billing_arrangement,
        _tipo_fila: 'proyecto',
        ...r.datos_backlog,
        valor_of: r.valor_of,
        acum_2025: r.acum_2025,
        backlog: r.backlog,
        total_ejecutado_acumulado: r.total_ejecutado_acumulado,
        ...mesesAClaves(r.meses),
      }));

    res.json({
      meta: {
        ...(carga.meta_backlog || {}),
        carga_id: carga.id,
        carga_etiqueta: carga.etiqueta,
        origen: 'postgres',
      },
      backlog,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
