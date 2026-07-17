// src/components/VisorDocumento.tsx
import { useEffect, useRef, useState } from 'react';
import BarraControles from './BarraControles';
import PlantillaFactura from './PlantillaFactura';
import { procesarFacturacion, type TipoPago, type FilaDocumento } from '../utils/procesadorWord';
import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';

interface VisorProps {
  contenidoWord: string;
  onVolver: () => void;
  tipoDocumento: string;
  nombreArchivo: string;
  tipoPago: TipoPago;
}

// Todo el contenido editable del documento (lo que NO cambia es el estilo/plantilla).
// Vive en VisorDocumento -no en PlantillaFactura- para que el historial de deshacer/
// rehacer y los botones de la barra de controles compartan el mismo estado.
export interface EstadoDocumento {
  cliente: string;
  fecha: string;
  cantidad: string;
  filas: FilaDocumento[];
  total: string;
  introduccion: string;
}

// Punto de partida del bloque de presentación (fijo en el layout, pero editable): la
// presentación, descripción técnica y alcance de una cotización real de riego por
// aspersión, para que el usuario la ajuste caso a caso en vez de partir de cero.
const INTRODUCCION_INICIAL = `<p>Por medio del presente, tenemos el agrado de remitir nuestra propuesta económica por la instalación de un sistema integral de riego automático por aspersión para los jardines de su residencia, nuestra propuesta ha sido elaborada en base al plano.</p><p>En el sistema propuesto el riego de las áreas verdes se ha dividido en zonas o sectores, esto para que el radio de acción de los aspersores sea óptimo. En el diseño del sistema se ha considerado un traslape del 100% entre aspersores. Los aspersores cotizados son del tipo pop-up, es decir, sólo se verán mientras riegan para luego ocultarse bajo el grass, evitando así tropiezos o accidentes y facilitando las labores del personal de jardinería. El equipo de riego cotizado es marca HUNTER de U.S.A.. La garantía que damos por el equipo de riego es de 3 (tres) años contra cualquier defecto de fábrica.</p><p>A continuación detallamos algunos puntos importantes en cuanto al sistema de riego:</p><ol><li>El número de sectores en que se ha dividido el riego de las áreas verdes es de 8.</li><li>El consumo de agua estimado por cada riego es de 3.8m3 de agua por riego en condiciones de máxima demanda (es decir en verano).</li><li>El tiempo total de riego es de 55 minutos para cubrir todos los sectores.</li><li>Se ha considerado un traslape del 100% entre aspersores, para asegurar un riego parejo en todos los sectores evitando así manchas en el grass.</li><li>Toda la red de tuberías se instalará a 35 cm. de profundidad.</li><li>Se considera en la cotización solo lo que indica el diseño de riego.</li></ol><p>A continuación detallamos los componentes de nuestra propuesta:</p>`;

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

// html2canvas-pro clona el documento en un iframe oculto y, al hacerlo, vuelve a pedir
// por red la hoja de estilos (Tailwind) en vez de reusar la que ya está aplicada en
// pantalla. En computadoras donde esa segunda petición interna falla (bloqueada por
// firewall/antivirus, o simplemente no llega a tiempo), el clon sale sin estilos -como
// HTML plano- aunque la pantalla se vea perfecta. Para no depender de que esa petición
// de red funcione, se lee el CSS que el navegador YA tiene parseado en la página visible
// y se inyecta como texto plano directamente en el clon (ver onclone más abajo): así el
// clon nunca necesita pedir nada por red.
function extraerCssActual(): string {
  let css = '';
  for (const hoja of Array.from(document.styleSheets)) {
    try {
      for (const regla of Array.from(hoja.cssRules)) {
        css += regla.cssText + '\n';
      }
    } catch {
      // Hoja de otro origen (CORS): no se puede leer su cssRules, se omite.
    }
  }
  return css;
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

export default function VisorDocumento({ contenidoWord, onVolver, tipoDocumento, nombreArchivo, tipoPago }: VisorProps) {
  const [generando, setGenerando] = useState(false);

  // procesarFacturacion se corre una sola vez (al montar) para extraer el punto de
  // partida; desde ahí en adelante todo lo editable vive en `estado`, no se vuelve a
  // reprocesar el Word original. Lo que no es editable (cuenta bancaria, IGV/Subtotal)
  // queda aparte, en `datosBase`.
  const [datosBase] = useState(() => procesarFacturacion(contenidoWord, tipoPago));
  const [estado, setEstado] = useState<EstadoDocumento>(() => ({
    cliente: datosBase.cliente,
    fecha: datosBase.fecha,
    cantidad: '01',
    filas: datosBase.filas,
    total: datosBase.totalTexto,
    introduccion: INTRODUCCION_INICIAL,
  }));
  const [pasado, setPasado] = useState<EstadoDocumento[]>([]);
  const [futuro, setFuturo] = useState<EstadoDocumento[]>([]);

  // Aplica un cambio y lo deja en el historial. Si el valor no cambió en realidad (ej.
  // el usuario hizo clic en un campo y salió sin escribir nada), no se apila un paso de
  // historial vacío.
  const confirmarCambio = (nuevo: EstadoDocumento) => {
    setEstado(actual => {
      if (JSON.stringify(actual) === JSON.stringify(nuevo)) return actual;
      setPasado(p => [...p, actual]);
      setFuturo([]);
      return nuevo;
    });
  };

  const deshacer = () => {
    setPasado(p => {
      if (p.length === 0) return p;
      const anterior = p[p.length - 1];
      setFuturo(f => [...f, estado]);
      setEstado(anterior);
      return p.slice(0, -1);
    });
  };

  const rehacer = () => {
    setFuturo(f => {
      if (f.length === 0) return f;
      const siguiente = f[f.length - 1];
      setPasado(p => [...p, estado]);
      setEstado(siguiente);
      return f.slice(0, -1);
    });
  };

  // Ctrl+Z / Ctrl+Y (y Ctrl+Shift+Z como alterno de rehacer) funcionan en cualquier
  // parte de la página, incluso con el foco dentro de una celda editable: se bloquea el
  // undo nativo del navegador (que solo conoce esa celda) para que ambos usen el mismo
  // historial global del documento.
  useEffect(() => {
    const alPresionarTecla = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tecla = e.key.toLowerCase();
      if (tecla === 'z' && !e.shiftKey) {
        e.preventDefault();
        deshacer();
      } else if (tecla === 'y' || (tecla === 'z' && e.shiftKey)) {
        e.preventDefault();
        rehacer();
      }
    };
    window.addEventListener('keydown', alPresionarTecla);
    return () => window.removeEventListener('keydown', alPresionarTecla);
  });

  const actualizarCliente = (html: string) => confirmarCambio({ ...estado, cliente: html });
  const actualizarFecha = (html: string) => confirmarCambio({ ...estado, fecha: html });
  const actualizarCantidad = (html: string) => confirmarCambio({ ...estado, cantidad: html });
  const actualizarTotal = (html: string) => confirmarCambio({ ...estado, total: html });
  const actualizarIntroduccion = (html: string) => confirmarCambio({ ...estado, introduccion: html });
  const actualizarFila = (id: string, campo: 'html' | 'precio', valor: string) =>
    confirmarCambio({ ...estado, filas: estado.filas.map(f => (f.id === id ? { ...f, [campo]: valor } : f)) });

  // Compartido entre BarraControles (donde vive la barra de formato fija) y
  // PlantillaFactura (el documento en sí): así la barra de formato sabe qué cuenta como
  // "el documento" sin importar en qué celda/tabla esté el cursor.
  const contenedorRef = useRef<HTMLDivElement>(null);

  const contadorNuevaFila = useRef(0);
  const agregarFila = () => {
    contadorNuevaFila.current += 1;
    confirmarCambio({
      ...estado,
      filas: [...estado.filas, { id: `fila-nueva-${contadorNuevaFila.current}`, html: '', precio: '', precioNegrita: false }],
    });
  };
  const quitarFila = (id: string) => {
    if (estado.filas.length <= 1) return;
    confirmarCambio({ ...estado, filas: estado.filas.filter(f => f.id !== id) });
  };

  // "Agregar hoja" fuerza un salto de página manual: se agrega una fila vacía marcada
  // con saltoPaginaAntes, así el usuario tiene dónde empezar a escribir en la hoja
  // nueva aunque la anterior todavía tuviera espacio libre. "Quitar hoja" deshace el
  // último salto manual (las filas de esa hoja vuelven a fluir con la anterior); no
  // toca los saltos automáticos por desborde, esos no se pueden "quitar" -son
  // consecuencia del contenido, no una hoja agregada a mano.
  const puedeQuitarHoja = estado.filas.some(f => f.saltoPaginaAntes);
  const agregarHoja = () => {
    contadorNuevaFila.current += 1;
    confirmarCambio({
      ...estado,
      filas: [...estado.filas, { id: `fila-nueva-${contadorNuevaFila.current}`, html: '', precio: '', precioNegrita: false, saltoPaginaAntes: true }],
    });
  };
  const quitarHoja = () => {
    const idx = [...estado.filas].reverse().findIndex(f => f.saltoPaginaAntes);
    if (idx === -1) return;
    const indiceReal = estado.filas.length - 1 - idx;
    confirmarCambio({
      ...estado,
      filas: estado.filas.map((f, i) => (i === indiceReal ? { ...f, saltoPaginaAntes: false } : f)),
    });
  };

  const handleDownloadPDF = async () => {
    const contenedor = document.getElementById('documento-completo');
    const hojas = Array.from(document.querySelectorAll<HTMLElement>('.hoja-a4'));
    if (!contenedor || hojas.length === 0) return;

    setGenerando(true);
    await esperarRecursosListos(contenedor);

    const cssTexto = extraerCssActual();
    const inyectarCss = (clonedDoc: Document) => {
      const estilo = clonedDoc.createElement('style');
      estilo.textContent = cssTexto;
      clonedDoc.head.appendChild(estilo);
    };

    // El PDF descargado debe llamarse igual que el archivo Word original subido, en
    // mayúsculas, no como el nombre de cliente detectado en el contenido. Solo se
    // quitan los caracteres inválidos para nombres de archivo en Windows (paréntesis
    // y demás se conservan tal cual estaban en el archivo original).
    const nombreLimpio = nombreArchivo.replace(/[\\/:*?"<>|]/g, '').trim().toUpperCase() || 'DOCUMENTO';

    const pdf = new jsPDF({
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait',
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // ignoreElements excluye los controles de edición (botones agregar/quitar fila u
    // hoja, clase "pdf-ocultar") de la captura: son solo ayuda de edición en pantalla,
    // no deben aparecer en el PDF final.
    const ignorarControlesEdicion = (el: Element) => el.classList.contains('pdf-ocultar');

    const capturarHoja = async (hoja: HTMLElement) => {
      let canvas = await html2canvas(hoja, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        scrollY: 0,
        onclone: inyectarCss,
        ignoreElements: ignorarControlesEdicion,
      });

      // capturaTieneEstilos queda como red de seguridad adicional (ej. por si alguna
      // imagen no cargó a tiempo), pero ya no depende de reintentar una petición de red
      // para el CSS: onclone lo inyecta directo, sin red, en cada intento.
      for (let intento = 0; intento < 2 && !capturaTieneEstilos(canvas, hoja); intento++) {
        canvas = await html2canvas(hoja, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          scrollY: 0,
          onclone: inyectarCss,
          ignoreElements: ignorarControlesEdicion,
        });
      }
      return canvas;
    };

    try {
      // Cada "hoja-a4" es una página A4 real (297mm) ya repartida por PlantillaFactura
      // (encabezado en la primera, totales/pie en la última). En el caso normal cada
      // una entra en una sola página del PDF; si de todas formas una hoja concreta sale
      // más alta que 297mm (ej. una introducción larguísima que no se pudo repartir),
      // esa hoja puntual se reparte en varias páginas del PDF de forma proporcional,
      // igual que hacía antes el documento completo.
      for (let i = 0; i < hojas.length; i++) {
        if (i > 0) pdf.addPage();

        const canvas = await capturarHoja(hojas[i]);
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
        onDeshacer={deshacer}
        onRehacer={rehacer}
        puedeDeshacer={pasado.length > 0}
        puedeRehacer={futuro.length > 0}
        contenedorRef={contenedorRef}
      />
      <div className="w-full flex justify-center pb-12 pt-4 px-4 overflow-y-auto">
        <PlantillaFactura
          estado={estado}
          cuentaBancaria={datosBase.cuentaBancaria}
          tieneIgv={datosBase.tieneIgv}
          subtotalTexto={datosBase.subtotalTexto}
          igvTexto={datosBase.igvTexto}
          esMultiOpcion={datosBase.esMultiOpcion}
          tipoDocumento={tipoDocumento}
          contenedorRef={contenedorRef}
          onCambiarCliente={actualizarCliente}
          onCambiarFecha={actualizarFecha}
          onCambiarCantidad={actualizarCantidad}
          onCambiarTotal={actualizarTotal}
          onCambiarIntroduccion={actualizarIntroduccion}
          onCambiarFila={actualizarFila}
          onAgregarFila={agregarFila}
          onQuitarFila={quitarFila}
          onAgregarHoja={agregarHoja}
          onQuitarHoja={quitarHoja}
          puedeQuitarHoja={puedeQuitarHoja}
        />
      </div>
    </div>
  );
}