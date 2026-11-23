-- Esquema minimo anterior a multi-año, solo para probar la migracion aislada.
CREATE TABLE carga (
  id bigserial PRIMARY KEY, codigo text UNIQUE, etiqueta text,
  tipo text DEFAULT 'etl', ejecutada_en timestamp DEFAULT now(),
  archivo_nombre text, datos_hash text NOT NULL, fecha_referencia date,
  filas_info int DEFAULT 0, filas_backlog int DEFAULT 0,
  meta_proyectos jsonb, meta_backlog jsonb
);
CREATE TABLE proyecto (
  id bigserial PRIMARY KEY, clave text UNIQUE, num_pa text, nombre text,
  pm_lider text, zona text, estado text, valor_of numeric,
  ultima_carga_id bigint REFERENCES carga(id)
);
CREATE TABLE revenue_mes (
  carga_id bigint REFERENCES carga(id), proyecto_id bigint REFERENCES proyecto(id),
  mes smallint, commit_usd numeric, upside_usd numeric,
  PRIMARY KEY (carga_id, proyecto_id, mes)
);
CREATE TABLE revenue_anual (
  carga_id bigint REFERENCES carga(id), proyecto_id bigint REFERENCES proyecto(id),
  valor_of numeric, acum_2025 numeric, backlog numeric, total_ejecutado_acumulado numeric,
  PRIMARY KEY (carga_id, proyecto_id)
);
CREATE TABLE movimiento (
  id bigserial PRIMARY KEY, carga_id bigint REFERENCES carga(id),
  carga_previa_id bigint REFERENCES carga(id), proyecto_id bigint REFERENCES proyecto(id),
  mes smallint, tipo text, monto numeric
);
CREATE FUNCTION carga_rechazar_sin_cambios() RETURNS trigger AS $$
BEGIN RETURN NEW; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_carga_sin_cambios BEFORE INSERT ON carga
  FOR EACH ROW EXECUTE FUNCTION carga_rechazar_sin_cambios();
CREATE VIEW v_carga_actual AS
  SELECT c.* FROM carga c WHERE c.id = coalesce(
    (SELECT max(ultima_carga_id) FROM proyecto), (SELECT max(id) FROM carga));
CREATE VIEW v_proyecto_actual AS SELECT * FROM proyecto;
