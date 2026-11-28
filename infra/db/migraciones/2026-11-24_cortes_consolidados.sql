-- Identidad de corrida sin alterar capturas ni importes existentes.
ALTER TABLE carga ADD COLUMN IF NOT EXISTS ejecucion_id text;

-- Las vistas con `c.*` fijan sus columnas al crearse: sin esto no ven la columna nueva
-- hasta que alguien las vuelva a crear. Mismas definiciones que 01_schema.sql.
CREATE OR REPLACE VIEW v_carga_actual AS
  SELECT c.* FROM carga c
   WHERE c.id = coalesce((SELECT max(ultima_carga_id) FROM proyecto),
                         (SELECT max(id) FROM carga));

CREATE OR REPLACE VIEW v_carga_actual_por_forecast AS
  SELECT DISTINCT ON (c.anio_forecast, c.archivo_id) c.*
    FROM carga c
   WHERE EXISTS (SELECT 1 FROM proyecto_snapshot s WHERE s.carga_id = c.id)
   ORDER BY c.anio_forecast, c.archivo_id, c.id DESC;

CREATE OR REPLACE VIEW v_carga_timeline AS
 SELECT DISTINCT ON (anio_forecast) * FROM v_carga_actual_por_forecast
 ORDER BY anio_forecast,(archivo_id IS NOT NULL) DESC,id DESC;
