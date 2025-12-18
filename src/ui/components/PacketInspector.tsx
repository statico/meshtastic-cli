import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { DecodedPacket } from "../../protocol/decoder";
import type { NodeStore } from "../../protocol/node-store";
import { bruteForceDecrypt, portnumToString, type DecryptResult, type BruteForceProgress } from "../../protocol/crypto";
import { Mesh, Portnums, Channel, Telemetry, Config } from "@meshtastic/protobufs";
import { formatNodeId } from "../../utils/hex";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// Escape non-printable characters for display
function escapeNonPrintable(data: Uint8Array): string {
  const chars: string[] = [];
  for (const b of data) {
    if (b >= 32 && b < 127) {
      chars.push(String.fromCharCode(b));
    } else if (b === 10) {
      chars.push("\\n");
    } else if (b === 13) {
      chars.push("\\r");
    } else if (b === 9) {
      chars.push("\\t");
    } else {
      chars.push(`\\x${b.toString(16).padStart(2, "0")}`);
    }
  }
  return chars.join("");
}

export type InspectorTab = "info" | "json" | "hex";

interface PacketInspectorProps {
  packet?: DecodedPacket;
  activeTab: InspectorTab;
  height?: number;
  nodeStore: NodeStore;
  scrollOffset?: number;
  bruteForceDepth?: number;
  meshViewUrl?: string;
}

type BruteForceStatus = "idle" | "running" | "found" | "not_found";

interface BruteForceState {
  status: BruteForceStatus;
  progress: BruteForceProgress | null;
  result: DecryptResult | null;
}

export function PacketInspector({ packet, activeTab, height = 12, nodeStore, scrollOffset = 0, bruteForceDepth = 2, meshViewUrl }: PacketInspectorProps) {
  const [bruteForce, setBruteForce] = useState<BruteForceState>({
    status: "idle",
    progress: null,
    result: null,
  });
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const lastPacketIdRef = useRef<number | null>(null);

  // Spinner animation
  useEffect(() => {
    if (bruteForce.status !== "running") return;
    const interval = setInterval(() => {
      setSpinnerFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, [bruteForce.status]);

  // Start brute force when encrypted packet is selected
  useEffect(() => {
    const mp = packet?.meshPacket;
    const isEncrypted = mp?.payloadVariant.case === "encrypted";
    const packetId = mp?.id;

    // Cancel any running brute force
    cancelRef.current.cancelled = true;

    // Reset state if packet changed or not encrypted
    if (!isEncrypted || !mp || bruteForceDepth <= 0) {
      setBruteForce({ status: "idle", progress: null, result: null });
      lastPacketIdRef.current = null;
      return;
    }

    // Don't restart if same packet
    if (packetId === lastPacketIdRef.current) return;
    lastPacketIdRef.current = packetId ?? null;

    // Start brute force
    const encrypted = mp.payloadVariant.value as Uint8Array;
    const signal = { cancelled: false };
    cancelRef.current = signal;

    setBruteForce({ status: "running", progress: null, result: null });

    bruteForceDecrypt({
      encrypted,
      packetId: mp.id,
      fromNode: mp.from,
      depth: bruteForceDepth,
      signal,
      chunkSize: 500,
      onProgress: (progress) => {
        if (!signal.cancelled) {
          setBruteForce((s) => ({ ...s, progress }));
        }
      },
    }).then((result) => {
      if (signal.cancelled) return;
      if (result) {
        setBruteForce({ status: "found", progress: null, result });
      } else {
        setBruteForce({ status: "not_found", progress: null, result: null });
      }
    }).catch(() => {
      if (!signal.cancelled) {
        setBruteForce({ status: "not_found", progress: null, result: null });
      }
    });

    return () => {
      signal.cancelled = true;
    };
  }, [packet?.id, packet?.meshPacket?.id, bruteForceDepth, activeTab]);

  // Cancel brute force when tab changes away from info
  useEffect(() => {
    if (activeTab !== "info") {
      cancelRef.current.cancelled = true;
    }
  }, [activeTab]);

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
      {activeTab === "info" && (
        <InfoView
          packet={packet}
          nodeStore={nodeStore}
          height={height - 2}
          scrollOffset={scrollOffset}
          bruteForce={bruteForce}
          spinnerFrame={spinnerFrame}
          meshViewUrl={meshViewUrl}
        />
      )}
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
function InfoView({ packet, nodeStore, height, scrollOffset, bruteForce, spinnerFrame, meshViewUrl }: {
  packet: DecodedPacket;
  nodeStore: NodeStore;
  height: number;
  scrollOffset: number;
  bruteForce?: BruteForceState;
  spinnerFrame?: number;
  meshViewUrl?: string;
}) {
  const mp = packet.meshPacket;
  const fr = packet.fromRadio;
  const lines: React.ReactNode[] = [];

  // Header line with global packet ID
  const globalId = mp?.id;
  lines.push(
    <Box key="header">
      <Text color={theme.fg.muted}>Time: </Text>
      <Text color={theme.fg.primary}>{packet.timestamp.toLocaleTimeString()}</Text>
      {globalId !== undefined && globalId !== 0 && (
        <>
          <Text color={theme.fg.muted}>  Packet ID: </Text>
          <Text color={theme.data.channel}>{globalId}</Text>
        </>
      )}
    </Box>
  );

  // MeshView link if configured and we have a global ID
  if (meshViewUrl && globalId && globalId !== 0) {
    lines.push(
      <Box key="meshview">
        <Text color={theme.fg.muted}>MeshView: </Text>
        <Text color={theme.fg.accent}>{meshViewUrl}/packet/{globalId}</Text>
      </Box>
    );
  }

  // MeshPacket info
  if (mp) {
    const fromName = nodeStore.getNodeName(mp.from);
    const isBroadcast = mp.to === 0xffffffff;
    const isMqttBroadcast = mp.to === 1; // NODENUM_BROADCAST_NO_LORA
    const toName = isBroadcast ? "BROADCAST"
      : isMqttBroadcast ? "MQTT_BROADCAST"
      : nodeStore.getNodeName(mp.to);

    lines.push(
      <Box key="from-to">
        <Text color={theme.fg.muted}>From: </Text>
        <Text color={theme.fg.accent}>{fromName}</Text>
        <Text color={theme.fg.muted}> ({formatNodeId(mp.from)})</Text>
        <Text color={theme.fg.muted}>  To: </Text>
        <Text color={theme.fg.primary}>{toName}</Text>
        {!isBroadcast && !isMqttBroadcast && <Text color={theme.fg.muted}> ({formatNodeId(mp.to)})</Text>}
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
    } else if (mp.payloadVariant.case === "encrypted") {
      const encrypted = mp.payloadVariant.value as Uint8Array;
      const hex = Array.from(encrypted, (b) => b.toString(16).padStart(2, "0")).join("");
      lines.push(
        <Box key="encrypted-label">
          <Text color={theme.fg.muted}>Encrypted: </Text>
          <Text color={theme.fg.secondary}>{encrypted.length} bytes</Text>
        </Box>
      );
      lines.push(
        <Box key="encrypted-data">
          <Text color={theme.fg.muted}>Data: </Text>
          <Text color={theme.packet.encrypted}>0x{hex}</Text>
        </Box>
      );

      // Brute force status
      if (bruteForce?.status === "running") {
        const progress = bruteForce.progress;
        const pct = progress ? ((progress.current / progress.total) * 100).toFixed(1) : "0";
        const kps = progress?.keysPerSecond ?? 0;
        lines.push(
          <Box key="bf-progress">
            <Text color={theme.fg.accent}>{SPINNER_FRAMES[spinnerFrame ?? 0]} </Text>
            <Text color={theme.fg.muted}>Brute forcing: </Text>
            <Text color={theme.fg.primary}>{pct}%</Text>
            <Text color={theme.fg.muted}> ({kps.toLocaleString()} keys/s)</Text>
          </Box>
        );
      } else if (bruteForce?.status === "found" && bruteForce.result) {
        const r = bruteForce.result;
        const confidenceHint = r.confidence === "high"
          ? "protobuf+known port"
          : r.confidence === "medium"
          ? "valid structure"
          : "plausible";
        lines.push(<Box key="bf-sep" height={1} />);
        lines.push(
          <Box key="bf-found">
            <Text color={theme.packet.direct}>✓ DECRYPTED </Text>
            <Text color={theme.fg.muted}>key=</Text>
            <Text color={theme.fg.accent}>{r.keyHex}</Text>
            <Text color={theme.fg.muted}> confidence=</Text>
            <Text color={r.confidence === "high" ? theme.packet.direct : r.confidence === "medium" ? theme.data.coords : theme.fg.muted}>
              {r.confidence}
            </Text>
            <Text color={theme.fg.muted}> ({confidenceHint})</Text>
          </Box>
        );
        if (r.portnum !== undefined) {
          lines.push(
            <Box key="bf-port">
              <Text color={theme.fg.muted}>Port: </Text>
              <Text color={theme.fg.primary}>{portnumToString(r.portnum)}</Text>
            </Box>
          );
        }
        // Always show decrypted content with escaped non-printables
        const escaped = escapeNonPrintable(r.decrypted);
        lines.push(
          <Box key="bf-decrypted">
            <Text color={theme.fg.muted}>Decrypted: </Text>
            <Text color={theme.packet.message}>{escaped}</Text>
          </Box>
        );
      } else if (bruteForce?.status === "not_found") {
        lines.push(
          <Box key="bf-notfound">
            <Text color={theme.fg.muted}>Brute force: </Text>
            <Text color={theme.packet.encrypted}>no simple key found</Text>
          </Box>
        );
      }
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

  // Waypoint
  if (packet.portnum === Portnums.PortNum.WAYPOINT_APP) {
    const wp = packet.payload as {
      id?: number;
      name?: string;
      description?: string;
      latitudeI?: number;
      longitudeI?: number;
      expire?: number;
      icon?: number;
      lockedTo?: number;
    };
    if (wp.name) {
      lines.push(
        <Box key="wp-name">
          <Text color={theme.fg.muted}>Waypoint: </Text>
          <Text color={theme.fg.accent} bold>{wp.name}</Text>
        </Box>
      );
    }
    if (wp.description) {
      lines.push(
        <Box key="wp-desc">
          <Text color={theme.fg.muted}>Description: </Text>
          <Text color={theme.fg.primary}>{wp.description}</Text>
        </Box>
      );
    }
    if (wp.latitudeI != null && wp.longitudeI != null) {
      const lat = wp.latitudeI / 1e7;
      const lon = wp.longitudeI / 1e7;
      lines.push(
        <Box key="wp-pos">
          <Text color={theme.fg.muted}>Position: </Text>
          <Text color={theme.data.coords}>{lat.toFixed(6)}, {lon.toFixed(6)}</Text>
        </Box>
      );
    }
    if (wp.expire) {
      const expireDate = new Date(wp.expire * 1000);
      lines.push(
        <Box key="wp-expire">
          <Text color={theme.fg.muted}>Expires: </Text>
          <Text color={theme.fg.secondary}>{expireDate.toLocaleString()}</Text>
        </Box>
      );
    }
    if (wp.icon) {
      lines.push(
        <Box key="wp-icon">
          <Text color={theme.fg.muted}>Icon: </Text>
          <Text color={theme.fg.primary}>{wp.icon}</Text>
        </Box>
      );
    }
    return lines.length > 0 ? lines : null;
  }

  // Neighbor info
  if (packet.portnum === Portnums.PortNum.NEIGHBORINFO_APP) {
    const ni = packet.payload as { nodeId?: number; neighbors?: { nodeId?: number; snr?: number }[] };
    if (ni.nodeId) {
      lines.push(
        <Box key="ni-from">
          <Text color={theme.fg.muted}>From Node: </Text>
          <Text color={theme.fg.accent}>{nodeStore.getNodeName(ni.nodeId)}</Text>
          <Text color={theme.fg.muted}> ({formatNodeId(ni.nodeId)})</Text>
        </Box>
      );
    }
    if (ni.neighbors && ni.neighbors.length > 0) {
      lines.push(
        <Box key="ni-count">
          <Text color={theme.fg.muted}>Neighbors: </Text>
          <Text color={theme.fg.primary}>{ni.neighbors.length}</Text>
        </Box>
      );
      ni.neighbors.slice(0, 8).forEach((n, i) => {
        const name = n.nodeId ? nodeStore.getNodeName(n.nodeId) : "?";
        const id = n.nodeId ? formatNodeId(n.nodeId) : "";
        lines.push(
          <Box key={`ni-${i}`}>
            <Text color={theme.fg.muted}>  • </Text>
            <Text color={theme.fg.accent}>{name}</Text>
            {id && <Text color={theme.fg.muted}> ({id})</Text>}
            {n.snr != null && <Text color={theme.fg.secondary}> SNR: {(n.snr / 4).toFixed(1)}dB</Text>}
          </Box>
        );
      });
      if (ni.neighbors.length > 8) {
        lines.push(
          <Box key="ni-more">
            <Text color={theme.fg.muted}>  ... and {ni.neighbors.length - 8} more</Text>
          </Box>
        );
      }
    } else {
      lines.push(
        <Box key="ni-empty">
          <Text color={theme.fg.muted}>No neighbors reported</Text>
        </Box>
      );
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
          {info.rebootCount > 0 && (
            <>
              <Text color={theme.fg.muted}>  Reboots: </Text>
              <Text color={theme.fg.secondary}>{info.rebootCount}</Text>
            </>
          )}
        </Box>
      );
      if (info.pioEnv) {
        lines.push(
          <Box key="pio">
            <Text color={theme.fg.muted}>Platform: </Text>
            <Text color={theme.fg.accent}>{info.pioEnv}</Text>
          </Box>
        );
      }
      if (info.minAppVersion) {
        lines.push(
          <Box key="app">
            <Text color={theme.fg.muted}>Min App: </Text>
            <Text color={theme.fg.secondary}>{info.minAppVersion}</Text>
          </Box>
        );
      }
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
      const configValue = config.payloadVariant.value as Record<string, unknown> | undefined;
      lines.push(
        <Box key="type">
          <Text color={theme.fg.muted}>Type: </Text>
          <Text color={theme.packet.config}>CONFIG</Text>
          <Text color={theme.fg.muted}>  Section: </Text>
          <Text color={theme.fg.accent}>{configCase}</Text>
        </Box>
      );
      // Show key settings for each config type
      if (configValue) {
        if (configCase === "device") {
          const role = configValue.role !== undefined
            ? Config.Config_DeviceConfig_Role[configValue.role as number] || configValue.role
            : "?";
          lines.push(
            <Box key="device">
              <Text color={theme.fg.muted}>Role: </Text>
              <Text color={theme.fg.primary}>{role}</Text>
              {"serialEnabled" in configValue && (
                <>
                  <Text color={theme.fg.muted}>  Serial: </Text>
                  <Text color={configValue.serialEnabled ? theme.status.online : theme.fg.muted}>
                    {configValue.serialEnabled ? "on" : "off"}
                  </Text>
                </>
              )}
            </Box>
          );
        } else if (configCase === "lora") {
          const region = configValue.region !== undefined
            ? Config.Config_LoRaConfig_RegionCode[configValue.region as number] || configValue.region
            : "?";
          lines.push(
            <Box key="lora">
              <Text color={theme.fg.muted}>Region: </Text>
              <Text color={theme.fg.primary}>{region}</Text>
              {"hopLimit" in configValue && (
                <>
                  <Text color={theme.fg.muted}>  Hops: </Text>
                  <Text color={theme.fg.secondary}>{configValue.hopLimit as number}</Text>
                </>
              )}
              {"txPower" in configValue && (
                <>
                  <Text color={theme.fg.muted}>  TX: </Text>
                  <Text color={theme.fg.secondary}>{configValue.txPower as number}dBm</Text>
                </>
              )}
            </Box>
          );
        } else if (configCase === "display") {
          lines.push(
            <Box key="display">
              {"screenOnSecs" in configValue && (
                <>
                  <Text color={theme.fg.muted}>Screen: </Text>
                  <Text color={theme.fg.primary}>{configValue.screenOnSecs as number}s</Text>
                </>
              )}
              {"gpsFormat" in configValue && (
                <>
                  <Text color={theme.fg.muted}>  GPS: </Text>
                  <Text color={theme.fg.secondary}>{configValue.gpsFormat as number}</Text>
                </>
              )}
            </Box>
          );
        } else if (configCase === "position") {
          lines.push(
            <Box key="position">
              <Text color={theme.fg.muted}>GPS: </Text>
              <Text color={configValue.gpsEnabled ? theme.status.online : theme.fg.muted}>
                {configValue.gpsEnabled ? "enabled" : "disabled"}
              </Text>
              {"fixedPosition" in configValue && configValue.fixedPosition ? (
                <Text color={theme.fg.secondary}> [fixed]</Text>
              ) : null}
            </Box>
          );
        }
      }
      break;
    }

    case "moduleConfig": {
      const config = variant.value as Mesh.ModuleConfig;
      const configCase = config.payloadVariant.case || "unknown";
      const moduleValue = config.payloadVariant.value as Record<string, unknown> | undefined;
      const isEnabled = moduleValue && "enabled" in moduleValue ? moduleValue.enabled : undefined;
      lines.push(
        <Box key="type">
          <Text color={theme.fg.muted}>Type: </Text>
          <Text color={theme.packet.config}>MODULE_CONFIG</Text>
          <Text color={theme.fg.muted}>  Module: </Text>
          <Text color={theme.fg.accent}>{configCase}</Text>
        </Box>
      );
      if (isEnabled !== undefined) {
        lines.push(
          <Box key="enabled">
            <Text color={theme.fg.muted}>Status: </Text>
            <Text color={isEnabled ? theme.status.online : theme.fg.muted}>
              {isEnabled ? "ENABLED" : "DISABLED"}
            </Text>
          </Box>
        );
      }
      // Show module-specific settings
      if (moduleValue) {
        if (configCase === "mqtt" && isEnabled) {
          lines.push(
            <Box key="mqtt">
              {"address" in moduleValue && moduleValue.address ? (
                <>
                  <Text color={theme.fg.muted}>Server: </Text>
                  <Text color={theme.fg.primary}>{moduleValue.address as string}</Text>
                </>
              ) : null}
            </Box>
          );
        } else if (configCase === "serial" && isEnabled) {
          lines.push(
            <Box key="serial">
              {"baud" in moduleValue && (
                <>
                  <Text color={theme.fg.muted}>Baud: </Text>
                  <Text color={theme.fg.primary}>{moduleValue.baud as number}</Text>
                </>
              )}
            </Box>
          );
        } else if (configCase === "telemetry") {
          lines.push(
            <Box key="telem">
              {"deviceUpdateInterval" in moduleValue && (
                <>
                  <Text color={theme.fg.muted}>Device interval: </Text>
                  <Text color={theme.fg.primary}>{moduleValue.deviceUpdateInterval as number}s</Text>
                </>
              )}
            </Box>
          );
        }
      }
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
      const hw = meta.hwModel !== undefined ? Mesh.HardwareModel[meta.hwModel] || `Model_${meta.hwModel}` : null;
      lines.push(
        <Box key="type">
          <Text color={theme.fg.muted}>Type: </Text>
          <Text color={theme.packet.telemetry}>METADATA</Text>
        </Box>
      );
      lines.push(
        <Box key="fw">
          <Text color={theme.fg.muted}>Firmware: </Text>
          <Text color={theme.fg.primary}>{meta.firmwareVersion || "?"}</Text>
          {meta.deviceStateVersion !== undefined && (
            <>
              <Text color={theme.fg.muted}>  State: </Text>
              <Text color={theme.fg.secondary}>v{meta.deviceStateVersion}</Text>
            </>
          )}
        </Box>
      );
      if (hw) {
        lines.push(
          <Box key="hw">
            <Text color={theme.fg.muted}>Hardware: </Text>
            <Text color={theme.fg.accent}>{hw}</Text>
          </Box>
        );
      }
      const caps: string[] = [];
      if (meta.hasWifi) caps.push("WiFi");
      if (meta.hasBluetooth) caps.push("BT");
      if (meta.hasEthernet) caps.push("Eth");
      if (meta.hasPKC) caps.push("PKC");
      if (meta.canShutdown) caps.push("Shutdown");
      if (caps.length > 0) {
        lines.push(
          <Box key="caps">
            <Text color={theme.fg.muted}>Capabilities: </Text>
            <Text color={theme.fg.secondary}>{caps.join(", ")}</Text>
          </Box>
        );
      }
      break;
    }

    case "clientNotification": {
      const notif = variant.value as { level?: number; message?: string; time?: number };
      const levelNames: Record<number, string> = { 10: "DEBUG", 20: "INFO", 30: "WARNING", 40: "ERROR", 50: "CRITICAL" };
      const levelName = notif.level ? levelNames[notif.level] || `LEVEL_${notif.level}` : "UNKNOWN";
      const levelColor = notif.level && notif.level >= 40 ? theme.packet.encrypted
        : notif.level && notif.level >= 30 ? theme.data.coords
        : theme.fg.primary;
      lines.push(
        <Box key="type">
          <Text color={theme.fg.muted}>Type: </Text>
          <Text color={levelColor}>CLIENT_NOTIFICATION</Text>
        </Box>
      );
      lines.push(
        <Box key="level">
          <Text color={theme.fg.muted}>Level: </Text>
          <Text color={levelColor}>{levelName}</Text>
          {notif.time && (
            <>
              <Text color={theme.fg.muted}>  Time: </Text>
              <Text color={theme.fg.secondary}>{new Date(notif.time * 1000).toLocaleTimeString()}</Text>
            </>
          )}
        </Box>
      );
      if (notif.message) {
        lines.push(
          <Box key="msg">
            <Text color={theme.fg.muted}>Message: </Text>
            <Text color={theme.fg.primary}>{notif.message}</Text>
          </Box>
        );
      }
      break;
    }

    case "deviceuiConfig": {
      const ui = variant.value as {
        screenBrightness?: number;
        screenTimeout?: number;
        screenLock?: boolean;
        theme?: number;
        language?: number;
        alertEnabled?: boolean;
        bannerEnabled?: boolean;
      };
      lines.push(
        <Box key="type">
          <Text color={theme.fg.muted}>Type: </Text>
          <Text color={theme.packet.config}>DEVICE_UI_CONFIG</Text>
        </Box>
      );
      lines.push(
        <Box key="screen">
          <Text color={theme.fg.muted}>Screen: </Text>
          <Text color={theme.fg.primary}>brightness={ui.screenBrightness ?? "?"}</Text>
          <Text color={theme.fg.muted}>  timeout=</Text>
          <Text color={theme.fg.primary}>{ui.screenTimeout ?? "?"}s</Text>
          {ui.screenLock && <Text color={theme.fg.secondary}> [locked]</Text>}
        </Box>
      );
      lines.push(
        <Box key="features">
          <Text color={theme.fg.muted}>Features: </Text>
          <Text color={ui.alertEnabled ? theme.status.online : theme.fg.muted}>
            alerts:{ui.alertEnabled ? "on" : "off"}
          </Text>
          <Text color={theme.fg.muted}>  </Text>
          <Text color={ui.bannerEnabled ? theme.status.online : theme.fg.muted}>
            banner:{ui.bannerEnabled ? "on" : "off"}
          </Text>
        </Box>
      );
      break;
    }

    case "fileInfo": {
      const file = variant.value as { fileName?: string; sizeBytes?: number };
      lines.push(
        <Box key="type">
          <Text color={theme.fg.muted}>Type: </Text>
          <Text color={theme.packet.config}>FILE_INFO</Text>
        </Box>
      );
      lines.push(
        <Box key="file">
          <Text color={theme.fg.muted}>File: </Text>
          <Text color={theme.fg.primary}>{file.fileName || "?"}</Text>
        </Box>
      );
      lines.push(
        <Box key="size">
          <Text color={theme.fg.muted}>Size: </Text>
          <Text color={theme.fg.secondary}>{file.sizeBytes ?? 0} bytes</Text>
        </Box>
      );
      break;
    }

    case "queueStatus": {
      const qs = variant.value as { free?: number; maxlen?: number; res?: number; meshPacketId?: number };
      lines.push(
        <Box key="type">
          <Text color={theme.fg.muted}>Type: </Text>
          <Text color={theme.packet.routing}>QUEUE_STATUS</Text>
        </Box>
      );
      lines.push(
        <Box key="queue">
          <Text color={theme.fg.muted}>Queue: </Text>
          <Text color={theme.fg.primary}>{qs.free ?? "?"}</Text>
          <Text color={theme.fg.muted}>/</Text>
          <Text color={theme.fg.primary}>{qs.maxlen ?? "?"}</Text>
          <Text color={theme.fg.muted}> slots free</Text>
        </Box>
      );
      if (qs.res !== undefined && qs.res !== 0) {
        lines.push(
          <Box key="res">
            <Text color={theme.fg.muted}>Result: </Text>
            <Text color={theme.packet.encrypted}>{qs.res}</Text>
          </Box>
        );
      }
      if (qs.meshPacketId) {
        lines.push(
          <Box key="pkt">
            <Text color={theme.fg.muted}>Packet ID: </Text>
            <Text color={theme.fg.secondary}>0x{qs.meshPacketId.toString(16)}</Text>
          </Box>
        );
      }
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

function bytesToHex(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  if (bytes.length <= 8) {
    return `0x${hex}`;
  }
  // Show first 8 and last 4 bytes for longer arrays
  const first = hex.slice(0, 16);
  const last = hex.slice(-8);
  return `0x${first}...${last} (${bytes.length} bytes)`;
}

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return bytesToHex(value);
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
