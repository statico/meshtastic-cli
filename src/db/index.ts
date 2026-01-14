import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync, existsSync, unlinkSync } from "fs";
import { Logger } from "../logger";
import { validateSessionName } from "../utils/safe-exec";

const DB_DIR = join(homedir(), ".config", "meshtastic-cli");
const BROADCAST_ADDR = 0xFFFFFFFF;

let db: Database;
let currentSession = "default";
let packetRetentionLimit = 50000;
let pruningInProgress = false;

export function getDbPath(session: string): string {
  // Validate session name to prevent path traversal attacks
  const validatedSession = validateSessionName(session);
  return join(DB_DIR, `${validatedSession}.db`);
}

export function setPacketRetentionLimit(limit: number) {
  packetRetentionLimit = limit;
  Logger.debug("Database", "Packet retention limit set", { limit });
}

export function initDb(session: string = "default") {
  currentSession = session;
  const dbPath = getDbPath(session);
  Logger.info("Database", "Initializing database", { session, path: dbPath });

  if (!existsSync(DB_DIR)) {
    Logger.debug("Database", "Creating database directory", { dir: DB_DIR });
    mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(dbPath);
  Logger.info("Database", "Database opened", { path: dbPath });

  // Enable WAL mode for better concurrent access
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA busy_timeout = 5000");
  Logger.debug("Database", "WAL mode and busy_timeout configured");

  db.run(`
    CREATE TABLE IF NOT EXISTS nodes (
      num INTEGER PRIMARY KEY,
      user_id TEXT,
      long_name TEXT,
      short_name TEXT,
      hw_model INTEGER,
      role INTEGER,
      latitude_i INTEGER,
      longitude_i INTEGER,
      altitude INTEGER,
      snr REAL,
      last_heard INTEGER,
      battery_level INTEGER,
      voltage REAL,
      channel_utilization REAL,
      air_util_tx REAL,
      channel INTEGER,
      via_mqtt INTEGER,
      hops_away INTEGER,
      is_favorite INTEGER,
      updated_at INTEGER
    )
  `);

  // Migration: add role column if it doesn't exist
  try {
    db.run(`ALTER TABLE nodes ADD COLUMN role INTEGER`);
  } catch {
    // Column already exists
  }

  // Migration: add public_key column if it doesn't exist
  try {
    db.run(`ALTER TABLE nodes ADD COLUMN public_key BLOB`);
  } catch {
    // Column already exists
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      packet_id INTEGER,
      from_node INTEGER,
      to_node INTEGER,
      channel INTEGER,
      text TEXT,
      timestamp INTEGER,
      rx_time INTEGER,
      rx_snr REAL,
      rx_rssi INTEGER,
      hop_limit INTEGER,
      hop_start INTEGER,
      status TEXT DEFAULT 'received'
    )
  `);

  // Add status column if it doesn't exist (migration)
  try {
    db.run(`ALTER TABLE messages ADD COLUMN status TEXT DEFAULT 'received'`);
  } catch {
    // Column already exists
  }

  // Migration: add reply_id column if it doesn't exist
  try {
    db.run(`ALTER TABLE messages ADD COLUMN reply_id INTEGER`);
  } catch {
    // Column already exists
  }

  // Migration: add error_reason column if it doesn't exist
  try {
    db.run(`ALTER TABLE messages ADD COLUMN error_reason TEXT`);
  } catch {
    // Column already exists
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS packets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      packet_id INTEGER,
      from_node INTEGER,
      to_node INTEGER,
      channel INTEGER,
      portnum INTEGER,
      timestamp INTEGER,
      rx_time INTEGER,
      rx_snr REAL,
      rx_rssi INTEGER,
      raw BLOB
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_packets_timestamp ON packets(timestamp)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS position_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      packet_id INTEGER,
      from_node INTEGER,
      requested_by INTEGER,
      latitude_i INTEGER,
      longitude_i INTEGER,
      altitude INTEGER,
      sats_in_view INTEGER,
      timestamp INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS traceroute_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      packet_id INTEGER,
      from_node INTEGER,
      requested_by INTEGER,
      route TEXT,
      snr_towards TEXT,
      snr_back TEXT,
      hop_limit INTEGER,
      timestamp INTEGER
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_position_responses_timestamp ON position_responses(timestamp)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_traceroute_responses_timestamp ON traceroute_responses(timestamp)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS nodeinfo_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      packet_id INTEGER,
      from_node INTEGER,
      requested_by INTEGER,
      long_name TEXT,
      short_name TEXT,
      hw_model INTEGER,
      timestamp INTEGER
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_nodeinfo_responses_timestamp ON nodeinfo_responses(timestamp)`);

  Logger.info("Database", "Database initialized successfully", {
    tables: ["nodes", "messages", "packets", "position_responses", "traceroute_responses", "nodeinfo_responses"]
  });
}

export function clearDb(session: string = "default") {
  const dbPath = getDbPath(session);
  const walPath = dbPath + "-wal";
  const shmPath = dbPath + "-shm";

  // Close db if it's the current session
  if (db && currentSession === session) {
    db.close();
    db = null as any; // Reset to allow re-initialization
  }

  // Delete database files
  if (existsSync(dbPath)) unlinkSync(dbPath);
  if (existsSync(walPath)) unlinkSync(walPath);
  if (existsSync(shmPath)) unlinkSync(shmPath);
}

/**
 * Closes the database connection gracefully
 * Should be called on application exit
 */
export function closeDb(): void {
  if (db) {
    try {
      db.close();
      Logger.info("Database", "Database connection closed");
    } catch (error) {
      Logger.error("Database", "Error closing database", error as Error);
    } finally {
      db = null as any;
    }
  }
}

export function getSessionName(): string {
  return currentSession;
}

export interface DbNode {
  num: number;
  userId?: string;
  longName?: string;
  shortName?: string;
  hwModel?: number;
  role?: number;
  latitudeI?: number;
  longitudeI?: number;
  altitude?: number;
  snr?: number;
  lastHeard?: number;
  batteryLevel?: number;
  voltage?: number;
  channelUtilization?: number;
  airUtilTx?: number;
  channel?: number;
  viaMqtt?: boolean;
  hopsAway?: number;
  isFavorite?: boolean;
  publicKey?: Uint8Array;
}

export type MessageStatus = "pending" | "acked" | "delivered" | "error" | "received";

export interface DbMessage {
  id?: number;
  packetId: number;
  fromNode: number;
  toNode: number;
  channel: number;
  text: string;
  timestamp: number;
  rxTime?: number;
  rxSnr?: number;
  rxRssi?: number;
  hopLimit?: number;
  hopStart?: number;
  status?: MessageStatus;
  replyId?: number;
  errorReason?: string;
}

export function upsertNode(node: DbNode) {
  Logger.debug("Database", "Upserting node", {
    num: node.num,
    userId: node.userId,
    longName: node.longName,
    shortName: node.shortName,
  });
  db.run(`
    INSERT INTO nodes (num, user_id, long_name, short_name, hw_model, role, latitude_i, longitude_i, altitude, snr, last_heard, battery_level, voltage, channel_utilization, air_util_tx, channel, via_mqtt, hops_away, is_favorite, public_key, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(num) DO UPDATE SET
      user_id = COALESCE(excluded.user_id, user_id),
      long_name = COALESCE(excluded.long_name, long_name),
      short_name = COALESCE(excluded.short_name, short_name),
      hw_model = COALESCE(excluded.hw_model, hw_model),
      role = COALESCE(excluded.role, role),
      latitude_i = COALESCE(excluded.latitude_i, latitude_i),
      longitude_i = COALESCE(excluded.longitude_i, longitude_i),
      altitude = COALESCE(excluded.altitude, altitude),
      snr = COALESCE(excluded.snr, snr),
      last_heard = COALESCE(excluded.last_heard, last_heard),
      battery_level = COALESCE(excluded.battery_level, battery_level),
      voltage = COALESCE(excluded.voltage, voltage),
      channel_utilization = COALESCE(excluded.channel_utilization, channel_utilization),
      air_util_tx = COALESCE(excluded.air_util_tx, air_util_tx),
      channel = COALESCE(excluded.channel, channel),
      via_mqtt = COALESCE(excluded.via_mqtt, via_mqtt),
      hops_away = COALESCE(excluded.hops_away, hops_away),
      is_favorite = COALESCE(excluded.is_favorite, is_favorite),
      public_key = COALESCE(excluded.public_key, public_key),
      updated_at = excluded.updated_at
  `, [
    node.num,
    node.userId ?? null,
    node.longName ?? null,
    node.shortName ?? null,
    node.hwModel ?? null,
    node.role ?? null,
    node.latitudeI ?? null,
    node.longitudeI ?? null,
    node.altitude ?? null,
    node.snr ?? null,
    node.lastHeard ?? null,
    node.batteryLevel ?? null,
    node.voltage ?? null,
    node.channelUtilization ?? null,
    node.airUtilTx ?? null,
    node.channel ?? null,
    node.viaMqtt ? 1 : null,
    node.hopsAway ?? null,
    node.isFavorite ? 1 : null,
    node.publicKey ?? null,
    Date.now(),
  ]);
}

export function updateNodePublicKey(num: number, publicKey: Uint8Array) {
  db.run(`UPDATE nodes SET public_key = ?, updated_at = ? WHERE num = ?`, [publicKey, Date.now(), num]);
}

export function getNode(num: number): DbNode | null {
  const row = db.query(`SELECT * FROM nodes WHERE num = ?`).get(num) as any;
  if (!row) return null;
  return {
    num: row.num,
    userId: row.user_id,
    longName: row.long_name,
    shortName: row.short_name,
    hwModel: row.hw_model,
    role: row.role,
    latitudeI: row.latitude_i,
    longitudeI: row.longitude_i,
    altitude: row.altitude,
    snr: row.snr,
    lastHeard: row.last_heard,
    batteryLevel: row.battery_level,
    voltage: row.voltage,
    channelUtilization: row.channel_utilization,
    airUtilTx: row.air_util_tx,
    channel: row.channel,
    viaMqtt: !!row.via_mqtt,
    hopsAway: row.hops_away,
    isFavorite: !!row.is_favorite,
    publicKey: row.public_key ? new Uint8Array(row.public_key) : undefined,
  };
}

export function getAllNodes(): DbNode[] {
  Logger.debug("Database", "Querying all nodes");
  const rows = db.query(`SELECT * FROM nodes ORDER BY hops_away ASC, last_heard DESC`).all() as any[];
  Logger.debug("Database", "Query complete", { nodeCount: rows.length });
  return rows.map((row) => ({
    num: row.num,
    userId: row.user_id,
    longName: row.long_name,
    shortName: row.short_name,
    hwModel: row.hw_model,
    role: row.role,
    latitudeI: row.latitude_i,
    longitudeI: row.longitude_i,
    altitude: row.altitude,
    snr: row.snr,
    lastHeard: row.last_heard,
    batteryLevel: row.battery_level,
    voltage: row.voltage,
    channelUtilization: row.channel_utilization,
    airUtilTx: row.air_util_tx,
    channel: row.channel,
    viaMqtt: !!row.via_mqtt,
    hopsAway: row.hops_away,
    isFavorite: !!row.is_favorite,
    publicKey: row.public_key ? new Uint8Array(row.public_key) : undefined,
  }));
}

export function getNodeName(num: number): string | null {
  const row = db.query(`SELECT short_name, long_name FROM nodes WHERE num = ?`).get(num) as any;
  if (!row) return null;
  return row.short_name || row.long_name || null;
}

export function deleteNode(num: number) {
  db.run(`DELETE FROM nodes WHERE num = ?`, [num]);
}

export function insertMessage(msg: DbMessage) {
  Logger.debug("Database", "Inserting message", {
    packetId: msg.packetId,
    fromNode: msg.fromNode,
    toNode: msg.toNode,
    channel: msg.channel,
    textLength: msg.text?.length,
  });
  db.run(`
    INSERT INTO messages (packet_id, from_node, to_node, channel, text, timestamp, rx_time, rx_snr, rx_rssi, hop_limit, hop_start, status, reply_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    msg.packetId,
    msg.fromNode,
    msg.toNode,
    msg.channel,
    msg.text,
    msg.timestamp,
    msg.rxTime ?? null,
    msg.rxSnr ?? null,
    msg.rxRssi ?? null,
    msg.hopLimit ?? null,
    msg.hopStart ?? null,
    msg.status ?? "received",
    msg.replyId ?? null,
  ]);
}

export function updateMessageStatus(packetId: number, status: MessageStatus, errorReason?: string) {
  if (errorReason) {
    db.run(`UPDATE messages SET status = ?, error_reason = ? WHERE packet_id = ?`, [status, errorReason, packetId]);
  } else {
    db.run(`UPDATE messages SET status = ? WHERE packet_id = ?`, [status, packetId]);
  }
}

export function getMessages(channel?: number, limit = 100): DbMessage[] {
  // Only get broadcast messages (channel chat), exclude DMs
  const query = channel !== undefined
    ? db.query(`SELECT * FROM messages WHERE channel = ? AND to_node = ? ORDER BY timestamp DESC LIMIT ?`)
    : db.query(`SELECT * FROM messages WHERE to_node = ? ORDER BY timestamp DESC LIMIT ?`);
  const rows = (channel !== undefined ? query.all(channel, BROADCAST_ADDR, limit) : query.all(BROADCAST_ADDR, limit)) as any[];
  return rows.reverse().map((row) => ({
    id: row.id,
    packetId: row.packet_id,
    fromNode: row.from_node,
    toNode: row.to_node,
    channel: row.channel,
    text: row.text,
    timestamp: row.timestamp,
    rxTime: row.rx_time,
    rxSnr: row.rx_snr,
    rxRssi: row.rx_rssi,
    hopLimit: row.hop_limit,
    hopStart: row.hop_start,
    status: row.status as MessageStatus,
    replyId: row.reply_id ?? undefined,
    errorReason: row.error_reason ?? undefined,
  }));
}

export function getMessageByPacketId(packetId: number): DbMessage | null {
  const row = db.query(`SELECT * FROM messages WHERE packet_id = ?`).get(packetId) as any;
  if (!row) return null;
  return {
    id: row.id,
    packetId: row.packet_id,
    fromNode: row.from_node,
    toNode: row.to_node,
    channel: row.channel,
    text: row.text,
    timestamp: row.timestamp,
    rxTime: row.rx_time,
    rxSnr: row.rx_snr,
    rxRssi: row.rx_rssi,
    hopLimit: row.hop_limit,
    hopStart: row.hop_start,
    status: row.status as MessageStatus,
    replyId: row.reply_id ?? undefined,
    errorReason: row.error_reason ?? undefined,
  };
}

export interface DbPacket {
  id?: number;
  packetId: number;
  fromNode: number;
  toNode: number;
  channel: number;
  portnum?: number;
  timestamp: number;
  rxTime?: number;
  rxSnr?: number;
  rxRssi?: number;
  raw: Uint8Array;
}

export function insertPacket(packet: DbPacket) {
  Logger.debug("Database", "Inserting packet", {
    packetId: packet.packetId,
    fromNode: packet.fromNode,
    toNode: packet.toNode,
    channel: packet.channel,
    portnum: packet.portnum,
    rawSize: packet.raw.byteLength,
  });
  db.run(`
    INSERT INTO packets (packet_id, from_node, to_node, channel, portnum, timestamp, rx_time, rx_snr, rx_rssi, raw)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    packet.packetId,
    packet.fromNode,
    packet.toNode,
    packet.channel,
    packet.portnum ?? null,
    packet.timestamp,
    packet.rxTime ?? null,
    packet.rxSnr ?? null,
    packet.rxRssi ?? null,
    packet.raw,
  ]);
  prunePackets();
}

export function getPackets(limit = 1000): DbPacket[] {
  const rows = db.query(`SELECT * FROM packets ORDER BY timestamp DESC LIMIT ?`).all(limit) as any[];
  return rows.reverse().map((row) => ({
    id: row.id,
    packetId: row.packet_id,
    fromNode: row.from_node,
    toNode: row.to_node,
    channel: row.channel,
    portnum: row.portnum,
    timestamp: row.timestamp,
    rxTime: row.rx_time,
    rxSnr: row.rx_snr,
    rxRssi: row.rx_rssi,
    raw: new Uint8Array(row.raw),
  }));
}

export function prunePackets() {
  // Prevent concurrent pruning operations
  if (pruningInProgress) {
    Logger.debug("Database", "Pruning already in progress, skipping");
    return;
  }

  pruningInProgress = true;
  try {
    const count = (db.query(`SELECT COUNT(*) as count FROM packets`).get() as any).count;
    if (count > packetRetentionLimit) {
      const toDelete = count - packetRetentionLimit;
      Logger.debug("Database", "Pruning packets", { current: count, limit: packetRetentionLimit, toDelete });
      db.run(`DELETE FROM packets WHERE id IN (SELECT id FROM packets ORDER BY timestamp ASC LIMIT ?)`, [toDelete]);
      Logger.debug("Database", "Packets pruned", { deleted: toDelete });
    }
  } catch (error) {
    Logger.error("Database", "Error pruning packets", error as Error);
  } finally {
    pruningInProgress = false;
  }
}

export function getPacketCount(): number {
  return (db.query(`SELECT COUNT(*) as count FROM packets`).get() as any).count;
}

// Position and Traceroute response types

export interface DbPositionResponse {
  id?: number;
  packetId: number;
  fromNode: number;
  requestedBy: number;
  latitudeI?: number;
  longitudeI?: number;
  altitude?: number;
  satsInView?: number;
  timestamp: number;
}

export interface DbTracerouteResponse {
  id?: number;
  packetId: number;
  fromNode: number;
  requestedBy: number;
  route: number[];
  snrTowards?: number[];
  snrBack?: number[];
  hopLimit: number;
  timestamp: number;
}

export interface DbNodeInfoResponse {
  id?: number;
  packetId: number;
  fromNode: number;
  requestedBy: number;
  longName?: string;
  shortName?: string;
  hwModel?: number;
  timestamp: number;
}

export type LogResponse = DbPositionResponse | DbTracerouteResponse | DbNodeInfoResponse;

export function insertPositionResponse(response: DbPositionResponse) {
  db.run(`
    INSERT INTO position_responses (packet_id, from_node, requested_by, latitude_i, longitude_i, altitude, sats_in_view, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    response.packetId,
    response.fromNode,
    response.requestedBy,
    response.latitudeI ?? null,
    response.longitudeI ?? null,
    response.altitude ?? null,
    response.satsInView ?? null,
    response.timestamp,
  ]);
}

export function insertTracerouteResponse(response: DbTracerouteResponse) {
  db.run(`
    INSERT INTO traceroute_responses (packet_id, from_node, requested_by, route, snr_towards, snr_back, hop_limit, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    response.packetId,
    response.fromNode,
    response.requestedBy,
    JSON.stringify(response.route),
    response.snrTowards ? JSON.stringify(response.snrTowards) : null,
    response.snrBack ? JSON.stringify(response.snrBack) : null,
    response.hopLimit,
    response.timestamp,
  ]);
}

export function getPositionResponses(limit = 100): DbPositionResponse[] {
  const rows = db.query(`SELECT * FROM position_responses ORDER BY timestamp DESC LIMIT ?`).all(limit) as any[];
  return rows.reverse().map((row) => ({
    id: row.id,
    packetId: row.packet_id,
    fromNode: row.from_node,
    requestedBy: row.requested_by,
    latitudeI: row.latitude_i,
    longitudeI: row.longitude_i,
    altitude: row.altitude,
    satsInView: row.sats_in_view,
    timestamp: row.timestamp,
  }));
}

/**
 * Safely parses JSON with a fallback value
 */
function safeJsonParse<T>(json: string | null | undefined, defaultValue: T): T {
  if (!json) return defaultValue;
  try {
    return JSON.parse(json);
  } catch (error) {
    Logger.warn("Database", "Failed to parse JSON, using default", { 
      error: error instanceof Error ? error.message : String(error),
      defaultValue: typeof defaultValue
    });
    return defaultValue;
  }
}

export function getTracerouteResponses(limit = 100): DbTracerouteResponse[] {
  const rows = db.query(`SELECT * FROM traceroute_responses ORDER BY timestamp DESC LIMIT ?`).all(limit) as any[];
  return rows.reverse().map((row) => ({
    id: row.id,
    packetId: row.packet_id,
    fromNode: row.from_node,
    requestedBy: row.requested_by,
    route: safeJsonParse<number[]>(row.route, []),
    snrTowards: row.snr_towards ? safeJsonParse<number[]>(row.snr_towards, []) : undefined,
    snrBack: row.snr_back ? safeJsonParse<number[]>(row.snr_back, []) : undefined,
    hopLimit: row.hop_limit,
    timestamp: row.timestamp,
  }));
}

export function insertNodeInfoResponse(response: DbNodeInfoResponse) {
  db.run(`
    INSERT INTO nodeinfo_responses (packet_id, from_node, requested_by, long_name, short_name, hw_model, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    response.packetId,
    response.fromNode,
    response.requestedBy,
    response.longName ?? null,
    response.shortName ?? null,
    response.hwModel ?? null,
    response.timestamp,
  ]);
}

export function getNodeInfoResponses(limit = 100): DbNodeInfoResponse[] {
  const rows = db.query(`SELECT * FROM nodeinfo_responses ORDER BY timestamp DESC LIMIT ?`).all(limit) as any[];
  return rows.reverse().map((row) => ({
    id: row.id,
    packetId: row.packet_id,
    fromNode: row.from_node,
    requestedBy: row.requested_by,
    longName: row.long_name,
    shortName: row.short_name,
    hwModel: row.hw_model,
    timestamp: row.timestamp,
  }));
}

export function getLogResponses(limit = 100): LogResponse[] {
  const positions = getPositionResponses(limit);
  const traceroutes = getTracerouteResponses(limit);
  const nodeinfos = getNodeInfoResponses(limit);
  // Merge and sort by timestamp
  const all = [...positions, ...traceroutes, ...nodeinfos];
  all.sort((a, b) => a.timestamp - b.timestamp);
  return all.slice(-limit);
}

// DM (Direct Message) queries
// DMs are messages where to_node is NOT broadcast (0xFFFFFFFF)

export interface DMConversation {
  nodeNum: number;
  lastMessage: string;
  lastTimestamp: number;
  unreadCount: number;
}

export function getDMConversations(myNodeNum: number): DMConversation[] {
  // Get all unique nodes we've had DM conversations with
  // A DM is either: to_node = myNodeNum (received) or from_node = myNodeNum AND to_node != broadcast (sent)
  const rows = db.query(`
    SELECT
      CASE
        WHEN from_node = ? THEN to_node
        ELSE from_node
      END as other_node,
      text as last_message,
      MAX(timestamp) as last_timestamp,
      SUM(CASE WHEN from_node != ? AND status = 'received' THEN 1 ELSE 0 END) as unread_count
    FROM messages
    WHERE to_node != ?
      AND (from_node = ? OR to_node = ?)
    GROUP BY other_node
    ORDER BY last_timestamp DESC
  `).all(myNodeNum, myNodeNum, BROADCAST_ADDR, myNodeNum, myNodeNum) as any[];

  return rows.map((row) => ({
    nodeNum: row.other_node,
    lastMessage: row.last_message,
    lastTimestamp: row.last_timestamp,
    unreadCount: row.unread_count,
  }));
}

export function getDMMessages(myNodeNum: number, otherNodeNum: number, limit = 100): DbMessage[] {
  // Get messages between myNodeNum and otherNodeNum (excluding broadcast)
  const rows = db.query(`
    SELECT * FROM messages
    WHERE to_node != ?
      AND ((from_node = ? AND to_node = ?) OR (from_node = ? AND to_node = ?))
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(BROADCAST_ADDR, myNodeNum, otherNodeNum, otherNodeNum, myNodeNum, limit) as any[];

  return rows.reverse().map((row) => ({
    id: row.id,
    packetId: row.packet_id,
    fromNode: row.from_node,
    toNode: row.to_node,
    channel: row.channel,
    text: row.text,
    timestamp: row.timestamp,
    rxTime: row.rx_time,
    rxSnr: row.rx_snr,
    rxRssi: row.rx_rssi,
    hopLimit: row.hop_limit,
    hopStart: row.hop_start,
    status: row.status as MessageStatus,
    replyId: row.reply_id ?? undefined,
    errorReason: row.error_reason ?? undefined,
  }));
}

export function markDMsAsRead(myNodeNum: number, otherNodeNum: number) {
  // Mark received DMs from otherNodeNum as read (could add a 'read' status later)
  // For now, we don't track read status separately from received
}

export function deleteDMConversation(myNodeNum: number, otherNodeNum: number) {
  // Delete all DM messages between myNodeNum and otherNodeNum
  db.run(`
    DELETE FROM messages
    WHERE to_node != ?
      AND ((from_node = ? AND to_node = ?) OR (from_node = ? AND to_node = ?))
  `, [BROADCAST_ADDR, myNodeNum, otherNodeNum, otherNodeNum, myNodeNum]);
}
