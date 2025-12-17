import type { DeviceOutput, DeviceStatus, Transport } from "./types";

const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = 5000;

export class HttpTransport implements Transport {
  private url: string;
  private running = false;
  private outputs: DeviceOutput[] = [];
  private resolvers: Array<(value: IteratorResult<DeviceOutput>) => void> = [];
  private lastStatus: DeviceStatus = "disconnected";

  constructor(url: string) {
    this.url = url.replace(/\/$/, "");
  }

  static async create(address: string, tls = false): Promise<HttpTransport> {
    const url = `${tls ? "https" : "http"}://${address}`;
    await fetch(`${url}/api/v1/fromradio`, {
      method: "GET",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const transport = new HttpTransport(url);
    transport.startPolling();
    return transport;
  }

  private startPolling() {
    this.running = true;
    this.emit({ type: "status", status: "connecting" });
    this.poll();
  }

  private async poll() {
    while (this.running) {
      try {
        // Drain available packets with a small delay between each
        let gotPacket = true;
        let batchCount = 0;
        while (gotPacket && this.running && batchCount < 50) {
          const response = await fetch(`${this.url}/api/v1/fromradio?all=false`, {
            method: "GET",
            headers: { Accept: "application/x-protobuf" },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });

          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          this.emit({ type: "status", status: "connected" });

          const buffer = await response.arrayBuffer();
          if (buffer.byteLength > 0) {
            const data = new Uint8Array(buffer);
            this.emit({ type: "packet", data, raw: data });
            batchCount++;
            // Small delay between packets to let UI breathe
            if (batchCount % 10 === 0) {
              await new Promise((r) => setTimeout(r, 50));
            }
          } else {
            gotPacket = false;
          }
        }
      } catch (e) {
        if (this.running) {
          this.emit({
            type: "status",
            status: "disconnected",
            reason: e instanceof Error ? e.message : "unknown",
          });
        }
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  private emit(output: DeviceOutput) {
    if (output.type === "status") {
      if (output.status === this.lastStatus) return;
      this.lastStatus = output.status;
    }
    const resolver = this.resolvers.shift();
    if (resolver) {
      resolver({ value: output, done: false });
    } else {
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
    const response = await fetch(`${this.url}/api/v1/toradio`, {
      method: "PUT",
      headers: { "Content-Type": "application/x-protobuf" },
      body: data,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }

  async disconnect(): Promise<void> {
    this.running = false;
    this.emit({ type: "status", status: "disconnected", reason: "user" });
    for (const resolver of this.resolvers) {
      resolver({ value: undefined as any, done: true });
    }
    this.resolvers = [];
  }

  async fetchOwner(): Promise<{ id: string; longName: string; shortName: string; hwModel: string; myNodeNum: number } | null> {
    // Try /json/nodes endpoint to find local node (node with hopsAway=0 or smallest num)
    try {
      const response = await fetch(`${this.url}/json/nodes`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return null;
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
        return {
          id: user.id || localNode.id || "",
          longName: user.longName || localNode.longName || "",
          shortName: user.shortName || localNode.shortName || "",
          hwModel: user.hwModel || localNode.hwModel || "",
          myNodeNum: localNode.num || parseInt(localNode.id?.replace("!", ""), 16) || 0,
        };
      }
      return null;
    } catch {
      return null;
    }
  }
}
