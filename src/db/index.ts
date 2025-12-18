import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync, existsSync } from "fs";

const DB_DIR = join(homedir(), ".config", "meshtastic-cli");
const DB_PATH = join(DB_DIR, "data.db");

if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA busy_timeout = 5000");

db.run(`
  CREATE TABLE IF NOT EXISTS nodes (
    num INTEGER PRIMARY KEY,
    user_id TEXT,
    long_name TEXT,
    short_name TEXT,
    hw_model INTEGER,
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
    hop_start INTEGER
  )
`);

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

export interface DbNode {
  num: number;
  userId?: string;
  longName?: string;
  shortName?: string;
  hwModel?: number;
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
}

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
}

export function upsertNode(node: DbNode) {
  db.run(`
    INSERT INTO nodes (num, user_id, long_name, short_name, hw_model, latitude_i, longitude_i, altitude, snr, last_heard, battery_level, voltage, channel_utilization, air_util_tx, channel, via_mqtt, hops_away, is_favorite, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(num) DO UPDATE SET
      user_id = COALESCE(excluded.user_id, user_id),
      long_name = COALESCE(excluded.long_name, long_name),
      short_name = COALESCE(excluded.short_name, short_name),
      hw_model = COALESCE(excluded.hw_model, hw_model),
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
      updated_at = excluded.updated_at
  `, [
    node.num,
    node.userId ?? null,
    node.longName ?? null,
    node.shortName ?? null,
    node.hwModel ?? null,
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
    Date.now(),
  ]);
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
  };
}

export function getAllNodes(): DbNode[] {
  const rows = db.query(`SELECT * FROM nodes ORDER BY hops_away ASC, last_heard DESC`).all() as any[];
  return rows.map((row) => ({
    num: row.num,
    userId: row.user_id,
    longName: row.long_name,
    shortName: row.short_name,
    hwModel: row.hw_model,
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
  }));
}

export function getNodeName(num: number): string | null {
  const row = db.query(`SELECT short_name, long_name FROM nodes WHERE num = ?`).get(num) as any;
  if (!row) return null;
  return row.short_name || row.long_name || null;
}

export function insertMessage(msg: DbMessage) {
  db.run(`
    INSERT INTO messages (packet_id, from_node, to_node, channel, text, timestamp, rx_time, rx_snr, rx_rssi, hop_limit, hop_start)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  ]);
}

export function getMessages(channel?: number, limit = 100): DbMessage[] {
  const query = channel !== undefined
    ? db.query(`SELECT * FROM messages WHERE channel = ? ORDER BY timestamp DESC LIMIT ?`)
    : db.query(`SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?`);
  const rows = (channel !== undefined ? query.all(channel, limit) : query.all(limit)) as any[];
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
  }));
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
    raw: row.raw as Uint8Array,
  }));
}

export function prunePackets(maxPackets = 1000) {
  const count = (db.query(`SELECT COUNT(*) as count FROM packets`).get() as any).count;
  if (count > maxPackets) {
    db.run(`DELETE FROM packets WHERE id IN (SELECT id FROM packets ORDER BY timestamp ASC LIMIT ?)`, [count - maxPackets]);
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

export type LogResponse = DbPositionResponse | DbTracerouteResponse;

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

export function getTracerouteResponses(limit = 100): DbTracerouteResponse[] {
  const rows = db.query(`SELECT * FROM traceroute_responses ORDER BY timestamp DESC LIMIT ?`).all(limit) as any[];
  return rows.reverse().map((row) => ({
    id: row.id,
    packetId: row.packet_id,
    fromNode: row.from_node,
    requestedBy: row.requested_by,
    route: JSON.parse(row.route || "[]"),
    snrTowards: row.snr_towards ? JSON.parse(row.snr_towards) : undefined,
    snrBack: row.snr_back ? JSON.parse(row.snr_back) : undefined,
    hopLimit: row.hop_limit,
    timestamp: row.timestamp,
  }));
}

export function getLogResponses(limit = 100): LogResponse[] {
  const positions = getPositionResponses(limit);
  const traceroutes = getTracerouteResponses(limit);
  // Merge and sort by timestamp
  const all = [...positions, ...traceroutes];
  all.sort((a, b) => a.timestamp - b.timestamp);
  return all.slice(-limit);
}

export { db };
