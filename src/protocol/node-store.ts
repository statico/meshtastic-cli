import type { Mesh, Telemetry } from "@meshtastic/protobufs";
import * as db from "../db";

export interface NodeData {
  num: number;
  userId?: string;
  longName?: string;
  shortName?: string;
  hwModel?: number;
  role?: number;
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
  isIgnored?: boolean;
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
      role: user.role ?? existing.role,
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

  updateFromMeshView(nodeNum: number, data: {
    longName?: string;
    shortName?: string;
    hwModel?: string;
    role?: string;
    lastLat?: number;
    lastLong?: number;
    lastSeen?: number;
  }) {
    const existing = this.nodes.get(nodeNum) ?? ({ num: nodeNum, lastHeard: 0 } as NodeData);

    // Map MeshView hw_model string to hwModel number (best effort)
    let hwModelNum = existing.hwModel;
    if (data.hwModel) {
      // Try to match known hardware models
      const hwModels: Record<string, number> = {
        "UNSET": 0, "TLORA_V2": 1, "TLORA_V1": 2, "TLORA_V2_1_1P6": 3,
        "TBEAM": 4, "HELTEC_V2_0": 5, "TBEAM_V0P7": 6, "T_ECHO": 7,
        "TLORA_V1_1P3": 8, "RAK4631": 9, "HELTEC_V2_1": 10, "HELTEC_V1": 11,
        "LILYGO_TBEAM_S3_CORE": 12, "RAK11200": 13, "NANO_G1": 14,
        "TLORA_V2_1_1P8": 15, "STATION_G1": 25, "RAK11310": 26,
        "HELTEC_V3": 43, "HELTEC_WSL_V3": 44, "TBEAM_S3_CORE": 47,
        "RAK4631_V2": 48, "HELTEC_HT62": 57, "EBYTE_ESP32_S3": 60,
        "TRACKER_T1000_E": 66, "HELTEC_WIRELESS_PAPER": 67,
        "HELTEC_WIRELESS_PAPER_V1_0": 68, "HELTEC_WIRELESS_TRACKER": 69,
        "SEEED_XIAO_S3": 78, "CARDKB": 80, "NANO_G2_ULTRA": 82,
      };
      hwModelNum = hwModels[data.hwModel] ?? existing.hwModel;
    }

    // Map MeshView role string to role number
    let roleNum = existing.role;
    if (data.role) {
      const roles: Record<string, number> = {
        "CLIENT": 0, "CLIENT_MUTE": 1, "ROUTER": 2, "ROUTER_CLIENT": 3,
        "REPEATER": 4, "TRACKER": 5, "SENSOR": 6, "TAK": 7, "CLIENT_HIDDEN": 8,
        "LOST_AND_FOUND": 9, "TAK_TRACKER": 10,
      };
      roleNum = roles[data.role] ?? existing.role;
    }

    const updated: NodeData = {
      ...existing,
      longName: data.longName || existing.longName,
      shortName: data.shortName || existing.shortName,
      hwModel: hwModelNum,
      role: roleNum,
      latitudeI: data.lastLat ?? existing.latitudeI,
      longitudeI: data.lastLong ?? existing.longitudeI,
      lastHeard: data.lastSeen ? Math.floor(data.lastSeen / 1000000) : existing.lastHeard,
      // Explicitly preserve radio metrics - MeshView doesn't have these
      snr: existing.snr,
      hopsAway: existing.hopsAway,
    };
    this.nodes.set(nodeNum, updated);
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

  removeNode(num: number) {
    this.nodes.delete(num);
    queueMicrotask(() => {
      try {
        db.deleteNode(num);
      } catch {
        // Ignore DB errors
      }
    });
    this.emit();
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
