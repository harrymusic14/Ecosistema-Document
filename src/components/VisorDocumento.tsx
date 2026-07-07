// src/components/VisorDocumento.tsx
import { useState } from 'react';
import BarraControles from './BarraControles';
import PlantillaFactura from './PlantillaFactura';
import { procesarFacturacion } from '../utils/procesadorWord';
import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';

interface VisorProps {
  contenidoWord: string;
  onVolver: () => void;
  tipoDocumento: string;
}

export default function VisorDocumento({ contenidoWord, onVolver, tipoDocumento }: VisorProps) {
  const [generando, setGenerando] = useState(false);

  const { html: contenidoFinal, cliente, cuentaBancaria } = procesarFacturacion(contenidoWord);

  const handleDownloadPDF = async () => {
    const element = document.getElementById('documento-a4');
    if (!element) return;

    setGenerando(true);

    const nombreLimpio = cliente.replace(/[^a-zA-Z0-9 ñÑ]/g, '').trim() || 'Documento';

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        scrollY: 0,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.98);

      const pdf = new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // Tolerancia para ignorar sobrantes mínimos (redondeo de escala/renderizado, o el
      // padding inferior del documento en PlantillaFactura.tsx, p-[15mm]) que de otro
      // modo generarían una segunda hoja en blanco aunque el contenido real quepa en una.
      const TOLERANCIA_MM = 15;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > TOLERANCIA_MM) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`${nombreLimpio}.pdf`);
    } catch (error) {
      console.error('Error al generar PDF:', error);
      alert('Error al procesar el PDF. Verifica que el archivo no contenga imágenes o formatos inusuales.');
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="w-full flex flex-col bg-slate-200 min-h-screen">
      <BarraControles
        onVolver={onVolver}
        onDownload={handleDownloadPDF}
        generando={generando}
      />
      <div className="w-full flex justify-center pb-12 pt-4 px-4 overflow-y-auto">
        <PlantillaFactura
          contenidoProcesado={contenidoFinal}
          cuentaBancaria={cuentaBancaria}
          tipoDocumento={tipoDocumento}
        />
      </div>
    </div>
  );
}