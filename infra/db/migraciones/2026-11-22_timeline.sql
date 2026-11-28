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
