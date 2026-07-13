// src/utils/procesadorWord.ts
export type TipoPago = 'BCP' | 'SCOTIABANK' | 'NINGUNO';

export interface FilaDocumento {
  id: string;
  html: string;
  precio: string;
  precioNegrita: boolean;
}

export interface DatosFacturacion {
  cliente: string;
  fecha: string;
  filas: FilaDocumento[];
  totalTexto: string;
  subtotalTexto: string;
  igvTexto: string;
  tieneIgv: boolean;
  cuentaBancaria: string;
}

export const procesarFacturacion = (html: string, tipoPago: TipoPago = 'BCP'): DatosFacturacion => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // Algunas cotizaciones (ej. repuestos importados "HUNTER USA") se cobran en dólares
  // (U$) en vez de soles (S/). Se detecta una sola vez para todo el documento y se usa
  // ese símbolo en los montos calculados (Total/Subtotal/IGV), en vez de asumir soles.
  const monedaDolar = /U\s*\$|US\$/i.test(html);
  const simboloMoneda = monedaDolar ? 'U$' : 'S/';

  // Títulos frecuentes antes del nombre del cliente en las cartas, además de
  // "Señor(es)/Cliente/Atención": "Ing.", "Arq.", "Dr(a).", "Lic.", "Sr(a)./Srta.".
  const TITULOS_CLIENTE = 'SE[ÑN]OR(?:A|ES)?|CLIENTE|ATENCI[ÓO]N|ING|ARQ|DRA?|LIC|SRA?|SRTA';

  let fecha = "No especificada";
  let cliente = "CLIENTE NO ESPECIFICADO";
  let totalTexto = `${simboloMoneda} 0.00`;
  let subtotalTexto = "---";
  let igvTexto = "---";

  // "/IGV/i.test(html)" por sí solo detecta la palabra "IGV" en cualquier parte,
  // incluida una negación como "NO INCLUYE IGV" (que precisamente indica lo
  // contrario). Se revisa primero si el documento niega explícitamente el IGV
  // para no calcular ni mostrar el desglose Subtotal/IGV en ese caso.
  //
  // La negación se busca en el texto plano (sin etiquetas) de cada párrafo y no en
  // el string `html` crudo: los .doc antiguos pueden partir una frase en varias
  // etiquetas <strong>/<p> a mitad de palabra (la negrita real del Word original no
  // siempre coincide con los límites de palabra), lo que rompe "NO INCLUYE IGV" en
  // algo como "NO INCLUYE</strong> IGV" y hace que el regex no la reconozca como
  // una frase contigua.
  //
  // Ojo: tempDiv.textContent concatena TODOS los párrafos sin ningún separador
  // (los <p> no insertan espacio/salto de línea en .textContent), así que un párrafo
  // que termina en "...IGV" pegado al siguiente que empieza en "PRECIO..." queda
  // como "...IGVPRECIO...", sin límite de palabra después de "IGV" (el regex de
  // negación usa \b y ahí V-P son ambas letras, no hay borde). Por eso se arma el
  // texto uniendo cada párrafo/hijo por separado con un espacio de por medio.
  const textoCompleto = Array.from(tempDiv.children)
    .map(child => child.textContent || '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();
  const noIncluyeIgv = /\bNO\s+(?:INCLUYE|INCLUIDO|INCLUYA|APLICA)\s+(?:EL\s+)?IGV\b|\bSIN\s+IGV\b|\bIGV\s+NO\s+INCLUIDO\b/.test(textoCompleto);
  const tieneIgv = /IGV/.test(textoCompleto) && !noIncluyeIgv;
  let nextIsClient = false;
  const nodesToRemove: HTMLElement[] = [];

  Array.from(tempDiv.children).forEach(child => {
    const text = child.textContent?.trim() || '';
    const upperText = text.toUpperCase();
    // Los .doc antiguos suelen escribir el membrete con espacios dobles/triples
    // (ej. "ECO  SISTEMAS  URH  SAC" para simular espaciado de letras), lo que
    // rompe una comparación por texto literal de un solo espacio. Se normaliza
    // aquí antes de comparar contra los patrones del membrete.
    const upperTextNorm = upperText.replace(/\s+/g, ' ');

    if (!text) {
      nodesToRemove.push(child as HTMLElement);
      return;
    }

    if (
      upperTextNorm.includes('ECO SISTEMAS URH') ||
      upperTextNorm.includes('MZ A LT') ||
      upperTextNorm.includes('998270102') ||
      upperTextNorm.includes('985832096') ||
      upperTextNorm.includes('HOTMAIL.COM') ||
      // La línea "E-mail: ..." del membrete a veces pierde el dominio al extraer
      // el .doc (queda "E-mail: Ecosistema" sin "@hotmail.com"), así que además
      // del dominio literal se detecta la etiqueta "E-mail"/"Correo" o cualquier
      // dirección de correo suelta (contiene "@") para no dejarla filtrar a la
      // tabla de descripción, donde el correo ya se muestra en el encabezado.
      /^E-?MAIL\b/.test(upperTextNorm) ||
      /^CORREO\b/.test(upperTextNorm) ||
      upperTextNorm.includes('@') ||
      upperTextNorm.includes('A SU GENTIL SOLICITUD')
    ) {
      nodesToRemove.push(child as HTMLElement);
      return;
    }

    const dateMatch = upperText.match(/(?:LIMA,?\s*)?(\d{1,2}\s+(?:DE\s+)?[A-Z]+\s+(?:DEL?\s+)?\d{4}|\d{2}\/\d{2}\/\d{4})/);
    if (dateMatch && fecha === "No especificada") {
      fecha = text; 
      nodesToRemove.push(child as HTMLElement);
      return;
    }

    if (upperText.match(new RegExp(`^(?:${TITULOS_CLIENTE})\\.?\\s*:?$`))) {
      nextIsClient = true;
      nodesToRemove.push(child as HTMLElement);
      return;
    }
    
    if (nextIsClient) {
      cliente = text.toUpperCase(); 
      nextIsClient = false;
      nodesToRemove.push(child as HTMLElement);
      return;
    }

    const inlineClient = text.match(new RegExp(`^(?:${TITULOS_CLIENTE})\\.?\\s*:\\s*(.+)$`, 'i'));
    if (inlineClient && cliente === "CLIENTE NO ESPECIFICADO") {
      cliente = inlineClient[1].trim().toUpperCase(); 
      nodesToRemove.push(child as HTMLElement);
      return;
    }
    
    if (upperText.includes('DANIEL REYNAFARJE') && cliente === "CLIENTE NO ESPECIFICADO") {
      cliente = text.toUpperCase(); 
      nodesToRemove.push(child as HTMLElement);
      return;
    }

    const priceMatch = upperText.match(/(?:PRECIO\s*(?:TOTAL|GLOBAL)|TOTAL|MONTO|COSTO).*?(?:S\s*\/|\$|SOLES)?\s*([\d,]+(?:\.\d{2})?)/);
    if (priceMatch) {
      const numericTotal = parseFloat(priceMatch[1].replace(/,/g, ''));
      if (!isNaN(numericTotal)) {
        totalTexto = `${simboloMoneda} ${numericTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        if (tieneIgv) {
          const sub = numericTotal / 1.18;
          const igv = numericTotal - sub;
          subtotalTexto = `${simboloMoneda} ${sub.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          igvTexto = `${simboloMoneda} ${igv.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
      }
      nodesToRemove.push(child as HTMLElement);
      return;
    }
  });

  nodesToRemove.forEach(node => {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
  });

  // Fallback global: si por culpa de extraer texto bruto no encontró el precio, búscalo en todo el documento.
  const fullText = tempDiv.textContent?.replace(/\s+/g, ' ').toUpperCase() || '';
  if (totalTexto === `${simboloMoneda} 0.00`) {
    const fallbackPrice = fullText.match(/(?:PRECIO\s*(?:TOTAL|GLOBAL)|TOTAL|MONTO|COSTO).*?(?:S\s*\/|\$|SOLES)?\s*([\d,]+(?:\.\d{2})?)/);
    if (fallbackPrice) {
      const num = parseFloat(fallbackPrice[1].replace(/,/g, ''));
      if (!isNaN(num)) {
        totalTexto = `${simboloMoneda} ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
    }
  }

  if (cliente === "CLIENTE NO ESPECIFICADO") {
    const fallbackClient = fullText.match(new RegExp(`(?:${TITULOS_CLIENTE})\\.?\\s*:?\\s*([A-Z\\s]+?)(?=\\s+(?:LIMA|RUC|DNI|FECHA|DIRECCI[ÓO]N|P[ÁA]GINA|PRECIO|COTIZACI[ÓO]N|01|$))`));
    if (fallbackClient) {
      cliente = fallbackClient[1].trim();
    }
  }

  if (fecha === "No especificada") {
    const fallbackDate = fullText.match(/(?:LIMA,?\s*)?(\d{1,2}\s+(?:DE\s+)?[A-Z]+\s+(?:DEL?\s+)?\d{4}|\d{2}\/\d{2}\/\d{4})/);
    if (fallbackDate) fecha = fallbackDate[0];
  }

  // Revisa si los caracteres de texto del nodo en el rango [inicio, fin) están TODOS
  // dentro de una etiqueta <strong>/<b>. Se usa por separado para el título y para el
  // precio de las líneas "título....precio": mirar solo el tramo correspondiente (y no
  // toda la línea) evita que la negrita de uno termine contagiando al otro cuando en el
  // Word original solo uno de los dos estaba en negrita.
  const rangoEstaEnNegrita = (nodo: Node, inicio: number, fin: number): boolean => {
    let pos = 0;
    let huboContenido = false;
    let todoNegrita = true;

    const recorrer = (n: Node, dentroDeNegrita: boolean) => {
      if (pos >= fin) return;
      if (n.nodeType === Node.TEXT_NODE) {
        const len = n.textContent?.length ?? 0;
        const inicioNodo = pos;
        const finNodo = pos + len;
        const solapeInicio = Math.max(inicioNodo, inicio);
        const solapeFin = Math.min(finNodo, fin);
        if (solapeFin > solapeInicio) {
          huboContenido = true;
          if (!dentroDeNegrita) todoNegrita = false;
        }
        pos = finNodo;
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        const tag = (n as Element).tagName;
        const esNegrita = dentroDeNegrita || tag === 'STRONG' || tag === 'B';
        for (const hijo of Array.from(n.childNodes)) {
          recorrer(hijo, esNegrita);
          if (pos >= fin) break;
        }
      }
    };

    recorrer(nodo, false);
    return huboContenido && todoNegrita;
  };

  // Detecta líneas tipo "MATERIALES....................S/ 85.00" o "VÁLVULAS: U$ 450.00"
  // (título + separador + precio): el precio pasa a la columna "Precio" de la tabla, en
  // vez de quedar pegado en la descripción. El título conserva la negrita solo si ya
  // estaba en negrita en el Word original (no se fuerza negrita nueva).
  // El separador entre título y precio se acepta en cualquier forma -puntos de relleno,
  // dos puntos, tabulador o solo espacio- porque cuando el Word original usa un
  // tabulador con "relleno de puntos" (característica de formato de párrafo de Word),
  // los puntos son solo visuales: al extraer el texto real (Mammoth o el lector de .doc
  // antiguo) solo queda un tabulador, sin ningún punto. Por eso ya no se exige ver un
  // mínimo de puntos: basta con que la línea TERMINE en un monto de dinero.
  // El símbolo de moneda se acepta con espacios sueltos (ej. "s / 450.00") porque algunos
  // documentos originales lo escriben así, y también en dólares ("U$200.00") además de
  // soles ("S/"), ya que algunas cotizaciones de repuestos importados usan esa moneda.
  const dotLeaderRegex = /^(.+?)[\s.·•…:]*((?:S\s*\/\s*\.?|US\s*\$|U\s*\$|\$)\s*[\d,]+(?:\.\d{2})?)\s*$/i;
  const filasDescripcion = Array.from(tempDiv.children).map(child => {
    const text = child.textContent?.trim() || '';
    const match = text.match(dotLeaderRegex);
    if (match) {
      const crudo = child.textContent || '';
      const espaciosIniciales = crudo.length - crudo.trimStart().length;
      const longitudTitulo = espaciosIniciales + match[1].length;
      const eraNegrita = rangoEstaEnNegrita(child, 0, longitudTitulo);
      const titulo = match[1].trim();

      // El precio queda al final del texto recortado (match[0] cubre `text` completo
      // porque el regex está anclado con ^...$), así que su inicio es text.length menos
      // su propio largo.
      const inicioPrecio = espaciosIniciales + text.length - match[2].length;
      const finPrecio = espaciosIniciales + text.length;
      const precioNegrita = rangoEstaEnNegrita(child, inicioPrecio, finPrecio);

      return {
        html: eraNegrita ? `<span class="font-bold">${titulo}</span>` : titulo,
        precio: match[2].trim(),
        precioNegrita,
      };
    }
    return { html: child.innerHTML, precio: null as string | null, precioNegrita: false };
  });

  if (filasDescripcion.length === 0) {
    filasDescripcion.push({ html: 'SERVICIO GENERAL', precio: null, precioNegrita: false });
  }

  const filas: FilaDocumento[] = filasDescripcion.map((linea, idx) => ({
    id: `fila-inicial-${idx}`,
    html: linea.html,
    precio: linea.precio ?? '',
    precioNegrita: linea.precioNegrita,
  }));

  // ---------- Bloque bancario, ahora SEPARADO del resto del contenido ----------
  // Según el tipo de pago elegido en la carga, se muestra la cuenta BCP (soles), la
  // cuenta Scotiabank (dólares), o ninguna (tipoPago === 'NINGUNO').
  const cuentaBancariaBCP = `
    <div class="inline-block border border-red-600 p-1.5 bg-white text-red-600 text-[10px] font-medium uppercase tracking-wider shadow-sm leading-tight">
      <p class="mb-0.5">CUENTA DE AHORRO SOLES BCP</p>
      <p class="mb-0.5">BCP SOLES: <span class="font-bold">193-27543218-0-31</span></p>
      <p class="mb-0.5">CCI: <span class="font-bold">002-193-127543218031-10</span></p>
      <p class="mb-0">Nombre: <span class="font-bold">ULICES RODRIGUEZ H.</span></p>
    </div>
  `;

  const cuentaBancariaScotiabank = `
    <div class="inline-block border border-red-600 p-1.5 bg-white text-red-600 text-[10px] font-medium uppercase tracking-wider shadow-sm leading-tight">
      <p class="mb-0.5">CUENTA DE AHORRO DÓLARES SCOTIABANK</p>
      <p class="mb-0.5">DÓLARES: <span class="font-bold">149-0042206</span></p>
      <p class="mb-0">CCI: <span class="font-bold">009-087-211490042206-81</span></p>
    </div>
  `;

  const cuentaBancaria =
    tipoPago === 'NINGUNO' ? '' :
    tipoPago === 'SCOTIABANK' ? cuentaBancariaScotiabank :
    cuentaBancariaBCP;

  return { cliente, fecha, filas, totalTexto, subtotalTexto, igvTexto, tieneIgv, cuentaBancaria };
};