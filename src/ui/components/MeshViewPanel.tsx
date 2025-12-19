import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import { Portnums } from "@meshtastic/protobufs";
import { formatNodeId } from "../../utils";
import { fitVisual } from "../../utils/string-width";
import type { MeshViewPacket } from "../../protocol/meshview";

function LiveIndicator({ error }: { error?: string | null }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % 4);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  // Radio waves animation
  const frames = ["  •  ", " ❨•❩ ", "❨❨•❩❩"];
  const pattern = [0, 1, 2, 1];
  const dimGreen = "#2d5a3d";

  if (error) {
    return (
      <Text>
        <Text color={theme.packet.encrypted} bold>ERROR </Text>
        <Text color={theme.fg.muted}>{error}</Text>
      </Text>
    );
  }

  return (
    <Text>
      <Text color={theme.status.online} bold>LIVE</Text>
      <Text> </Text>
      <Text color={dimGreen}>{frames[pattern[frame]]}</Text>
    </Text>
  );
}

// Get port color based on portnum
function getPortColor(portnum: number): string {
  switch (portnum) {
    case Portnums.PortNum.TEXT_MESSAGE_APP: return theme.packet.message;
    case Portnums.PortNum.POSITION_APP: return theme.packet.position;
    case Portnums.PortNum.TELEMETRY_APP: return theme.packet.telemetry;
    case Portnums.PortNum.NODEINFO_APP: return theme.packet.nodeinfo;
    case Portnums.PortNum.ROUTING_APP: return theme.packet.routing;
    case Portnums.PortNum.TRACEROUTE_APP: return theme.packet.traceroute;
    default: return theme.packet.unknown;
  }
}

// Format port name from portnum
function getPortName(portnum: number): string {
  const name = Portnums.PortNum[portnum];
  if (name) {
    return name.replace(/_APP$/, "");
  }
  return `PORT_${portnum}`;
}

// Render colorized payload summary
function renderPayloadSummary(payload: string, portnum: number): React.ReactNode {
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload);

    // Handle text messages
    if (typeof parsed === "string") {
      const text = parsed.slice(0, 40);
      return <Text color={theme.data.quote}> "{text}{parsed.length > 40 ? "..." : ""}"</Text>;
    }

    if (typeof parsed !== "object" || parsed === null) return null;

    // Text in text field
    if (parsed.text) {
      const text = String(parsed.text).slice(0, 40);
      return <Text color={theme.data.quote}> "{text}{String(parsed.text).length > 40 ? "..." : ""}"</Text>;
    }

    // Position data - convert latitudeI/longitudeI to real coordinates
    if (parsed.latitudeI !== undefined && parsed.longitudeI !== undefined) {
      const lat = (parsed.latitudeI / 1e7).toFixed(5);
      const lon = (parsed.longitudeI / 1e7).toFixed(5);
      return (
        <>
          <Text color={theme.data.coords}> {lat}</Text>
          <Text color={theme.fg.muted}>,</Text>
          <Text color={theme.data.coords}> {lon}</Text>
          {parsed.altitude != null && <Text color={theme.data.altitude}> {parsed.altitude}m</Text>}
        </>
      );
    }

    // User/NodeInfo
    if (parsed.longName) {
      return (
        <>
          <Text color={theme.fg.primary}> {parsed.longName}</Text>
          {parsed.hwModel !== undefined && parsed.hwModel !== 0 && (
            <Text color={theme.data.hardware}> | hw:{parsed.hwModel}</Text>
          )}
        </>
      );
    }

    // Telemetry - device metrics
    if (parsed.deviceMetrics) {
      const dm = parsed.deviceMetrics;
      return (
        <>
          {dm.batteryLevel != null && dm.batteryLevel > 0 && (
            <Text color={dm.batteryLevel > 100 || dm.batteryLevel > 20 ? theme.data.battery : theme.data.batteryLow}>
              {" "}{dm.batteryLevel > 100 ? "Pwr" : `${dm.batteryLevel}%`}
            </Text>
          )}
          {dm.voltage != null && dm.voltage > 0 && (
            <Text color={theme.data.voltage}> {dm.voltage.toFixed(2)}V</Text>
          )}
          {dm.channelUtilization != null && (
            <Text color={theme.data.percent}> ch:{dm.channelUtilization.toFixed(1)}%</Text>
          )}
          {dm.airUtilTx != null && (
            <Text color={theme.data.percent}> tx:{dm.airUtilTx.toFixed(1)}%</Text>
          )}
        </>
      );
    }

    // Telemetry - environment metrics
    if (parsed.environmentMetrics) {
      const em = parsed.environmentMetrics;
      return (
        <>
          {em.temperature != null && <Text color={theme.data.coords}> {em.temperature.toFixed(1)}°C</Text>}
          {em.relativeHumidity != null && <Text color={theme.data.percent}> {em.relativeHumidity.toFixed(0)}%rh</Text>}
          {em.barometricPressure != null && <Text color={theme.data.voltage}> {em.barometricPressure.toFixed(0)}hPa</Text>}
        </>
      );
    }

    // Routing
    if (parsed.errorReason !== undefined) {
      const isAck = parsed.errorReason === 0;
      return (
        <Text color={isAck ? theme.data.snr : theme.packet.encrypted}>
          {" "}{isAck ? "ACK" : `ERR_${parsed.errorReason}`}
        </Text>
      );
    }

    // Traceroute
    if (parsed.route && Array.isArray(parsed.route)) {
      return (
        <>
          <Text color={theme.fg.muted}> [</Text>
          {parsed.route.map((n: number, i: number) => (
            <React.Fragment key={n}>
              {i > 0 && <Text color={theme.data.arrow}>{" -> "}</Text>}
              <Text color={theme.data.nodeFrom}>{formatNodeId(n)}</Text>
            </React.Fragment>
          ))}
          <Text color={theme.fg.muted}>]</Text>
        </>
      );
    }

    // Neighbor info
    if (parsed.neighbors && Array.isArray(parsed.neighbors)) {
      const count = parsed.neighbors.length;
      return <Text color={theme.data.hops}> {count} neighbors</Text>;
    }

    return null;
  } catch {
    // Not valid JSON
    const text = payload.replace(/[\r\n\t]+/g, " ").trim().slice(0, 40);
    if (text) {
      return <Text color={theme.fg.muted}> {text}</Text>;
    }
    return null;
  }
}

interface MeshViewPacketListProps {
  packets: MeshViewPacket[];
  selectedIndex: number;
  height?: number;
  error?: string | null;
}

// Column header for MeshView packet list
function MeshViewPacketListHeader() {
  return (
    <Box>
      <Text wrap="truncate">
        <Text color={theme.fg.muted}>{"TIME".padEnd(12)}</Text>
        <Text color={theme.fg.muted}>  </Text>
        <Text color={theme.fg.muted}>{"PORT".padEnd(14)} </Text>
        <Text color={theme.fg.muted}>{"FROM".padEnd(6)}</Text>
        <Text color={theme.fg.muted}>{"    "}</Text>
        <Text color={theme.fg.muted}>{"TO".padEnd(6)}</Text>
        <Text color={theme.fg.muted}>{" CH".padEnd(6)}</Text>
        <Text color={theme.fg.muted}>DATA</Text>
      </Text>
    </Box>
  );
}

export function MeshViewPacketList({
  packets,
  selectedIndex,
  height = 20,
  error
}: MeshViewPacketListProps) {
  // Reserve space for LIVE indicator and header
  const visibleCount = Math.max(1, height - 3);

  let startIndex = 0;
  if (packets.length > visibleCount) {
    const halfView = Math.floor(visibleCount / 2);
    startIndex = Math.max(0, Math.min(
      selectedIndex - halfView,
      packets.length - visibleCount
    ));
  }

  const visiblePackets = packets.slice(startIndex, startIndex + visibleCount);

  return (
    <Box flexDirection="column" width="100%" height={height} overflow="hidden">
      <Box justifyContent="center">
        <LiveIndicator error={error} />
      </Box>
      <MeshViewPacketListHeader />
      {visiblePackets.map((packet, i) => {
        const actualIndex = startIndex + i;
        const isSelected = actualIndex === selectedIndex;
        return (
          <MeshViewPacketRow
            key={`${packet.id}-${actualIndex}`}
            packet={packet}
            isSelected={isSelected}
          />
        );
      })}
      {packets.length === 0 && (
        <Box justifyContent="center" marginTop={2}>
          <Text color={theme.fg.muted}>No packets yet. Waiting for data from MeshView...</Text>
        </Box>
      )}
    </Box>
  );
}

interface MeshViewPacketRowProps {
  packet: MeshViewPacket;
  isSelected: boolean;
}

// Extract short name from long name (first 4 chars) or use node ID
function getShortName(longName: string | undefined, nodeId: number): string {
  if (longName) {
    return longName.slice(0, 4);
  }
  return formatNodeId(nodeId);
}

function MeshViewPacketRow({ packet, isSelected }: MeshViewPacketRowProps) {
  const time = new Date(packet.import_time).toLocaleTimeString("en-US", { hour12: false });
  const bgColor = isSelected ? theme.bg.selected : undefined;
  const portName = getPortName(packet.portnum);
  const portColor = getPortColor(packet.portnum);

  // Use short name (first 4 chars of long_name) or node ID
  const fromName = getShortName(packet.long_name, packet.from_node_id);
  const toName = packet.to_node_id === 0xffffffff
    ? "^all"
    : packet.to_node_id === 1
      ? "^mqtt"
      : getShortName(packet.to_long_name, packet.to_node_id);

  return (
    <Box backgroundColor={bgColor}>
      <Text wrap="truncate">
        <Text color={theme.data.time}>[{time}]  </Text>
        <Text color={theme.data.arrow}>{"<"} </Text>
        <Text color={portColor}>{portName.padEnd(14)} </Text>
        <Text color={theme.data.nodeFrom}>{fitVisual(fromName, 6)}</Text>
        <Text color={theme.data.arrow}>{" -> "}</Text>
        <Text color={theme.data.nodeTo}>{fitVisual(toName, 6)}</Text>
        <Text color={theme.data.channel}> ch:{packet.channel || "?"}</Text>
        {renderPayloadSummary(packet.payload, packet.portnum)}
      </Text>
    </Box>
  );
}

// Inspector tab types
export type MeshViewInspectorTab = "info" | "json";

interface MeshViewInspectorProps {
  packet?: MeshViewPacket;
  activeTab: MeshViewInspectorTab;
  height?: number;
  scrollOffset?: number;
  meshViewUrl?: string;
}

export function MeshViewInspector({
  packet,
  activeTab,
  height = 12,
  scrollOffset = 0,
  meshViewUrl
}: MeshViewInspectorProps) {
  if (!packet) {
    return (
      <Box flexDirection="column" paddingX={1} height={height} overflow="hidden">
        <MeshViewTabBar activeTab={activeTab} />
        <Box marginTop={1} justifyContent="center">
          <Text color={theme.fg.muted}>No packet selected</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} width="100%" height={height} overflow="hidden">
      <MeshViewTabBar activeTab={activeTab} scrollOffset={scrollOffset} />
      <Box flexDirection="column" overflow="hidden">
        {activeTab === "info" ? (
          <MeshViewInfoView packet={packet} height={height - 2} scrollOffset={scrollOffset} meshViewUrl={meshViewUrl} />
        ) : (
          <MeshViewJsonView packet={packet} height={height - 2} scrollOffset={scrollOffset} />
        )}
      </Box>
    </Box>
  );
}

function MeshViewTabBar({ activeTab, scrollOffset = 0 }: { activeTab: MeshViewInspectorTab; scrollOffset?: number }) {
  return (
    <Box>
      <Text color={activeTab === "info" ? theme.fg.accent : theme.fg.muted} bold={activeTab === "info"}>
        {activeTab === "info" ? "[INFO]" : " INFO "}
      </Text>
      <Text> </Text>
      <Text color={activeTab === "json" ? theme.fg.accent : theme.fg.muted} bold={activeTab === "json"}>
        {activeTab === "json" ? "[JSON]" : " JSON "}
      </Text>
      <Text color={theme.fg.muted}> h/l keys to switch</Text>
      {scrollOffset > 0 && (
        <Text color={theme.fg.muted}> (offset: {scrollOffset})</Text>
      )}
    </Box>
  );
}

// Parse protobuf text format into an object
// Format: key: value or key: "string" or key { nested }
function parseProtobufText(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Match key: value pattern
    const match = trimmed.match(/^(\w+):\s*(.*)$/);
    if (match) {
      const [, key, rawValue] = match;
      let value: unknown = rawValue;

      // Parse the value
      if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
        // String value
        value = rawValue.slice(1, -1);
      } else if (rawValue === 'true') {
        value = true;
      } else if (rawValue === 'false') {
        value = false;
      } else if (/^-?\d+$/.test(rawValue)) {
        // Integer
        value = parseInt(rawValue, 10);
      } else if (/^-?\d+\.\d+$/.test(rawValue)) {
        // Float
        value = parseFloat(rawValue);
      }
      // Otherwise keep as string (for enums like LOC_INTERNAL)

      result[key] = value;
    }
  }

  return result;
}

// Try to parse payload as JSON first, then protobuf text format
function parsePayload(payload: string): Record<string, unknown> | null {
  if (!payload) return null;

  // Try JSON first
  try {
    const parsed = JSON.parse(payload);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Not JSON, try protobuf text format
  }

  // Try protobuf text format (has key: value lines)
  if (payload.includes(':')) {
    const parsed = parseProtobufText(payload);
    if (Object.keys(parsed).length > 0) {
      return parsed;
    }
  }

  return null;
}

// Check if a number looks like a Unix timestamp (seconds since 1970, reasonable range)
function isUnixTimestamp(key: string, value: number): boolean {
  const k = key.toLowerCase();
  // Must be a timestamp-like key name
  if (!k.includes("time") && !k.includes("timestamp") && k !== "lastHeard" && k !== "last_heard") {
    return false;
  }
  // Unix timestamps are typically 10 digits (seconds) - range from year 2000 to 2100
  return value > 946684800 && value < 4102444800;
}

// Check if a field should be displayed as hex
function isHexField(key: string): boolean {
  const k = key.toLowerCase();
  return k.includes("macaddr") || k.includes("mac_addr");
}

// Check if a field should be displayed as base64
function isBase64Field(key: string): boolean {
  const k = key.toLowerCase();
  return k.includes("publickey") || k.includes("public_key") ||
         k.includes("psk") || k === "key";
}

// Decode protobuf-style escaped string (handles \NNN octal and \xNN hex escapes)
function decodeEscapedString(str: string): Uint8Array {
  const bytes: number[] = [];
  let i = 0;
  while (i < str.length) {
    if (str[i] === '\\' && i + 1 < str.length) {
      const next = str[i + 1];
      if (next >= '0' && next <= '7') {
        // Octal escape: \NNN (1-3 octal digits)
        let octal = '';
        let j = i + 1;
        while (j < str.length && j < i + 4 && str[j] >= '0' && str[j] <= '7') {
          octal += str[j];
          j++;
        }
        bytes.push(parseInt(octal, 8));
        i = j;
      } else if (next === 'x' && i + 3 < str.length) {
        // Hex escape: \xNN
        const hex = str.slice(i + 2, i + 4);
        bytes.push(parseInt(hex, 16));
        i += 4;
      } else if (next === 'n') {
        bytes.push(10);
        i += 2;
      } else if (next === 'r') {
        bytes.push(13);
        i += 2;
      } else if (next === 't') {
        bytes.push(9);
        i += 2;
      } else if (next === '\\') {
        bytes.push(92);
        i += 2;
      } else {
        // Unknown escape, keep as-is
        bytes.push(str.charCodeAt(i));
        i++;
      }
    } else {
      bytes.push(str.charCodeAt(i));
      i++;
    }
  }
  return new Uint8Array(bytes);
}

// Convert a binary string to hex representation
function toHexString(str: string): string {
  // First decode any escape sequences
  const bytes = decodeEscapedString(str);
  let hex = "0x";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

// Convert a binary string to base64
function toBase64String(str: string): string {
  const bytes = decodeEscapedString(str);
  // Convert Uint8Array to base64
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

// Transform payload to convert integer coords to real floats, timestamps to dates, and binary to hex/base64
function transformPayload(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null) return payload;
  if (Array.isArray(payload)) return payload.map(transformPayload);

  const obj = payload as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Handle both camelCase and snake_case coordinate keys
    if ((key === "latitudeI" || key === "latitude_i") && typeof value === "number") {
      result["latitude"] = (value / 1e7).toFixed(6);
    } else if ((key === "longitudeI" || key === "longitude_i") && typeof value === "number") {
      result["longitude"] = (value / 1e7).toFixed(6);
    } else if (typeof value === "number" && isUnixTimestamp(key, value)) {
      // Convert Unix timestamp to formatted date
      result[key] = new Date(value * 1000).toLocaleString();
    } else if (typeof value === "string" && isHexField(key)) {
      // Convert binary strings to hex (macaddr)
      result[key] = toHexString(value);
    } else if (typeof value === "string" && isBase64Field(key)) {
      // Convert binary strings to base64 (public_key, psk)
      result[key] = toBase64String(value);
    } else if (typeof value === "object" && value !== null) {
      result[key] = transformPayload(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

// Render a colorized key-value line
function InfoLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Text wrap="truncate">
        <Text color={theme.fg.muted}>{label}: </Text>
        {children}
      </Text>
    </Box>
  );
}

// Get color for a payload field value based on key name and value type
function getFieldColor(key: string, value: unknown): string {
  const k = key.toLowerCase();

  // Coordinates
  if (k === "latitude" || k === "longitude" || k.includes("lat") || k.includes("lon")) {
    return theme.data.coords;
  }
  // Altitude/elevation
  if (k === "altitude" || k.includes("alt") || k.includes("elevation")) {
    return theme.data.altitude;
  }
  // Battery/power
  if (k.includes("battery") || k.includes("voltage") || k === "voltage") {
    return typeof value === "number" && (value as number) < 20 ? theme.data.batteryLow : theme.data.battery;
  }
  // Percentages/utilization
  if (k.includes("util") || k.includes("percent") || (typeof value === "number" && String(value).includes("."))) {
    return theme.data.percent;
  }
  // Time/timestamps
  if (k.includes("time") || k.includes("timestamp") || k === "time") {
    return theme.data.time;
  }
  // Names/identifiers
  if (k.includes("name") || k === "id" || k.includes("node") || k === "shortname" || k === "longname") {
    return theme.data.nodeFrom;
  }
  // Hardware/model
  if (k.includes("hw") || k.includes("model") || k.includes("hardware")) {
    return theme.data.hardware;
  }
  // Hops/routing
  if (k.includes("hop") || k.includes("snr") || k.includes("rssi")) {
    return theme.data.hops;
  }
  // Source/type fields (often enums like LOC_INTERNAL)
  if (k.includes("source") || k.includes("type") || k.includes("role") || k.includes("reason")) {
    return theme.packet.nodeinfo; // Purple for enum-like values
  }
  // Channel
  if (k.includes("channel")) {
    return theme.data.channel;
  }
  // Booleans
  if (typeof value === "boolean") {
    return value ? theme.status.online : theme.status.offline;
  }
  // Numbers default to coords color (cyan)
  if (typeof value === "number") {
    return theme.data.coords;
  }
  // Strings default to quote color (mint)
  if (typeof value === "string") {
    return theme.data.quote;
  }

  return theme.fg.primary;
}

// Render payload fields with colors
function renderPayloadFields(obj: Record<string, unknown>, indent: number = 0, keyPrefix: string = "pl"): React.ReactNode[] {
  const lines: React.ReactNode[] = [];
  const pad = "  ".repeat(indent);

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    const uniqueKey = `${keyPrefix}-${indent}-${key}`;

    if (typeof value === "object" && !Array.isArray(value)) {
      lines.push(
        <Box key={uniqueKey}>
          <Text wrap="truncate">
            <Text>{pad}</Text>
            <Text color={theme.data.channel} bold>{key}</Text>
            <Text color={theme.fg.muted}>:</Text>
          </Text>
        </Box>
      );
      lines.push(...renderPayloadFields(value as Record<string, unknown>, indent + 1, `${uniqueKey}`));
    } else if (Array.isArray(value)) {
      lines.push(
        <Box key={uniqueKey}>
          <Text wrap="truncate">
            <Text>{pad}</Text>
            <Text color={theme.data.channel} bold>{key}</Text>
            <Text color={theme.fg.muted}>: </Text>
            <Text color={theme.data.hops}>[{value.length} items]</Text>
          </Text>
        </Box>
      );
    } else {
      const valueColor = getFieldColor(key, value);
      lines.push(
        <Box key={uniqueKey}>
          <Text wrap="truncate">
            <Text>{pad}</Text>
            <Text color={theme.data.channel}>{key}</Text>
            <Text color={theme.fg.muted}>: </Text>
            <Text color={valueColor}>{String(value)}</Text>
          </Text>
        </Box>
      );
    }
  }

  return lines;
}

function MeshViewInfoView({ packet, height, scrollOffset, meshViewUrl }: { packet: MeshViewPacket; height: number; scrollOffset: number; meshViewUrl?: string }) {
  const allLines: React.ReactNode[] = [];

  // From info
  const fromName = packet.long_name || formatNodeId(packet.from_node_id);
  allLines.push(
    <InfoLine key="from" label="From">
      <Text color={theme.data.nodeFrom}>{fromName}</Text>
      <Text color={theme.fg.muted}> ({formatNodeId(packet.from_node_id)})</Text>
    </InfoLine>
  );

  // To info
  const toName = packet.to_node_id === 0xffffffff
    ? "BROADCAST"
    : packet.to_node_id === 1
      ? "MQTT_BROADCAST"
      : packet.to_long_name || formatNodeId(packet.to_node_id);
  allLines.push(
    <InfoLine key="to" label="To">
      <Text color={theme.data.nodeTo}>{toName}</Text>
      {packet.to_node_id !== 0xffffffff && packet.to_node_id !== 1 && (
        <Text color={theme.fg.muted}> ({formatNodeId(packet.to_node_id)})</Text>
      )}
    </InfoLine>
  );

  // Port and channel
  const portName = getPortName(packet.portnum);
  const portColor = getPortColor(packet.portnum);
  allLines.push(
    <InfoLine key="port" label="Port">
      <Text color={portColor}>{portName}</Text>
      <Text color={theme.fg.muted}> ({packet.portnum})</Text>
      <Text color={theme.fg.muted}>  Channel: </Text>
      <Text color={theme.data.channel}>{packet.channel || "default"}</Text>
    </InfoLine>
  );

  // Time
  allLines.push(
    <InfoLine key="time" label="Time">
      <Text color={theme.data.time}>{new Date(packet.import_time).toLocaleString()}</Text>
      <Text color={theme.fg.muted}>  ID: </Text>
      <Text color={theme.fg.secondary}>{packet.id}</Text>
    </InfoLine>
  );

  // Reply ID if present
  if (packet.reply_id) {
    allLines.push(
      <InfoLine key="reply" label="Reply to">
        <Text color={theme.fg.secondary}>{packet.reply_id}</Text>
      </InfoLine>
    );
  }

  // MeshView URL
  if (meshViewUrl && packet.id) {
    const packetUrl = `${meshViewUrl}/packet/${packet.id}`;
    allLines.push(
      <InfoLine key="url" label="MeshView">
        <Text color={theme.data.hardware}>{packetUrl}</Text>
      </InfoLine>
    );
  }

  // Separator
  allLines.push(
    <Box key="sep">
      <Text color={theme.fg.muted}>{"─".repeat(50)}</Text>
    </Box>
  );

  // Payload
  if (packet.payload) {
    const parsed = parsePayload(packet.payload);
    if (parsed) {
      const transformed = transformPayload(parsed) as Record<string, unknown>;
      allLines.push(...renderPayloadFields(transformed));
    } else {
      // Raw display fallback
      allLines.push(<Box key="raw"><Text color={theme.fg.muted}>{packet.payload}</Text></Box>);
    }
  }

  // Apply scroll offset and limit to height
  const visibleLines = allLines.slice(scrollOffset, scrollOffset + height);

  return (
    <Box flexDirection="column" overflow="hidden">
      {visibleLines}
    </Box>
  );
}

function MeshViewJsonView({ packet, height, scrollOffset }: { packet: MeshViewPacket; height: number; scrollOffset: number }) {
  // Format the entire packet as JSON with syntax highlighting
  const fullPacket = {
    id: packet.id,
    import_time: packet.import_time,
    import_time_us: packet.import_time_us,
    from_node_id: packet.from_node_id,
    long_name: packet.long_name,
    to_node_id: packet.to_node_id,
    to_long_name: packet.to_long_name,
    portnum: packet.portnum,
    channel: packet.channel,
    reply_id: packet.reply_id,
    payload: (() => {
      const parsed = parsePayload(packet.payload);
      if (parsed) {
        return transformPayload(parsed);
      }
      return packet.payload;
    })(),
  };

  const formatted = JSON.stringify(fullPacket, null, 2);
  const jsonLines = formatted.split("\n");

  // Apply scroll offset and limit to height
  const visibleLines = jsonLines.slice(scrollOffset, scrollOffset + height);

  return (
    <Box flexDirection="column" overflow="hidden">
      {visibleLines.map((line, i) => (
        <Text key={`json-${scrollOffset + i}`} wrap="truncate">
          {highlightJsonLine(line)}
        </Text>
      ))}
    </Box>
  );
}

// Simple JSON syntax highlighting
function highlightJsonLine(line: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = line;
  let keyIndex = 0;

  // Match patterns: keys, string values, numbers, booleans, null
  const patterns = [
    { regex: /^(\s*)("[\w]+")(:\s*)/, type: "key" },
    { regex: /^("(?:[^"\\]|\\.)*")/, type: "string" },
    { regex: /^(-?\d+\.?\d*)/, type: "number" },
    { regex: /^(true|false)/, type: "boolean" },
    { regex: /^(null)/, type: "null" },
    { regex: /^([{}\[\],])/, type: "punctuation" },
    { regex: /^(\s+)/, type: "whitespace" },
  ];

  while (remaining.length > 0) {
    let matched = false;

    for (const { regex, type } of patterns) {
      const match = remaining.match(regex);
      if (match) {
        const fullMatch = match[0];

        if (type === "key") {
          // Key with colon
          const [, indent, key, colon] = match;
          parts.push(<Text key={keyIndex++}>{indent}</Text>);
          parts.push(<Text key={keyIndex++} color={theme.data.channel}>{key}</Text>);
          parts.push(<Text key={keyIndex++} color={theme.fg.muted}>{colon}</Text>);
        } else {
          const color = type === "string" ? theme.data.quote
            : type === "number" ? theme.data.coords
            : type === "boolean" ? theme.status.online
            : type === "null" ? theme.fg.muted
            : type === "punctuation" ? theme.fg.secondary
            : undefined;

          parts.push(<Text key={keyIndex++} color={color}>{fullMatch}</Text>);
        }

        remaining = remaining.slice(fullMatch.length);
        matched = true;
        break;
      }
    }

    if (!matched) {
      // No pattern matched, consume one character
      parts.push(<Text key={keyIndex++}>{remaining[0]}</Text>);
      remaining = remaining.slice(1);
    }
  }

  return <>{parts}</>;
}
