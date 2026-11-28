-- Agregar executive_watchlist y project_status a proyecto
-- Idempotente: puede correrse varias veces sin error

-- Agregar columnas si no existen
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='proyecto' AND column_name='executive_watchlist'
  ) THEN
    ALTER TABLE proyecto ADD COLUMN executive_watchlist boolean;
    COMMENT ON COLUMN proyecto.executive_watchlist IS 'Proyectos en watchlist ejecutivo';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='proyecto' AND column_name='project_status'
  ) THEN
    ALTER TABLE proyecto ADD COLUMN project_status text;
    COMMENT ON COLUMN proyecto.project_status IS 'Estado del proyecto: Red, Yellow o Green';
  END IF;
END$$;

-- Agregar constraint de validación para project_status (solo si no existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'proyecto_project_status_check'
  ) THEN
    ALTER TABLE proyecto
      ADD CONSTRAINT proyecto_project_status_check
      CHECK (project_status IN ('Red', 'Yellow', 'Green') OR project_status IS NULL);
  END IF;
END$$;

-- v_proyecto_actual usa p.*, pero Postgres expande el * al crear la vista:
-- las columnas nuevas no aparecen solas. Hay que recrearla (igual que en
-- 01_schema.sql). Nada depende de ella, así que el DROP es seguro.
DROP VIEW IF EXISTS v_proyecto_actual;
CREATE VIEW v_proyecto_actual AS
  SELECT p.*,
         ra.valor_of AS backlog_valor_of,
         ra.acum_2025,
         ra.backlog,
         ra.total_ejecutado_acumulado
  FROM proyecto p
  LEFT JOIN revenue_anual ra
    ON ra.proyecto_id = p.id AND ra.carga_id = (SELECT id FROM v_carga_actual);
