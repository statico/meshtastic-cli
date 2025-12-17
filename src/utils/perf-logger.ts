import { appendFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const LOG_DIR = join(homedir(), ".config", "meshtastic-cli");
const LOG_PATH = join(LOG_DIR, "perf.log");

if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

interface TimingEntry {
  name: string;
  duration: number;
  timestamp: number;
}

interface CounterSnapshot {
  timestamp: number;
  packetRows: number;
  pendingPackets: number;
  totalPackets: number;
  heapUsed: number;
  heapTotal: number;
  eventLoopLag: number;
}

class PerfLogger {
  private timings: TimingEntry[] = [];
  private counters: CounterSnapshot[] = [];
  private startTime = Date.now();
  private lastEventLoopCheck = Date.now();
  private eventLoopLag = 0;
  private enabled = false;

  enable() {
    this.enabled = true;
    writeFileSync(LOG_PATH, `=== Performance Log Started ${new Date().toISOString()} ===\n`);
    this.measureEventLoopLag();
  }

  disable() {
    this.enabled = false;
  }

  private measureEventLoopLag() {
    if (!this.enabled) return;
    const now = Date.now();
    const expected = 100; // We schedule every 100ms
    const actual = now - this.lastEventLoopCheck;
    this.eventLoopLag = Math.max(0, actual - expected);
    this.lastEventLoopCheck = now;
    setTimeout(() => this.measureEventLoopLag(), 100);
  }

  time<T>(name: string, fn: () => T): T {
    if (!this.enabled) return fn();
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    this.timings.push({
      name,
      duration,
      timestamp: Date.now() - this.startTime,
    });
    // Log slow operations immediately
    if (duration > 16) {
      this.log(`SLOW: ${name} took ${duration.toFixed(2)}ms`);
    }
    return result;
  }

  async timeAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (!this.enabled) return fn();
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    this.timings.push({
      name,
      duration,
      timestamp: Date.now() - this.startTime,
    });
    if (duration > 16) {
      this.log(`SLOW: ${name} took ${duration.toFixed(2)}ms`);
    }
    return result;
  }

  snapshot(data: { packetRows: number; pendingPackets: number; totalPackets: number }) {
    if (!this.enabled) return;
    const mem = process.memoryUsage();
    const snapshot: CounterSnapshot = {
      timestamp: Date.now() - this.startTime,
      packetRows: data.packetRows,
      pendingPackets: data.pendingPackets,
      totalPackets: data.totalPackets,
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      eventLoopLag: this.eventLoopLag,
    };
    this.counters.push(snapshot);
    this.log(
      `SNAPSHOT: rows=${data.packetRows} pending=${data.pendingPackets} total=${data.totalPackets} ` +
      `heap=${snapshot.heapUsed}/${snapshot.heapTotal}MB lag=${this.eventLoopLag}ms`
    );
  }

  log(message: string) {
    if (!this.enabled) return;
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const line = `[${elapsed}s] ${message}\n`;
    try {
      appendFileSync(LOG_PATH, line);
    } catch {
      // Ignore write errors
    }
  }

  summarize() {
    if (!this.enabled || this.timings.length === 0) return;

    // Group timings by name
    const byName = new Map<string, number[]>();
    for (const t of this.timings) {
      if (!byName.has(t.name)) byName.set(t.name, []);
      byName.get(t.name)!.push(t.duration);
    }

    let summary = "\n=== TIMING SUMMARY ===\n";
    for (const [name, durations] of byName) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const max = Math.max(...durations);
      const count = durations.length;
      const slow = durations.filter((d) => d > 16).length;
      summary += `${name}: count=${count} avg=${avg.toFixed(2)}ms max=${max.toFixed(2)}ms slow=${slow}\n`;
    }

    if (this.counters.length > 0) {
      const last = this.counters[this.counters.length - 1];
      const first = this.counters[0];
      summary += "\n=== MEMORY TREND ===\n";
      summary += `Start: heap=${first.heapUsed}MB rows=${first.packetRows}\n`;
      summary += `End: heap=${last.heapUsed}MB rows=${last.packetRows}\n`;
      summary += `Growth: heap=${last.heapUsed - first.heapUsed}MB rows=${last.packetRows - first.packetRows}\n`;
    }

    summary += `\n=== END SUMMARY ===\n`;
    this.log(summary);
  }

  getLogPath(): string {
    return LOG_PATH;
  }
}

export const perf = new PerfLogger();
