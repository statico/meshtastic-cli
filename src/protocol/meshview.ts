// MeshView packet types and store for firehose data from MeshView server

export interface MeshViewPacket {
  id: number;
  import_time_us: number;
  import_time: string;  // ISO timestamp
  channel: string;
  from_node_id: number;
  to_node_id: number;
  portnum: number;
  long_name: string;
  to_long_name: string;
  payload: string;
  reply_id?: number;
}

export interface MeshViewApiResponse {
  packets: MeshViewPacket[];
  latest_import_time?: number;
}

export class MeshViewStore {
  private packets: MeshViewPacket[] = [];
  private maxSize = 1000;
  private latestImportTime = 0;
  private listeners: Array<(packets: MeshViewPacket[]) => void> = [];

  addPackets(newPackets: MeshViewPacket[], latestTime?: number) {
    if (newPackets.length === 0) return;

    // Sort new packets by import_time_us ascending (oldest first)
    const sorted = [...newPackets].sort((a, b) => a.import_time_us - b.import_time_us);

    // Append new packets
    this.packets.push(...sorted);

    // Trim to max size (keep newest)
    if (this.packets.length > this.maxSize) {
      this.packets = this.packets.slice(-this.maxSize);
    }

    // Update latest import time
    if (latestTime) {
      this.latestImportTime = latestTime;
    } else if (sorted.length > 0) {
      const lastPacket = sorted[sorted.length - 1];
      if (lastPacket.import_time_us > this.latestImportTime) {
        this.latestImportTime = lastPacket.import_time_us;
      }
    }

    // Notify listeners
    this.notifyListeners();
  }

  getAll(): MeshViewPacket[] {
    return [...this.packets];
  }

  get(id: number): MeshViewPacket | undefined {
    return this.packets.find(p => p.id === id);
  }

  getLatestImportTime(): number {
    return this.latestImportTime;
  }

  onUpdate(listener: (packets: MeshViewPacket[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  clear() {
    this.packets = [];
    this.latestImportTime = 0;
    this.notifyListeners();
  }

  get count(): number {
    return this.packets.length;
  }

  private notifyListeners() {
    const packets = this.getAll();
    for (const listener of this.listeners) {
      listener(packets);
    }
  }
}
