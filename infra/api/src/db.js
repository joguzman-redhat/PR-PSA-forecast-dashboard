const { Pool, types } = require('pg');

// pg devuelve numeric como string para no perder precision. El dashboard
// espera numeros. Los montos del Excel son floats de doble precision, asi que
// parseFloat los reconstruye exacto ('13371.99458' -> 13371.99458).
types.setTypeParser(types.builtins.NUMERIC, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : parseInt(v, 10)));

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'forecast',
  password: process.env.PGPASSWORD || 'forecast',
  database: process.env.PGDATABASE || 'forecast',
  max: 10,
});

module.exports = { pool };
