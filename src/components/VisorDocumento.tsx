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

      // Tamaño natural del documento (ancho = hoja completa, alto proporcional al canvas).
      const anchoNatural = pageWidth;
      const altoNatural = (canvas.height * anchoNatural) / canvas.width;

      // Si el contenido se desborda solo un poco (p.ej. el bloque bancario o el pie de
      // página cayendo unos milímetros en una segunda hoja casi vacía), se reduce el
      // tamaño del documento completo para que quepa en una hoja menos, en vez de generar
      // esa hoja extra. Si de verdad hace falta más de una hoja (el contenido no entra ni
      // reduciéndolo de forma razonable), se respeta esa cantidad de hojas tal cual.
      const ESCALA_MINIMA = 0.75;
      const paginasNaturales = Math.max(1, Math.ceil(altoNatural / pageHeight));

      let paginasObjetivo = paginasNaturales;
      for (let candidata = 1; candidata < paginasNaturales; candidata++) {
        const escalaCandidata = (candidata * pageHeight) / altoNatural;
        if (escalaCandidata >= ESCALA_MINIMA) {
          paginasObjetivo = candidata;
          break;
        }
      }

      const escala = Math.min(1, (paginasObjetivo * pageHeight) / altoNatural);
      const imgWidth = anchoNatural * escala;
      const imgHeight = altoNatural * escala;
      const offsetX = (pageWidth - imgWidth) / 2;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', offsetX, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0.5) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', offsetX, position, imgWidth, imgHeight);
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