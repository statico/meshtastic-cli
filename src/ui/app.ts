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
import type { NodeStore } from "../protocol/node-store";
import type { Transport, DeviceStatus } from "../transport/types";
import { Mesh, Portnums, Telemetry } from "@meshtastic/protobufs";
import { PacketInspector } from "./inspector";
import { NodesPanel } from "./nodes";
import { ChatPanel } from "./chat";
import * as db from "../db";
import { toBinary } from "@bufbuild/protobuf";

type AppMode = "packets" | "nodes" | "chat";

export class App {
  private renderer!: CliRenderer;
  private transport: Transport;
  private packetStore: PacketStore;
  private nodeStore: NodeStore;
  private status: DeviceStatus = "disconnected";
  private running = true;
  private mode: AppMode = "packets";

  private header!: BoxRenderable;
  private modeContainer!: BoxRenderable;
  private packetList!: ScrollBoxRenderable;
  private inspector!: PacketInspector;
  private nodesPanel!: NodesPanel;
  private chatPanel!: ChatPanel;
  private statusBar!: BoxRenderable;
  private statusText!: TextRenderable;
  private modeText!: TextRenderable;
  private myNodeNum = 0;

  private selectedIndex = 0;
  private packetRows: Map<number, BoxRenderable> = new Map();

  constructor(transport: Transport, packetStore: PacketStore, nodeStore: NodeStore) {
    this.transport = transport;
    this.packetStore = packetStore;
    this.nodeStore = nodeStore;
  }

  async start() {
    this.renderer = await createCliRenderer({
      exitOnCtrlC: true,
      targetFps: 30,
      useKittyKeyboard: null,
      useMouse: false,
      useAlternateScreen: true,
    });
    this.renderer.setBackgroundColor(theme.bg.primary);
    this.createLayout();
    this.setupKeyHandlers();
    this.packetStore.onPacket((p) => this.running && this.handlePacket(p));
    this.nodeStore.startPeriodicUpdates(1000);
    this.startTransport();
  }

  private async stop() {
    this.running = false;
    this.nodeStore.stopPeriodicUpdates();
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
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingLeft: 2,
      paddingRight: 2,
    });

    const title = new TextRenderable(this.renderer, {
      content: t`${bold(fg(theme.fg.accent)("▓▓▓ MESHTASTIC ▓▓▓"))}`,
    });
    this.modeText = new TextRenderable(this.renderer, {
      content: this.getModeLabel(),
    });
    this.header.add(title);
    this.header.add(this.modeText);

    this.modeContainer = new BoxRenderable(this.renderer, {
      id: "mode-container",
      width: "100%",
      flexGrow: 1,
      flexDirection: "column",
    });

    this.createPacketsView();
    this.createNodesView();
    this.createChatView();
    this.showCurrentMode();

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
    this.renderer.root.add(this.modeContainer);
    this.renderer.root.add(this.statusBar);
  }

  private createPacketsView() {
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
    });

    this.inspector = new PacketInspector(this.renderer);
  }

  private createNodesView() {
    this.nodesPanel = new NodesPanel(this.renderer, this.nodeStore);
    this.nodesPanel.setActionHandler((action, node) => this.handleNodeAction(action, node));
  }

  private createChatView() {
    this.chatPanel = new ChatPanel(this.renderer, this.nodeStore);
    this.chatPanel.setSendHandler((channel, text) => this.sendMessage(channel, text));
  }

  private showCurrentMode() {
    for (const child of this.modeContainer.getChildren()) {
      this.modeContainer.remove(child.id);
    }

    if (this.mode === "packets") {
      this.modeContainer.add(this.packetList);
      this.modeContainer.add(this.inspector.element);
    } else if (this.mode === "nodes") {
      this.modeContainer.add(this.nodesPanel.element);
    } else if (this.mode === "chat") {
      this.modeContainer.add(this.chatPanel.element);
      this.chatPanel.focusInput();
    }

    this.modeText.content = this.getModeLabel();
    this.updateStatus();
  }

  private getModeLabel(): string {
    const modes: { key: AppMode; label: string }[] = [
      { key: "packets", label: "PACKETS" },
      { key: "nodes", label: "NODES" },
      { key: "chat", label: "CHAT" },
    ];
    return modes.map((m) =>
      m.key === this.mode
        ? t`${bold(fg(theme.fg.accent)(`[${m.label}]`))}`
        : t`${fg(theme.fg.muted)(`[${m.label}]`)}`
    ).join(" ");
  }

  private setupKeyHandlers() {
    this.renderer.keyInput.on("keypress", async (key: KeyEvent) => {
      if (key.name === "q") {
        await this.stop();
        process.exit(0);
      }

      if (key.name === "p") { this.setMode("packets"); return; }
      if (key.name === "n") { this.setMode("nodes"); return; }
      if (key.name === "c") { this.setMode("chat"); return; }

      if (this.mode === "packets") {
        if (key.name === "j" || key.name === "down") this.selectNextPacket();
        if (key.name === "k" || key.name === "up") this.selectPrevPacket();
        if (key.name === "tab") this.inspector.nextTab();
        if (key.name === "1") this.inspector.setTab("normalized");
        if (key.name === "2") this.inspector.setTab("protobuf");
        if (key.name === "3") this.inspector.setTab("hex");
      } else if (this.mode === "nodes") {
        if (key.name === "j" || key.name === "down") this.nodesPanel.selectNext();
        if (key.name === "k" || key.name === "up") this.nodesPanel.selectPrev();
        if (key.name === "t") this.nodesPanel.triggerAction("traceroute");
        if (key.name === "l") this.nodesPanel.triggerAction("position");
      } else if (this.mode === "chat") {
        if (key.name === "return" || key.name === "enter") this.chatPanel.sendCurrentMessage();
        if (key.name === "tab") this.chatPanel.nextChannel();
        if (key.shift && key.name === "tab") this.chatPanel.prevChannel();
      }
    });
  }

  private async sendMessage(channel: number, text: string) {
    if (!this.myNodeNum) return;

    const data = new Mesh.Data({
      portnum: Portnums.PortNum.TEXT_MESSAGE_APP,
      payload: new TextEncoder().encode(text),
    });

    const meshPacket = new Mesh.MeshPacket({
      from: this.myNodeNum,
      to: 0xffffffff,
      channel,
      wantAck: true,
      payloadVariant: { case: "decoded", value: data },
    });

    const toRadio = new Mesh.ToRadio({
      payloadVariant: { case: "packet", value: meshPacket },
    });

    try {
      const binary = toBinary(Mesh.ToRadioSchema, toRadio);
      await this.transport.send(binary);

      this.chatPanel.addMessage({
        fromNode: this.myNodeNum,
        toNode: 0xffffffff,
        channel,
        text,
        timestamp: Math.floor(Date.now() / 1000),
      });

      db.insertMessage({
        packetId: 0,
        fromNode: this.myNodeNum,
        toNode: 0xffffffff,
        channel,
        text,
        timestamp: Math.floor(Date.now() / 1000),
      });
    } catch (e) {
      // Send failed, ignore for now
    }
  }

  private setMode(mode: AppMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.showCurrentMode();
  }

  private selectNextPacket() {
    const packets = this.packetStore.getAll();
    if (packets.length === 0) return;
    this.selectedIndex = Math.min(this.selectedIndex + 1, packets.length - 1);
    this.updatePacketSelection();
    this.packetList.scrollBy(0, 1);
  }

  private selectPrevPacket() {
    if (this.selectedIndex <= 0) return;
    this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
    this.updatePacketSelection();
    this.packetList.scrollBy(0, -1);
  }

  private updatePacketSelection() {
    const packets = this.packetStore.getAll();
    if (this.selectedIndex >= 0 && this.selectedIndex < packets.length) {
      const packet = packets[this.selectedIndex];
      this.inspector.setPacket(packet);
      this.highlightPacketRow(packet.id);
    }
  }

  private highlightPacketRow(packetId: number) {
    for (const [id, row] of this.packetRows) {
      row.backgroundColor = id === packetId ? theme.bg.selected : theme.bg.primary;
    }
  }

  private async handleNodeAction(action: string, node: { num: number }) {
    if (!this.myNodeNum) return;

    if (action === "traceroute") {
      await this.sendTraceroute(node.num);
    } else if (action === "position") {
      await this.sendPositionRequest(node.num);
    }
  }

  private async sendTraceroute(destNode: number) {
    const routeDiscovery = new Mesh.RouteDiscovery({ route: [] });
    const payload = toBinary(Mesh.RouteDiscoverySchema, routeDiscovery);

    const data = new Mesh.Data({
      portnum: Portnums.PortNum.TRACEROUTE_APP,
      payload,
      wantResponse: true,
    });

    const meshPacket = new Mesh.MeshPacket({
      from: this.myNodeNum,
      to: destNode,
      wantAck: true,
      payloadVariant: { case: "decoded", value: data },
    });

    const toRadio = new Mesh.ToRadio({
      payloadVariant: { case: "packet", value: meshPacket },
    });

    try {
      const binary = toBinary(Mesh.ToRadioSchema, toRadio);
      await this.transport.send(binary);
      this.showNotification(`Traceroute sent to ${this.nodeStore.getNodeName(destNode)}`);
    } catch {
      this.showNotification("Failed to send traceroute");
    }
  }

  private async sendPositionRequest(destNode: number) {
    const data = new Mesh.Data({
      portnum: Portnums.PortNum.POSITION_APP,
      payload: new Uint8Array(0),
      wantResponse: true,
    });

    const meshPacket = new Mesh.MeshPacket({
      from: this.myNodeNum,
      to: destNode,
      wantAck: true,
      payloadVariant: { case: "decoded", value: data },
    });

    const toRadio = new Mesh.ToRadio({
      payloadVariant: { case: "packet", value: meshPacket },
    });

    try {
      const binary = toBinary(Mesh.ToRadioSchema, toRadio);
      await this.transport.send(binary);
      this.showNotification(`Position request sent to ${this.nodeStore.getNodeName(destNode)}`);
    } catch {
      this.showNotification("Failed to send position request");
    }
  }

  private showNotification(message: string) {
    this.statusText.content = t`${fg(theme.fg.accent)(message)}`;
    setTimeout(() => {
      this.updateStatus();
    }, 2000);
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
        this.packetStore.add(decoded);
      }
    }
  }

  private handlePacket(packet: DecodedPacket) {
    this.addPacketRow(packet);
    this.processPacketForNodes(packet);
    this.updateStatus();
  }

  private processPacketForNodes(packet: DecodedPacket) {
    const fr = packet.fromRadio;
    if (!fr) return;

    if (fr.payloadVariant.case === "myInfo") {
      this.myNodeNum = fr.payloadVariant.value.myNodeNum;
    }

    if (fr.payloadVariant.case === "nodeInfo") {
      this.nodeStore.updateFromNodeInfo(fr.payloadVariant.value);
    }

    if (fr.payloadVariant.case === "packet" && packet.meshPacket) {
      const mp = packet.meshPacket;
      const hops = mp.hopStart && mp.hopLimit ? mp.hopStart - mp.hopLimit : undefined;
      this.nodeStore.updateFromPacket(mp.from, mp.rxSnr, hops);

      if (packet.portnum === Portnums.PortNum.NODEINFO_APP && packet.payload instanceof Mesh.User) {
        this.nodeStore.updateFromUser(mp.from, packet.payload);
      }

      if (packet.portnum === Portnums.PortNum.POSITION_APP && packet.payload) {
        this.nodeStore.updatePosition(mp.from, packet.payload as Mesh.Position);
      }

      if (packet.portnum === Portnums.PortNum.TELEMETRY_APP && packet.payload) {
        const telem = packet.payload as Telemetry.Telemetry;
        if (telem.variant.case === "deviceMetrics") {
          this.nodeStore.updateDeviceMetrics(mp.from, telem.variant.value);
        }
      }

      if (packet.portnum === Portnums.PortNum.TEXT_MESSAGE_APP && typeof packet.payload === "string") {
        const msg = {
          packetId: mp.id,
          fromNode: mp.from,
          toNode: mp.to,
          channel: mp.channel,
          text: packet.payload,
          timestamp: Math.floor(Date.now() / 1000),
          rxTime: mp.rxTime,
          rxSnr: mp.rxSnr,
          rxRssi: mp.rxRssi,
          hopLimit: mp.hopLimit,
          hopStart: mp.hopStart,
        };
        db.insertMessage(msg);
        this.chatPanel.addMessage(msg);
      }
    }
  }

  private updateStatus() {
    const statusColor = this.status === "connected" ? theme.status.online : theme.status.offline;
    const count = this.packetStore.count;
    const nodeCount = this.nodeStore.getSortedNodes().length;

    let helpText = "[p]ackets [n]odes [c]hat [q]uit";
    if (this.mode === "packets") {
      helpText = "[j/k] select [1-3] view | " + helpText;
    } else if (this.mode === "nodes") {
      helpText = "[j/k] select [t]raceroute [l]ocation | " + helpText;
    } else if (this.mode === "chat") {
      helpText = "[Tab] channel [Enter] send | " + helpText;
    }

    this.statusText.content = t`${fg(statusColor)(this.status.toUpperCase())} ${fg(theme.fg.muted)("|")} ${fg(theme.fg.secondary)(`${count} pkts`)} ${fg(theme.fg.muted)("|")} ${fg(theme.fg.secondary)(`${nodeCount} nodes`)} ${fg(theme.fg.muted)("|")} ${fg(theme.fg.muted)(helpText)}`;
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
    this.packetRows.set(packet.id, box);

    if (this.packetStore.count === 1) {
      this.selectedIndex = 0;
      this.updatePacketSelection();
    }
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
      const fromName = this.nodeStore.getNodeName(mp.from);
      const toName = mp.to === 0xffffffff ? "^all" : this.nodeStore.getNodeName(mp.to);
      const portName = packet.portnum !== undefined
        ? Portnums.PortNum[packet.portnum]?.replace(/_APP$/, "") || `PORT_${packet.portnum}`
        : "ENCRYPTED";
      const color = this.getPortColor(packet.portnum);

      let payload = "";
      if (typeof packet.payload === "string") {
        payload = ` "${packet.payload.slice(0, 40)}${packet.payload.length > 40 ? "..." : ""}"`;
      }

      return t`${fg(theme.fg.muted)(`[${time}]`)} ${fg(theme.fg.accent)("◀")} ${fg(color)(portName.padEnd(12))} ${fg(theme.fg.secondary)(fromName.padEnd(10))} ${fg(theme.fg.muted)("→")} ${fg(theme.fg.secondary)(toName.padEnd(10))}${fg(theme.fg.primary)(payload)}`;
    }

    if (variantCase === "nodeInfo") {
      const info = fr.payloadVariant.value;
      const name = info.user?.shortName || info.user?.longName || `!${info.num.toString(16)}`;
      return t`${fg(theme.fg.muted)(`[${time}]`)} ${fg(theme.packet.nodeinfo)("NODEINFO".padEnd(12))} ${fg(theme.fg.accent)(name)}`;
    }

    if (variantCase) {
      return t`${fg(theme.fg.muted)(`[${time}]`)} ${fg(theme.packet.nodeinfo)(variantCase.toUpperCase())}`;
    }

    return t`${fg(theme.fg.muted)(`[${time}]`)} ${fg(theme.packet.unknown)("UNKNOWN")}`;
  }

  private getPortColor(portnum?: Portnums.PortNum): string {
    if (portnum === undefined) return theme.packet.encrypted;
    switch (portnum) {
      case Portnums.PortNum.TEXT_MESSAGE_APP: return theme.packet.message;
      case Portnums.PortNum.POSITION_APP: return theme.packet.position;
      case Portnums.PortNum.TELEMETRY_APP: return theme.packet.telemetry;
      case Portnums.PortNum.NODEINFO_APP: return theme.packet.nodeinfo;
      case Portnums.PortNum.ROUTING_APP: return theme.packet.routing;
      case Portnums.PortNum.TRACEROUTE_APP: return theme.packet.traceroute;
      default: return theme.packet.unknown;
    }
  }
}
