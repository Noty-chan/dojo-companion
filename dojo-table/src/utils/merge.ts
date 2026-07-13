import type { Drawing, LogEntry, TableState, TableToken } from "../types";

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeObject<T extends object>(base: T, local: T, remote: T): T {
  const result = { ...remote } as Record<string, unknown>;
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const key of keys) {
    const baseValue = (base as Record<string, unknown>)[key];
    const localValue = (local as Record<string, unknown>)[key];
    const remoteValue = (remote as Record<string, unknown>)[key];
    if (!same(localValue, baseValue)) result[key] = localValue;
    else result[key] = remoteValue;
  }
  return result as T;
}

function mergeById<T extends { id: string }>(base: T[], local: T[], remote: T[], mergeItem: (base: T, local: T, remote: T) => T): T[] {
  const baseById = new Map(base.map((item) => [item.id, item]));
  const localById = new Map(local.map((item) => [item.id, item]));
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  const ids = new Set([...baseById.keys(), ...localById.keys(), ...remoteById.keys()]);
  const result: T[] = [];

  for (const id of ids) {
    const baseItem = baseById.get(id);
    const localItem = localById.get(id);
    const remoteItem = remoteById.get(id);
    if (!baseItem) {
      // Одновременные добавления с одинаковым id практически невозможны; локальная версия приоритетнее.
      if (localItem ?? remoteItem) result.push((localItem ?? remoteItem)!);
      continue;
    }
    if (!localItem) continue; // локальное удаление
    if (!remoteItem) {
      if (!same(localItem, baseItem)) result.push(localItem); // локально изменили, а удалён удалённо — сохраняем работу
      continue;
    }
    result.push(mergeItem(baseItem, localItem, remoteItem));
  }
  return result;
}

/**
 * Накладывает локальные изменения относительно base на более свежую remote-версию.
 * Конфликт одного и того же поля решается в пользу локального пользователя; независимые
 * правки разных полей и фишек сохраняются с обеих сторон.
 */
export function mergeTableStates(base: TableState, local: TableState, remote: TableState): TableState {
  const merged = mergeObject(base, local, remote);
  merged.tokens = mergeById<TableToken>(base.tokens, local.tokens, remote.tokens, mergeObject);
  merged.log = mergeById<LogEntry>(base.log, local.log, remote.log, mergeObject);
  merged.drawings = mergeById<Drawing>(base.drawings, local.drawings, remote.drawings, mergeObject);
  return merged;
}

export function sameTableState(left: TableState, right: TableState): boolean {
  return same(left, right);
}
