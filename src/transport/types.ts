export type DeviceStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "configured";

export type DeviceOutput =
  | { type: "status"; status: DeviceStatus; reason?: string }
  | { type: "packet"; data: Uint8Array; raw: Uint8Array };

export interface Transport {
  readonly fromDevice: AsyncIterable<DeviceOutput>;
  send(data: Uint8Array): Promise<void>;
  disconnect(): Promise<void>;
  fetchOwner?(): Promise<{ id: string; longName: string; shortName: string; hwModel: string; myNodeNum: number } | null>;
}
