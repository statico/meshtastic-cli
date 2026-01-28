import { appendFileSync, writeFileSync } from "fs";

/**
 * Simple PCAP writer for Meshtastic packets
 * Uses LINKTYPE_USER0 (147) for custom protocol data
 * Format: https://wiki.wireshark.org/Development/LibpcapFileFormat
 */
export class PcapWriter {
  private path: string;
  private initialized = false;

  constructor(path: string) {
    this.path = path;
  }

  /**
   * Write pcap global header
   * Only call once at the start
   */
  private writeHeader() {
    if (this.initialized) return;

    const header = Buffer.alloc(24);
    header.writeUInt32LE(0xa1b2c3d4, 0); // Magic number (little endian)
    header.writeUInt16LE(2, 4); // Major version
    header.writeUInt16LE(4, 6); // Minor version
    header.writeInt32LE(0, 8); // Timezone offset (GMT)
    header.writeUInt32LE(0, 12); // Timestamp accuracy
    header.writeUInt32LE(65535, 16); // Max packet length
    header.writeUInt32LE(147, 20); // Link type: USER0 (custom)

    writeFileSync(this.path, header);
    this.initialized = true;
  }

  /**
   * Write a packet to the pcap file
   * @param data Raw packet bytes
   * @param timestamp Packet timestamp
   */
  writePacket(data: Uint8Array, timestamp: Date = new Date()) {
    if (!this.initialized) {
      this.writeHeader();
    }

    const ts = timestamp.getTime();
    const tsSec = Math.floor(ts / 1000);
    const tsUsec = (ts % 1000) * 1000;

    const packetHeader = Buffer.alloc(16);
    packetHeader.writeUInt32LE(tsSec, 0); // Timestamp seconds
    packetHeader.writeUInt32LE(tsUsec, 4); // Timestamp microseconds
    packetHeader.writeUInt32LE(data.byteLength, 8); // Captured length
    packetHeader.writeUInt32LE(data.byteLength, 12); // Original length

    appendFileSync(this.path, packetHeader);
    appendFileSync(this.path, data);
  }
}
