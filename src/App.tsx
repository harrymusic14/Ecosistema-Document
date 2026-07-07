// src/App.tsx
import { useState, type ChangeEvent } from 'react';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import WordExtractor from 'word-extractor';
import { Buffer } from 'buffer';
import VistaCarga from './components/VistaCarga';
import VisorDocumento from './components/VisorDocumento';
import { extractLegacyDocWithBold } from './utils/legacyDocBoldExtractor';

// Configure PDF.js worker (usa el worker incluido en el proyecto en vez de una CDN externa,
// que puede fallar por falta de conexión o desajuste de versión y hacía que el PDF no se leyera).
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function fallbackTextExtraction(buffer: ArrayBuffer): string {
    try {
        const decoder16 = new TextDecoder('utf-16le');
        const text16 = decoder16.decode(buffer);
        const unreadableRegex = /[^\w\sñÑáéíóúÁÉÍÓÚüÜ,.;:\-?!"'()$€£%@+=/*&#<>{}|~\[\]^]/g;
        
        const blacklist = new Set([
            'normal', 'título 1', 'título 2', 'título 3', 'título 4', 'título 5',
            'fuente de párrafo predeter.', 'tabla normal', 'sin lista', 'texto de globo',
            'hipervínculo', 'encabezado', 'encabezado car', 'pie de página', 'pie de página car',
            'párrafo de lista', 'times new roman', 'symbol', 'arial', 'avantgarde md bt',
            'century gothic', 'tahoma', 'calibri light', 'calibri', 'courier new', 'wingdings',
            'cambria math', 'archivos de programa', 'microsoft office', 'plantillas',
            'root entry', 'data', '0table', '1table', 'worddocument', 'summaryinformation',
            'documentsummaryinformation', 'msodatastore', 'item', 'properties', 'compobj', 'unknown'
        ]);

        const filterParagraphs = (parts: string[]) => {
            return parts.filter(p => {
                const t = p.trim();
                if (t.length < 3 && !/[0-9]/.test(t)) return false;
                if (/^[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ]+$/.test(t)) return false;
                if (blacklist.has(t.toLowerCase())) return false;
                if (t.toLowerCase().includes('.tmp') || t === 'Q==' || t === '1RIR') return false;
                return true;
            });
        };

        // En lugar de dividir por basura binaria, la reemplazamos por espacios
        // y luego dividimos por saltos de línea reales. Así no rompemos oraciones.
        let cleanText16 = text16.replace(unreadableRegex, ' ');
        let parts = cleanText16.split(/[\n\r]+/);
        let paragraphs = filterParagraphs(parts);
        
        if (paragraphs.length > 2) {
            return paragraphs.map((m: string) => `<p><strong>${m.trim()}</strong></p>`).join('');
        }

        const decoder8 = new TextDecoder('utf-8');
        const text8 = decoder8.decode(buffer);
        let cleanText8 = text8.replace(unreadableRegex, ' ');
        parts = cleanText8.split(/[\n\r]+/);
        paragraphs = filterParagraphs(parts);

        if (paragraphs.length > 0) {
            return paragraphs.map((m: string) => `<p><strong>${m.trim()}</strong></p>`).join('');
        }
    } catch (e) {
        console.error("Error en fallback", e);
    }
    return '<p><em>Aviso: Documento antiguo no soportado completamente. Guarde como .docx para ver el contenido completo.</em></p>';
}

// Extrae texto de archivos .doc binarios (Word 97-2003) usando el parser real
// del formato OLE, en vez de adivinar el texto a partir de los bytes crudos.
// word-extractor solo expone texto plano (sin negrita/cursiva por run), y en la
// práctica estos documentos antiguos se tipeaban enteros en negrita, así que se
// envuelve cada párrafo en <strong> para no perder ese énfasis en la decoración.
async function extractLegacyDoc(arrayBuffer: ArrayBuffer): Promise<string | null> {
    try {
        const extractor = new WordExtractor();
        const document = await extractor.extract(Buffer.from(arrayBuffer));
        const body = document.getBody();
        const paragraphs = body.split(/\n+/).map(p => p.trim()).filter(Boolean);
        if (paragraphs.length === 0) return null;
        return paragraphs.map(p => `<p><strong>${p}</strong></p>`).join('');
    } catch (e) {
        console.warn('word-extractor falló al leer el .doc', e);
        return null;
    }
}

export default function App() {
  const [docHtml, setDocHtml] = useState<string>('');
  const [tipoDocumento, setTipoDocumento] = useState<string>('COTIZACIÓN');

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      try {
        if (isPDF) {
          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          let fullHtml = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            let currentLine = '';
            for (const item of textContent.items as any[]) {
              currentLine += item.str;
              if (item.hasEOL) {
                if (currentLine.trim()) fullHtml += `<p>${currentLine.trim()}</p>`;
                currentLine = '';
              } else if (item.str) {
                currentLine += ' ';
              }
            }
            if (currentLine.trim()) fullHtml += `<p>${currentLine.trim()}</p>`;
          }
          setDocHtml(fullHtml);
        } else {
          const result = await mammoth.convertToHtml({ arrayBuffer });
          setDocHtml(result.value);
        }
      } catch (error) {
        console.warn('Mammoth falló, probando lector de .doc antiguo (Word 97-2003) con negrita real.');
        const legacyHtmlConNegrita = await extractLegacyDocWithBold(arrayBuffer);
        if (legacyHtmlConNegrita) {
          setDocHtml(legacyHtmlConNegrita);
          return;
        }

        console.warn('Lectura con negrita falló, probando lector de .doc antiguo estándar.');
        const legacyHtml = await extractLegacyDoc(arrayBuffer);
        if (legacyHtml) {
          setDocHtml(legacyHtml);
        } else {
          console.warn('El lector de .doc antiguo también falló, usando extracción de texto en bruto.');
          const fallbackHtml = fallbackTextExtraction(arrayBuffer);
          setDocHtml(fallbackHtml);
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleVolver = () => setDocHtml('');

  return (
    <main className="min-h-screen bg-slate-200 font-sans flex flex-col">
      {!docHtml ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <VistaCarga 
            onFileUpload={handleFileUpload} 
            tipoDocumento={tipoDocumento}
            setTipoDocumento={setTipoDocumento}
          />
        </div>
      ) : (
        <VisorDocumento 
          contenidoWord={docHtml} 
          onVolver={handleVolver} 
          tipoDocumento={tipoDocumento} 
        />
      )}
    </main>
  );
}