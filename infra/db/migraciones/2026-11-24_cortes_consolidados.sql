-- Identidad de corrida sin alterar capturas ni importes existentes.
ALTER TABLE carga ADD COLUMN IF NOT EXISTS ejecucion_id text;
