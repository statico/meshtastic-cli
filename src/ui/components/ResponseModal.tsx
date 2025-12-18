import React, { useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme";
import type { NodeStore } from "../../protocol/node-store";
import { formatNodeId } from "../../utils/hex";
import type { Mesh } from "@meshtastic/protobufs";

interface ResponseModalProps {
  type: "position" | "traceroute";
  fromNode: number;
  data: unknown;
  nodeStore: NodeStore;
  onDismiss: () => void;
}

export function ResponseModal({ type, fromNode, data, nodeStore, onDismiss }: ResponseModalProps) {
  // Auto-dismiss after 5 seconds
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  // Allow early dismiss with Escape or Space
  useInput((input, key) => {
    if (key.escape || input === " ") {
      onDismiss();
    }
  });

  const nodeName = nodeStore.getNodeName(fromNode);

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={type === "position" ? theme.packet.position : theme.packet.traceroute}
      backgroundColor={theme.bg.primary}
      paddingX={3}
      paddingY={1}
      minWidth={40}
    >
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color={type === "position" ? theme.packet.position : theme.packet.traceroute}>
          {type === "position" ? "POSITION RESPONSE" : "TRACEROUTE RESPONSE"}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text color={theme.fg.muted}>From: </Text>
        <Text color={theme.fg.accent}>{nodeName}</Text>
        <Text color={theme.fg.muted}> ({formatNodeId(fromNode)})</Text>
      </Box>

      {type === "position" && <PositionDetails data={data as Mesh.Position} />}
      {type === "traceroute" && <TracerouteDetails data={data} nodeStore={nodeStore} />}

      <Box marginTop={1} justifyContent="center">
        <Text color={theme.fg.muted}>Press Escape or Space to dismiss (auto-close 5s)</Text>
      </Box>
    </Box>
  );
}

function PositionDetails({ data }: { data: Mesh.Position }) {
  const lat = data.latitudeI != null ? data.latitudeI / 1e7 : null;
  const lon = data.longitudeI != null ? data.longitudeI / 1e7 : null;

  return (
    <Box flexDirection="column">
      {lat != null && lon != null && (
        <Box>
          <Text color={theme.fg.muted}>Location: </Text>
          <Text color={theme.packet.position}>{lat.toFixed(6)}, {lon.toFixed(6)}</Text>
        </Box>
      )}
      {data.altitude != null && (
        <Box>
          <Text color={theme.fg.muted}>Altitude: </Text>
          <Text color={theme.fg.primary}>{data.altitude}m</Text>
        </Box>
      )}
      {data.satsInView != null && (
        <Box>
          <Text color={theme.fg.muted}>Satellites: </Text>
          <Text color={theme.fg.primary}>{data.satsInView}</Text>
        </Box>
      )}
      {data.groundSpeed != null && (
        <Box>
          <Text color={theme.fg.muted}>Speed: </Text>
          <Text color={theme.fg.primary}>{data.groundSpeed}m/s</Text>
        </Box>
      )}
    </Box>
  );
}

function TracerouteDetails({ data, nodeStore }: { data: unknown; nodeStore: NodeStore }) {
  const route = data as { route?: number[]; snrTowards?: number[]; snrBack?: number[] };

  if (!route.route || route.route.length === 0) {
    return (
      <Box>
        <Text color={theme.packet.direct}>Direct connection (0 hops)</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={theme.fg.muted}>Route: </Text>
        <Text color={theme.packet.traceroute}>{route.route.length} hop{route.route.length !== 1 ? "s" : ""}</Text>
      </Box>
      {route.route.map((nodeNum, i) => {
        const name = nodeStore.getNodeName(nodeNum);
        const snr = route.snrTowards?.[i];
        return (
          <Box key={nodeNum}>
            <Text color={theme.fg.muted}>  {i + 1}. </Text>
            <Text color={theme.fg.accent}>{name}</Text>
            <Text color={theme.fg.muted}> ({formatNodeId(nodeNum)})</Text>
            {snr != null && (
              <Text color={theme.fg.secondary}> SNR: {(snr / 4).toFixed(1)}dB</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
