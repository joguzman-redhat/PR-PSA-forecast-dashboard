// Carga del timeline desde la API y preparación del estado del dashboard.
import { estado } from './estado.js';
import { obtenerTimeline } from './api.js';
import { configurarCalendarioTimeline } from './calendario.js';
import { normalizarNombre } from './fila-backlog.js';

export async function cargarDatos() {
  const principal = document.querySelector('.contenedor-principal');
  const aviso = document.getElementById('forecast-estado');
  try {
    const datos = await obtenerTimeline();
    const {meta,proyectos,backlog,historia}=datos;
    estado.forecast={timeline:true,anio:meta.anio_actual,periodos:meta.periodos};
    estado.metadataProyectos=meta;estado.metadataBacklog=meta;
    estado.proyectos=proyectos.filter(p=>p._tipo_fila==='proyecto');
    estado.backlog=backlog.filter(p=>p._tipo_fila==='proyecto');estado.historia=historia;
    estado.backlogPorPA=new Map();estado.backlogPorNombre=new Map();estado.backlogPorTimeline=new Map();
    estado.backlog.forEach(b=>{
      estado.backlogPorTimeline.set(b.clave_timeline,b);
      if(b.num_pa!=null&&b.num_pa!=='')estado.backlogPorPA.set(String(b.num_pa),b);
      const n=normalizarNombre(b.nombre_del_proyecto);if(n&&!estado.backlogPorNombre.has(n))estado.backlogPorNombre.set(n,b);
    });
    configurarCalendarioTimeline(meta);
    estado.proyectosFiltrados=[...estado.proyectos];
    const vacio=meta.estado==='sin_datos';principal.classList.toggle('forecast-sin-datos',vacio);
    aviso.textContent=vacio?'Todavía no hay datos guardados. Ejecuta la carga de n8n.':
      `${estado.proyectos.length} proyectos · ${meta.periodos[0]} a ${meta.periodos.at(-1)} · calendario consolidado`;
    return true;
  } catch(err) {
    console.error('Error cargando timeline:',err);principal.classList.add('forecast-sin-datos');
    aviso.textContent='No se pudo cargar el timeline: '+err.message;return false;
  }
}

