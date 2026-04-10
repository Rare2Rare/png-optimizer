import type { OptimizationSettings, SettingsPreset } from "./types";

const KEY_SETTINGS = "lastSettings";
const KEY_PRESETS = "presets";
const KEY_OUTPUT_DIR = "lastOutputDir";
const KEY_WATCH_DIR = "lastWatchDir";
const KEY_RECENT_OUTPUT = "recentOutputDirs";
const KEY_RECENT_WATCH = "recentWatchDirs";
const MAX_RECENT = 5;

function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage quota exceeded or disabled
  }
}

// ---- Settings persistence ----

export function loadSettings(): Partial<OptimizationSettings> | null {
  return safeGet<Partial<OptimizationSettings> | null>(KEY_SETTINGS, null);
}

export function saveSettings(settings: OptimizationSettings): void {
  safeSet(KEY_SETTINGS, settings);
}

// ---- Presets ----

export function loadPresets(): SettingsPreset[] {
  return safeGet<SettingsPreset[]>(KEY_PRESETS, []);
}

export function savePresets(presets: SettingsPreset[]): void {
  safeSet(KEY_PRESETS, presets);
}

// ---- Recent folders ----

function addToRecent(key: string, path: string): string[] {
  if (!path) return safeGet<string[]>(key, []);
  const current = safeGet<string[]>(key, []);
  const filtered = current.filter((p) => p !== path);
  const next = [path, ...filtered].slice(0, MAX_RECENT);
  safeSet(key, next);
  return next;
}

export function loadRecentOutputDirs(): string[] {
  return safeGet<string[]>(KEY_RECENT_OUTPUT, []);
}

export function pushRecentOutputDir(path: string): string[] {
  return addToRecent(KEY_RECENT_OUTPUT, path);
}

export function loadRecentWatchDirs(): string[] {
  return safeGet<string[]>(KEY_RECENT_WATCH, []);
}

export function pushRecentWatchDir(path: string): string[] {
  return addToRecent(KEY_RECENT_WATCH, path);
}

// ---- Last used folders (for restoration on startup) ----

export function loadLastOutputDir(): string {
  return safeGet<string>(KEY_OUTPUT_DIR, "");
}

export function saveLastOutputDir(path: string): void {
  safeSet(KEY_OUTPUT_DIR, path);
}

export function loadLastWatchDir(): string {
  return safeGet<string>(KEY_WATCH_DIR, "");
}

export function saveLastWatchDir(path: string): void {
  safeSet(KEY_WATCH_DIR, path);
}
