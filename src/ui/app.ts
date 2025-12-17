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
import { toBinary, create } from "@bufbuild/protobuf";
import { formatNodeId } from "../utils/hex";
import { perf } from "../utils/perf-logger";

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
  private myNodeInfoText!: TextRenderable;
  private myNodeNum = 0;
  private myShortName = "";

  private selectedIndex = 0;
  private packetRowOrder: number[] = []; // packet IDs in display order
  private maxVisiblePackets = 30;
  private pendingPackets: DecodedPacket[] = [];
  private packetFlushTimer: Timer | null = null;
  private inspectorHeight = 10;
  private isDraggingInspector = false;
  private perfEnabled = false;
  private perfSnapshotTimer: Timer | null = null;

  // Pooled row elements - reuse instead of create/destroy
  private rowPool: { box: BoxRenderable; text: TextRenderable }[] = [];
  private rowPoolInitialized = false;

  // Cache formatted content per packet ID to avoid re-formatting
  private formattedCache: Map<number, string> = new Map();
  private maxCacheSize = 200;

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
    this.setupMouseHandlers();
    // Defer packet rendering to next frame to allow layout initialization
    setTimeout(() => this.renderPersistedPackets(), 0);
    this.packetStore.onPacket((p) => this.running && this.handlePacket(p));
    // Only start periodic node updates when viewing nodes panel
    this.startTransport();
  }

  private renderPersistedPackets() {
    const packets = this.packetStore.getAll();
    // Only render the most recent packets to avoid UI slowdown
    const recentPackets = packets.slice(-this.maxVisiblePackets);
    for (const packet of recentPackets) {
      this.addPacketRow(packet);
    }
    if (recentPackets.length > 0) {
      this.selectedIndex = recentPackets.length - 1;
      this.updatePacketSelection();
    }
    this.updateStatus();
  }

  private async stop() {
    this.running = false;
    if (this.mode === "nodes") {
      this.nodeStore.stopPeriodicUpdates();
    }
    if (this.perfEnabled) {
      perf.summarize();
    }
    await this.transport.disconnect();
  }

  private togglePerfLogging() {
    this.perfEnabled = !this.perfEnabled;
    if (this.perfEnabled) {
      perf.enable();
      perf.log("Performance logging ENABLED");
      this.showNotification(`Perf logging ON - ${perf.getLogPath()}`);
      // Start periodic snapshots
      this.perfSnapshotTimer = setInterval(() => {
        perf.snapshot({
          packetRows: this.rowPool.length,
          pendingPackets: this.pendingPackets.length,
          totalPackets: this.packetStore.count,
        });
      }, 2000);
    } else {
      perf.summarize();
      perf.disable();
      this.showNotification("Perf logging OFF - summary written");
      if (this.perfSnapshotTimer) {
        clearInterval(this.perfSnapshotTimer);
        this.perfSnapshotTimer = null;
      }
    }
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
    this.myNodeInfoText = new TextRenderable(this.renderer, {
      content: t`${fg(theme.fg.muted)("connecting...")}`,
    });
    this.modeText = new TextRenderable(this.renderer, {
      content: this.getModeLabel(),
    });
    this.header.add(title);
    this.header.add(this.myNodeInfoText);
    this.header.add(this.modeText);

    this.modeContainer = new BoxRenderable(this.renderer, {
      id: "mode-container",
      width: "100%",
      flexGrow: 1,
      flexDirection: "column",
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

    this.createPacketsView();
    this.createNodesView();
    this.createChatView();
    this.showCurrentMode();

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

  private chatInitialized = false;

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
      if (!this.chatInitialized) {
        this.chatInitialized = true;
        this.chatPanel.init();
      }
      this.chatPanel.focusInput();
    }

    this.modeText.content = this.getModeLabel();
    this.updateStatus();
  }

  private getModeLabel() {
    const p = this.mode === "packets";
    const n = this.mode === "nodes";
    const c = this.mode === "chat";
    return t`${p ? bold(fg(theme.fg.accent)("[PACKETS]")) : fg(theme.fg.muted)("[PACKETS]")} ${n ? bold(fg(theme.fg.accent)("[NODES]")) : fg(theme.fg.muted)("[NODES]")} ${c ? bold(fg(theme.fg.accent)("[CHAT]")) : fg(theme.fg.muted)("[CHAT]")}`;
  }

  private setupKeyHandlers() {
    this.renderer.keyInput.on("keypress", async (key: KeyEvent) => {
      if (key.name === "q" && !this.mode.startsWith("chat")) {
        await this.stop();
        process.exit(0);
      }

      // Ctrl-1/2/3 to switch modes
      if (key.ctrl && key.name === "1") { this.setMode("packets"); return; }
      if (key.ctrl && key.name === "2") { this.setMode("nodes"); return; }
      if (key.ctrl && key.name === "3") { this.setMode("chat"); return; }

      // 0 to toggle perf logging
      if (key.name === "0" && this.mode !== "chat") { this.togglePerfLogging(); return; }

      // Also keep p/n/c shortcuts when not in chat mode
      if (this.mode !== "chat") {
        if (key.name === "p") { this.setMode("packets"); return; }
        if (key.name === "n") { this.setMode("nodes"); return; }
        if (key.name === "c") { this.setMode("chat"); return; }
      }

      if (this.mode === "packets") {
        if (key.name === "j" || key.name === "down") this.selectNextPacket();
        if (key.name === "k" || key.name === "up") this.selectPrevPacket();
        if (key.name === "tab") this.inspector.nextTab();
        if (key.name === "1") this.inspector.setTab("normalized");
        if (key.name === "2") this.inspector.setTab("protobuf");
        if (key.name === "3") this.inspector.setTab("hex");
        if (key.shift && key.name === "j") this.inspector.scrollDown();
        if (key.shift && key.name === "k") this.inspector.scrollUp();
        if (key.name === "end" || key.name === "g" && key.shift) this.scrollToBottom();
        if (key.name === "home") this.packetList.scrollTo(0);
      } else if (this.mode === "nodes") {
        if (key.name === "j" || key.name === "down") this.nodesPanel.selectNext();
        if (key.name === "k" || key.name === "up") this.nodesPanel.selectPrev();
        if (key.name === "t") this.nodesPanel.triggerAction("traceroute");
        if (key.name === "l") this.nodesPanel.triggerAction("position");
      } else if (this.mode === "chat") {
        if (key.name === "return" || key.name === "enter") this.chatPanel.sendCurrentMessage();
        if (key.name === "tab") this.chatPanel.nextChannel();
        if (key.shift && key.name === "tab") this.chatPanel.prevChannel();
        if (key.name === "escape") this.setMode("packets");
      }
    });
  }

  private setupMouseHandlers() {
    // Mouse input may not be available in all terminals
    // For now, skip mouse handling - resize with keyboard instead
    // TODO: Investigate OpenTUI mouse API when available
  }

  private async sendMessage(channel: number, text: string) {
    if (!this.myNodeNum) {
      this.showNotification("Not connected - waiting for device info");
      return;
    }

    const packetId = Math.floor(Math.random() * 0xffffffff);
    const data = create(Mesh.DataSchema, {
      portnum: Portnums.PortNum.TEXT_MESSAGE_APP,
      payload: new TextEncoder().encode(text),
    });

    const meshPacket = create(Mesh.MeshPacketSchema, {
      id: packetId,
      from: this.myNodeNum,
      to: 0xffffffff,
      channel,
      wantAck: true,
      payloadVariant: { case: "decoded", value: data },
    });

    const toRadio = create(Mesh.ToRadioSchema, {
      payloadVariant: { case: "packet", value: meshPacket },
    });

    try {
      const binary = toBinary(Mesh.ToRadioSchema, toRadio);
      await this.transport.send(binary);

      // Add to chat display
      this.chatPanel.addMessage({
        fromNode: this.myNodeNum,
        toNode: 0xffffffff,
        channel,
        text,
        timestamp: Math.floor(Date.now() / 1000),
      });

      // Add outbound packet to packet list
      this.addOutboundPacketRow("TEXT_MESSAGE", this.myNodeNum, 0xffffffff, text);

      db.insertMessage({
        packetId,
        fromNode: this.myNodeNum,
        toNode: 0xffffffff,
        channel,
        text,
        timestamp: Math.floor(Date.now() / 1000),
      });
    } catch (e) {
      this.showNotification("Failed to send message");
    }
  }

  private setMode(mode: AppMode) {
    if (mode === this.mode) return;
    // Blur chat input when leaving chat mode
    if (this.mode === "chat") {
      this.chatPanel.blurInput();
    }
    // Stop periodic node updates when leaving nodes mode
    if (this.mode === "nodes") {
      this.nodeStore.stopPeriodicUpdates();
    }
    this.mode = mode;
    // Start periodic node updates when entering nodes mode
    if (mode === "nodes") {
      this.nodeStore.startPeriodicUpdates(2000);
    }
    this.showCurrentMode();
  }

  private selectNextPacket() {
    if (this.packetRowOrder.length === 0) return;
    this.selectedIndex = Math.min(this.selectedIndex + 1, this.packetRowOrder.length - 1);
    this.updatePacketSelection();
    this.packetList.scrollBy(1);
  }

  private selectPrevPacket() {
    if (this.selectedIndex <= 0) return;
    this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
    this.updatePacketSelection();
    this.packetList.scrollBy(-1);
  }

  private updatePacketSelection() {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.packetRowOrder.length) {
      const packetId = this.packetRowOrder[this.selectedIndex];
      const packet = this.packetStore.get(packetId);
      if (packet) {
        this.inspector.setPacket(packet);
      }
      this.highlightPacketRow(packetId);
    }
  }

  private lastHighlightedId: number | null = null;

  private highlightPacketRow(packetId: number) {
    // Only update if selection actually changed
    if (packetId === this.lastHighlightedId) return;

    perf.time("highlightPacketRow", () => {
      // Unhighlight previous
      if (this.lastHighlightedId !== null) {
        const prevIdx = this.packetRowOrder.indexOf(this.lastHighlightedId);
        if (prevIdx >= 0 && prevIdx < this.rowPool.length) {
          this.rowPool[prevIdx].box.backgroundColor = theme.bg.primary;
        }
      }
      // Highlight new
      const newIdx = this.packetRowOrder.indexOf(packetId);
      if (newIdx >= 0 && newIdx < this.rowPool.length) {
        this.rowPool[newIdx].box.backgroundColor = theme.bg.selected;
      }
      this.lastHighlightedId = packetId;
    });
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
    if (!this.myNodeNum) {
      this.showNotification("Not connected - waiting for device info");
      return;
    }

    const routeDiscovery = create(Mesh.RouteDiscoverySchema, { route: [] });
    const payload = toBinary(Mesh.RouteDiscoverySchema, routeDiscovery);

    const data = create(Mesh.DataSchema, {
      portnum: Portnums.PortNum.TRACEROUTE_APP,
      payload,
      wantResponse: true,
    });

    const meshPacket = create(Mesh.MeshPacketSchema, {
      from: this.myNodeNum,
      to: destNode,
      wantAck: true,
      payloadVariant: { case: "decoded", value: data },
    });

    const toRadio = create(Mesh.ToRadioSchema, {
      payloadVariant: { case: "packet", value: meshPacket },
    });

    try {
      const binary = toBinary(Mesh.ToRadioSchema, toRadio);
      await this.transport.send(binary);
      this.addOutboundPacketRow("TRACEROUTE", this.myNodeNum, destNode);
      this.showNotification(`Traceroute sent to ${this.nodeStore.getNodeName(destNode)}`);
    } catch {
      this.showNotification("Failed to send traceroute");
    }
  }

  private async sendPositionRequest(destNode: number) {
    if (!this.myNodeNum) {
      this.showNotification("Not connected - waiting for device info");
      return;
    }

    const data = create(Mesh.DataSchema, {
      portnum: Portnums.PortNum.POSITION_APP,
      payload: new Uint8Array(0),
      wantResponse: true,
    });

    const meshPacket = create(Mesh.MeshPacketSchema, {
      from: this.myNodeNum,
      to: destNode,
      wantAck: true,
      payloadVariant: { case: "decoded", value: data },
    });

    const toRadio = create(Mesh.ToRadioSchema, {
      payloadVariant: { case: "packet", value: meshPacket },
    });

    try {
      const binary = toBinary(Mesh.ToRadioSchema, toRadio);
      await this.transport.send(binary);
      this.addOutboundPacketRow("POSITION_REQ", this.myNodeNum, destNode);
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
    let configRequested = false;
    for await (const output of this.transport.fromDevice) {
      if (!this.running) break;
      if (output.type === "status") {
        this.status = output.status;
        this.updateStatus();
        if (output.status === "connected" && !configRequested) {
          configRequested = true;
          this.requestConfig();
          this.fetchOwnerFallback();
        }
      } else if (output.type === "packet") {
        const { decodeFromRadio } = await import("../protocol/decoder");
        const decoded = decodeFromRadio(output.data);
        this.packetStore.add(decoded);
      }
    }
  }

  private async requestConfig() {
    const toRadio = create(Mesh.ToRadioSchema, {
      payloadVariant: { case: "wantConfigId", value: Math.floor(Math.random() * 0xffffffff) },
    });
    try {
      const binary = toBinary(Mesh.ToRadioSchema, toRadio);
      await this.transport.send(binary);
    } catch {
      this.showNotification("Failed to request config");
    }
  }

  private handlePacket(packet: DecodedPacket) {
    this.processPacketForNodes(packet);
    // Queue packets and flush periodically to avoid overwhelming yoga-layout
    this.pendingPackets.push(packet);
    if (!this.packetFlushTimer) {
      this.packetFlushTimer = setTimeout(() => this.flushPendingPackets(), 500);
    }
  }

  private flushPendingPackets() {
    this.packetFlushTimer = null;
    perf.time("flushPendingPackets", () => {
      // Only add the most recent packets if queue is large
      const packets = this.pendingPackets.length > 10
        ? this.pendingPackets.slice(-10)
        : this.pendingPackets;
      perf.log(`flushing ${packets.length} packets (dropped ${this.pendingPackets.length - packets.length})`);
      this.pendingPackets = [];
      for (const packet of packets) {
        this.addPacketRow(packet);
      }
      // Do one bulk refresh at the end instead of per-packet
      this.refreshAllRows();
      this.updateStatus();
    });
  }

  private processPacketForNodes(packet: DecodedPacket) {
    perf.time("processPacketForNodes", () => {
      const fr = packet.fromRadio;
      if (!fr) return;

      if (fr.payloadVariant.case === "myInfo") {
        const myInfo = fr.payloadVariant.value as Mesh.MyNodeInfo;
        this.myNodeNum = myInfo.myNodeNum;
        this.updateMyNodeInfo();
      }

      if (fr.payloadVariant.case === "nodeInfo") {
        const nodeInfo = fr.payloadVariant.value;
        perf.time("nodeStore.updateFromNodeInfo", () => this.nodeStore.updateFromNodeInfo(nodeInfo));
        if (nodeInfo.num === this.myNodeNum && nodeInfo.user) {
          this.myShortName = nodeInfo.user.shortName || "";
          this.updateMyNodeInfo();
        }
      }

      if (fr.payloadVariant.case === "configCompleteId" && !this.myNodeNum) {
        this.fetchOwnerFallback();
      }

      if (fr.payloadVariant.case === "packet" && packet.meshPacket) {
        const mp = packet.meshPacket;
        const hops = mp.hopStart && mp.hopLimit ? mp.hopStart - mp.hopLimit : undefined;
        perf.time("nodeStore.updateFromPacket", () => this.nodeStore.updateFromPacket(mp.from, mp.rxSnr, hops));

        if (packet.portnum === Portnums.PortNum.NODEINFO_APP && packet.payload && typeof packet.payload === "object" && "id" in packet.payload) {
          perf.time("nodeStore.updateFromUser", () => this.nodeStore.updateFromUser(mp.from, packet.payload as Mesh.User));
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
    });
  }

  private updateStatus() {
    perf.time("updateStatus", () => {
      const statusColor = this.status === "connected" ? theme.status.online : theme.status.offline;
      const count = this.packetStore.count;
      const nodeCount = perf.time("getSortedNodes", () => this.nodeStore.getSortedNodes().length);

      let helpText = "[0] perf | ^1 packets ^2 nodes ^3 chat";
      if (this.mode === "packets") {
        helpText = "[j/k] select [1-3] view | " + helpText;
      } else if (this.mode === "nodes") {
        helpText = "[j/k] select [t]raceroute [l]ocation | " + helpText;
      } else if (this.mode === "chat") {
        helpText = "[Tab] channel [Enter] send [Esc] back | " + helpText;
      }

      this.statusText.content = t`${fg(statusColor)(this.status.toUpperCase())} ${fg(theme.fg.muted)("|")} ${fg(theme.fg.secondary)(`${count} pkts`)} ${fg(theme.fg.muted)("|")} ${fg(theme.fg.secondary)(`${nodeCount} nodes`)} ${fg(theme.fg.muted)("|")} ${fg(theme.fg.muted)(helpText)}`;
    });
  }

  private updateMyNodeInfo() {
    const id = formatNodeId(this.myNodeNum);
    const name = this.myShortName || "???";
    this.myNodeInfoText.content = t`${fg(theme.fg.secondary)(name)} ${fg(theme.fg.muted)(id)}`;
  }

  private async fetchOwnerFallback() {
    if (!this.transport.fetchOwner) return;
    const owner = await this.transport.fetchOwner();
    if (owner && owner.myNodeNum) {
      this.myNodeNum = owner.myNodeNum;
      this.myShortName = owner.shortName || "";
      this.updateMyNodeInfo();
    }
  }

  private initRowPool() {
    if (this.rowPoolInitialized) return;
    this.rowPoolInitialized = true;

    perf.time("initRowPool", () => {
      for (let i = 0; i < this.maxVisiblePackets; i++) {
        const box = new BoxRenderable(this.renderer, {
          id: `packet-row-${i}`,
          width: "auto",
          height: 1,
          backgroundColor: theme.bg.primary,
        });
        const text = new TextRenderable(this.renderer, { content: "" });
        box.add(text);
        this.packetList.add(box);
        this.rowPool.push({ box, text });
      }
    });
  }

  private rowDisplayedPacketId: number[] = [];
  private needsFullRefresh = false;

  private addPacketRow(packet: DecodedPacket) {
    perf.time("addPacketRow", () => {
      this.initRowPool();

      // Check if we're near the bottom before adding
      const wasAtBottom = this.isNearBottom();

      // Track packet order for selection
      const wasAtMax = this.packetRowOrder.length >= this.maxVisiblePackets;
      this.packetRowOrder.push(packet.id);
      if (this.packetRowOrder.length > this.maxVisiblePackets) {
        this.packetRowOrder.shift();
        if (this.selectedIndex > 0) this.selectedIndex--;
      }

      // Mark that we need a refresh (batched)
      if (wasAtMax) {
        this.needsFullRefresh = true;
      } else {
        // Still filling - just update the new slot
        const newIdx = this.packetRowOrder.length - 1;
        this.updateRowSlot(newIdx, packet.id);
      }

      if (this.packetStore.count === 1) {
        this.selectedIndex = 0;
        this.updatePacketSelection();
      }

      // Auto-scroll if we were at the bottom
      if (wasAtBottom) {
        perf.time("scrollToBottom", () => this.scrollToBottom());
      }
    });
  }

  private refreshAllRows() {
    if (!this.needsFullRefresh) return;
    this.needsFullRefresh = false;
    perf.time("refreshAllRows", () => {
      for (let i = 0; i < Math.min(this.rowPool.length, this.packetRowOrder.length); i++) {
        this.updateRowSlot(i, this.packetRowOrder[i]);
      }
    });
  }

  private updateRowSlot(index: number, packetId: number) {
    // Skip if this slot already shows this packet
    if (this.rowDisplayedPacketId[index] === packetId) return;

    const poolRow = this.rowPool[index];

    // Use cached formatted content if available
    let formatted = this.formattedCache.get(packetId);
    if (!formatted) {
      const p = this.packetStore.get(packetId);
      if (p) {
        const t = p.timestamp.toLocaleTimeString("en-US", { hour12: false });
        formatted = this.formatPacketRow(p, t);
        this.formattedCache.set(packetId, formatted);
        // Prune cache if too large
        if (this.formattedCache.size > this.maxCacheSize) {
          const firstKey = this.formattedCache.keys().next().value;
          if (firstKey !== undefined) this.formattedCache.delete(firstKey);
        }
      }
    }

    if (formatted) {
      poolRow.text.content = formatted;
      poolRow.box.backgroundColor = packetId === this.lastHighlightedId
        ? theme.bg.selected : theme.bg.primary;
      this.rowDisplayedPacketId[index] = packetId;
    }
  }

  private isNearBottom(): boolean {
    const scrollPos = this.packetList.scrollOffset;
    const contentHeight = this.packetList.scrollHeight;
    const viewHeight = this.packetList.viewportHeight;
    // Consider "near bottom" if within 2 rows of the bottom
    return scrollPos >= contentHeight - viewHeight - 2;
  }

  private scrollToBottom() {
    this.packetList.scrollTo(this.packetList.scrollHeight);
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
      } else if (packet.portnum === Portnums.PortNum.ROUTING_APP && packet.payload && typeof packet.payload === "object") {
        const routing = packet.payload as { variant?: { case?: string; value?: number } };
        if (routing.variant?.case === "errorReason" && routing.variant.value !== undefined) {
          const errorName = Mesh.Routing_Error[routing.variant.value] || `ERROR_${routing.variant.value}`;
          if (routing.variant.value === Mesh.Routing_Error.NONE) {
            payload = ` ACK`;
          } else {
            payload = ` ${errorName}`;
          }
        }
      } else if (packet.portnum === Portnums.PortNum.TRACEROUTE_APP && packet.payload && typeof packet.payload === "object") {
        const route = (packet.payload as { route?: number[] }).route;
        if (route && route.length > 0) {
          payload = ` via ${route.length} hop${route.length > 1 ? "s" : ""}`;
        }
      }

      return t`${fg(theme.fg.muted)(`[${time}]`)} ${fg(theme.fg.accent)("◀")} ${fg(color)(portName.padEnd(14))} ${fg(theme.fg.secondary)(fromName.padEnd(10))} ${fg(theme.fg.muted)("→")} ${fg(theme.fg.secondary)(toName.padEnd(10))}${fg(theme.fg.primary)(payload)}`;
    }

    if (variantCase === "nodeInfo") {
      const info = fr.payloadVariant.value as Mesh.NodeInfo;
      const name = info.user?.shortName || info.user?.longName || `!${info.num.toString(16)}`;
      const id = formatNodeId(info.num);
      return t`${fg(theme.fg.muted)(`[${time}]`)} ${fg(theme.fg.secondary)("⚙")} ${fg(theme.packet.nodeinfo)("NODEINFO".padEnd(14))} ${fg(theme.fg.accent)(name.padEnd(10))} ${fg(theme.fg.muted)(id)}`;
    }

    if (variantCase === "myInfo") {
      const myInfo = fr.payloadVariant.value as Mesh.MyNodeInfo;
      const id = formatNodeId(myInfo.myNodeNum);
      return t`${fg(theme.fg.muted)(`[${time}]`)} ${fg(theme.fg.secondary)("⚙")} ${fg(theme.packet.direct)("MY_INFO".padEnd(14))} ${fg(theme.fg.accent)(id)}`;
    }

    if (variantCase === "config") {
      const config = fr.payloadVariant.value as Mesh.Config;
      const configType = config.payloadVariant.case || "unknown";
      return t`${fg(theme.fg.muted)(`[${time}]`)} ${fg(theme.fg.secondary)("⚙")} ${fg(theme.packet.config)("CONFIG".padEnd(14))} ${fg(theme.fg.secondary)(configType)}`;
    }

    if (variantCase === "moduleConfig") {
      const config = fr.payloadVariant.value as Mesh.ModuleConfig;
      const configType = config.payloadVariant.case || "unknown";
      return t`${fg(theme.fg.muted)(`[${time}]`)} ${fg(theme.fg.secondary)("⚙")} ${fg(theme.packet.config)("MODULE_CONFIG".padEnd(14))} ${fg(theme.fg.secondary)(configType)}`;
    }

    if (variantCase === "channel") {
      const channel = fr.payloadVariant.value as Mesh.Channel;
      const name = channel.settings?.name || `Channel ${channel.index}`;
      return t`${fg(theme.fg.muted)(`[${time}]`)} ${fg(theme.fg.secondary)("⚙")} ${fg(theme.packet.config)("CHANNEL".padEnd(14))} ${fg(theme.fg.secondary)(`#${channel.index}`)} ${fg(theme.fg.muted)(name)}`;
    }

    if (variantCase === "configCompleteId") {
      return t`${fg(theme.fg.muted)(`[${time}]`)} ${fg(theme.fg.secondary)("⚙")} ${fg(theme.packet.direct)("CONFIG_COMPLETE".padEnd(14))}`;
    }

    if (variantCase) {
      return t`${fg(theme.fg.muted)(`[${time}]`)} ${fg(theme.fg.secondary)("⚙")} ${fg(theme.packet.unknown)(variantCase.toUpperCase().padEnd(14))}`;
    }

    return t`${fg(theme.fg.muted)(`[${time}]`)} ${fg(theme.fg.secondary)("?")} ${fg(theme.packet.unknown)("UNKNOWN".padEnd(14))}`;
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

  private addOutboundPacketRow(portName: string, from: number, to: number, payload?: string) {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    const fromName = this.nodeStore.getNodeName(from);
    const toName = to === 0xffffffff ? "^all" : this.nodeStore.getNodeName(to);
    const payloadStr = payload ? ` "${payload.slice(0, 40)}${payload.length > 40 ? "..." : ""}"` : "";

    const box = new BoxRenderable(this.renderer, {
      id: `outbound-${Date.now()}`,
      width: "auto",
      height: 1,
      backgroundColor: theme.bg.primary,
    });

    const text = new TextRenderable(this.renderer, {
      content: t`${fg(theme.fg.muted)(`[${time}]`)} ${fg(theme.packet.direct)("▶")} ${fg(theme.packet.message)(portName.padEnd(14))} ${fg(theme.fg.secondary)(fromName.padEnd(10))} ${fg(theme.fg.muted)("→")} ${fg(theme.fg.secondary)(toName.padEnd(10))}${fg(theme.fg.primary)(payloadStr)}`,
    });

    box.add(text);
    this.packetList.add(box);
    this.packetList.scrollTo(this.packetList.scrollHeight);
    this.updateStatus();
  }
}
