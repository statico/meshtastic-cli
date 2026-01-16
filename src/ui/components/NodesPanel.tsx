import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { NodeData } from "../../protocol/node-store";
import { formatNodeId, getHardwareModelName } from "../../utils";
import { stringWidth, truncateVisual, padEndVisual } from "../../utils/string-width";

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

type NodeSortKey = "hops" | "snr" | "battery" | "time" | "favorites";

interface NodesPanelProps {
  nodes: NodeData[];
  selectedIndex: number;
  height?: number;
  inspectorHeight?: number;
  filter?: string;
  filterInputActive?: boolean;
  sortKey?: NodeSortKey;
  sortAscending?: boolean;
  terminalWidth?: number;
}

function NodesPanelComponent({ nodes, selectedIndex, height = 20, inspectorHeight = 10, filter, filterInputActive, sortKey = "hops", sortAscending = true, terminalWidth = 100 }: NodesPanelProps) {
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
        {/* Header - sorted column is highlighted */}
        <Box paddingX={1}>
          <Text color={theme.fg.muted}>{"NAME".padEnd(terminalWidth > 90 ? 8 : 5)}</Text>
          {terminalWidth > 90 && <Text color={theme.fg.muted}>{"ID".padEnd(11)}</Text>}
          <Text color={sortKey === "favorites" ? theme.fg.accent : theme.fg.muted}>{"★"}</Text>
          <Text color={sortKey === "hops" ? theme.fg.accent : theme.fg.muted}>{terminalWidth > 90 ? "HOP".padEnd(4) : "H".padEnd(2)}</Text>
          <Text color={sortKey === "snr" ? theme.fg.accent : theme.fg.muted}>{terminalWidth > 90 ? "SNR".padStart(8) : "SNR".padStart(5)} </Text>
          <Text color={sortKey === "battery" ? theme.fg.accent : theme.fg.muted}>{(terminalWidth > 90 ? "BAT".padEnd(5) : "B".padEnd(4)) + " "}</Text>
          <Text color={sortKey === "time" ? theme.fg.accent : theme.fg.muted}>{(terminalWidth > 90 ? "AGE".padEnd(6) : "AGE".padEnd(4)) + " "}</Text>
          <Text color={theme.fg.muted}>{"R "}</Text>
          <Box flexGrow={1}><Text color={theme.fg.muted}>LONG NAME</Text></Box>
          {terminalWidth > 90 && <Box width={16}><Text color={theme.fg.muted}>MODEL</Text></Box>}
        </Box>

        {/* Node rows */}
        {visibleNodes.map((node, i) => (
          <NodeRow
            key={node.num}
            node={node}
            isSelected={startIndex + i === selectedIndex}
            terminalWidth={terminalWidth}
          />
        ))}
      </Box>

      {/* Separator */}
      <Box height={1} borderStyle="single" borderColor={theme.border.normal} borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} />

      {/* Node inspector */}
      <Box height={inspectorHeight} flexDirection="column">
        <NodeInspector node={selectedNode} allNodes={nodes} height={inspectorHeight} />
      </Box>
    </Box>
  );
}

interface NodeRowProps {
  node: NodeData;
  isSelected: boolean;
  terminalWidth?: number;
}

function NodeRow({ node, isSelected, terminalWidth = 100 }: NodeRowProps) {
  const bgColor = isSelected ? theme.bg.selected : undefined;
  const isCompact = terminalWidth <= 90;

  const name = node.shortName || "???";
  const nodeId = formatNodeId(node.num);
  const hops = node.hopsAway != null
    ? (node.hopsAway < 0 ? "?" : `${node.hopsAway}`)
    : "?";
  const snr = node.snr !== undefined
    ? (isCompact ? `${Math.round(node.snr)}dB` : `${node.snr.toFixed(1)}dB`)
    : "-";
  const battery = getBatteryDisplay(node.batteryLevel, node.voltage);
  const lastHeard = formatLastHeard(node.lastHeard);
  const longName = node.longName || "";

  const nameColor = node.hopsAway === 0 ? theme.fg.accent : theme.fg.primary;

  // Smaller name width for compact mode
  const nameWidth = isCompact ? 5 : 8;
  const displayName = truncateVisual(name, isCompact ? 4 : 6);

  const favStar = node.isFavorite ? "★" : " ";
  const hwModel = node.hwModel !== undefined
    ? getHardwareModelName(node.hwModel).replace(/_/g, " ")
    : "";
  const role = formatRoleChar(node.role);

  const hopsPadding = isCompact ? 2 : 4;
  const snrPadding = isCompact ? 5 : 8;
  const batteryPadding = isCompact ? 4 : 5;
  const agePadding = isCompact ? 4 : 6;

  return (
    <Box backgroundColor={bgColor} paddingX={1}>
      <Text wrap="truncate">
        <Text color={nameColor}>{padEndVisual(displayName, nameWidth)}</Text>
        {!isCompact && <Text color={theme.fg.muted}>{nodeId.padEnd(11)}</Text>}
        <Text color="#ffcc00">{favStar}</Text>
        <Text color={getHopsColor(node.hopsAway)}>{hops.padEnd(hopsPadding)}</Text>
        <Text color={getSnrColor(node.snr)}>{snr.padStart(snrPadding)} </Text>
        <Text color={getBatteryColor(node.batteryLevel, node.voltage)}>{battery.padEnd(batteryPadding)} </Text>
        <Text color={theme.fg.secondary}>{lastHeard.padEnd(agePadding)} </Text>
        <Text color={getRoleColor(node.role)}>{role} </Text>
        <Text color={theme.fg.primary}>{longName}</Text>
        {!isCompact && hwModel && <Text color={theme.data.hardware}> {hwModel}</Text>}
      </Text>
    </Box>
  );
}

function NodeInspector({ node, allNodes, height }: { node?: NodeData; allNodes: NodeData[]; height: number }) {
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
          <Text color={theme.data.hardware}>{getHardwareModelName(node.hwModel)}</Text>
        </>
      )}
    </Box>
  );

  // Public key
  if (node.publicKey && node.publicKey.length > 0) {
    const publicKeyBase64 = uint8ArrayToBase64(node.publicKey);
    lines.push(
      <Box key="pubkey">
        <Text color={theme.fg.muted}>Public Key: </Text>
        <Text color={theme.fg.secondary}>{publicKeyBase64}</Text>
      </Box>
    );

    // Check for duplicate public keys
    const duplicates = allNodes.filter(
      (n) => n.num !== node.num && n.publicKey && n.publicKey.length > 0 &&
        uint8ArrayToBase64(n.publicKey) === publicKeyBase64
    );
    if (duplicates.length > 0) {
      const dupList = duplicates.map((d) => `${d.shortName || "?"} (${formatNodeId(d.num)})`).join(", ");
      lines.push(
        <Box key="pubkey-warn">
          <Text color={theme.status.offline}>⚠ Public key also used by: {dupList}</Text>
        </Box>
      );
    }
  }

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
        {node.hopsAway != null && (
          <>
            <Text color={theme.fg.muted}>  Hops: </Text>
            <Text color={getHopsColor(node.hopsAway)}>
              {node.hopsAway < 0 ? "?" : node.hopsAway === 0 ? "Direct" : `${node.hopsAway}`}
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
    const batteryDisplay = node.batteryLevel !== undefined && node.batteryLevel > 100
      ? "Powered"
      : node.batteryLevel !== undefined && node.batteryLevel > 0
        ? `${node.batteryLevel}%`
        : null;
    lines.push(
      <Box key="power">
        {batteryDisplay && (
          <>
            <Text color={theme.fg.muted}>Battery: </Text>
            <Text color={getBatteryColor(node.batteryLevel)}>{batteryDisplay}</Text>
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

export const NodesPanel = React.memo(NodesPanelComponent, (prevProps, nextProps) => {
  // Only re-render if relevant props changed
  return (
    prevProps.nodes.length === nextProps.nodes.length &&
    prevProps.selectedIndex === nextProps.selectedIndex &&
    prevProps.height === nextProps.height &&
    prevProps.inspectorHeight === nextProps.inspectorHeight &&
    prevProps.filter === nextProps.filter &&
    prevProps.filterInputActive === nextProps.filterInputActive &&
    prevProps.sortKey === nextProps.sortKey &&
    prevProps.sortAscending === nextProps.sortAscending &&
    prevProps.terminalWidth === nextProps.terminalWidth
  );
});

function getBatteryDisplay(level?: number, voltage?: number): string {
  if (level !== undefined && level > 100) {
    return "Pwr"; // Powered/plugged in
  }
  if (level !== undefined && level > 0) {
    return `${level}%`;
  }
  if (voltage !== undefined && voltage > 0) {
    return `${voltage.toFixed(1)}V`;
  }
  return "-";
}

function formatLastHeard(timestamp: number): string {
  if (!timestamp) return "-";

  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function getHopsColor(hops?: number): string {
  if (hops == null || hops < 0) return theme.fg.muted;
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
  if (level !== undefined && level > 100) {
    return theme.packet.direct; // Powered - show as healthy green
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
  0: "CLIENT",
  1: "MUTE",
  2: "ROUTER",
  3: "RTR_CLI",
  4: "REPEAT",
  5: "TRACKER",
  6: "SENSOR",
  7: "TAK",
  8: "HIDDEN",
  9: "L&F",
  10: "TAK_TRK",
  11: "RTR_LATE",
  12: "CLI_BASE",
};

// Single character role codes for compact display
const ROLE_CHARS: Record<number, string> = {
  0: "C",  // Client
  1: "M",  // Mute
  2: "R",  // Router
  3: "r",  // Router_Client (deprecated)
  4: "P",  // Repeater (deprecated)
  5: "T",  // Tracker
  6: "S",  // Sensor
  7: "K",  // TAK
  8: "H",  // Hidden
  9: "L",  // Lost & Found
  10: "t", // TAK_Tracker
  11: "D", // Router_Late (delayed)
  12: "B", // Client_Base
};

function formatRole(role?: number | null): string {
  if (role == null) return "-";
  return ROLE_NAMES[role] || `R${role}`;
}

function formatRoleChar(role?: number | null): string {
  if (role == null) return "-";
  return ROLE_CHARS[role] || "?";
}

function getRoleColor(role?: number | null): string {
  if (role == null) return theme.fg.muted;
  // Router/Repeater/RouterLate = infrastructure = purple (like nodeinfo)
  if (role === 2 || role === 4 || role === 11) return theme.packet.nodeinfo;
  // Tracker = cyan (like position)
  if (role === 5) return theme.packet.position;
  // Sensor = orange (like telemetry)
  if (role === 6) return theme.packet.telemetry;
  // TAK variants = orange
  if (role === 7 || role === 10) return theme.packet.telemetry;
  // Mute/Hidden = gray (like routing)
  if (role === 1 || role === 8) return theme.packet.routing;
  // Client/ClientBase (default) = green (like message)
  return theme.packet.message;
}
