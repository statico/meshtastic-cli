import { existsSync, mkdirSync, appendFileSync, statSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".config", "meshtastic-cli");
const LOG_PATH = join(CONFIG_DIR, "log");
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB
const FLUSH_INTERVAL = 500; // ms

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

class Logger {
  private static instance: Logger | null = null;
  private enabled = false;
  private writeQueue: string[] = [];
  private flushTimer: Timer | null = null;

  private constructor(enabled: boolean) {
    this.enabled = enabled;
    if (this.enabled) {
      this.ensureConfigDir();
      this.startFlushTimer();
    }
  }

  static init(enabled: boolean): void {
    if (Logger.instance === null) {
      Logger.instance = new Logger(enabled);
    }
  }

  static debug(context: string, message: string, data?: Record<string, any>): void {
    Logger.instance?.log(LogLevel.DEBUG, context, message, data);
  }

  static info(context: string, message: string, data?: Record<string, any>): void {
    Logger.instance?.log(LogLevel.INFO, context, message, data);
  }

  static warn(context: string, message: string, data?: Record<string, any>): void {
    Logger.instance?.log(LogLevel.WARN, context, message, data);
  }

  static error(context: string, message: string, error?: Error, data?: Record<string, any>): void {
    const errorData = error
      ? { ...data, error: error.message, stack: error.stack }
      : data;
    Logger.instance?.log(LogLevel.ERROR, context, message, errorData);
  }

  static shutdown(): void {
    if (Logger.instance) {
      Logger.instance.stopFlushTimer();
      Logger.instance.flushNow();
      Logger.instance = null;
    }
  }

  private log(level: LogLevel, context: string, message: string, data?: Record<string, any>): void {
    if (!this.enabled) return; // Fast path

    const timestamp = new Date().toISOString();
    const dataStr = data ? ` ${JSON.stringify(data)}` : "";
    const logEntry = `[${timestamp}] [${level}] [${context}] ${message}${dataStr}\n`;

    this.writeQueue.push(logEntry);

    // If queue is getting large, flush immediately
    if (this.writeQueue.length > 100) {
      this.flushNow();
    }
  }

  private ensureConfigDir(): void {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flushNow();
    }, FLUSH_INTERVAL);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private flushNow(): void {
    if (this.writeQueue.length === 0) return;

    const entries = this.writeQueue.join("");
    this.writeQueue = [];

    queueMicrotask(() => {
      try {
        appendFileSync(LOG_PATH, entries);
        this.rotateLogIfNeeded();
      } catch (error) {
        // Can't log errors in the logger, just output to console
        console.error("Failed to write log:", error);
      }
    });
  }

  private rotateLogIfNeeded(): void {
    try {
      if (!existsSync(LOG_PATH)) return;

      const stats = statSync(LOG_PATH);
      if (stats.size > MAX_LOG_SIZE) {
        // Keep the last 2.5MB of logs (half the max size)
        const content = readFileSync(LOG_PATH, "utf-8");
        const lines = content.split("\n");

        // Keep approximately half the file by line count
        const keepLines = Math.floor(lines.length / 2);
        const truncated = lines.slice(-keepLines).join("\n");

        writeFileSync(LOG_PATH, truncated);
      }
    } catch (error) {
      console.error("Failed to rotate log:", error);
    }
  }
}

export { Logger };
