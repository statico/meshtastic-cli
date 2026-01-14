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
import { validateAddress, validateSessionName, validateUrl } from "./utils/safe-exec";

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

// Final safety net - flush logs and close database on any exit
process.on("exit", (code) => {
  db.closeDb();
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
    const sessionArg = args[++i] || "default";
    try {
      session = validateSessionName(sessionArg);
    } catch (error) {
      console.error(`Invalid session name: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  } else if (arg === "--clear") {
    clearSession = true;
  } else if (arg === "--meshview" || arg === "-m") {
    const urlArg = args[++i];
    if (urlArg) {
      try {
        validateUrl(urlArg); // Validate URL format and protocol
        meshViewUrl = urlArg;
      } catch (error) {
        console.error(`Invalid MeshView URL: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    }
  } else if (arg === "--fahrenheit" || arg === "-F") {
    useFahrenheit = true;
  } else if (arg === "--enable-logging" || arg === "-L") {
    enableLogging = true;
  } else if (arg === "--packet-limit" || arg === "-p") {
    const limit = parseInt(args[++i], 10);
    if (isNaN(limit) || limit < 1 || limit > 1000000) {
      console.error("Packet limit must be between 1 and 1,000,000");
      process.exit(1);
    }
    packetLimit = limit;
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
    try {
      address = validateAddress(arg);
    } catch (error) {
      console.error(`Invalid address: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
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
let resolvedMeshViewUrl = meshViewUrl || getSetting("meshViewUrl");
// Validate MeshView URL from settings if present
if (resolvedMeshViewUrl) {
  try {
    validateUrl(resolvedMeshViewUrl);
  } catch (error) {
    Logger.warn("Main", "Invalid MeshView URL in settings, ignoring", {
      url: resolvedMeshViewUrl,
      error: error instanceof Error ? error.message : String(error)
    });
    resolvedMeshViewUrl = undefined;
  }
}

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
