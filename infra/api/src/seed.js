#!/usr/bin/env node
/**
 * Carga a Postgres los JSON que hoy produce el ETL.
 *
 * Los 32 snapshots de historia_revenue.json se insertan como 32 cargas, de
 * modo que el historico deja de ser un archivo y pasa a ser filas. El ultimo
 * snapshot es, por construccion, el dato real del Excel.
 *
 *   node src/seed.js [ruta_a_la_carpeta_data]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('./db');
const { MESES, CLAVES_DINERO_BACKLOG, normalizarNombre, claveDe } = require('./dominio');

const dirDatos = process.argv[2] || path.join(process.env.PUBLIC_DIR || '/app/public', 'data');

function leerJson(nombre) {
  const p = path.join(dirDatos, nombre);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function sha256(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function entero(v) {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
}

function texto(v) {
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

/** 'MM/DD/YYYY' o 'YYYY-MM-DD' -> 'YYYY-MM-DD'. Null si no se puede leer. */
function fecha(v) {
  if (!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}

/** Inserta en lotes para no pasarse del limite de parametros de Postgres. */
async function insertarLotes(cliente, tabla, columnas, filas, porLote = 800) {
  for (let i = 0; i < filas.length; i += porLote) {
    const lote = filas.slice(i, i + porLote);
    const valores = [];
    const marcadores = lote.map((fila, j) => {
      const base = j * columnas.length;
      valores.push(...fila);
      return `(${columnas.map((_, k) => `$${base + k + 1}`).join(',')})`;
    });
    await cliente.query(
      `INSERT INTO ${tabla} (${columnas.join(',')}) VALUES ${marcadores.join(',')}`,
      valores,
    );
  }
}

async function main() {
  const proyectosJson = leerJson('proyectos.json');
  const backlogJson = leerJson('backlog_nola.json');
  const historiaJson = leerJson('historia_revenue.json');

  const filasInfo = proyectosJson.proyectos.filter((p) => p._tipo_fila === 'proyecto');
  const filasBacklog = backlogJson.backlog.filter((b) => b._tipo_fila === 'proyecto');
  const snapshots = historiaJson.snapshots;
  const series = historiaJson.series_por_proyecto;

  console.log(`Leidos: ${filasInfo.length} proyectos, ${filasBacklog.length} backlog, `
    + `${snapshots.length} snapshots, ${historiaJson.eventos.length} eventos`);

  // --- Cruce entre las dos hojas -------------------------------------------
  // Las hojas NO van fila a fila: en el libro FY26, 299 de 349 filas estan
  // desalineadas. Cruzar por posicion le asignaria a cada proyecto el revenue
  // de otro sin fallar. La clave es el PA y, si no hay, el nombre normalizado.
  const backlogPorPA = new Map();
  const backlogPorNombre = new Map();
  for (const b of filasBacklog) {
    const pa = texto(b.num_pa);
    if (pa && !backlogPorPA.has(pa)) backlogPorPA.set(pa, b);
    const n = normalizarNombre(b.nombre_del_proyecto);
    if (n && !backlogPorNombre.has(n)) backlogPorNombre.set(n, b);
  }

  const usados = new Set();
  const registros = [];
  for (const info of filasInfo) {
    const pa = texto(info.num_pa);
    let b = pa ? backlogPorPA.get(pa) : undefined;
    if (!b) b = backlogPorNombre.get(normalizarNombre(info.nombre_del_proyecto));
    if (b) usados.add(b);
    registros.push({ info, backlog: b || null });
  }
  for (const b of filasBacklog) {
    if (!usados.has(b)) registros.push({ info: null, backlog: b });
  }

  const cruzados = registros.filter((r) => r.info && r.backlog).length;
  const pctCruce = (cruzados / filasInfo.length) * 100;
  console.log(`Cruce entre hojas: ${cruzados}/${filasInfo.length} (${pctCruce.toFixed(1)}%)`);
  if (pctCruce < 95) {
    throw new Error(`Cruce por debajo del 95%: sin ese cruce cada proyecto mostraria el revenue de otro`);
  }

  // clave_historia: la misma que calcula el dashboard (String(num_pa), o
  // 'fila-<n>' con el numero de fila de BackLog NOLA).
  for (const r of registros) {
    const pa = texto(r.info ? r.info.num_pa : r.backlog.num_pa);
    const filaBacklog = r.backlog ? r.backlog._fila_excel : (r.info ? r.info._fila_excel : null);
    r.claveHistoria = pa || `fila-${filaBacklog}`;
    // El fallback se marca con la hoja de origen: las 14 filas vacias de cada
    // hoja no tienen PA ni nombre, y sus numeros de fila se repiten entre
    // hojas (la 313 esta vacia en las dos). Sin el prefijo, chocan.
    const origen = r.info ? 'info' : 'bl';
    r.clave = claveDe(pa, (r.info || r.backlog).nombre_del_proyecto)
      || `${origen}:fila-${r.info ? r.info._fila_excel : r.backlog._fila_excel}`;
  }

  // Dos registros pueden reclamar la misma clave_historia (de nuevo la fila
  // 313). Las series se generaron desde BackLog NOLA, asi que gana quien
  // tenga serie; el otro se queda sin historia en vez de heredar la ajena.
  const porClaveHistoria = new Map();
  for (const r of registros) {
    const otro = porClaveHistoria.get(r.claveHistoria);
    if (!otro) { porClaveHistoria.set(r.claveHistoria, r); continue; }
    const ganador = series[r.claveHistoria] && r.backlog ? r : otro;
    const perdedor = ganador === r ? otro : r;
    perdedor.claveHistoria = null;
    porClaveHistoria.set(ganador.claveHistoria, ganador);
    console.log(`clave_historia duplicada '${ganador.clave_historia || ganador.claveHistoria}': `
      + `se la queda ${ganador.clave}, ${perdedor.clave} queda sin serie`);
  }

  const sinSerie = registros.filter((r) => !series[r.claveHistoria]).length;
  console.log(`Proyectos sin serie historica: ${sinSerie}`);

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query('TRUNCATE movimiento, revenue_mes, revenue_anual, proyecto, carga RESTART IDENTITY CASCADE');

    // --- cargas ------------------------------------------------------------
    const idDeSnapshot = new Map();
    for (const s of snapshots) {
      const { rows } = await cliente.query(
        `INSERT INTO carga (codigo, etiqueta, tipo, ejecutada_en, archivo_nombre,
                            datos_hash, fecha_referencia, filas_info, filas_backlog,
                            meta_proyectos, meta_backlog)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [
          s.id, s.etiqueta, s.tipo, s.timestamp, 'CLOUD FORECAST GENERAL - NOLA FY26.xlsx',
          sha256([s.id, s.totales]), historiaJson.meta.fecha_referencia,
          filasInfo.length, filasBacklog.length,
          JSON.stringify(proyectosJson.meta), JSON.stringify(backlogJson.meta),
        ],
      );
      idDeSnapshot.set(s.id, rows[0].id);
    }
    const cargaIds = snapshots.map((s) => idDeSnapshot.get(s.id));
    const cargaFinal = cargaIds[cargaIds.length - 1];
    console.log(`Cargas insertadas: ${cargaIds.length} (actual = ${cargaFinal})`);

    // --- proyectos ---------------------------------------------------------
    const idDeClaveHistoria = new Map();
    for (const r of registros) {
      const i = r.info || {};
      const b = r.backlog || {};

      // La plata del backlog vive en revenue_mes / revenue_anual. Se saca del
      // jsonb para que no pueda quedar desincronizada con las tablas de hechos.
      const descriptivoBacklog = {};
      for (const [k, v] of Object.entries(b)) {
        if (!CLAVES_DINERO_BACKLOG.has(k)) descriptivoBacklog[k] = v;
      }

      // Primera carga donde el proyecto aparece en la historia.
      const serie = series[r.claveHistoria] || [];
      const primeraCarga = serie.length ? idDeSnapshot.get(serie[0].snapshot_id) : cargaFinal;

      const { rows } = await cliente.query(
        `INSERT INTO proyecto (
            clave, clave_historia, num_pa, project_id, num_opp, nombre, cliente,
            pm_lider, pm_lider_psa, zona, pais, vendedor, tsm, billing_type,
            billing_arrangement, estado, valor_of, valor_of_anterior,
            acumulado_a_hoy, consumido_2025, backlog_2026, ejecucion_deseada,
            pct_ejecucion_actual, pct_peso_contrato, fecha_fin, estado_contrato,
            dias_para_vencimiento, meses_transcurridos, tipo_de_ejecucion,
            q_del_clawback, estatus, start_at_risk, campos_con_error,
            campos_recalculados, datos_info, datos_backlog,
            primera_carga_id, ultima_carga_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
                 $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,
                 $35,$36,$37,$38)
         RETURNING id`,
        [
          r.clave, r.claveHistoria, texto(i.num_pa ?? b.num_pa), texto(i.project_id),
          texto(i.num_opp ?? b.num_opp),
          texto(i.nombre_del_proyecto ?? b.nombre_del_proyecto), texto(i.cliente),
          texto(i.pm_lider ?? b.pm_lider), texto(i.pm_lider_psa), texto(i.zona),
          texto(i.pais), texto(i.vendedor), texto(i.tsm),
          texto(i.billing_type ?? b.billing_type),
          texto(i.billing_arrangement ?? b.billing_arrangement),
          texto(i.estado ?? b.estado),
          num(i.valor_of), num(i.valor_of_anterior), num(i.acumulado_a_hoy),
          num(i.consumido_2025), num(i.backlog_2026), num(i.ejecucion_deseada),
          num(i.pct_ejecucion_actual), num(i.pct_peso_contrato),
          fecha(i.fecha_fin), texto(i.estado_contrato),
          entero(i.dias_para_vencimiento), num(i.meses_transcurridos),
          texto(i.tipo_de_ejecucion), texto(i.q_del_clawback), texto(i.estatus),
          typeof i.start_at_risk === 'boolean' ? i.start_at_risk : null,
          JSON.stringify(i._errores || {}),
          Object.keys(i._recalculado || {}),
          JSON.stringify(r.info || {}),
          JSON.stringify(descriptivoBacklog),
          primeraCarga, cargaFinal,
        ],
      );
      r.id = rows[0].id;
      if (r.claveHistoria) idDeClaveHistoria.set(r.claveHistoria, rows[0].id);
    }
    console.log(`Proyectos insertados: ${registros.length}`);

    // --- revenue por snapshot ----------------------------------------------
    // Los snapshots 1..n-1 son la reconstruccion hacia atras; el ultimo es el
    // Excel de hoy y se carga desde BackLog NOLA, no desde la simulacion. Asi
    // la carga actual reproduce el libro al centavo y no arrastra el redondeo
    // de la serie (daba 0.31 USD de diferencia sobre el total del portafolio).
    const idSnapshotFinal = snapshots[snapshots.length - 1].id;
    const filasMes = [];
    const filasAnual = [];
    for (const r of registros) {
      const serie = series[r.claveHistoria] || [];
      const valorOf = r.backlog ? num(r.backlog.valor_of) : null;
      for (const e of serie) {
        if (e.snapshot_id === idSnapshotFinal) continue;
        const cargaId = idDeSnapshot.get(e.snapshot_id);
        if (!cargaId) continue;
        for (let m = 0; m < 12; m += 1) {
          const par = e.meses[m] || [0, 0];
          filasMes.push([cargaId, r.id, m + 1, par[0] || 0, par[1] || 0]);
        }
        // acum_2025 no se versiona en la simulacion: sale de TOTAL = fijo + acum.
        const acum = Math.round((e.total - e.fijo) * 100) / 100;
        filasAnual.push([cargaId, r.id, valorOf, acum, e.backlog, e.total]);
      }

      if (r.backlog) {
        for (let m = 0; m < 12; m += 1) {
          filasMes.push([
            cargaFinal, r.id, m + 1,
            num(r.backlog[`${MESES[m]}_fijo`]) || 0,
            num(r.backlog[`${MESES[m]}_upside`]) || 0,
          ]);
        }
        filasAnual.push([
          cargaFinal, r.id, valorOf, num(r.backlog.acum_2025),
          num(r.backlog.backlog), num(r.backlog.total_ejecutado_acumulado),
        ]);
      }
    }
    await insertarLotes(cliente, 'revenue_mes',
      ['carga_id', 'proyecto_id', 'mes', 'commit_usd', 'upside_usd'], filasMes);
    await insertarLotes(cliente, 'revenue_anual',
      ['carga_id', 'proyecto_id', 'valor_of', 'acum_2025', 'backlog', 'total_ejecutado_acumulado'],
      filasAnual, 600);
    console.log(`revenue_mes: ${filasMes.length} filas · revenue_anual: ${filasAnual.length} filas`);

    // --- movimientos --------------------------------------------------------
    const indiceDeSnapshot = new Map(snapshots.map((s, i) => [s.id, i]));
    const filasMov = [];
    let huerfanos = 0;
    for (const ev of historiaJson.eventos) {
      const proyectoId = idDeClaveHistoria.get(String(ev.num_pa));
      const cargaId = idDeSnapshot.get(ev.snapshot_id);
      if (!proyectoId || !cargaId) { huerfanos += 1; continue; }
      const idx = indiceDeSnapshot.get(ev.snapshot_id);
      const cargaPrevia = idx > 0 ? cargaIds[idx - 1] : null;
      const mes = ev.campo ? MESES.indexOf(String(ev.campo).toLowerCase()) + 1 : null;
      filasMov.push([
        cargaId, cargaPrevia, proyectoId, mes && mes > 0 ? mes : null, ev.tipo,
        Math.abs(num(ev.delta) || 0), num(ev.valor_anterior), num(ev.valor_nuevo),
        num(ev.upside_anterior), num(ev.upside_nuevo),
      ]);
    }
    await insertarLotes(cliente, 'movimiento',
      ['carga_id', 'carga_previa_id', 'proyecto_id', 'mes', 'tipo', 'monto',
        'commit_anterior', 'commit_nuevo', 'upside_anterior', 'upside_nuevo'],
      filasMov, 500);
    console.log(`movimiento: ${filasMov.length} filas${huerfanos ? ` (${huerfanos} eventos sin proyecto)` : ''}`);

    await cliente.query('COMMIT');
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }

  // --- validacion: los totales de la carga actual contra el Excel ----------
  const { rows: val } = await pool.query(
    `SELECT sum(commit_usd) AS commit_total, sum(upside_usd) AS upside_total
       FROM revenue_mes WHERE carga_id = (SELECT id FROM v_carga_actual)`,
  );
  const esperado = filasBacklog.reduce((acc, b) => {
    for (const m of MESES) acc += num(b[`${m}_fijo`]) || 0;
    return acc;
  }, 0);
  const obtenido = val[0].commit_total;
  const dif = Math.abs(obtenido - esperado);
  console.log(`\nRevenue Commit en BD : ${obtenido.toFixed(2)}`);
  console.log(`Revenue Commit Excel : ${esperado.toFixed(2)}`);
  console.log(dif < 0.01 ? 'OK · la carga actual reproduce el Excel' : `DIFERENCIA de ${dif.toFixed(2)}`);

  await pool.end();
}

main().catch((err) => {
  console.error('\nERROR:', err.message);
  process.exit(1);
});
