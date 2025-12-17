import type { DecodedPacket } from "./decoder";
import { decodeFromRadio } from "./decoder";
import * as db from "../db";

export class PacketStore {
  private packets: DecodedPacket[] = [];
  private maxSize = 1000;
  private listeners: Array<(packet: DecodedPacket) => void> = [];

  constructor() {
    this.loadFromDb();
  }

  private loadFromDb() {
    try {
      const dbPackets = db.getPackets(this.maxSize);
      for (const dbPacket of dbPackets) {
        try {
          const decoded = decodeFromRadio(dbPacket.raw);
          decoded.id = dbPacket.id ?? decoded.id;
          decoded.timestamp = new Date(dbPacket.timestamp);
          this.packets.push(decoded);
        } catch {
          // Skip corrupted packets
        }
      }
    } catch {
      // Database error, start fresh
    }
  }

  add(packet: DecodedPacket) {
    this.packets.push(packet);
    if (this.packets.length > this.maxSize) {
      this.packets.shift();
    }
    this.saveToDb(packet);
    for (const listener of this.listeners) {
      listener(packet);
    }
  }

  private saveToDb(packet: DecodedPacket) {
    const mp = packet.meshPacket;
    db.insertPacket({
      packetId: mp?.id ?? 0,
      fromNode: mp?.from ?? 0,
      toNode: mp?.to ?? 0,
      channel: mp?.channel ?? 0,
      portnum: packet.portnum,
      timestamp: packet.timestamp.getTime(),
      rxTime: mp?.rxTime,
      rxSnr: mp?.rxSnr,
      rxRssi: mp?.rxRssi,
      raw: packet.raw,
    });
  }

  getAll(): DecodedPacket[] {
    return [...this.packets];
  }

  get(id: number): DecodedPacket | undefined {
    return this.packets.find((p) => p.id === id);
  }

  onPacket(listener: (packet: DecodedPacket) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  clear() {
    this.packets = [];
  }

  get count(): number {
    return this.packets.length;
  }
}
