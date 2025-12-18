import React from "react";
import { render } from "ink";
import { PacketStore, NodeStore } from "./protocol";
import { App } from "./ui/App";

// Parse CLI arguments
const args = process.argv.slice(2);
let address = "192.168.0.123";
let skipConfig = false;

for (const arg of args) {
  if (arg === "--skip-config") {
    skipConfig = true;
  } else if (arg === "--help" || arg === "-h") {
    console.log(`
Meshtastic CLI Viewer

Usage: meshtastic-cli [address] [options]

Arguments:
  address            Device address (default: 192.168.0.123)

Options:
  --skip-config      Skip loading device configuration on startup (faster connect)
  --help, -h         Show this help message
`);
    process.exit(0);
  } else if (!arg.startsWith("-")) {
    address = arg;
  }
}

const packetStore = new PacketStore();
const nodeStore = new NodeStore();

const { waitUntilExit } = render(
  React.createElement(App, {
    address,
    packetStore,
    nodeStore,
    skipConfig,
  })
);

waitUntilExit().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
