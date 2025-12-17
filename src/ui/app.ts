import {
  createCliRenderer,
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  type CliRenderer,
  type KeyEvent,
  t,
  fg,
  bold,
} from "@opentui/core";
import { theme } from "./theme";
import type { DecodedPacket } from "../protocol/decoder";
import type { PacketStore } from "../protocol/packet-store";
import type { Transport, DeviceStatus } from "../transport/types";
import { Portnums } from "@meshtastic/protobufs";

export class App {
  private renderer!: CliRenderer;
  private transport: Transport;
  private store: PacketStore;
  private status: DeviceStatus = "disconnected";
  private running = true;

  private header!: BoxRenderable;
  private packetList!: ScrollBoxRenderable;
  private statusBar!: BoxRenderable;
  private statusText!: TextRenderable;
  private selectedIndex = -1;

  constructor(transport: Transport, store: PacketStore) {
    this.transport = transport;
    this.store = store;
  }

  async start() {
    this.renderer = await createCliRenderer({ exitOnCtrlC: true, targetFps: 30 });
    this.renderer.setBackgroundColor(theme.bg.primary);
    this.createLayout();
    this.setupKeyHandlers();
    this.store.onPacket((p) => this.running && this.addPacketRow(p));
    this.startTransport();
  }

  private async stop() {
    this.running = false;
    await this.transport.disconnect();
  }

  private createLayout() {
    this.header = new BoxRenderable(this.renderer, {
      id: "header",
      width: "100%",
      height: 3,
      backgroundColor: theme.bg.panel,
      border: true,
      borderColor: theme.border.normal,
      alignItems: "center",
      justifyContent: "center",
    });

    const title = new TextRenderable(this.renderer, {
      content: t`${bold(fg(theme.fg.accent)("▓▓▓ MESHTASTIC PACKET VIEWER ▓▓▓"))}`,
    });
    this.header.add(title);

    this.packetList = new ScrollBoxRenderable(this.renderer, {
      id: "packet-list",
      rootOptions: {
        backgroundColor: theme.bg.panel,
        border: true,
        borderColor: theme.border.normal,
        flexGrow: 1,
      },
      viewportOptions: { backgroundColor: theme.bg.primary },
      contentOptions: { backgroundColor: theme.bg.primary },
      scrollbarOptions: {
        trackOptions: {
          foregroundColor: theme.fg.accent,
          backgroundColor: theme.bg.panel,
        },
      },
    });

    this.statusBar = new BoxRenderable(this.renderer, {
      id: "status-bar",
      width: "100%",
      height: 1,
      backgroundColor: theme.bg.panel,
      flexDirection: "row",
      paddingLeft: 1,
    });

    this.statusText = new TextRenderable(this.renderer, {
      content: t`${fg(theme.fg.secondary)("Connecting...")}`,
    });
    this.statusBar.add(this.statusText);

    this.renderer.root.add(this.header);
    this.renderer.root.add(this.packetList);
    this.renderer.root.add(this.statusBar);
  }

  private setupKeyHandlers() {
    this.renderer.keyInput.on("keypress", async (key: KeyEvent) => {
      if (key.name === "q") {
        await this.stop();
        process.exit(0);
      }
      if (key.name === "j" || key.name === "down") this.scrollDown();
      if (key.name === "k" || key.name === "up") this.scrollUp();
    });
  }

  private scrollDown() {
    this.packetList.scrollBy(0, 1);
  }

  private scrollUp() {
    this.packetList.scrollBy(0, -1);
  }

  private async startTransport() {
    for await (const output of this.transport.fromDevice) {
      if (!this.running) break;
      if (output.type === "status") {
        this.status = output.status;
        this.updateStatus();
      } else if (output.type === "packet") {
        const { decodeFromRadio } = await import("../protocol/decoder");
        const decoded = decodeFromRadio(output.data);
        this.store.add(decoded);
      }
    }
  }

  private updateStatus() {
    const statusColor = this.status === "connected" ? theme.status.online : theme.status.offline;
    const count = this.store.count;
    this.statusText.content = t`${fg(statusColor)(this.status.toUpperCase())} ${fg(theme.fg.muted)("|")} ${fg(theme.fg.secondary)(`Packets: ${count}`)} ${fg(theme.fg.muted)("|")} ${fg(theme.fg.secondary)("[j/k] scroll [q] quit")}`;
  }

  private addPacketRow(packet: DecodedPacket) {
    const time = packet.timestamp.toLocaleTimeString("en-US", { hour12: false });
    const row = this.formatPacketRow(packet, time);

    const box = new BoxRenderable(this.renderer, {
      id: `packet-${packet.id}`,
      width: "auto",
      height: 1,
      backgroundColor: theme.bg.primary,
    });

    const text = new TextRenderable(this.renderer, { content: row });
    box.add(text);
    this.packetList.add(box);
    this.updateStatus();
  }

  private formatPacketRow(packet: DecodedPacket, time: string): string {
    if (packet.decodeError) {
      return t`${fg(theme.fg.muted)(`[${time}]`)} ${fg(theme.packet.unknown)("ERROR")} ${packet.decodeError}`;
    }

    const fr = packet.fromRadio;
    if (!fr) return t`${fg(theme.fg.muted)(`[${time}]`)} ${fg(theme.packet.unknown)("EMPTY")}`;

    const variantCase = fr.payloadVariant.case;

    if (variantCase === "packet" && packet.meshPacket) {
      const mp = packet.meshPacket;
      const from = `!${mp.from.toString(16).padStart(8, "0")}`;
      const to = mp.to === 0xffffffff ? "broadcast" : `!${mp.to.toString(16).padStart(8, "0")}`;
      const portName = packet.portnum !== undefined
        ? Portnums.PortNum[packet.portnum]?.replace(/_APP$/, "") || `PORT_${packet.portnum}`
        : "ENCRYPTED";
      const color = this.getPortColor(packet.portnum);

      let payload = "";
      if (typeof packet.payload === "string") {
        payload = ` "${packet.payload.slice(0, 40)}${packet.payload.length > 40 ? "..." : ""}"`;
      }

      return t`${fg(theme.fg.muted)(`[${time}]`)} ${fg(theme.fg.accent)("◀")} ${fg(color)(portName.padEnd(12))} ${fg(theme.fg.secondary)(from)} ${fg(theme.fg.muted)("→")} ${fg(theme.fg.secondary)(to)}${fg(theme.fg.primary)(payload)}`;
    }

    if (variantCase) {
      return t`${fg(theme.fg.muted)(`[${time}]`)} ${fg(theme.packet.nodeinfo)(variantCase.toUpperCase())}`;
    }

    return t`${fg(theme.fg.muted)(`[${time}]`)} ${fg(theme.packet.unknown)("UNKNOWN")}`;
  }

  private getPortColor(portnum?: Portnums.PortNum): string {
    if (portnum === undefined) return theme.packet.encrypted;
    switch (portnum) {
      case Portnums.PortNum.TEXT_MESSAGE_APP:
        return theme.packet.message;
      case Portnums.PortNum.POSITION_APP:
        return theme.packet.position;
      case Portnums.PortNum.TELEMETRY_APP:
        return theme.packet.telemetry;
      case Portnums.PortNum.NODEINFO_APP:
        return theme.packet.nodeinfo;
      case Portnums.PortNum.ROUTING_APP:
        return theme.packet.routing;
      default:
        return theme.packet.unknown;
    }
  }
}
