// Чтение PNG-карточек компаньона (данные зашиты в PNG-чанк "doJO").
// Копия читающей части dojo-character-builder/src/utils/portablePng.ts.

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const PORTABLE_CHUNK = "doJO";

export async function extractPortablePayload(file: File): Promise<unknown | undefined> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!hasPngSignature(bytes)) return undefined;
  let offset = 8;
  const decoder = new TextDecoder();
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = decoder.decode(bytes.slice(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) break;
    if (type === PORTABLE_CHUNK) {
      const json = decoder.decode(bytes.slice(dataStart, dataEnd));
      return JSON.parse(json);
    }
    offset = dataEnd + 4;
  }
  return undefined;
}

function hasPngSignature(bytes: Uint8Array) {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function readUint32(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}
