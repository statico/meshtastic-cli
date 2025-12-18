import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import { Config, ModuleConfig, Admin, Mesh, Channel } from "@meshtastic/protobufs";
import { CONFIG_TYPE_LABELS, MODULE_CONFIG_TYPE_LABELS, ConfigType, ModuleConfigType } from "../../protocol/admin";

export type ConfigSection =
  | "menu"
  | "device"
  | "position"
  | "power"
  | "network"
  | "display"
  | "lora"
  | "bluetooth"
  | "security"
  | "mqtt"
  | "serial"
  | "extnotif"
  | "storeforward"
  | "rangetest"
  | "telemetry"
  | "cannedmsg"
  | "audio"
  | "remotehw"
  | "neighborinfo"
  | "ambientlight"
  | "detectionsensor"
  | "paxcounter"
  | "channels"
  | "user";

interface ConfigPanelProps {
  section: ConfigSection;
  selectedMenuIndex: number;
  height: number;
  // Config data from device
  deviceConfig?: Config.Config_DeviceConfig;
  positionConfig?: Config.Config_PositionConfig;
  powerConfig?: Config.Config_PowerConfig;
  networkConfig?: Config.Config_NetworkConfig;
  displayConfig?: Config.Config_DisplayConfig;
  loraConfig?: Config.Config_LoRaConfig;
  bluetoothConfig?: Config.Config_BluetoothConfig;
  securityConfig?: Config.Config_SecurityConfig;
  // Module configs
  mqttConfig?: ModuleConfig.ModuleConfig_MQTTConfig;
  serialConfig?: ModuleConfig.ModuleConfig_SerialConfig;
  extNotifConfig?: ModuleConfig.ModuleConfig_ExternalNotificationConfig;
  storeForwardConfig?: ModuleConfig.ModuleConfig_StoreForwardConfig;
  rangeTestConfig?: ModuleConfig.ModuleConfig_RangeTestConfig;
  telemetryConfig?: ModuleConfig.ModuleConfig_TelemetryConfig;
  cannedMsgConfig?: ModuleConfig.ModuleConfig_CannedMessageConfig;
  audioConfig?: ModuleConfig.ModuleConfig_AudioConfig;
  remoteHwConfig?: ModuleConfig.ModuleConfig_RemoteHardwareConfig;
  neighborInfoConfig?: ModuleConfig.ModuleConfig_NeighborInfoConfig;
  ambientLightConfig?: ModuleConfig.ModuleConfig_AmbientLightingConfig;
  detectionSensorConfig?: ModuleConfig.ModuleConfig_DetectionSensorConfig;
  paxcounterConfig?: ModuleConfig.ModuleConfig_PaxcounterConfig;
  // Other config
  channels?: Mesh.Channel[];
  owner?: Mesh.User;
  loading?: boolean;
  // Editing state
  editingField?: string | null;
  editValue?: string;
}

interface MenuItem {
  key: ConfigSection;
  label: string;
  category: "radio" | "module" | "other";
}

const MENU_ITEMS: MenuItem[] = [
  // Radio Config
  { key: "device", label: "Device", category: "radio" },
  { key: "position", label: "Position", category: "radio" },
  { key: "power", label: "Power", category: "radio" },
  { key: "network", label: "Network", category: "radio" },
  { key: "display", label: "Display", category: "radio" },
  { key: "lora", label: "LoRa", category: "radio" },
  { key: "bluetooth", label: "Bluetooth", category: "radio" },
  { key: "security", label: "Security", category: "radio" },
  // Module Config
  { key: "mqtt", label: "MQTT", category: "module" },
  { key: "serial", label: "Serial", category: "module" },
  { key: "extnotif", label: "Ext. Notification", category: "module" },
  { key: "storeforward", label: "Store & Forward", category: "module" },
  { key: "rangetest", label: "Range Test", category: "module" },
  { key: "telemetry", label: "Telemetry", category: "module" },
  { key: "cannedmsg", label: "Canned Messages", category: "module" },
  { key: "audio", label: "Audio", category: "module" },
  { key: "remotehw", label: "Remote Hardware", category: "module" },
  { key: "neighborinfo", label: "Neighbor Info", category: "module" },
  { key: "ambientlight", label: "Ambient Lighting", category: "module" },
  { key: "detectionsensor", label: "Detection Sensor", category: "module" },
  { key: "paxcounter", label: "Paxcounter", category: "module" },
  // Other
  { key: "channels", label: "Channels", category: "other" },
  { key: "user", label: "User", category: "other" },
];

export function ConfigPanel({
  section,
  selectedMenuIndex,
  height,
  deviceConfig,
  positionConfig,
  powerConfig,
  networkConfig,
  displayConfig,
  loraConfig,
  bluetoothConfig,
  securityConfig,
  mqttConfig,
  serialConfig,
  extNotifConfig,
  storeForwardConfig,
  rangeTestConfig,
  telemetryConfig,
  cannedMsgConfig,
  audioConfig,
  remoteHwConfig,
  neighborInfoConfig,
  ambientLightConfig,
  detectionSensorConfig,
  paxcounterConfig,
  channels,
  owner,
  loading,
}: ConfigPanelProps) {
  if (section === "menu") {
    return (
      <ConfigMenu
        selectedIndex={selectedMenuIndex}
        height={height}
        loading={loading}
      />
    );
  }

  // Render specific config section
  return (
    <Box flexDirection="column" height={height} width="100%">
      <Box paddingX={1} borderBottom borderColor={theme.border.normal}>
        <Text color={theme.fg.accent} bold>
          {MENU_ITEMS.find((m) => m.key === section)?.label || section.toUpperCase()} CONFIG
        </Text>
        <Text color={theme.fg.muted}> (Esc to go back)</Text>
      </Box>
      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {loading ? (
          <Text color={theme.fg.muted}>Loading...</Text>
        ) : (
          <ConfigSectionView
            section={section}
            deviceConfig={deviceConfig}
            positionConfig={positionConfig}
            powerConfig={powerConfig}
            networkConfig={networkConfig}
            displayConfig={displayConfig}
            loraConfig={loraConfig}
            bluetoothConfig={bluetoothConfig}
            securityConfig={securityConfig}
            mqttConfig={mqttConfig}
            serialConfig={serialConfig}
            extNotifConfig={extNotifConfig}
            storeForwardConfig={storeForwardConfig}
            rangeTestConfig={rangeTestConfig}
            telemetryConfig={telemetryConfig}
            cannedMsgConfig={cannedMsgConfig}
            audioConfig={audioConfig}
            remoteHwConfig={remoteHwConfig}
            neighborInfoConfig={neighborInfoConfig}
            ambientLightConfig={ambientLightConfig}
            detectionSensorConfig={detectionSensorConfig}
            paxcounterConfig={paxcounterConfig}
            channels={channels}
            owner={owner}
          />
        )}
      </Box>
    </Box>
  );
}

function ConfigMenu({
  selectedIndex,
  height,
  loading,
}: {
  selectedIndex: number;
  height: number;
  loading?: boolean;
}) {
  const radioItems = MENU_ITEMS.filter((m) => m.category === "radio");
  const moduleItems = MENU_ITEMS.filter((m) => m.category === "module");
  const otherItems = MENU_ITEMS.filter((m) => m.category === "other");

  return (
    <Box flexDirection="column" height={height} width="100%">
      <Box paddingX={1}>
        <Text color={theme.fg.accent} bold>CONFIG</Text>
        {loading && <Text color={theme.fg.muted}> (loading...)</Text>}
      </Box>

      <Box flexDirection="row" flexGrow={1} paddingX={1}>
        {/* Radio Config Column */}
        <Box flexDirection="column" width="33%">
          <Text color={theme.fg.muted} bold>RADIO</Text>
          {radioItems.map((item, i) => {
            const globalIndex = i;
            const isSelected = globalIndex === selectedIndex;
            return (
              <Box key={item.key} backgroundColor={isSelected ? theme.bg.selected : undefined}>
                <Text color={isSelected ? theme.fg.accent : theme.fg.primary}>
                  {isSelected ? "▶ " : "  "}{item.label}
                </Text>
              </Box>
            );
          })}
        </Box>

        {/* Module Config Column */}
        <Box flexDirection="column" width="33%">
          <Text color={theme.fg.muted} bold>MODULES</Text>
          {moduleItems.map((item, i) => {
            const globalIndex = radioItems.length + i;
            const isSelected = globalIndex === selectedIndex;
            return (
              <Box key={item.key} backgroundColor={isSelected ? theme.bg.selected : undefined}>
                <Text color={isSelected ? theme.fg.accent : theme.fg.primary}>
                  {isSelected ? "▶ " : "  "}{item.label}
                </Text>
              </Box>
            );
          })}
        </Box>

        {/* Other Config Column */}
        <Box flexDirection="column" width="33%">
          <Text color={theme.fg.muted} bold>OTHER</Text>
          {otherItems.map((item, i) => {
            const globalIndex = radioItems.length + moduleItems.length + i;
            const isSelected = globalIndex === selectedIndex;
            return (
              <Box key={item.key} backgroundColor={isSelected ? theme.bg.selected : undefined}>
                <Text color={isSelected ? theme.fg.accent : theme.fg.primary}>
                  {isSelected ? "▶ " : "  "}{item.label}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>

      <Box paddingX={1}>
        <Text color={theme.fg.muted}>j/k navigate • Enter select • r reboot • R factory reset</Text>
      </Box>
    </Box>
  );
}

export function getMenuItemByIndex(index: number): MenuItem | undefined {
  return MENU_ITEMS[index];
}

export function getMenuItemCount(): number {
  return MENU_ITEMS.length;
}

function ConfigSectionView(props: Omit<ConfigPanelProps, "section" | "selectedMenuIndex" | "height" | "loading"> & { section: ConfigSection }) {
  const { section } = props;

  switch (section) {
    case "device":
      return <DeviceConfigView config={props.deviceConfig} />;
    case "position":
      return <PositionConfigView config={props.positionConfig} />;
    case "power":
      return <PowerConfigView config={props.powerConfig} />;
    case "network":
      return <NetworkConfigView config={props.networkConfig} />;
    case "display":
      return <DisplayConfigView config={props.displayConfig} />;
    case "lora":
      return <LoRaConfigView config={props.loraConfig} />;
    case "bluetooth":
      return <BluetoothConfigView config={props.bluetoothConfig} />;
    case "security":
      return <SecurityConfigView config={props.securityConfig} />;
    case "mqtt":
      return <MQTTConfigView config={props.mqttConfig} />;
    case "serial":
      return <SerialConfigView config={props.serialConfig} />;
    case "extnotif":
      return <ExtNotifConfigView config={props.extNotifConfig} />;
    case "storeforward":
      return <StoreForwardConfigView config={props.storeForwardConfig} />;
    case "rangetest":
      return <RangeTestConfigView config={props.rangeTestConfig} />;
    case "telemetry":
      return <TelemetryConfigView config={props.telemetryConfig} />;
    case "cannedmsg":
      return <CannedMsgConfigView config={props.cannedMsgConfig} />;
    case "audio":
      return <AudioConfigView config={props.audioConfig} />;
    case "remotehw":
      return <RemoteHwConfigView config={props.remoteHwConfig} />;
    case "neighborinfo":
      return <NeighborInfoConfigView config={props.neighborInfoConfig} />;
    case "ambientlight":
      return <AmbientLightConfigView config={props.ambientLightConfig} />;
    case "detectionsensor":
      return <DetectionSensorConfigView config={props.detectionSensorConfig} />;
    case "paxcounter":
      return <PaxcounterConfigView config={props.paxcounterConfig} />;
    case "channels":
      return <ChannelsConfigView channels={props.channels} />;
    case "user":
      return <UserConfigView owner={props.owner} editingField={props.editingField} editValue={props.editValue} />;
    default:
      return <Text color={theme.fg.muted}>Section not implemented</Text>;
  }
}

// Helper component for config rows
function ConfigRow({ label, value, valueColor }: { label: string; value: string | number | boolean | undefined; valueColor?: string }) {
  const displayValue = value === undefined ? "-" : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  return (
    <Box>
      <Text color={theme.fg.muted}>{label.padEnd(24)}</Text>
      <Text color={valueColor || theme.fg.primary}>{displayValue}</Text>
    </Box>
  );
}

function NoConfigLoaded() {
  return <Text color={theme.fg.muted}>Config not loaded. Press Enter to request.</Text>;
}

// Individual config views
function DeviceConfigView({ config }: { config?: Config.Config_DeviceConfig }) {
  if (!config) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <ConfigRow label="Role" value={Config.Config_DeviceConfig_Role[config.role]} valueColor={theme.fg.accent} />
      <ConfigRow label="Rebroadcast Mode" value={Config.Config_DeviceConfig_RebroadcastMode[config.rebroadcastMode]} />
      <ConfigRow label="Node Info Broadcast" value={`${config.nodeInfoBroadcastSecs}s`} />
      <ConfigRow label="Double Tap Button" value={config.doubleTapAsButtonPress} />
      <ConfigRow label="Disable Triple Click" value={config.disableTripleClick} />
      <ConfigRow label="LED Heartbeat Disabled" value={config.ledHeartbeatDisabled} />
      <ConfigRow label="Buzzer Mode" value={Config.Config_DeviceConfig_BuzzerMode[config.buzzerMode]} />
      <ConfigRow label="Button GPIO" value={config.buttonGpio || "Default"} />
      <ConfigRow label="Buzzer GPIO" value={config.buzzerGpio || "Default"} />
      <ConfigRow label="Timezone" value={config.tzdef || "Not set"} />
    </Box>
  );
}

function PositionConfigView({ config }: { config?: Config.Config_PositionConfig }) {
  if (!config) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <ConfigRow label="GPS Mode" value={Config.Config_PositionConfig_GpsMode[config.gpsMode]} valueColor={theme.fg.accent} />
      <ConfigRow label="Fixed Position" value={config.fixedPosition} />
      <ConfigRow label="Position Broadcast" value={`${config.positionBroadcastSecs}s`} />
      <ConfigRow label="Smart Broadcast" value={config.positionBroadcastSmartEnabled} />
      <ConfigRow label="Smart Min Distance" value={`${config.broadcastSmartMinimumDistance}m`} />
      <ConfigRow label="Smart Min Interval" value={`${config.broadcastSmartMinimumIntervalSecs}s`} />
      <ConfigRow label="GPS Update Interval" value={`${config.gpsUpdateInterval}s`} />
      <ConfigRow label="RX GPIO" value={config.rxGpio || "Default"} />
      <ConfigRow label="TX GPIO" value={config.txGpio || "Default"} />
      <ConfigRow label="GPS EN GPIO" value={config.gpsEnGpio || "Default"} />
    </Box>
  );
}

function PowerConfigView({ config }: { config?: Config.Config_PowerConfig }) {
  if (!config) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <ConfigRow label="Power Saving" value={config.isPowerSaving} valueColor={config.isPowerSaving ? theme.status.online : undefined} />
      <ConfigRow label="Shutdown After (battery)" value={config.onBatteryShutdownAfterSecs ? `${config.onBatteryShutdownAfterSecs}s` : "Disabled"} />
      <ConfigRow label="ADC Multiplier" value={config.adcMultiplierOverride || "Default"} />
      <ConfigRow label="Wait Bluetooth" value={`${config.waitBluetoothSecs || 60}s`} />
      <ConfigRow label="Light Sleep" value={`${config.lsSecs || 300}s`} />
      <ConfigRow label="Super Deep Sleep" value={config.sdsSecs ? `${config.sdsSecs}s` : "1 year"} />
      <ConfigRow label="Min Wake" value={`${config.minWakeSecs || 10}s`} />
      <ConfigRow label="Battery INA Address" value={config.deviceBatteryInaAddress ? `0x${config.deviceBatteryInaAddress.toString(16)}` : "Not set"} />
    </Box>
  );
}

function NetworkConfigView({ config }: { config?: Config.Config_NetworkConfig }) {
  if (!config) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <ConfigRow label="WiFi Enabled" value={config.wifiEnabled} valueColor={config.wifiEnabled ? theme.status.online : theme.status.offline} />
      <ConfigRow label="WiFi SSID" value={config.wifiSsid || "Not set"} />
      <ConfigRow label="WiFi PSK" value={config.wifiPsk ? "********" : "Not set"} />
      <ConfigRow label="Ethernet Enabled" value={config.ethEnabled} />
      <ConfigRow label="Address Mode" value={Config.Config_NetworkConfig_AddressMode[config.addressMode]} />
      <ConfigRow label="NTP Server" value={config.ntpServer || "meshtastic.pool.ntp.org"} />
      <ConfigRow label="Rsyslog Server" value={config.rsyslogServer || "Not set"} />
      <ConfigRow label="IPv6 Enabled" value={config.ipv6Enabled} />
    </Box>
  );
}

function DisplayConfigView({ config }: { config?: Config.Config_DisplayConfig }) {
  if (!config) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <ConfigRow label="Screen On" value={`${config.screenOnSecs || 60}s`} />
      <ConfigRow label="GPS Format" value={Config.Config_DisplayConfig_GpsCoordinateFormat[config.gpsFormat]} />
      <ConfigRow label="Auto Carousel" value={config.autoScreenCarouselSecs ? `${config.autoScreenCarouselSecs}s` : "Disabled"} />
      <ConfigRow label="Compass North Top" value={config.compassNorthTop} />
      <ConfigRow label="Flip Screen" value={config.flipScreen} />
      <ConfigRow label="Units" value={Config.Config_DisplayConfig_DisplayUnits[config.units]} />
      <ConfigRow label="OLED Type" value={Config.Config_DisplayConfig_OledType[config.oled]} />
      <ConfigRow label="Display Mode" value={Config.Config_DisplayConfig_DisplayMode[config.displaymode]} />
      <ConfigRow label="Heading Bold" value={config.headingBold} />
      <ConfigRow label="Wake on Tap/Motion" value={config.wakeOnTapOrMotion} />
      <ConfigRow label="12h Clock" value={config.use12hClock} />
    </Box>
  );
}

function LoRaConfigView({ config }: { config?: Config.Config_LoRaConfig }) {
  if (!config) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <ConfigRow label="Region" value={Config.Config_LoRaConfig_RegionCode[config.region]} valueColor={theme.fg.accent} />
      <ConfigRow label="Use Preset" value={config.usePreset} />
      <ConfigRow label="Modem Preset" value={Config.Config_LoRaConfig_ModemPreset[config.modemPreset]} valueColor={theme.packet.telemetry} />
      <ConfigRow label="Bandwidth" value={config.bandwidth ? `${config.bandwidth} kHz` : "Preset"} />
      <ConfigRow label="Spread Factor" value={config.spreadFactor || "Preset"} />
      <ConfigRow label="Coding Rate" value={config.codingRate ? `4/${config.codingRate}` : "Preset"} />
      <ConfigRow label="Hop Limit" value={config.hopLimit || 3} />
      <ConfigRow label="TX Enabled" value={config.txEnabled} valueColor={config.txEnabled ? theme.status.online : theme.status.offline} />
      <ConfigRow label="TX Power" value={config.txPower ? `${config.txPower} dBm` : "Default"} />
      <ConfigRow label="Channel Num" value={config.channelNum || "Auto"} />
      <ConfigRow label="Override Duty Cycle" value={config.overrideDutyCycle} />
      <ConfigRow label="SX126x RX Boost" value={config.sx126xRxBoostedGain} />
      <ConfigRow label="Override Frequency" value={config.overrideFrequency ? `${config.overrideFrequency} MHz` : "Not set"} />
      <ConfigRow label="Ignore MQTT" value={config.ignoreMqtt} />
      <ConfigRow label="OK to MQTT" value={config.configOkToMqtt} />
    </Box>
  );
}

function BluetoothConfigView({ config }: { config?: Config.Config_BluetoothConfig }) {
  if (!config) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <ConfigRow label="Enabled" value={config.enabled} valueColor={config.enabled ? theme.status.online : theme.status.offline} />
      <ConfigRow label="Pairing Mode" value={Config.Config_BluetoothConfig_PairingMode[config.mode]} />
      <ConfigRow label="Fixed PIN" value={config.fixedPin || "Not set"} />
    </Box>
  );
}

function SecurityConfigView({ config }: { config?: Config.Config_SecurityConfig }) {
  if (!config) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <ConfigRow label="Serial Enabled" value={config.serialEnabled} />
      <ConfigRow label="Debug Log API" value={config.debugLogApiEnabled} />
      <ConfigRow label="Admin Channel" value={config.adminChannelEnabled} />
      <ConfigRow label="Is Managed" value={config.isManaged} />
      <ConfigRow label="Public Key" value={config.publicKey?.length ? `${config.publicKey.length} bytes` : "Not set"} />
      <ConfigRow label="Private Key" value={config.privateKey?.length ? "********" : "Not set"} />
      <ConfigRow label="Admin Keys" value={`${config.adminKey?.length || 0} configured`} />
    </Box>
  );
}

function MQTTConfigView({ config }: { config?: ModuleConfig.ModuleConfig_MQTTConfig }) {
  if (!config) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <ConfigRow label="Enabled" value={config.enabled} valueColor={config.enabled ? theme.status.online : theme.status.offline} />
      <ConfigRow label="Address" value={config.address || "mqtt.meshtastic.org"} />
      <ConfigRow label="Username" value={config.username || "meshdev"} />
      <ConfigRow label="Password" value={config.password ? "********" : "large4cats"} />
      <ConfigRow label="Encryption" value={config.encryptionEnabled} />
      <ConfigRow label="JSON Enabled" value={config.jsonEnabled} />
      <ConfigRow label="TLS Enabled" value={config.tlsEnabled} />
      <ConfigRow label="Root Topic" value={config.root || "msh"} />
      <ConfigRow label="Proxy to Serial" value={config.proxyToClientEnabled} />
      <ConfigRow label="Map Reporting" value={config.mapReportingEnabled} />
    </Box>
  );
}

function SerialConfigView({ config }: { config?: ModuleConfig.ModuleConfig_SerialConfig }) {
  if (!config) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <ConfigRow label="Enabled" value={config.enabled} valueColor={config.enabled ? theme.status.online : theme.status.offline} />
      <ConfigRow label="Echo" value={config.echo} />
      <ConfigRow label="RX GPIO" value={config.rxd || "Default"} />
      <ConfigRow label="TX GPIO" value={config.txd || "Default"} />
      <ConfigRow label="Baud Rate" value={ModuleConfig.ModuleConfig_SerialConfig_Serial_Baud[config.baud]} />
      <ConfigRow label="Mode" value={ModuleConfig.ModuleConfig_SerialConfig_Serial_Mode[config.mode]} />
      <ConfigRow label="Timeout" value={`${config.timeout || 0}ms`} />
      <ConfigRow label="Override Console Baud" value={config.overrideConsoleBaudRate ? ModuleConfig.ModuleConfig_SerialConfig_Serial_Baud[config.overrideConsoleBaudRate] : "Default"} />
    </Box>
  );
}

function ExtNotifConfigView({ config }: { config?: ModuleConfig.ModuleConfig_ExternalNotificationConfig }) {
  if (!config) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <ConfigRow label="Enabled" value={config.enabled} valueColor={config.enabled ? theme.status.online : theme.status.offline} />
      <ConfigRow label="Output GPIO" value={config.output || "Default"} />
      <ConfigRow label="Output Vibra" value={config.outputVibra || "Not set"} />
      <ConfigRow label="Output Buzzer" value={config.outputBuzzer || "Not set"} />
      <ConfigRow label="Active" value={config.active} />
      <ConfigRow label="Alert Message" value={config.alertMessage} />
      <ConfigRow label="Alert Message Vibra" value={config.alertMessageVibra} />
      <ConfigRow label="Alert Message Buzzer" value={config.alertMessageBuzzer} />
      <ConfigRow label="Alert Bell" value={config.alertBell} />
      <ConfigRow label="Alert Bell Vibra" value={config.alertBellVibra} />
      <ConfigRow label="Alert Bell Buzzer" value={config.alertBellBuzzer} />
      <ConfigRow label="Use PWM" value={config.usePwm} />
      <ConfigRow label="NAG Timeout" value={`${config.nagTimeout || 0}s`} />
    </Box>
  );
}

function StoreForwardConfigView({ config }: { config?: ModuleConfig.ModuleConfig_StoreForwardConfig }) {
  if (!config) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <ConfigRow label="Enabled" value={config.enabled} valueColor={config.enabled ? theme.status.online : theme.status.offline} />
      <ConfigRow label="Heartbeat" value={config.heartbeat} />
      <ConfigRow label="Records" value={config.records || "Default"} />
      <ConfigRow label="History Return Max" value={config.historyReturnMax || "Default"} />
      <ConfigRow label="History Return Window" value={`${config.historyReturnWindow || 0}s`} />
      <ConfigRow label="Is Server" value={config.isServer} />
    </Box>
  );
}

function RangeTestConfigView({ config }: { config?: ModuleConfig.ModuleConfig_RangeTestConfig }) {
  if (!config) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <ConfigRow label="Enabled" value={config.enabled} valueColor={config.enabled ? theme.status.online : theme.status.offline} />
      <ConfigRow label="Sender" value={`${config.sender || 0}s`} />
      <ConfigRow label="Save to CSV" value={config.save} />
    </Box>
  );
}

function TelemetryConfigView({ config }: { config?: ModuleConfig.ModuleConfig_TelemetryConfig }) {
  if (!config) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <ConfigRow label="Device Update Interval" value={`${config.deviceUpdateInterval || 0}s`} />
      <ConfigRow label="Environment Update Interval" value={`${config.environmentUpdateInterval || 0}s`} />
      <ConfigRow label="Environment Display" value={config.environmentMeasurementEnabled} />
      <ConfigRow label="Environment Screen" value={config.environmentScreenEnabled} />
      <ConfigRow label="Air Quality Interval" value={`${config.airQualityInterval || 0}s`} />
      <ConfigRow label="Air Quality Enabled" value={config.airQualityEnabled} />
      <ConfigRow label="Power Measurement" value={config.powerMeasurementEnabled} />
      <ConfigRow label="Power Update Interval" value={`${config.powerUpdateInterval || 0}s`} />
      <ConfigRow label="Power Screen" value={config.powerScreenEnabled} />
      <ConfigRow label="Health Measurement" value={config.healthMeasurementEnabled} />
      <ConfigRow label="Health Update Interval" value={`${config.healthUpdateInterval || 0}s`} />
      <ConfigRow label="Health Screen" value={config.healthScreenEnabled} />
    </Box>
  );
}

function CannedMsgConfigView({ config }: { config?: ModuleConfig.ModuleConfig_CannedMessageConfig }) {
  if (!config) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <ConfigRow label="Enabled" value={config.enabled} valueColor={config.enabled ? theme.status.online : theme.status.offline} />
      <ConfigRow label="Rotary 1 Enabled" value={config.rotary1Enabled} />
      <ConfigRow label="Input Source" value={ModuleConfig.ModuleConfig_CannedMessageConfig_InputEventChar[config.inputbrokerEventCw]} />
      <ConfigRow label="Send Bell" value={config.sendBell} />
      <ConfigRow label="Allow Input Source" value={ModuleConfig.ModuleConfig_CannedMessageConfig_InputEventChar[config.inputbrokerEventPress]} />
      <ConfigRow label="Up/Down Enabled" value={config.updown1Enabled} />
    </Box>
  );
}

function AudioConfigView({ config }: { config?: ModuleConfig.ModuleConfig_AudioConfig }) {
  if (!config) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <ConfigRow label="Codec2 Enabled" value={config.codec2Enabled} valueColor={config.codec2Enabled ? theme.status.online : theme.status.offline} />
      <ConfigRow label="PTT GPIO" value={config.pttPin || "Default"} />
      <ConfigRow label="Bitrate" value={ModuleConfig.ModuleConfig_AudioConfig_Audio_Baud[config.bitrate]} />
      <ConfigRow label="I2S WS" value={config.i2sWs || "Default"} />
      <ConfigRow label="I2S SD" value={config.i2sSd || "Default"} />
      <ConfigRow label="I2S DIN" value={config.i2sDin || "Default"} />
      <ConfigRow label="I2S SCK" value={config.i2sSck || "Default"} />
    </Box>
  );
}

function RemoteHwConfigView({ config }: { config?: ModuleConfig.ModuleConfig_RemoteHardwareConfig }) {
  if (!config) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <ConfigRow label="Enabled" value={config.enabled} valueColor={config.enabled ? theme.status.online : theme.status.offline} />
      <ConfigRow label="Allow Undefined Pins" value={config.allowUndefinedPinAccess} />
      <ConfigRow label="Available Pins" value={`${config.availablePins?.length || 0} configured`} />
    </Box>
  );
}

function NeighborInfoConfigView({ config }: { config?: ModuleConfig.ModuleConfig_NeighborInfoConfig }) {
  if (!config) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <ConfigRow label="Enabled" value={config.enabled} valueColor={config.enabled ? theme.status.online : theme.status.offline} />
      <ConfigRow label="Update Interval" value={`${config.updateInterval || 0}s`} />
      <ConfigRow label="Transmit Over LoRa" value={config.transmitOverLora} />
    </Box>
  );
}

function AmbientLightConfigView({ config }: { config?: ModuleConfig.ModuleConfig_AmbientLightingConfig }) {
  if (!config) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <ConfigRow label="LED State" value={config.ledState} valueColor={config.ledState ? theme.status.online : theme.status.offline} />
      <ConfigRow label="Current" value={config.current || "Default"} />
      <ConfigRow label="Red" value={config.red || 0} />
      <ConfigRow label="Green" value={config.green || 0} />
      <ConfigRow label="Blue" value={config.blue || 0} />
    </Box>
  );
}

function DetectionSensorConfigView({ config }: { config?: ModuleConfig.ModuleConfig_DetectionSensorConfig }) {
  if (!config) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <ConfigRow label="Enabled" value={config.enabled} valueColor={config.enabled ? theme.status.online : theme.status.offline} />
      <ConfigRow label="Minimum Broadcast" value={`${config.minimumBroadcastSecs || 0}s`} />
      <ConfigRow label="State Broadcast" value={`${config.stateBroadcastSecs || 0}s`} />
      <ConfigRow label="Send Bell" value={config.sendBell} />
      <ConfigRow label="Name" value={config.name || "Not set"} />
      <ConfigRow label="Monitor Pin" value={config.monitorPin || "Default"} />
      <ConfigRow label="Detection Triggered High" value={config.detectionTriggeredHigh} />
      <ConfigRow label="Use Pull-up" value={config.usePullup} />
    </Box>
  );
}

function PaxcounterConfigView({ config }: { config?: ModuleConfig.ModuleConfig_PaxcounterConfig }) {
  if (!config) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <ConfigRow label="Enabled" value={config.enabled} valueColor={config.enabled ? theme.status.online : theme.status.offline} />
      <ConfigRow label="Update Interval" value={`${config.paxcounterUpdateInterval || 0}s`} />
      <ConfigRow label="WiFi Threshold" value={config.wifiThreshold !== undefined ? `${config.wifiThreshold} dBm` : "Default"} />
      <ConfigRow label="BLE Threshold" value={config.bleThreshold !== undefined ? `${config.bleThreshold} dBm` : "Default"} />
    </Box>
  );
}

function ChannelsConfigView({ channels }: { channels?: Mesh.Channel[] }) {
  if (!channels || channels.length === 0) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      {channels.map((ch, i) => (
        <Box key={i} flexDirection="column" marginBottom={1}>
          <Box>
            <Text color={theme.fg.accent} bold>Channel {ch.index}</Text>
            <Text color={theme.fg.muted}> ({Channel.Channel_Role[ch.role]})</Text>
          </Box>
          {ch.settings && (
            <Box flexDirection="column" paddingLeft={2}>
              <ConfigRow label="Name" value={ch.settings.name || "Default"} />
              <ConfigRow label="PSK" value={ch.settings.psk?.length ? `${ch.settings.psk.length} bytes` : "Default"} />
              <ConfigRow label="Module Settings" value={ch.settings.moduleSettings ? "Configured" : "Default"} />
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}

interface EditableConfigRowProps {
  label: string;
  value: string | undefined;
  fieldKey: string;
  editingField?: string | null;
  editValue?: string;
  hint?: string;
}

function EditableConfigRow({ label, value, fieldKey, editingField, editValue, hint }: EditableConfigRowProps) {
  const isEditing = editingField === fieldKey;
  return (
    <Box>
      <Text color={theme.fg.muted}>{label.padEnd(24)}</Text>
      {isEditing ? (
        <>
          <Text color={theme.fg.accent}>{editValue}</Text>
          <Text color={theme.fg.accent}>█</Text>
          <Text color={theme.fg.muted}> (Enter=save, Esc=cancel)</Text>
        </>
      ) : (
        <>
          <Text color={theme.fg.accent}>{value || "-"}</Text>
          {hint && <Text color={theme.fg.muted}> {hint}</Text>}
        </>
      )}
    </Box>
  );
}

function UserConfigView({ owner, editingField, editValue }: { owner?: Mesh.User; editingField?: string | null; editValue?: string }) {
  if (!owner) return <NoConfigLoaded />;
  return (
    <Box flexDirection="column">
      <EditableConfigRow label="Long Name" value={owner.longName} fieldKey="longName" editingField={editingField} editValue={editValue} hint="(e to edit)" />
      <EditableConfigRow label="Short Name" value={owner.shortName} fieldKey="shortName" editingField={editingField} editValue={editValue} hint="(E to edit)" />
      <ConfigRow label="ID" value={owner.id} />
      <ConfigRow label="Hardware Model" value={owner.hwModel !== undefined ? Mesh.HardwareModel[owner.hwModel] : "Unknown"} valueColor={theme.data.hardware} />
      <ConfigRow label="Is Licensed" value={owner.isLicensed} />
      <ConfigRow label="Role" value={owner.role !== undefined ? Config.Config_DeviceConfig_Role[owner.role] : "Unknown"} />
      <ConfigRow label="Public Key" value={owner.publicKey?.length ? `${owner.publicKey.length} bytes` : "Not set"} />
    </Box>
  );
}
