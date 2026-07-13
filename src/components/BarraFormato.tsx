// src/components/BarraFormato.tsx
//
// Barra flotante tipo Word: aparece al seleccionar texto dentro de una celda editable
// del documento (ver PlantillaFactura/CeldaEditable) y aplica negrita/cursiva/resaltado/
// tipo de letra sobre esa selección. Usa document.execCommand: aunque está marcado como
// "deprecated" en el estándar, sigue funcionando en Chrome/Edge/Firefox y es, por lejos,
// la forma más simple y confiable de aplicar formato dentro de un contentEditable sin
// tener que reimplementar manualmente el manejo de rangos/selecciones superpuestas.
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

interface Posicion {
  top: number;
  left: number;
}

export default function BarraFormato({ contenedorRef }: { contenedorRef: RefObject<HTMLElement | null> }) {
  const [visible, setVisible] = useState(false);
  const [posicion, setPosicion] = useState<Posicion>({ top: 0, left: 0 });
  const [negritaActiva, setNegritaActiva] = useState(false);
  const [cursivaActiva, setCursivaActiva] = useState(false);
  const rangoGuardado = useRef<Range | null>(null);
  const barraRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const alCambiarSeleccion = () => {
      // Si el foco quedó dentro de la barra (ej. el <select> de fuente abierto), no la
      // ocultes: el usuario todavía la está usando.
      if (barraRef.current?.contains(document.activeElement)) return;

      // Aparece con solo poner el cursor (sin necesidad de seleccionar texto), igual que
      // en Word: alcanza con que el elemento enfocado sea una celda editable dentro del
      // documento. La selección puede venir "colapsada" (solo el cursor, sin texto
      // resaltado) y aun así se puede formatear -lo que se escriba después sale con ese
      // formato-, así que ya no se exige que haya texto seleccionado.
      const activo = document.activeElement as HTMLElement | null;
      const contenedor = contenedorRef.current;
      const seleccion = window.getSelection();
      if (!activo || !activo.isContentEditable || !contenedor || !contenedor.contains(activo) || !seleccion || seleccion.rangeCount === 0) {
        setVisible(false);
        return;
      }

      const rango = seleccion.getRangeAt(0);
      const rect = rango.getBoundingClientRect();
      // Con el cursor colapsado (sin selección) el rect puede salir en 0,0,0,0 en
      // algunos casos (ej. campo recién enfocado y todavía vacío); en ese caso se usa el
      // rect del propio elemento enfocado como respaldo para no ocultar la barra.
      const rectPosicion = (rect.width === 0 && rect.height === 0) ? activo.getBoundingClientRect() : rect;

      rangoGuardado.current = rango.cloneRange();
      setPosicion({ top: rectPosicion.top + window.scrollY - 46, left: rectPosicion.left + window.scrollX + rectPosicion.width / 2 });
      setNegritaActiva(document.queryCommandState('bold'));
      setCursivaActiva(document.queryCommandState('italic'));
      setVisible(true);
    };

    document.addEventListener('selectionchange', alCambiarSeleccion);
    return () => document.removeEventListener('selectionchange', alCambiarSeleccion);
  }, [contenedorRef]);

  // Restaura la selección guardada antes de aplicar el comando: hace falta porque abrir
  // el <select> de fuente le quita el foco al texto seleccionado (los botones, en
  // cambio, usan onMouseDown+preventDefault para nunca perder la selección).
  const aplicar = (comando: string, valor?: string) => {
    const seleccion = window.getSelection();
    if (seleccion && rangoGuardado.current) {
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

  if (!visible) return null;

  return (
    <div
      ref={barraRef}
      className="pdf-ocultar fixed z-[100] -translate-x-1/2 bg-brand-dark text-white shadow-lg flex items-center gap-1 p-1.5"
      style={{ top: posicion.top, left: posicion.left }}
    >
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => aplicar('bold')}
        title="Negrita"
        className={`p-1.5 hover:bg-slate-700 transition-colors ${negritaActiva ? 'bg-brand-blue' : ''}`}
      >
        <Bold size={14} />
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => aplicar('italic')}
        title="Cursiva"
        className={`p-1.5 hover:bg-slate-700 transition-colors ${cursivaActiva ? 'bg-brand-blue' : ''}`}
      >
        <Italic size={14} />
      </button>

      <div className="w-px h-5 bg-slate-600 mx-0.5" />

      {COLORES_TEXTO.map(c => (
        <button
          key={c.valor}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => aplicar('foreColor', c.valor)}
          title={`Color de letra: ${c.nombre}`}
          style={{ color: c.valor === 'inherit' ? '#ffffff' : c.valor }}
          className="w-5 h-5 text-sm font-black leading-none hover:bg-slate-700 transition-colors"
        >
          A
        </button>
      ))}

      <div className="w-px h-5 bg-slate-600 mx-0.5" />

      {COLORES_RESALTADO.map(c => (
        <button
          key={c.valor}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => aplicar('hiliteColor', c.valor)}
          title={c.nombre}
          className="w-5 h-5 border border-white/30"
          style={{ backgroundColor: c.valor }}
        />
      ))}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => aplicar('hiliteColor', 'transparent')}
        title="Quitar resaltado"
        className="p-1.5 hover:bg-slate-700 transition-colors"
      >
        <Highlighter size={14} className="opacity-50" />
      </button>

      <div className="w-px h-5 bg-slate-600 mx-0.5" />

      <select
        onChange={(e) => aplicar('fontName', e.target.value)}
        defaultValue=""
        title="Tipo de letra"
        className="bg-transparent text-xs outline-none cursor-pointer max-w-[110px]"
      >
        {FUENTES.map(f => (
          <option key={f.nombre} value={f.valor} className="text-brand-dark">{f.nombre}</option>
        ))}
      </select>
    </div>
  );
}
