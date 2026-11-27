-- Identidad por Project ID (ADR 0003, ticket 02): reconstruye las claves del historial.
-- La clave pasa a ser Project ID -> PA -> SIN_ID:<año>:<id> (antes PA -> Project ID -> SIN_PA),
-- de modo que un proyecto partido en varias claves (p. ej. PA:PR-061990 y PA:69412 con el mismo
-- Project ID) queda unido con todo su historial.
--
-- Lo unico que guarda claves es forecast_revenue_mensual, que es derivado de revenue_mes y
-- proyecto_snapshot; las vistas v_*_timeline calculan la clave al vuelo. Por eso se vacia y se
-- reconstruye completa con la misma regla que 01_schema.sql. Los importes de revenue_mes y
-- revenue_anual no se tocan: Booking, Ejecutado y Backlog totales no cambian.
--
-- Transaccional e idempotente: correrla dos veces deja los mismos datos.
-- Debe aplicarse DESPUES de 2026-11-22_timeline.sql (forecast.sh migrate respeta el orden).
--
-- Procedimiento:
--   1. Respaldo previo:  pg_dump -Fc -U forecast -d forecast -f forecast_antes_identidad.dump
--   2. Aplicarla primero en la base local y verificar series y totales.
--   3. Recien despues, en OpenShift (con su propio pg_dump previo).
BEGIN;
CREATE OR REPLACE FUNCTION forecast_clave_timeline(a jsonb, proyecto bigint, anio int) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE
   WHEN nullif(btrim(a->>'project_id'),'') IS NOT NULL
        AND upper(btrim(a->>'project_id')) NOT IN ('#N/A','N/A','NA')
     THEN 'PR:' || upper(btrim(a->>'project_id'))
   WHEN nullif(btrim(a->>'num_pa'),'') IS NOT NULL
        AND upper(btrim(a->>'num_pa')) NOT IN ('#N/A','N/A','NA')
     THEN 'PA:' || upper(btrim(a->>'num_pa'))
   ELSE 'SIN_ID:' || anio::text || ':' || proyecto::text END
$$;

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
    OR ((EXCLUDED.archivo_id IS NOT NULL)=(destino.archivo_id IS NOT NULL)
     AND (EXCLUDED.carga_id>destino.carga_id OR (EXCLUDED.carga_id=destino.carga_id AND EXCLUDED.proyecto_id>=destino.proyecto_id)));
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_revenue_timeline ON revenue_mes;
CREATE TRIGGER trg_revenue_timeline AFTER INSERT OR UPDATE ON revenue_mes
 FOR EACH ROW EXECUTE FUNCTION consolidar_revenue_timeline();

-- Reconstruccion completa (mismo orden que el backfill de 01_schema.sql).
DELETE FROM forecast_revenue_mensual;
INSERT INTO forecast_revenue_mensual AS destino
 (clave_proyecto,periodo,proyecto_id,carga_id,archivo_id,commit_usd,upside_usd)
SELECT DISTINCT ON (forecast_clave_timeline(s.atributos,r.proyecto_id,c.anio_forecast),c.anio_forecast,r.mes)
 forecast_clave_timeline(s.atributos,r.proyecto_id,c.anio_forecast),make_date(c.anio_forecast,r.mes,1),
 r.proyecto_id,c.id,c.archivo_id,r.commit_usd,r.upside_usd
 FROM revenue_mes r JOIN carga c ON c.id=r.carga_id
 JOIN proyecto_snapshot s ON s.carga_id=r.carga_id AND s.proyecto_id=r.proyecto_id
 ORDER BY forecast_clave_timeline(s.atributos,r.proyecto_id,c.anio_forecast),c.anio_forecast,r.mes,
   (c.archivo_id IS NOT NULL) DESC,c.id DESC,r.proyecto_id DESC;
COMMIT;
