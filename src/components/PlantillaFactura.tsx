// src/components/PlantillaFactura.tsx
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { X, Plus, FilePlus2, FileMinus2, ChevronUp, ChevronDown, Hash } from 'lucide-react';
import logo from '../assets/logo.png';
import type { FilaDocumento } from '../utils/procesadorWord';
import type { EstadoDocumento } from './VisorDocumento';

interface PlantillaFacturaProps {
  estado: EstadoDocumento;
  cuentaBancaria: string;
  tieneIgv: boolean;
  subtotalTexto: string;
  igvTexto: string;
  esMultiOpcion: boolean;
  tipoDocumento: string;
  contenedorRef: RefObject<HTMLDivElement | null>;
  onCambiarCliente: (html: string) => void;
  onCambiarFecha: (html: string) => void;
  onCambiarCantidad: (html: string) => void;
  onCambiarTotal: (html: string) => void;
  onCambiarIntroduccion: (html: string) => void;
  onCambiarFila: (id: string, campo: 'html' | 'precio', valor: string) => void;
  onAgregarFila: () => void;
  onQuitarFila: (id: string) => void;
  onMoverFila: (id: string, direccion: 'arriba' | 'abajo') => void;
  onInsertarFilaDespues: (id: string) => void;
  onAgregarHoja: () => void;
  onQuitarHoja: () => void;
  puedeQuitarHoja: boolean;
  onAlternarColumnaCantidad: () => void;
}

// Celda de texto: editable en la vista real (contentEditable, onBlur confirma el
// cambio) o de solo lectura en el clon de medición (mismo className, así el ancho/
// wrap sale idéntico al real, pero sin exponer un segundo campo editable duplicado).
// No se vuelve a controlar el valor desde React en cada tecla -solo al salir del
// campo- porque contentEditable y el children controlado de React no se llevan bien
// mezclados: reescribir el contenido en cada tecla le rompería el cursor al usuario.
function Celda({ className, html, onCommit, editable, onKeyDown, celdaRef }: {
  className: string;
  html: string;
  onCommit?: (html: string) => void;
  editable: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  celdaRef?: (el: HTMLDivElement | null) => void;
}) {
  if (!editable) {
    return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return (
    <div
      ref={celdaRef}
      className={className}
      contentEditable
      suppressContentEditableWarning
      dangerouslySetInnerHTML={{ __html: html }}
      onBlur={(e) => onCommit?.(e.currentTarget.innerHTML)}
      onKeyDown={onKeyDown}
    />
  );
}

export default function PlantillaFactura({
  estado, cuentaBancaria, tieneIgv, subtotalTexto, igvTexto, esMultiOpcion, tipoDocumento, contenedorRef,
  onCambiarCliente, onCambiarFecha, onCambiarCantidad, onCambiarTotal, onCambiarIntroduccion,
  onCambiarFila, onAgregarFila, onQuitarFila, onMoverFila, onInsertarFilaDespues, onAgregarHoja, onQuitarHoja,
  puedeQuitarHoja, onAlternarColumnaCantidad,
}: PlantillaFacturaProps) {
  const filas: FilaDocumento[] = estado.filas;
  const mostrarColumnaCantidad = estado.mostrarColumnaCantidad;

  // Enter en la celda de Descripción inserta una fila nueva justo después (empujando
  // el resto hacia abajo), en vez de solo permitir agregar filas al final del
  // documento -tal como Word: al presionar Enter dentro de un párrafo, lo que sigue se
  // corre para abajo. Shift+Enter sigue haciendo un salto de línea normal DENTRO de la
  // misma celda (no se intercepta), para no perder esa opción de edición.
  // idParaEnfocarTrasInsertar guarda el id de la fila que se acaba de escribir (la que
  // "empuja"); en el próximo render, si esa fila ya no es la última, la fila
  // inmediatamente después es la nueva -recién creada por VisorDocumento con un id que
  // este componente no conoce de antemano- y se le pasa el foco automáticamente.
  const idParaEnfocarTrasInsertar = useRef<string | null>(null);
  const celdaDescripcionRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const manejarEnterEnDescripcion = (e: KeyboardEvent<HTMLDivElement>, filaId: string) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    idParaEnfocarTrasInsertar.current = filaId;
    onInsertarFilaDespues(filaId);
  };

  useEffect(() => {
    const idAnterior = idParaEnfocarTrasInsertar.current;
    if (!idAnterior) return;
    const idx = filas.findIndex(f => f.id === idAnterior);
    const nueva = idx !== -1 ? filas[idx + 1] : undefined;
    if (nueva) {
      celdaDescripcionRefs.current.get(nueva.id)?.focus();
    }
    idParaEnfocarTrasInsertar.current = null;
  }, [filas]);

  // ---------- Encabezado completo (solo hoja 1): logo, membrete, RUC, Señor(es)/Fecha
  // y el bloque fijo de presentación -editable, pero siempre presente en esa posición-.
  const renderEncabezadoCompleto = (editable: boolean) => (
    <>
      <header className="flex flex-col sm:flex-row justify-between items-start mb-8 gap-4">
        <div className="flex flex-col items-center sm:items-start flex-1 text-center sm:text-left overflow-hidden">
          <img src={logo} alt="Logo ECO-SISTEMA" className="w-24 h-24 object-contain mb-3" />
          <h1 className="text-[26px] font-black text-brand-dark m-0 uppercase tracking-tighter mb-2 whitespace-nowrap">
            ECO SISTEMAS URH S.A.C.
          </h1>
          <p className="text-xs font-bold text-slate-700 uppercase">Mz A LT 9 A.V NUEVAGALES CIENEGUILLA</p>
          <p className="text-xs font-bold text-slate-700 uppercase mt-0.5">Telf: 998270102 – 985832096</p>
          <p className="text-xs font-bold text-brand-blue lowercase mt-0.5 mb-3">e-mail: ecosistemas_urh_sac@hotmail.com</p>
          <p className="text-xs font-serif italic tracking-wide text-slate-500 w-full max-w-[400px] border-t border-slate-300 pt-2">
            "La mejor responsabilidad en ahorro de agua"
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

      <div className="grid grid-cols-[130px_1fr] border border-slate-300 overflow-hidden mb-5">
        <div className="bg-slate-100 p-2.5 text-xs font-bold uppercase text-slate-700 border-r border-slate-300 flex items-center">Señor(es):</div>
        <Celda className="p-2.5 text-sm font-bold text-slate-900 outline-none focus:bg-sky-50" html={estado.cliente} onCommit={onCambiarCliente} editable={editable} />
        <div className="bg-slate-100 p-2.5 text-xs font-bold uppercase text-slate-700 border-r border-t border-slate-300 flex items-center">Fecha:</div>
        <Celda className="p-2.5 text-sm font-bold uppercase text-slate-900 border-t border-slate-300 outline-none focus:bg-sky-50" html={estado.fecha} onCommit={onCambiarFecha} editable={editable} />
      </div>

      <Celda
        className="text-xs text-slate-800 leading-relaxed mb-5 [&_p]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 [&_ul]:list-disc [&_ul]:pl-5 outline-none focus:bg-sky-50"
        html={estado.introduccion}
        onCommit={onCambiarIntroduccion}
        editable={editable}
      />
    </>
  );

  // ---------- Encabezado ligero (hojas 2+): franja de continuación, liviana a
  // propósito para dejar la mayor parte de la hoja libre para filas de la tabla.
  const renderEncabezadoLigero = () => (
    <div className="flex items-center justify-between border-b-2 border-slate-300 pb-2 mb-4">
      <span className="text-xs font-black text-brand-dark uppercase tracking-wide">ECO SISTEMAS URH S.A.C.</span>
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{tipoDocumento} (continuación)</span>
    </div>
  );

  const renderCabeceraTabla = () => (
    <thead className="bg-brand-dark text-white text-xs uppercase tracking-wider">
      <tr>
        {mostrarColumnaCantidad && <th className="p-3 border border-slate-700 w-16 text-center">Cant.</th>}
        <th className="p-3 border border-slate-700">Descripción</th>
        <th className="p-3 border border-slate-700 w-32 text-center">Precio</th>
        <th className="pdf-ocultar w-0 p-0 border-none" />
      </tr>
    </thead>
  );

  // primeraFilaDePagina: recibe el "td" de Cant. con rowSpan sobre el resto de filas
  // de ESA hoja (el rowSpan no cruza hojas -son <table> distintas-). mostrarValor solo
  // es true en la primerísima fila del documento entero: la cantidad es un único dato
  // global, no algo que se repita por hoja.
  const renderFila = (
    fila: FilaDocumento,
    opciones: {
      editable: boolean;
      primeraFilaDePagina: boolean;
      mostrarValorCantidad: boolean;
      filasEnEstaPagina: number;
      puedeSubir?: boolean;
      puedeBajar?: boolean;
      refCallback?: (el: HTMLTableRowElement | null) => void;
    },
  ) => {
    const { editable, primeraFilaDePagina, mostrarValorCantidad, filasEnEstaPagina, puedeSubir, puedeBajar, refCallback } = opciones;
    return (
      <tr key={fila.id} ref={refCallback} className="relative border-b border-slate-300 print-avoid-break">
        {mostrarColumnaCantidad && primeraFilaDePagina && (
          <td className="p-0 text-center font-bold text-sm border-r border-slate-300 align-top w-16" rowSpan={filasEnEstaPagina}>
            {mostrarValorCantidad && (
              <Celda className="py-1 px-4 outline-none focus:bg-sky-50" html={estado.cantidad} onCommit={onCambiarCantidad} editable={editable} />
            )}
          </td>
        )}
        {fila.esTotalOpcion ? (
          <td colSpan={2} className="p-0 bg-brand-dark text-white">
            <div className="flex items-center justify-between gap-4 py-2 px-4">
              <Celda className="text-xs font-bold uppercase tracking-widest outline-none focus:bg-sky-900" html={fila.html} onCommit={(html) => onCambiarFila(fila.id, 'html', html)} editable={editable} />
              <Celda className="text-sm font-bold outline-none focus:bg-sky-900 whitespace-nowrap" html={fila.precio} onCommit={(html) => onCambiarFila(fila.id, 'precio', html)} editable={editable} />
            </div>
          </td>
        ) : (
          <>
            <td className="p-0 text-xs uppercase border-r border-slate-300 align-top leading-relaxed">
              <Celda
                className="py-1 px-4 outline-none focus:bg-sky-50"
                html={fila.html}
                onCommit={(html) => onCambiarFila(fila.id, 'html', html)}
                editable={editable}
                onKeyDown={(e) => manejarEnterEnDescripcion(e, fila.id)}
                celdaRef={(el) => { if (el) celdaDescripcionRefs.current.set(fila.id, el); else celdaDescripcionRefs.current.delete(fila.id); }}
              />
            </td>
            <td className={`p-0 text-center text-sm text-slate-900 align-top${fila.precioNegrita ? ' font-bold' : ''}`}>
              <Celda className="py-1 px-4 outline-none focus:bg-sky-50" html={fila.precio} onCommit={(html) => onCambiarFila(fila.id, 'precio', html)} editable={editable} />
            </td>
          </>
        )}
        {editable && (
          <td className="pdf-ocultar w-0 p-0 border-none">
            <div className="absolute -right-7 top-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5">
              <button
                type="button"
                onClick={() => onMoverFila(fila.id, 'arriba')}
                disabled={!puedeSubir}
                title="Mover fila arriba"
                className="text-slate-400 hover:text-brand-blue transition-colors disabled:opacity-20 disabled:pointer-events-none"
              >
                <ChevronUp size={13} />
              </button>
              <button
                type="button"
                onClick={() => onQuitarFila(fila.id)}
                title="Quitar fila"
                className="text-slate-400 hover:text-red-600 transition-colors"
              >
                <X size={14} />
              </button>
              <button
                type="button"
                onClick={() => onMoverFila(fila.id, 'abajo')}
                disabled={!puedeBajar}
                title="Mover fila abajo"
                className="text-slate-400 hover:text-brand-blue transition-colors disabled:opacity-20 disabled:pointer-events-none"
              >
                <ChevronDown size={13} />
              </button>
            </div>
          </td>
        )}
      </tr>
    );
  };

  // Con varias opciones de precio, cada una ya trae su propia barra de total (dentro
  // de la tabla); un total general acá abajo no representaría ninguna y confundiría.
  // Va DENTRO del div que crece (flex-1) porque es parte del contenido de la tabla.
  const renderTotales = (editable: boolean) => (
    !esMultiOpcion && (
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
                <Celda className="p-3 outline-none focus:bg-sky-900" html={estado.total} onCommit={onCambiarTotal} editable={editable} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  );

  // Cuenta bancaria + pie de página: van FUERA del div que crece (flex-1), como
  // hermanos directos de la hoja (que sí es "flex flex-col"), para que el "mt-auto"
  // del pie los empuje al fondo real de la hoja sin importar cuánto contenido tenga
  // la tabla -si estuvieran anidados dentro del flex-1, "mt-auto" no tendría efecto
  // porque ese div no es, en sí mismo, un contenedor flex-.
  const renderPieYCuenta = () => (
    <>
      {/* Si no se eligió cuenta ("Ninguno"), no se renderiza nada -ni el div vacío- para
          no dejar un hueco en blanco antes del pie de página. */}
      {cuentaBancaria && (
        <div className="mt-6 mb-2 print-avoid-break" dangerouslySetInnerHTML={{ __html: cuentaBancaria }} />
      )}

      <footer className="mt-auto pt-4 text-center border-t-2 border-slate-300">
        <p className="text-[10px] font-bold text-slate-500 uppercase">Documento sujeto a verificación y aprobación final.</p>
        <p className="text-xs font-black text-brand-dark uppercase mt-1 tracking-widest">"GRACIAS POR SU PREFERENCIA"</p>
      </footer>
    </>
  );

  // ---------- Paginación real: se mide en un clon oculto (mismo ancho, sin editar) lo
  // que ocupa cada pieza -encabezado completo, encabezado liviano, cada fila, y el
  // cierre (totales+cuenta+pie)- y con esas alturas reales se reparten las filas entre
  // hojas de 297mm, exactamente como Word reparte una tabla larga entre páginas.
  const [paginas, setPaginas] = useState<FilaDocumento[][]>(() => [filas]);

  useLayoutEffect(() => {
    const grupos: FilaDocumento[][] = [];
    let grupoActual: FilaDocumento[] = [];

    filas.forEach((fila, index) => {
      const esPrimeraDeLaHoja = grupoActual.length === 0;
      const esPrimeraFilaDelDocumento = index === 0;
      
      let debeSaltar = false;
      if (fila.saltoPaginaAntes) {
        if (!esPrimeraDeLaHoja) {
          debeSaltar = true;
        } else if (esPrimeraFilaDelDocumento && estado.introduccion) {
          debeSaltar = true;
        }
      }

      if (debeSaltar) {
        grupos.push(grupoActual);
        grupoActual = [];
      }

      grupoActual.push(fila);
    });
    grupos.push(grupoActual);

    setPaginas(grupos);
  }, [filas, estado.cliente, estado.fecha, estado.introduccion, estado.cantidad, estado.total, tieneIgv, esMultiOpcion, cuentaBancaria, subtotalTexto, igvTexto, tipoDocumento]);

  const esPaginaTextoLibre = (filasDePagina: FilaDocumento[]) => {
    return filasDePagina.every(f => !f.precio.trim() && !f.esTotalOpcion);
  };

  let lastTablePageIndex = paginas.map(esPaginaTextoLibre).lastIndexOf(false);
  if (lastTablePageIndex === -1) {
    lastTablePageIndex = paginas.length - 1;
  }

  return (
    <div ref={contenedorRef} className="w-full max-w-[210mm] mx-auto my-8">

      {/* Hojas reales: id="documento-completo" en el contenedor y clase "hoja-a4" en
          cada hoja son lo que handleDownloadPDF (VisorDocumento) usa para capturar
          página por página al exportar el PDF. */}
      <div id="documento-completo" className="flex flex-col gap-8">
        {paginas.map((filasDePagina, indicePagina) => {
          const esPrimeraPagina = indicePagina === 0;
          const esUltimaPagina = indicePagina === paginas.length - 1;
          return (
            <article
              key={indicePagina}
              className="hoja-a4 w-full bg-white shadow-2xl flex flex-col min-h-[290mm] p-[15mm] box-border"
            >
              {esPrimeraPagina ? renderEncabezadoCompleto(true) : renderEncabezadoLigero()}

              <div className="flex-1 mt-2">
                <div className="relative">
                  {esPaginaTextoLibre(filasDePagina) ? (
                    <div className="flex flex-col">
                      {filasDePagina.map((fila) => {
                        const indiceGlobal = filas.indexOf(fila);
                        const puedeSubir = indiceGlobal > 0;
                        const puedeBajar = indiceGlobal < filas.length - 1;
                        return (
                          <div key={fila.id} className="relative group border-b border-transparent hover:border-slate-200 py-1 min-h-[1.5rem] print-avoid-break">
                            <Celda
                              className="outline-none focus:bg-sky-50 text-xs text-slate-800 leading-relaxed min-h-[1.5rem] break-words"
                              html={fila.html}
                              onCommit={(html) => onCambiarFila(fila.id, 'html', html)}
                              editable={true}
                              onKeyDown={(e) => manejarEnterEnDescripcion(e, fila.id)}
                              celdaRef={(el) => { if (el) celdaDescripcionRefs.current.set(fila.id, el); else celdaDescripcionRefs.current.delete(fila.id); }}
                            />
                            <div className="pdf-ocultar absolute -right-7 top-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => onMoverFila(fila.id, 'arriba')}
                                disabled={!puedeSubir}
                                title="Mover fila arriba"
                                className="text-slate-400 hover:text-brand-blue transition-colors disabled:opacity-20 disabled:pointer-events-none"
                              >
                                <ChevronUp size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => onQuitarFila(fila.id)}
                                title="Quitar fila"
                                className="text-slate-400 hover:text-red-600 transition-colors"
                              >
                                <X size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => onMoverFila(fila.id, 'abajo')}
                                disabled={!puedeBajar}
                                title="Mover fila abajo"
                                className="text-slate-400 hover:text-brand-blue transition-colors disabled:opacity-20 disabled:pointer-events-none"
                              >
                                <ChevronDown size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse border border-slate-300 mb-0">
                      {renderCabeceraTabla()}
                      <tbody className="text-slate-800 bg-white">
                        {filasDePagina.map((fila, idx) => {
                          const indiceGlobal = filas.indexOf(fila);
                          return renderFila(fila, {
                            editable: true,
                            primeraFilaDePagina: idx === 0,
                            mostrarValorCantidad: idx === 0 && esPrimeraPagina,
                            filasEnEstaPagina: filasDePagina.length,
                            puedeSubir: indiceGlobal > 0,
                            puedeBajar: indiceGlobal < filas.length - 1,
                          });
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {esUltimaPagina && (
                  <div className="flex items-center gap-4 mt-2 pdf-ocultar">
                    <button
                      type="button"
                      onClick={onAgregarFila}
                      className="flex items-center gap-1 text-xs font-bold text-brand-blue hover:text-sky-700 uppercase tracking-wide"
                    >
                      <Plus size={14} /> Agregar fila
                    </button>
                    <button
                      type="button"
                      onClick={onAgregarHoja}
                      className="flex items-center gap-1 text-xs font-bold text-brand-blue hover:text-sky-700 uppercase tracking-wide"
                    >
                      <FilePlus2 size={14} /> Agregar hoja
                    </button>
                    {puedeQuitarHoja && (
                      <button
                        type="button"
                        onClick={onQuitarHoja}
                        className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-red-600 uppercase tracking-wide"
                      >
                        <FileMinus2 size={14} /> Quitar hoja
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onAlternarColumnaCantidad}
                      className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-brand-blue uppercase tracking-wide"
                    >
                      <Hash size={14} /> {mostrarColumnaCantidad ? 'Quitar columna Cant.' : 'Mostrar columna Cant.'}
                    </button>
                  </div>
                )}

                {indicePagina === lastTablePageIndex && renderTotales(true)}
              </div>

              {esUltimaPagina ? (
                renderPieYCuenta()
              ) : (
                <p className="pdf-ocultar mt-auto pt-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Página {indicePagina + 1} de {paginas.length} — continúa
                </p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
