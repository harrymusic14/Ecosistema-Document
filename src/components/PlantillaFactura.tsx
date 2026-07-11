// src/components/PlantillaFactura.tsx
import logo from '../assets/logo.png'; 

interface PlantillaFacturaProps {
  contenidoProcesado: string;
  cuentaBancaria: string;
  tipoDocumento: string;
}

export default function PlantillaFactura({ contenidoProcesado, cuentaBancaria, tipoDocumento }: PlantillaFacturaProps) {
  return (
    <div className="w-full max-w-[210mm] mx-auto my-8 shadow-2xl bg-white">
      
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

        <section
          className="flex-1 mt-2 [&_p]:mb-1.5 last:[&_p]:mb-0 [&_p]:uppercase [&_p]:font-medium [&_p]:leading-relaxed"
          dangerouslySetInnerHTML={{ __html: contenidoProcesado }}
        />

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