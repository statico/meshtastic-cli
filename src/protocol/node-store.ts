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
  publicKey?: Uint8Array;
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
      this.nodes.set(n.num, { ...n, lastHeard: n.lastHeard || 0, publicKey: n.publicKey });
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
      publicKey: info.user?.publicKey?.length ? info.user.publicKey : existing.publicKey,
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
      publicKey: user.publicKey?.length ? user.publicKey : existing.publicKey,
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
    // Synced from meshtastic/protobufs mesh.proto HardwareModel enum
    let hwModelNum = existing.hwModel;
    if (data.hwModel) {
      const hwModels: Record<string, number> = {
        "UNSET": 0, "TLORA_V2": 1, "TLORA_V1": 2, "TLORA_V2_1_1P6": 3,
        "TBEAM": 4, "HELTEC_V2_0": 5, "TBEAM_V0P7": 6, "T_ECHO": 7,
        "TLORA_V1_1P3": 8, "RAK4631": 9, "HELTEC_V2_1": 10, "HELTEC_V1": 11,
        "LILYGO_TBEAM_S3_CORE": 12, "RAK11200": 13, "NANO_G1": 14,
        "TLORA_V2_1_1P8": 15, "TLORA_T3_S3": 16, "NANO_G1_EXPLORER": 17,
        "NANO_G2_ULTRA": 18, "LORA_TYPE": 19, "WIPHONE": 20, "WIO_WM1110": 21,
        "RAK2560": 22, "HELTEC_HRU_3601": 23, "HELTEC_WIRELESS_BRIDGE": 24,
        "STATION_G1": 25, "RAK11310": 26, "SENSELORA_RP2040": 27,
        "SENSELORA_S3": 28, "CANARYONE": 29, "RP2040_LORA": 30, "STATION_G2": 31,
        "LORA_RELAY_V1": 32, "NRF52840DK": 33, "PPR": 34, "GENIEBLOCKS": 35,
        "NRF52_UNKNOWN": 36, "PORTDUINO": 37, "ANDROID_SIM": 38, "DIY_V1": 39,
        "NRF52840_PCA10059": 40, "DR_DEV": 41, "M5STACK": 42, "HELTEC_V3": 43,
        "HELTEC_WSL_V3": 44, "BETAFPV_2400_TX": 45, "BETAFPV_900_NANO_TX": 46,
        "RPI_PICO": 47, "HELTEC_WIRELESS_TRACKER": 48, "HELTEC_WIRELESS_PAPER": 49,
        "T_DECK": 50, "T_WATCH_S3": 51, "PICOMPUTER_S3": 52, "HELTEC_HT62": 53,
        "EBYTE_ESP32_S3": 54, "ESP32_S3_PICO": 55, "CHATTER_2": 56,
        "HELTEC_WIRELESS_PAPER_V1_0": 57, "HELTEC_WIRELESS_TRACKER_V1_0": 58,
        "UNPHONE": 59, "TD_LORAC": 60, "CDEBYTE_EORA_S3": 61, "TWC_MESH_V4": 62,
        "NRF52_PROMICRO_DIY": 63, "RADIOMASTER_900_BANDIT_NANO": 64,
        "HELTEC_CAPSULE_SENSOR_V3": 65, "HELTEC_VISION_MASTER_T190": 66,
        "HELTEC_VISION_MASTER_E213": 67, "HELTEC_VISION_MASTER_E290": 68,
        "HELTEC_MESH_NODE_T114": 69, "SENSECAP_INDICATOR": 70,
        "TRACKER_T1000_E": 71, "RAK3172": 72, "WIO_E5": 73,
        "RADIOMASTER_900_BANDIT": 74, "ME25LS01_4Y10TD": 75,
        "RP2040_FEATHER_RFM95": 76, "M5STACK_COREBASIC": 77, "M5STACK_CORE2": 78,
        "RPI_PICO2": 79, "M5STACK_CORES3": 80, "SEEED_XIAO_S3": 81, "MS24SF1": 82,
        "TLORA_C6": 83, "WISMESH_TAP": 84, "ROUTASTIC": 85, "MESH_TAB": 86,
        "MESHLINK": 87, "XIAO_NRF52_KIT": 88, "THINKNODE_M1": 89, "THINKNODE_M2": 90,
        "T_ETH_ELITE": 91, "HELTEC_SENSOR_HUB": 92, "MUZI_BASE": 93,
        "HELTEC_MESH_POCKET": 94, "SEEED_SOLAR_NODE": 95, "NOMADSTAR_METEOR_PRO": 96,
        "CROWPANEL": 97, "LINK_32": 98, "SEEED_WIO_TRACKER_L1": 99,
        "SEEED_WIO_TRACKER_L1_EINK": 100, "MUZI_R1_NEO": 101, "T_DECK_PRO": 102,
        "T_LORA_PAGER": 103, "M5STACK_RESERVED": 104, "WISMESH_TAG": 105,
        "RAK3312": 106, "THINKNODE_M5": 107, "HELTEC_MESH_SOLAR": 108,
        "T_ECHO_LITE": 109, "HELTEC_V4": 110, "M5STACK_C6L": 111,
        "M5STACK_CARDPUTER_ADV": 112, "HELTEC_WIRELESS_TRACKER_V2": 113,
        "T_WATCH_ULTRA": 114, "THINKNODE_M3": 115, "WISMESH_TAP_V2": 116,
        "RAK3401": 117, "RAK6421": 118, "THINKNODE_M4": 119, "THINKNODE_M6": 120,
        "PRIVATE_HW": 255,
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

  updatePublicKey(nodeNum: number, publicKey: Uint8Array) {
    const existing = this.nodes.get(nodeNum);
    if (existing) {
      existing.publicKey = publicKey;
      // Save directly to DB using the dedicated function
      queueMicrotask(() => {
        try {
          db.updateNodePublicKey(nodeNum, publicKey);
        } catch {
          // Ignore DB errors
        }
      });
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
