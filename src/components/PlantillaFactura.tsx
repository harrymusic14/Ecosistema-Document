// src/components/PlantillaFactura.tsx
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { X, Plus, FilePlus2, FileMinus2 } from 'lucide-react';
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
  onAgregarHoja: () => void;
  onQuitarHoja: () => void;
  puedeQuitarHoja: boolean;
}

// Celda de texto: editable en la vista real (contentEditable, onBlur confirma el
// cambio) o de solo lectura en el clon de medición (mismo className, así el ancho/
// wrap sale idéntico al real, pero sin exponer un segundo campo editable duplicado).
// No se vuelve a controlar el valor desde React en cada tecla -solo al salir del
// campo- porque contentEditable y el children controlado de React no se llevan bien
// mezclados: reescribir el contenido en cada tecla le rompería el cursor al usuario.
function Celda({ className, html, onCommit, editable }: { className: string; html: string; onCommit?: (html: string) => void; editable: boolean }) {
  if (!editable) {
    return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return (
    <div
      className={className}
      contentEditable
      suppressContentEditableWarning
      dangerouslySetInnerHTML={{ __html: html }}
      onBlur={(e) => onCommit?.(e.currentTarget.innerHTML)}
    />
  );
}

// Ancho real del contenido de una hoja: 210mm de hoja A4 menos 15mm de margen a cada
// lado (ver p-[15mm] en cada <article>). El clon de medición se fija a este mismo
// ancho para que el texto envuelva (wrap) exactamente igual que en la hoja visible.
const ANCHO_CONTENIDO_MM = 210 - 15 * 2;
const PX_POR_MM = 96 / 25.4;
const ALTO_PAGINA_MM = 297;
const MARGEN_MM = 15;
const ALTO_CONTENIDO_PX = (ALTO_PAGINA_MM - MARGEN_MM * 2) * PX_POR_MM;

export default function PlantillaFactura({
  estado, cuentaBancaria, tieneIgv, subtotalTexto, igvTexto, esMultiOpcion, tipoDocumento, contenedorRef,
  onCambiarCliente, onCambiarFecha, onCambiarCantidad, onCambiarTotal, onCambiarIntroduccion,
  onCambiarFila, onAgregarFila, onQuitarFila, onAgregarHoja, onQuitarHoja, puedeQuitarHoja,
}: PlantillaFacturaProps) {
  const filas: FilaDocumento[] = estado.filas;

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
        <th className="p-3 border border-slate-700 w-16 text-center">Cant.</th>
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
    opciones: { editable: boolean; primeraFilaDePagina: boolean; mostrarValorCantidad: boolean; filasEnEstaPagina: number; refCallback?: (el: HTMLTableRowElement | null) => void },
  ) => {
    const { editable, primeraFilaDePagina, mostrarValorCantidad, filasEnEstaPagina, refCallback } = opciones;
    return (
      <tr key={fila.id} ref={refCallback} className="relative border-b border-slate-300 print-avoid-break">
        {primeraFilaDePagina && (
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
              <Celda className="py-1 px-4 outline-none focus:bg-sky-50" html={fila.html} onCommit={(html) => onCambiarFila(fila.id, 'html', html)} editable={editable} />
            </td>
            <td className={`p-0 text-center text-sm text-slate-900 align-top${fila.precioNegrita ? ' font-bold' : ''}`}>
              <Celda className="py-1 px-4 outline-none focus:bg-sky-50" html={fila.precio} onCommit={(html) => onCambiarFila(fila.id, 'precio', html)} editable={editable} />
            </td>
          </>
        )}
        {editable && (
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
  const prefijoCompletoRef = useRef<HTMLDivElement>(null);
  const prefijoLigeroRef = useRef<HTMLDivElement>(null);
  const cierreRef = useRef<HTMLDivElement>(null);
  const filaRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  const [paginas, setPaginas] = useState<FilaDocumento[][]>(() => [filas]);

  useLayoutEffect(() => {
    const altoPrefijoCompleto = prefijoCompletoRef.current?.getBoundingClientRect().height ?? 0;
    const altoPrefijoLigero = prefijoLigeroRef.current?.getBoundingClientRect().height ?? 0;
    const altoCierre = cierreRef.current?.getBoundingClientRect().height ?? 0;
    const alturaFila = (fila: FilaDocumento) => filaRefs.current.get(fila.id)?.getBoundingClientRect().height ?? 0;

    const grupos: FilaDocumento[][] = [];
    let grupoActual: FilaDocumento[] = [];
    let presupuesto = ALTO_CONTENIDO_PX - altoPrefijoCompleto;

    filas.forEach((fila) => {
      const altura = alturaFila(fila);
      const esPrimeraDeLaHoja = grupoActual.length === 0;
      const debeSaltar = !!fila.saltoPaginaAntes && !esPrimeraDeLaHoja;
      const noCabe = !esPrimeraDeLaHoja && altura > presupuesto;

      if (debeSaltar || noCabe) {
        grupos.push(grupoActual);
        grupoActual = [];
        presupuesto = ALTO_CONTENIDO_PX - altoPrefijoLigero;
      }

      grupoActual.push(fila);
      presupuesto -= altura;
    });
    grupos.push(grupoActual);

    // La última hoja además tiene que alcanzar para totales+cuenta+pie: si las filas
    // que ya tiene no dejan sitio, el cierre se manda a una hoja nueva propia -vacía de
    // filas- en vez de sacarle filas una por una a la última (eso no ayuda: quitarle
    // una fila a una hoja que de por sí ya no alcanza para el cierre no cambia si el
    // cierre entra o no, solo movía el problema sin resolverlo).
    const esUnicaHoja = grupos.length === 1;
    const presupuestoUltima = ALTO_CONTENIDO_PX - (esUnicaHoja ? altoPrefijoCompleto : altoPrefijoLigero);
    const ultima = grupos[grupos.length - 1];
    const altoFilasUltima = ultima.reduce((acc, f) => acc + alturaFila(f), 0);
    if (altoFilasUltima + altoCierre > presupuestoUltima) {
      grupos.push([]);
    }

    setPaginas(grupos);
  }, [filas, estado.cliente, estado.fecha, estado.introduccion, estado.cantidad, estado.total, tieneIgv, esMultiOpcion, cuentaBancaria, subtotalTexto, igvTexto, tipoDocumento]);

  return (
    <div ref={contenedorRef} className="w-full max-w-[210mm] mx-auto my-8">
      {/* Clon de medición: mismo ancho de contenido que una hoja real, invisible y
          fuera del flujo, usado solo para leer alturas reales antes de paginar. */}
      <div
        aria-hidden="true"
        style={{ position: 'absolute', top: 0, left: '-9999px', width: `${ANCHO_CONTENIDO_MM}mm`, visibility: 'hidden', pointerEvents: 'none' }}
      >
        <div ref={prefijoCompletoRef}>
          {renderEncabezadoCompleto(false)}
          <table className="w-full border-collapse">{renderCabeceraTabla()}</table>
        </div>
        <div ref={prefijoLigeroRef}>
          {renderEncabezadoLigero()}
          <table className="w-full border-collapse">{renderCabeceraTabla()}</table>
        </div>
        {filas.map((fila) => (
          <table key={fila.id} className="w-full border-collapse table-fixed">
            <colgroup>
              <col className="w-16" />
              <col />
              <col className="w-32" />
            </colgroup>
            <tbody>
              {renderFila(fila, {
                editable: false,
                primeraFilaDePagina: true,
                mostrarValorCantidad: false,
                filasEnEstaPagina: 1,
                refCallback: (el) => { if (el) filaRefs.current.set(fila.id, el); },
              })}
            </tbody>
          </table>
        ))}
        <div ref={cierreRef} className="flex flex-col">
          {renderTotales(false)}
          {renderPieYCuenta()}
        </div>
      </div>

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
                  <table className="w-full text-left border-collapse border border-slate-300 mb-0">
                    {renderCabeceraTabla()}
                    <tbody className="text-slate-800 bg-white">
                      {filasDePagina.map((fila, idx) =>
                        renderFila(fila, {
                          editable: true,
                          primeraFilaDePagina: idx === 0,
                          mostrarValorCantidad: idx === 0 && esPrimeraPagina,
                          filasEnEstaPagina: filasDePagina.length,
                        }),
                      )}
                    </tbody>
                  </table>
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
                  </div>
                )}

                {esUltimaPagina && renderTotales(true)}
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
