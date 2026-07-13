export interface PortableCardLine {
  label: string;
  value: string;
}

export interface PortableCardOptions {
  title: string;
  subtitle: string;
  kind: string;
  accent: string;
  lines: PortableCardLine[];
  footer?: string;
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const PORTABLE_CHUNK = "doJO";

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Не удалось прочитать файл."));
    reader.readAsDataURL(file);
  });
}

export async function downloadPortableCardPng(fileName: string, card: PortableCardOptions, payload: unknown) {
  const png = await renderCardPng(card);
  const embedded = embedPayload(png, payload);
  const buffer = new ArrayBuffer(embedded.byteLength);
  new Uint8Array(buffer).set(embedded);
  downloadBlob(new Blob([buffer], { type: "image/png" }), fileName);
}

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

async function renderCardPng(card: PortableCardOptions): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 760;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен.");

  ctx.fillStyle = "#f4f6f4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#16222a";
  roundRect(ctx, 44, 42, 1112, 676, 24);
  ctx.fill();

  ctx.fillStyle = card.accent;
  roundRect(ctx, 76, 74, 88, 88, 20);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 52px Arial";
  ctx.fillText("道", 98, 133);

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 48px Arial";
  drawMultiline(ctx, card.title, 190, 106, 760, 54, 2);
  ctx.fillStyle = "#aebcc3";
  ctx.font = "700 22px Arial";
  ctx.fillText(card.subtitle, 192, 174);

  ctx.textAlign = "right";
  ctx.fillStyle = card.accent;
  ctx.font = "900 21px Arial";
  ctx.fillText(card.kind.toUpperCase(), 1124, 106);
  ctx.textAlign = "left";

  ctx.strokeStyle = "#334652";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(76, 206);
  ctx.lineTo(1124, 206);
  ctx.stroke();

  let y = 248;
  card.lines.slice(0, 9).forEach((line, index) => {
    const h = index < 3 ? 64 : 54;
    ctx.fillStyle = index < 3 ? "#203041" : "#111c24";
    roundRect(ctx, 76, y, 1048, h, 13);
    ctx.fill();
    ctx.fillStyle = card.accent;
    ctx.font = "900 18px Arial";
    ctx.fillText(line.label.toUpperCase(), 100, y + 27);
    ctx.fillStyle = "#eef4f4";
    ctx.font = index < 3 ? "800 28px Arial" : "700 21px Arial";
    drawMultiline(ctx, line.value || "—", 300, y + 29, 790, index < 3 ? 31 : 24, index < 3 ? 1 : 2);
    y += h + 12;
  });

  ctx.fillStyle = "#8fa3ad";
  ctx.font = "600 18px Arial";
  ctx.fillText(card.footer ?? "Паника в Додзе · цифровой компаньон · данные зашиты в PNG", 76, 678);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("Не удалось собрать PNG."))), "image/png");
  });
  return new Uint8Array(await blob.arrayBuffer());
}

function embedPayload(png: Uint8Array, payload: unknown): Uint8Array {
  if (!hasPngSignature(png)) throw new Error("Неверный PNG.");
  const encoder = new TextEncoder();
  const typeBytes = encoder.encode(PORTABLE_CHUNK);
  const dataBytes = encoder.encode(JSON.stringify(payload));
  const chunk = new Uint8Array(12 + dataBytes.length);
  writeUint32(chunk, 0, dataBytes.length);
  chunk.set(typeBytes, 4);
  chunk.set(dataBytes, 8);
  writeUint32(chunk, 8 + dataBytes.length, crc32(concatBytes(typeBytes, dataBytes)));

  const iend = findIendOffset(png);
  const result = new Uint8Array(png.length + chunk.length);
  result.set(png.slice(0, iend), 0);
  result.set(chunk, iend);
  result.set(png.slice(iend), iend + chunk.length);
  return result;
}

function findIendOffset(bytes: Uint8Array) {
  let offset = 8;
  const decoder = new TextDecoder();
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = decoder.decode(bytes.slice(offset + 4, offset + 8));
    if (type === "IEND") return offset;
    offset += 12 + length;
  }
  throw new Error("PNG без IEND.");
}

function hasPngSignature(bytes: Uint8Array) {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function readUint32(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >>> 24) & 255;
  bytes[offset + 1] = (value >>> 16) & 255;
  bytes[offset + 2] = (value >>> 8) & 255;
  bytes[offset + 3] = value & 255;
}

function concatBytes(left: Uint8Array, right: Uint8Array) {
  const result = new Uint8Array(left.length + right.length);
  result.set(left, 0);
  result.set(right, left.length);
  return result;
}

let crcTable: Uint32Array | undefined;

function crc32(bytes: Uint8Array) {
  const table = crcTable ?? makeCrcTable();
  crcTable = table;
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawMultiline(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((value, index) => {
    const suffix = index === maxLines - 1 && lines.length > maxLines ? "..." : "";
    ctx.fillText(`${value}${suffix}`, x, y + index * lineHeight);
  });
}
