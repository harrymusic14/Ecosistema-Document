// src/utils/legacyDocBoldExtractor.ts
//
// word-extractor (la librería que usamos para leer .doc de Word 97-2003) solo expone
// texto plano: internamente SÍ recorre las propiedades de formato de cada carácter
// (CHPX, el bloque binario donde Word guarda negrita/cursiva/etc.) pero únicamente para
// detectar texto borrado, y descarta el resto. Aquí reutilizamos sus piezas de bajo nivel
// (lectura del contenedor OLE) para releer esas mismas propiedades y quedarnos también con
// el estado de negrita de cada carácter, reconstruyendo el cuerpo como HTML con <strong>
// en vez de texto plano. Así, en archivos .doc antiguos, se respeta la negrita real del
// documento en vez de tener que adivinarla.
//
// Referencia del formato: [MS-DOC], sección "Sprm" (2.6.1) y CHPX FKP (2.8.4/2.9.20).
import OleCompoundDoc from 'word-extractor/lib/ole-compound-doc';
import BufferReader from 'word-extractor/lib/buffer-reader';
import { binaryToUnicode, clean, filter } from 'word-extractor/lib/filters';

interface Piece {
  startCp: number;
  endCp: number;
  startFilePos: number;
  bpc: number;
  text: string;
}

interface BoldRange {
  start: number;
  end: number;
  bold: boolean;
}

function getPieceIndexByCP(pieces: Piece[], position: number): number {
  for (let i = 0; i < pieces.length; i++) {
    if (position <= pieces[i].endCp) return i;
  }
  return pieces.length - 1;
}

function getPieceIndexByFilePos(pieces: Piece[], position: number): number {
  for (let i = 0; i < pieces.length; i++) {
    if (position <= pieces[i].startFilePos + pieces[i].text.length * pieces[i].bpc) return i;
  }
  return pieces.length - 1;
}

function fillPieceRangeByFilePos(piece: Piece, start: number, end: number, character: string) {
  const pieceStart = piece.startFilePos;
  const pieceEnd = pieceStart + piece.text.length * piece.bpc;
  const original = piece.text;
  if (start < pieceStart) start = pieceStart;
  if (end > pieceEnd) end = pieceEnd;
  piece.text =
    (start === pieceStart ? '' : original.slice(0, (start - pieceStart) / piece.bpc)) +
    ''.padStart((end - start) / piece.bpc, character) +
    (end === pieceEnd ? '' : original.slice((end - pieceEnd) / piece.bpc));
}

function replaceSelectedRangeByFilePos(pieces: Piece[], start: number, end: number, character: string) {
  const startPiece = getPieceIndexByFilePos(pieces, start);
  const endPiece = getPieceIndexByFilePos(pieces, end);
  for (let i = startPiece; i <= endPiece; i++) {
    fillPieceRangeByFilePos(pieces[i], start, end, character);
  }
}

type SprmHandler = (buffer: Buffer, offset: number, sprm: number, ispmd: number, fspec: number, sgc: number, spra: number) => void;

function processSprms(buffer: Buffer, offset: number, handler: SprmHandler) {
  while (offset < buffer.length - 1) {
    const sprm = buffer.readUInt16LE(offset);
    const ispmd = sprm & 0x1f;
    const fspec = (sprm >> 9) & 0x01;
    const sgc = (sprm >> 10) & 0x07;
    const spra = (sprm >> 13) & 0x07;

    offset += 2;
    handler(buffer, offset, sprm, ispmd, fspec, sgc, spra);

    if (spra === 0 || spra === 1) offset += 1;
    else if (spra === 2) offset += 2;
    else if (spra === 3) offset += 4;
    else if (spra === 4 || spra === 5) offset += 2;
    else if (spra === 6) offset += buffer.readUInt8(offset) + 1;
    else if (spra === 7) offset += 3;
    else throw new Error('Unparsed sprm');
  }
}

// sprmCFRMarkDel: marca de texto borrado (rastreado también por word-extractor).
const ISPMD_DELETED = 0x00;
// sprmCFBold: alterna negrita para el carácter. sgc=2 (grupo de propiedades de carácter).
const SGC_CHARACTER = 2;
const ISPMD_BOLD = 0x15;

function streamBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('error', (error: Error) => reject(error));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function escapeHtmlChar(ch: string): string {
  if (ch === '&') return '&amp;';
  if (ch === '<') return '&lt;';
  if (ch === '>') return '&gt;';
  return ch;
}

function isBoldAtFilePos(boldRanges: BoldRange[], fc: number): boolean {
  for (let i = boldRanges.length - 1; i >= 0; i--) {
    const r = boldRanges[i];
    if (fc >= r.start && fc < r.end) return r.bold;
  }
  return false;
}

// Reconstruye el rango [start, end) (en cp) como HTML, envolviendo en <strong> los
// tramos que estaban en negrita en el Word original. Cierra cualquier <strong> abierto
// antes de un salto de párrafo para que cada <p> quede balanceado por su cuenta.
function getHtmlRangeByCP(pieces: Piece[], boldRanges: BoldRange[], start: number, end: number): string {
  const startPieceIdx = getPieceIndexByCP(pieces, start);
  const endPieceIdx = getPieceIndexByCP(pieces, end);
  let html = '';
  let currentlyBold = false;

  for (let i = startPieceIdx; i <= endPieceIdx; i++) {
    const piece = pieces[i];
    const xstart = i === startPieceIdx ? start - piece.startCp : 0;
    const xend = i === endPieceIdx ? end - piece.startCp : piece.endCp - piece.startCp;

    for (let k = xstart; k < xend; k++) {
      const ch = piece.text[k];
      if (ch === '\n') {
        if (currentlyBold) {
          html += '</strong>';
          currentlyBold = false;
        }
        html += ch;
        continue;
      }
      const fc = piece.startFilePos + k * piece.bpc;
      const bold = isBoldAtFilePos(boldRanges, fc);
      if (bold !== currentlyBold) {
        html += bold ? '<strong>' : '</strong>';
        currentlyBold = bold;
      }
      html += escapeHtmlChar(ch);
    }
  }
  if (currentlyBold) html += '</strong>';
  return html;
}

/**
 * Lee un .doc antiguo (Word 97-2003) y devuelve su cuerpo como HTML, preservando la
 * negrita real del documento. Devuelve null si el archivo no tiene este formato o si
 * ocurre cualquier error al interpretarlo (el llamador debe usar un método de respaldo).
 */
export async function extractLegacyDocWithBold(arrayBuffer: ArrayBuffer): Promise<string | null> {
  try {
    const reader = new BufferReader(Buffer.from(arrayBuffer));
    const oleDoc = new OleCompoundDoc(reader);
    await oleDoc.read();

    const wordDocumentBuffer = await streamBuffer(oleDoc.stream('WordDocument'));

    const magic = wordDocumentBuffer.readUInt16LE(0);
    if (magic !== 0xa5ec) return null;

    const flags = wordDocumentBuffer.readUInt16LE(0xa);
    const tableStreamName = (flags & 0x0200) !== 0 ? '1Table' : '0Table';
    const tableBuffer = await streamBuffer(oleDoc.stream(tableStreamName));

    const ccpText = wordDocumentBuffer.readUInt32LE(0x004c);

    // ---- Piece table: dónde vive el texto real (puede no estar en orden lineal) ----
    const pieces: Piece[] = [];
    {
      let pos = wordDocumentBuffer.readUInt32LE(0x01a2);
      let flag = tableBuffer.readUInt8(pos);
      while (flag === 1) {
        pos = pos + 1;
        const skip = tableBuffer.readUInt16LE(pos);
        pos = pos + 2 + skip;
        flag = tableBuffer.readUInt8(pos);
      }
      pos = pos + 1;
      if (flag !== 2) return null;

      const pieceTableSize = tableBuffer.readUInt32LE(pos);
      pos = pos + 4;
      const pieceCount = (pieceTableSize - 4) / 12;

      let startCp = 0;
      for (let x = 0; x < pieceCount; x++) {
        const offset = pos + ((pieceCount + 1) * 4) + (x * 8) + 2;
        let startFilePos = tableBuffer.readUInt32LE(offset);
        let unicode = false;
        if ((startFilePos & 0x40000000) === 0) {
          unicode = true;
        } else {
          startFilePos = startFilePos & ~0x40000000;
          startFilePos = Math.floor(startFilePos / 2);
        }
        const lStart = tableBuffer.readUInt32LE(pos + (x * 4));
        const lEnd = tableBuffer.readUInt32LE(pos + ((x + 1) * 4));
        const bpc = unicode ? 2 : 1;
        const size = bpc * (lEnd - lStart);

        const textBuffer = wordDocumentBuffer.slice(startFilePos, startFilePos + size);
        const text = unicode ? textBuffer.toString('ucs2') : binaryToUnicode(textBuffer.toString('binary'));

        const piece: Piece = { startCp, endCp: startCp + text.length, startFilePos, bpc, text };
        startCp = piece.endCp;
        pieces.push(piece);
      }
    }

    // ---- Marcas de párrafo: igual que hace word-extractor, convierte el separador de
    // párrafo (sprm 0x2417) en un salto de línea real dentro del texto ----
    {
      const fcPlcfbtePapx = wordDocumentBuffer.readUInt32LE(0x0102);
      const lcbPlcfbtePapx = wordDocumentBuffer.readUInt32LE(0x0106);
      const count = (lcbPlcfbtePapx - 4) / 8;
      const dataOffset = (count + 1) * 4;
      const plcBtePapx = tableBuffer.slice(fcPlcfbtePapx, fcPlcfbtePapx + lcbPlcfbtePapx);

      for (let i = 0; i < count; i++) {
        const papxFkpBlock = plcBtePapx.readUInt32LE(dataOffset + i * 4);
        const fkp = wordDocumentBuffer.slice(papxFkpBlock * 512, (papxFkpBlock + 1) * 512);
        const crun = fkp.readUInt8(511);

        for (let j = 0; j < crun; j++) {
          const rgfc = fkp.readUInt32LE(j * 4);
          const rgfcNext = fkp.readUInt32LE((j + 1) * 4);
          const cbLocation = (crun + 1) * 4 + j * 13;
          const cbIndex = fkp.readUInt8(cbLocation) * 2;

          let grpPrlAndIstd: Buffer;
          const cb = fkp.readUInt8(cbIndex);
          if (cb !== 0) {
            grpPrlAndIstd = fkp.slice(cbIndex + 1, cbIndex + 1 + (2 * cb) - 1);
          } else {
            const cb2 = fkp.readUInt8(cbIndex + 1);
            grpPrlAndIstd = fkp.slice(cbIndex + 2, cbIndex + 2 + 2 * cb2);
          }

          processSprms(grpPrlAndIstd, 2, (_buf, _offset, sprm) => {
            if (sprm === 0x2417) {
              replaceSelectedRangeByFilePos(pieces, rgfc, rgfcNext, '\n');
            }
          });
        }
      }
    }

    // ---- Propiedades de carácter: negrita + texto borrado ----
    const boldRanges: BoldRange[] = [];
    {
      const fcPlcfbteChpx = wordDocumentBuffer.readUInt32LE(0x00fa);
      const lcbPlcfbteChpx = wordDocumentBuffer.readUInt32LE(0x00fe);
      const count = (lcbPlcfbteChpx - 4) / 8;
      const dataOffset = (count + 1) * 4;
      const plcBteChpx = tableBuffer.slice(fcPlcfbteChpx, fcPlcfbteChpx + lcbPlcfbteChpx);

      let lastDeletionEnd: number | null = null;

      for (let i = 0; i < count; i++) {
        const chpxFkpBlock = plcBteChpx.readUInt32LE(dataOffset + i * 4);
        const fkp = wordDocumentBuffer.slice(chpxFkpBlock * 512, (chpxFkpBlock + 1) * 512);
        const crun = fkp.readUInt8(511);

        for (let j = 0; j < crun; j++) {
          const rgfc = fkp.readUInt32LE(j * 4);
          const rgfcNext = fkp.readUInt32LE((j + 1) * 4);
          const rgb = fkp.readUInt8((crun + 1) * 4 + j);

          if (rgb === 0) {
            boldRanges.push({ start: rgfc, end: rgfcNext, bold: false });
            continue;
          }

          const chpxOffset = rgb * 2;
          const cb = fkp.readUInt8(chpxOffset);
          const grpprl = fkp.slice(chpxOffset + 1, chpxOffset + 1 + cb);

          let bold = false;
          processSprms(grpprl, 0, (buf, offset, _sprm, ispmd, _fspec, sgc) => {
            if (ispmd === ISPMD_DELETED) {
              if ((buf[offset] & 1) === 1) {
                if (lastDeletionEnd === rgfc) {
                  replaceSelectedRangeByFilePos(pieces, lastDeletionEnd, rgfcNext, '\x00');
                } else {
                  replaceSelectedRangeByFilePos(pieces, rgfc, rgfcNext, '\x00');
                }
                lastDeletionEnd = rgfcNext;
              }
            }
            if (sgc === SGC_CHARACTER && ispmd === ISPMD_BOLD) {
              bold = (buf.readUInt8(offset) & 1) === 1;
            }
          });

          boldRanges.push({ start: rgfc, end: rgfcNext, bold });
        }
      }
    }

    const rawHtml = getHtmlRangeByCP(pieces, boldRanges, 0, ccpText);
    const cleaned = filter(clean(rawHtml));

    const paragraphs = cleaned.split(/\n+/).map((p: string) => p.trim()).filter(Boolean);
    if (paragraphs.length === 0) return null;
    return paragraphs.map((p: string) => `<p>${p}</p>`).join('');
  } catch (e) {
    console.warn('Lectura de negrita en .doc antiguo falló, se usará el modo de respaldo', e);
    return null;
  }
}
