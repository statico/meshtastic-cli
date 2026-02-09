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
const EXIT_LOG_PATH = join(ERROR_LOG_DIR, "exit.log");
const HEARTBEAT_PATH = join(ERROR_LOG_DIR, "heartbeat.log");
const MAX_LOG_SIZE = 1024 * 1024; // 1 MB - extracted to constant

// Track process state
const PROCESS_START_TIME = Date.now();
let lastHeartbeat = Date.now();
let isShuttingDown = false;

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

    // Write synchronously with explicit file descriptor to ensure it's flushed
    const fs = require("fs");
    const fd = fs.openSync(ERROR_LOG_PATH, "a");
    fs.writeSync(fd, entry);
    fs.fsyncSync(fd); // Force flush to disk
    fs.closeSync(fd);
  } catch (e) {
    // Force output even if file write fails
    try {
      process.stderr.write(`CRITICAL: Failed to write error log: ${e instanceof Error ? e.message : String(e)}\n`);
      process.stderr.write(`Original error: ${type}\n`);
    } catch (e2) {
      // Can't do anything
    }
  }
}

// Log exit events with detailed context
function logExit(reason: string, code?: number, details?: Record<string, any>) {
  try {
    if (!existsSync(ERROR_LOG_DIR)) {
      mkdirSync(ERROR_LOG_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString();
    const uptime = Date.now() - PROCESS_START_TIME;
    const uptimeStr = `${Math.floor(uptime / 3600000)}h ${Math.floor((uptime % 3600000) / 60000)}m ${Math.floor((uptime % 60000) / 1000)}s`;
    const timeSinceHeartbeat = Date.now() - lastHeartbeat;

    const entry = [
      `\n[${timestamp}] EXIT: ${reason}`,
      `Code: ${code ?? "none"}`,
      `Uptime: ${uptimeStr} (${uptime}ms)`,
      `Time since last heartbeat: ${timeSinceHeartbeat}ms`,
      `Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB / ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
      details ? `Details: ${JSON.stringify(details, null, 2)}` : "",
      `${"═".repeat(80)}\n`
    ].filter(Boolean).join("\n");

    // Write synchronously with explicit file descriptor to ensure it's flushed
    const fs = require("fs");
    const fd = fs.openSync(EXIT_LOG_PATH, "a");
    fs.writeSync(fd, entry);
    fs.fsyncSync(fd); // Force flush to disk
    fs.closeSync(fd);

    // Also write to stderr so it appears in terminal (synchronously)
    process.stderr.write(`\n${entry}`);
  } catch (e) {
    // Force output even if file write fails
    const errorMsg = `CRITICAL: Failed to write exit log: ${e instanceof Error ? e.message : String(e)}\n`;
    try {
      process.stderr.write(errorMsg);
      process.stderr.write(`Reason: ${reason}, Code: ${code ?? "none"}\n`);
    } catch (e2) {
      // Last resort - can't even write to stderr
    }
  }
}

// Write periodic heartbeat to detect silent crashes
function writeHeartbeat() {
  try {
    if (!existsSync(ERROR_LOG_DIR)) {
      mkdirSync(ERROR_LOG_DIR, { recursive: true });
    }
    lastHeartbeat = Date.now();
    const uptime = lastHeartbeat - PROCESS_START_TIME;
    const entry = `${new Date().toISOString()} | Uptime: ${uptime}ms | Heap: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n`;

    // Write synchronously and force flush to ensure heartbeat is on disk
    const fs = require("fs");
    const fd = fs.openSync(HEARTBEAT_PATH, "w"); // Overwrite previous
    fs.writeSync(fd, entry);
    fs.fsyncSync(fd); // Force flush to disk
    fs.closeSync(fd);
  } catch (e) {
    // Silently fail - heartbeat is not critical
  }
}

// Start heartbeat timer (every 10 seconds)
const heartbeatInterval = setInterval(writeHeartbeat, 10000);
writeHeartbeat(); // Write initial heartbeat

// Check log size at startup
truncateLogIfNeeded();

process.on("uncaughtException", (error) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logError("UNCAUGHT EXCEPTION", error);
  logExit("UNCAUGHT_EXCEPTION", 1, {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });

  Logger.error("Process", "Uncaught exception", error);
  Logger.shutdown();

  // Clear screen and show error
  process.stdout.write('\x1bc'); // Clear screen
  console.error("Fatal error:", error.message);
  console.error(`Full stack trace saved to ${ERROR_LOG_PATH}`);
  console.error(`Exit details saved to ${EXIT_LOG_PATH}`);

  clearInterval(heartbeatInterval);
  db.closeDb();
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logError("UNHANDLED REJECTION", reason);
  logExit("UNHANDLED_REJECTION", 1, {
    reason: String(reason),
    reasonType: typeof reason,
    stack: reason instanceof Error ? reason.stack : undefined
  });

  Logger.error("Process", "Unhandled rejection", reason instanceof Error ? reason : undefined, {
    reason: String(reason)
  });
  Logger.shutdown();

  // Clear screen and show error
  process.stdout.write('\x1bc'); // Clear screen
  console.error("Unhandled promise rejection:", reason);
  console.error(`Full details saved to ${EXIT_LOG_PATH}`);

  clearInterval(heartbeatInterval);
  db.closeDb();
  process.exit(1);
});

// beforeExit fires when event loop becomes empty but process hasn't exited yet
// This catches unexpected exits that don't trigger other handlers
process.on("beforeExit", (code) => {
  if (isShuttingDown) return;

  logExit("BEFORE_EXIT", code, {
    message: "Event loop became empty unexpectedly",
    hadActiveTimers: false,
    pendingCallbacks: "unknown"
  });

  // If we get here unexpectedly, the process is about to exit
  // Log it but don't prevent exit - might be intentional
  console.error("\n⚠️  Process event loop became empty (beforeExit triggered)");
  console.error(`Exit details saved to ${EXIT_LOG_PATH}`);
});

// Catch process warnings (deprecation, experimental features, etc.)
process.on("warning", (warning) => {
  logError("PROCESS WARNING", warning);
  Logger.warn("Process", "Process warning emitted", {
    name: warning.name,
    message: warning.message,
    stack: warning.stack
  });
});

process.on("SIGTERM", () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logError("SIGTERM", new Error("Received SIGTERM"));
  logExit("SIGTERM", 0, { signal: "SIGTERM" });

  Logger.shutdown();
  clearInterval(heartbeatInterval);

  process.stdout.write('\x1bc'); // Clear screen
  process.exit(0);
});

process.on("SIGINT", () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logError("SIGINT", new Error("Received SIGINT"));
  logExit("SIGINT", 0, { signal: "SIGINT" });

  Logger.shutdown();
  clearInterval(heartbeatInterval);

  process.stdout.write('\x1bc'); // Clear screen
  process.exit(0);
});

process.on("SIGHUP", () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logError("SIGHUP", new Error("Received SIGHUP"));
  logExit("SIGHUP", 0, { signal: "SIGHUP" });

  Logger.shutdown();
  clearInterval(heartbeatInterval);

  process.stdout.write('\x1bc'); // Clear screen
  process.exit(0);
});

// Final safety net - flush logs and close database on any exit
process.on("exit", (code) => {
  if (!isShuttingDown) {
    // If we reach exit without isShuttingDown being set, something unexpected happened
    logExit("EXIT_HANDLER", code, {
      message: "Reached exit handler without proper shutdown sequence",
      unexpected: true
    });
  }

  clearInterval(heartbeatInterval);
  db.closeDb();
  Logger.shutdown();

  // Final clear screen
  process.stdout.write('\x1bc');
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
let bot = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--skip-config" || arg === "-C") {
    skipConfig = true;
  } else if (arg === "--skip-nodes" || arg === "-N") {
    skipNodes = true;
  } else if (arg === "--session" || arg === "-s") {
    if (i + 1 >= args.length) {
      console.error("--session requires a session name");
      logExit("INVALID_ARGS", 1, { reason: "--session requires a session name" });
      clearInterval(heartbeatInterval);
      process.exit(1);
    }
    const sessionArg = args[++i];
    try {
      session = validateSessionName(sessionArg);
    } catch (error) {
      console.error(`Invalid session name: ${error instanceof Error ? error.message : String(error)}`);
      logExit("INVALID_SESSION", 1, { reason: "Invalid session name", sessionArg });
      clearInterval(heartbeatInterval);
      process.exit(1);
    }
  } else if (arg === "--clear") {
    clearSession = true;
  } else if (arg === "--meshview" || arg === "-m") {
    if (i + 1 >= args.length) {
      console.error("--meshview requires a URL");
      logExit("INVALID_ARGS", 1, { reason: "--meshview requires a URL" });
      clearInterval(heartbeatInterval);
      process.exit(1);
    }
    const urlArg = args[++i];
    try {
      validateUrl(urlArg); // Validate URL format and protocol
      meshViewUrl = urlArg;
    } catch (error) {
      console.error(`Invalid MeshView URL: ${error instanceof Error ? error.message : String(error)}`);
      logExit("INVALID_URL", 1, { reason: "Invalid MeshView URL", urlArg });
      clearInterval(heartbeatInterval);
      process.exit(1);
    }
  } else if (arg === "--fahrenheit" || arg === "-F") {
    useFahrenheit = true;
  } else if (arg === "--enable-logging" || arg === "-L") {
    enableLogging = true;
  } else if (arg === "--packet-limit" || arg === "-p") {
    if (i + 1 >= args.length) {
      console.error("--packet-limit requires a number");
      logExit("INVALID_ARGS", 1, { reason: "--packet-limit requires a number" });
      clearInterval(heartbeatInterval);
      process.exit(1);
    }
    const limit = parseInt(args[++i], 10);
    if (isNaN(limit) || limit < 1 || limit > 1000000) {
      console.error("Packet limit must be between 1 and 1,000,000");
      logExit("INVALID_PACKET_LIMIT", 1, { reason: "Invalid packet limit", limit: args[i] });
      clearInterval(heartbeatInterval);
      process.exit(1);
    }
    packetLimit = limit;
  } else if (arg === "--port" || arg === "-P") {
    if (i + 1 >= args.length) {
      console.error("--port requires a port number");
      logExit("INVALID_ARGS", 1, { reason: "--port requires a port number" });
      clearInterval(heartbeatInterval);
      process.exit(1);
    }
    const portArg = args[++i];
    const port = parseInt(portArg, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error("Port must be between 1 and 65535");
      logExit("INVALID_PORT", 1, { reason: "Invalid port number", port: portArg });
      clearInterval(heartbeatInterval);
      process.exit(1);
    }
    httpPort = port;
  } else if (arg === "--tls" || arg === "-T") {
    useTls = true;
  } else if (arg === "--insecure" || arg === "-k") {
    insecure = true;
  } else if (arg === "--bot" || arg === "-b") {
    bot = true;
  } else if (arg === "--pcap") {
    if (i + 1 >= args.length) {
      console.error("--pcap requires a file path");
      logExit("INVALID_ARGS", 1, { reason: "--pcap requires a file path" });
      clearInterval(heartbeatInterval);
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
  --bot, -b             Auto-reply to "ping" and "test" messages
  --pcap <file>         Write packets to pcap file for analysis
  --enable-logging, -L  Enable verbose logging to ~/.config/meshtastic-cli/log
  --help, -h            Show this help message
`);
    logExit("HELP_SHOWN", 0, { reason: "User requested help" });
    clearInterval(heartbeatInterval);
    process.exit(0);
  } else if (!arg.startsWith("-")) {
    if (address) {
      console.error("Error: Multiple addresses specified. Only one address is allowed.");
      logExit("MULTIPLE_ADDRESSES", 1, { reason: "Multiple addresses specified", existing: address, attempted: arg });
      clearInterval(heartbeatInterval);
      process.exit(1);
    }
    try {
      address = validateAddress(arg);
    } catch (error) {
      console.error(`Invalid address: ${error instanceof Error ? error.message : String(error)}`);
      logExit("INVALID_ADDRESS", 1, { reason: "Invalid device address", address: arg });
      clearInterval(heartbeatInterval);
      process.exit(1);
    }
  }
}

// Require address to be specified
if (!address) {
  console.error("Error: Device address is required");
  console.error("Usage: meshtastic-cli <address> [options]");
  console.error("Run with --help for more information");
  logExit("MISSING_ADDRESS", 1, { reason: "No device address provided" });
  clearInterval(heartbeatInterval);
  process.exit(1);
}

// Handle --clear option
if (clearSession) {
  const dbPath = db.getDbPath(session);
  db.clearDb(session);
  console.log(`Cleared database for session "${session}" (${dbPath})`);
  logExit("SESSION_CLEARED", 0, { reason: "Database cleared", session, dbPath });
  clearInterval(heartbeatInterval);
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
    bot,
  }),
  {
    incrementalRendering: true,  // Only update changed lines (Ink 6.5.0+)
    maxFps: 30,                  // Limit to 30 FPS to reduce flicker (Ink 6.3.0+)
  }
);

waitUntilExit()
  .then(() => {
    // Normal exit from user quitting
    if (!isShuttingDown) {
      isShuttingDown = true;
      logExit("NORMAL_EXIT", 0, { reason: "User quit application" });
      clearInterval(heartbeatInterval);
      process.stdout.write('\x1bc'); // Clear screen
    }
  })
  .catch((e) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    const error = e instanceof Error ? e : new Error(String(e));
    logError("APPLICATION EXIT ERROR", error);
    logExit("APPLICATION_ERROR", 1, {
      message: error.message,
      stack: error.stack
    });

    Logger.error("Main", "Application exit error", error);
    Logger.shutdown();

    process.stdout.write('\x1bc'); // Clear screen
    console.error("Application failed:", error.message);
    console.error(`Full details saved to ${EXIT_LOG_PATH}`);

    clearInterval(heartbeatInterval);
    db.closeDb();
    process.exit(1);
  });
