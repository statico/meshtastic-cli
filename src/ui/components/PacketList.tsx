import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { DecodedPacket } from "../../protocol/decoder";
import type { NodeStore } from "../../protocol/node-store";
import { Mesh, Portnums, Telemetry, StoreForward } from "@meshtastic/protobufs";
import { formatNodeId } from "../../utils/hex";

function LiveIndicator() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % 4);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  // Radio waves animation with ornate parens
  const frames = ["  •  ", " ❨•❩ ", "❨❨•❩❩"];
  const pattern = [0, 1, 2, 1];
  const dimGreen = "#2d5a3d";

  return (
    <Text>
      <Text color={theme.status.online} bold>LIVE </Text>
      <Text color={dimGreen}>{frames[pattern[frame]]}</Text>
    </Text>
  );
}

interface PacketListProps {
  packets: DecodedPacket[];
  selectedIndex: number;
  nodeStore: NodeStore;
  height?: number;
  isFollowing?: boolean;
}

export function PacketList({ packets, selectedIndex, nodeStore, height = 20, isFollowing }: PacketListProps) {
  // Account for LIVE indicator taking one row when showing
  const visibleCount = Math.max(1, height - 2 - (isFollowing ? 1 : 0));

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
    <Box flexDirection="column" width="100%">
      {isFollowing && (
        <Box paddingLeft={1}>
          <LiveIndicator />
        </Box>
      )}
      {visiblePackets.map((packet, i) => {
        const actualIndex = startIndex + i;
        const isSelected = actualIndex === selectedIndex;
        return (
          <PacketRow
            key={`${packet.id}-${actualIndex}`}
            packet={packet}
            nodeStore={nodeStore}
            isSelected={isSelected}
          />
        );
      })}
    </Box>
  );
}

// Helper functions defined before they're used

function getPortColor(portnum?: Portnums.PortNum): string {
  if (portnum === undefined) return theme.packet.encrypted;
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

function renderPacketSummary(packet: DecodedPacket, nodeStore: NodeStore): React.ReactNode {
  if (!packet.payload) return null;

  // Text message
  if (typeof packet.payload === "string") {
    const text = packet.payload.slice(0, 40);
    return <Text color={theme.data.quote}> "{text}{packet.payload.length > 40 ? "..." : ""}"</Text>;
  }

  if (typeof packet.payload !== "object") return null;

  // Routing (ACK/error)
  if (packet.portnum === Portnums.PortNum.ROUTING_APP) {
    const routing = packet.payload as { variant?: { case?: string; value?: number } };
    if (routing.variant?.case === "errorReason" && routing.variant.value !== undefined) {
      const isAck = routing.variant.value === Mesh.Routing_Error.NONE;
      return (
        <Text color={isAck ? theme.data.snr : theme.packet.encrypted}>
          {" "}{isAck ? "ACK" : Mesh.Routing_Error[routing.variant.value] || `ERROR_${routing.variant.value}`}
        </Text>
      );
    }
    return null;
  }

  // Traceroute - show full route
  if (packet.portnum === Portnums.PortNum.TRACEROUTE_APP) {
    const route = (packet.payload as { route?: number[] }).route;
    if (route && route.length > 0) {
      return (
        <>
          <Text color={theme.fg.muted}> [</Text>
          {route.map((n, i) => (
            <React.Fragment key={n}>
              {i > 0 && <Text color={theme.data.arrow}>{" -> "}</Text>}
              <Text color={theme.data.nodeFrom}>{nodeStore.getNodeName(n)}</Text>
            </React.Fragment>
          ))}
          <Text color={theme.fg.muted}>]</Text>
        </>
      );
    }
    return null;
  }

  // Position - show lat/lon with colors
  if (packet.portnum === Portnums.PortNum.POSITION_APP) {
    const pos = packet.payload as Mesh.Position;
    if (pos.latitudeI != null && pos.longitudeI != null) {
      const lat = (pos.latitudeI / 1e7).toFixed(5);
      const lon = (pos.longitudeI / 1e7).toFixed(5);
      return (
        <>
          <Text color={theme.data.coords}> {lat}</Text>
          <Text color={theme.fg.muted}>,</Text>
          <Text color={theme.data.coords}> {lon}</Text>
          {pos.altitude != null && <Text color={theme.data.altitude}> {pos.altitude}m</Text>}
        </>
      );
    }
    return null;
  }

  // NodeInfo - show long name and hardware
  if (packet.portnum === Portnums.PortNum.NODEINFO_APP) {
    const user = packet.payload as Mesh.User;
    return (
      <>
        {user.longName && <Text color={theme.fg.primary}> {user.longName}</Text>}
        {user.hwModel !== undefined && user.hwModel !== 0 && (
          <Text color={theme.data.hardware}> | {Mesh.HardwareModel[user.hwModel] || `HW_${user.hwModel}`}</Text>
        )}
      </>
    );
  }

  // Telemetry - show device metrics with colors
  if (packet.portnum === Portnums.PortNum.TELEMETRY_APP) {
    const telem = packet.payload as Telemetry.Telemetry;
    if (telem.variant.case === "deviceMetrics") {
      const dm = telem.variant.value as Telemetry.DeviceMetrics;
      return (
        <>
          {dm.batteryLevel != null && dm.batteryLevel > 0 && (
            <Text color={dm.batteryLevel > 20 ? theme.data.battery : theme.data.batteryLow}>
              {" "}{dm.batteryLevel}%
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
    if (telem.variant.case === "environmentMetrics") {
      const em = telem.variant.value as Telemetry.EnvironmentMetrics;
      return (
        <>
          {em.temperature != null && <Text color={theme.data.coords}> {em.temperature.toFixed(1)}°C</Text>}
          {em.relativeHumidity != null && <Text color={theme.data.percent}> {em.relativeHumidity.toFixed(0)}%rh</Text>}
          {em.barometricPressure != null && <Text color={theme.data.voltage}> {em.barometricPressure.toFixed(0)}hPa</Text>}
        </>
      );
    }
    if (telem.variant.case === "powerMetrics") {
      const pm = telem.variant.value as Telemetry.PowerMetrics;
      return (
        <>
          {pm.ch1Voltage != null && <Text color={theme.data.voltage}> ch1:{pm.ch1Voltage.toFixed(2)}V</Text>}
          {pm.ch1Current != null && <Text color={theme.data.percent}> {pm.ch1Current.toFixed(0)}mA</Text>}
        </>
      );
    }
    return <Text color={theme.fg.muted}> {telem.variant.case || "unknown"}</Text>;
  }

  // Admin message
  if (packet.portnum === Portnums.PortNum.ADMIN_APP) {
    const admin = packet.payload as { variant?: { case?: string } };
    return admin.variant?.case ? <Text color={theme.data.channel}> {admin.variant.case}</Text> : null;
  }

  // Waypoint
  if (packet.portnum === Portnums.PortNum.WAYPOINT_APP) {
    const wp = packet.payload as { name?: string; description?: string };
    return wp.name ? <Text color={theme.data.quote}> {wp.name}</Text> : null;
  }

  // Range test
  if (packet.portnum === Portnums.PortNum.RANGE_TEST_APP) {
    const data = packet.payload as { data?: Uint8Array };
    if (data.data) {
      try {
        const text = new TextDecoder().decode(data.data).slice(0, 30);
        return <Text color={theme.data.quote}> "{text}"</Text>;
      } catch {
        return null;
      }
    }
    return null;
  }

  // Store and forward
  if (packet.portnum === Portnums.PortNum.STORE_FORWARD_APP) {
    const sf = packet.payload as StoreForward.StoreAndForward;
    const rrName = StoreForward.StoreAndForward_RequestResponse[sf.rr] || "";
    if (sf.variant.case === "stats") {
      const stats = sf.variant.value;
      return (
        <>
          <Text color={theme.data.channel}> {rrName}</Text>
          <Text color={theme.fg.primary}> saved:{stats.messagesSaved}/{stats.messagesMax}</Text>
          <Text color={theme.fg.muted}> up:{Math.floor(stats.upTime / 60)}m</Text>
        </>
      );
    }
    if (sf.variant.case === "history") {
      const hist = sf.variant.value;
      return (
        <>
          <Text color={theme.data.channel}> {rrName}</Text>
          <Text color={theme.fg.primary}> msgs:{hist.historyMessages}</Text>
          <Text color={theme.fg.muted}> win:{hist.window}m</Text>
        </>
      );
    }
    if (sf.variant.case === "heartbeat") {
      const hb = sf.variant.value;
      return (
        <>
          <Text color={theme.data.channel}> {rrName}</Text>
          <Text color={theme.fg.primary}> period:{hb.period}s</Text>
          {hb.secondary > 0 && <Text color={theme.fg.muted}> (secondary)</Text>}
        </>
      );
    }
    if (sf.variant.case === "text") {
      try {
        const text = new TextDecoder().decode(sf.variant.value).slice(0, 30);
        return (
          <>
            <Text color={theme.data.channel}> {rrName}</Text>
            <Text color={theme.data.quote}> "{text}"</Text>
          </>
        );
      } catch {
        return <Text color={theme.data.channel}> {rrName}</Text>;
      }
    }
    return rrName ? <Text color={theme.data.channel}> {rrName}</Text> : null;
  }

  // Neighbor info
  if (packet.portnum === Portnums.PortNum.NEIGHBORINFO_APP) {
    const ni = packet.payload as { neighbors?: unknown[] };
    if (ni.neighbors) {
      return <Text color={theme.data.hops}> {ni.neighbors.length} neighbors</Text>;
    }
    return null;
  }

  return null;
}

// Main packet row component

interface PacketRowProps {
  packet: DecodedPacket;
  nodeStore: NodeStore;
  isSelected: boolean;
}

function PacketRow({ packet, nodeStore, isSelected }: PacketRowProps) {
  const time = packet.timestamp.toLocaleTimeString("en-US", { hour12: false });
  const bgColor = isSelected ? theme.bg.selected : undefined;

  if (packet.decodeError) {
    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}] </Text>
          <Text color={theme.packet.encrypted}>ERROR </Text>
          <Text color={theme.fg.muted}>{packet.decodeError}</Text>
        </Text>
      </Box>
    );
  }

  const fr = packet.fromRadio;
  if (!fr) {
    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}] </Text>
          <Text color={theme.packet.unknown}>EMPTY</Text>
        </Text>
      </Box>
    );
  }

  const variantCase = fr.payloadVariant.case;

  if (variantCase === "packet" && packet.meshPacket) {
    const mp = packet.meshPacket;
    const fromName = nodeStore.getNodeName(mp.from);
    const toName = mp.to === 0xffffffff ? "^all" : nodeStore.getNodeName(mp.to);
    const portName = packet.portnum !== undefined
      ? Portnums.PortNum[packet.portnum]?.replace(/_APP$/, "") || `PORT_${packet.portnum}`
      : "ENCRYPTED";
    const color = getPortColor(packet.portnum);

    // Hop info (only show for received packets with valid hop data)
    const hops = mp.hopStart != null && mp.hopLimit != null && mp.hopStart > 0
      ? `(${mp.hopStart - mp.hopLimit}/${mp.hopStart})`
      : null;

    // For encrypted packets, show channel and length
    const encryptedInfo = packet.portnum === undefined && mp.payloadVariant.case === "encrypted"
      ? (() => {
          const encrypted = mp.payloadVariant.value as Uint8Array;
          return (
            <>
              <Text color={theme.fg.muted}> ch:{mp.channel}</Text>
              <Text color={theme.fg.muted}> {encrypted.length}B</Text>
            </>
          );
        })()
      : null;

    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}] </Text>
          <Text color={theme.data.arrow}>{"<"} </Text>
          <Text color={color}>{portName.padEnd(14)}</Text>
          <Text color={theme.data.nodeFrom}>{fromName.padEnd(10)}</Text>
          <Text color={theme.data.arrow}>{" -> "}</Text>
          <Text color={theme.data.nodeTo}>{toName.padEnd(10)}</Text>
          {hops && <Text color={theme.fg.muted}>{hops} </Text>}
          {encryptedInfo}
          {renderPacketSummary(packet, nodeStore)}
        </Text>
      </Box>
    );
  }

  if (variantCase === "nodeInfo") {
    const info = fr.payloadVariant.value as Mesh.NodeInfo;
    const shortName = info.user?.shortName || `!${info.num.toString(16)}`;
    const longName = info.user?.longName || "";
    const hw = info.user?.hwModel !== undefined && info.user?.hwModel !== 0
      ? Mesh.HardwareModel[info.user.hwModel] || ""
      : "";
    const id = formatNodeId(info.num);
    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}] </Text>
          <Text color={theme.data.arrow}>{"*"} </Text>
          <Text color={theme.packet.nodeinfo}>{"NODEINFO".padEnd(14)}</Text>
          <Text color={theme.data.nodeFrom}>{shortName.padEnd(6)}</Text>
          <Text color={theme.fg.muted}>{id} </Text>
          {longName && <Text color={theme.fg.primary}>{longName} </Text>}
          {hw && <Text color={theme.data.hardware}>| {hw}</Text>}
        </Text>
      </Box>
    );
  }

  if (variantCase === "myInfo") {
    const myInfo = fr.payloadVariant.value as Mesh.MyNodeInfo;
    const id = formatNodeId(myInfo.myNodeNum);
    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}] </Text>
          <Text color={theme.data.arrow}>{"*"} </Text>
          <Text color={theme.packet.direct}>{"MY_INFO".padEnd(14)}</Text>
          <Text color={theme.data.nodeFrom}>{id}</Text>
        </Text>
      </Box>
    );
  }

  if (variantCase === "config") {
    const config = fr.payloadVariant.value as Mesh.Config;
    const configType = config.payloadVariant.case || "unknown";
    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}] </Text>
          <Text color={theme.data.arrow}>{"*"} </Text>
          <Text color={theme.packet.config}>{"CONFIG".padEnd(14)}</Text>
          <Text color={theme.data.channel}>{configType}</Text>
        </Text>
      </Box>
    );
  }

  if (variantCase === "moduleConfig") {
    const config = fr.payloadVariant.value as Mesh.ModuleConfig;
    const configType = config.payloadVariant.case || "unknown";
    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}] </Text>
          <Text color={theme.data.arrow}>{"*"} </Text>
          <Text color={theme.packet.config}>{"MODULE_CONFIG".padEnd(14)}</Text>
          <Text color={theme.data.channel}>{configType}</Text>
        </Text>
      </Box>
    );
  }

  if (variantCase === "channel") {
    const channel = fr.payloadVariant.value as Mesh.Channel;
    const name = channel.settings?.name || `Channel ${channel.index}`;
    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}] </Text>
          <Text color={theme.data.arrow}>{"*"} </Text>
          <Text color={theme.packet.config}>{"CHANNEL".padEnd(14)}</Text>
          <Text color={theme.data.channel}>#{channel.index} </Text>
          <Text color={theme.fg.primary}>{name}</Text>
        </Text>
      </Box>
    );
  }

  if (variantCase === "configCompleteId") {
    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}] </Text>
          <Text color={theme.data.arrow}>{"*"} </Text>
          <Text color={theme.packet.direct}>{"CONFIG_COMPLETE".padEnd(14)}</Text>
        </Text>
      </Box>
    );
  }

  if (variantCase === "clientNotification") {
    const notif = fr.payloadVariant.value as { level?: number; message?: string };
    const levelColor = notif.level && notif.level >= 40 ? theme.packet.encrypted
      : notif.level && notif.level >= 30 ? theme.data.coords
      : theme.fg.primary;
    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}] </Text>
          <Text color={theme.data.arrow}>{"!"} </Text>
          <Text color={levelColor}>{"NOTIFICATION".padEnd(14)}</Text>
          <Text color={theme.fg.primary}>{notif.message || ""}</Text>
        </Text>
      </Box>
    );
  }

  if (variantCase) {
    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}] </Text>
          <Text color={theme.data.arrow}>{"*"} </Text>
          <Text color={theme.packet.unknown}>{variantCase.toUpperCase().padEnd(14)}</Text>
        </Text>
      </Box>
    );
  }

  return (
    <Box backgroundColor={bgColor}>
      <Text wrap="truncate">
        <Text color={theme.data.time}>[{time}] </Text>
        <Text color={theme.fg.secondary}>{"?"} </Text>
        <Text color={theme.packet.unknown}>{"UNKNOWN".padEnd(14)}</Text>
      </Text>
    </Box>
  );
}
