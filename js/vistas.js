// Vistas que los módulos repintan o abren. Siguen en app.js hasta que se
// muevan a su módulo; app.js las registra al cargar. Así los módulos de filtros
// y del listado no importan de app.js (sería un ciclo) y la llamada se resuelve al ejecutar.
export const vistas = {};

export function registrarVistas(funciones) {
  Object.assign(vistas, funciones);
}
