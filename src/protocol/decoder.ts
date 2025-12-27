import { fromBinary } from "@bufbuild/protobuf";
import { Mesh, Portnums, Telemetry, StoreForward, Admin } from "@meshtastic/protobufs";
import { Logger } from "../logger";

export interface DecodedPacket {
  id: number;
  timestamp: Date;
  raw: Uint8Array;
  fromRadio?: Mesh.FromRadio;
  meshPacket?: Mesh.MeshPacket;
  portnum?: Portnums.PortNum;
  payload?: unknown;
  requestId?: number;
  replyId?: number;
  decodeError?: string;
}

export function decodeFromRadio(raw: Uint8Array): DecodedPacket {
  Logger.debug("PacketDecoder", "Decoding packet", { size: raw.byteLength });

  const packet: DecodedPacket = {
    id: Date.now(),
    timestamp: new Date(),
    raw,
  };

  try {
    packet.fromRadio = fromBinary(Mesh.FromRadioSchema, raw);
    Logger.debug("PacketDecoder", "FromRadio decoded", { variantCase: packet.fromRadio.payloadVariant.case });

    if (packet.fromRadio.payloadVariant.case === "packet") {
      packet.meshPacket = packet.fromRadio.payloadVariant.value;
      Logger.debug("PacketDecoder", "MeshPacket found", {
        from: packet.meshPacket.from,
        to: packet.meshPacket.to,
        channel: packet.meshPacket.channel,
        hopLimit: packet.meshPacket.hopLimit,
        hopStart: packet.meshPacket.hopStart,
        wantAck: packet.meshPacket.wantAck,
        payloadVariantCase: packet.meshPacket.payloadVariant.case,
      });

      if (packet.meshPacket.payloadVariant.case === "decoded") {
        const decoded = packet.meshPacket.payloadVariant.value;
        packet.portnum = decoded.portnum;
        const portnumName = Portnums.PortNum[decoded.portnum] || `UNKNOWN(${decoded.portnum})`;
        Logger.info("PacketDecoder", "Decoding payload", {
          portnum: decoded.portnum,
          portnumName,
          payloadSize: decoded.payload.byteLength,
          requestId: decoded.requestId,
          replyId: decoded.replyId,
        });
        packet.payload = decodePayload(decoded.portnum, decoded.payload);
        Logger.debug("PacketDecoder", "Payload decoded", {
          portnumName,
          payloadType: typeof packet.payload,
          hasPayload: packet.payload !== undefined,
        });
        if (decoded.requestId) {
          packet.requestId = decoded.requestId;
        }
        if (decoded.replyId) {
          packet.replyId = decoded.replyId;
        }
      } else if (packet.meshPacket.payloadVariant.case === "encrypted") {
        Logger.debug("PacketDecoder", "Packet is encrypted", { size: packet.meshPacket.payloadVariant.value.byteLength });
      }
    } else {
      Logger.debug("PacketDecoder", "Non-packet FromRadio", { case: packet.fromRadio.payloadVariant.case });
    }
  } catch (e) {
    packet.decodeError = e instanceof Error ? e.message : "decode failed";
    Logger.error("PacketDecoder", "Decode error", e as Error, { size: raw.byteLength });
  }

  return packet;
}

function decodePayload(portnum: Portnums.PortNum, payload: Uint8Array): unknown {
  const portnumName = Portnums.PortNum[portnum] || `UNKNOWN(${portnum})`;
  try {
    switch (portnum) {
      case Portnums.PortNum.TEXT_MESSAGE_APP:
        const text = new TextDecoder().decode(payload);
        Logger.debug("PacketDecoder", "Text message decoded", { length: text.length });
        return text;
      case Portnums.PortNum.POSITION_APP:
        Logger.debug("PacketDecoder", "Position decoded");
        return fromBinary(Mesh.PositionSchema, payload);
      case Portnums.PortNum.NODEINFO_APP:
        Logger.debug("PacketDecoder", "NodeInfo decoded");
        return fromBinary(Mesh.UserSchema, payload);
      case Portnums.PortNum.TELEMETRY_APP:
        Logger.debug("PacketDecoder", "Telemetry decoded");
        return fromBinary(Telemetry.TelemetrySchema, payload);
      case Portnums.PortNum.ROUTING_APP:
        Logger.debug("PacketDecoder", "Routing decoded");
        return fromBinary(Mesh.RoutingSchema, payload);
      case Portnums.PortNum.TRACEROUTE_APP:
        Logger.debug("PacketDecoder", "Traceroute decoded");
        return fromBinary(Mesh.RouteDiscoverySchema, payload);
      case Portnums.PortNum.STORE_FORWARD_APP:
        Logger.debug("PacketDecoder", "StoreForward decoded");
        return fromBinary(StoreForward.StoreAndForwardSchema, payload);
      case Portnums.PortNum.ADMIN_APP:
        Logger.debug("PacketDecoder", "Admin message decoded");
        return fromBinary(Admin.AdminMessageSchema, payload);
      case Portnums.PortNum.WAYPOINT_APP:
        Logger.debug("PacketDecoder", "Waypoint decoded");
        return fromBinary(Mesh.WaypointSchema, payload);
      case Portnums.PortNum.NEIGHBORINFO_APP:
        Logger.debug("PacketDecoder", "NeighborInfo decoded");
        return fromBinary(Mesh.NeighborInfoSchema, payload);
      default:
        Logger.debug("PacketDecoder", "Unknown portnum, returning raw payload", { portnumName });
        return payload;
    }
  } catch (error) {
    Logger.warn("PacketDecoder", "Payload decode failed, returning raw", { portnumName, error: (error as Error).message });
    return payload;
  }
}
