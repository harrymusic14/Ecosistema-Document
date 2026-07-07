// word-extractor no publica tipos para sus módulos internos (solo para la API pública),
// así que se declaran sueltos aquí para poder reutilizarlos en legacyDocBoldExtractor.ts.
declare module 'word-extractor/lib/ole-compound-doc' {
  export default class OleCompoundDoc {
    constructor(reader: unknown);
    read(): Promise<void>;
    stream(name: string): NodeJS.ReadableStream;
  }
}

declare module 'word-extractor/lib/buffer-reader' {
  export default class BufferReader {
    constructor(buffer: Buffer);
    open(): Promise<void>;
    close(): Promise<void>;
  }
}

declare module 'word-extractor/lib/filters' {
  export function binaryToUnicode(value: string): string;
  export function clean(value: string): string;
  export function filter(value: string): string;
}
