import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { NodeData } from "../../protocol/node-store";
import { formatNodeId } from "../../utils/hex";
import { Mesh } from "@meshtastic/protobufs";

interface NodesPanelProps {
  nodes: NodeData[];
  selectedIndex: number;
  height?: number;
  inspectorHeight?: number;
}

export function NodesPanel({ nodes, selectedIndex, height = 20, inspectorHeight = 10 }: NodesPanelProps) {
  if (nodes.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color={theme.fg.muted}>No nodes discovered yet</Text>
        <Text> </Text>
        <Text color={theme.fg.secondary}>Nodes will appear as they are discovered.</Text>
        <Text color={theme.fg.secondary}>Try requesting config from your device.</Text>
      </Box>
    );
  }

  const listHeight = height - inspectorHeight - 1;
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
      {/* Node list */}
      <Box height={listHeight} flexDirection="column">
        {/* Header */}
        <Box paddingX={1}>
          <Text color={theme.fg.muted}>
            {"NAME".padEnd(10)}
            {"ID".padEnd(12)}
            {"HOPS".padEnd(6)}
            {"SNR".padEnd(8)}
            {"BATT".padEnd(7)}
            {"HEARD".padEnd(10)}
            {"LONG NAME"}
          </Text>
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

  return (
    <Box backgroundColor={bgColor} paddingX={1}>
      <Text wrap="truncate">
        <Text color={nameColor}>{name.slice(0, 8).padEnd(10)}</Text>
        <Text color={theme.fg.muted}>{nodeId.padEnd(12)}</Text>
        <Text color={getHopsColor(node.hopsAway)}>{hops.padEnd(6)}</Text>
        <Text color={getSnrColor(node.snr)}>{snr.padEnd(8)}</Text>
        <Text color={getBatteryColor(node.batteryLevel)}>{battery.padEnd(7)}</Text>
        <Text color={theme.fg.secondary}>{lastHeard.padEnd(10)}</Text>
        <Text color={theme.fg.primary}>{longName}</Text>
      </Text>
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

  // ID and hardware
  lines.push(
    <Box key="hw">
      <Text color={theme.fg.muted}>ID: </Text>
      <Text color={theme.fg.secondary}>{formatNodeId(node.num)}</Text>
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
  if (node.channelUtilization !== undefined || node.airUtilTx !== undefined) {
    lines.push(
      <Box key="util">
        {node.channelUtilization !== undefined && (
          <>
            <Text color={theme.fg.muted}>Channel util: </Text>
            <Text color={theme.fg.primary}>{node.channelUtilization.toFixed(1)}%</Text>
          </>
        )}
        {node.airUtilTx !== undefined && (
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

function getBatteryColor(level?: number): string {
  if (level === undefined) return theme.fg.muted;
  if (level >= 50) return theme.packet.direct;
  if (level >= 20) return theme.packet.telemetry;
  return theme.packet.encrypted;
}
