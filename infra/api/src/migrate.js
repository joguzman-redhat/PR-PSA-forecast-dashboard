// CLI exclusivo del Job de migracion; la API no importa ni ejecuta este modulo.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');

const directory = process.env.FORECAST_DB_DIR || path.resolve(__dirname, '../../db');
const fingerprintSql = fs.readFileSync(path.join(directory, 'runtime/fingerprint.sql'), 'utf8');
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const command = process.argv[2] || '--migrate';
const baseline = JSON.parse(fs.readFileSync(path.join(directory, 'runtime/baseline.json'), 'utf8'));
const files = fs.readdirSync(path.join(directory, 'migraciones')).filter((name) => name.endsWith('.sql')).sort()
  .map((name) => { const sql = fs.readFileSync(path.join(directory, 'migraciones', name), 'utf8'); return { name, sql, sha256: digest(sql) }; });
const client = new Client({ connectionTimeoutMillis: 15000, statement_timeout: 120000, application_name: 'forecast-migrations' });

async function fingerprint() {
  const { rows } = await client.query(fingerprintSql);
  // psql -At emits this text with one newline; use the same encoding for portable verification.
  return digest(rows[0].fingerprint + '\n');
}

async function transaction(work) {
  await client.query('BEGIN');
  try { await work(); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
}

function verifyBaseline() {
  const schema = fs.readFileSync(path.join(directory, 'init/01_schema.sql'), 'utf8');
  if (digest(schema) !== baseline.schemaSha256) throw new Error('El esquema inicial no coincide con el baseline versionado. Revisar antes de inicializar.');
  for (const migration of baseline.migrations) {
    if (!files.some((file) => file.name === migration.name && file.sha256 === migration.sha256)) {
      throw new Error(`Baseline inconsistente: ${migration.name}`);
    }
  }
  return schema;
}

async function createLedger(mode, details) {
  await client.query('CREATE SCHEMA forecast_ops');
  await client.query('CREATE TABLE forecast_ops.schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  await client.query('CREATE TABLE forecast_ops.bootstrap (mode text NOT NULL, schema_sha256 text NOT NULL, details jsonb NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now())');
  await client.query('INSERT INTO forecast_ops.bootstrap(mode,schema_sha256,details) VALUES($1,$2,$3)', [mode, baseline.schemaSha256, details]);
  for (const file of baseline.migrations) {
    await client.query('INSERT INTO forecast_ops.schema_migrations(name,sha256) VALUES($1,$2)', [file.name, file.sha256]);
  }
}

async function prepareSchema() {
  const { rows: ledger } = await client.query("SELECT to_regclass('forecast_ops.schema_migrations') AS ledger");
  if (ledger[0].ledger) {
    if (command === '--adopt-baseline') throw new Error('La base ya tiene historial; no se permite volver a adoptar.');
    return;
  }
  const { rows } = await client.query("SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') + (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AS objects");
  const schema = verifyBaseline();
  if (command === '--adopt-baseline') {
    const expected = process.env.FORECAST_ADOPT_BASELINE_SHA256 || '';
    const reference = process.env.FORECAST_ADOPT_BACKUP_REFERENCE || '';
    if (!/^[a-f0-9]{64}$/.test(expected) || !reference || Number(rows[0].objects) === 0) {
      throw new Error('Adopcion requiere base restaurada, SHA256 estructural verificado de la fuente y referencia de backup.');
    }
    await transaction(async () => {
      const actual = await fingerprint();
      if (actual !== expected) throw new Error('La estructura restaurada no coincide con la fuente verificada. No se adopto.');
      await createLedger('adopted-verified-source', { fingerprint: actual, backup: reference });
    });
    console.log('Baseline de fuente verificada registrado. No se modificaron datos financieros.');
    return;
  }
  if (Number(rows[0].objects) !== 0) throw new Error('Base existente sin historial. Restaurar/verificar y adoptar explicitamente; no se inicializara por suposicion.');
  // El SQL canonico historico contiene una pareja BEGIN/COMMIT. Su hash esta fijado;
  // se retira solo esa envoltura para incluir esquema y ledger en una transaccion.
  const boundaries = schema.match(/^\s*(?:BEGIN|COMMIT);\s*$/gm) || [];
  if (boundaries.length !== 2) throw new Error('Envoltura SQL inicial inesperada; revisar baseline.');
  const initialSql = schema.replace(/^\s*(?:BEGIN|COMMIT);\s*$/gm, '');
  await transaction(async () => {
    await client.query('SET LOCAL ROLE forecast_owner');
    await client.query(initialSql);
    await client.query('RESET ROLE');
    await createLedger('empty-database', {});
  });
  console.log('Esquema canonico inicializado y baseline registrado.');
}

async function applyPending() {
  const { rows } = await client.query('SELECT name,sha256 FROM forecast_ops.schema_migrations ORDER BY name');
  const applied = new Map(rows.map((row) => [row.name, row.sha256]));
  for (const row of rows) {
    if (!files.some((file) => file.name === row.name && file.sha256 === row.sha256)) throw new Error(`Migracion aplicada modificada o ausente: ${row.name}`);
  }
  const latest = rows.at(-1)?.name || '';
  for (const file of files) {
    if (applied.has(file.name)) continue;
    if (file.name <= latest) throw new Error(`Migracion fuera de orden: ${file.name}`);
    if (/^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/im.test(file.sql)) throw new Error(`La migracion debe dejar la transaccion al ejecutor: ${file.name}`);
    await transaction(async () => {
      await client.query('SET LOCAL ROLE forecast_owner');
      await client.query(file.sql);
      await client.query('RESET ROLE');
      await client.query('INSERT INTO forecast_ops.schema_migrations(name,sha256) VALUES($1,$2)', [file.name, file.sha256]);
    });
    console.log(`Migracion aplicada: ${file.name}`);
  }
}

async function provisionRoles() {
  for (const [role, key] of [['forecast_reader', 'FORECAST_READER_PASSWORD'], ['forecast_writer', 'FORECAST_WRITER_PASSWORD']]) {
    const password = process.env[key];
    if (!password) throw new Error(`Falta ${key} para provisionar permisos.`);
    const { rows: existing } = await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]);
    const { rows } = await client.query("SELECT format('%s ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD %L', $1::text,$2::text,$3::text) AS ddl", [existing.length ? 'ALTER' : 'CREATE', role, password]);
    await client.query(rows[0].ddl);
    const { rows: database } = await client.query("SELECT format('GRANT CONNECT ON DATABASE %I TO %I',current_database(),$1::text) AS ddl", [role]);
    await client.query(database[0].ddl);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  }
  await client.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO forecast_reader');
  await client.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO forecast_writer');
  await client.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO forecast_writer');
  await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE forecast_owner IN SCHEMA public GRANT SELECT ON TABLES TO forecast_reader');
  await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE forecast_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO forecast_writer');
  await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE forecast_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO forecast_writer');
  await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  // El propietario necesita leer el historial para incluirlo en pg_dump.
  // Estos permisos no permiten modificarlo ni se conceden al lector o al ETL.
  await client.query('GRANT USAGE ON SCHEMA forecast_ops TO forecast_owner');
  await client.query('GRANT SELECT ON TABLE forecast_ops.schema_migrations, forecast_ops.bootstrap TO forecast_owner');
}

async function main() {
  if (command === '--fingerprint-sql') { process.stdout.write(fingerprintSql); return; }
  if (!['--migrate', '--adopt-baseline', '--fingerprint'].includes(command)) throw new Error('Comando no valido.');
  await client.connect();
  try {
    if (command === '--fingerprint') { console.log(await fingerprint()); return; }
    await client.query("SET lock_timeout='15s'");
    const { rows } = await client.query('SELECT pg_try_advisory_lock(184693227, 1) AS acquired');
    if (!rows[0].acquired) throw new Error('Ya hay otra migracion en curso.');
    try {
      await prepareSchema();
      await applyPending();
      await provisionRoles();
      console.log('Migraciones y permisos completados.');
    } finally { await client.query('SELECT pg_advisory_unlock(184693227, 1)'); }
  } finally { await client.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
