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
const MAX_LOG_SIZE = 1024 * 1024; // 1 MB - extracted to constant

// Truncate log file if it exceeds max size
function truncateLogIfNeeded() {
  try {
    const stats = statSync(ERROR_LOG_PATH);
    if (stats.size > MAX_LOG_SIZE) {
      const buf = readFileSync(ERROR_LOG_PATH);
      const truncated = buf.slice(-MAX_LOG_SIZE);
      const content = truncated.toString("utf-8");
      // Find first complete entry (starts with newline + timestamp)
      const firstEntry = content.indexOf("\n[");
      writeFileSync(ERROR_LOG_PATH, firstEntry > 0 ? content.slice(firstEntry) : content);
    }
  } catch (e) {
    console.error("Failed to truncate log file:", e instanceof Error ? e.message : String(e));
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
  } catch (e) {
    console.error("Failed to write error log:", e instanceof Error ? e.message : String(e));
  }
}

// Check log size at startup
truncateLogIfNeeded();

process.on("uncaughtException", (error) => {
  logError("UNCAUGHT EXCEPTION", error);
  Logger.error("Process", "Uncaught exception", error);
  Logger.shutdown();
  // Use console.error for fatal errors as Logger may not be available
  console.error("Fatal error:", error.message);
  console.error(`Stack trace saved to ${ERROR_LOG_PATH}`);
  db.closeDb();
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logError("UNHANDLED REJECTION", reason);
  Logger.error("Process", "Unhandled rejection", reason instanceof Error ? reason : undefined, {
    reason: String(reason)
  });
  Logger.shutdown();
  // Use console.error for fatal errors as Logger may not be available
  console.error("Unhandled promise rejection:", reason);
  db.closeDb();
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
let address: string | undefined;
let skipConfig = false;
let skipNodes = false;
let session = "default";
let clearSession = false;
let meshViewUrl: string | undefined;
let useFahrenheit = false;
let enableLogging = true;
let packetLimit = 1000;
let httpPort: number | undefined;
let useTls = false;
let insecure = false;
let pcapFile: string | undefined;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--skip-config" || arg === "-C") {
    skipConfig = true;
  } else if (arg === "--skip-nodes" || arg === "-N") {
    skipNodes = true;
  } else if (arg === "--session" || arg === "-s") {
    if (i + 1 >= args.length) {
      console.error("--session requires a session name");
      process.exit(1);
    }
    const sessionArg = args[++i];
    try {
      session = validateSessionName(sessionArg);
    } catch (error) {
      console.error(`Invalid session name: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  } else if (arg === "--clear") {
    clearSession = true;
  } else if (arg === "--meshview" || arg === "-m") {
    if (i + 1 >= args.length) {
      console.error("--meshview requires a URL");
      process.exit(1);
    }
    const urlArg = args[++i];
    try {
      validateUrl(urlArg); // Validate URL format and protocol
      meshViewUrl = urlArg;
    } catch (error) {
      console.error(`Invalid MeshView URL: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  } else if (arg === "--fahrenheit" || arg === "-F") {
    useFahrenheit = true;
  } else if (arg === "--enable-logging" || arg === "-L") {
    enableLogging = true;
  } else if (arg === "--packet-limit" || arg === "-p") {
    if (i + 1 >= args.length) {
      console.error("--packet-limit requires a number");
      process.exit(1);
    }
    const limit = parseInt(args[++i], 10);
    if (isNaN(limit) || limit < 1 || limit > 1000000) {
      console.error("Packet limit must be between 1 and 1,000,000");
      process.exit(1);
    }
    packetLimit = limit;
  } else if (arg === "--port" || arg === "-P") {
    if (i + 1 >= args.length) {
      console.error("--port requires a port number");
      process.exit(1);
    }
    const portArg = args[++i];
    const port = parseInt(portArg, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error("Port must be between 1 and 65535");
      process.exit(1);
    }
    httpPort = port;
  } else if (arg === "--tls" || arg === "-T") {
    useTls = true;
  } else if (arg === "--insecure" || arg === "-k") {
    insecure = true;
  } else if (arg === "--pcap") {
    if (i + 1 >= args.length) {
      console.error("--pcap requires a file path");
      process.exit(1);
    }
    pcapFile = args[++i];
  } else if (arg === "--help" || arg === "-h") {
    console.log(`
Meshtastic CLI Viewer

Usage: meshtastic-cli <address> [options]

Arguments:
  address            Device address (required) - IP address, hostname, or serial port

Options:
  --session, -s         Session name for database (default: default)
  --clear               Clear the database for the session and exit
  --skip-config, -C     Skip loading device configuration on startup (faster connect)
  --skip-nodes, -N      Skip downloading node database on startup (much faster connect)
  --meshview, -m        MeshView URL for packet/node links (default: from settings or disabled)
  --fahrenheit, -F      Display temperatures in Fahrenheit instead of Celsius
  --packet-limit, -p    Maximum packets to store in database (default: 1000)
  --port, -P            HTTP port number (default: 4403 if no port in address)
  --tls, -T             Use HTTPS instead of HTTP
  --insecure, -k        Accept self-signed SSL certificates
  --pcap <file>         Write packets to pcap file for analysis
  --enable-logging, -L  Enable verbose logging to ~/.config/meshtastic-cli/log
  --help, -h            Show this help message
`);
    process.exit(0);
  } else if (!arg.startsWith("-")) {
    if (address) {
      console.error("Error: Multiple addresses specified. Only one address is allowed.");
      process.exit(1);
    }
    try {
      address = validateAddress(arg);
    } catch (error) {
      console.error(`Invalid address: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }
}

// Require address to be specified
if (!address) {
  console.error("Error: Device address is required");
  console.error("Usage: meshtastic-cli <address> [options]");
  console.error("Run with --help for more information");
  process.exit(1);
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
    httpPort,
    useTls,
    insecure,
    pcapFile,
  })
);

waitUntilExit().catch((e) => {
  const error = e instanceof Error ? e : new Error(String(e));
  Logger.error("Main", "Application exit error", error);
  console.error("Failed:", error.message);
  db.closeDb();
  Logger.shutdown();
  process.exit(1);
});
