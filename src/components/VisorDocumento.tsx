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

// Espera a que las fuentes y todas las imágenes (ej. el logo) del elemento terminen de
// cargar. Sin esto, si el usuario descarga el PDF apenas se abre la vista, html2canvas
// puede capturar el logo a medio cargar. Con timeout por imagen para no colgarse si
// alguna falla en cargar.
async function esperarRecursosListos(element: HTMLElement) {
  if (document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* noop */ }
  }
  const imagenes = Array.from(element.querySelectorAll('img'));
  await Promise.all(imagenes.map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>(resolve => {
      const listo = () => resolve();
      img.addEventListener('load', listo, { once: true });
      img.addEventListener('error', listo, { once: true });
      setTimeout(listo, 3000);
    });
  }));
}

// Verifica que la captura sí haya salido con estilos: muestrea el centro del recuadro
// azul oscuro (bg-brand-dark) del encabezado -el primero que aparece en el documento- y
// comprueba que el canvas lo pintó oscuro. Si html2canvas clonó el documento sin la
// hoja de estilos (el bug que motivó este chequeo), ese recuadro sale blanco.
function capturaTieneEstilos(canvas: HTMLCanvasElement, element: HTMLElement): boolean {
  const insignia = element.querySelector<HTMLElement>('.bg-brand-dark');
  if (!insignia) return true;

  const elementoRect = element.getBoundingClientRect();
  const insigniaRect = insignia.getBoundingClientRect();
  if (elementoRect.width === 0 || elementoRect.height === 0) return true;

  const escalaX = canvas.width / elementoRect.width;
  const escalaY = canvas.height / elementoRect.height;
  const x = Math.round((insigniaRect.left - elementoRect.left + insigniaRect.width / 2) * escalaX);
  const y = Math.round((insigniaRect.top - elementoRect.top + insigniaRect.height / 2) * escalaY);

  const ctx = canvas.getContext('2d');
  if (!ctx || x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return true;

  const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
  // #0f172a (brand-dark) es un azul casi negro: si el pixel salió claro, no se aplicaron los estilos.
  return r < 100 && g < 100 && b < 100;
}

export default function VisorDocumento({ contenidoWord, onVolver, tipoDocumento }: VisorProps) {
  const [generando, setGenerando] = useState(false);

  const { html: contenidoFinal, cliente, cuentaBancaria } = procesarFacturacion(contenidoWord);

  const handleDownloadPDF = async () => {
    const element = document.getElementById('documento-a4');
    if (!element) return;

    setGenerando(true);
    await esperarRecursosListos(element);

    // html2canvas-pro clona el documento en un iframe oculto y, al hacerlo, vuelve a
    // pedir por red la hoja de estilos (Tailwind). En la primera descarga tras cargar
    // la página esa segunda petición puede llegar antes de que el navegador termine de
    // cachearla, y la clonación sale sin estilos (como HTML plano), aunque la pantalla
    // se vea bien. Una captura de "calentamiento" descartable fuerza esa petición a
    // resolverse en caché antes de la captura real, evitando tener que reintentar.
    try {
      await html2canvas(element, { scale: 1, useCORS: true, backgroundColor: '#ffffff', scrollY: 0 });
    } catch { /* noop: si el calentamiento falla, seguimos con la captura real */ }

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

      // Reintenta la captura real si sale sin estilos (ver capturaTieneEstilos), en vez
      // de dejar que el usuario descargue un PDF roto y tenga que darse cuenta y volver
      // a intentarlo manualmente.
      let canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        scrollY: 0,
      });

      for (let intento = 0; intento < 2 && !capturaTieneEstilos(canvas, element); intento++) {
        canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          scrollY: 0,
        });
      }

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