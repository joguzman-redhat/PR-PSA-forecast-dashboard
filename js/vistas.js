// Vistas que los módulos repintan o abren. app.js las registra al cargar, con las
// funciones de su módulo o con llamadas a las que siguen en app.js. Así los módulos de
// filtros y del listado no importan de app.js (sería un ciclo) y la llamada se resuelve al ejecutar.
export const vistas = {};

export function registrarVistas(funciones) {
  Object.assign(vistas, funciones);
}
