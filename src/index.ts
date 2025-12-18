import React from "react";
import { render } from "ink";
import { PacketStore, NodeStore } from "./protocol";
import { App } from "./ui/App";
import { initDb, clearDb, getDbPath } from "./db";
import { getSetting, DEFAULT_MESHVIEW_URL } from "./settings";

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
