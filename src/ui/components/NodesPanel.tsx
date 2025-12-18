import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { NodeData } from "../../protocol/node-store";
import { formatNodeId } from "../../utils/hex";
import { Mesh } from "@meshtastic/protobufs";

// Calculate visual width of string (emojis = 2, most chars = 1)
function stringWidth(str: string): number {
  let width = 0;
  for (const char of str) {
    const code = char.codePointAt(0) || 0;
    // Emoji and wide characters take 2 spaces
    // Covers: Misc Technical (23xx), Enclosed Alphanumerics (24xx), Geometric (25xx),
    // Misc Symbols (26xx), Dingbats (27xx), Misc Symbols (2Bxx), and SMP emojis (1Fxxx)
    if (
      code > 0x1F000 ||
      (code >= 0x2300 && code <= 0x23FF) ||
      (code >= 0x2460 && code <= 0x24FF) ||
      (code >= 0x25A0 && code <= 0x25FF) ||
      (code >= 0x2600 && code <= 0x27BF) ||
      (code >= 0x2B00 && code <= 0x2BFF) ||
      (code >= 0x3000 && code <= 0x303F)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

// Pad string to target visual width
function padEndVisual(str: string, targetWidth: number): string {
  const currentWidth = stringWidth(str);
  if (currentWidth >= targetWidth) return str;
  return str + " ".repeat(targetWidth - currentWidth);
}

interface NodesPanelProps {
  nodes: NodeData[];
  selectedIndex: number;
  height?: number;
  inspectorHeight?: number;
  filter?: string;
  filterInputActive?: boolean;
}

export function NodesPanel({ nodes, selectedIndex, height = 20, inspectorHeight = 10, filter, filterInputActive }: NodesPanelProps) {
  const hasFilter = filter && filter.length > 0;
  const filterRowHeight = (hasFilter || filterInputActive) ? 1 : 0;

  if (nodes.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1} height={height}>
        {filterInputActive && (
          <Box>
            <Text color={theme.fg.accent}>/</Text>
            <Text color={theme.fg.primary}>{filter}</Text>
            <Text color={theme.fg.accent}>█</Text>
          </Box>
        )}
        {hasFilter && !filterInputActive && (
          <Box>
            <Text color={theme.packet.encrypted} bold>[FILTERED: "{filter}"]</Text>
            <Text color={theme.fg.muted}> No matches</Text>
          </Box>
        )}
        {!hasFilter && !filterInputActive && (
          <>
            <Text color={theme.fg.muted}>No nodes discovered yet</Text>
            <Text> </Text>
            <Text color={theme.fg.secondary}>Nodes will appear as they are discovered.</Text>
            <Text color={theme.fg.secondary}>Try requesting config from your device.</Text>
          </>
        )}
      </Box>
    );
  }

  const listHeight = height - inspectorHeight - 1 - filterRowHeight;
  const selectedNode = nodes[selectedIndex];

  // Calculate visible window that keeps selection in view
  const visibleCount = Math.max(1, listHeight - 2); // Account for header

  // Calculate scroll offset to keep selection visible
  let startIndex = 0;
  if (nodes.length > visibleCount) {
    const halfView = Math.floor(visibleCount / 2);
    startIndex = Math.max(0, Math.min(
      selectedIndex - halfView,
      nodes.length - visibleCount
    ));
  }

  const visibleNodes = nodes.slice(startIndex, startIndex + visibleCount);

  return (
    <Box flexDirection="column" width="100%">
      {/* Filter row */}
      {filterInputActive && (
        <Box paddingX={1}>
          <Text color={theme.fg.accent}>/</Text>
          <Text color={theme.fg.primary}>{filter}</Text>
          <Text color={theme.fg.accent}>█</Text>
        </Box>
      )}
      {hasFilter && !filterInputActive && (
        <Box paddingX={1}>
          <Text color={theme.packet.encrypted} bold>[FILTERED: "{filter}"]</Text>
          <Text color={theme.fg.muted}> ({nodes.length} match{nodes.length !== 1 ? "es" : ""}) </Text>
          <Text color={theme.fg.secondary}>Esc to clear</Text>
        </Box>
      )}

      {/* Node list */}
      <Box height={listHeight} flexDirection="column">
        {/* Header */}
        <Box paddingX={1}>
          <Text color={theme.fg.muted}>{"NAME".padEnd(10)}</Text>
          <Text color={theme.fg.muted}>{"ID".padEnd(12)}</Text>
          <Text color={theme.fg.muted}>{"FAV"}{"  "}</Text>
          <Text color={theme.fg.muted}>{"ROLE".padEnd(8)}</Text>
          <Text color={theme.fg.muted}>{"HOPS".padEnd(6)}</Text>
          <Text color={theme.fg.muted}>{"SNR".padEnd(8)}</Text>
          <Text color={theme.fg.muted}>{"BATT".padEnd(7)}</Text>
          <Text color={theme.fg.muted}>{"HEARD".padEnd(10)}</Text>
          <Box flexGrow={1}><Text color={theme.fg.muted}>LONG NAME</Text></Box>
          <Box width={16}><Text color={theme.fg.muted}>MODEL</Text></Box>
        </Box>

        {/* Node rows */}
        {visibleNodes.map((node, i) => (
          <NodeRow
            key={node.num}
            node={node}
            isSelected={startIndex + i === selectedIndex}
          />
        ))}
      </Box>

      {/* Separator */}
      <Box height={1} borderStyle="single" borderColor={theme.border.normal} borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} />

      {/* Node inspector */}
      <Box height={inspectorHeight} flexDirection="column">
        <NodeInspector node={selectedNode} height={inspectorHeight} />
      </Box>
    </Box>
  );
}

interface NodeRowProps {
  node: NodeData;
  isSelected: boolean;
}

function NodeRow({ node, isSelected }: NodeRowProps) {
  const bgColor = isSelected ? theme.bg.selected : undefined;

  const name = node.shortName || "???";
  const nodeId = formatNodeId(node.num);
  const hops = node.hopsAway !== undefined ? `${node.hopsAway}` : "-";
  const snr = node.snr !== undefined ? `${node.snr.toFixed(1)}dB` : "-";
  const battery = getBatteryDisplay(node.batteryLevel, node.voltage);
  const lastHeard = formatLastHeard(node.lastHeard);
  const longName = node.longName || "";

  const nameColor = node.hopsAway === 0 ? theme.fg.accent : theme.fg.primary;

  // Truncate name to ~8 visual chars
  let displayName = name;
  if (stringWidth(name) > 8) {
    let truncated = "";
    let w = 0;
    for (const char of name) {
      const cw = stringWidth(char);
      if (w + cw > 8) break;
      truncated += char;
      w += cw;
    }
    displayName = truncated;
  }

  const favStar = node.isFavorite ? "★" : " ";
  const hwModel = node.hwModel !== undefined
    ? (Mesh.HardwareModel[node.hwModel] || `HW_${node.hwModel}`).replace("_", " ")
    : "";
  const role = formatRole(node.role);

  return (
    <Box backgroundColor={bgColor} paddingX={1}>
      <Text color={nameColor}>{padEndVisual(displayName, 10)}</Text>
      <Text color={theme.fg.muted}>{nodeId.padEnd(12)}</Text>
      <Text color="#ffcc00">{favStar}</Text><Text>{"    "}</Text>
      <Text color={getRoleColor(node.role)}>{role.padEnd(8)}</Text>
      <Text color={getHopsColor(node.hopsAway)}>{hops.padEnd(6)}</Text>
      <Text color={getSnrColor(node.snr)}>{snr.padStart(7)} </Text>
      <Text color={getBatteryColor(node.batteryLevel, node.voltage)}>{battery.padEnd(7)}</Text>
      <Text color={theme.fg.secondary}>{lastHeard.padEnd(10)}</Text>
      <Box flexGrow={1}><Text color={theme.fg.primary} wrap="truncate">{longName}</Text></Box>
      <Box width={16}><Text color={theme.data.hardware} wrap="truncate">{hwModel}</Text></Box>
    </Box>
  );
}

function NodeInspector({ node, height }: { node?: NodeData; height: number }) {
  if (!node) {
    return (
      <Box paddingX={1}>
        <Text color={theme.fg.muted}>No node selected</Text>
      </Box>
    );
  }

  const lines: React.ReactNode[] = [];

  // Identity line
  lines.push(
    <Box key="identity">
      <Text color={theme.fg.muted}>Name: </Text>
      <Text color={theme.fg.accent}>{node.shortName || "?"}</Text>
      {node.longName && (
        <>
          <Text color={theme.fg.muted}>  Long: </Text>
          <Text color={theme.fg.primary}>{node.longName}</Text>
        </>
      )}
    </Box>
  );

  // ID, role, and hardware
  lines.push(
    <Box key="hw">
      <Text color={theme.fg.muted}>ID: </Text>
      <Text color={theme.fg.secondary}>{formatNodeId(node.num)}</Text>
      {node.role !== undefined && (
        <>
          <Text color={theme.fg.muted}>  Role: </Text>
          <Text color={getRoleColor(node.role)}>{formatRole(node.role)}</Text>
        </>
      )}
      {node.hwModel !== undefined && (
        <>
          <Text color={theme.fg.muted}>  Hardware: </Text>
          <Text color={theme.data.hardware}>{Mesh.HardwareModel[node.hwModel] || `MODEL_${node.hwModel}`}</Text>
        </>
      )}
    </Box>
  );

  // Radio metrics
  if (node.snr !== undefined || node.hopsAway !== undefined) {
    lines.push(
      <Box key="radio">
        {node.snr !== undefined && (
          <>
            <Text color={theme.fg.muted}>SNR: </Text>
            <Text color={getSnrColor(node.snr)}>{node.snr.toFixed(1)}dB</Text>
          </>
        )}
        {node.hopsAway !== undefined && (
          <>
            <Text color={theme.fg.muted}>  Hops: </Text>
            <Text color={getHopsColor(node.hopsAway)}>
              {node.hopsAway === 0 ? "Direct" : `${node.hopsAway}`}
            </Text>
          </>
        )}
        {node.lastHeard && (
          <>
            <Text color={theme.fg.muted}>  Last heard: </Text>
            <Text color={theme.fg.secondary}>{formatLastHeard(node.lastHeard)}</Text>
          </>
        )}
      </Box>
    );
  }

  // Battery/power
  if (node.batteryLevel !== undefined || node.voltage !== undefined) {
    lines.push(
      <Box key="power">
        {node.batteryLevel !== undefined && node.batteryLevel > 0 && (
          <>
            <Text color={theme.fg.muted}>Battery: </Text>
            <Text color={getBatteryColor(node.batteryLevel)}>{node.batteryLevel}%</Text>
          </>
        )}
        {node.voltage !== undefined && node.voltage > 0 && (
          <>
            <Text color={theme.fg.muted}>  Voltage: </Text>
            <Text color={theme.fg.primary}>{node.voltage.toFixed(2)}V</Text>
          </>
        )}
      </Box>
    );
  }

  // Channel utilization
  if (node.channelUtilization != null || node.airUtilTx != null) {
    lines.push(
      <Box key="util">
        {node.channelUtilization != null && (
          <>
            <Text color={theme.fg.muted}>Channel util: </Text>
            <Text color={theme.fg.primary}>{node.channelUtilization.toFixed(1)}%</Text>
          </>
        )}
        {node.airUtilTx != null && (
          <>
            <Text color={theme.fg.muted}>  TX util: </Text>
            <Text color={theme.fg.secondary}>{node.airUtilTx.toFixed(1)}%</Text>
          </>
        )}
      </Box>
    );
  }

  // Position
  if (node.latitudeI != null && node.longitudeI != null) {
    const lat = node.latitudeI / 1e7;
    const lon = node.longitudeI / 1e7;
    lines.push(
      <Box key="pos">
        <Text color={theme.fg.muted}>Position: </Text>
        <Text color={theme.packet.position}>{lat.toFixed(6)}, {lon.toFixed(6)}</Text>
        {node.altitude != null && (
          <>
            <Text color={theme.fg.muted}>  Alt: </Text>
            <Text color={theme.fg.primary}>{node.altitude}m</Text>
          </>
        )}
      </Box>
    );
  }

  return <Box flexDirection="column" paddingX={1}>{lines.slice(0, height - 1)}</Box>;
}

function getBatteryDisplay(level?: number, voltage?: number): string {
  if (level !== undefined && level > 0) {
    return `${level}%`;
  }
  if (voltage !== undefined && voltage > 0) {
    return `${voltage.toFixed(1)}V`;
  }
  return "-";
}

function formatLastHeard(timestamp: number): string {
  if (!timestamp) return "never";

  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getHopsColor(hops?: number): string {
  if (hops === undefined) return theme.fg.muted;
  if (hops === 0) return theme.packet.direct;
  if (hops === 1) return theme.fg.accent;
  if (hops <= 3) return theme.packet.telemetry;
  return theme.packet.encrypted;
}

function getSnrColor(snr?: number): string {
  if (snr === undefined) return theme.fg.muted;
  if (snr >= 5) return theme.packet.direct;
  if (snr >= 0) return theme.fg.accent;
  if (snr >= -5) return theme.packet.telemetry;
  return theme.packet.encrypted;
}

function getBatteryColor(level?: number, voltage?: number): string {
  // Show muted for "-" (no battery info)
  if ((level === undefined || level === 0) && (voltage === undefined || voltage === 0)) {
    return theme.fg.muted;
  }
  if (level !== undefined && level > 0) {
    if (level >= 50) return theme.packet.direct;
    if (level >= 20) return theme.packet.telemetry;
    return theme.packet.encrypted;
  }
  // Has voltage but no level - neutral color
  return theme.fg.primary;
}

const ROLE_NAMES: Record<number, string> = {
  0: "Client",
  1: "Mute",
  2: "Router",
  3: "RtrClnt",
  4: "Repeater",
  5: "Tracker",
  6: "Sensor",
  7: "TAK",
  8: "Hidden",
  9: "L&F",
  10: "TAK+Trk",
};

function formatRole(role?: number): string {
  if (role === undefined) return "-";
  return ROLE_NAMES[role] || `R${role}`;
}

function getRoleColor(role?: number): string {
  if (role === undefined) return theme.fg.muted;
  // Router/Repeater = infrastructure = purple
  if (role === 2 || role === 4) return theme.packet.nodeinfo;
  // Tracker/Sensor = cyan
  if (role === 5 || role === 6) return theme.packet.position;
  // TAK = orange
  if (role === 7 || role === 10) return theme.packet.telemetry;
  // Client (default) = normal
  return theme.fg.secondary;
}
