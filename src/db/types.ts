/**
 * Type definitions for database row structures
 * These types match the actual SQLite schema
 */

export interface DbNodeRow {
  num: number;
  user_id: string | null;
  long_name: string | null;
  short_name: string | null;
  hw_model: number | null;
  role: number | null;
  latitude_i: number | null;
  longitude_i: number | null;
  altitude: number | null;
  snr: number | null;
  last_heard: number | null;
  battery_level: number | null;
  voltage: number | null;
  channel_utilization: number | null;
  air_util_tx: number | null;
  channel: number | null;
  via_mqtt: number | null;
  hops_away: number | null;
  is_favorite: number | null;
  public_key: Uint8Array | null;
  updated_at: number | null;
}

export interface DbMessageRow {
  id: number;
  packet_id: number;
  from_node: number;
  to_node: number;
  channel: number;
  text: string;
  timestamp: number;
  rx_time: number | null;
  rx_snr: number | null;
  rx_rssi: number | null;
  hop_limit: number | null;
  hop_start: number | null;
  status: string;
  reply_id: number | null;
  error_reason: string | null;
}

export interface DbPacketRow {
  id: number;
  packet_id: number;
  from_node: number;
  to_node: number;
  channel: number;
  portnum: number | null;
  timestamp: number;
  rx_time: number | null;
  rx_snr: number | null;
  rx_rssi: number | null;
  raw: Uint8Array;
}

export interface DbCountResult {
  count: number;
}
