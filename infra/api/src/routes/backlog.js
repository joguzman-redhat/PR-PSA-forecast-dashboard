const express = require('express');
const { pool } = require('../db');
const { mesesAClaves } = require('../dominio');
const { resolverForecast, metaForecast } = require('../forecast');

const router = express.Router();

// Misma forma que data/backlog_nola.json: { meta, backlog: [...] }.
// Las columnas descriptivas vienen del jsonb; la plata se reconstruye desde
// revenue_mes / revenue_anual, que son su unica fuente de verdad. Por eso los
// quarters se recalculan en vez de leerse: si alguna vez dejan de cuadrar, es
// que el dato cambio, no que la vista mienta.
router.get('/', async (req, res, next) => {
  try {
    const ctx = await resolverForecast(req.query);
    if (!ctx.carga) {
      return res.json({ meta: metaForecast(ctx), backlog: [] });
    }
    const carga = ctx.carga;

    const { rows } = await pool.query(
      `SELECT s.proyecto_id, s.atributos,
              ra.valor_of,
              ra.acum_2025,
              ra.backlog,
              ra.total_ejecutado_acumulado,
              coalesce(rm.meses, '[]'::jsonb) AS meses
         FROM proyecto_snapshot s
         LEFT JOIN revenue_anual ra
           ON ra.proyecto_id = s.proyecto_id AND ra.carga_id = $1
         LEFT JOIN LATERAL (
              SELECT jsonb_agg(jsonb_build_object(
                       'mes', r.mes, 'commit_usd', r.commit_usd, 'upside_usd', r.upside_usd)) AS meses
                FROM revenue_mes r
               WHERE r.proyecto_id = s.proyecto_id AND r.carga_id = $1
         ) rm ON true
        WHERE s.carga_id = $1
        ORDER BY s.proyecto_id`,
      [carga.id],
    );

    // Misma union que en /api/proyectos: columnas normalizadas de base y el
    // jsonb encima. Un ETL que solo llene las columnas ya pinta el dashboard.
    const backlog = rows
      .map((r) => ({
        estado: r.atributos.estado,
        num_opp: r.atributos.num_opp,
        num_pa: r.atributos.num_pa,
        nombre_del_proyecto: r.atributos.nombre,
        pm_lider: r.atributos.pm_lider,
        billing_type: r.atributos.billing_type,
        billing_arrangement: r.atributos.billing_arrangement,
        _tipo_fila: 'proyecto',
        ...r.atributos.datos_backlog,
        valor_of: r.valor_of,
        acumulado_anterior: r.acum_2025,
        acum_2025: ctx.anio === 2026 ? r.acum_2025 : undefined,
        backlog: r.backlog,
        total_ejecutado_acumulado: r.total_ejecutado_acumulado,
        ...mesesAClaves(r.meses),
      }));

    res.json({
      meta: {
        ...(carga.meta_backlog || {}),
        ...metaForecast(ctx),
      },
      backlog,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
