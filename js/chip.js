// Etiqueta de dato (chip) compartida por las vistas.

export function chip(texto, clase, titulo) {
  if(texto==='On Hold')clase='chip-on-hold';
  const el = document.createElement('span');
  el.className = 'chip-dato ' + (clase || '');
  el.textContent = texto;
  if (titulo) el.title = titulo;
  return el;
}
