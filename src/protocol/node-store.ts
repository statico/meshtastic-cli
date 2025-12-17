import type { Mesh, Telemetry } from "@meshtastic/protobufs";
import * as db from "../db";

export interface NodeData {
  num: number;
  userId?: string;
  longName?: string;
  shortName?: string;
  hwModel?: number;
  latitudeI?: number;
  longitudeI?: number;
  altitude?: number;
  snr?: number;
  lastHeard: number;
  batteryLevel?: number;
  voltage?: number;
  channelUtilization?: number;
  airUtilTx?: number;
  channel?: number;
  viaMqtt?: boolean;
  hopsAway?: number;
  isFavorite?: boolean;
}

type NodeListener = (nodes: NodeData[]) => void;

export class NodeStore {
  private nodes: Map<number, NodeData> = new Map();
  private listeners: NodeListener[] = [];
  private updateInterval: Timer | null = null;
  private emitScheduled = false;

  constructor() {
    this.loadFromDb();
  }

  private loadFromDb() {
    const dbNodes = db.getAllNodes();
    for (const n of dbNodes) {
      this.nodes.set(n.num, { ...n, lastHeard: n.lastHeard || 0 });
    }
  }

  onUpdate(listener: NodeListener) {
    this.listeners.push(listener);
    listener(this.getSortedNodes());
  }

  startPeriodicUpdates(intervalMs = 1000) {
    if (this.updateInterval) return;
    this.updateInterval = setInterval(() => this.emit(), intervalMs);
  }

  stopPeriodicUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  updateFromNodeInfo(info: Mesh.NodeInfo) {
    const existing = this.nodes.get(info.num) ?? ({ num: info.num, lastHeard: 0 } as NodeData);
    const updated: NodeData = {
      ...existing,
      userId: info.user?.id || existing.userId,
      longName: info.user?.longName || existing.longName,
      shortName: info.user?.shortName || existing.shortName,
      hwModel: info.user?.hwModel || existing.hwModel,
      latitudeI: info.position?.latitudeI ?? existing.latitudeI,
      longitudeI: info.position?.longitudeI ?? existing.longitudeI,
      altitude: info.position?.altitude ?? existing.altitude,
      snr: info.snr || existing.snr,
      lastHeard: info.lastHeard || existing.lastHeard || Date.now() / 1000,
      batteryLevel: info.deviceMetrics?.batteryLevel ?? existing.batteryLevel,
      voltage: info.deviceMetrics?.voltage ?? existing.voltage,
      channelUtilization: info.deviceMetrics?.channelUtilization ?? existing.channelUtilization,
      airUtilTx: info.deviceMetrics?.airUtilTx ?? existing.airUtilTx,
      channel: info.channel ?? existing.channel,
      viaMqtt: info.viaMqtt ?? existing.viaMqtt,
      hopsAway: info.hopsAway ?? existing.hopsAway,
      isFavorite: info.isFavorite ?? existing.isFavorite,
    };
    this.nodes.set(info.num, updated);
    this.saveNode(updated);
    this.emit();
  }

  updateFromUser(nodeNum: number, user: Mesh.User) {
    const existing = this.nodes.get(nodeNum) ?? ({ num: nodeNum, lastHeard: Date.now() / 1000 } as NodeData);
    const updated: NodeData = {
      ...existing,
      userId: user.id || existing.userId,
      longName: user.longName || existing.longName,
      shortName: user.shortName || existing.shortName,
      hwModel: user.hwModel || existing.hwModel,
      lastHeard: Date.now() / 1000,
    };
    this.nodes.set(nodeNum, updated);
    this.saveNode(updated);
    this.emit();
  }

  updateFromPacket(from: number, snr?: number, hopsAway?: number) {
    const existing = this.nodes.get(from) ?? ({ num: from, lastHeard: 0 } as NodeData);
    const updated: NodeData = {
      ...existing,
      lastHeard: Date.now() / 1000,
      snr: snr ?? existing.snr,
      hopsAway: hopsAway ?? existing.hopsAway,
    };
    this.nodes.set(from, updated);
    this.saveNode(updated);
    this.emit();
  }

  updatePosition(nodeNum: number, position: Mesh.Position) {
    const existing = this.nodes.get(nodeNum);
    if (existing) {
      existing.latitudeI = position.latitudeI ?? existing.latitudeI;
      existing.longitudeI = position.longitudeI ?? existing.longitudeI;
      existing.altitude = position.altitude ?? existing.altitude;
      this.saveNode(existing);
      this.emit();
    }
  }

  updateDeviceMetrics(nodeNum: number, metrics: Telemetry.DeviceMetrics) {
    const existing = this.nodes.get(nodeNum);
    if (existing) {
      existing.batteryLevel = metrics.batteryLevel ?? existing.batteryLevel;
      existing.voltage = metrics.voltage ?? existing.voltage;
      existing.channelUtilization = metrics.channelUtilization ?? existing.channelUtilization;
      existing.airUtilTx = metrics.airUtilTx ?? existing.airUtilTx;
      this.saveNode(existing);
      this.emit();
    }
  }

  getNode(num: number): NodeData | undefined {
    return this.nodes.get(num);
  }

  getNodeName(num: number): string {
    const node = this.nodes.get(num);
    if (node?.shortName) return node.shortName;
    if (node?.longName) return node.longName.slice(0, 8);
    return `!${num.toString(16).padStart(8, "0")}`;
  }

  getSortedNodes(): NodeData[] {
    return Array.from(this.nodes.values()).sort((a, b) => {
      const hopsA = a.hopsAway ?? 999;
      const hopsB = b.hopsAway ?? 999;
      if (hopsA !== hopsB) return hopsA - hopsB;
      return b.lastHeard - a.lastHeard;
    });
  }

  private emit() {
    // Throttle emits to avoid overwhelming UI
    if (this.emitScheduled) return;
    this.emitScheduled = true;
    queueMicrotask(() => {
      this.emitScheduled = false;
      const sorted = this.getSortedNodes();
      for (const listener of this.listeners) {
        listener(sorted);
      }
    });
  }

  private saveNode(node: NodeData) {
    queueMicrotask(() => {
      try {
        db.upsertNode(node);
      } catch {
        // Ignore DB errors
      }
    });
  }
}
