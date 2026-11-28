#!/usr/bin/env node
// Cifras de dinero del front real sobre los datos de una API, solo lectura (un GET).
// Carga el front con el cargador de las pruebas y compara lo que muestra cada
// vista contra la suma de las reglas de dinero por proyecto. No escribe nada en
// disco ni en la base.
//
//   node scripts/cifras-reales.cjs [URL_DEL_TIMELINE]   (por defecto http://localhost:3000/api/timeline)
//
// Sale con 0 si las vistas cuadran con las reglas y con 1 si alguna no.
const path = require('node:path');
const { pagina } = require(path.join(__dirname, '../infra/api/test/pagina-simulada.js'));

const URL_TIMELINE = process.argv[2] || 'http://localhost:3000/api/timeline';
const numero = valor => Number.isFinite(valor);
const dolares = valor => numero(valor) ? '$' + Math.round(valor).toLocaleString('es-CO') : '—';
const sumar = (lista, campo) => lista.reduce((suma, p) => suma + (numero(campo(p)) ? campo(p) : 0), 0);

(async () => {
  const respuesta = await fetch(URL_TIMELINE);
  if (!respuesta.ok) throw new Error(`${URL_TIMELINE} respondió ${respuesta.status}`);
  const datos = await respuesta.json();

  const { ui, context } = pagina();
  context.fetch = async () => ({ ok: true, json: async () => JSON.parse(JSON.stringify(datos)) });
  if (!(await ui.cargarDatos())) throw new Error('el front no pudo cargar el timeline');

  const proyectos = ui.estado.proyectos;
  const reglas = {
    booking: sumar(proyectos, ui.valorBooking),
    backlog: sumar(proyectos, ui.backlogHoy),
    ejecutado: sumar(proyectos, ui.acumuladoHoy),
    proyectado: sumar(proyectos, ui.proyectadaAnio),
  };
  console.log(`Proyectos: ${proyectos.length} · corte financiero: ${ui.corteFinanciero()} · ${URL_TIMELINE}`);
  console.log('Reglas de dinero por proyecto, suma de todos:');
  for (const [nombre, valor] of Object.entries(reglas)) console.log(`  ${nombre.padEnd(11)} ${dolares(valor)}`);

  // Tabla de PMs: cada columna debe ser la suma de las reglas sobre los proyectos del PM.
  const pms = ui.calcularPMs();
  const proyectosDePMs = pms.flatMap(pm => pm.proyectos);
  const esperado = {
    ejecutado: sumar(proyectosDePMs, ui.acumuladoHoy),
    proyectado: sumar(proyectosDePMs, ui.proyectadaAnio),
  };
  const tabla = { ejecutado: sumar(pms, pm => pm.ejecutado), proyectado: sumar(pms, pm => pm.proyectado) };
  console.log(`Tabla de PMs: ${pms.length} PMs, ${proyectosDePMs.length} proyectos`);
  let cuadra = true;
  for (const campo of Object.keys(tabla)) {
    const ok = Math.abs(tabla[campo] - esperado[campo]) < 0.5;
    cuadra = cuadra && ok;
    console.log(`  ${campo.padEnd(11)} tabla ${dolares(tabla[campo])} · reglas ${dolares(esperado[campo])} · ${ok ? 'cuadra' : 'NO CUADRA'}`);
  }
  const parciales = pms.reduce((suma, pm) => suma + (pm.proyectadoParciales || 0), 0);
  console.log(`  proyectos con Proyectado parcial: ${parciales}`);
  process.exitCode = cuadra ? 0 : 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
