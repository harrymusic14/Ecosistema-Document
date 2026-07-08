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

    const pdf = new jsPDF({
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait',
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // 1mm = 96/25.4 px, la equivalencia estándar que usan los navegadores para CSS.
    const PX_POR_MM = 96 / 25.4;
    const raiz = document.documentElement;
    const fontSizeOriginal = raiz.style.fontSize;

    const medirAltoMm = () => element.getBoundingClientRect().height / PX_POR_MM;

    try {
      // El ancho de la hoja (max-w-[210mm]) y su relleno (p-[15mm]) están en milímetros
      // fijos y no cambian, pero el tamaño de letra y los espaciados internos (Tailwind)
      // están en rem, relativos al tamaño de fuente raíz. Reduciendo ese tamaño raíz -y
      // solo si hace falta- el contenido se compacta y usa menos alto sin angostar la
      // hoja ni dejar márgenes en blanco a los costados, igual que "ajustar a una
      // página" en Word: si todo el documento cabía en una hoja en el original (aunque
      // la letra sea chica), debe seguir cabiendo en una sola hoja aquí.
      raiz.style.fontSize = '';
      void element.offsetHeight;
      const altoNatural = medirAltoMm();
      const paginasNaturales = Math.max(1, Math.ceil(altoNatural / pageHeight));

      const ESCALA_MINIMA = 0.5;
      let escalaElegida = 1;
      let paginasObjetivo = paginasNaturales;

      for (let candidata = 1; candidata < paginasNaturales; candidata++) {
        const altoObjetivo = candidata * pageHeight;
        let lo = ESCALA_MINIMA;
        let hi = 1;
        let logrado = false;

        for (let iter = 0; iter < 8; iter++) {
          const mid = (lo + hi) / 2;
          raiz.style.fontSize = `${mid * 100}%`;
          void element.offsetHeight;
          if (medirAltoMm() > altoObjetivo) {
            hi = mid;
          } else {
            lo = mid;
            logrado = true;
          }
        }

        if (logrado) {
          escalaElegida = lo;
          paginasObjetivo = candidata;
          break;
        }
      }

      raiz.style.fontSize = paginasObjetivo === paginasNaturales ? '' : `${escalaElegida * 100}%`;
      void element.offsetHeight;

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        scrollY: 0,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.98);

      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0.5) {
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
      raiz.style.fontSize = fontSizeOriginal;
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