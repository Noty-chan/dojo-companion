import type { BackgroundState } from "../types";
import { boardSize } from "./grid";
import type { GridType } from "../types";
import { supabase } from "./room";

// Фон арены. Картинка ужимается на клиенте (до 2048px, JPEG) и уезжает в Supabase
// Storage (bucket dojo-backgrounds, публичный) — в состояние комнаты попадает только URL.
// Без сети/комнаты используется dataURL: локально работает, но в комнату не отправится
// (broadcast не потянет мегабайты), поэтому в комнате всегда пробуем Storage.

const MAX_SIDE = 2048;

export async function prepareBackgroundImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("Не удалось сжать картинку."))), "image/jpeg", 0.85);
  });
  return { blob, width, height };
}

export async function uploadBackground(blob: Blob): Promise<string> {
  const name = `bg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase().storage.from("dojo-backgrounds").upload(name, blob, { contentType: "image/jpeg" });
  if (error) throw new Error(`Не удалось загрузить фон: ${error.message}`);
  return supabase().storage.from("dojo-backgrounds").getPublicUrl(name).data.publicUrl;
}

// Картинка фишки: центр-кроп в квадрат и ужатие до 128px — dataURL получается
// ~5–10 КБ и спокойно едет в состояние комнаты вместе с фишкой.
export async function prepareTokenImage(file: File): Promise<string> {
  const SIDE = 128;
  const bitmap = await createImageBitmap(file);
  const crop = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - crop) / 2;
  const sy = (bitmap.height - crop) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = SIDE;
  canvas.height = SIDE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен.");
  ctx.drawImage(bitmap, sx, sy, crop, crop, 0, 0, SIDE, SIDE);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Не удалось прочитать файл."));
    reader.readAsDataURL(blob);
  });
}

// Стартовое размещение: вписать картинку так, чтобы она накрывала поле целиком (cover).
export function fitBackground(url: string, natW: number, natH: number, gridType: GridType, gridW: number, gridH: number): BackgroundState {
  const board = boardSize(gridType, gridW, gridH);
  const scale = Math.max(board.x / natW, board.y / natH);
  return {
    url,
    natW,
    natH,
    scale,
    x: (board.x - natW * scale) / 2,
    y: (board.y - natH * scale) / 2,
    opacity: 1,
  };
}
