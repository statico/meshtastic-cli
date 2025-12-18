import React from "react";
import { render } from "ink";
import { appendFileSync, mkdirSync, existsSync, statSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { PacketStore, NodeStore } from "./protocol";
import { App } from "./ui/App";
import { initDb, clearDb, getDbPath } from "./db";
import { getSetting, DEFAULT_MESHVIEW_URL } from "./settings";

// Global error handler - append errors to log file
const ERROR_LOG_DIR = join(homedir(), ".config", "meshtastic-cli");
const ERROR_LOG_PATH = join(ERROR_LOG_DIR, "error.log");
const MAX_LOG_SIZE = 1024 * 1024; // 1 MB

// Truncate log file if it exceeds max size
function truncateLogIfNeeded() {
  try {
    if (!existsSync(ERROR_LOG_PATH)) return;
    const stats = statSync(ERROR_LOG_PATH);
    if (stats.size > MAX_LOG_SIZE) {
      const content = readFileSync(ERROR_LOG_PATH, "utf-8");
      const truncated = content.slice(-MAX_LOG_SIZE);
      // Find first complete entry (starts with newline + timestamp)
      const firstEntry = truncated.indexOf("\n[");
      writeFileSync(ERROR_LOG_PATH, firstEntry > 0 ? truncated.slice(firstEntry) : truncated);
    }
  } catch {
    // Ignore truncation errors
  }
}

function logError(type: string, error: Error | unknown) {
  try {
    if (!existsSync(ERROR_LOG_DIR)) {
      mkdirSync(ERROR_LOG_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString();
    const message = error instanceof Error
      ? `${error.message}\n${error.stack || ""}`
      : String(error);
    const entry = `\n[${timestamp}] ${type}\n${message}\n${"─".repeat(60)}\n`;
    appendFileSync(ERROR_LOG_PATH, entry);
  } catch {
    // Ignore logging errors
  }
}

// Check log size at startup
truncateLogIfNeeded();

process.on("uncaughtException", (error) => {
  logError("UNCAUGHT EXCEPTION", error);
  console.error("Fatal error:", error.message);
  console.error(`Stack trace saved to ${ERROR_LOG_PATH}`);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logError("UNHANDLED REJECTION", reason);
});

// Parse CLI arguments
const args = process.argv.slice(2);
let address = "192.168.0.123";
let skipConfig = false;
let session = "default";
let clearSession = false;
let bruteForceDepth = 2;
let meshViewUrl: string | undefined;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--skip-config") {
    skipConfig = true;
  } else if (arg === "--session" || arg === "-s") {
    session = args[++i] || "default";
  } else if (arg === "--clear") {
    clearSession = true;
  } else if (arg === "--brute-force" || arg === "-b") {
    const val = parseInt(args[++i], 10);
    if (!isNaN(val) && val >= 0 && val <= 4) {
      bruteForceDepth = val;
    }
  } else if (arg === "--meshview" || arg === "-m") {
    meshViewUrl = args[++i];
  } else if (arg === "--help" || arg === "-h") {
    console.log(`
Meshtastic CLI Viewer

Usage: meshtastic-cli [address] [options]

Arguments:
  address            Device address (default: 192.168.0.123)

Options:
  --session, -s      Session name for database (default: default)
  --clear            Clear the database for the session and exit
  --skip-config      Skip loading device configuration on startup (faster connect)
  --brute-force, -b  Brute force depth for encrypted packets (0-4, default: 2)
                     0=disabled, 1=256 keys, 2=65K keys, 3=16M keys, 4=4B keys
  --meshview, -m     MeshView URL for packet/node links (default: from settings or disabled)
                     Use "default" for ${DEFAULT_MESHVIEW_URL}
  --help, -h         Show this help message
`);
    process.exit(0);
  } else if (!arg.startsWith("-")) {
    address = arg;
  }
}

// Handle --clear option
if (clearSession) {
  const dbPath = getDbPath(session);
  clearDb(session);
  console.log(`Cleared database for session "${session}" (${dbPath})`);
  process.exit(0);
}

// Resolve meshview URL: CLI flag > settings > undefined
let resolvedMeshViewUrl: string | undefined;
if (meshViewUrl === "default") {
  resolvedMeshViewUrl = DEFAULT_MESHVIEW_URL;
} else if (meshViewUrl) {
  resolvedMeshViewUrl = meshViewUrl;
} else {
  resolvedMeshViewUrl = getSetting("meshViewUrl");
}

// Initialize database
initDb(session);

const packetStore = new PacketStore();
const nodeStore = new NodeStore();

const { waitUntilExit } = render(
  React.createElement(App, {
    address,
    packetStore,
    nodeStore,
    skipConfig,
    bruteForceDepth,
    meshViewUrl: resolvedMeshViewUrl,
  })
);

waitUntilExit().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
