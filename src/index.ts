import React from "react";
import { render } from "ink";
import { appendFileSync, mkdirSync, existsSync, statSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { PacketStore, NodeStore } from "./protocol";
import { App } from "./ui/App";
import * as db from "./db";
import { getSetting } from "./settings";
import { Logger } from "./logger";

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
  Logger.error("Process", "Uncaught exception", error);
  Logger.shutdown();
  console.error("Fatal error:", error.message);
  console.error(`Stack trace saved to ${ERROR_LOG_PATH}`);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logError("UNHANDLED REJECTION", reason);
  Logger.error("Process", "Unhandled rejection", reason instanceof Error ? reason : undefined, {
    reason: String(reason)
  });
  Logger.shutdown();
  console.error("Unhandled promise rejection:", reason);
  process.exit(1);
});

process.on("SIGTERM", () => {
  logError("SIGTERM", new Error("Received SIGTERM"));
  Logger.shutdown();
  process.exit(0);
});

process.on("SIGINT", () => {
  logError("SIGINT", new Error("Received SIGINT"));
  Logger.shutdown();
  process.exit(0);
});

process.on("SIGHUP", () => {
  logError("SIGHUP", new Error("Received SIGHUP"));
  Logger.shutdown();
  process.exit(0);
});

// Final safety net - flush logs on any exit
process.on("exit", (code) => {
  Logger.shutdown();
});

// Parse CLI arguments
const args = process.argv.slice(2);
let address = "192.168.0.123";
let skipConfig = false;
let skipNodes = false;
let session = "default";
let clearSession = false;
let meshViewUrl: string | undefined;
let useFahrenheit = false;
let enableLogging = true;
let packetLimit = 1000;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--skip-config" || arg === "-C") {
    skipConfig = true;
  } else if (arg === "--skip-nodes" || arg === "-N") {
    skipNodes = true;
  } else if (arg === "--session" || arg === "-s") {
    session = args[++i] || "default";
  } else if (arg === "--clear") {
    clearSession = true;
  } else if (arg === "--meshview" || arg === "-m") {
    meshViewUrl = args[++i];
  } else if (arg === "--fahrenheit" || arg === "-F") {
    useFahrenheit = true;
  } else if (arg === "--enable-logging" || arg === "-L") {
    enableLogging = true;
  } else if (arg === "--packet-limit" || arg === "-p") {
    const limit = parseInt(args[++i], 10);
    if (!isNaN(limit) && limit > 0) {
      packetLimit = limit;
    }
  } else if (arg === "--help" || arg === "-h") {
    console.log(`
Meshtastic CLI Viewer

Usage: meshtastic-cli [address] [options]

Arguments:
  address            Device address (default: 192.168.0.123)

Options:
  --session, -s         Session name for database (default: default)
  --clear               Clear the database for the session and exit
  --skip-config, -C     Skip loading device configuration on startup (faster connect)
  --skip-nodes, -N      Skip downloading node database on startup (much faster connect)
  --meshview, -m        MeshView URL for packet/node links (default: from settings or disabled)
  --fahrenheit, -F      Display temperatures in Fahrenheit instead of Celsius
  --packet-limit, -p    Maximum packets to store in database (default: 1000)
  --enable-logging, -L  Enable verbose logging to ~/.config/meshtastic-cli/log
  --help, -h            Show this help message
`);
    process.exit(0);
  } else if (!arg.startsWith("-")) {
    address = arg;
  }
}

// Handle --clear option
if (clearSession) {
  const dbPath = db.getDbPath(session);
  db.clearDb(session);
  console.log(`Cleared database for session "${session}" (${dbPath})`);
  process.exit(0);
}

// Resolve meshview URL: CLI flag > settings > undefined
const resolvedMeshViewUrl = meshViewUrl || getSetting("meshViewUrl");

// Initialize logger
Logger.init(enableLogging);
if (enableLogging) {
  Logger.info("Main", "Logging enabled", {
    address,
    session,
    skipConfig,
    skipNodes,
    meshViewUrl: resolvedMeshViewUrl,
    useFahrenheit,
  });
}

// Initialize database
db.initDb(session);
db.setPacketRetentionLimit(packetLimit);

const packetStore = new PacketStore(packetLimit);
const nodeStore = new NodeStore();

const { waitUntilExit } = render(
  React.createElement(App, {
    address,
    packetStore,
    nodeStore,
    skipConfig,
    skipNodes,
    meshViewUrl: resolvedMeshViewUrl,
    useFahrenheit,
  })
);

waitUntilExit().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
