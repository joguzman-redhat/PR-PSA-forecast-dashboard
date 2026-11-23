-- Etapa de almacenamiento multi-año. No habilita FY27 en el dashboard.
-- Ejecutar con ON_ERROR_STOP; transaccion completa e idempotente.
BEGIN;

ALTER TABLE carga ADD COLUMN IF NOT EXISTS anio_forecast smallint NOT NULL DEFAULT 2026;
ALTER TABLE carga ADD COLUMN IF NOT EXISTS archivo_id text;
DO $$
BEGIN
  -- El historico previo de esta aplicacion es FY26. No reclasificar como
  -- FY26 una carga identificada explicitamente como FY27.
  IF EXISTS (SELECT 1 FROM carga WHERE anio_forecast = 2026
             AND archivo_nombre ~* 'FY[ _-]?(20)?27') THEN
    RAISE EXCEPTION 'Hay cargas FY27 sin clasificar. Revisar el historico antes de migrar.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'carga'::regclass AND conname = 'carga_anio_forecast_check') THEN
    ALTER TABLE carga ADD CONSTRAINT carga_anio_forecast_check
      CHECK (anio_forecast BETWEEN 2000 AND 2100);
  END IF;
END;
$$;
COMMENT ON COLUMN carga.anio_forecast IS 'Año del calendario forecast; no se deduce de la fecha de ejecucion.';
COMMENT ON COLUMN carga.archivo_id IS 'ID del archivo fuente. NULL en cargas antiguas de origen no verificable.';
CREATE INDEX IF NOT EXISTS idx_carga_forecast_fuente ON carga (anio_forecast, archivo_id, id DESC);

CREATE OR REPLACE FUNCTION carga_rechazar_sin_cambios() RETURNS trigger AS $$
DECLARE hash_ultimo text;
BEGIN
  -- Serializa la comprobacion y la insercion para una misma fuente/año.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    NEW.anio_forecast::text || ':' || coalesce(NEW.archivo_id, '<legacy>'), 0));
  SELECT datos_hash INTO hash_ultimo FROM carga
   WHERE anio_forecast = NEW.anio_forecast
     AND archivo_id IS NOT DISTINCT FROM NEW.archivo_id
   ORDER BY id DESC LIMIT 1;
  IF hash_ultimo IS NOT NULL AND hash_ultimo = NEW.datos_hash THEN
    RAISE EXCEPTION 'Sin cambios respecto a la ultima carga del mismo año y fuente (hash %)', NEW.datos_hash
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Firma anterior conservada. Esta funcion sigue creando cargas legacy FY26.
CREATE OR REPLACE FUNCTION abrir_carga(
  p_hash text, p_archivo text DEFAULT NULL, p_fecha date DEFAULT current_date,
  p_filas_info int DEFAULT 0, p_filas_backlog int DEFAULT 0,
  p_meta_proyectos jsonb DEFAULT NULL, p_meta_backlog jsonb DEFAULT NULL
) RETURNS bigint AS $$
DECLARE hash_ultimo text; nuevo_id bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('2026:<legacy>', 0));
  SELECT datos_hash INTO hash_ultimo FROM carga
   WHERE anio_forecast = 2026 AND archivo_id IS NULL ORDER BY id DESC LIMIT 1;
  IF hash_ultimo IS NOT NULL AND hash_ultimo = p_hash THEN RETURN NULL; END IF;
  INSERT INTO carga (tipo, archivo_nombre, datos_hash, fecha_referencia,
                     filas_info, filas_backlog, meta_proyectos, meta_backlog)
  VALUES ('etl', p_archivo, p_hash, p_fecha,
          p_filas_info, p_filas_backlog, p_meta_proyectos, p_meta_backlog)
  RETURNING id INTO nuevo_id;
  RETURN nuevo_id;
END;
$$ LANGUAGE plpgsql;

-- PA identifica la entidad; los atributos de cada captura se conservan aqui.
-- No se duplican importes: siguen siendo autoridad revenue_anual/revenue_mes.
CREATE TABLE IF NOT EXISTS proyecto_snapshot (
  carga_id bigint NOT NULL REFERENCES carga(id) ON DELETE CASCADE,
  proyecto_id bigint NOT NULL REFERENCES proyecto(id) ON DELETE CASCADE,
  atributos jsonb NOT NULL,
  origen text NOT NULL DEFAULT 'etl' CHECK (origen IN ('etl', 'estado_actual_migracion')),
  capturado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (carga_id, proyecto_id)
);
CREATE INDEX IF NOT EXISTS idx_proyecto_snapshot_proyecto ON proyecto_snapshot (proyecto_id, carga_id);

CREATE OR REPLACE FUNCTION capturar_proyecto_snapshot() RETURNS trigger AS $$
BEGIN
  IF NEW.ultima_carga_id IS NOT NULL THEN
    INSERT INTO proyecto_snapshot (carga_id, proyecto_id, atributos)
    VALUES (NEW.ultima_carga_id, NEW.id,
      to_jsonb(NEW) - ARRAY['valor_of','valor_of_anterior','acumulado_a_hoy','consumido_2025','backlog_2026'])
    ON CONFLICT (carga_id, proyecto_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_proyecto_snapshot ON proyecto;
CREATE TRIGGER trg_proyecto_snapshot
  AFTER INSERT OR UPDATE OF ultima_carga_id ON proyecto
  FOR EACH ROW EXECUTE FUNCTION capturar_proyecto_snapshot();

-- Solo podemos recuperar los atributos que existen ahora, para la carga a la
-- que pertenecen. No inventar atributos para snapshots anteriores.
INSERT INTO proyecto_snapshot (carga_id, proyecto_id, atributos, origen)
SELECT p.ultima_carga_id, p.id,
       to_jsonb(p) - ARRAY['valor_of','valor_of_anterior','acumulado_a_hoy','consumido_2025','backlog_2026'],
       'estado_actual_migracion'
  FROM proyecto p WHERE p.ultima_carga_id IS NOT NULL
ON CONFLICT (carga_id, proyecto_id) DO NOTHING;

CREATE OR REPLACE FUNCTION movimiento_validar_forecast() RETURNS trigger AS $$
DECLARE actual carga%ROWTYPE; previa carga%ROWTYPE;
BEGIN
  IF NEW.carga_previa_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO actual FROM carga WHERE id = NEW.carga_id;
  SELECT * INTO previa FROM carga WHERE id = NEW.carga_previa_id;
  IF (actual.anio_forecast, actual.archivo_id) IS DISTINCT FROM
     (previa.anio_forecast, previa.archivo_id) THEN
    RAISE EXCEPTION 'No se permiten movimientos entre años o archivos fuente diferentes'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_movimiento_forecast ON movimiento;
CREATE TRIGGER trg_movimiento_forecast BEFORE INSERT OR UPDATE ON movimiento
  FOR EACH ROW EXECUTE FUNCTION movimiento_validar_forecast();

-- Refresca las columnas de carga sin cambiar la seleccion legacy de FY26.
CREATE OR REPLACE VIEW v_carga_actual AS
  SELECT c.* FROM carga c
   WHERE c.id = coalesce((SELECT max(ultima_carga_id) FROM proyecto),
                         (SELECT max(id) FROM carga));

-- Vistas nuevas para la proxima etapa de API. Excluyen cargas sin proyectos
-- capturados; no reemplazan las consultas que consume actualmente FY26.
CREATE OR REPLACE VIEW v_carga_actual_por_forecast AS
  SELECT DISTINCT ON (c.anio_forecast, c.archivo_id) c.*
    FROM carga c
   WHERE EXISTS (SELECT 1 FROM proyecto_snapshot s WHERE s.carga_id = c.id)
   ORDER BY c.anio_forecast, c.archivo_id, c.id DESC;

CREATE OR REPLACE VIEW v_proyecto_por_forecast AS
  SELECT c.anio_forecast, c.archivo_id, s.carga_id, s.proyecto_id,
         s.atributos, s.origen AS origen_atributos,
         ra.valor_of, ra.acum_2025 AS acumulado_anterior,
         ra.backlog, ra.total_ejecutado_acumulado
    FROM v_carga_actual_por_forecast c
    JOIN proyecto_snapshot s ON s.carga_id = c.id
    LEFT JOIN revenue_anual ra ON ra.carga_id = s.carga_id AND ra.proyecto_id = s.proyecto_id;

CREATE OR REPLACE VIEW v_revenue_mes_por_forecast AS
  SELECT c.anio_forecast, c.archivo_id, r.carga_id, r.proyecto_id,
         r.mes, r.commit_usd, r.upside_usd
    FROM revenue_mes r JOIN carga c ON c.id = r.carga_id;

COMMIT;
