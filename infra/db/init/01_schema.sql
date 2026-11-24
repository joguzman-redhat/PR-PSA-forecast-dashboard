-- ---------------------------------------------------------------------------
-- Cloud Forecast · esquema
--
-- El dinero vive SIEMPRE en revenue_mes / revenue_anual: son la unica fuente
-- de verdad. Los jsonb (datos_info, datos_backlog) guardan las columnas
-- descriptivas del Excel que el dashboard muestra tal cual y que no vale la
-- pena normalizar; de ahi se excluyen los campos de plata para que no puedan
-- divergir de las tablas de hechos.
-- ---------------------------------------------------------------------------

-- Una fila por corrida del ETL con datos distintos a la previa. Un snapshot.
CREATE TABLE carga (
  id               bigserial PRIMARY KEY,
  codigo           text UNIQUE,              -- 's01'.. en el historico sembrado
  etiqueta         text NOT NULL,            -- texto legible: 'Nov 2025'
  tipo             text NOT NULL DEFAULT 'etl',
  ejecutada_en     timestamp   NOT NULL DEFAULT now(),
  archivo_nombre   text,
  -- Sin UNIQUE global: la deduplicacion es contra la ULTIMA carga, no contra
  -- todas. Ver el trigger trg_carga_sin_cambios mas abajo.
  datos_hash       text NOT NULL,            -- sha256 de lo extraido
  fecha_referencia date,                     -- reemplaza al TODAY() del Excel
  filas_info       int NOT NULL DEFAULT 0,
  filas_backlog    int NOT NULL DEFAULT 0,
  meta_proyectos   jsonb,                    -- bloque meta de Info Proyectos
  meta_backlog     jsonb,
  anio_forecast    smallint NOT NULL DEFAULT 2026 CONSTRAINT carga_anio_forecast_check CHECK (anio_forecast BETWEEN 2000 AND 2100),
  archivo_id       text,
  ejecucion_id     text                     -- corrida n8n compartida por todas las fuentes
);
CREATE INDEX idx_carga_ejecutada_en ON carga (ejecutada_en DESC);
CREATE INDEX idx_carga_forecast_fuente ON carga (anio_forecast, archivo_id, id DESC);

-- La etiqueta es el texto que el dashboard pinta en el eje de snapshots.
-- Exigirsela al flujo obliga a formatear fechas en espanol dentro de n8n, que
-- es justo donde no debe vivir esa logica. Se deriva de ejecutada_en cuando no
-- viene. El NOT NULL se mantiene: el trigger corre ANTES de validarlo, asi que
-- la garantia de que siempre hay etiqueta sigue en pie.
CREATE OR REPLACE FUNCTION carga_etiqueta_por_defecto() RETURNS trigger AS $$
DECLARE
  meses constant text[] := ARRAY['ene','feb','mar','abr','may','jun',
                                 'jul','ago','sep','oct','nov','dic'];
BEGIN
  IF NEW.etiqueta IS NULL OR btrim(NEW.etiqueta) = '' THEN
    NEW.etiqueta := to_char(NEW.ejecutada_en, 'FMDD') || ' '
                 || meses[extract(month from NEW.ejecutada_en)::int] || ' '
                 || to_char(NEW.ejecutada_en, 'YYYY HH24:MI');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_carga_etiqueta ON carga;
CREATE TRIGGER trg_carga_etiqueta BEFORE INSERT ON carga
  FOR EACH ROW EXECUTE FUNCTION carga_etiqueta_por_defecto();

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

DROP TRIGGER IF EXISTS trg_carga_sin_cambios ON carga;
CREATE TRIGGER trg_carga_sin_cambios BEFORE INSERT ON carga
  FOR EACH ROW EXECUTE FUNCTION carga_rechazar_sin_cambios();

-- Alternativa sin excepcion, para que el flujo pueda ramificar con un IF en
-- vez de tratar "no hubo cambios" como una falla: devuelve el id nuevo, o
-- NULL si los datos son identicos a la ultima carga.
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

-- Estado actual de cada proyecto. Upsert por clave, no lleva historico:
-- cliente, PM y zona son atributos, no series de tiempo.
CREATE TABLE proyecto (
  id                    bigserial PRIMARY KEY,
  clave                 text NOT NULL UNIQUE,   -- num_pa, o nombre normalizado
  -- Clave con la que el dashboard indexa las series: String(num_pa), o
  -- 'fila-<n>' con el numero de fila de BackLog NOLA cuando no hay PA.
  clave_historia        text,
  num_pa                text,
  project_id            text,
  num_opp               text,
  nombre                text,
  cliente               text,
  pm_lider              text,
  pm_lider_psa          text,
  zona                  text,
  pais                  text,
  vendedor              text,
  tsm                   text,
  billing_type          text,
  billing_arrangement   text,
  estado                text,
  valor_of              numeric,
  valor_of_anterior     numeric,
  acumulado_a_hoy       numeric,
  consumido_2025        numeric,
  backlog_2026          numeric,
  ejecucion_deseada     numeric,
  pct_ejecucion_actual  numeric,
  pct_peso_contrato     numeric,
  fecha_fin             date,
  estado_contrato       text,                   -- recalculado por el ETL
  dias_para_vencimiento int,                    -- recalculado
  meses_transcurridos   numeric,                -- recalculado (Excel o derivado)
  tipo_de_ejecucion     text,                   -- recalculado
  q_del_clawback        text,                   -- recalculado
  estatus               text,
  start_at_risk         boolean,                -- SIMULADO, no viene del Excel
  executive_watchlist   boolean,                -- nuevo: proyectos en watchlist ejecutivo
  project_status        text CHECK (project_status IN ('Red', 'Yellow', 'Green') OR project_status IS NULL), -- Estado visual
  campos_con_error      jsonb,                  -- celdas #VALUE! originales
  campos_recalculados   text[],
  datos_info            jsonb NOT NULL DEFAULT '{}'::jsonb,
  datos_backlog         jsonb NOT NULL DEFAULT '{}'::jsonb,
  primera_carga_id      bigint REFERENCES carga(id),
  ultima_carga_id       bigint REFERENCES carga(id),
  actualizado_en        timestamp   NOT NULL DEFAULT now()
);
CREATE INDEX idx_proyecto_cliente ON proyecto (cliente);
CREATE INDEX idx_proyecto_estado  ON proyecto (estado);
CREATE INDEX idx_proyecto_pais    ON proyecto (pais, zona);
CREATE INDEX idx_proyecto_num_pa  ON proyecto (num_pa);

-- Tabla de hechos: una fila por proyecto x mes x carga. Esto ES el historico.
-- 'commit' = columna del mes en el Excel (ahi se llama "fijo");
-- 'upside' = la columna pegada a su derecha.
CREATE TABLE revenue_mes (
  carga_id    bigint   NOT NULL REFERENCES carga(id) ON DELETE CASCADE,
  proyecto_id bigint   NOT NULL REFERENCES proyecto(id) ON DELETE CASCADE,
  mes         smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  commit_usd  numeric NOT NULL DEFAULT 0,
  upside_usd  numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (carga_id, proyecto_id, mes)
);
CREATE INDEX idx_revenue_mes_proyecto ON revenue_mes (proyecto_id, mes);

-- Valores de BackLog NOLA que no se abren por mes.
CREATE TABLE revenue_anual (
  carga_id                  bigint NOT NULL REFERENCES carga(id) ON DELETE CASCADE,
  proyecto_id               bigint NOT NULL REFERENCES proyecto(id) ON DELETE CASCADE,
  valor_of                  numeric,
  acum_2025                 numeric,
  backlog                   numeric,
  total_ejecutado_acumulado numeric,
  PRIMARY KEY (carga_id, proyecto_id)
);

-- Movimientos: se CALCULAN comparando la carga nueva con la anterior.
-- No vienen del Excel. Alimentan la vista "que cambio".
CREATE TABLE movimiento (
  id              bigserial PRIMARY KEY,
  carga_id        bigint   NOT NULL REFERENCES carga(id) ON DELETE CASCADE,
  carga_previa_id bigint   REFERENCES carga(id) ON DELETE SET NULL,
  proyecto_id     bigint   NOT NULL REFERENCES proyecto(id) ON DELETE CASCADE,
  mes             smallint CHECK (mes BETWEEN 1 AND 12),
  tipo            text     NOT NULL CHECK (tipo IN
                    ('upside_a_commit','commit_a_upside','alta_proyecto','baja_proyecto')),
  monto           numeric NOT NULL,
  commit_anterior numeric,
  commit_nuevo    numeric,
  upside_anterior numeric,
  upside_nuevo    numeric
);
CREATE INDEX idx_movimiento_carga    ON movimiento (carga_id);
CREATE INDEX idx_movimiento_proyecto ON movimiento (proyecto_id);

-- ---------------------------------------------------------------------------
-- Vistas. Las reglas de negocio viven aqui y no en el prompt del LLM ni en la
-- API: un solo lugar donde pueden estar mal.
-- ---------------------------------------------------------------------------

-- Ordenar por id y no por ejecutada_en: dos cargas pueden compartir timestamp
-- y entonces "la ultima" queda indefinida. El id siempre desempata.
-- "La carga actual" era simplemente el id mas alto de carga. Eso acopla el
-- dashboard a que CADA carga insertada venga acompanada de la actualizacion de
-- proyecto.ultima_carga_id: una carga suelta -un experimento, un flujo a medio
-- camino, un rollback incompleto- se convierte en la "actual", ningun proyecto
-- le apunta, y el dashboard aparece VACIO aunque el dato este entero.
-- Ahora la carga actual es aquella donde los proyectos realmente estan.
CREATE VIEW v_carga_actual AS
  SELECT c.*
    FROM carga c
   WHERE c.id = coalesce(
           (SELECT max(ultima_carga_id) FROM proyecto),
           (SELECT max(id) FROM carga));

CREATE VIEW v_proyecto_actual AS
  SELECT p.*,
         ra.valor_of AS backlog_valor_of,
         ra.acum_2025,
         ra.backlog,
         ra.total_ejecutado_acumulado
  FROM proyecto p
  LEFT JOIN revenue_anual ra
    ON ra.proyecto_id = p.id AND ra.carga_id = (SELECT id FROM v_carga_actual);

-- REGLA DE NEGOCIO: el quarter suma SOLO el commit. El upside NO entra.
CREATE VIEW v_revenue_quarter AS
  SELECT r.proyecto_id,
         r.carga_id,
         ceil(r.mes / 3.0)::int AS quarter,
         sum(r.commit_usd)      AS commit_usd,
         sum(r.upside_usd)      AS upside_usd
  FROM revenue_mes r
  GROUP BY r.proyecto_id, r.carga_id, ceil(r.mes / 3.0);

-- REGLA DE NEGOCIO: TOTAL EJECUTADO = Q1+Q2+Q3+Q4 (commit) + Acum 2025.
CREATE VIEW v_total_ejecutado AS
  SELECT p.id AS proyecto_id,
         coalesce(sum(r.commit_usd), 0) + coalesce(max(ra.acum_2025), 0) AS total_ejecutado
  FROM proyecto p
  LEFT JOIN revenue_mes r
    ON r.proyecto_id = p.id AND r.carga_id = (SELECT id FROM v_carga_actual)
  LEFT JOIN revenue_anual ra
    ON ra.proyecto_id = p.id AND ra.carga_id = (SELECT id FROM v_carga_actual)
  GROUP BY p.id;

-- Totales del portafolio por carga: lo que el dashboard pinta como linea.
CREATE VIEW v_totales_carga AS
  SELECT c.id AS carga_id,
         c.codigo,
         c.etiqueta,
         c.ejecutada_en,
         coalesce(sum(r.commit_usd), 0) AS commit_usd,
         coalesce(sum(r.upside_usd), 0) AS upside_usd
  FROM carga c
  LEFT JOIN revenue_mes r ON r.carga_id = c.id
  GROUP BY c.id, c.codigo, c.etiqueta, c.ejecutada_en;

-- Soporte de almacenamiento FY26/FY27. La UI multianual es una etapa posterior.
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

-- Timeline consolidado
BEGIN;
-- Calendario de revenue y fecha de captura son ejes distintos. No se pierden snapshots.
CREATE OR REPLACE FUNCTION forecast_clave_timeline(a jsonb, proyecto bigint, anio int) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE
   WHEN nullif(btrim(a->>'num_pa'),'') IS NOT NULL
        AND upper(btrim(a->>'num_pa')) NOT IN ('#N/A','N/A','NA')
     THEN 'PA:' || upper(btrim(a->>'num_pa'))
   WHEN nullif(btrim(a->>'project_id'),'') IS NOT NULL
     THEN 'PR:' || upper(btrim(a->>'project_id'))
   ELSE 'SIN_PA:' || anio::text || ':' || proyecto::text END
$$;
CREATE TABLE IF NOT EXISTS forecast_revenue_mensual (
 clave_proyecto text NOT NULL,
 periodo date NOT NULL CHECK (extract(day FROM periodo)=1),
 proyecto_id bigint NOT NULL REFERENCES proyecto(id),
 carga_id bigint NOT NULL REFERENCES carga(id) ON DELETE CASCADE,
 archivo_id text,
 commit_usd numeric NOT NULL,
 upside_usd numeric NOT NULL,
 PRIMARY KEY (clave_proyecto, periodo)
);
CREATE INDEX IF NOT EXISTS idx_forecast_revenue_periodo ON forecast_revenue_mensual(periodo);

CREATE OR REPLACE FUNCTION consolidar_revenue_timeline() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c carga; a jsonb;
BEGIN
 SELECT * INTO STRICT c FROM carga WHERE id=NEW.carga_id;
 SELECT atributos INTO a FROM proyecto_snapshot WHERE carga_id=NEW.carga_id AND proyecto_id=NEW.proyecto_id;
 IF a IS NULL THEN RAISE EXCEPTION 'Faltan atributos de la captura % para proyecto %', NEW.carga_id, NEW.proyecto_id; END IF;
 INSERT INTO forecast_revenue_mensual AS destino
   (clave_proyecto,periodo,proyecto_id,carga_id,archivo_id,commit_usd,upside_usd)
 VALUES (forecast_clave_timeline(a,NEW.proyecto_id,c.anio_forecast),make_date(c.anio_forecast,NEW.mes,1),
   NEW.proyecto_id,c.id,c.archivo_id,NEW.commit_usd,NEW.upside_usd)
 ON CONFLICT (clave_proyecto,periodo) DO UPDATE SET
   proyecto_id=EXCLUDED.proyecto_id,carga_id=EXCLUDED.carga_id,archivo_id=EXCLUDED.archivo_id,
   commit_usd=EXCLUDED.commit_usd,upside_usd=EXCLUDED.upside_usd
 WHERE (EXCLUDED.archivo_id IS NOT NULL AND destino.archivo_id IS NULL)
    OR ((EXCLUDED.archivo_id IS NOT NULL)=(destino.archivo_id IS NOT NULL) AND EXCLUDED.carga_id>=destino.carga_id);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_revenue_timeline ON revenue_mes;
CREATE TRIGGER trg_revenue_timeline AFTER INSERT OR UPDATE ON revenue_mes
 FOR EACH ROW EXECUTE FUNCTION consolidar_revenue_timeline();

-- Reejecutable; el orden conserva fuentes identificadas frente a historico sin ID.
INSERT INTO forecast_revenue_mensual AS destino
 (clave_proyecto,periodo,proyecto_id,carga_id,archivo_id,commit_usd,upside_usd)
SELECT DISTINCT ON (forecast_clave_timeline(s.atributos,r.proyecto_id,c.anio_forecast),c.anio_forecast,r.mes)
 forecast_clave_timeline(s.atributos,r.proyecto_id,c.anio_forecast),make_date(c.anio_forecast,r.mes,1),
 r.proyecto_id,c.id,c.archivo_id,r.commit_usd,r.upside_usd
 FROM revenue_mes r JOIN carga c ON c.id=r.carga_id
 JOIN proyecto_snapshot s ON s.carga_id=r.carga_id AND s.proyecto_id=r.proyecto_id
 ORDER BY forecast_clave_timeline(s.atributos,r.proyecto_id,c.anio_forecast),c.anio_forecast,r.mes,
   (c.archivo_id IS NOT NULL) DESC,c.id DESC
ON CONFLICT (clave_proyecto,periodo) DO UPDATE SET
 proyecto_id=EXCLUDED.proyecto_id,carga_id=EXCLUDED.carga_id,archivo_id=EXCLUDED.archivo_id,
 commit_usd=EXCLUDED.commit_usd,upside_usd=EXCLUDED.upside_usd
WHERE (EXCLUDED.archivo_id IS NOT NULL AND destino.archivo_id IS NULL)
 OR ((EXCLUDED.archivo_id IS NOT NULL)=(destino.archivo_id IS NOT NULL) AND EXCLUDED.carga_id>=destino.carga_id);

CREATE OR REPLACE VIEW v_carga_timeline AS
 SELECT DISTINCT ON (anio_forecast) * FROM v_carga_actual_por_forecast
 ORDER BY anio_forecast,(archivo_id IS NOT NULL) DESC,id DESC;
CREATE OR REPLACE VIEW v_revenue_timeline AS
 SELECT r.* FROM forecast_revenue_mensual r JOIN v_carga_timeline c ON c.id=r.carga_id;
-- Los atributos se escogen por proyecto: año actual, anterior mas cercano, futuro mas cercano.
CREATE OR REPLACE VIEW v_proyecto_timeline AS
 SELECT DISTINCT ON (forecast_clave_timeline(s.atributos,s.proyecto_id,c.anio_forecast))
 forecast_clave_timeline(s.atributos,s.proyecto_id,c.anio_forecast) AS clave_proyecto,
 s.proyecto_id,s.atributos,s.origen,c.id AS carga_id,c.anio_forecast,c.archivo_id,
 ra.valor_of,ra.acum_2025 AS acumulado_anterior,ra.backlog,ra.total_ejecutado_acumulado
 FROM v_carga_timeline c JOIN proyecto_snapshot s ON s.carga_id=c.id
 LEFT JOIN revenue_anual ra ON ra.carga_id=c.id AND ra.proyecto_id=s.proyecto_id
 ORDER BY forecast_clave_timeline(s.atributos,s.proyecto_id,c.anio_forecast),
 CASE WHEN c.anio_forecast=extract(year FROM now() AT TIME ZONE 'America/Bogota') THEN 0
      WHEN c.anio_forecast<extract(year FROM now() AT TIME ZONE 'America/Bogota') THEN 1 ELSE 2 END,
 abs(c.anio_forecast-extract(year FROM now() AT TIME ZONE 'America/Bogota')),c.id DESC;
COMMIT;
