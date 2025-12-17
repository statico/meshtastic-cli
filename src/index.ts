import { HttpTransport } from "./transport";
import { PacketStore, NodeStore } from "./protocol";
import { App } from "./ui/app";

const ADDRESS = process.argv[2] || "192.168.0.123";

async function main() {
  const transport = await HttpTransport.create(ADDRESS);
  const packetStore = new PacketStore();
  const nodeStore = new NodeStore();
  const app = new App(transport, packetStore, nodeStore);
  await app.start();
}

main().catch((e) => {
  console.error("Failed to start:", e.message);
  process.exit(1);
});
