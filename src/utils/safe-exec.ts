import { spawn } from "child_process";
import { Logger } from "../logger";

/**
 * Safely opens a URL in the default browser using spawn instead of exec
 * to prevent command injection vulnerabilities.
 * 
 * @param url - The URL to open (must be a valid http/https URL)
 * @throws Error if URL is invalid or not http/https
 */
export function safeOpenUrl(url: string): void {
  // Validate URL format and protocol
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    Logger.error("safeOpenUrl", "Invalid URL format", undefined, { url });
    throw new Error("Invalid URL format");
  }

  // Only allow http and https protocols
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    Logger.error("safeOpenUrl", "Only http/https URLs are allowed", undefined, { 
      protocol: parsedUrl.protocol,
      url 
    });
    throw new Error(`Protocol ${parsedUrl.protocol} not allowed. Only http and https are permitted.`);
  }

  // Use spawn with argument array to prevent command injection
  // On macOS, use 'open' command
  // On Linux, try 'xdg-open'
  // On Windows, use 'start'
  const platform = process.platform;
  let command: string;
  let args: string[];

  if (platform === "darwin") {
    command = "open";
    args = [url];
  } else if (platform === "linux") {
    command = "xdg-open";
    args = [url];
  } else if (platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else {
    Logger.warn("safeOpenUrl", "Unsupported platform", { platform, url });
    throw new Error(`Unsupported platform: ${platform}`);
  }

  try {
    const child = spawn(command, args, {
      stdio: "ignore",
      detached: true,
    });

    // Don't wait for the process to exit
    child.unref();

    // Handle errors silently (browser might not be available)
    child.on("error", (error) => {
      Logger.debug("safeOpenUrl", "Failed to open URL", { error: error.message, url });
    });

    Logger.debug("safeOpenUrl", "Opened URL", { url, command, platform });
  } catch (error) {
    Logger.error("safeOpenUrl", "Error spawning process", error as Error, { url, command, platform });
    throw error;
  }
}

/**
 * Validates and sanitizes a URL string
 * @param url - URL string to validate
 * @param allowedProtocols - Array of allowed protocols (default: ["http:", "https:"])
 * @returns Validated URL object
 * @throws Error if URL is invalid or uses disallowed protocol
 */
export function validateUrl(url: string, allowedProtocols = ["http:", "https:"]): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL format: ${url}`);
  }

  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`Protocol ${parsed.protocol} not allowed. Allowed protocols: ${allowedProtocols.join(", ")}`);
  }

  return parsed;
}

/**
 * Validates a session name to prevent path traversal attacks
 * @param session - Session name to validate
 * @returns Validated session name
 * @throws Error if session name is invalid
 */
export function validateSessionName(session: string): string {
  // Only allow alphanumeric, underscore, and hyphen
  if (!/^[a-zA-Z0-9_-]+$/.test(session)) {
    throw new Error(`Invalid session name: ${session}. Only alphanumeric characters, underscores, and hyphens are allowed.`);
  }

  // Prevent empty or too long names
  if (session.length === 0) {
    throw new Error("Session name cannot be empty");
  }

  if (session.length > 100) {
    throw new Error("Session name cannot exceed 100 characters");
  }

  return session;
}

/**
 * Validates an IP address or hostname
 * @param address - Address to validate
 * @returns Validated address
 * @throws Error if address is invalid
 */
export function validateAddress(address: string): string {
  if (address.length === 0) {
    throw new Error("Address cannot be empty");
  }

  if (address.length > 253) {
    throw new Error("Address is too long (max 253 characters)");
  }

  // Basic validation: allow alphanumeric, dots, hyphens, colons (for IPv6)
  if (!/^[a-zA-Z0-9.:-]+$/.test(address)) {
    throw new Error(`Invalid address format: ${address}`);
  }

  return address;
}
