// src/components/VistaCarga.tsx
import { type ChangeEvent } from 'react';
import { UploadCloud, FileText, FilePlus2 } from 'lucide-react';
import type { TipoPago } from '../utils/procesadorWord';

interface VistaCargaProps {
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onCrearNueva: () => void;
  tipoDocumento: string;
  setTipoDocumento: (tipo: string) => void;
  tipoPago: TipoPago;
  setTipoPago: (tipo: TipoPago) => void;
}

export default function VistaCarga({ onFileUpload, onCrearNueva, tipoDocumento, setTipoDocumento, tipoPago, setTipoPago }: VistaCargaProps) {
  return (
    <div className="w-full max-w-lg bg-white shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-500 border border-slate-300">
      <div className="bg-brand-dark px-6 py-4 flex items-center justify-between border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="bg-brand-blue/20 p-2">
            <FileText size={20} className="text-brand-blue" />
          </div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider m-0">Generador de Documentos</h2>
        </div>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-2 py-1 bg-slate-800">ECO-SISTEMA</span>
      </div>
      
      <div className="p-10 flex flex-col items-center text-center">
        <div className="w-24 h-24 bg-slate-50 flex items-center justify-center mb-6 border border-slate-200 shadow-sm">
          <UploadCloud size={40} className="text-brand-blue" />
        </div>
        
        <h3 className="text-xl font-extrabold text-brand-dark mb-6 uppercase tracking-tight">Importar Datos</h3>
        
        {/* SELECTOR DE TIPO DE DOCUMENTO */}
        <div className="w-full max-w-xs mb-6 text-left">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">1. Selecciona el Tipo:</label>
          <select 
            value={tipoDocumento}
            onChange={(e) => setTipoDocumento(e.target.value)}
            className="w-full p-3 border border-slate-300 bg-slate-50 text-brand-dark font-bold uppercase text-xs outline-none focus:border-brand-blue transition-colors cursor-pointer"
          >
            <option value="COTIZACIÓN">Cotización</option>
            <option value="LIQUIDACIÓN DE SERVICIO">Liquidación de Servicio</option>
            <option value="ESTADO DE CUENTA">Estado de Cuenta</option>
          </select>
        </div>

        {/* SELECTOR DE CUENTA BANCARIA */}
        <div className="w-full max-w-xs mb-6 text-left">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">2. Selecciona la Cuenta Bancaria:</label>
          <select
            value={tipoPago}
            onChange={(e) => setTipoPago(e.target.value as TipoPago)}
            className="w-full p-3 border border-slate-300 bg-slate-50 text-brand-dark font-bold uppercase text-xs outline-none focus:border-brand-blue transition-colors cursor-pointer"
          >
            <option value="BCP">BCP (Soles)</option>
            <option value="SCOTIABANK">Scotiabank (Dólares)</option>
            <option value="NINGUNO">Ninguno</option>
          </select>
        </div>

        <p className="text-sm text-slate-500 mb-6 max-w-xs leading-relaxed">
          3. Sube tu documento Word (.docx) para generar la estructura.
        </p>

        <label className="w-full max-w-xs relative group cursor-pointer flex items-center justify-center gap-2 bg-brand-blue text-white px-6 py-4 font-bold text-sm uppercase tracking-wider hover:bg-sky-600 transition-all duration-200 border border-transparent">
          Seleccionar Archivo
          <input
            type="file"
            accept=".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
            onChange={onFileUpload}
            onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </label>

        <div className="w-full max-w-xs flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">o</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <button
          type="button"
          onClick={onCrearNueva}
          className="w-full max-w-xs flex items-center justify-center gap-2 bg-white text-brand-dark px-6 py-4 font-bold text-sm uppercase tracking-wider hover:bg-slate-50 transition-all duration-200 border border-slate-300"
        >
          <FilePlus2 size={18} />
          Crear Plantilla en Blanco
        </button>
      </div>
    </div>
  );
}