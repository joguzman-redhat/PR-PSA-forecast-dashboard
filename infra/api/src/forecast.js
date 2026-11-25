const { pool } = require('./db');

function errorConsulta(mensaje) {
  return Object.assign(new Error(mensaje), { status: 400 });
}

function seleccionForecast(query = {}) {
  const raw = query.anio === undefined ? '2026' : query.anio;
  if (typeof raw !== 'string' || !/^\d{4}$/.test(raw) || +raw < 2000 || +raw > 2100) {
    throw errorConsulta('anio debe ser un año de cuatro digitos entre 2000 y 2100');
  }
  const explicita = Object.hasOwn(query, 'archivo_id');
  if (explicita && (typeof query.archivo_id !== 'string' || !/^[A-Za-z0-9_-]{0,256}$/.test(query.archivo_id))) {
    throw errorConsulta('archivo_id no valido');
  }
  let cargaId = null;
  if (query.carga_id !== undefined) {
    if (typeof query.carga_id !== 'string' || !/^[1-9]\d*$/.test(query.carga_id) || !Number.isSafeInteger(+query.carga_id)) {
      throw errorConsulta('carga_id debe ser un entero positivo');
    }
    cargaId = +query.carga_id;
  }
  return { anio: +raw, explicita, archivoId: explicita ? (query.archivo_id || null) : null, cargaId };
}

async function resolverForecast(query = {}) {
  const seleccion = seleccionForecast(query);
  const { rows } = await pool.query(
    `SELECT c.* FROM carga c
      WHERE c.anio_forecast = $1
        AND (NOT $2::boolean OR c.archivo_id IS NOT DISTINCT FROM $3::text)
        AND ($4::bigint IS NULL OR c.id = $4)
        AND EXISTS (SELECT 1 FROM proyecto_snapshot s WHERE s.carga_id = c.id)
      ORDER BY c.id DESC LIMIT 1`,
    [seleccion.anio, seleccion.explicita, seleccion.archivoId, seleccion.cargaId],
  );
  if (seleccion.cargaId && !rows.length) throw Object.assign(new Error('La carga no pertenece al año/fuente solicitado o no tiene atributos capturados'), { status: 404 });
  return { ...seleccion, archivoId: rows[0]?.archivo_id ?? seleccion.archivoId, carga: rows[0] || null };
}

function metaForecast(ctx) {
  return {
    anio_forecast: ctx.anio,
    archivo_id: ctx.archivoId,
    archivo_nombre: ctx.carga?.archivo_nombre ?? null,
    carga_id: ctx.carga?.id ?? null,
    carga_etiqueta: ctx.carga?.etiqueta ?? null,
    carga_ejecutada_en: ctx.carga?.ejecutada_en ?? null,
    origen: 'postgres',
    estado: ctx.carga ? 'disponible' : 'sin_datos',
  };
}

async function catalogoForecasts() {
  const { rows } = await pool.query(
    `SELECT c.anio_forecast, c.archivo_id, c.archivo_nombre, c.id AS carga_id,
            c.etiqueta, c.ejecutada_en,
            (SELECT count(*)::int FROM carga h WHERE h.anio_forecast = c.anio_forecast
                AND h.archivo_id IS NOT DISTINCT FROM c.archivo_id) AS snapshots
       FROM v_carga_actual_por_forecast c ORDER BY c.anio_forecast DESC, c.id DESC`,
  );
  return { anios: [...new Set([2026, 2027, ...rows.map(r => r.anio_forecast)])].sort(), fuentes: rows };
}

function historiaVacia(ctx) {
  return { meta: { ...metaForecast(ctx), total_snapshots: 0, total_proyectos: 0, total_eventos: 0 },
    snapshots: [], series_por_proyecto: {}, eventos: [] };
}

module.exports = { seleccionForecast, resolverForecast, metaForecast, catalogoForecasts, historiaVacia };
