import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { NodeStore } from "../../protocol/node-store";
import type { DbPositionResponse, DbTracerouteResponse, LogResponse } from "../../db";
import { formatNodeId } from "../../utils/hex";

interface LogPanelProps {
  responses: LogResponse[];
  selectedIndex: number;
  height: number;
  nodeStore: NodeStore;
}

export function LogPanel({ responses, selectedIndex, height, nodeStore }: LogPanelProps) {
  if (responses.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Text color={theme.fg.muted}>No position or traceroute responses logged yet.</Text>
        <Text> </Text>
        <Text color={theme.fg.secondary}>In NODES view, use:</Text>
        <Text color={theme.data.nodeFrom}>  p</Text><Text color={theme.fg.muted}> - Request position</Text>
        <Text color={theme.data.nodeFrom}>  t</Text><Text color={theme.fg.muted}> - Traceroute</Text>
        <Text color={theme.data.nodeFrom}>  d</Text><Text color={theme.fg.muted}> - Direct ping (hop=0)</Text>
        <Text color={theme.data.nodeFrom}>  e</Text><Text color={theme.fg.muted}> - Request telemetry</Text>
      </Box>
    );
  }

  // Split pane: upper half list, lower half inspector
  const listHeight = Math.floor((height - 2) * 0.5);
  const inspectorHeight = height - listHeight - 1;

  const selectedResponse = responses[selectedIndex];

  return (
    <Box flexDirection="column" width="100%">
      <Box height={listHeight} flexDirection="column">
        <LogList
          responses={responses}
          selectedIndex={selectedIndex}
          height={listHeight}
          nodeStore={nodeStore}
        />
      </Box>
      <Box height={1} borderStyle="single" borderColor={theme.border.normal} borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} />
      <Box height={inspectorHeight} flexDirection="column">
        <LogInspector
          response={selectedResponse}
          nodeStore={nodeStore}
          height={inspectorHeight}
        />
      </Box>
    </Box>
  );
}

function LogList({ responses, selectedIndex, height, nodeStore }: {
  responses: LogResponse[];
  selectedIndex: number;
  height: number;
  nodeStore: NodeStore;
}) {
  const visibleCount = Math.max(1, height - 2);

  let startIndex = 0;
  if (responses.length > visibleCount) {
    const halfView = Math.floor(visibleCount / 2);
    startIndex = Math.max(0, Math.min(
      selectedIndex - halfView,
      responses.length - visibleCount
    ));
  }

  const visibleResponses = responses.slice(startIndex, startIndex + visibleCount);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text color={theme.fg.muted}>
          {"TYPE".padEnd(12)}
          {"FROM".padEnd(12)}
          {"TIME"}
        </Text>
      </Box>
      {visibleResponses.map((response, i) => (
        <LogRow
          key={response.id || `${response.timestamp}-${i}`}
          response={response}
          isSelected={startIndex + i === selectedIndex}
          nodeStore={nodeStore}
        />
      ))}
    </Box>
  );
}

function isPositionResponse(r: LogResponse): r is DbPositionResponse {
  return "latitudeI" in r;
}

function LogRow({ response, isSelected, nodeStore }: {
  response: LogResponse;
  isSelected: boolean;
  nodeStore: NodeStore;
}) {
  const bgColor = isSelected ? theme.bg.selected : undefined;
  const isPosition = isPositionResponse(response);
  const type = isPosition ? "POSITION" : "TRACEROUTE";
  const typeColor = isPosition ? theme.packet.position : theme.packet.traceroute;
  const fromName = nodeStore.getNodeName(response.fromNode);
  const time = new Date(response.timestamp * 1000).toLocaleTimeString("en-US", { hour12: false });

  return (
    <Box backgroundColor={bgColor}>
      <Text wrap="truncate">
        <Text color={typeColor}>{type.padEnd(12)}</Text>
        <Text color={theme.fg.accent}>{fromName.slice(0, 10).padEnd(12)}</Text>
        <Text color={theme.fg.secondary}>{time}</Text>
      </Text>
    </Box>
  );
}

function LogInspector({ response, nodeStore, height }: {
  response?: LogResponse;
  nodeStore: NodeStore;
  height: number;
}) {
  if (!response) {
    return (
      <Box paddingX={1}>
        <Text color={theme.fg.muted}>No response selected</Text>
      </Box>
    );
  }

  const fromName = nodeStore.getNodeName(response.fromNode);

  if (isPositionResponse(response)) {
    const pos = response;
    const lat = pos.latitudeI != null ? pos.latitudeI / 1e7 : null;
    const lon = pos.longitudeI != null ? pos.longitudeI / 1e7 : null;

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box>
          <Text color={theme.fg.muted}>From: </Text>
          <Text color={theme.fg.accent}>{fromName}</Text>
          <Text color={theme.fg.muted}> ({formatNodeId(pos.fromNode)})</Text>
        </Box>
        {lat != null && lon != null && (
          <Box>
            <Text color={theme.fg.muted}>Position: </Text>
            <Text color={theme.packet.position}>{lat.toFixed(6)}, {lon.toFixed(6)}</Text>
          </Box>
        )}
        {pos.altitude != null && (
          <Box>
            <Text color={theme.fg.muted}>Altitude: </Text>
            <Text color={theme.fg.primary}>{pos.altitude}m</Text>
          </Box>
        )}
        {pos.satsInView != null && (
          <Box>
            <Text color={theme.fg.muted}>Satellites: </Text>
            <Text color={theme.fg.primary}>{pos.satsInView}</Text>
          </Box>
        )}
      </Box>
    );
  }

  // Traceroute response
  const tr = response as DbTracerouteResponse;
  const route: number[] = tr.route;
  const snrTowards: number[] = tr.snrTowards || [];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text color={theme.fg.muted}>To: </Text>
        <Text color={theme.fg.accent}>{fromName}</Text>
        <Text color={theme.fg.muted}> ({formatNodeId(tr.fromNode)})</Text>
      </Box>
      <Box>
        <Text color={theme.fg.muted}>Hop Limit: </Text>
        <Text color={theme.fg.primary}>{tr.hopLimit}</Text>
        {tr.hopLimit === 0 && <Text color={theme.packet.direct}> (direct ping)</Text>}
      </Box>
      {route.length === 0 ? (
        <Box>
          <Text color={theme.packet.direct}>Direct connection (0 hops)</Text>
        </Box>
      ) : (
        <>
          <Box>
            <Text color={theme.fg.muted}>Route: </Text>
            <Text color={theme.packet.traceroute}>{route.length} hop{route.length !== 1 ? "s" : ""}</Text>
          </Box>
          {route.slice(0, height - 4).map((nodeNum, i) => {
            const name = nodeStore.getNodeName(nodeNum);
            const snr = snrTowards[i];
            return (
              <Box key={nodeNum}>
                <Text color={theme.fg.muted}>  {i + 1}. </Text>
                <Text color={theme.fg.accent}>{name}</Text>
                {snr != null && (
                  <Text color={theme.fg.secondary}> SNR: {(snr / 4).toFixed(1)}dB</Text>
                )}
              </Box>
            );
          })}
        </>
      )}
    </Box>
  );
}
