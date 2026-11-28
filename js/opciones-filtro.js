// Opciones de los selectores que dependen del conjunto visible.


/** Refresca opciones dependientes del conjunto visible, conservando la selección del usuario. */
export function actualizarOpcionesFiltro(selector, valores) {
  const seleccion = selector.value;
  const unicos = new Set(valores);
  if (seleccion) unicos.add(seleccion);
  const inicial = selector.options[0].cloneNode(true);
  inicial.selected = false;
  selector.replaceChildren(inicial);
  [...unicos].sort((a, b) => a.localeCompare(b, 'es')).forEach(valor => {
    const opt = document.createElement('option');
    opt.value = valor;
    opt.textContent = valor;
    selector.appendChild(opt);
  });
  selector.value = seleccion;
}
