import type { DeviceOutput, DeviceStatus, Transport } from "./types";
import { Logger } from "../logger";
import { validateUrl } from "../utils/safe-exec";

const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = 5000;

export class HttpTransport implements Transport {
  private url: string;
  private running = false;
  private outputs: DeviceOutput[] = [];
  private resolvers: Array<(value: IteratorResult<DeviceOutput>) => void> = [];
  private lastStatus: DeviceStatus = "disconnected";
  private readonly MAX_QUEUE_SIZE = 1000;
  private consecutiveErrors = 0;
  private readonly MAX_CONSECUTIVE_ERRORS = 10;

  constructor(url: string) {
    this.url = url.replace(/\/$/, "");
  }

  static async create(address: string, tls = false): Promise<HttpTransport> {
    // Validate address format
    try {
      // Basic validation - address should not contain protocol
      if (address.includes("://")) {
        throw new Error("Address should not include protocol (http:// or https://)");
      }
    } catch (error) {
      Logger.error("HttpTransport", "Invalid address format", error as Error, { address });
      throw error;
    }

    const url = `${tls ? "https" : "http"}://${address}`;
    
    // Validate the constructed URL
    try {
      validateUrl(url);
    } catch (error) {
      Logger.error("HttpTransport", "Invalid URL", error as Error, { url, address, tls });
      throw error;
    }

    Logger.info("HttpTransport", "Attempting connection", { address, tls, url });
    try {
      await fetch(`${url}/api/v1/fromradio`, {
        method: "GET",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      Logger.info("HttpTransport", "Connection successful", { url });
      const transport = new HttpTransport(url);
      transport.startPolling();
      return transport;
    } catch (error) {
      Logger.error("HttpTransport", "Connection failed", error as Error, { url });
      throw error;
    }
  }

  private startPolling() {
    this.running = true;
    Logger.info("HttpTransport", "Starting polling", { url: this.url, interval: POLL_INTERVAL_MS });
    this.emit({ type: "status", status: "connecting" });
    this.poll();
  }

  private async poll() {
    let iterationCount = 0;
    while (this.running) {
      try {
        iterationCount++;
        // Heartbeat every 60 iterations (~3 minutes at 3s per iteration)
        if (iterationCount % 60 === 0) {
          Logger.info("HttpTransport", `Poll heartbeat: ${iterationCount} iterations`);
        }
        // Drain available packets with a small delay between each
        let gotPacket = true;
        let batchCount = 0;
        while (gotPacket && this.running && batchCount < 50) {
          Logger.debug("HttpTransport", "Polling for packets", { url: `${this.url}/api/v1/fromradio` });
          const response = await fetch(`${this.url}/api/v1/fromradio?all=false`, {
            method: "GET",
            headers: { Accept: "application/x-protobuf" },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });

          if (!response.ok) {
            Logger.warn("HttpTransport", "HTTP error response", { status: response.status, statusText: response.statusText });
            throw new Error(`HTTP ${response.status}`);
          }

          this.emit({ type: "status", status: "connected" });

          const buffer = await response.arrayBuffer();
          if (buffer.byteLength > 0) {
            const data = new Uint8Array(buffer);
            Logger.info("HttpTransport", "Packet received", { size: data.byteLength, batchCount: batchCount + 1 });
            this.emit({ type: "packet", data, raw: data });
            batchCount++;
            // Small delay between packets to let UI breathe
            if (batchCount % 10 === 0) {
              await new Promise((r) => setTimeout(r, 50));
            }
          } else {
            Logger.debug("HttpTransport", "No packets available");
            gotPacket = false;
          }
        }
        if (batchCount > 0) {
          Logger.info("HttpTransport", "Batch complete", { totalPackets: batchCount });
        }
      } catch (e) {
        if (this.running) {
          this.consecutiveErrors++;
          Logger.error("HttpTransport", "Poll error", e as Error, { 
            consecutiveErrors: this.consecutiveErrors 
          });
          
          // Implement exponential backoff for repeated errors
          const backoffDelay = Math.min(
            POLL_INTERVAL_MS * Math.pow(2, Math.min(this.consecutiveErrors - 1, 5)),
            30000 // Max 30 seconds
          );
          
          this.emit({
            type: "status",
            status: "disconnected",
            reason: e instanceof Error ? e.message : "unknown",
          });

          // Stop polling if too many consecutive errors
          if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
            Logger.error("HttpTransport", "Too many consecutive errors, stopping polling", undefined, {
              consecutiveErrors: this.consecutiveErrors
            });
            this.running = false;
            return;
          }

          await new Promise((r) => setTimeout(r, backoffDelay));
          continue; // Skip normal poll interval after backoff
        }
      }
      // Reset error counter on successful poll
      this.consecutiveErrors = 0;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  private emit(output: DeviceOutput) {
    if (output.type === "status") {
      if (output.status === this.lastStatus) return;
      this.lastStatus = output.status;
      // Reset error counter on successful status change
      if (output.status === "connected") {
        this.consecutiveErrors = 0;
      }
    }
    const resolver = this.resolvers.shift();
    if (resolver) {
      resolver({ value: output, done: false });
    } else {
      // Prevent unbounded queue growth
      if (this.outputs.length >= this.MAX_QUEUE_SIZE) {
        Logger.warn("HttpTransport", "Output queue full, dropping oldest", { queueSize: this.outputs.length });
        this.outputs.shift();
      }
      this.outputs.push(output);
    }
  }

  get fromDevice(): AsyncIterable<DeviceOutput> {
    const self = this;
    return {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<DeviceOutput>> {
            const queued = self.outputs.shift();
            if (queued) return Promise.resolve({ value: queued, done: false });
            if (!self.running) return Promise.resolve({ value: undefined as any, done: true });
            return new Promise((resolve) => self.resolvers.push(resolve));
          },
        };
      },
    };
  }

  async send(data: Uint8Array): Promise<void> {
    Logger.info("HttpTransport", "Sending packet", { size: data.byteLength, url: `${this.url}/api/v1/toradio` });
    try {
      const response = await fetch(`${this.url}/api/v1/toradio`, {
        method: "PUT",
        headers: { "Content-Type": "application/x-protobuf" },
        body: Buffer.from(data),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        Logger.error("HttpTransport", "Send failed", undefined, { status: response.status, statusText: response.statusText });
        throw new Error(`HTTP ${response.status}`);
      }
      Logger.info("HttpTransport", "Packet sent successfully", { size: data.byteLength });
    } catch (error) {
      Logger.error("HttpTransport", "Send error", error as Error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    Logger.info("HttpTransport", "Disconnecting", { url: this.url });
    this.running = false;
    this.emit({ type: "status", status: "disconnected", reason: "user" });
    for (const resolver of this.resolvers) {
      resolver({ value: undefined as any, done: true });
    }
    this.resolvers = [];
    Logger.info("HttpTransport", "Disconnected");
  }

  async fetchOwner(): Promise<{ id: string; longName: string; shortName: string; hwModel: string; myNodeNum: number } | null> {
    // Try /json/nodes endpoint to find local node (node with hopsAway=0 or smallest num)
    Logger.debug("HttpTransport", "Fetching owner info", { url: `${this.url}/json/nodes` });
    try {
      const response = await fetch(`${this.url}/json/nodes`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        Logger.warn("HttpTransport", "Failed to fetch owner", { status: response.status });
        return null;
      }
      const data = await response.json();
      // nodes endpoint returns { nodes: { "!hex": {...}, ... } } or array
      const nodes = data.nodes || data;
      let localNode: any = null;

      if (Array.isArray(nodes)) {
        localNode = nodes.find((n: any) => n.hopsAway === 0) || nodes[0];
      } else {
        for (const key in nodes) {
          const n = nodes[key];
          if (n.hopsAway === 0) { localNode = n; break; }
          if (!localNode) localNode = n;
        }
      }

      if (localNode) {
        const user = localNode.user || localNode;
        const owner = {
          id: user.id || localNode.id || "",
          longName: user.longName || localNode.longName || "",
          shortName: user.shortName || localNode.shortName || "",
          hwModel: user.hwModel || localNode.hwModel || "",
          myNodeNum: localNode.num || parseInt(localNode.id?.replace("!", ""), 16) || 0,
        };
        Logger.info("HttpTransport", "Owner info fetched", owner);
        return owner;
      }
      Logger.warn("HttpTransport", "No local node found");
      return null;
    } catch (error) {
      Logger.error("HttpTransport", "Error fetching owner", error as Error);
      return null;
    }
  }
}
