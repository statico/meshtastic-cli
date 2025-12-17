import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { DecodedPacket } from "../../protocol/decoder";
import { Mesh, Portnums, Channel } from "@meshtastic/protobufs";
import { formatNodeId } from "../../utils/hex";

interface PacketInspectorProps {
  packet?: DecodedPacket;
}

export function PacketInspector({ packet }: PacketInspectorProps) {
  if (!packet) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color={theme.fg.muted}>No packet selected</Text>
      </Box>
    );
  }

  const mp = packet.meshPacket;
  const fr = packet.fromRadio;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text color={theme.fg.muted}>Time: </Text>
        <Text color={theme.fg.primary}>{packet.timestamp.toLocaleTimeString()}</Text>
        <Text color={theme.fg.muted}>  ID: </Text>
        <Text color={theme.fg.secondary}>{packet.id}</Text>
      </Box>

      {/* MeshPacket info */}
      {mp && (
        <>
          <Box>
            <Text color={theme.fg.muted}>From: </Text>
            <Text color={theme.fg.primary}>{formatNodeId(mp.from)}</Text>
            <Text color={theme.fg.muted}>  To: </Text>
            <Text color={theme.fg.primary}>
              {mp.to === 0xffffffff ? "BROADCAST" : formatNodeId(mp.to)}
            </Text>
            <Text color={theme.fg.muted}>  Ch: </Text>
            <Text color={theme.fg.primary}>{mp.channel}</Text>
          </Box>
          <Box>
            {mp.rxSnr !== undefined && (
              <>
                <Text color={theme.fg.muted}>SNR: </Text>
                <Text color={theme.fg.primary}>{mp.rxSnr.toFixed(1)}dB</Text>
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
                <Text color={theme.fg.primary}>{mp.hopStart - mp.hopLimit}/{mp.hopStart}</Text>
              </>
            )}
          </Box>
          {packet.portnum !== undefined && (
            <Box>
              <Text color={theme.fg.muted}>Port: </Text>
              <Text color={theme.fg.accent}>
                {Portnums.PortNum[packet.portnum] || `UNKNOWN(${packet.portnum})`}
              </Text>
            </Box>
          )}
        </>
      )}

      {/* FromRadio variant details */}
      {fr && renderFromRadioDetails(fr)}

      {/* Decoded payload */}
      {packet.payload && (
        <Box>
          <Text color={theme.fg.muted}>Data: </Text>
          <Text color={theme.fg.secondary}>
            {typeof packet.payload === "string"
              ? `"${packet.payload.slice(0, 50)}${packet.payload.length > 50 ? "..." : ""}"`
              : formatPayload(packet.payload)}
          </Text>
        </Box>
      )}

      {packet.decodeError && (
        <Box>
          <Text color={theme.packet.encrypted}>Error: {packet.decodeError}</Text>
        </Box>
      )}
    </Box>
  );
}

function renderFromRadioDetails(fr: Mesh.FromRadio): React.ReactNode {
  const variant = fr.payloadVariant;
  if (!variant.case || variant.case === "packet") return null;

  switch (variant.case) {
    case "myInfo": {
      const info = variant.value as Mesh.MyNodeInfo;
      return (
        <Box flexDirection="column">
          <Box>
            <Text color={theme.fg.muted}>Type: </Text>
            <Text color={theme.packet.direct}>MY_INFO</Text>
          </Box>
          <Box>
            <Text color={theme.fg.muted}>Node: </Text>
            <Text color={theme.fg.primary}>{formatNodeId(info.myNodeNum)}</Text>
          </Box>
        </Box>
      );
    }

    case "nodeInfo": {
      const info = variant.value as Mesh.NodeInfo;
      return (
        <Box flexDirection="column">
          <Box>
            <Text color={theme.fg.muted}>Type: </Text>
            <Text color={theme.packet.nodeinfo}>NODE_INFO</Text>
          </Box>
          <Box>
            <Text color={theme.fg.muted}>Node: </Text>
            <Text color={theme.fg.primary}>{formatNodeId(info.num)}</Text>
            {info.user?.shortName && (
              <>
                <Text color={theme.fg.muted}>  Name: </Text>
                <Text color={theme.fg.accent}>{info.user.shortName}</Text>
              </>
            )}
          </Box>
          {info.user?.longName && (
            <Box>
              <Text color={theme.fg.muted}>Long: </Text>
              <Text color={theme.fg.secondary}>{info.user.longName}</Text>
            </Box>
          )}
          {info.user?.hwModel !== undefined && (
            <Box>
              <Text color={theme.fg.muted}>HW: </Text>
              <Text color={theme.fg.secondary}>{Mesh.HardwareModel[info.user.hwModel] || info.user.hwModel}</Text>
            </Box>
          )}
        </Box>
      );
    }

    case "config": {
      const config = variant.value as Mesh.Config;
      const configCase = config.payloadVariant.case || "unknown";
      const configValue = config.payloadVariant.value;
      return (
        <Box flexDirection="column">
          <Box>
            <Text color={theme.fg.muted}>Type: </Text>
            <Text color={theme.packet.config}>CONFIG</Text>
            <Text color={theme.fg.muted}>  Section: </Text>
            <Text color={theme.fg.accent}>{configCase}</Text>
          </Box>
          <Box>
            <Text color={theme.fg.muted}>Data: </Text>
            <Text color={theme.fg.secondary}>{formatPayload(configValue)}</Text>
          </Box>
        </Box>
      );
    }

    case "moduleConfig": {
      const config = variant.value as Mesh.ModuleConfig;
      const configCase = config.payloadVariant.case || "unknown";
      const configValue = config.payloadVariant.value;
      return (
        <Box flexDirection="column">
          <Box>
            <Text color={theme.fg.muted}>Type: </Text>
            <Text color={theme.packet.config}>MODULE_CONFIG</Text>
            <Text color={theme.fg.muted}>  Module: </Text>
            <Text color={theme.fg.accent}>{configCase}</Text>
          </Box>
          <Box>
            <Text color={theme.fg.muted}>Data: </Text>
            <Text color={theme.fg.secondary}>{formatPayload(configValue)}</Text>
          </Box>
        </Box>
      );
    }

    case "channel": {
      const channel = variant.value as Mesh.Channel;
      return (
        <Box flexDirection="column">
          <Box>
            <Text color={theme.fg.muted}>Type: </Text>
            <Text color={theme.packet.config}>CHANNEL</Text>
            <Text color={theme.fg.muted}>  Index: </Text>
            <Text color={theme.fg.primary}>{channel.index}</Text>
          </Box>
          <Box>
            <Text color={theme.fg.muted}>Name: </Text>
            <Text color={theme.fg.accent}>{channel.settings?.name || "(default)"}</Text>
            <Text color={theme.fg.muted}>  Role: </Text>
            <Text color={theme.fg.secondary}>{Channel.Channel_Role[channel.role] || channel.role}</Text>
          </Box>
          {channel.settings?.psk && channel.settings.psk.length > 0 && (
            <Box>
              <Text color={theme.fg.muted}>PSK: </Text>
              <Text color={theme.fg.secondary}>{channel.settings.psk.length} bytes</Text>
            </Box>
          )}
        </Box>
      );
    }

    case "configCompleteId":
      return (
        <Box>
          <Text color={theme.fg.muted}>Type: </Text>
          <Text color={theme.packet.direct}>CONFIG_COMPLETE</Text>
          <Text color={theme.fg.muted}>  ID: </Text>
          <Text color={theme.fg.secondary}>{variant.value}</Text>
        </Box>
      );

    case "metadata": {
      const meta = variant.value as Mesh.DeviceMetadata;
      return (
        <Box flexDirection="column">
          <Box>
            <Text color={theme.fg.muted}>Type: </Text>
            <Text color={theme.packet.telemetry}>METADATA</Text>
          </Box>
          <Box>
            <Text color={theme.fg.muted}>FW: </Text>
            <Text color={theme.fg.primary}>{meta.firmwareVersion}</Text>
            {meta.deviceStateVersion && (
              <>
                <Text color={theme.fg.muted}>  State: </Text>
                <Text color={theme.fg.secondary}>{meta.deviceStateVersion}</Text>
              </>
            )}
          </Box>
        </Box>
      );
    }

    default:
      return (
        <Box>
          <Text color={theme.fg.muted}>Type: </Text>
          <Text color={theme.packet.unknown}>{variant.case.toUpperCase()}</Text>
        </Box>
      );
  }
}

function formatPayload(payload: unknown): string {
  if (payload == null) return "null";
  if (typeof payload === "string") return payload.slice(0, 60);
  if (typeof payload === "number" || typeof payload === "boolean") return String(payload);

  try {
    const str = JSON.stringify(payload, (_, v) => {
      if (v instanceof Uint8Array) return `<${v.length} bytes>`;
      return v;
    });
    return str.length > 70 ? str.slice(0, 67) + "..." : str;
  } catch {
    return String(payload);
  }
}
