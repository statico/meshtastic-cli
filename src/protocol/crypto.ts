// Meshtastic AES-CTR decryption and brute force utilities

export interface DecryptResult {
  key: Uint8Array;
  keyHex: string;
  decrypted: Uint8Array;
  portnum?: number;
  payload?: string | Uint8Array;
  confidence: "high" | "medium" | "low";
}

export interface BruteForceProgress {
  current: number;
  total: number;
  keysPerSecond: number;
}

// Meshtastic default key template for simple PSK values (AQ== = 0x01, etc.)
// The last byte is replaced with the simple key value (1-10)
const DEFAULT_KEY_TEMPLATE = new Uint8Array([
  0xd4, 0xf1, 0xbb, 0x3a, 0x20, 0x29, 0x07, 0x59,
  0xf0, 0xbc, 0xff, 0xab, 0xcf, 0x4e, 0x69, 0x00
]);

// Build the AES-CTR nonce from packet metadata
// Meshtastic nonce structure (from CryptoEngine.cpp):
//   bytes 0-7:  packetId (64-bit LE)
//   bytes 8-11: fromNode (32-bit LE)
//   bytes 12-15: counter (starts at 0)
function buildNonce(packetId: number, fromNode: number): Uint8Array {
  const nonce = new Uint8Array(16);
  const view = new DataView(nonce.buffer);
  view.setUint32(0, packetId, true);   // packetId low 32 bits
  view.setUint32(4, 0, true);          // packetId high 32 bits (always 0 in practice)
  view.setUint32(8, fromNode, true);   // fromNode
  view.setUint32(12, 0, true);         // counter starts at 0
  return nonce;
}

// Expand a short key to full 16-byte AES key
// Simple keys (1-10) use the Meshtastic default key template
function expandKey(shortKey: Uint8Array): Uint8Array {
  if (shortKey.length === 1 && shortKey[0] >= 1 && shortKey[0] <= 10) {
    // Simple key - use default template with last byte replaced
    const key = new Uint8Array(DEFAULT_KEY_TEMPLATE);
    key[15] = shortKey[0];
    return key;
  }
  // Zero-pad for other short keys
  const key = new Uint8Array(16);
  key.set(shortKey.slice(0, 16));
  return key;
}

// Read a protobuf varint from data at offset
function readVarint(data: Uint8Array, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  let shift = 0;
  let bytesRead = 0;
  while (offset + bytesRead < data.length && bytesRead < 5) {
    const byte = data[offset + bytesRead];
    value |= (byte & 0x7f) << shift;
    bytesRead++;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return { value, bytesRead };
}

// Count printable ASCII characters in data
function countPrintable(data: Uint8Array): number {
  let count = 0;
  for (const b of data) {
    if ((b >= 32 && b < 127) || b === 10 || b === 13 || b === 9) {
      count++;
    }
  }
  return count;
}

// Decrypt using AES-CTR
async function decryptAesCtr(
  encrypted: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array
): Promise<Uint8Array> {
  // Create fresh ArrayBuffers to avoid SharedArrayBuffer type issues
  const keyBuffer = new Uint8Array(key).buffer as ArrayBuffer;
  const nonceBuffer = new Uint8Array(nonce).buffer as ArrayBuffer;
  const encryptedBuffer = new Uint8Array(encrypted).buffer as ArrayBuffer;

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "AES-CTR" },
    false,
    ["decrypt"]
  );
  const result = await crypto.subtle.decrypt(
    { name: "AES-CTR", counter: nonceBuffer, length: 32 },
    cryptoKey,
    encryptedBuffer
  );
  return new Uint8Array(result);
}

// Validate decrypted data - STRICT: only accept TEXT_MESSAGE with high ASCII ratio
// This avoids false positives from random data that happens to start with 0x08 + valid portnum
function validateDecrypted(data: Uint8Array, encryptedLen: number): { valid: boolean; confidence: "high" | "medium" | "low"; portnum?: number } {
  if (data.length < 4) return { valid: false, confidence: "low" };

  // Must start with 0x08 (field 1, varint wire type = portnum)
  if (data[0] !== 0x08) return { valid: false, confidence: "low" };

  // Read portnum as varint
  const portnum = readVarint(data, 1);
  if (portnum.value < 1 || portnum.value > 512) return { valid: false, confidence: "low" };

  // Look for field 2 (payload) - tag 0x12 (field 2, length-delimited)
  const payloadTagOffset = 1 + portnum.bytesRead;
  if (payloadTagOffset >= data.length) return { valid: false, confidence: "low" };

  // Field 2 tag should be 0x12
  if (data[payloadTagOffset] !== 0x12) return { valid: false, confidence: "low" };

  // Read payload length
  const payloadLen = readVarint(data, payloadTagOffset + 1);
  if (payloadLen.value <= 0 || payloadLen.value > data.length) {
    return { valid: false, confidence: "low" };
  }

  const headerSize = payloadTagOffset + 1 + payloadLen.bytesRead;
  const expectedTotal = headerSize + payloadLen.value;

  // Sanity check: total size should roughly match encrypted size (allow ±4 for padding)
  if (expectedTotal > encryptedLen + 4 || expectedTotal < encryptedLen - 4) {
    return { valid: false, confidence: "low" };
  }

  // ONLY accept TEXT_MESSAGE (portnum=1) with ≥95% printable ASCII
  // Other portnums produce too many false positives
  if (portnum.value === 1 && payloadLen.value > 0) {
    const payloadOffset = headerSize;
    const payload = data.slice(payloadOffset, payloadOffset + payloadLen.value);
    const printableRatio = countPrintable(payload) / payload.length;
    if (printableRatio >= 0.95) {
      return { valid: true, confidence: "high", portnum: 1 };
    }
  }

  // Reject everything else - too many false positives
  return { valid: false, confidence: "low" };
}

// Try to extract the payload from decrypted protobuf Data message
function extractPayload(data: Uint8Array): { portnum?: number; payload?: Uint8Array } {
  if (data.length < 2 || data[0] !== 0x08) return {};

  // Read portnum as varint
  const portnumVar = readVarint(data, 1);
  const portnum = portnumVar.value;

  // Look for field 2 (payload) tag 0x12
  const payloadTagOffset = 1 + portnumVar.bytesRead;
  if (payloadTagOffset >= data.length || data[payloadTagOffset] !== 0x12) {
    return { portnum };
  }

  // Read payload length as varint
  const payloadLen = readVarint(data, payloadTagOffset + 1);
  const payloadOffset = payloadTagOffset + 1 + payloadLen.bytesRead;
  const payloadEnd = payloadOffset + payloadLen.value;

  if (payloadLen.value > 0 && payloadEnd <= data.length) {
    return { portnum, payload: data.slice(payloadOffset, payloadEnd) };
  }

  return { portnum };
}

// Generator that yields key candidates for brute forcing
// Only tries practically recoverable keys:
// - Simple keys 1-10 (expand to default template - these are the main target)
// - Optionally all 256 single-byte keys (for edge case of arbitrary byte like 0x42)
// Multi-byte brute force (65K+ keys) is useless since real PSKs are 16/32 bytes
function* keyGenerator(depth: number): Generator<Uint8Array> {
  // First try simple keys 1-10 (will use default template via expandKey)
  for (let k = 1; k <= 10; k++) {
    yield new Uint8Array([k]);
  }

  // If depth >= 2, also try all 256 single-byte keys (edge case)
  if (depth >= 2) {
    for (let k = 0; k < 256; k++) {
      if (k >= 1 && k <= 10) continue; // Already tried
      yield new Uint8Array([k]);
    }
  }
}

export interface BruteForceOptions {
  encrypted: Uint8Array;
  packetId: number;
  fromNode: number;
  depth: number; // 1 = simple keys 1-10, 2 = all 256 single-byte keys
  onProgress?: (progress: BruteForceProgress) => void;
  signal?: { cancelled: boolean };
  chunkSize?: number;
}

export async function bruteForceDecrypt(
  options: BruteForceOptions
): Promise<DecryptResult | null> {
  const { encrypted, packetId, fromNode, depth, onProgress, signal, chunkSize = 1000 } = options;

  if (depth <= 0 || depth > 2) return null;

  const nonce = buildNonce(packetId, fromNode);
  // Total keys: depth 1 = 10 simple keys, depth 2 = 256 single-byte keys
  const total = depth === 1 ? 10 : 256;
  let current = 0;
  const startTime = Date.now();

  const gen = keyGenerator(depth);

  while (true) {
    if (signal?.cancelled) return null;

    // Process a chunk of keys
    for (let i = 0; i < chunkSize; i++) {
      const result = gen.next();
      if (result.done) return null;

      const shortKey = result.value;
      const key = expandKey(shortKey);

      try {
        const decrypted = await decryptAesCtr(encrypted, key, nonce);
        const validation = validateDecrypted(decrypted, encrypted.length);

        if (validation.valid) {
          const keyHex = Array.from(shortKey, b => b.toString(16).padStart(2, "0")).join("");
          const extracted = extractPayload(decrypted);

          let payload: string | Uint8Array | undefined;
          if (extracted.payload) {
            // Try to decode as text if it's a text message
            if (extracted.portnum === 1) {
              try {
                payload = new TextDecoder().decode(extracted.payload);
              } catch {
                payload = extracted.payload;
              }
            } else {
              payload = extracted.payload;
            }
          }

          return {
            key: shortKey,
            keyHex: `0x${keyHex}`,
            decrypted,
            portnum: validation.portnum ?? extracted.portnum,
            payload,
            confidence: validation.confidence,
          };
        }
      } catch {
        // Decryption failed, try next key
      }

      current++;
    }

    // Report progress and yield to event loop
    if (onProgress) {
      const elapsed = (Date.now() - startTime) / 1000;
      onProgress({
        current,
        total,
        keysPerSecond: elapsed > 0 ? Math.round(current / elapsed) : 0,
      });
    }

    // Yield to event loop for UI responsiveness
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

// Helper to format portnum to string
export function portnumToString(portnum: number): string {
  const names: Record<number, string> = {
    1: "TEXT_MESSAGE",
    3: "POSITION",
    4: "NODEINFO",
    5: "ROUTING",
    32: "ADMIN",
    33: "REPLY",
    67: "TELEMETRY",
    68: "TRACEROUTE",
    70: "NEIGHBORINFO",
    71: "ATAK_FORWARDER",
    72: "MAP_REPORT",
    73: "STORE_FORWARD",
  };
  return names[portnum] || `PORT_${portnum}`;
}
