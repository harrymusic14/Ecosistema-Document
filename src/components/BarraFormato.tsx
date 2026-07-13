// src/components/BarraFormato.tsx
//
// Barra de formato FIJA en la barra superior (no flotante sobre la selección): aplica
// negrita/cursiva/resaltado/color de letra/tipo de letra sobre lo que esté seleccionado
// (o donde esté el cursor) en cualquier celda editable del documento, sin importar en
// qué celda/tabla esté. Usa document.execCommand: aunque está marcado como "deprecated"
// en el estándar, sigue funcionando en Chrome/Edge/Firefox y es, por lejos, la forma más
// simple y confiable de aplicar formato dentro de un contentEditable sin reimplementar a
// mano el manejo de rangos/selecciones superpuestas.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Bold, Italic, Highlighter } from 'lucide-react';

const COLORES_RESALTADO = [
  { nombre: 'Amarillo', valor: '#fef08a' },
  { nombre: 'Verde', valor: '#bbf7d0' },
  { nombre: 'Celeste', valor: '#bae6fd' },
  { nombre: 'Rosado', valor: '#fbcfe8' },
];

const COLORES_TEXTO = [
  { nombre: 'Predeterminado', valor: 'inherit' },
  { nombre: 'Negro', valor: '#000000' },
  { nombre: 'Rojo', valor: '#dc2626' },
  { nombre: 'Azul', valor: '#2563eb' },
  { nombre: 'Verde', valor: '#16a34a' },
];

const FUENTES = [
  { nombre: 'Predeterminada', valor: '' },
  { nombre: 'Arial', valor: 'Arial, sans-serif' },
  { nombre: 'Times New Roman', valor: '"Times New Roman", serif' },
  { nombre: 'Courier New', valor: '"Courier New", monospace' },
];

export default function BarraFormato({ contenedorRef }: { contenedorRef: RefObject<HTMLElement | null> }) {
  const [habilitado, setHabilitado] = useState(false);
  const [negritaActiva, setNegritaActiva] = useState(false);
  const [cursivaActiva, setCursivaActiva] = useState(false);
  const rangoGuardado = useRef<Range | null>(null);
  const barraRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const alCambiarSeleccion = () => {
      // Si el foco quedó dentro de la propia barra (ej. el <select> de fuente abierto),
      // no toques el estado: el usuario la sigue usando sobre la última celda editada.
      if (barraRef.current?.contains(document.activeElement)) return;

      const activo = document.activeElement as HTMLElement | null;
      const contenedor = contenedorRef.current;
      const seleccion = window.getSelection();
      const hayContexto = !!activo && activo.isContentEditable && !!contenedor && contenedor.contains(activo) && !!seleccion && seleccion.rangeCount > 0;

      setHabilitado(hayContexto);
      if (!hayContexto) return;

      const rango = seleccion!.getRangeAt(0);
      rangoGuardado.current = rango.cloneRange();
      setNegritaActiva(document.queryCommandState('bold'));
      setCursivaActiva(document.queryCommandState('italic'));
    };

    document.addEventListener('selectionchange', alCambiarSeleccion);
    return () => document.removeEventListener('selectionchange', alCambiarSeleccion);
  }, [contenedorRef]);

  // Restaura la selección guardada antes de aplicar el comando: hace falta porque abrir
  // el <select> de fuente (o hacer clic en la barra, que vive fuera del documento) le
  // quita el foco a la celda editable. Los botones usan onMouseDown+preventDefault para
  // nunca perder la selección en primer lugar, pero esto cubre igual todos los casos.
  const aplicar = (comando: string, valor?: string) => {
    if (!rangoGuardado.current) return;
    const seleccion = window.getSelection();
    if (seleccion) {
      seleccion.removeAllRanges();
      seleccion.addRange(rangoGuardado.current);
    }
    if (comando === 'hiliteColor' && !document.queryCommandSupported('hiliteColor')) {
      document.execCommand('backColor', false, valor);
    } else {
      document.execCommand(comando, false, valor);
    }
    if (comando === 'bold') setNegritaActiva(document.queryCommandState('bold'));
    if (comando === 'italic') setCursivaActiva(document.queryCommandState('italic'));
  };

  return (
    <div
      ref={barraRef}
      className={`flex items-center gap-1 flex-wrap p-1.5 bg-slate-100 border border-slate-300 transition-opacity ${habilitado ? '' : 'opacity-40 pointer-events-none'}`}
      title={habilitado ? undefined : 'Hace clic en un campo del documento para editar formato'}
    >
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => aplicar('bold')}
        title="Negrita"
        className={`p-1.5 text-slate-700 hover:bg-slate-200 transition-colors ${negritaActiva ? 'bg-brand-blue text-white' : ''}`}
      >
        <Bold size={14} />
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => aplicar('italic')}
        title="Cursiva"
        className={`p-1.5 text-slate-700 hover:bg-slate-200 transition-colors ${cursivaActiva ? 'bg-brand-blue text-white' : ''}`}
      >
        <Italic size={14} />
      </button>

      <div className="w-px h-5 bg-slate-300 mx-0.5" />

      {COLORES_TEXTO.map(c => (
        <button
          key={c.valor}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => aplicar('foreColor', c.valor)}
          title={`Color de letra: ${c.nombre}`}
          style={{ color: c.valor === 'inherit' ? '#475569' : c.valor }}
          className="w-6 h-6 text-sm font-black leading-none bg-white border border-slate-300 hover:bg-slate-200 transition-colors flex items-center justify-center"
        >
          A
        </button>
      ))}

      <div className="w-px h-5 bg-slate-300 mx-0.5" />

      {COLORES_RESALTADO.map(c => (
        <button
          key={c.valor}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => aplicar('hiliteColor', c.valor)}
          title={c.nombre}
          className="w-6 h-6 border border-slate-300"
          style={{ backgroundColor: c.valor }}
        />
      ))}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => aplicar('hiliteColor', 'transparent')}
        title="Quitar resaltado"
        className="p-1.5 text-slate-700 hover:bg-slate-200 transition-colors"
      >
        <Highlighter size={14} className="opacity-50" />
      </button>

      <div className="w-px h-5 bg-slate-300 mx-0.5" />

      <select
        onChange={(e) => aplicar('fontName', e.target.value)}
        defaultValue=""
        title="Tipo de letra"
        className="bg-white border border-slate-300 text-xs text-slate-700 outline-none cursor-pointer max-w-[110px] py-1"
      >
        {FUENTES.map(f => (
          <option key={f.nombre} value={f.valor}>{f.nombre}</option>
        ))}
      </select>
    </div>
  );
}
