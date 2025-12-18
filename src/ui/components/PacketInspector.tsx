import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { DecodedPacket } from "../../protocol/decoder";
import type { NodeStore } from "../../protocol/node-store";
import { Mesh, Portnums, Channel, Telemetry } from "@meshtastic/protobufs";
import { formatNodeId } from "../../utils/hex";

export type InspectorTab = "info" | "json" | "hex";

interface PacketInspectorProps {
  packet?: DecodedPacket;
  activeTab: InspectorTab;
  height?: number;
  nodeStore: NodeStore;
  scrollOffset?: number;
}

export function PacketInspector({ packet, activeTab, height = 12, nodeStore, scrollOffset = 0 }: PacketInspectorProps) {
  if (!packet) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <TabBar activeTab={activeTab} />
        <Text color={theme.fg.muted}>No packet selected</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} height={height}>
      <TabBar activeTab={activeTab} scrollOffset={scrollOffset} />
      {activeTab === "info" && <InfoView packet={packet} nodeStore={nodeStore} height={height - 2} scrollOffset={scrollOffset} />}
      {activeTab === "json" && <JsonView packet={packet} height={height - 2} scrollOffset={scrollOffset} />}
      {activeTab === "hex" && <HexView packet={packet} height={height - 2} scrollOffset={scrollOffset} />}
    </Box>
  );
}

function TabBar({ activeTab, scrollOffset = 0 }: { activeTab: InspectorTab; scrollOffset?: number }) {
  const tabs: { key: InspectorTab; label: string }[] = [
    { key: "info", label: "INFO" },
    { key: "json", label: "JSON" },
    { key: "hex", label: "HEX" },
  ];

  return (
    <Box marginBottom={1}>
      {tabs.map((tab, i) => (
        <React.Fragment key={tab.key}>
          {i > 0 && <Text color={theme.fg.muted}> | </Text>}
          <Text
            color={activeTab === tab.key ? theme.fg.accent : theme.fg.muted}
            bold={activeTab === tab.key}
          >
            {activeTab === tab.key ? `[${tab.label}]` : ` ${tab.label} `}
          </Text>
        </React.Fragment>
      ))}
      <Text color={theme.fg.muted}>  {`<-`} h/l {`->`}</Text>
      {scrollOffset > 0 && <Text color={theme.fg.secondary}>  [+{scrollOffset}]</Text>}
    </Box>
  );
}

// === INFO VIEW ===
function InfoView({ packet, nodeStore, height, scrollOffset }: { packet: DecodedPacket; nodeStore: NodeStore; height: number; scrollOffset: number }) {
  const mp = packet.meshPacket;
  const fr = packet.fromRadio;
  const lines: React.ReactNode[] = [];

  // Header line
  lines.push(
    <Box key="header">
      <Text color={theme.fg.muted}>Time: </Text>
      <Text color={theme.fg.primary}>{packet.timestamp.toLocaleTimeString()}</Text>
      <Text color={theme.fg.muted}>  ID: </Text>
      <Text color={theme.fg.secondary}>{packet.id}</Text>
    </Box>
  );

  // MeshPacket info
  if (mp) {
    const fromName = nodeStore.getNodeName(mp.from);
    const toName = mp.to === 0xffffffff ? "BROADCAST" : nodeStore.getNodeName(mp.to);

    lines.push(
      <Box key="from-to">
        <Text color={theme.fg.muted}>From: </Text>
        <Text color={theme.fg.accent}>{fromName}</Text>
        <Text color={theme.fg.muted}> ({formatNodeId(mp.from)})</Text>
        <Text color={theme.fg.muted}>  To: </Text>
        <Text color={theme.fg.primary}>{toName}</Text>
        {mp.to !== 0xffffffff && <Text color={theme.fg.muted}> ({formatNodeId(mp.to)})</Text>}
        <Text color={theme.fg.muted}>  Ch: </Text>
        <Text color={theme.fg.primary}>{mp.channel}</Text>
      </Box>
    );

    if (mp.rxSnr !== undefined || mp.rxRssi !== undefined || mp.hopStart !== undefined) {
      lines.push(
        <Box key="metrics">
          {mp.rxSnr !== undefined && (
            <>
              <Text color={theme.fg.muted}>SNR: </Text>
              <Text color={mp.rxSnr >= 0 ? theme.packet.direct : theme.packet.telemetry}>
                {mp.rxSnr.toFixed(1)}dB
              </Text>
            </>
          )}
          {mp.rxRssi !== undefined && (
            <>
              <Text color={theme.fg.muted}>  RSSI: </Text>
              <Text color={theme.fg.primary}>{mp.rxRssi}dBm</Text>
            </>
          )}
          {mp.hopStart !== undefined && mp.hopLimit !== undefined && (
            <>
              <Text color={theme.fg.muted}>  Hops: </Text>
              <Text color={mp.hopStart - mp.hopLimit === 0 ? theme.packet.direct : theme.fg.primary}>
                {mp.hopStart - mp.hopLimit}/{mp.hopStart}
              </Text>
            </>
          )}
        </Box>
      );
    }

    if (packet.portnum !== undefined) {
      lines.push(
        <Box key="port">
          <Text color={theme.fg.muted}>Port: </Text>
          <Text color={theme.fg.accent}>
            {Portnums.PortNum[packet.portnum] || `UNKNOWN(${packet.portnum})`}
          </Text>
        </Box>
      );
    }

    // Payload-specific details
    const payloadDetails = renderPayloadDetails(packet, nodeStore);
    if (payloadDetails) {
      lines.push(<Box key="payload-separator" height={1} />);
      lines.push(...payloadDetails);
    }
  }

  // FromRadio variant details (non-packet)
  if (fr && fr.payloadVariant.case !== "packet") {
    const variantDetails = renderFromRadioDetails(fr);
    if (variantDetails) {
      lines.push(...variantDetails);
    }
  }

  if (packet.decodeError) {
    lines.push(
      <Box key="error">
        <Text color={theme.packet.encrypted}>Error: {packet.decodeError}</Text>
      </Box>
    );
  }

  return <Box flexDirection="column">{lines.slice(scrollOffset, scrollOffset + height)}</Box>;
}

function renderPayloadDetails(packet: DecodedPacket, nodeStore: NodeStore): React.ReactNode[] | null {
  if (!packet.payload || typeof packet.payload !== "object") return null;

  const lines: React.ReactNode[] = [];

  // Position
  if (packet.portnum === Portnums.PortNum.POSITION_APP) {
    const pos = packet.payload as Mesh.Position;
    if (pos.latitudeI != null && pos.longitudeI != null) {
      const lat = pos.latitudeI / 1e7;
      const lon = pos.longitudeI / 1e7;
      lines.push(
        <Box key="pos-coords">
          <Text color={theme.fg.muted}>Position: </Text>
          <Text color={theme.packet.position}>{lat.toFixed(6)}, {lon.toFixed(6)}</Text>
        </Box>
      );
      if (pos.altitude != null) {
        lines.push(
          <Box key="pos-alt">
            <Text color={theme.fg.muted}>Altitude: </Text>
            <Text color={theme.fg.primary}>{pos.altitude}m</Text>
            {pos.groundSpeed != null && (
              <>
                <Text color={theme.fg.muted}>  Speed: </Text>
                <Text color={theme.fg.primary}>{pos.groundSpeed}m/s</Text>
              </>
            )}
          </Box>
        );
      }
      if (pos.precisionBits != null || pos.satsInView != null) {
        lines.push(
          <Box key="pos-extra">
            {pos.satsInView != null && (
              <>
                <Text color={theme.fg.muted}>Satellites: </Text>
                <Text color={theme.fg.primary}>{pos.satsInView}</Text>
              </>
            )}
            {pos.precisionBits != null && (
              <>
                <Text color={theme.fg.muted}>  Precision: </Text>
                <Text color={theme.fg.secondary}>{pos.precisionBits} bits</Text>
              </>
            )}
          </Box>
        );
      }
    }
    return lines.length > 0 ? lines : null;
  }

  // NodeInfo
  if (packet.portnum === Portnums.PortNum.NODEINFO_APP) {
    const user = packet.payload as Mesh.User;
    lines.push(
      <Box key="node-user">
        <Text color={theme.fg.muted}>Short: </Text>
        <Text color={theme.fg.accent}>{user.shortName || "?"}</Text>
        <Text color={theme.fg.muted}>  Long: </Text>
        <Text color={theme.fg.primary}>{user.longName || "?"}</Text>
      </Box>
    );
    lines.push(
      <Box key="node-hw">
        <Text color={theme.fg.muted}>Hardware: </Text>
        <Text color={theme.fg.secondary}>
          {user.hwModel !== undefined ? Mesh.HardwareModel[user.hwModel] || `Model_${user.hwModel}` : "Unknown"}
        </Text>
        {user.role !== undefined && user.role !== 0 && (
          <>
            <Text color={theme.fg.muted}>  Role: </Text>
            <Text color={theme.fg.secondary}>{String(user.role)}</Text>
          </>
        )}
      </Box>
    );
    if (user.id) {
      lines.push(
        <Box key="node-id">
          <Text color={theme.fg.muted}>User ID: </Text>
          <Text color={theme.fg.secondary}>{user.id}</Text>
        </Box>
      );
    }
    return lines;
  }

  // Telemetry
  if (packet.portnum === Portnums.PortNum.TELEMETRY_APP) {
    const telem = packet.payload as Telemetry.Telemetry;
    if (telem.variant.case === "deviceMetrics") {
      const dm = telem.variant.value as Telemetry.DeviceMetrics;
      lines.push(
        <Box key="telem-type">
          <Text color={theme.fg.muted}>Telemetry: </Text>
          <Text color={theme.packet.telemetry}>Device Metrics</Text>
        </Box>
      );
      lines.push(
        <Box key="telem-batt">
          <Text color={theme.fg.muted}>Battery: </Text>
          <Text color={dm.batteryLevel && dm.batteryLevel > 50 ? theme.packet.direct : theme.packet.telemetry}>
            {dm.batteryLevel ?? "?"}%
          </Text>
          {dm.voltage != null && (
            <>
              <Text color={theme.fg.muted}>  Voltage: </Text>
              <Text color={theme.fg.primary}>{dm.voltage.toFixed(2)}V</Text>
            </>
          )}
        </Box>
      );
      lines.push(
        <Box key="telem-util">
          <Text color={theme.fg.muted}>Channel Util: </Text>
          <Text color={theme.fg.primary}>{dm.channelUtilization?.toFixed(1) ?? "?"}%</Text>
          <Text color={theme.fg.muted}>  Air TX: </Text>
          <Text color={theme.fg.primary}>{dm.airUtilTx?.toFixed(1) ?? "?"}%</Text>
        </Box>
      );
    } else if (telem.variant.case === "environmentMetrics") {
      const em = telem.variant.value as Telemetry.EnvironmentMetrics;
      lines.push(
        <Box key="telem-type">
          <Text color={theme.fg.muted}>Telemetry: </Text>
          <Text color={theme.packet.telemetry}>Environment</Text>
        </Box>
      );
      lines.push(
        <Box key="telem-env">
          {em.temperature != null && (
            <>
              <Text color={theme.fg.muted}>Temp: </Text>
              <Text color={theme.fg.primary}>{em.temperature.toFixed(1)}°C</Text>
            </>
          )}
          {em.relativeHumidity != null && (
            <>
              <Text color={theme.fg.muted}>  Humidity: </Text>
              <Text color={theme.fg.primary}>{em.relativeHumidity.toFixed(0)}%</Text>
            </>
          )}
          {em.barometricPressure != null && (
            <>
              <Text color={theme.fg.muted}>  Pressure: </Text>
              <Text color={theme.fg.primary}>{em.barometricPressure.toFixed(0)}hPa</Text>
            </>
          )}
        </Box>
      );
    } else {
      lines.push(
        <Box key="telem-other">
          <Text color={theme.fg.muted}>Telemetry: </Text>
          <Text color={theme.packet.telemetry}>{telem.variant.case || "unknown"}</Text>
        </Box>
      );
    }
    return lines;
  }

  // Traceroute
  if (packet.portnum === Portnums.PortNum.TRACEROUTE_APP) {
    const route = (packet.payload as { route?: number[]; snrTowards?: number[]; snrBack?: number[] });
    if (route.route && route.route.length > 0) {
      lines.push(
        <Box key="tr-label">
          <Text color={theme.fg.muted}>Route: </Text>
          <Text color={theme.packet.traceroute}>{route.route.length} hop{route.route.length !== 1 ? "s" : ""}</Text>
        </Box>
      );
      route.route.forEach((nodeNum, i) => {
        const name = nodeStore.getNodeName(nodeNum);
        const snr = route.snrTowards?.[i];
        lines.push(
          <Box key={`tr-hop-${i}`}>
            <Text color={theme.fg.muted}>  {i + 1}. </Text>
            <Text color={theme.fg.accent}>{name}</Text>
            <Text color={theme.fg.muted}> ({formatNodeId(nodeNum)})</Text>
            {snr != null && (
              <Text color={theme.fg.secondary}> SNR: {(snr / 4).toFixed(1)}dB</Text>
            )}
          </Box>
        );
      });
    }
    return lines.length > 0 ? lines : null;
  }

  // Routing ACK/Error
  if (packet.portnum === Portnums.PortNum.ROUTING_APP) {
    const routing = packet.payload as { variant?: { case?: string; value?: number } };
    if (routing.variant?.case === "errorReason" && routing.variant.value !== undefined) {
      const isAck = routing.variant.value === Mesh.Routing_Error.NONE;
      lines.push(
        <Box key="routing">
          <Text color={theme.fg.muted}>Status: </Text>
          <Text color={isAck ? theme.packet.direct : theme.packet.encrypted}>
            {isAck ? "ACK (delivered)" : Mesh.Routing_Error[routing.variant.value] || `ERROR_${routing.variant.value}`}
          </Text>
        </Box>
      );
    }
    return lines.length > 0 ? lines : null;
  }

  // Text message
  if (typeof packet.payload === "string" || packet.portnum === Portnums.PortNum.TEXT_MESSAGE_APP) {
    const text = typeof packet.payload === "string" ? packet.payload : "";
    if (text) {
      lines.push(
        <Box key="msg">
          <Text color={theme.fg.muted}>Message: </Text>
          <Text color={theme.packet.message}>"{text}"</Text>
        </Box>
      );
    }
    return lines.length > 0 ? lines : null;
  }

  // Neighbor info
  if (packet.portnum === Portnums.PortNum.NEIGHBORINFO_APP) {
    const ni = packet.payload as { neighbors?: { nodeId?: number; snr?: number }[] };
    if (ni.neighbors && ni.neighbors.length > 0) {
      lines.push(
        <Box key="ni-count">
          <Text color={theme.fg.muted}>Neighbors: </Text>
          <Text color={theme.fg.primary}>{ni.neighbors.length}</Text>
        </Box>
      );
      ni.neighbors.slice(0, 5).forEach((n, i) => {
        const name = n.nodeId ? nodeStore.getNodeName(n.nodeId) : "?";
        lines.push(
          <Box key={`ni-${i}`}>
            <Text color={theme.fg.muted}>  • </Text>
            <Text color={theme.fg.accent}>{name}</Text>
            {n.snr != null && <Text color={theme.fg.secondary}> SNR: {n.snr.toFixed(1)}dB</Text>}
          </Box>
        );
      });
      if (ni.neighbors.length > 5) {
        lines.push(
          <Box key="ni-more">
            <Text color={theme.fg.muted}>  ... and {ni.neighbors.length - 5} more</Text>
          </Box>
        );
      }
    }
    return lines.length > 0 ? lines : null;
  }

  return null;
}

function renderFromRadioDetails(fr: Mesh.FromRadio): React.ReactNode[] | null {
  const variant = fr.payloadVariant;
  const lines: React.ReactNode[] = [];

  switch (variant.case) {
    case "myInfo": {
      const info = variant.value as Mesh.MyNodeInfo;
      lines.push(
        <Box key="type">
          <Text color={theme.fg.muted}>Type: </Text>
          <Text color={theme.packet.direct}>MY_INFO</Text>
        </Box>
      );
      lines.push(
        <Box key="node">
          <Text color={theme.fg.muted}>Node: </Text>
          <Text color={theme.fg.primary}>{formatNodeId(info.myNodeNum)}</Text>
        </Box>
      );
      break;
    }

    case "nodeInfo": {
      const info = variant.value as Mesh.NodeInfo;
      lines.push(
        <Box key="type">
          <Text color={theme.fg.muted}>Type: </Text>
          <Text color={theme.packet.nodeinfo}>NODE_INFO</Text>
        </Box>
      );
      lines.push(
        <Box key="node">
          <Text color={theme.fg.muted}>Node: </Text>
          <Text color={theme.fg.primary}>{formatNodeId(info.num)}</Text>
          {info.user?.shortName && (
            <>
              <Text color={theme.fg.muted}>  Name: </Text>
              <Text color={theme.fg.accent}>{info.user.shortName}</Text>
            </>
          )}
        </Box>
      );
      if (info.user?.longName) {
        lines.push(
          <Box key="long">
            <Text color={theme.fg.muted}>Long: </Text>
            <Text color={theme.fg.secondary}>{info.user.longName}</Text>
          </Box>
        );
      }
      if (info.user?.hwModel !== undefined) {
        lines.push(
          <Box key="hw">
            <Text color={theme.fg.muted}>HW: </Text>
            <Text color={theme.fg.secondary}>{Mesh.HardwareModel[info.user.hwModel] || info.user.hwModel}</Text>
          </Box>
        );
      }
      break;
    }

    case "config": {
      const config = variant.value as Mesh.Config;
      const configCase = config.payloadVariant.case || "unknown";
      lines.push(
        <Box key="type">
          <Text color={theme.fg.muted}>Type: </Text>
          <Text color={theme.packet.config}>CONFIG</Text>
          <Text color={theme.fg.muted}>  Section: </Text>
          <Text color={theme.fg.accent}>{configCase}</Text>
        </Box>
      );
      break;
    }

    case "moduleConfig": {
      const config = variant.value as Mesh.ModuleConfig;
      const configCase = config.payloadVariant.case || "unknown";
      lines.push(
        <Box key="type">
          <Text color={theme.fg.muted}>Type: </Text>
          <Text color={theme.packet.config}>MODULE_CONFIG</Text>
          <Text color={theme.fg.muted}>  Module: </Text>
          <Text color={theme.fg.accent}>{configCase}</Text>
        </Box>
      );
      break;
    }

    case "channel": {
      const channel = variant.value as Mesh.Channel;
      lines.push(
        <Box key="type">
          <Text color={theme.fg.muted}>Type: </Text>
          <Text color={theme.packet.config}>CHANNEL</Text>
          <Text color={theme.fg.muted}>  Index: </Text>
          <Text color={theme.fg.primary}>{channel.index}</Text>
        </Box>
      );
      lines.push(
        <Box key="ch-details">
          <Text color={theme.fg.muted}>Name: </Text>
          <Text color={theme.fg.accent}>{channel.settings?.name || "(default)"}</Text>
          <Text color={theme.fg.muted}>  Role: </Text>
          <Text color={theme.fg.secondary}>{Channel.Channel_Role[channel.role] || channel.role}</Text>
        </Box>
      );
      if (channel.settings?.psk && channel.settings.psk.length > 0) {
        lines.push(
          <Box key="psk">
            <Text color={theme.fg.muted}>PSK: </Text>
            <Text color={theme.fg.secondary}>{channel.settings.psk.length} bytes</Text>
          </Box>
        );
      }
      break;
    }

    case "configCompleteId":
      lines.push(
        <Box key="type">
          <Text color={theme.fg.muted}>Type: </Text>
          <Text color={theme.packet.direct}>CONFIG_COMPLETE</Text>
          <Text color={theme.fg.muted}>  ID: </Text>
          <Text color={theme.fg.secondary}>{variant.value}</Text>
        </Box>
      );
      break;

    case "metadata": {
      const meta = variant.value as Mesh.DeviceMetadata;
      lines.push(
        <Box key="type">
          <Text color={theme.fg.muted}>Type: </Text>
          <Text color={theme.packet.telemetry}>METADATA</Text>
        </Box>
      );
      lines.push(
        <Box key="fw">
          <Text color={theme.fg.muted}>FW: </Text>
          <Text color={theme.fg.primary}>{meta.firmwareVersion}</Text>
          {meta.deviceStateVersion && (
            <>
              <Text color={theme.fg.muted}>  State: </Text>
              <Text color={theme.fg.secondary}>{meta.deviceStateVersion}</Text>
            </>
          )}
        </Box>
      );
      break;
    }

    default:
      if (variant.case) {
        lines.push(
          <Box key="type">
            <Text color={theme.fg.muted}>Type: </Text>
            <Text color={theme.packet.unknown}>{variant.case.toUpperCase()}</Text>
          </Box>
        );
      }
  }

  return lines.length > 0 ? lines : null;
}

// === JSON VIEW with syntax highlighting ===
function JsonView({ packet, height, scrollOffset }: { packet: DecodedPacket; height: number; scrollOffset: number }) {
  const jsonStr = formatPacketJson(packet);
  const allLines = jsonStr.split("\n");
  const jsonLines = allLines.slice(scrollOffset, scrollOffset + height);

  return (
    <Box flexDirection="column">
      {jsonLines.map((line, i) => (
        <Box key={scrollOffset + i}>{renderJsonLine(line)}</Box>
      ))}
    </Box>
  );
}

function renderJsonLine(line: string): React.ReactNode {
  const elements: React.ReactNode[] = [];
  let idx = 0;
  let keyIdx = 0;

  // Match indentation
  const indentMatch = line.match(/^(\s*)/);
  if (indentMatch && indentMatch[1]) {
    elements.push(<Text key={keyIdx++} color={theme.fg.muted}>{indentMatch[1]}</Text>);
    idx = indentMatch[1].length;
  }

  const rest = line.slice(idx);

  // Tokenize the rest of the line
  const tokenRegex = /("(?:\\.|[^"\\])*")\s*(:)?|(\d+\.?\d*)|(\btrue\b|\bfalse\b)|(\bnull\b)|([{}\[\],])/g;
  let lastIdx = 0;
  let match;

  while ((match = tokenRegex.exec(rest)) !== null) {
    // Add any text before this match
    if (match.index > lastIdx) {
      elements.push(<Text key={keyIdx++} color={theme.fg.muted}>{rest.slice(lastIdx, match.index)}</Text>);
    }

    if (match[1]) {
      // String - check if it's a key (followed by colon)
      if (match[2]) {
        // It's a key
        elements.push(<Text key={keyIdx++} color={theme.data.coords}>{match[1]}</Text>);
        elements.push(<Text key={keyIdx++} color={theme.fg.muted}>:</Text>);
      } else {
        // It's a string value
        elements.push(<Text key={keyIdx++} color={theme.data.quote}>{match[1]}</Text>);
      }
    } else if (match[3]) {
      // Number
      elements.push(<Text key={keyIdx++} color={theme.data.voltage}>{match[3]}</Text>);
    } else if (match[4]) {
      // Boolean
      elements.push(<Text key={keyIdx++} color={theme.data.battery}>{match[4]}</Text>);
    } else if (match[5]) {
      // Null
      elements.push(<Text key={keyIdx++} color={theme.data.percent}>{match[5]}</Text>);
    } else if (match[6]) {
      // Brackets/punctuation
      elements.push(<Text key={keyIdx++} color={theme.fg.muted}>{match[6]}</Text>);
    }

    lastIdx = match.index + match[0].length;
  }

  // Add any remaining text
  if (lastIdx < rest.length) {
    elements.push(<Text key={keyIdx++} color={theme.fg.muted}>{rest.slice(lastIdx)}</Text>);
  }

  return elements.length > 0 ? <>{elements}</> : <Text color={theme.fg.muted}>{line}</Text>;
}

function formatPacketJson(packet: DecodedPacket): string {
  const data: Record<string, unknown> = {
    id: packet.id,
    timestamp: packet.timestamp.toISOString(),
  };

  if (packet.meshPacket) {
    data.meshPacket = {
      from: `0x${packet.meshPacket.from.toString(16).padStart(8, "0")}`,
      to: packet.meshPacket.to === 0xffffffff ? "BROADCAST" : `0x${packet.meshPacket.to.toString(16).padStart(8, "0")}`,
      channel: packet.meshPacket.channel,
      rxSnr: packet.meshPacket.rxSnr,
      rxRssi: packet.meshPacket.rxRssi,
      hopStart: packet.meshPacket.hopStart,
      hopLimit: packet.meshPacket.hopLimit,
    };
  }

  if (packet.portnum !== undefined) {
    data.portnum = Portnums.PortNum[packet.portnum] || packet.portnum;
  }

  if (packet.payload) {
    data.payload = packet.payload;
  }

  if (packet.fromRadio && packet.fromRadio.payloadVariant.case !== "packet") {
    data.fromRadio = {
      type: packet.fromRadio.payloadVariant.case,
      value: packet.fromRadio.payloadVariant.value,
    };
  }

  if (packet.decodeError) {
    data.decodeError = packet.decodeError;
  }

  return JSON.stringify(data, replacer, 2);
}

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return `<${value.length} bytes>`;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

// === HEX VIEW ===
function HexView({ packet, height, scrollOffset }: { packet: DecodedPacket; height: number; scrollOffset: number }) {
  const bytes = packet.raw;
  const lines: React.ReactNode[] = [];

  lines.push(
    <Box key="size">
      <Text color={theme.fg.muted}>Raw size: </Text>
      <Text color={theme.fg.primary}>{bytes.length} bytes</Text>
    </Box>
  );

  const bytesPerLine = 16;
  const totalHexLines = Math.ceil(bytes.length / bytesPerLine);

  for (let lineIdx = 0; lineIdx < totalHexLines; lineIdx++) {
    const offset = lineIdx * bytesPerLine;
    const chunk = bytes.slice(offset, offset + bytesPerLine);
    const hexParts: string[] = [];
    const asciiParts: string[] = [];

    for (let i = 0; i < bytesPerLine; i++) {
      if (i < chunk.length) {
        hexParts.push(chunk[i].toString(16).padStart(2, "0"));
        const char = chunk[i];
        asciiParts.push(char >= 32 && char < 127 ? String.fromCharCode(char) : ".");
      } else {
        hexParts.push("  ");
        asciiParts.push(" ");
      }
    }

    const offsetStr = offset.toString(16).padStart(4, "0");
    const hexStr = hexParts.join(" ");
    const asciiStr = asciiParts.join("");

    lines.push(
      <Box key={`line-${offset}`}>
        <Text color={theme.fg.muted}>{offsetStr}  </Text>
        <Text color={theme.fg.secondary}>{hexStr}  </Text>
        <Text color={theme.fg.accent}>{asciiStr}</Text>
      </Box>
    );
  }

  return <Box flexDirection="column">{lines.slice(scrollOffset, scrollOffset + height)}</Box>;
}
