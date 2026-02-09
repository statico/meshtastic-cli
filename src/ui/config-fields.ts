import { Config, ModuleConfig, Mesh, Channel } from "@meshtastic/protobufs";
import { Admin } from "@meshtastic/protobufs";
import { getHardwareModelName } from "../utils";

export type FieldType = "boolean" | "enum" | "number" | "text" | "readonly";

export interface FieldDef {
  section: string;
  key: string;
  label: string;
  type: FieldType;
  enumMap?: Record<number, string>;
  suffix?: string;
  category: "radio" | "module" | "channel" | "user" | "local";
  configCase?: string;
  moduleConfigCase?: string;
}

export interface FlatConfigRow {
  field: FieldDef | null; // null for section headers
  sectionHeader?: string;
  value: unknown;
  displayValue: string;
  isSectionHeader: boolean;
}

export type ConfigStore = Map<string, Record<string, unknown>>;

// Extract number->string map from TS numeric enum
export function enumEntries(e: Record<string | number, string | number>): Record<number, string> {
  const result: Record<number, string> = {};
  for (const [k, v] of Object.entries(e)) {
    if (typeof v === "number") continue; // skip reverse mappings
    const num = Number(k);
    if (!isNaN(num)) result[num] = String(v);
  }
  return result;
}

// ─── Section → protobuf config type mappings ────────────────────────────

export const SECTION_TO_CONFIG_TYPE: Record<string, number> = {
  device: Admin.AdminMessage_ConfigType.DEVICE_CONFIG,
  position: Admin.AdminMessage_ConfigType.POSITION_CONFIG,
  power: Admin.AdminMessage_ConfigType.POWER_CONFIG,
  network: Admin.AdminMessage_ConfigType.NETWORK_CONFIG,
  display: Admin.AdminMessage_ConfigType.DISPLAY_CONFIG,
  lora: Admin.AdminMessage_ConfigType.LORA_CONFIG,
  bluetooth: Admin.AdminMessage_ConfigType.BLUETOOTH_CONFIG,
  security: Admin.AdminMessage_ConfigType.SECURITY_CONFIG,
};

export const SECTION_TO_MODULE_TYPE: Record<string, number> = {
  mqtt: Admin.AdminMessage_ModuleConfigType.MQTT_CONFIG,
  serial: Admin.AdminMessage_ModuleConfigType.SERIAL_CONFIG,
  extnotif: Admin.AdminMessage_ModuleConfigType.EXTNOTIF_CONFIG,
  storeforward: Admin.AdminMessage_ModuleConfigType.STOREFORWARD_CONFIG,
  rangetest: Admin.AdminMessage_ModuleConfigType.RANGETEST_CONFIG,
  telemetry: Admin.AdminMessage_ModuleConfigType.TELEMETRY_CONFIG,
  cannedmsg: Admin.AdminMessage_ModuleConfigType.CANNEDMSG_CONFIG,
  audio: Admin.AdminMessage_ModuleConfigType.AUDIO_CONFIG,
  remotehw: Admin.AdminMessage_ModuleConfigType.REMOTEHARDWARE_CONFIG,
  neighborinfo: Admin.AdminMessage_ModuleConfigType.NEIGHBORINFO_CONFIG,
  ambientlight: Admin.AdminMessage_ModuleConfigType.AMBIENTLIGHTING_CONFIG,
  detectionsensor: Admin.AdminMessage_ModuleConfigType.DETECTIONSENSOR_CONFIG,
  paxcounter: Admin.AdminMessage_ModuleConfigType.PAXCOUNTER_CONFIG,
};

// Reverse maps: protobuf case string → section name
export const CONFIG_CASE_TO_SECTION: Record<string, string> = {
  device: "device",
  position: "position",
  power: "power",
  network: "network",
  display: "display",
  lora: "lora",
  bluetooth: "bluetooth",
  security: "security",
};

export const MODULE_CASE_TO_SECTION: Record<string, string> = {
  mqtt: "mqtt",
  serial: "serial",
  externalNotification: "extnotif",
  storeForward: "storeforward",
  rangeTest: "rangetest",
  telemetry: "telemetry",
  cannedMessage: "cannedmsg",
  audio: "audio",
  remoteHardware: "remotehw",
  neighborInfo: "neighborinfo",
  ambientLighting: "ambientlight",
  detectionSensor: "detectionsensor",
  paxcounter: "paxcounter",
};

// Section → protobuf payloadVariant case for setConfig/setModuleConfig
export const SECTION_TO_CONFIG_CASE: Record<string, string> = {
  device: "device",
  position: "position",
  power: "power",
  network: "network",
  display: "display",
  lora: "lora",
  bluetooth: "bluetooth",
  security: "security",
};

export const SECTION_TO_MODULE_CASE: Record<string, string> = {
  mqtt: "mqtt",
  serial: "serial",
  extnotif: "externalNotification",
  storeforward: "storeForward",
  rangetest: "rangeTest",
  telemetry: "telemetry",
  cannedmsg: "cannedMessage",
  audio: "audio",
  remotehw: "remoteHardware",
  neighborinfo: "neighborInfo",
  ambientlight: "ambientLighting",
  detectionsensor: "detectionSensor",
  paxcounter: "paxcounter",
};

// ─── ALL_FIELDS: Unified field definitions ──────────────────────────────

export const ALL_FIELDS: FieldDef[] = [
  // ── Device ──
  { section: "device", key: "role", label: "Role", type: "enum", enumMap: enumEntries(Config.Config_DeviceConfig_Role), category: "radio", configCase: "device" },
  { section: "device", key: "rebroadcastMode", label: "Rebroadcast Mode", type: "enum", enumMap: enumEntries(Config.Config_DeviceConfig_RebroadcastMode), category: "radio", configCase: "device" },
  { section: "device", key: "nodeInfoBroadcastSecs", label: "Node Info Broadcast", type: "number", suffix: "s", category: "radio", configCase: "device" },
  { section: "device", key: "doubleTapAsButtonPress", label: "Double Tap Button", type: "boolean", category: "radio", configCase: "device" },
  { section: "device", key: "disableTripleClick", label: "Disable Triple Click", type: "boolean", category: "radio", configCase: "device" },
  { section: "device", key: "ledHeartbeatDisabled", label: "LED Heartbeat Disabled", type: "boolean", category: "radio", configCase: "device" },
  { section: "device", key: "buzzerMode", label: "Buzzer Mode", type: "enum", enumMap: enumEntries(Config.Config_DeviceConfig_BuzzerMode), category: "radio", configCase: "device" },
  { section: "device", key: "buttonGpio", label: "Button GPIO", type: "number", category: "radio", configCase: "device" },
  { section: "device", key: "buzzerGpio", label: "Buzzer GPIO", type: "number", category: "radio", configCase: "device" },
  { section: "device", key: "tzdef", label: "Timezone", type: "text", category: "radio", configCase: "device" },

  // ── Position ──
  { section: "position", key: "gpsMode", label: "GPS Mode", type: "enum", enumMap: enumEntries(Config.Config_PositionConfig_GpsMode), category: "radio", configCase: "position" },
  { section: "position", key: "fixedPosition", label: "Fixed Position", type: "boolean", category: "radio", configCase: "position" },
  { section: "position", key: "positionBroadcastSecs", label: "Position Broadcast", type: "number", suffix: "s", category: "radio", configCase: "position" },
  { section: "position", key: "positionBroadcastSmartEnabled", label: "Smart Broadcast", type: "boolean", category: "radio", configCase: "position" },
  { section: "position", key: "broadcastSmartMinimumDistance", label: "Smart Min Distance", type: "number", suffix: "m", category: "radio", configCase: "position" },
  { section: "position", key: "broadcastSmartMinimumIntervalSecs", label: "Smart Min Interval", type: "number", suffix: "s", category: "radio", configCase: "position" },
  { section: "position", key: "gpsUpdateInterval", label: "GPS Update Interval", type: "number", suffix: "s", category: "radio", configCase: "position" },
  { section: "position", key: "rxGpio", label: "RX GPIO", type: "number", category: "radio", configCase: "position" },
  { section: "position", key: "txGpio", label: "TX GPIO", type: "number", category: "radio", configCase: "position" },
  { section: "position", key: "gpsEnGpio", label: "GPS EN GPIO", type: "number", category: "radio", configCase: "position" },

  // ── Power ──
  { section: "power", key: "isPowerSaving", label: "Power Saving", type: "boolean", category: "radio", configCase: "power" },
  { section: "power", key: "onBatteryShutdownAfterSecs", label: "Shutdown After (battery)", type: "number", suffix: "s", category: "radio", configCase: "power" },
  { section: "power", key: "adcMultiplierOverride", label: "ADC Multiplier", type: "number", category: "radio", configCase: "power" },
  { section: "power", key: "waitBluetoothSecs", label: "Wait Bluetooth", type: "number", suffix: "s", category: "radio", configCase: "power" },
  { section: "power", key: "lsSecs", label: "Light Sleep", type: "number", suffix: "s", category: "radio", configCase: "power" },
  { section: "power", key: "sdsSecs", label: "Super Deep Sleep", type: "number", suffix: "s", category: "radio", configCase: "power" },
  { section: "power", key: "minWakeSecs", label: "Min Wake", type: "number", suffix: "s", category: "radio", configCase: "power" },
  { section: "power", key: "deviceBatteryInaAddress", label: "Battery INA Address", type: "number", category: "radio", configCase: "power" },

  // ── Network ──
  { section: "network", key: "wifiEnabled", label: "WiFi Enabled", type: "boolean", category: "radio", configCase: "network" },
  { section: "network", key: "wifiSsid", label: "WiFi SSID", type: "text", category: "radio", configCase: "network" },
  { section: "network", key: "wifiPsk", label: "WiFi PSK", type: "text", category: "radio", configCase: "network" },
  { section: "network", key: "ethEnabled", label: "Ethernet Enabled", type: "boolean", category: "radio", configCase: "network" },
  { section: "network", key: "addressMode", label: "Address Mode", type: "enum", enumMap: enumEntries(Config.Config_NetworkConfig_AddressMode), category: "radio", configCase: "network" },
  { section: "network", key: "ntpServer", label: "NTP Server", type: "text", category: "radio", configCase: "network" },
  { section: "network", key: "rsyslogServer", label: "Rsyslog Server", type: "text", category: "radio", configCase: "network" },
  { section: "network", key: "ipv6Enabled", label: "IPv6 Enabled", type: "boolean", category: "radio", configCase: "network" },

  // ── Display ──
  { section: "display", key: "screenOnSecs", label: "Screen On", type: "number", suffix: "s", category: "radio", configCase: "display" },
  { section: "display", key: "gpsFormat", label: "GPS Format", type: "enum", enumMap: enumEntries(Config.Config_DisplayConfig_GpsCoordinateFormat), category: "radio", configCase: "display" },
  { section: "display", key: "autoScreenCarouselSecs", label: "Auto Carousel", type: "number", suffix: "s", category: "radio", configCase: "display" },
  { section: "display", key: "compassNorthTop", label: "Compass North Top", type: "boolean", category: "radio", configCase: "display" },
  { section: "display", key: "flipScreen", label: "Flip Screen", type: "boolean", category: "radio", configCase: "display" },
  { section: "display", key: "units", label: "Units", type: "enum", enumMap: enumEntries(Config.Config_DisplayConfig_DisplayUnits), category: "radio", configCase: "display" },
  { section: "display", key: "oled", label: "OLED Type", type: "enum", enumMap: enumEntries(Config.Config_DisplayConfig_OledType), category: "radio", configCase: "display" },
  { section: "display", key: "displaymode", label: "Display Mode", type: "enum", enumMap: enumEntries(Config.Config_DisplayConfig_DisplayMode), category: "radio", configCase: "display" },
  { section: "display", key: "headingBold", label: "Heading Bold", type: "boolean", category: "radio", configCase: "display" },
  { section: "display", key: "wakeOnTapOrMotion", label: "Wake on Tap/Motion", type: "boolean", category: "radio", configCase: "display" },
  { section: "display", key: "use12hClock", label: "12h Clock", type: "boolean", category: "radio", configCase: "display" },

  // ── LoRa ──
  { section: "lora", key: "region", label: "Region", type: "enum", enumMap: enumEntries(Config.Config_LoRaConfig_RegionCode), category: "radio", configCase: "lora" },
  { section: "lora", key: "usePreset", label: "Use Preset", type: "boolean", category: "radio", configCase: "lora" },
  { section: "lora", key: "modemPreset", label: "Modem Preset", type: "enum", enumMap: enumEntries(Config.Config_LoRaConfig_ModemPreset), category: "radio", configCase: "lora" },
  { section: "lora", key: "bandwidth", label: "Bandwidth", type: "number", suffix: " kHz", category: "radio", configCase: "lora" },
  { section: "lora", key: "spreadFactor", label: "Spread Factor", type: "number", category: "radio", configCase: "lora" },
  { section: "lora", key: "codingRate", label: "Coding Rate", type: "number", category: "radio", configCase: "lora" },
  { section: "lora", key: "hopLimit", label: "Hop Limit", type: "number", category: "radio", configCase: "lora" },
  { section: "lora", key: "txEnabled", label: "TX Enabled", type: "boolean", category: "radio", configCase: "lora" },
  { section: "lora", key: "txPower", label: "TX Power", type: "number", suffix: " dBm", category: "radio", configCase: "lora" },
  { section: "lora", key: "channelNum", label: "Channel Num", type: "number", category: "radio", configCase: "lora" },
  { section: "lora", key: "overrideDutyCycle", label: "Override Duty Cycle", type: "boolean", category: "radio", configCase: "lora" },
  { section: "lora", key: "sx126xRxBoostedGain", label: "SX126x RX Boost", type: "boolean", category: "radio", configCase: "lora" },
  { section: "lora", key: "overrideFrequency", label: "Override Frequency", type: "number", suffix: " MHz", category: "radio", configCase: "lora" },
  { section: "lora", key: "ignoreMqtt", label: "Ignore MQTT", type: "boolean", category: "radio", configCase: "lora" },

  // ── Bluetooth ──
  { section: "bluetooth", key: "enabled", label: "Enabled", type: "boolean", category: "radio", configCase: "bluetooth" },
  { section: "bluetooth", key: "mode", label: "Pairing Mode", type: "enum", enumMap: enumEntries(Config.Config_BluetoothConfig_PairingMode), category: "radio", configCase: "bluetooth" },
  { section: "bluetooth", key: "fixedPin", label: "Fixed PIN", type: "number", category: "radio", configCase: "bluetooth" },

  // ── Security ──
  { section: "security", key: "serialEnabled", label: "Serial Enabled", type: "boolean", category: "radio", configCase: "security" },
  { section: "security", key: "debugLogApiEnabled", label: "Debug Log API", type: "boolean", category: "radio", configCase: "security" },
  { section: "security", key: "adminChannelEnabled", label: "Admin Channel", type: "boolean", category: "radio", configCase: "security" },
  { section: "security", key: "isManaged", label: "Is Managed", type: "boolean", category: "radio", configCase: "security" },

  // ── MQTT ──
  { section: "mqtt", key: "enabled", label: "Enabled", type: "boolean", category: "module", moduleConfigCase: "mqtt" },
  { section: "mqtt", key: "address", label: "Address", type: "text", category: "module", moduleConfigCase: "mqtt" },
  { section: "mqtt", key: "username", label: "Username", type: "text", category: "module", moduleConfigCase: "mqtt" },
  { section: "mqtt", key: "password", label: "Password", type: "text", category: "module", moduleConfigCase: "mqtt" },
  { section: "mqtt", key: "encryptionEnabled", label: "Encryption", type: "boolean", category: "module", moduleConfigCase: "mqtt" },
  { section: "mqtt", key: "jsonEnabled", label: "JSON Enabled", type: "boolean", category: "module", moduleConfigCase: "mqtt" },
  { section: "mqtt", key: "tlsEnabled", label: "TLS Enabled", type: "boolean", category: "module", moduleConfigCase: "mqtt" },
  { section: "mqtt", key: "root", label: "Root Topic", type: "text", category: "module", moduleConfigCase: "mqtt" },
  { section: "mqtt", key: "proxyToClientEnabled", label: "Proxy to Serial", type: "boolean", category: "module", moduleConfigCase: "mqtt" },
  { section: "mqtt", key: "mapReportingEnabled", label: "Map Reporting", type: "boolean", category: "module", moduleConfigCase: "mqtt" },

  // ── Serial ──
  { section: "serial", key: "enabled", label: "Enabled", type: "boolean", category: "module", moduleConfigCase: "serial" },
  { section: "serial", key: "echo", label: "Echo", type: "boolean", category: "module", moduleConfigCase: "serial" },
  { section: "serial", key: "rxd", label: "RX GPIO", type: "number", category: "module", moduleConfigCase: "serial" },
  { section: "serial", key: "txd", label: "TX GPIO", type: "number", category: "module", moduleConfigCase: "serial" },
  { section: "serial", key: "baud", label: "Baud Rate", type: "enum", enumMap: enumEntries(ModuleConfig.ModuleConfig_SerialConfig_Serial_Baud), category: "module", moduleConfigCase: "serial" },
  { section: "serial", key: "mode", label: "Mode", type: "enum", enumMap: enumEntries(ModuleConfig.ModuleConfig_SerialConfig_Serial_Mode), category: "module", moduleConfigCase: "serial" },
  { section: "serial", key: "timeout", label: "Timeout", type: "number", suffix: "ms", category: "module", moduleConfigCase: "serial" },
  { section: "serial", key: "overrideConsoleBaudRate", label: "Override Console Baud", type: "enum", enumMap: enumEntries(ModuleConfig.ModuleConfig_SerialConfig_Serial_Baud), category: "module", moduleConfigCase: "serial" },

  // ── External Notification ──
  { section: "extnotif", key: "enabled", label: "Enabled", type: "boolean", category: "module", moduleConfigCase: "externalNotification" },
  { section: "extnotif", key: "output", label: "Output GPIO", type: "number", category: "module", moduleConfigCase: "externalNotification" },
  { section: "extnotif", key: "outputVibra", label: "Output Vibra", type: "number", category: "module", moduleConfigCase: "externalNotification" },
  { section: "extnotif", key: "outputBuzzer", label: "Output Buzzer", type: "number", category: "module", moduleConfigCase: "externalNotification" },
  { section: "extnotif", key: "active", label: "Active", type: "boolean", category: "module", moduleConfigCase: "externalNotification" },
  { section: "extnotif", key: "alertMessage", label: "Alert Message", type: "boolean", category: "module", moduleConfigCase: "externalNotification" },
  { section: "extnotif", key: "alertMessageVibra", label: "Alert Message Vibra", type: "boolean", category: "module", moduleConfigCase: "externalNotification" },
  { section: "extnotif", key: "alertMessageBuzzer", label: "Alert Message Buzzer", type: "boolean", category: "module", moduleConfigCase: "externalNotification" },
  { section: "extnotif", key: "alertBell", label: "Alert Bell", type: "boolean", category: "module", moduleConfigCase: "externalNotification" },
  { section: "extnotif", key: "alertBellVibra", label: "Alert Bell Vibra", type: "boolean", category: "module", moduleConfigCase: "externalNotification" },
  { section: "extnotif", key: "alertBellBuzzer", label: "Alert Bell Buzzer", type: "boolean", category: "module", moduleConfigCase: "externalNotification" },
  { section: "extnotif", key: "usePwm", label: "Use PWM", type: "boolean", category: "module", moduleConfigCase: "externalNotification" },
  { section: "extnotif", key: "nagTimeout", label: "NAG Timeout", type: "number", suffix: "s", category: "module", moduleConfigCase: "externalNotification" },

  // ── Store & Forward ──
  { section: "storeforward", key: "enabled", label: "Enabled", type: "boolean", category: "module", moduleConfigCase: "storeForward" },
  { section: "storeforward", key: "heartbeat", label: "Heartbeat", type: "boolean", category: "module", moduleConfigCase: "storeForward" },
  { section: "storeforward", key: "records", label: "Records", type: "number", category: "module", moduleConfigCase: "storeForward" },
  { section: "storeforward", key: "historyReturnMax", label: "History Return Max", type: "number", category: "module", moduleConfigCase: "storeForward" },
  { section: "storeforward", key: "historyReturnWindow", label: "History Return Window", type: "number", suffix: "s", category: "module", moduleConfigCase: "storeForward" },
  { section: "storeforward", key: "isServer", label: "Is Server", type: "boolean", category: "module", moduleConfigCase: "storeForward" },

  // ── Range Test ──
  { section: "rangetest", key: "enabled", label: "Enabled", type: "boolean", category: "module", moduleConfigCase: "rangeTest" },
  { section: "rangetest", key: "sender", label: "Sender", type: "number", suffix: "s", category: "module", moduleConfigCase: "rangeTest" },
  { section: "rangetest", key: "save", label: "Save to CSV", type: "boolean", category: "module", moduleConfigCase: "rangeTest" },

  // ── Telemetry ──
  { section: "telemetry", key: "deviceUpdateInterval", label: "Device Update Interval", type: "number", suffix: "s", category: "module", moduleConfigCase: "telemetry" },
  { section: "telemetry", key: "environmentUpdateInterval", label: "Env Update Interval", type: "number", suffix: "s", category: "module", moduleConfigCase: "telemetry" },
  { section: "telemetry", key: "environmentMeasurementEnabled", label: "Environment Display", type: "boolean", category: "module", moduleConfigCase: "telemetry" },
  { section: "telemetry", key: "environmentScreenEnabled", label: "Environment Screen", type: "boolean", category: "module", moduleConfigCase: "telemetry" },
  { section: "telemetry", key: "airQualityInterval", label: "Air Quality Interval", type: "number", suffix: "s", category: "module", moduleConfigCase: "telemetry" },
  { section: "telemetry", key: "airQualityEnabled", label: "Air Quality Enabled", type: "boolean", category: "module", moduleConfigCase: "telemetry" },
  { section: "telemetry", key: "powerMeasurementEnabled", label: "Power Measurement", type: "boolean", category: "module", moduleConfigCase: "telemetry" },
  { section: "telemetry", key: "powerUpdateInterval", label: "Power Update Interval", type: "number", suffix: "s", category: "module", moduleConfigCase: "telemetry" },
  { section: "telemetry", key: "powerScreenEnabled", label: "Power Screen", type: "boolean", category: "module", moduleConfigCase: "telemetry" },
  { section: "telemetry", key: "healthMeasurementEnabled", label: "Health Measurement", type: "boolean", category: "module", moduleConfigCase: "telemetry" },
  { section: "telemetry", key: "healthUpdateInterval", label: "Health Update Interval", type: "number", suffix: "s", category: "module", moduleConfigCase: "telemetry" },
  { section: "telemetry", key: "healthScreenEnabled", label: "Health Screen", type: "boolean", category: "module", moduleConfigCase: "telemetry" },

  // ── Canned Messages ──
  { section: "cannedmsg", key: "enabled", label: "Enabled", type: "boolean", category: "module", moduleConfigCase: "cannedMessage" },
  { section: "cannedmsg", key: "rotary1Enabled", label: "Rotary 1 Enabled", type: "boolean", category: "module", moduleConfigCase: "cannedMessage" },
  { section: "cannedmsg", key: "inputbrokerEventCw", label: "Input Source", type: "enum", enumMap: enumEntries(ModuleConfig.ModuleConfig_CannedMessageConfig_InputEventChar), category: "module", moduleConfigCase: "cannedMessage" },
  { section: "cannedmsg", key: "sendBell", label: "Send Bell", type: "boolean", category: "module", moduleConfigCase: "cannedMessage" },
  { section: "cannedmsg", key: "inputbrokerEventPress", label: "Allow Input Source", type: "enum", enumMap: enumEntries(ModuleConfig.ModuleConfig_CannedMessageConfig_InputEventChar), category: "module", moduleConfigCase: "cannedMessage" },
  { section: "cannedmsg", key: "updown1Enabled", label: "Up/Down Enabled", type: "boolean", category: "module", moduleConfigCase: "cannedMessage" },

  // ── Audio ──
  { section: "audio", key: "codec2Enabled", label: "Codec2 Enabled", type: "boolean", category: "module", moduleConfigCase: "audio" },
  { section: "audio", key: "pttPin", label: "PTT GPIO", type: "number", category: "module", moduleConfigCase: "audio" },
  { section: "audio", key: "bitrate", label: "Bitrate", type: "enum", enumMap: enumEntries(ModuleConfig.ModuleConfig_AudioConfig_Audio_Baud), category: "module", moduleConfigCase: "audio" },
  { section: "audio", key: "i2sWs", label: "I2S WS", type: "number", category: "module", moduleConfigCase: "audio" },
  { section: "audio", key: "i2sSd", label: "I2S SD", type: "number", category: "module", moduleConfigCase: "audio" },
  { section: "audio", key: "i2sDin", label: "I2S DIN", type: "number", category: "module", moduleConfigCase: "audio" },
  { section: "audio", key: "i2sSck", label: "I2S SCK", type: "number", category: "module", moduleConfigCase: "audio" },

  // ── Remote Hardware ──
  { section: "remotehw", key: "enabled", label: "Enabled", type: "boolean", category: "module", moduleConfigCase: "remoteHardware" },
  { section: "remotehw", key: "allowUndefinedPinAccess", label: "Allow Undefined Pins", type: "boolean", category: "module", moduleConfigCase: "remoteHardware" },

  // ── Neighbor Info ──
  { section: "neighborinfo", key: "enabled", label: "Enabled", type: "boolean", category: "module", moduleConfigCase: "neighborInfo" },
  { section: "neighborinfo", key: "updateInterval", label: "Update Interval", type: "number", suffix: "s", category: "module", moduleConfigCase: "neighborInfo" },
  { section: "neighborinfo", key: "transmitOverLora", label: "Transmit Over LoRa", type: "boolean", category: "module", moduleConfigCase: "neighborInfo" },

  // ── Ambient Lighting ──
  { section: "ambientlight", key: "ledState", label: "LED State", type: "boolean", category: "module", moduleConfigCase: "ambientLighting" },
  { section: "ambientlight", key: "current", label: "Current", type: "number", category: "module", moduleConfigCase: "ambientLighting" },
  { section: "ambientlight", key: "red", label: "Red", type: "number", category: "module", moduleConfigCase: "ambientLighting" },
  { section: "ambientlight", key: "green", label: "Green", type: "number", category: "module", moduleConfigCase: "ambientLighting" },
  { section: "ambientlight", key: "blue", label: "Blue", type: "number", category: "module", moduleConfigCase: "ambientLighting" },

  // ── Detection Sensor ──
  { section: "detectionsensor", key: "enabled", label: "Enabled", type: "boolean", category: "module", moduleConfigCase: "detectionSensor" },
  { section: "detectionsensor", key: "minimumBroadcastSecs", label: "Minimum Broadcast", type: "number", suffix: "s", category: "module", moduleConfigCase: "detectionSensor" },
  { section: "detectionsensor", key: "stateBroadcastSecs", label: "State Broadcast", type: "number", suffix: "s", category: "module", moduleConfigCase: "detectionSensor" },
  { section: "detectionsensor", key: "sendBell", label: "Send Bell", type: "boolean", category: "module", moduleConfigCase: "detectionSensor" },
  { section: "detectionsensor", key: "name", label: "Name", type: "text", category: "module", moduleConfigCase: "detectionSensor" },
  { section: "detectionsensor", key: "monitorPin", label: "Monitor Pin", type: "number", category: "module", moduleConfigCase: "detectionSensor" },
  { section: "detectionsensor", key: "detectionTriggeredHigh", label: "Detection Triggered High", type: "boolean", category: "module", moduleConfigCase: "detectionSensor" },
  { section: "detectionsensor", key: "usePullup", label: "Use Pull-up", type: "boolean", category: "module", moduleConfigCase: "detectionSensor" },

  // ── Paxcounter ──
  { section: "paxcounter", key: "enabled", label: "Enabled", type: "boolean", category: "module", moduleConfigCase: "paxcounter" },
  { section: "paxcounter", key: "paxcounterUpdateInterval", label: "Update Interval", type: "number", suffix: "s", category: "module", moduleConfigCase: "paxcounter" },
  { section: "paxcounter", key: "wifiThreshold", label: "WiFi Threshold", type: "number", suffix: " dBm", category: "module", moduleConfigCase: "paxcounter" },
  { section: "paxcounter", key: "bleThreshold", label: "BLE Threshold", type: "number", suffix: " dBm", category: "module", moduleConfigCase: "paxcounter" },
];

// Section display labels (order matters for rendering)
const SECTION_ORDER: { key: string; label: string }[] = [
  { key: "device", label: "DEVICE" },
  { key: "position", label: "POSITION" },
  { key: "power", label: "POWER" },
  { key: "network", label: "NETWORK" },
  { key: "display", label: "DISPLAY" },
  { key: "lora", label: "LORA" },
  { key: "bluetooth", label: "BLUETOOTH" },
  { key: "security", label: "SECURITY" },
  { key: "mqtt", label: "MQTT" },
  { key: "serial", label: "SERIAL" },
  { key: "extnotif", label: "EXT. NOTIFICATION" },
  { key: "storeforward", label: "STORE & FORWARD" },
  { key: "rangetest", label: "RANGE TEST" },
  { key: "telemetry", label: "TELEMETRY" },
  { key: "cannedmsg", label: "CANNED MESSAGES" },
  { key: "audio", label: "AUDIO" },
  { key: "remotehw", label: "REMOTE HARDWARE" },
  { key: "neighborinfo", label: "NEIGHBOR INFO" },
  { key: "ambientlight", label: "AMBIENT LIGHTING" },
  { key: "detectionsensor", label: "DETECTION SENSOR" },
  { key: "paxcounter", label: "PAXCOUNTER" },
];

// ─── Format values for display ──────────────────────────────────────────

export function formatValue(field: FieldDef, rawValue: unknown): string {
  if (rawValue == null) return "-";

  switch (field.type) {
    case "boolean":
      return rawValue ? "Yes" : "No";
    case "enum": {
      if (field.enumMap) {
        const name = field.enumMap[rawValue as number];
        if (name) return name;
      }
      return String(rawValue);
    }
    case "number": {
      const num = rawValue as number;
      if (num === 0 && field.suffix) return `0${field.suffix}`;
      if (num === 0) return "0";
      return field.suffix ? `${num}${field.suffix}` : String(num);
    }
    case "text":
      return (rawValue as string) || "Not set";
    case "readonly":
      return String(rawValue);
    default:
      return String(rawValue);
  }
}

// Get raw value for editing (strip suffix, return actual stored value)
export function getRawEditValue(field: FieldDef, rawValue: unknown): string {
  if (rawValue == null) return "";
  switch (field.type) {
    case "boolean":
      return rawValue ? "true" : "false";
    case "enum":
      return String(rawValue);
    case "number":
      return String(rawValue);
    case "text":
      return String(rawValue || "");
    default:
      return String(rawValue);
  }
}

// ─── Build flat rows from current config state ──────────────────────────

export function buildFlatRows(
  configStore: ConfigStore,
  channels: Mesh.Channel[],
  owner: Mesh.User | undefined,
  localMeshViewUrl: string | undefined,
  filter?: string,
): FlatConfigRow[] {
  const rows: FlatConfigRow[] = [];
  const lowerFilter = filter?.toLowerCase();

  // Radio + Module config fields
  for (const sectionInfo of SECTION_ORDER) {
    const sectionFields = ALL_FIELDS.filter(f => f.section === sectionInfo.key);
    const configData = configStore.get(sectionInfo.key) as Record<string, unknown> | undefined;

    // Filter fields if filter is active
    const matchedFields = lowerFilter
      ? sectionFields.filter(f => f.label.toLowerCase().includes(lowerFilter) || f.section.toLowerCase().includes(lowerFilter))
      : sectionFields;

    if (matchedFields.length === 0) continue;

    // Section header
    rows.push({
      field: null,
      sectionHeader: sectionInfo.label,
      value: null,
      displayValue: "",
      isSectionHeader: true,
    });

    for (const field of matchedFields) {
      const rawValue = configData ? configData[field.key] : undefined;
      rows.push({
        field,
        value: rawValue,
        displayValue: configData ? formatValue(field, rawValue) : "Loading...",
        isSectionHeader: false,
      });
    }
  }

  // Channels section
  const validChannels = channels.filter(ch => ch != null).sort((a, b) => a.index - b.index);
  if (validChannels.length > 0) {
    const channelFieldsMatch = !lowerFilter || "channel".includes(lowerFilter) || "channels".includes(lowerFilter);
    if (channelFieldsMatch) {
      rows.push({
        field: null,
        sectionHeader: "CHANNELS",
        value: null,
        displayValue: "",
        isSectionHeader: true,
      });

      for (const ch of validChannels) {
        const roleName = Channel.Channel_Role[ch.role] || "UNKNOWN";
        const name = ch.settings?.name || (ch.index === 0 ? "Primary" : `Ch ${ch.index}`);

        // Channel name
        rows.push({
          field: { section: "channels", key: `channel${ch.index}_name`, label: `Ch${ch.index} Name`, type: "text", category: "channel" },
          value: ch.settings?.name || "",
          displayValue: name,
          isSectionHeader: false,
        });
        // Channel role
        rows.push({
          field: { section: "channels", key: `channel${ch.index}_role`, label: `Ch${ch.index} Role`, type: "enum", enumMap: enumEntries(Channel.Channel_Role), category: "channel" },
          value: ch.role,
          displayValue: roleName,
          isSectionHeader: false,
        });
        // Channel PSK
        const formatPsk = (psk?: Uint8Array): string => {
          if (!psk || psk.length === 0) return "None (unencrypted)";
          if (psk.length === 1 && psk[0] === 0) return "None (unencrypted)";
          const binary = String.fromCharCode(...psk);
          try { return btoa(binary); } catch { return "Invalid key"; }
        };
        rows.push({
          field: { section: "channels", key: `channel${ch.index}_psk`, label: `Ch${ch.index} PSK`, type: "text", category: "channel" },
          value: ch.settings?.psk,
          displayValue: formatPsk(ch.settings?.psk),
          isSectionHeader: false,
        });
        // Channel uplink
        rows.push({
          field: { section: "channels", key: `channel${ch.index}_uplinkEnabled`, label: `Ch${ch.index} Uplink`, type: "boolean", category: "channel" },
          value: ch.settings?.uplinkEnabled ?? false,
          displayValue: ch.settings?.uplinkEnabled ? "Yes" : "No",
          isSectionHeader: false,
        });
        // Channel downlink
        rows.push({
          field: { section: "channels", key: `channel${ch.index}_downlinkEnabled`, label: `Ch${ch.index} Downlink`, type: "boolean", category: "channel" },
          value: ch.settings?.downlinkEnabled ?? false,
          displayValue: ch.settings?.downlinkEnabled ? "Yes" : "No",
          isSectionHeader: false,
        });
      }
    }
  }

  // User section
  if (owner) {
    const userFieldsMatch = !lowerFilter || "user".includes(lowerFilter) || "owner".includes(lowerFilter) || "name".includes(lowerFilter);
    if (userFieldsMatch) {
      rows.push({
        field: null,
        sectionHeader: "USER",
        value: null,
        displayValue: "",
        isSectionHeader: true,
      });

      rows.push({
        field: { section: "user", key: "longName", label: "Long Name", type: "text", category: "user" },
        value: owner.longName,
        displayValue: owner.longName || "Not set",
        isSectionHeader: false,
      });
      rows.push({
        field: { section: "user", key: "shortName", label: "Short Name", type: "text", category: "user" },
        value: owner.shortName,
        displayValue: owner.shortName || "Not set",
        isSectionHeader: false,
      });
      rows.push({
        field: { section: "user", key: "id", label: "ID", type: "readonly", category: "user" },
        value: owner.id,
        displayValue: owner.id || "-",
        isSectionHeader: false,
      });
      rows.push({
        field: { section: "user", key: "hwModel", label: "Hardware Model", type: "readonly", category: "user" },
        value: owner.hwModel,
        displayValue: getHardwareModelName(owner.hwModel),
        isSectionHeader: false,
      });
      rows.push({
        field: { section: "user", key: "isLicensed", label: "Is Licensed", type: "readonly", category: "user" },
        value: owner.isLicensed,
        displayValue: owner.isLicensed ? "Yes" : "No",
        isSectionHeader: false,
      });
    }
  }

  // Local settings section
  const localFieldsMatch = !lowerFilter || "local".includes(lowerFilter) || "meshview".includes(lowerFilter) || "url".includes(lowerFilter);
  if (localFieldsMatch) {
    rows.push({
      field: null,
      sectionHeader: "LOCAL SETTINGS",
      value: null,
      displayValue: "",
      isSectionHeader: true,
    });

    rows.push({
      field: { section: "local", key: "meshViewUrl", label: "MeshView URL", type: "text", category: "local" },
      value: localMeshViewUrl,
      displayValue: localMeshViewUrl || "Not set",
      isSectionHeader: false,
    });
  }

  return rows;
}

// Total sections count for progress display
export const TOTAL_CONFIG_SECTIONS = Object.keys(SECTION_TO_CONFIG_TYPE).length + Object.keys(SECTION_TO_MODULE_TYPE).length + 2; // +2 for channels + owner
