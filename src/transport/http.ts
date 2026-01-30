import type { DeviceOutput, DeviceStatus, Transport } from "./types";
import { Logger } from "../logger";
import { validateUrl } from "../utils/safe-exec";

// Configurable timeouts - can be overridden via environment variables
const POLL_INTERVAL_MS = parseInt(process.env.MESHTASTIC_POLL_INTERVAL_MS || "3000", 10);
const TIMEOUT_MS = parseInt(process.env.MESHTASTIC_TIMEOUT_MS || "5000", 10);

// Helper to check if URL is localhost (for self-signed cert handling)
function isLocalhost(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.startsWith("127.") || hostname === "[::1]";
  } catch {
    return false;
  }
}

// Helper to create fetch options with TLS configuration for self-signed certs
function getFetchOptions(url: string, insecure: boolean, additionalOptions: RequestInit = {}): RequestInit {
  const options: RequestInit = { ...additionalOptions };
  
  // Accept self-signed certificates if insecure flag is set or if connecting to localhost
  if (url.startsWith("https://") && (insecure || isLocalhost(url))) {
    // Bun's fetch supports tls option to configure TLS
    (options as any).tls = {
      rejectUnauthorized: false,
    };
  }
  
  return options;
}

// Validate timeout values
if (isNaN(POLL_INTERVAL_MS) || POLL_INTERVAL_MS < 100 || POLL_INTERVAL_MS > 60000) {
  throw new Error(`Invalid POLL_INTERVAL_MS: ${process.env.MESHTASTIC_POLL_INTERVAL_MS}. Must be between 100 and 60000`);
}
if (isNaN(TIMEOUT_MS) || TIMEOUT_MS < 1000 || TIMEOUT_MS > 60000) {
  throw new Error(`Invalid TIMEOUT_MS: ${process.env.MESHTASTIC_TIMEOUT_MS}. Must be between 1000 and 60000`);
}

export class HttpTransport implements Transport {
  private url: string;
  private insecure: boolean;
  private running = false;
  private outputs: DeviceOutput[] = [];
  private resolvers: Array<(value: IteratorResult<DeviceOutput>) => void> = [];
  private lastStatus: DeviceStatus = "disconnected";
  private readonly MAX_QUEUE_SIZE = 1000;
  private consecutiveErrors = 0;
  private readonly MAX_CONSECUTIVE_ERRORS = 10;

  constructor(url: string, insecure = false) {
    this.url = url.replace(/\/$/, "");
    this.insecure = insecure;
  }

  static async create(address: string, tls = false, port?: number, insecure = false): Promise<HttpTransport> {
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

    // Check if address already includes a port
    const hasPort = /:\d+$/.test(address) || /]:\d+$/.test(address);
    let addressWithPort = address;
    let useTlsFlag = tls;
    
    if (!hasPort) {
      // If no port in address and port is explicitly provided, use it
      // Otherwise, don't add a port (use default HTTP/HTTPS port 80/443)
      if (port !== undefined) {
        addressWithPort = `${address}:${port}`;
      }
      // If no port provided and no port in address, use default HTTP port (no :port in URL)
    }
    // If port is provided via flag but address also has a port, flag takes precedence
    else if (port !== undefined) {
      // Extract hostname/IP from address
      const hostnameMatch = address.match(/^(.+):\d+$/);
      if (hostnameMatch) {
        addressWithPort = `${hostnameMatch[1]}:${port}`;
      }
    }

    const url = `${useTlsFlag ? "https" : "http"}://${addressWithPort}`;
    
    // Validate the constructed URL
    try {
      validateUrl(url);
    } catch (error) {
      Logger.error("HttpTransport", "Invalid URL", error as Error, { url, address, tls });
      throw error;
    }

    Logger.info("HttpTransport", "Attempting connection", { address, tls: useTlsFlag, url });
    
    // Perform initial connection test with short timeout for immediate feedback
    // This helps users know if the address/port is wrong before polling starts
    try {
      Logger.info("HttpTransport", "Testing initial connection", { url });
      const testResponse = await fetch(`${url}/api/v1/fromradio?all=false`, getFetchOptions(url, insecure, {
        method: "GET",
        headers: { Accept: "application/x-protobuf" },
        signal: AbortSignal.timeout(3000), // Short timeout for initial test
      }));
      if (!testResponse.ok) {
        Logger.warn("HttpTransport", "Initial connection test returned non-OK status", { 
          status: testResponse.status, 
          statusText: testResponse.statusText,
          url
        });
        // Don't throw - continue anyway, polling will handle it
      } else {
        Logger.info("HttpTransport", "Initial connection test successful", { url });
      }
    } catch (error) {
      // Log the error with URL for debugging
      const errorMsg = error instanceof Error ? error.message : String(error);
      Logger.warn("HttpTransport", "Initial connection test failed (will retry during polling)", error as Error, { 
        url,
        error: errorMsg
      });
      // Don't throw - start polling anyway to allow retries
    }
    
    Logger.info("HttpTransport", "Starting transport and polling", { url, insecure });
    const transport = new HttpTransport(url, insecure);
    transport.startPolling();
    return transport;
  }

  private startPolling() {
    this.running = true;
    Logger.info("HttpTransport", "Starting polling", { url: this.url, interval: POLL_INTERVAL_MS });
    this.emit({ type: "status", status: "connecting" });
    this.poll();
  }

  private async poll() {
    Logger.info("HttpTransport", "Poll loop starting", {
      url: this.url,
      running: this.running,
      timestamp: new Date().toISOString()
    });

    let iterationCount = 0;
    while (this.running) {
      try {
        iterationCount++;
        // Heartbeat every 60 iterations (~3 minutes at 3s per iteration)
        if (iterationCount % 60 === 0) {
          Logger.info("HttpTransport", `Poll heartbeat: ${iterationCount} iterations`, {
            consecutiveErrors: this.consecutiveErrors,
            pendingResolvers: this.resolvers.length,
            queuedOutputs: this.outputs.length
          });
        }
        // Drain available packets with a small delay between each
        let gotPacket = true;
        let batchCount = 0;
        while (gotPacket && this.running && batchCount < 50) {
          Logger.debug("HttpTransport", "Polling for packets", { url: `${this.url}/api/v1/fromradio` });
          const response = await fetch(`${this.url}/api/v1/fromradio?all=false`, getFetchOptions(this.url, this.insecure, {
            method: "GET",
            headers: { Accept: "application/x-protobuf" },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          }));

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
          
          // Stop polling if too many consecutive errors
          if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
            Logger.error("HttpTransport", "Too many consecutive errors, stopping polling", undefined, {
              consecutiveErrors: this.consecutiveErrors
            });
            this.emit({
              type: "status",
              status: "disconnected",
              reason: e instanceof Error ? e.message : "unknown",
            });
            this.running = false;
            return;
          }
          
          // While actively retrying, keep status as "connecting" to show we're still trying
          // Only emit disconnected when we've given up (handled above)
          // This provides better UX - user sees "connecting" while we're actively retrying

          await new Promise((r) => setTimeout(r, backoffDelay));
          continue; // Skip normal poll interval after backoff
        }
      }
      // Reset error counter on successful poll
      this.consecutiveErrors = 0;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    // Log when poll loop exits
    Logger.warn("HttpTransport", "Poll loop exited", {
      running: this.running,
      iterationCount,
      pendingResolvers: this.resolvers.length,
      outputsInQueue: this.outputs.length
    });

    // If running is still true, something unexpected happened
    if (this.running) {
      Logger.error("HttpTransport", "CRITICAL: Poll loop exited while running=true", new Error("Poll loop exited unexpectedly"), {
        iterationCount,
        consecutiveErrors: this.consecutiveErrors
      });
      // Set running to false and close the iterator
      this.running = false;
      for (const resolver of this.resolvers) {
        resolver({ value: undefined as any, done: true });
      }
      this.resolvers = [];
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
      Logger.debug("HttpTransport", "Emit: resolving pending promise", {
        outputType: output.type,
        remainingResolvers: this.resolvers.length,
        queuedOutputs: this.outputs.length
      });
      resolver({ value: output, done: false });
    } else {
      // Prevent unbounded queue growth
      if (this.outputs.length >= this.MAX_QUEUE_SIZE) {
        Logger.warn("HttpTransport", "Output queue full, dropping oldest", { queueSize: this.outputs.length });
        this.outputs.shift();
      }
      Logger.debug("HttpTransport", "Emit: queueing output (no pending promises)", {
        outputType: output.type,
        queueSize: this.outputs.length + 1
      });
      this.outputs.push(output);
    }
  }

  get fromDevice(): AsyncIterable<DeviceOutput> {
    const self = this;
    return {
      [Symbol.asyncIterator]() {
        let iterationCount = 0;
        return {
          next(): Promise<IteratorResult<DeviceOutput>> {
            iterationCount++;
            const queued = self.outputs.shift();
            if (queued) {
              Logger.debug("HttpTransport", "Iterator: returning queued output", {
                iteration: iterationCount,
                outputType: queued.type,
                queueLength: self.outputs.length
              });
              return Promise.resolve({ value: queued, done: false });
            }
            if (!self.running) {
              Logger.warn("HttpTransport", "Iterator: returning done (running=false)", {
                iteration: iterationCount,
                pendingResolvers: self.resolvers.length
              });
              return Promise.resolve({ value: undefined as any, done: true });
            }
            Logger.debug("HttpTransport", "Iterator: creating pending promise", {
              iteration: iterationCount,
              pendingResolvers: self.resolvers.length + 1
            });
            return new Promise((resolve) => self.resolvers.push(resolve));
          },
        };
      },
    };
  }

  async send(data: Uint8Array): Promise<void> {
    Logger.info("HttpTransport", "Sending packet", { size: data.byteLength, url: `${this.url}/api/v1/toradio` });
    try {
      const response = await fetch(`${this.url}/api/v1/toradio`, getFetchOptions(this.url, this.insecure, {
        method: "PUT",
        headers: { "Content-Type": "application/x-protobuf" },
        body: Buffer.from(data),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }));
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
    Logger.info("HttpTransport", "Disconnecting", {
      url: this.url,
      hadResolvers: this.resolvers.length > 0,
      pendingResolvers: this.resolvers.length,
      outputsInQueue: this.outputs.length
    });
    this.running = false;
    this.emit({ type: "status", status: "disconnected", reason: "user" });

    // Resolve all pending promises to unblock for-await loops
    const resolverCount = this.resolvers.length;
    for (const resolver of this.resolvers) {
      resolver({ value: undefined as any, done: true });
    }
    this.resolvers = [];

    Logger.info("HttpTransport", "Disconnected", {
      resolvedPromises: resolverCount,
      clearedOutputs: this.outputs.length
    });
  }

  async fetchOwner(): Promise<{ id: string; longName: string; shortName: string; hwModel: string; myNodeNum: number } | null> {
    // Try /json/nodes endpoint to find local node (node with hopsAway=0 or smallest num)
    Logger.debug("HttpTransport", "Fetching owner info", { url: `${this.url}/json/nodes` });
    try {
      const response = await fetch(`${this.url}/json/nodes`, getFetchOptions(this.url, this.insecure, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }));
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
