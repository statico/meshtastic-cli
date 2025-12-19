// MeshView packet types and store for firehose data from MeshView server

// Decode protobuf-style escaped string (handles \NNN octal and \xNN hex escapes)
function decodeEscapedString(str: string): Uint8Array {
  const bytes: number[] = [];
  let i = 0;
  while (i < str.length) {
    if (str[i] === '\\' && i + 1 < str.length) {
      const next = str[i + 1];
      if (next >= '0' && next <= '7') {
        // Octal escape: \NNN (1-3 octal digits)
        let octal = '';
        let j = i + 1;
        while (j < str.length && j < i + 4 && str[j] >= '0' && str[j] <= '7') {
          octal += str[j];
          j++;
        }
        bytes.push(parseInt(octal, 8));
        i = j;
      } else if (next === 'x' && i + 3 < str.length) {
        // Hex escape: \xNN
        const hex = str.slice(i + 2, i + 4);
        bytes.push(parseInt(hex, 16));
        i += 4;
      } else if (next === 'n') {
        bytes.push(10);
        i += 2;
      } else if (next === 'r') {
        bytes.push(13);
        i += 2;
      } else if (next === 't') {
        bytes.push(9);
        i += 2;
      } else if (next === '\\') {
        bytes.push(92);
        i += 2;
      } else {
        bytes.push(str.charCodeAt(i));
        i++;
      }
    } else {
      bytes.push(str.charCodeAt(i));
      i++;
    }
  }
  return new Uint8Array(bytes);
}

// Extract public_key from MeshView NODEINFO payload (protobuf text format)
export function extractPublicKeyFromPayload(payload: string): Uint8Array | null {
  if (!payload) return null;

  // Look for public_key: "..." in protobuf text format
  const match = payload.match(/public_key:\s*"([^"]*)"/);
  if (!match || !match[1]) return null;

  const escapedKey = match[1];
  if (!escapedKey) return null;

  const decoded = decodeEscapedString(escapedKey);
  // Public keys should be 32 bytes
  if (decoded.length !== 32) return null;

  return decoded;
}

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
