import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { DecodedPacket } from "../../protocol/decoder";
import type { NodeStore } from "../../protocol/node-store";
import { Mesh, Portnums, Telemetry, StoreForward, Channel, Config } from "@meshtastic/protobufs";
import { formatNodeId, getHardwareModelName } from "../../utils";
import { fitVisual } from "../../utils/string-width";

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
  useFahrenheit?: boolean;
  meshViewConfirmedIds?: Set<number>;
}

// Helper to convert and format temperature
function formatTemp(celsius: number, useFahrenheit: boolean): string {
  if (useFahrenheit) {
    return `${(celsius * 9/5 + 32).toFixed(1)}°F`;
  }
  return `${celsius.toFixed(1)}°C`;
}

// Column header for packet list
function PacketListHeader() {
  return (
    <Box>
      <Text wrap="truncate">
        <Text color={theme.fg.muted}>{"TIME".padEnd(12)}</Text>
        <Text color={theme.fg.muted}>  </Text>
        <Text color={theme.fg.muted}>{"PORT".padEnd(14)} </Text>
        <Text color={theme.fg.muted}>{"FROM".padEnd(10)}</Text>
        <Text color={theme.fg.muted}>{"    "}</Text>
        <Text color={theme.fg.muted}>{"TO".padEnd(10)}</Text>
        <Text color={theme.fg.muted}>{"HOPS".padEnd(7)}</Text>
        <Text color={theme.fg.muted}>DATA</Text>
      </Text>
    </Box>
  );
}

export function PacketList({ packets, selectedIndex, nodeStore, height = 20, isFollowing, useFahrenheit = false, meshViewConfirmedIds }: PacketListProps) {
  // Account for LIVE indicator and header taking rows
  const visibleCount = Math.max(1, height - 3 - (isFollowing ? 1 : 0));

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
        <Box justifyContent="center">
          <LiveIndicator />
        </Box>
      )}
      <PacketListHeader />
      {visiblePackets.map((packet, i) => {
        const actualIndex = startIndex + i;
        const isSelected = actualIndex === selectedIndex;
        return (
          <PacketRow
            key={`${packet.id}-${actualIndex}`}
            packet={packet}
            nodeStore={nodeStore}
            isSelected={isSelected}
            useFahrenheit={useFahrenheit}
            meshViewConfirmedIds={meshViewConfirmedIds}
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

function renderPacketSummary(packet: DecodedPacket, nodeStore: NodeStore, useFahrenheit: boolean): React.ReactNode {
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
          <Text color={theme.data.hardware}> | {getHardwareModelName(user.hwModel)}</Text>
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
    if (telem.variant.case === "environmentMetrics") {
      const em = telem.variant.value as Telemetry.EnvironmentMetrics;
      return (
        <>
          {em.temperature != null && <Text color={theme.data.coords}> {formatTemp(em.temperature, useFahrenheit)}</Text>}
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

  // Neighbor info - show count and first few neighbor names
  if (packet.portnum === Portnums.PortNum.NEIGHBORINFO_APP) {
    const ni = packet.payload as { neighbors?: { nodeId?: number; snr?: number }[] };
    if (ni.neighbors && ni.neighbors.length > 0) {
      const first3 = ni.neighbors.slice(0, 3).map(n => n.nodeId ? nodeStore.getNodeName(n.nodeId) : "?");
      const more = ni.neighbors.length > 3 ? `+${ni.neighbors.length - 3}` : "";
      return (
        <>
          <Text color={theme.data.hops}> {ni.neighbors.length}:</Text>
          <Text color={theme.fg.primary}> {first3.join(", ")}</Text>
          {more && <Text color={theme.fg.muted}> {more}</Text>}
        </>
      );
    }
    return <Text color={theme.fg.muted}> 0 neighbors</Text>;
  }

  return null;
}

// Main packet row component

interface PacketRowProps {
  packet: DecodedPacket;
  nodeStore: NodeStore;
  isSelected: boolean;
  useFahrenheit: boolean;
  meshViewConfirmedIds?: Set<number>;
}

function PacketRow({ packet, nodeStore, isSelected, useFahrenheit, meshViewConfirmedIds }: PacketRowProps) {
  const time = packet.timestamp.toLocaleTimeString("en-US", { hour12: false });
  const bgColor = isSelected ? theme.bg.selected : undefined;
  const isConfirmedByMeshView = packet.meshPacket?.id && meshViewConfirmedIds?.has(packet.meshPacket.id);

  if (packet.decodeError) {
    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}]  </Text>
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
          <Text color={theme.data.time}>[{time}]  </Text>
          <Text color={theme.packet.unknown}>EMPTY</Text>
        </Text>
      </Box>
    );
  }

  const variantCase = fr.payloadVariant.case;

  if (variantCase === "packet" && packet.meshPacket) {
    const mp = packet.meshPacket;
    const fromName = nodeStore.getNodeName(mp.from);
    const toName = mp.to === 0xffffffff ? "^all"
      : mp.to === 1 ? "^mqtt" // NODENUM_BROADCAST_NO_LORA - non-LoRa broadcast (MQTT/BLE)
      : nodeStore.getNodeName(mp.to);
    const portName = packet.portnum !== undefined
      ? Portnums.PortNum[packet.portnum]?.replace(/_APP$/, "") || `PORT_${packet.portnum}`
      : "ENCRYPTED";
    const color = getPortColor(packet.portnum);

    // Hop info (only show for received packets with valid hop data)
    // Fixed width column (7 chars) for alignment
    const hops = mp.hopStart != null && mp.hopLimit != null && mp.hopStart > 0
      ? `${mp.hopStart - mp.hopLimit}/${mp.hopStart}`.padEnd(7)
      : "       ";

    // For encrypted packets, show channel and length
    const encryptedInfo = packet.portnum === undefined && mp.payloadVariant.case === "encrypted"
      ? (() => {
          const encrypted = mp.payloadVariant.value as Uint8Array;
          return (
            <>
              <Text color={theme.data.channel}>ch:{mp.channel}</Text>
              <Text color={theme.fg.secondary}> {encrypted.length}B</Text>
            </>
          );
        })()
      : null;

    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}]  </Text>
          <Text color={theme.data.arrow}>{"<"} </Text>
          <Text color={color}>{portName.padEnd(14)} </Text>
          <Text color={theme.data.nodeFrom}>{fitVisual(fromName, 10)}</Text>
          <Text color={theme.data.arrow}>{" -> "}</Text>
          <Text color={theme.data.nodeTo}>{fitVisual(toName, 10)}</Text>
          <Text color={theme.fg.muted}>{hops}</Text>
          {encryptedInfo}
          {renderPacketSummary(packet, nodeStore, useFahrenheit)}
          {isConfirmedByMeshView && <Text color={theme.fg.muted}> [M]</Text>}
        </Text>
      </Box>
    );
  }

  if (variantCase === "nodeInfo") {
    const info = fr.payloadVariant.value as Mesh.NodeInfo;
    const shortName = info.user?.shortName || `!${info.num.toString(16)}`;
    const longName = info.user?.longName || "";
    const hw = info.user?.hwModel !== undefined && info.user?.hwModel !== 0
      ? getHardwareModelName(info.user.hwModel)
      : "";
    const id = formatNodeId(info.num);
    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}]  </Text>
          <Text color={theme.data.arrow}>{"*"} </Text>
          <Text color={theme.packet.nodeinfo}>{"NODEINFO".padEnd(14)} </Text>
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
          <Text color={theme.data.time}>[{time}]  </Text>
          <Text color={theme.data.arrow}>{"*"} </Text>
          <Text color={theme.packet.direct}>{"MY_INFO".padEnd(14)} </Text>
          <Text color={theme.data.nodeFrom}>{id}</Text>
          {myInfo.rebootCount > 0 && <Text color={theme.fg.muted}> reboots:{myInfo.rebootCount}</Text>}
          {myInfo.pioEnv && <Text color={theme.data.hardware}> | {myInfo.pioEnv}</Text>}
        </Text>
      </Box>
    );
  }

  if (variantCase === "config") {
    const config = fr.payloadVariant.value as Mesh.Config;
    const configType = config.payloadVariant.case || "unknown";
    const configValue = config.payloadVariant.value as Record<string, unknown> | undefined;
    let configSummary = "";
    if (configValue) {
      if (configType === "device" && "role" in configValue && configValue.role != null) {
        const role = Config.Config_DeviceConfig_Role[configValue.role as number] || configValue.role;
        configSummary = ` role:${role}`;
      } else if (configType === "lora" && "region" in configValue && configValue.region != null) {
        const region = Config.Config_LoRaConfig_RegionCode[configValue.region as number] || configValue.region;
        configSummary = ` region:${region}`;
      } else if (configType === "display" && "screenOnSecs" in configValue) {
        configSummary = ` screen:${configValue.screenOnSecs}s`;
      } else if (configType === "power" && "lsSecs" in configValue) {
        configSummary = ` ls:${configValue.lsSecs}s`;
      } else if (configType === "position" && "gpsEnabled" in configValue) {
        configSummary = ` gps:${configValue.gpsEnabled ? "on" : "off"}`;
      }
    }
    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}]  </Text>
          <Text color={theme.data.arrow}>{"*"} </Text>
          <Text color={theme.packet.config}>{"CONFIG".padEnd(14)} </Text>
          <Text color={theme.data.channel}>{configType}</Text>
          <Text color={theme.fg.muted}>{configSummary}</Text>
        </Text>
      </Box>
    );
  }

  if (variantCase === "moduleConfig") {
    const config = fr.payloadVariant.value as Mesh.ModuleConfig;
    const configType = config.payloadVariant.case || "unknown";
    const moduleValue = config.payloadVariant.value as Record<string, unknown> | undefined;
    let moduleSummary = "";
    if (moduleValue && "enabled" in moduleValue) {
      moduleSummary = moduleValue.enabled ? " [enabled]" : " [disabled]";
    }
    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}]  </Text>
          <Text color={theme.data.arrow}>{"*"} </Text>
          <Text color={theme.packet.config}>{"MODULE_CONFIG".padEnd(14)} </Text>
          <Text color={theme.data.channel}>{configType}</Text>
          <Text color={moduleSummary.includes("enabled") ? theme.status.online : theme.fg.muted}>{moduleSummary}</Text>
        </Text>
      </Box>
    );
  }

  if (variantCase === "channel") {
    const channel = fr.payloadVariant.value as Mesh.Channel;
    const name = channel.settings?.name || "(default)";
    const role = Channel.Channel_Role[channel.role] || "DISABLED";
    const pskLen = channel.settings?.psk?.length || 0;
    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}]  </Text>
          <Text color={theme.data.arrow}>{"*"} </Text>
          <Text color={theme.packet.config}>{"CHANNEL".padEnd(14)} </Text>
          <Text color={theme.data.channel}>#{channel.index} </Text>
          <Text color={theme.fg.primary}>{name} </Text>
          <Text color={role === "PRIMARY" ? theme.status.online : role === "DISABLED" ? theme.fg.muted : theme.fg.secondary}>{role}</Text>
          {pskLen > 0 && <Text color={theme.fg.muted}> psk:{pskLen}B</Text>}
        </Text>
      </Box>
    );
  }

  if (variantCase === "configCompleteId") {
    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}]  </Text>
          <Text color={theme.data.arrow}>{"*"} </Text>
          <Text color={theme.packet.direct}>{"CONFIG_COMPLETE".padEnd(14)} </Text>
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
          <Text color={theme.data.time}>[{time}]  </Text>
          <Text color={theme.data.arrow}>{"!"} </Text>
          <Text color={levelColor}>{"NOTIFICATION".padEnd(14)} </Text>
          <Text color={theme.fg.primary}>{notif.message || ""}</Text>
        </Text>
      </Box>
    );
  }

  if (variantCase === "metadata") {
    const meta = fr.payloadVariant.value as Mesh.DeviceMetadata;
    const hw = meta.hwModel !== undefined ? getHardwareModelName(meta.hwModel) : "";
    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}]  </Text>
          <Text color={theme.data.arrow}>{"*"} </Text>
          <Text color={theme.packet.telemetry}>{"METADATA".padEnd(14)} </Text>
          <Text color={theme.fg.primary}>{meta.firmwareVersion || "?"}</Text>
          {hw && <Text color={theme.data.hardware}> | {hw}</Text>}
          {meta.hasPKC && <Text color={theme.status.online}> PKC</Text>}
        </Text>
      </Box>
    );
  }

  if (variantCase === "deviceuiConfig") {
    const ui = fr.payloadVariant.value as { screenBrightness?: number; screenTimeout?: number; theme?: number };
    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}]  </Text>
          <Text color={theme.data.arrow}>{"*"} </Text>
          <Text color={theme.packet.config}>{"DEVICE_UI".padEnd(14)} </Text>
          {ui.screenBrightness !== undefined && <Text color={theme.fg.primary}>bright:{ui.screenBrightness} </Text>}
          {ui.screenTimeout !== undefined && <Text color={theme.fg.muted}>timeout:{ui.screenTimeout}s</Text>}
        </Text>
      </Box>
    );
  }

  if (variantCase === "fileInfo") {
    const file = fr.payloadVariant.value as { fileName?: string; sizeBytes?: number };
    const name = file.fileName?.split("/").pop() || file.fileName || "?";
    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}]  </Text>
          <Text color={theme.data.arrow}>{"*"} </Text>
          <Text color={theme.packet.config}>{"FILE_INFO".padEnd(14)} </Text>
          <Text color={theme.fg.primary}>{name}</Text>
          {file.sizeBytes !== undefined && <Text color={theme.fg.muted}> {file.sizeBytes}B</Text>}
        </Text>
      </Box>
    );
  }

  if (variantCase === "queueStatus") {
    const qs = fr.payloadVariant.value as { free?: number; maxlen?: number; res?: number };
    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}]  </Text>
          <Text color={theme.data.arrow}>{"*"} </Text>
          <Text color={theme.packet.routing}>{"QUEUE_STATUS".padEnd(14)} </Text>
          <Text color={theme.fg.primary}>{qs.free ?? "?"}/{qs.maxlen ?? "?"} free</Text>
          {qs.res !== undefined && qs.res !== 0 && <Text color={theme.packet.encrypted}> res:{qs.res}</Text>}
        </Text>
      </Box>
    );
  }

  if (variantCase) {
    return (
      <Box backgroundColor={bgColor}>
        <Text wrap="truncate">
          <Text color={theme.data.time}>[{time}]  </Text>
          <Text color={theme.data.arrow}>{"*"} </Text>
          <Text color={theme.packet.unknown}>{variantCase.toUpperCase().padEnd(14)} </Text>
        </Text>
      </Box>
    );
  }

  return (
    <Box backgroundColor={bgColor}>
      <Text wrap="truncate">
        <Text color={theme.data.time}>[{time}]  </Text>
        <Text color={theme.fg.secondary}>{"?"} </Text>
        <Text color={theme.packet.unknown}>{"UNKNOWN".padEnd(14)} </Text>
      </Text>
    </Box>
  );
}
