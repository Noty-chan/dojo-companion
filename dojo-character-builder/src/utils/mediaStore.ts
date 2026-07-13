import type { MediaAsset } from "../types";

// Медиатека живёт в IndexedDB: data-URL картинок быстро упираются в лимит
// localStorage (~5 МБ), после чего запись молча падала и картинки пропадали при F5.

const DB_NAME = "panic-dojo";
const DB_VERSION = 1;
const STORE = "media-assets";
const legacyStorageKey = "panic-dojo.media-assets.v1";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB недоступна."));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Ошибка IndexedDB."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await requestToPromise(action(db.transaction(STORE, mode).objectStore(STORE)));
  } finally {
    db.close();
  }
}

export async function loadMediaAssets(): Promise<MediaAsset[]> {
  await migrateLegacyAssets();
  const assets = await withStore("readonly", (store) => store.getAll() as IDBRequest<MediaAsset[]>);
  return assets.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export async function putMediaAsset(asset: MediaAsset): Promise<void> {
  await withStore("readwrite", (store) => store.put(asset));
}

export async function deleteMediaAsset(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

// Разовый перенос картинок, сохранённых прежней версией в localStorage.
async function migrateLegacyAssets(): Promise<void> {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(legacyStorageKey);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && typeof item.id === "string" && typeof item.dataUrl === "string") {
          await putMediaAsset(item as MediaAsset);
        }
      }
    }
  } catch {
    // Битые старые данные переносить не из чего.
  }
  try {
    window.localStorage.removeItem(legacyStorageKey);
  } catch {
    // ignore
  }
}
