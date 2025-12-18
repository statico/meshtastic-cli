import { create, toBinary, fromBinary } from "@bufbuild/protobuf";
import { Mesh, Portnums, Admin, Config, ModuleConfig } from "@meshtastic/protobufs";

export type ConfigType = Admin.AdminMessage_ConfigType;
export type ModuleConfigType = Admin.AdminMessage_ModuleConfigType;

export const ConfigType = Admin.AdminMessage_ConfigType;
export const ModuleConfigType = Admin.AdminMessage_ModuleConfigType;

export interface AdminRequestOptions {
  myNodeNum: number;
  destNode?: number; // Default to myNodeNum for local config
  wantResponse?: boolean;
}

export function createAdminPacket(
  admin: Admin.AdminMessage,
  opts: AdminRequestOptions
): Uint8Array {
  const payload = toBinary(Admin.AdminMessageSchema, admin);
  const data = create(Mesh.DataSchema, {
    portnum: Portnums.PortNum.ADMIN_APP,
    payload,
    wantResponse: opts.wantResponse ?? true,
  });

  const meshPacket = create(Mesh.MeshPacketSchema, {
    from: opts.myNodeNum,
    to: opts.destNode ?? opts.myNodeNum,
    wantAck: true,
    payloadVariant: { case: "decoded", value: data },
  });

  const toRadio = create(Mesh.ToRadioSchema, {
    payloadVariant: { case: "packet", value: meshPacket },
  });

  return toBinary(Mesh.ToRadioSchema, toRadio);
}

export function createGetConfigRequest(
  configType: ConfigType,
  opts: AdminRequestOptions
): Uint8Array {
  const admin = create(Admin.AdminMessageSchema, {
    payloadVariant: { case: "getConfigRequest", value: configType },
  });
  return createAdminPacket(admin, opts);
}

export function createGetModuleConfigRequest(
  moduleType: ModuleConfigType,
  opts: AdminRequestOptions
): Uint8Array {
  const admin = create(Admin.AdminMessageSchema, {
    payloadVariant: { case: "getModuleConfigRequest", value: moduleType },
  });
  return createAdminPacket(admin, opts);
}

export function createGetOwnerRequest(opts: AdminRequestOptions): Uint8Array {
  const admin = create(Admin.AdminMessageSchema, {
    payloadVariant: { case: "getOwnerRequest", value: true },
  });
  return createAdminPacket(admin, opts);
}

export function createGetChannelRequest(
  channelIndex: number,
  opts: AdminRequestOptions
): Uint8Array {
  // Note: channel index is 1-indexed in the request (0 means unset in protobuf)
  const admin = create(Admin.AdminMessageSchema, {
    payloadVariant: { case: "getChannelRequest", value: channelIndex + 1 },
  });
  return createAdminPacket(admin, opts);
}

export function createRebootRequest(
  seconds: number,
  opts: AdminRequestOptions
): Uint8Array {
  const admin = create(Admin.AdminMessageSchema, {
    payloadVariant: { case: "rebootSeconds", value: seconds },
  });
  return createAdminPacket(admin, { ...opts, wantResponse: false });
}

export function createShutdownRequest(
  seconds: number,
  opts: AdminRequestOptions
): Uint8Array {
  const admin = create(Admin.AdminMessageSchema, {
    payloadVariant: { case: "shutdownSeconds", value: seconds },
  });
  return createAdminPacket(admin, { ...opts, wantResponse: false });
}

export function createFactoryResetRequest(opts: AdminRequestOptions): Uint8Array {
  const admin = create(Admin.AdminMessageSchema, {
    payloadVariant: { case: "factoryResetConfig", value: 1 },
  });
  return createAdminPacket(admin, { ...opts, wantResponse: false });
}

export function createNodeDbResetRequest(opts: AdminRequestOptions): Uint8Array {
  const admin = create(Admin.AdminMessageSchema, {
    payloadVariant: { case: "nodedbReset", value: 1 },
  });
  return createAdminPacket(admin, { ...opts, wantResponse: false });
}

export function parseAdminResponse(data: Uint8Array): Admin.AdminMessage | null {
  try {
    return fromBinary(Admin.AdminMessageSchema, data);
  } catch {
    return null;
  }
}

export function createSetOwnerRequest(
  owner: Mesh.User,
  opts: AdminRequestOptions
): Uint8Array {
  const admin = create(Admin.AdminMessageSchema, {
    payloadVariant: { case: "setOwner", value: owner },
  });
  return createAdminPacket(admin, { ...opts, wantResponse: false });
}

export function createSetConfigRequest(
  config: Config.Config,
  opts: AdminRequestOptions
): Uint8Array {
  const admin = create(Admin.AdminMessageSchema, {
    payloadVariant: { case: "setConfig", value: config },
  });
  return createAdminPacket(admin, { ...opts, wantResponse: false });
}

export function createSetModuleConfigRequest(
  config: ModuleConfig.ModuleConfig,
  opts: AdminRequestOptions
): Uint8Array {
  const admin = create(Admin.AdminMessageSchema, {
    payloadVariant: { case: "setModuleConfig", value: config },
  });
  return createAdminPacket(admin, { ...opts, wantResponse: false });
}

export function createSetChannelRequest(
  channel: Mesh.Channel,
  opts: AdminRequestOptions
): Uint8Array {
  const admin = create(Admin.AdminMessageSchema, {
    payloadVariant: { case: "setChannel", value: channel },
  });
  return createAdminPacket(admin, { ...opts, wantResponse: false });
}

// Config type labels for display
export const CONFIG_TYPE_LABELS: Record<ConfigType, string> = {
  [ConfigType.DEVICE_CONFIG]: "Device",
  [ConfigType.POSITION_CONFIG]: "Position",
  [ConfigType.POWER_CONFIG]: "Power",
  [ConfigType.NETWORK_CONFIG]: "Network",
  [ConfigType.DISPLAY_CONFIG]: "Display",
  [ConfigType.LORA_CONFIG]: "LoRa",
  [ConfigType.BLUETOOTH_CONFIG]: "Bluetooth",
  [ConfigType.SECURITY_CONFIG]: "Security",
  [ConfigType.SESSIONKEY_CONFIG]: "Session Key",
  [ConfigType.DEVICEUI_CONFIG]: "Device UI",
};

export const MODULE_CONFIG_TYPE_LABELS: Record<ModuleConfigType, string> = {
  [ModuleConfigType.MQTT_CONFIG]: "MQTT",
  [ModuleConfigType.SERIAL_CONFIG]: "Serial",
  [ModuleConfigType.EXTNOTIF_CONFIG]: "Ext. Notification",
  [ModuleConfigType.STOREFORWARD_CONFIG]: "Store & Forward",
  [ModuleConfigType.RANGETEST_CONFIG]: "Range Test",
  [ModuleConfigType.TELEMETRY_CONFIG]: "Telemetry",
  [ModuleConfigType.CANNEDMSG_CONFIG]: "Canned Messages",
  [ModuleConfigType.AUDIO_CONFIG]: "Audio",
  [ModuleConfigType.REMOTEHARDWARE_CONFIG]: "Remote Hardware",
  [ModuleConfigType.NEIGHBORINFO_CONFIG]: "Neighbor Info",
  [ModuleConfigType.AMBIENTLIGHTING_CONFIG]: "Ambient Lighting",
  [ModuleConfigType.DETECTIONSENSOR_CONFIG]: "Detection Sensor",
  [ModuleConfigType.PAXCOUNTER_CONFIG]: "Paxcounter",
};
