// src/components/PlantillaFactura.tsx
import type { RefObject } from 'react';
import { X, Plus } from 'lucide-react';
import logo from '../assets/logo.png';
import type { FilaDocumento } from '../utils/procesadorWord';
import type { EstadoDocumento } from './VisorDocumento';

interface PlantillaFacturaProps {
  estado: EstadoDocumento;
  cuentaBancaria: string;
  tieneIgv: boolean;
  subtotalTexto: string;
  igvTexto: string;
  tipoDocumento: string;
  contenedorRef: RefObject<HTMLDivElement | null>;
  onCambiarCliente: (html: string) => void;
  onCambiarFecha: (html: string) => void;
  onCambiarCantidad: (html: string) => void;
  onCambiarTotal: (html: string) => void;
  onCambiarFila: (id: string, campo: 'html' | 'precio', valor: string) => void;
  onAgregarFila: () => void;
  onQuitarFila: (id: string) => void;
}

// Celda de texto editable directamente sobre la vista previa (cliente, fecha, precios,
// total). No se vuelve a controlar el valor desde React en cada tecla -solo al salir
// del campo (onBlur)- porque contentEditable y el children controlado de React no se
// llevan bien mezclados: reescribir el contenido en cada tecla le rompería el cursor al
// usuario. Mientras se escribe, lo que hay en el DOM es lo que html2canvas capturará si
// se descarga el PDF en ese momento (igual que antes).
function CeldaEditable({ className, html, onCommit }: { className: string; html: string; onCommit: (html: string) => void }) {
  return (
    <div
      className={className}
      contentEditable
      suppressContentEditableWarning
      dangerouslySetInnerHTML={{ __html: html }}
      onBlur={(e) => onCommit(e.currentTarget.innerHTML)}
    />
  );
}

export default function PlantillaFactura({
  estado, cuentaBancaria, tieneIgv, subtotalTexto, igvTexto, tipoDocumento, contenedorRef,
  onCambiarCliente, onCambiarFecha, onCambiarCantidad, onCambiarTotal, onCambiarFila, onAgregarFila, onQuitarFila,
}: PlantillaFacturaProps) {
  const filas: FilaDocumento[] = estado.filas;

  return (
    <div ref={contenedorRef} className="w-full max-w-[210mm] mx-auto my-8 shadow-2xl bg-white">

      <article
        id="documento-a4"
        className="w-full bg-white flex flex-col min-h-[290mm] p-[15mm] box-border"
      >

        <header className="flex flex-col sm:flex-row justify-between items-start mb-8 gap-4">
          <div className="flex flex-col items-center sm:items-start flex-1 text-center sm:text-left overflow-hidden">

            <img src={logo} alt="Logo ECO-SISTEMA" className="w-24 h-24 object-contain mb-3" />

            <h1 className="text-[26px] font-black text-brand-dark m-0 uppercase tracking-tighter mb-2 whitespace-nowrap">
              ECO SISTEMAS URH S.A.C.
            </h1>

            <p className="text-xs font-bold text-slate-700 uppercase">Mz A LT 9 A.V NUEVAGALES CIENEGUILLA</p>
            <p className="text-xs font-bold text-slate-700 uppercase mt-0.5">Telf: 998270102 – 985832096</p>
            <p className="text-xs font-bold text-brand-blue lowercase mt-0.5 mb-3">e-mail: ecosistemas_urh_sac@hotmail.com</p>

            <p className="text-[11px] font-bold text-slate-500 uppercase w-full max-w-[400px] border-t border-slate-300 pt-2">
            </p>
          </div>

          <div className="border-[2px] border-brand-dark w-full sm:w-64 text-center bg-white flex flex-col shrink-0 mt-4 sm:mt-0">
            <div className="p-3 border-b-[2px] border-brand-dark bg-slate-50">
              <h2 className="text-lg font-black tracking-widest m-0 text-brand-dark">R.U.C. N° 20502059751</h2>
            </div>
            <div className="py-3 bg-brand-dark text-white">
              <h2 className="text-base font-bold tracking-widest uppercase m-0">{tipoDocumento}</h2>
            </div>
          </div>
        </header>

        <div className="flex-1 mt-2">
          <div className="grid grid-cols-[130px_1fr] border border-slate-300 overflow-hidden mb-5">
            <div className="bg-slate-100 p-2.5 text-xs font-bold uppercase text-slate-700 border-r border-slate-300 flex items-center">Señor(es):</div>
            <CeldaEditable className="p-2.5 text-sm font-bold text-slate-900 outline-none focus:bg-sky-50" html={estado.cliente} onCommit={onCambiarCliente} />
            <div className="bg-slate-100 p-2.5 text-xs font-bold uppercase text-slate-700 border-r border-t border-slate-300 flex items-center">Fecha:</div>
            <CeldaEditable className="p-2.5 text-sm font-bold uppercase text-slate-900 border-t border-slate-300 outline-none focus:bg-sky-50" html={estado.fecha} onCommit={onCambiarFecha} />
          </div>

          {/* "relative" para poder anclar el botón de quitar fila FUERA del borde derecho
              de la tabla (ver más abajo), sin agregarle una columna propia. */}
          <div className="relative">
            <table className="w-full text-left border-collapse border border-slate-300 mb-0">
              <thead className="bg-brand-dark text-white text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-3 border border-slate-700 w-16 text-center">Cant.</th>
                  <th className="p-3 border border-slate-700">Descripción</th>
                  <th className="p-3 border border-slate-700 w-32 text-center">Precio</th>
                  <th className="pdf-ocultar w-0 p-0 border-none" />
                </tr>
              </thead>
              <tbody className="text-slate-800 bg-white">
                {filas.map((fila, idx) => (
                  <tr key={fila.id} className="relative border-b border-slate-300 print-avoid-break">
                    {idx === 0 && (
                      <td className="p-0 text-center font-bold text-sm border-r border-slate-300 align-top" rowSpan={filas.length}>
                        <CeldaEditable
                          className="py-1 px-4 outline-none focus:bg-sky-50"
                          html={estado.cantidad}
                          onCommit={onCambiarCantidad}
                        />
                      </td>
                    )}
                    <td className="p-0 text-xs uppercase border-r border-slate-300 align-top leading-relaxed">
                      <CeldaEditable
                        className="py-1 px-4 outline-none focus:bg-sky-50"
                        html={fila.html}
                        onCommit={(html) => onCambiarFila(fila.id, 'html', html)}
                      />
                    </td>
                    <td className={`p-0 text-center text-sm text-slate-900 align-top${fila.precioNegrita ? ' font-bold' : ''}`}>
                      <CeldaEditable
                        className="py-1 px-4 outline-none focus:bg-sky-50"
                        html={fila.precio}
                        onCommit={(html) => onCambiarFila(fila.id, 'precio', html)}
                      />
                    </td>
                    {/* Botón de quitar fila: vive FUERA del área con bordes de la tabla
                        (a la derecha de su borde), centrado sobre esta fila. */}
                    <td className="pdf-ocultar w-0 p-0 border-none">
                      <button
                        type="button"
                        onClick={() => onQuitarFila(fila.id)}
                        title="Quitar fila"
                        className="absolute -right-7 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-600 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={onAgregarFila}
            className="pdf-ocultar mt-2 flex items-center gap-1 text-xs font-bold text-brand-blue hover:text-sky-700 uppercase tracking-wide"
          >
            <Plus size={14} /> Agregar fila
          </button>

          <div className="flex justify-end mt-4 mb-4 print-avoid-break">
            <table className="w-72 text-right border-collapse border border-slate-300 shadow-sm overflow-hidden">
              <tbody>
                {tieneIgv && (
                  <>
                    <tr className="border-b border-slate-300 bg-slate-50">
                      <td className="p-2 text-xs font-bold text-slate-600 uppercase border-r border-slate-300 tracking-wider">Subtotal</td>
                      <td className="p-2 text-sm font-bold text-slate-900 w-32">{subtotalTexto}</td>
                    </tr>
                    <tr className="border-b border-slate-300 bg-slate-50">
                      <td className="p-2 text-xs font-bold text-slate-600 uppercase border-r border-slate-300 tracking-wider">I.G.V. (18%)</td>
                      <td className="p-2 text-sm font-bold text-slate-900">{igvTexto}</td>
                    </tr>
                  </>
                )}
                <tr className="bg-brand-dark text-white">
                  <td className="p-3 text-xs font-bold uppercase border-r border-slate-700 tracking-widest">Total</td>
                  <td className="p-0 text-sm font-bold">
                    <CeldaEditable className="p-3 outline-none focus:bg-sky-900" html={estado.total} onCommit={onCambiarTotal} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Bloque de cuenta bancaria: fijo, justo encima del pie de página. Si no se
            eligió cuenta ("Ninguno"), no se renderiza nada -ni el div vacío- para no
            dejar un hueco en blanco antes del pie de página. */}
        {cuentaBancaria && (
          <div
            className="mt-6 mb-2 print-avoid-break"
            dangerouslySetInnerHTML={{ __html: cuentaBancaria }}
          />
        )}

        <footer className="mt-auto pt-4 text-center border-t-2 border-slate-300">
          <p className="text-[10px] font-bold text-slate-500 uppercase">Documento sujeto a verificación y aprobación final.</p>
          <p className="text-xs font-black text-brand-dark uppercase mt-1 tracking-widest">"GRACIAS POR SU PREFERENCIA"</p>
        </footer>
      </article>

    </div>
  );
}
