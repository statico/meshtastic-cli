import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface LocalSettings {
  meshViewUrl?: string;
}

const CONFIG_DIR = join(homedir(), ".config", "meshtastic-cli");
const SETTINGS_FILE = join(CONFIG_DIR, "settings.json");

function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadSettings(): LocalSettings {
  try {
    if (existsSync(SETTINGS_FILE)) {
      const data = readFileSync(SETTINGS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch {
    // Ignore errors, return defaults
  }
  return {};
}

export function saveSettings(settings: LocalSettings) {
  ensureConfigDir();
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

export function getSetting<K extends keyof LocalSettings>(key: K): LocalSettings[K] {
  return loadSettings()[key];
}

export function setSetting<K extends keyof LocalSettings>(key: K, value: LocalSettings[K]) {
  const settings = loadSettings();
  settings[key] = value;
  saveSettings(settings);
}

export const DEFAULT_MESHVIEW_URL = "https://meshview.bayme.sh";
