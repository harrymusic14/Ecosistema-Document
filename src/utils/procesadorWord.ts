// src/utils/procesadorWord.ts
export type TipoPago = 'BCP' | 'SCOTIABANK' | 'NINGUNO';

export interface FilaDocumento {
  id: string;
  html: string;
  precio: string;
  precioNegrita: boolean;
  // Marca las filas "PRECIO TOTAL...S/ XXX" de una cotización con varias opciones
  // (OPCION 1, OPCION 2...): en vez de una fila normal de tabla, se pintan como una
  // barra de total destacada justo debajo de la descripción de esa opción.
  esTotalOpcion?: boolean;
  // Salto de hoja manual: fuerza que esta fila empiece una hoja nueva (botón "Agregar
  // hoja"), independiente de si la fila anterior aún tenía espacio libre.
  saltoPaginaAntes?: boolean;
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
  // true cuando el Word trae varias opciones de precio (cada una con su propio
  // "PRECIO TOTAL"): en ese caso el total general de abajo no representa nada -cada
  // opción ya muestra el suyo en su propia fila- así que la plantilla lo oculta.
  esMultiOpcion: boolean;
  // Párrafos de presentación/descripción (HTML) que preceden al primer renglón de
  // precios o lista del Word original. Vacío si el documento no traía ninguno -en ese
  // caso VisorDocumento usa su propio texto de partida en vez de dejar esto en blanco.
  introduccion: string;
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

  const PRICE_LINE_REGEX = /(?:PRECIO\s*(?:TOTAL|GLOBAL)|TOTAL|MONTO|COSTO).*?(?:S\s*\/|\$|SOLES)?\s*([\d,]+(?:\.\d{2})?)/;

  // Cotizaciones con varias opciones de precio (OPCION 1, OPCION 2, OPCION 3...) traen
  // una línea "PRECIO TOTAL...S/ XXX" por cada opción, no una sola. Si se tratara cada
  // una como "el" total del documento (como en una cotización de una sola opción), el
  // valor de la última opción encontrada pisaría al de las anteriores y además las
  // líneas de precio desaparecerían de la tabla (se eliminan al extraer el total). Para
  // no perder ninguna opción, primero se cuentan cuántas líneas con esta forma hay en
  // el documento: si hay más de una, ninguna se trata como total único -se dejan pasar
  // tal cual hacia la tabla de descripción (más abajo), donde cada una queda como su
  // propia fila con su propio precio, igual que cualquier línea "título....precio".
  const esMultiOpcion = Array.from(tempDiv.children).filter(child => {
    const text = child.textContent?.trim() || '';
    return !!text && PRICE_LINE_REGEX.test(text.toUpperCase());
  }).length > 1;

  // Marcador que App.tsx le pide a mammoth que deje en el HTML en el lugar exacto de
  // cada salto de página manual del Word original (ver styleMap en App.tsx). Se busca
  // ANTES del forEach principal porque ese mismo bucle decide qué hijos sobreviven
  // (nodesToRemove) y necesitamos saber, para cada uno, si contenía el marcador.
  const contieneMarcadorSalto = (el: Element) => el.matches('.salto-pagina-word') || el.querySelector('.salto-pagina-word') !== null;
  const childrenOriginales = Array.from(tempDiv.children);

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

    const priceMatch = upperText.match(PRICE_LINE_REGEX);
    if (priceMatch) {
      if (esMultiOpcion) {
        // No se fusiona en un total único: se deja intacta para que la etapa de
        // filasDescripcion (más abajo) la reconozca como una fila normal de
        // título+precio, conservando el precio de CADA opción en la tabla.
        return;
      }
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

  // Asocia cada marcador de salto de página con la primera fila que realmente
  // sobrevive después de él (el párrafo que traía el marcador casi siempre queda
  // vacío -era solo el Ctrl+Enter- y se elimina en el paso de arriba junto con el
  // resto de nodesToRemove; si no se propagara, el corte de hoja se perdería). Si el
  // marcador viene pegado a texto real dentro del mismo párrafo (caso raro), esa
  // misma fila es la que arranca hoja nueva.
  const elementosConSaltoAntes = new Set<Element>();
  {
    let pendiente = false;
    childrenOriginales.forEach(child => {
      const marcador = contieneMarcadorSalto(child);
      const removido = nodesToRemove.includes(child as HTMLElement);
      if (marcador && removido) {
        pendiente = true;
        return;
      }
      if (marcador && !removido) {
        elementosConSaltoAntes.add(child);
        pendiente = false;
        return;
      }
      if (!removido && pendiente) {
        elementosConSaltoAntes.add(child);
        pendiente = false;
      }
    });
  }

  nodesToRemove.forEach(node => {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
  });

  // Fallback global: si por culpa de extraer texto bruto no encontró el precio, búscalo en todo el documento.
  const fullText = tempDiv.textContent?.replace(/\s+/g, ' ').toUpperCase() || '';
  if (totalTexto === `${simboloMoneda} 0.00` && !esMultiOpcion) {
    const fallbackPrice = fullText.match(PRICE_LINE_REGEX);
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

  // ---------- Introducción ----------
  // Antes de armar la tabla, los párrafos de presentación/descripción libre que
  // preceden al primer renglón de precios ("título....precio") o a la primera lista
  // (viñetas/numerada) se separan del resto: sin esto, cada uno de esos párrafos
  // -que no tienen cantidad ni precio- terminaba colándose como una fila más de la
  // tabla (con la columna Precio vacía), duplicando visualmente el mismo texto que
  // ya se mostraba arriba como introducción. En cuanto aparece contenido que SÍ es
  // de la tabla (precio o lista), se deja de capturar introducción -lo que venga
  // después, aunque sea texto libre (ej. "Forma de pago:"), pasa a ser una fila más,
  // igual que antes.
  // Ojo: se usa dotLeaderRegex (exige un símbolo de moneda real al final), NO
  // PRICE_LINE_REGEX -esa es más laxa (le basta la palabra "TOTAL" seguida de
  // cualquier número, sin moneda) y da falsos positivos con texto de la introducción
  // que no tiene nada que ver con precios, ej. "el tiempo TOTAL de riego es de 55
  // minutos" -eso cortaría la introducción ahí por error.
  const esInicioDeContenidoDeTabla = (el: Element): boolean => {
    if (el.tagName === 'UL' || el.tagName === 'OL') return true;
    if (elementosConSaltoAntes.has(el)) return true;
    const texto = el.textContent?.trim() || '';
    if (!texto) return false;
    return dotLeaderRegex.test(texto);
  };
  const parrafosIntroduccion: string[] = [];
  const elementosDeIntroduccion: Element[] = [];
  for (const child of Array.from(tempDiv.children)) {
    if (esInicioDeContenidoDeTabla(child)) break;
    parrafosIntroduccion.push(child.outerHTML);
    elementosDeIntroduccion.push(child);
  }
  elementosDeIntroduccion.forEach(el => el.parentNode?.removeChild(el));
  const introduccion = parrafosIntroduccion.join('');

  // Algunas cotizaciones no repiten la descripción del ítem en la misma línea del
  // precio: en vez de "Electrobomba....U$ 250.00" ponen la descripción en un párrafo
  // o lista aparte y el precio solo en una línea con una etiqueta genérica como
  // "PRECIO....U$ 250.00" (ver cotización HUNTER/ISRAEL, sección "EQUIPO DE BOMBEO").
  // Si se tratara como una fila nueva, el precio quedaría "huérfano" bajo el título
  // "PRECIO" y la descripción real se vería sin precio al lado. Se detecta ese caso
  // para adjuntar el precio al renglón anterior en vez de crear uno nuevo.
  const ETIQUETA_PRECIO_GENERICA = /^(?:PRECIO|TOTAL|SUBTOTAL|MONTO|COSTO|IMPORTE)$/i;

  const filasDescripcion: Array<{ html: string; precio: string | null; precioNegrita: boolean; esTotalOpcion?: boolean; saltoPaginaAntes?: boolean }> = [];

  Array.from(tempDiv.children).forEach(child => {
    const text = child.textContent?.trim() || '';
    const match = text.match(dotLeaderRegex);
    // Estas son exactamente las mismas líneas que en modo multi-opción no se
    // extrajeron arriba como total único (ver esMultiOpcion): "PRECIO TOTAL...S/ XXX"
    // de cada OPCION. Al llegar hasta acá se marcan para que la plantilla las pinte
    // como su propia barra de total, en vez de una fila más de la tabla.
    const esTotalOpcion = esMultiOpcion && PRICE_LINE_REGEX.test(text.toUpperCase());
    const saltoPaginaAntes = elementosConSaltoAntes.has(child);
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
      const precio = match[2].trim();

      if (!esTotalOpcion && ETIQUETA_PRECIO_GENERICA.test(titulo)) {
        for (let i = filasDescripcion.length - 1; i >= 0; i--) {
          if (!filasDescripcion[i].precio) {
            filasDescripcion[i].precio = precio;
            filasDescripcion[i].precioNegrita = precioNegrita;
            return;
          }
        }
      }

      filasDescripcion.push({
        html: eraNegrita ? `<span class="font-bold">${titulo}</span>` : titulo,
        precio,
        precioNegrita,
        esTotalOpcion,
        saltoPaginaAntes,
      });
      return;
    }
    filasDescripcion.push({ html: child.innerHTML, precio: null, precioNegrita: false, esTotalOpcion, saltoPaginaAntes });
  });

  if (filasDescripcion.length === 0) {
    filasDescripcion.push({ html: 'SERVICIO GENERAL', precio: null, precioNegrita: false, esTotalOpcion: false, saltoPaginaAntes: false });
  }

  const filas: FilaDocumento[] = filasDescripcion.map((linea, idx) => ({
    id: `fila-inicial-${idx}`,
    html: linea.html,
    precio: linea.precio ?? '',
    precioNegrita: linea.precioNegrita,
    esTotalOpcion: linea.esTotalOpcion,
    saltoPaginaAntes: linea.saltoPaginaAntes,
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

  return { cliente, fecha, filas, totalTexto, subtotalTexto, igvTexto, tieneIgv, cuentaBancaria, esMultiOpcion, introduccion };
};