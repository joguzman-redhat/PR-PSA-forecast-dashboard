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
  meta_backlog     jsonb
);
CREATE INDEX idx_carga_ejecutada_en ON carga (ejecutada_en DESC);

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
  SELECT datos_hash INTO hash_ultimo FROM carga ORDER BY id DESC LIMIT 1;
  IF hash_ultimo IS NOT NULL AND hash_ultimo = NEW.datos_hash THEN
    RAISE EXCEPTION 'Sin cambios respecto a la ultima carga (hash %)', NEW.datos_hash
      USING ERRCODE = 'unique_violation',
            HINT = 'El Excel no se movio desde la carga anterior. No se escribe nada y los datos previos quedan intactos.';
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
  p_hash           text,
  p_archivo        text    DEFAULT NULL,
  p_fecha          date    DEFAULT current_date,
  p_filas_info     int     DEFAULT 0,
  p_filas_backlog  int     DEFAULT 0,
  p_meta_proyectos jsonb   DEFAULT NULL,
  p_meta_backlog   jsonb   DEFAULT NULL
) RETURNS bigint AS $$
DECLARE hash_ultimo text; nuevo_id bigint;
BEGIN
  SELECT datos_hash INTO hash_ultimo FROM carga ORDER BY id DESC LIMIT 1;
  IF hash_ultimo IS NOT NULL AND hash_ultimo = p_hash THEN
    RETURN NULL;
  END IF;
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
