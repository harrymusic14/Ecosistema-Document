import { ArrowLeft, Download, Loader2, Undo2, Redo2 } from 'lucide-react';

interface BarraControlesProps {
  onVolver: () => void;
  onDownload: () => void;
  generando?: boolean; // Añadimos la propiedad para saber si está cargando
  onDeshacer: () => void;
  onRehacer: () => void;
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
}

export default function BarraControles({ onVolver, onDownload, generando = false, onDeshacer, onRehacer, puedeDeshacer, puedeRehacer }: BarraControlesProps) {
  return (
    <div className="w-full bg-white border-b border-slate-300 shadow-sm px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 print:hidden sticky top-0 z-50">

      <div className="flex flex-col">
        <h2 className="text-sm font-bold text-brand-dark m-0 uppercase tracking-tight">Vista Previa</h2>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Listo para exportar</span>
      </div>

      <div className="flex items-center gap-3 w-full sm:w-auto">
        <button
          onClick={onDeshacer}
          disabled={generando || !puedeDeshacer}
          title="Deshacer (Ctrl+Z)"
          className="p-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors border border-slate-300 disabled:opacity-40 disabled:pointer-events-none"
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={onRehacer}
          disabled={generando || !puedeRehacer}
          title="Rehacer (Ctrl+Y)"
          className="p-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors border border-slate-300 disabled:opacity-40 disabled:pointer-events-none"
        >
          <Redo2 size={16} />
        </button>
        <button
          onClick={onVolver}
          disabled={generando}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-colors border border-slate-300 disabled:opacity-50"
        >
          <ArrowLeft size={16} /> Cerrar
        </button>

        <button
          onClick={onDownload}
          disabled={generando}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-brand-blue text-white font-bold text-xs uppercase tracking-wider hover:bg-sky-600 transition-all shadow-md hover:shadow-lg active:scale-95 disabled:opacity-70 disabled:pointer-events-none"
        >
          {generando ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Generando...
            </>
          ) : (
            <>
              <Download size={16} /> Descargar PDF
            </>
          )}
        </button>
      </div>
    </div>
  );
}