import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { NodeStore } from "../../protocol/node-store";
import type { DbPositionResponse, DbTracerouteResponse, DbNodeInfoResponse, LogResponse } from "../../db";
import { formatNodeId, getHardwareModelName } from "../../utils";
import { fitVisual } from "../../utils/string-width";

interface LogPanelProps {
  responses: LogResponse[];
  selectedIndex: number;
  height: number;
  nodeStore: NodeStore;
}

function LogPanelComponent({ responses, selectedIndex, height, nodeStore }: LogPanelProps) {
  // Left panel width for list
  const LEFT_PANEL_WIDTH = 30;

  if (responses.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1} height={height}>
        <Text color={theme.fg.muted}>No responses logged yet.</Text>
        <Text> </Text>
        <Text color={theme.fg.secondary}>In NODES view, use:</Text>
        <Text color={theme.data.nodeFrom}>  p</Text><Text color={theme.fg.muted}> - Request position</Text>
        <Text color={theme.data.nodeFrom}>  t</Text><Text color={theme.fg.muted}> - Traceroute</Text>
        <Text color={theme.data.nodeFrom}>  D</Text><Text color={theme.fg.muted}> - Direct ping (hop=0)</Text>
        <Text color={theme.data.nodeFrom}>  i</Text><Text color={theme.fg.muted}> - Request node info</Text>
      </Box>
    );
  }

  const selectedResponse = responses[selectedIndex];

  return (
    <Box flexDirection="row" width="100%" height={height}>
      {/* Left panel - Log list */}
      <Box
        flexDirection="column"
        width={LEFT_PANEL_WIDTH}
        borderStyle="single"
        borderColor={theme.border.normal}
        borderRight
        borderTop={false}
        borderBottom={false}
        borderLeft={false}
      >
        <LogList
          responses={responses}
          selectedIndex={selectedIndex}
          height={height}
          nodeStore={nodeStore}
        />
      </Box>

      {/* Right panel - Log inspector */}
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        <LogInspector
          response={selectedResponse}
          nodeStore={nodeStore}
          height={height - 2}
        />
      </Box>
    </Box>
  );
}

export const LogPanel = React.memo(LogPanelComponent, (prevProps, nextProps) => {
  // Only re-render if relevant props changed
  return (
    prevProps.responses.length === nextProps.responses.length &&
    prevProps.selectedIndex === nextProps.selectedIndex &&
    prevProps.height === nextProps.height
  );
});

function LogList({ responses, selectedIndex, height, nodeStore }: {
  responses: LogResponse[];
  selectedIndex: number;
  height: number;
  nodeStore: NodeStore;
}) {
  const visibleCount = Math.max(1, height - 1);

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
    <>
      <Box paddingX={1}>
        <Text color={theme.fg.accent} bold>Log</Text>
        <Text color={theme.fg.muted}> ({responses.length})</Text>
      </Box>
      {visibleResponses.map((response, i) => (
        <LogRow
          key={`log-${response.id || response.timestamp}-${i}`}
          response={response}
          isSelected={startIndex + i === selectedIndex}
          nodeStore={nodeStore}
        />
      ))}
    </>
  );
}

function isPositionResponse(r: LogResponse): r is DbPositionResponse {
  return "latitudeI" in r;
}

function isNodeInfoResponse(r: LogResponse): r is DbNodeInfoResponse {
  return "longName" in r || "shortName" in r;
}

function LogRow({ response, isSelected, nodeStore }: {
  response: LogResponse;
  isSelected: boolean;
  nodeStore: NodeStore;
}) {
  const isPosition = isPositionResponse(response);
  const isNodeInfo = isNodeInfoResponse(response);
  const type = isPosition ? "POS" : isNodeInfo ? "NI" : "TR";
  const typeColor = isPosition ? theme.packet.position : isNodeInfo ? theme.packet.nodeinfo : theme.packet.traceroute;
  const fromName = nodeStore.getNodeName(response.fromNode);
  const time = new Date(response.timestamp * 1000).toLocaleTimeString(undefined, { hour12: false });
  const bgColor = isSelected ? theme.bg.selected : undefined;

  return (
    <Box backgroundColor={bgColor} paddingX={1}>
      <Text color={typeColor}>{type.padEnd(4)}</Text>
      <Text color={theme.fg.accent}>{fitVisual(fromName, 10)}  </Text>
      <Text color={theme.fg.secondary}>{time}</Text>
    </Box>
  );
}

function LogInspector({ response, nodeStore, height }: {
  response?: LogResponse;
  nodeStore: NodeStore;
  height: number;
}) {
  if (!response) {
    return <Text color={theme.fg.muted}>No response selected</Text>;
  }

  const fromName = nodeStore.getNodeName(response.fromNode);

  if (isPositionResponse(response)) {
    const pos = response;
    const lat = pos.latitudeI != null ? pos.latitudeI / 1e7 : null;
    const lon = pos.longitudeI != null ? pos.longitudeI / 1e7 : null;

    return (
      <>
        <Text><Text color={theme.fg.muted}>From: </Text><Text color={theme.fg.accent}>{fromName}</Text><Text color={theme.fg.muted}> ({formatNodeId(pos.fromNode)})</Text></Text>
        {lat != null && lon != null && (
          <Text><Text color={theme.fg.muted}>Position: </Text><Text color={theme.packet.position}>{lat.toFixed(6)}, {lon.toFixed(6)}</Text></Text>
        )}
        {pos.altitude != null && (
          <Text><Text color={theme.fg.muted}>Altitude: </Text><Text color={theme.fg.primary}>{pos.altitude}m</Text></Text>
        )}
        {pos.satsInView != null && (
          <Text><Text color={theme.fg.muted}>Satellites: </Text><Text color={theme.fg.primary}>{pos.satsInView}</Text></Text>
        )}
      </>
    );
  }

  // NodeInfo response
  if (isNodeInfoResponse(response)) {
    const ni = response;
    const hwModelName = getHardwareModelName(ni.hwModel);

    return (
      <>
        <Text><Text color={theme.fg.muted}>From: </Text><Text color={theme.fg.accent}>{fromName}</Text><Text color={theme.fg.muted}> ({formatNodeId(ni.fromNode)})</Text></Text>
        {ni.longName && (
          <Text><Text color={theme.fg.muted}>Long Name: </Text><Text color={theme.packet.nodeinfo}>{ni.longName}</Text></Text>
        )}
        {ni.shortName && (
          <Text><Text color={theme.fg.muted}>Short Name: </Text><Text color={theme.packet.nodeinfo}>{ni.shortName}</Text></Text>
        )}
        <Text><Text color={theme.fg.muted}>Hardware: </Text><Text color={theme.fg.primary}>{hwModelName}</Text></Text>
      </>
    );
  }

  // Traceroute response
  const tr = response as DbTracerouteResponse;
  const route: number[] = tr.route;
  const snrTowards: number[] = tr.snrTowards || [];

  return (
    <>
      <Text><Text color={theme.fg.muted}>To: </Text><Text color={theme.fg.accent}>{fromName}</Text><Text color={theme.fg.muted}> ({formatNodeId(tr.fromNode)})</Text></Text>
      <Text><Text color={theme.fg.muted}>Hop Limit: </Text><Text color={theme.fg.primary}>{tr.hopLimit}</Text>{tr.hopLimit === 0 && <Text color={theme.packet.direct}> (direct ping)</Text>}</Text>
      {route.length === 0 ? (
        <Text color={theme.packet.direct}>Direct connection (0 hops)</Text>
      ) : (
        <>
          <Text><Text color={theme.fg.muted}>Route: </Text><Text color={theme.packet.traceroute}>{route.length} hop{route.length !== 1 ? "s" : ""}</Text></Text>
          {route.slice(0, height - 4).map((nodeNum, i) => {
            const name = nodeStore.getNodeName(nodeNum);
            const snr = snrTowards[i];
            return (
              <Text key={`hop-${i}`}><Text color={theme.fg.muted}>  {i + 1}. </Text><Text color={theme.fg.accent}>{name}</Text>{snr != null && (<Text color={theme.fg.secondary}> SNR: {(snr / 4).toFixed(1)}dB</Text>)}</Text>
            );
          })}
        </>
      )}
    </>
  );
}
