import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { CharacterBuild, EnemyBuild } from "../types";
import type { EncounterPreset, Party, SavedHero, SceneState } from "../appTypes";

// Облачная синхронизация — опциональный слой поверх локального хранилища.
// Приложение полностью работает офлайн; аккаунт нужен только чтобы переносить
// данные между устройствами и делиться пачкой между ГМом и игроками.
//
// Бэкенд — Supabase (бесплатного тира хватает): проект создаёт владелец,
// URL и anon-ключ вводятся в настройках прямо в приложении и лежат в localStorage,
// поэтому сборка для GitHub Pages не требует секретов.

export interface CloudConfig {
  url: string;
  anonKey: string;
}

// Проект владельца перевода, прошитый по умолчанию (создан 2026-07-03).
// Publishable-ключ публичный по замыслу Supabase; данные защищены RLS-политиками.
// Свой проект можно подставить через «Отвязать проект» → ввести другие значения.
export const defaultCloudConfig: CloudConfig = {
  url: "https://jxtuodarhifnrxplogyy.supabase.co",
  anonKey: "sb_publishable_NtZvUQdpCviEm0yKH6AvfA_DLPpiaFs",
};

const cloudConfigStorageKey = "panic-dojo.cloud-config.v1";

export function loadCloudConfig(): CloudConfig | undefined {
  try {
    const raw = window.localStorage.getItem(cloudConfigStorageKey);
    if (!raw) return defaultCloudConfig;
    const parsed = JSON.parse(raw);
    if (parsed?.detached === true) return undefined;
    if (typeof parsed?.url === "string" && typeof parsed?.anonKey === "string" && parsed.url && parsed.anonKey) {
      return { url: parsed.url, anonKey: parsed.anonKey };
    }
    return defaultCloudConfig;
  } catch {
    return defaultCloudConfig;
  }
}

export function saveCloudConfig(config: CloudConfig | undefined) {
  try {
    // «Отвязали» — запоминаем это явно, иначе при загрузке вернётся прошитый проект.
    if (!config) window.localStorage.setItem(cloudConfigStorageKey, JSON.stringify({ detached: true }));
    else window.localStorage.setItem(cloudConfigStorageKey, JSON.stringify(config));
  } catch {
    // Настройки останутся на сессию в памяти.
  }
}

let cachedClient: SupabaseClient | undefined;
let cachedConfigKey = "";

export function cloudClient(config: CloudConfig): SupabaseClient {
  const key = `${config.url}::${config.anonKey}`;
  if (!cachedClient || cachedConfigKey !== key) {
    cachedClient = createClient(config.url, config.anonKey);
    cachedConfigKey = key;
  }
  return cachedClient;
}

// Снапшот — весь переносимый прогресс одним JSON-документом (одна строка на пользователя
// в таблице dojo_snapshots). Push/pull запускаются вручную: это проще и предсказуемее,
// чем фоновая синхронизация, и не может молча затереть данные.
export interface CloudSnapshot {
  schemaVersion: 1;
  savedAt: string;
  savedHeroes: SavedHero[];
  parties: Party[];
  encounterPresets: EncounterPreset[];
  scene: SceneState;
  enemyRoster: EnemyBuild[];
  enemyBuild: EnemyBuild;
  currentBuild: CharacterBuild;
}

export async function signIn(config: CloudConfig, email: string, password: string): Promise<User> {
  const { data, error } = await cloudClient(config).auth.signInWithPassword({ email, password });
  if (error) throw new Error(translateAuthError(error.message));
  return data.user;
}

export async function signUp(config: CloudConfig, email: string, password: string): Promise<User | null> {
  // Если в проекте включено подтверждение почты, письмо по умолчанию ведёт на Site URL
  // проекта (у свежего проекта это localhost:3000). Просим Supabase вернуть пользователя
  // на текущий адрес приложения — тогда сессия подхватится автоматически.
  const emailRedirectTo =
    typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : undefined;
  const { data, error } = await cloudClient(config).auth.signUp({
    email,
    password,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });
  if (error) throw new Error(translateAuthError(error.message));
  return data.user;
}

export async function signOut(config: CloudConfig): Promise<void> {
  await cloudClient(config).auth.signOut();
}

export async function currentUser(config: CloudConfig): Promise<User | undefined> {
  const { data } = await cloudClient(config).auth.getSession();
  return data.session?.user ?? undefined;
}

export async function pushSnapshot(config: CloudConfig, snapshot: CloudSnapshot): Promise<void> {
  const client = cloudClient(config);
  const { data } = await client.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Сначала войдите в аккаунт.");
  const { error } = await client
    .from("dojo_snapshots")
    .upsert({ user_id: userId, payload: snapshot, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error(`Не удалось сохранить в облако: ${error.message}`);
}

export async function pullSnapshot(config: CloudConfig): Promise<CloudSnapshot | undefined> {
  const client = cloudClient(config);
  const { data: session } = await client.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error("Сначала войдите в аккаунт.");
  const { data, error } = await client.from("dojo_snapshots").select("payload").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`Не удалось загрузить из облака: ${error.message}`);
  const payload = data?.payload as CloudSnapshot | undefined;
  if (!payload || payload.schemaVersion !== 1) return undefined;
  return payload;
}

function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Неверная почта или пароль.";
  if (/user already registered/i.test(message)) return "Такой аккаунт уже есть — попробуйте войти.";
  if (/password should be at least/i.test(message)) return "Пароль слишком короткий (минимум 6 символов).";
  if (/email not confirmed/i.test(message)) return "Почта не подтверждена — проверьте письмо от Supabase.";
  if (/failed to fetch/i.test(message)) return "Не удалось связаться с сервером. Проверьте URL проекта и интернет.";
  return message;
}
