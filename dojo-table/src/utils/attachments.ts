import type { SharedFile } from "../types";

export const maxSharedFileBytes = 256 * 1024;
export const maxSharedFilesPerToken = 8;

export function readableFileSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} Б` : `${Math.ceil(bytes / 1024)} КБ`;
}

export async function prepareSharedFile(file: File): Promise<SharedFile> {
  if (file.size > maxSharedFileBytes) {
    throw new Error(`Файл «${file.name}» больше ${readableFileSize(maxSharedFileBytes)}.`);
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Не удалось прочитать файл.")));
    reader.onerror = () => reject(reader.error ?? new Error("Не удалось прочитать файл."));
    reader.readAsDataURL(file);
  });
  return {
    id: `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name.slice(0, 160),
    type: file.type || "application/octet-stream",
    size: file.size,
    dataUrl,
    addedAt: new Date().toISOString(),
  };
}
