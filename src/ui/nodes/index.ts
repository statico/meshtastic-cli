import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  type CliRenderer,
  t,
  fg,
} from "@opentui/core";
import { theme } from "../theme";
import type { NodeData, NodeStore } from "../../protocol/node-store";
import { formatNodeId } from "../../utils/hex";

export class NodesPanel {
  private renderer: CliRenderer;
  private nodeStore: NodeStore;
  private container: BoxRenderable;
  private scrollBox: ScrollBoxRenderable;
  private nodeRows: Map<number, BoxRenderable> = new Map();
  private selectedIndex = 0;
  private nodes: NodeData[] = [];
  private onAction?: (action: string, node: NodeData) => void;

  constructor(renderer: CliRenderer, nodeStore: NodeStore) {
    this.renderer = renderer;
    this.nodeStore = nodeStore;

    this.container = new BoxRenderable(renderer, {
      id: "nodes-panel",
      width: "100%",
      flexGrow: 1,
      flexDirection: "column",
    });

    const header = new BoxRenderable(renderer, {
      id: "nodes-header",
      width: "100%",
      height: 1,
      backgroundColor: theme.bg.panel,
      paddingLeft: 1,
    });
    header.add(new TextRenderable(renderer, {
      content: t`${fg(theme.fg.muted)("NODE")}        ${fg(theme.fg.muted)("NAME")}              ${fg(theme.fg.muted)("HOPS")}  ${fg(theme.fg.muted)("SNR")}   ${fg(theme.fg.muted)("LAST SEEN")}        ${fg(theme.fg.muted)("BATTERY")}  ${fg(theme.fg.muted)("POSITION")}`,
    }));

    this.scrollBox = new ScrollBoxRenderable(renderer, {
      id: "nodes-scroll",
      rootOptions: { backgroundColor: theme.bg.primary, flexGrow: 1 },
      viewportOptions: { backgroundColor: theme.bg.primary },
      contentOptions: { backgroundColor: theme.bg.primary },
    });

    this.container.add(header);
    this.container.add(this.scrollBox);

    this.nodeStore.onUpdate((nodes) => {
      this.nodes = nodes;
      this.renderNodes();
    });
  }

  get element(): BoxRenderable {
    return this.container;
  }

  setActionHandler(handler: (action: string, node: NodeData) => void) {
    this.onAction = handler;
  }

  selectNext() {
    if (this.nodes.length === 0) return;
    this.selectedIndex = Math.min(this.selectedIndex + 1, this.nodes.length - 1);
    this.updateSelection();
    this.scrollBox.scrollBy(1);
  }

  selectPrev() {
    if (this.nodes.length === 0) return;
    this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
    this.updateSelection();
    this.scrollBox.scrollBy(-1);
  }

  getSelectedNode(): NodeData | undefined {
    return this.nodes[this.selectedIndex];
  }

  triggerAction(action: string) {
    const node = this.getSelectedNode();
    if (node && this.onAction) {
      this.onAction(action, node);
    }
  }

  private renderNodes() {
    for (const child of this.scrollBox.getChildren()) {
      this.scrollBox.remove(child.id);
    }
    this.nodeRows.clear();

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const row = this.createNodeRow(node, i);
      this.nodeRows.set(node.num, row);
      this.scrollBox.add(row);
    }
  }

  private createNodeRow(node: NodeData, index: number): BoxRenderable {
    const isSelected = index === this.selectedIndex;
    const row = new BoxRenderable(this.renderer, {
      id: `node-${node.num}`,
      width: "100%",
      height: 1,
      backgroundColor: isSelected ? theme.bg.selected : theme.bg.primary,
      paddingLeft: 1,
    });

    row.add(new TextRenderable(this.renderer, { content: this.formatNodeLine(node) }));
    return row;
  }

  private formatNodeLine(node: NodeData): string {
    const id = formatNodeId(node.num).padEnd(10);
    const name = (node.shortName || node.longName?.slice(0, 12) || "???").padEnd(18);
    const hops = node.hopsAway !== undefined ? node.hopsAway.toString().padStart(2) : " ?";
    const snr = node.snr !== undefined ? `${node.snr.toFixed(1)}`.padStart(5) : "    ?";
    const lastSeen = this.formatTimeSince(node.lastHeard);
    const battery = this.formatBattery(node.batteryLevel);
    const position = this.formatPosition(node);

    return t`${fg(theme.fg.accent)(id)}  ${fg(theme.fg.primary)(name)}  ${fg(this.getHopsColor(node.hopsAway))(hops)}   ${fg(theme.fg.secondary)(snr)}   ${fg(theme.fg.muted)(lastSeen)}  ${fg(theme.fg.secondary)(battery)}  ${fg(theme.fg.muted)(position)}`;
  }

  private getHopsColor(hops?: number): string {
    if (hops === undefined) return theme.fg.muted;
    if (hops === 0) return theme.packet.direct;
    if (hops === 1) return theme.fg.accent;
    if (hops <= 3) return theme.packet.position;
    return theme.packet.encrypted;
  }

  private formatTimeSince(timestamp: number): string {
    if (!timestamp) return "never".padEnd(16);
    const seconds = Math.floor(Date.now() / 1000 - timestamp);
    if (seconds < 0) return "just now".padEnd(16);
    if (seconds < 60) return `${seconds}s ago`.padEnd(16);
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`.padEnd(16);
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`.padEnd(16);
    return `${Math.floor(seconds / 86400)}d ago`.padEnd(16);
  }

  private formatBattery(level?: number): string {
    if (level === undefined) return "   ?".padEnd(8);
    if (level > 100) return "  PWR".padEnd(8);
    return `${level.toString().padStart(3)}%`.padEnd(8);
  }

  private formatPosition(node: NodeData): string {
    if (!node.latitudeI || !node.longitudeI) return "no position";
    const lat = (node.latitudeI / 1e7).toFixed(4);
    const lng = (node.longitudeI / 1e7).toFixed(4);
    return `${lat}, ${lng}`;
  }

  private updateSelection() {
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const row = this.nodeRows.get(node.num);
      if (row) {
        row.backgroundColor = i === this.selectedIndex ? theme.bg.selected : theme.bg.primary;
      }
    }
  }
}
