// src/utils/saltosDeSeccionWord.ts
import JSZip from 'jszip';

// Muchos .docx NO usan saltos de página manuales (Ctrl+Enter, <w:br w:type="page"/>)
// para separar sus hojas -en su lugar usan SALTOS DE SECCIÓN (<w:sectPr> insertado a
// mitad del documento, normalmente para poder cambiar el encabezado/pie de página por
// hoja). Cada sección nueva empieza en hoja nueva salvo que su tipo sea "continuous".
// mammoth descarta esta información por completo (ver body-reader.js: "w:sectPr" está
// en su lista de elementos ignorados), así que sin este preprocesamiento no hay forma
// de saber, a partir del HTML que entrega mammoth, dónde terminaba cada hoja real del
// Word original.
//
// La solución: leer el .docx como zip, insertar en el XML crudo un salto de página
// manual (<w:br w:type="page"/>) justo en el límite de cada sección que SÍ empieza
// hoja nueva, y volver a empaquetar el .docx modificado en memoria. A partir de ahí,
// procesadorWord.ts ya sabe leer esos saltos (ver App.tsx, styleMap
// "br[type='page'] => hr.salto-pagina-word:fresh") igual que si hubieran sido saltos
// manuales de verdad.
export async function insertarSaltosDeSeccionComoSaltosDePagina(arrayBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const archivoXml = zip.file('word/document.xml');
  if (!archivoXml) return arrayBuffer;

  const xmlOriginal = await archivoXml.async('string');
  let xmlModificado = insertarMarcadoresDeSalto(xmlOriginal);
  
  // Convierte los saltos de página suaves (los que Word inserta automáticamente al 
  // llenarse la hoja) en saltos manuales para que mammoth los reconozca.
  xmlModificado = xmlModificado.replace(/<w:lastRenderedPageBreak[^>]*>/g, '<w:br w:type="page"/>');

  if (xmlModificado === xmlOriginal) return arrayBuffer;

  zip.file('word/document.xml', xmlModificado);
  return zip.generateAsync({ type: 'arraybuffer' });
}

const MARCADOR_SALTO_PAGINA = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

function insertarMarcadoresDeSalto(xml: string): string {
  // Cada <w:sectPr> describe las propiedades de la sección que TERMINA en el párrafo
  // que lo contiene (o, si no está dentro de ningún <w:p>, la última sección del
  // documento). Su w:type indica cómo empieza esa sección respecto de la anterior: sin
  // w:type (o con cualquier valor que no sea "continuous") Word arranca esa sección en
  // hoja nueva -"continuous" es el único caso que NO fuerza salto de hoja.
  const secciones: { finDeParrafo: number | null; tipo: string }[] = [];

  const regexParrafo = /<w:p\b[\s\S]*?<\/w:p>/g;
  let match: RegExpExecArray | null;
  let finUltimoParrafo = 0;
  while ((match = regexParrafo.exec(xml)) !== null) {
    finUltimoParrafo = match.index + match[0].length;
    if (match[0].includes('<w:sectPr')) {
      secciones.push({ finDeParrafo: finUltimoParrafo, tipo: extraerTipoSectPr(match[0]) });
    }
  }

  // Sección final: su sectPr no vive dentro de un <w:p> (es hijo directo de <w:body>,
  // después del último párrafo) -no hay salto que insertar DESPUÉS de ella, pero su
  // tipo sí decide si hay salto ANTES de ella (entre la sección anterior y esta).
  const colaTrasUltimoParrafo = xml.slice(finUltimoParrafo);
  const sectPrFinalMatch = colaTrasUltimoParrafo.match(/^\s*<w:sectPr[\s\S]*?<\/w:sectPr>/);
  if (sectPrFinalMatch) {
    secciones.push({ finDeParrafo: null, tipo: extraerTipoSectPr(sectPrFinalMatch[0]) });
  }

  if (secciones.length < 2) return xml;

  // El salto ENTRE la sección i y la i+1 se inserta al final de la sección i, y se
  // activa según el tipo de la sección i+1 (cómo esa sección siguiente empieza).
  const puntosDeSalto: number[] = [];
  for (let i = 0; i < secciones.length - 1; i++) {
    const finDeSeccionActual = secciones[i].finDeParrafo;
    const tipoDeLaSiguiente = secciones[i + 1].tipo;
    if (finDeSeccionActual !== null && tipoDeLaSiguiente !== 'continuous') {
      puntosDeSalto.push(finDeSeccionActual);
    }
  }

  if (puntosDeSalto.length === 0) return xml;

  // De atrás hacia adelante para que insertar en una posición no invalide las demás.
  puntosDeSalto.sort((a, b) => b - a);
  let resultado = xml;
  for (const posicion of puntosDeSalto) {
    resultado = resultado.slice(0, posicion) + MARCADOR_SALTO_PAGINA + resultado.slice(posicion);
  }
  return resultado;
}

function extraerTipoSectPr(bloqueSectPr: string): string {
  const match = bloqueSectPr.match(/<w:type\s+w:val="([^"]+)"/);
  return match ? match[1] : 'nextPage';
}
