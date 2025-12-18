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

// Build the AES-CTR nonce from packet metadata
// Meshtastic nonce: packetId (8 bytes LE) + fromNode (4 bytes LE) + 0x00000001 (4 bytes)
function buildNonce(packetId: number, fromNode: number): Uint8Array {
  const nonce = new Uint8Array(16);
  const view = new DataView(nonce.buffer);
  view.setUint32(0, packetId, true); // packetId as little-endian
  view.setUint32(8, fromNode, true); // fromNode as little-endian
  view.setUint32(12, 1, true); // counter starts at 1
  return nonce;
}

// Pad a short key to 16 bytes (AES-128) with zeros
function padKey(shortKey: Uint8Array): Uint8Array {
  const key = new Uint8Array(16);
  key.set(shortKey.slice(0, 16));
  return key;
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
    { name: "AES-CTR", counter: nonceBuffer, length: 64 },
    cryptoKey,
    encryptedBuffer
  );
  return new Uint8Array(result);
}

// Validate decrypted data looks like a valid Meshtastic payload
function validateDecrypted(data: Uint8Array): { valid: boolean; confidence: "high" | "medium" | "low"; portnum?: number } {
  if (data.length < 2) return { valid: false, confidence: "low" };

  // Check for protobuf structure: first byte is often 0x08 (field 1, varint)
  // which represents the portnum field in Meshtastic Data message
  if (data[0] === 0x08) {
    const portnum = data[1];
    // Valid portnums are typically 1-256
    if (portnum >= 1 && portnum <= 256) {
      // High confidence if it's a known portnum
      if (portnum === 1 || portnum === 3 || portnum === 4 || portnum === 5 ||
          portnum === 32 || portnum === 33 || portnum === 67 || portnum === 68 ||
          portnum === 70 || portnum === 71 || portnum === 72 || portnum === 73) {
        return { valid: true, confidence: "high", portnum };
      }
      return { valid: true, confidence: "medium", portnum };
    }
  }

  // Check if it looks like ASCII text (for TEXT_MESSAGE_APP)
  let printableCount = 0;
  for (const b of data) {
    if ((b >= 32 && b < 127) || b === 10 || b === 13) {
      printableCount++;
    }
  }
  if (printableCount > data.length * 0.8) {
    return { valid: true, confidence: "medium" };
  }

  return { valid: false, confidence: "low" };
}

// Try to extract the payload from decrypted protobuf Data message
function extractPayload(data: Uint8Array): { portnum?: number; payload?: Uint8Array } {
  if (data.length < 2 || data[0] !== 0x08) return {};

  const portnum = data[1];

  // Look for field 2 (payload) which is length-delimited (wire type 2)
  // Field 2, wire type 2 = (2 << 3) | 2 = 0x12
  for (let i = 2; i < data.length - 1; i++) {
    if (data[i] === 0x12) {
      const len = data[i + 1];
      if (len > 0 && i + 2 + len <= data.length) {
        return { portnum, payload: data.slice(i + 2, i + 2 + len) };
      }
    }
  }

  return { portnum };
}

// Generator that yields key candidates for brute forcing
function* keyGenerator(depth: number): Generator<Uint8Array> {
  const maxKey = Math.pow(256, depth);
  for (let k = 0; k < maxKey; k++) {
    const key = new Uint8Array(depth);
    let val = k;
    for (let i = 0; i < depth; i++) {
      key[i] = val & 0xff;
      val >>>= 8;
    }
    yield key;
  }
}

export interface BruteForceOptions {
  encrypted: Uint8Array;
  packetId: number;
  fromNode: number;
  depth: number; // 1 = 256 keys, 2 = 65K keys, etc.
  onProgress?: (progress: BruteForceProgress) => void;
  signal?: { cancelled: boolean };
  chunkSize?: number;
}

export async function bruteForceDecrypt(
  options: BruteForceOptions
): Promise<DecryptResult | null> {
  const { encrypted, packetId, fromNode, depth, onProgress, signal, chunkSize = 1000 } = options;

  if (depth <= 0 || depth > 4) return null;

  const nonce = buildNonce(packetId, fromNode);
  const total = Math.pow(256, depth);
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
      const key = padKey(shortKey);

      try {
        const decrypted = await decryptAesCtr(encrypted, key, nonce);
        const validation = validateDecrypted(decrypted);

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
