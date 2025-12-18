import { fromBinary } from "@bufbuild/protobuf";
import { Mesh, Portnums, Telemetry, StoreForward, Admin } from "@meshtastic/protobufs";

export interface DecodedPacket {
  id: number;
  timestamp: Date;
  raw: Uint8Array;
  fromRadio?: Mesh.FromRadio;
  meshPacket?: Mesh.MeshPacket;
  portnum?: Portnums.PortNum;
  payload?: unknown;
  requestId?: number;
  decodeError?: string;
}

export function decodeFromRadio(raw: Uint8Array): DecodedPacket {
  const packet: DecodedPacket = {
    id: Date.now(),
    timestamp: new Date(),
    raw,
  };

  try {
    packet.fromRadio = fromBinary(Mesh.FromRadioSchema, raw);

    if (packet.fromRadio.payloadVariant.case === "packet") {
      packet.meshPacket = packet.fromRadio.payloadVariant.value;

      if (packet.meshPacket.payloadVariant.case === "decoded") {
        const decoded = packet.meshPacket.payloadVariant.value;
        packet.portnum = decoded.portnum;
        packet.payload = decodePayload(decoded.portnum, decoded.payload);
        if (decoded.requestId) {
          packet.requestId = decoded.requestId;
        }
      }
    }
  } catch (e) {
    packet.decodeError = e instanceof Error ? e.message : "decode failed";
  }

  return packet;
}

function decodePayload(portnum: Portnums.PortNum, payload: Uint8Array): unknown {
  try {
    switch (portnum) {
      case Portnums.PortNum.TEXT_MESSAGE_APP:
        return new TextDecoder().decode(payload);
      case Portnums.PortNum.POSITION_APP:
        return fromBinary(Mesh.PositionSchema, payload);
      case Portnums.PortNum.NODEINFO_APP:
        return fromBinary(Mesh.UserSchema, payload);
      case Portnums.PortNum.TELEMETRY_APP:
        return fromBinary(Telemetry.TelemetrySchema, payload);
      case Portnums.PortNum.ROUTING_APP:
        return fromBinary(Mesh.RoutingSchema, payload);
      case Portnums.PortNum.TRACEROUTE_APP:
        return fromBinary(Mesh.RouteDiscoverySchema, payload);
      case Portnums.PortNum.STORE_FORWARD_APP:
        return fromBinary(StoreForward.StoreAndForwardSchema, payload);
      case Portnums.PortNum.ADMIN_APP:
        return fromBinary(Admin.AdminMessageSchema, payload);
      case Portnums.PortNum.WAYPOINT_APP:
        return fromBinary(Mesh.WaypointSchema, payload);
      case Portnums.PortNum.NEIGHBORINFO_APP:
        return fromBinary(Mesh.NeighborInfoSchema, payload);
      default:
        return payload;
    }
  } catch {
    return payload;
  }
}
