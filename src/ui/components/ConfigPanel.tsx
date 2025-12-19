import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import { Config, ModuleConfig, Admin, Mesh, Channel } from "@meshtastic/protobufs";
import { CONFIG_TYPE_LABELS, MODULE_CONFIG_TYPE_LABELS, ConfigType, ModuleConfigType } from "../../protocol/admin";

// Animated loading spinner
function LoadingSpinner({ text = "Loading" }: { text?: string }) {
  const [frame, setFrame] = useState(0);
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % frames.length);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <Text color={theme.fg.muted}>
      <Text color={theme.fg.accent}>{frames[frame]}</Text> {text}...
    </Text>
  );
}

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
  | "user"
  | "local";

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
  // Local settings
  meshViewUrl?: string;
  // Editing state
  editingField?: string | null;
  editValue?: string;
  // Field selection state
  selectedFieldIndex?: number;
  // Channel editing state
  selectedChannelIndex?: number;
  // Batch edit state
  batchEditMode?: boolean;
  batchEditCount?: number;
}

interface MenuItem {
  key: ConfigSection;
  label: string;
  category: "radio" | "module" | "other" | "local";
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
  // Other (device)
  { key: "channels", label: "Channels", category: "other" },
  { key: "user", label: "User", category: "other" },
  // Local (CLI settings)
  { key: "local", label: "Local Settings", category: "local" },
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
  meshViewUrl,
  editingField,
  editValue,
  selectedChannelIndex,
  batchEditMode,
  batchEditCount,
}: ConfigPanelProps) {
  if (section === "menu") {
    return (
      <ConfigMenu
        selectedIndex={selectedMenuIndex}
        height={height}
        loading={loading}
        batchEditMode={batchEditMode}
        batchEditCount={batchEditCount}
      />
    );
  }

  // Render specific config section
  const sectionLabel = MENU_ITEMS.find((m) => m.key === section)?.label || section.toUpperCase();

  return (
    <Box flexDirection="column" height={height} width="100%">
      <Box flexDirection="column">
        <Box paddingX={1}>
          <Text color={theme.fg.muted}>CONFIG</Text>
          <Text color={theme.fg.muted}> {">"} </Text>
          <Text color={theme.fg.accent} bold>{sectionLabel}</Text>
        </Box>
        <Box paddingX={1} borderStyle="single" borderColor={theme.border.normal} borderTop borderBottom={false} borderLeft={false} borderRight={false}>
          <Text color={theme.fg.muted}>[Esc] Back | [Enter] Refresh</Text>
        </Box>
      </Box>
      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {loading ? (
          <LoadingSpinner text={`Loading ${sectionLabel.toLowerCase()}`} />
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
            meshViewUrl={meshViewUrl}
            editingField={editingField}
            editValue={editValue}
            selectedChannelIndex={selectedChannelIndex}
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
  batchEditMode,
  batchEditCount,
}: {
  selectedIndex: number;
  height: number;
  loading?: boolean;
  batchEditMode?: boolean;
  batchEditCount?: number;
}) {
  const radioItems = MENU_ITEMS.filter((m) => m.category === "radio");
  const moduleItems = MENU_ITEMS.filter((m) => m.category === "module");
  const otherItems = MENU_ITEMS.filter((m) => m.category === "other");
  const localItems = MENU_ITEMS.filter((m) => m.category === "local");

  return (
    <Box flexDirection="column" height={height} width="100%">
      <Box paddingX={1}>
        <Text color={theme.fg.accent} bold>CONFIG</Text>
        {loading && <Text color={theme.fg.muted}> <LoadingSpinner text="loading" /></Text>}
        {batchEditCount !== undefined && batchEditCount > 0 && (
          <Text color={theme.packet.encrypted}> [{batchEditCount} unsaved change{batchEditCount !== 1 ? "s" : ""}]</Text>
        )}
      </Box>

      <Box flexDirection="row" flexGrow={1} paddingX={1}>
        {/* Radio Config Column */}
        <Box flexDirection="column" width="25%">
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
        <Box flexDirection="column" width="25%">
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
        <Box flexDirection="column" width="25%">
          <Text color={theme.fg.muted} bold>DEVICE</Text>
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

        {/* Local Config Column */}
        <Box flexDirection="column" width="25%">
          <Text color={theme.fg.muted} bold>LOCAL</Text>
          {localItems.map((item, i) => {
            const globalIndex = radioItems.length + moduleItems.length + otherItems.length + i;
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
        {batchEditCount !== undefined && batchEditCount > 0 ? (
          <Text color={theme.fg.muted}>h/j/k/l navigate • Enter select • c commit • C discard • r reboot</Text>
        ) : (
          <Text color={theme.fg.muted}>h/j/k/l navigate • Enter select • r reboot</Text>
        )}
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
  const { section, selectedFieldIndex = 0, editingField, editValue } = props;

  switch (section) {
    case "device":
      return <DeviceConfigView config={props.deviceConfig} selectedIndex={selectedFieldIndex} editingField={editingField} editValue={editValue} />;
    case "position":
      return <PositionConfigView config={props.positionConfig} selectedIndex={selectedFieldIndex} editingField={editingField} editValue={editValue} />;
    case "power":
      return <PowerConfigView config={props.powerConfig} selectedIndex={selectedFieldIndex} editingField={editingField} editValue={editValue} />;
    case "network":
      return <NetworkConfigView config={props.networkConfig} selectedIndex={selectedFieldIndex} editingField={editingField} editValue={editValue} />;
    case "display":
      return <DisplayConfigView config={props.displayConfig} selectedIndex={selectedFieldIndex} editingField={editingField} editValue={editValue} />;
    case "lora":
      return <LoRaConfigView config={props.loraConfig} selectedIndex={selectedFieldIndex} editingField={editingField} editValue={editValue} />;
    case "bluetooth":
      return <BluetoothConfigView config={props.bluetoothConfig} selectedIndex={selectedFieldIndex} editingField={editingField} editValue={editValue} />;
    case "security":
      return <SecurityConfigView config={props.securityConfig} selectedIndex={selectedFieldIndex} editingField={editingField} editValue={editValue} />;
    case "mqtt":
      return <MQTTConfigView config={props.mqttConfig} selectedIndex={selectedFieldIndex} editingField={editingField} editValue={editValue} />;
    case "serial":
      return <SerialConfigView config={props.serialConfig} selectedIndex={selectedFieldIndex} editingField={editingField} editValue={editValue} />;
    case "extnotif":
      return <ExtNotifConfigView config={props.extNotifConfig} selectedIndex={selectedFieldIndex} editingField={editingField} editValue={editValue} />;
    case "storeforward":
      return <StoreForwardConfigView config={props.storeForwardConfig} selectedIndex={selectedFieldIndex} editingField={editingField} editValue={editValue} />;
    case "rangetest":
      return <RangeTestConfigView config={props.rangeTestConfig} selectedIndex={selectedFieldIndex} editingField={editingField} editValue={editValue} />;
    case "telemetry":
      return <TelemetryConfigView config={props.telemetryConfig} selectedIndex={selectedFieldIndex} editingField={editingField} editValue={editValue} />;
    case "cannedmsg":
      return <CannedMsgConfigView config={props.cannedMsgConfig} selectedIndex={selectedFieldIndex} editingField={editingField} editValue={editValue} />;
    case "audio":
      return <AudioConfigView config={props.audioConfig} selectedIndex={selectedFieldIndex} editingField={editingField} editValue={editValue} />;
    case "remotehw":
      return <RemoteHwConfigView config={props.remoteHwConfig} selectedIndex={selectedFieldIndex} editingField={editingField} editValue={editValue} />;
    case "neighborinfo":
      return <NeighborInfoConfigView config={props.neighborInfoConfig} selectedIndex={selectedFieldIndex} editingField={editingField} editValue={editValue} />;
    case "ambientlight":
      return <AmbientLightConfigView config={props.ambientLightConfig} selectedIndex={selectedFieldIndex} editingField={editingField} editValue={editValue} />;
    case "detectionsensor":
      return <DetectionSensorConfigView config={props.detectionSensorConfig} selectedIndex={selectedFieldIndex} editingField={editingField} editValue={editValue} />;
    case "paxcounter":
      return <PaxcounterConfigView config={props.paxcounterConfig} selectedIndex={selectedFieldIndex} editingField={editingField} editValue={editValue} />;
    case "channels":
      return <ChannelsConfigView channels={props.channels} selectedIndex={props.selectedChannelIndex} editingField={props.editingField} editValue={props.editValue} />;
    case "user":
      return <UserConfigView owner={props.owner} editingField={props.editingField} editValue={props.editValue} />;
    case "local":
      return <LocalConfigView meshViewUrl={props.meshViewUrl} editingField={props.editingField} editValue={props.editValue} />;
    default:
      return <Text color={theme.fg.muted}>Section not implemented</Text>;
  }
}

// Field definition for editable configs
interface ConfigFieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "enum";
  enumValues?: Record<number, string>;
  suffix?: string;
}

// Helper component for config rows (non-selectable)
function ConfigRow({ label, value, valueColor }: { label: string; value: string | number | boolean | undefined; valueColor?: string }) {
  const displayValue = value === undefined ? "-" : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  return (
    <Box>
      <Text color={theme.fg.muted}>{label.padEnd(24)}</Text>
      <Text color={valueColor || theme.fg.primary}>{displayValue}</Text>
    </Box>
  );
}

// Selectable config row with editing support
interface SelectableRowProps {
  label: string;
  value: string | number | boolean | undefined;
  isSelected: boolean;
  isEditing: boolean;
  editValue?: string;
  valueColor?: string;
  fieldType: "text" | "number" | "boolean" | "enum";
  hint?: string;
}

function SelectableConfigRow({ label, value, isSelected, isEditing, editValue, valueColor, fieldType, hint }: SelectableRowProps) {
  const displayValue = value === undefined ? "-" : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);

  return (
    <Box backgroundColor={isSelected && !isEditing ? theme.bg.selected : undefined}>
      <Text color={isSelected ? theme.fg.accent : theme.fg.muted}>{isSelected ? "▶ " : "  "}</Text>
      <Text color={theme.fg.muted}>{label.padEnd(22)}</Text>
      {isEditing ? (
        <>
          <Text color={theme.fg.accent}>{editValue}</Text>
          <Text color={theme.fg.accent}>█</Text>
          <Text color={theme.fg.muted}> (Enter=save, Esc=cancel)</Text>
        </>
      ) : (
        <>
          <Text color={valueColor || theme.fg.primary}>{displayValue}</Text>
          {isSelected && hint && <Text color={theme.fg.muted}> {hint}</Text>}
          {isSelected && !hint && fieldType === "boolean" && <Text color={theme.fg.muted}> [Space] toggle</Text>}
          {isSelected && !hint && fieldType === "enum" && <Text color={theme.fg.muted}> [Space] cycle</Text>}
          {isSelected && !hint && (fieldType === "text" || fieldType === "number") && <Text color={theme.fg.muted}> [Enter] edit</Text>}
        </>
      )}
    </Box>
  );
}

function NoConfigLoaded() {
  return <Text color={theme.fg.muted}>Config not loaded. Press Enter to request.</Text>;
}

// Device config field definitions for editing
const DEVICE_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "role", label: "Role", type: "enum" },
  { key: "rebroadcastMode", label: "Rebroadcast Mode", type: "enum" },
  { key: "nodeInfoBroadcastSecs", label: "Node Info Broadcast", type: "number", suffix: "s" },
  { key: "doubleTapAsButtonPress", label: "Double Tap Button", type: "boolean" },
  { key: "disableTripleClick", label: "Disable Triple Click", type: "boolean" },
  { key: "ledHeartbeatDisabled", label: "LED Heartbeat Disabled", type: "boolean" },
  { key: "buzzerMode", label: "Buzzer Mode", type: "enum" },
  { key: "buttonGpio", label: "Button GPIO", type: "number" },
  { key: "buzzerGpio", label: "Buzzer GPIO", type: "number" },
  { key: "tzdef", label: "Timezone", type: "text" },
];

// Export field counts for each config section
export const CONFIG_FIELD_COUNTS: Record<string, number> = {
  device: DEVICE_CONFIG_FIELDS.length,
  position: 10,
  power: 8,
  network: 8,
  display: 11,
  lora: 14,
  bluetooth: 3,
  security: 7,
  mqtt: 10,
  serial: 8,
  extnotif: 13,
  storeforward: 6,
  rangetest: 3,
  telemetry: 12,
  cannedmsg: 6,
  audio: 7,
  remotehw: 3,
  neighborinfo: 3,
  ambientlight: 5,
  detectionsensor: 8,
  paxcounter: 4,
};

interface EditableConfigViewProps {
  selectedIndex?: number;
  editingField?: string | null;
  editValue?: string;
}

// Individual config views
function DeviceConfigView({ config, selectedIndex = 0, editingField, editValue }: { config?: Config.Config_DeviceConfig } & EditableConfigViewProps) {
  if (!config) return <NoConfigLoaded />;

  const getFieldValue = (key: string): string | number | boolean => {
    switch (key) {
      case "role": return Config.Config_DeviceConfig_Role[config.role];
      case "rebroadcastMode": return Config.Config_DeviceConfig_RebroadcastMode[config.rebroadcastMode];
      case "nodeInfoBroadcastSecs": return `${config.nodeInfoBroadcastSecs}s`;
      case "doubleTapAsButtonPress": return config.doubleTapAsButtonPress;
      case "disableTripleClick": return config.disableTripleClick;
      case "ledHeartbeatDisabled": return config.ledHeartbeatDisabled;
      case "buzzerMode": return Config.Config_DeviceConfig_BuzzerMode[config.buzzerMode];
      case "buttonGpio": return config.buttonGpio || "Default";
      case "buzzerGpio": return config.buzzerGpio || "Default";
      case "tzdef": return config.tzdef || "Not set";
      default: return "-";
    }
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={theme.fg.muted}>j/k navigate • Enter/Space edit • Esc cancel</Text>
      </Box>
      {DEVICE_CONFIG_FIELDS.map((field, i) => (
        <SelectableConfigRow
          key={field.key}
          label={field.label}
          value={getFieldValue(field.key)}
          isSelected={i === selectedIndex}
          isEditing={editingField === `device_${field.key}`}
          editValue={editValue}
          fieldType={field.type}
          valueColor={field.key === "role" ? theme.fg.accent : undefined}
        />
      ))}
    </Box>
  );
}

const POSITION_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "gpsMode", label: "GPS Mode", type: "enum" },
  { key: "fixedPosition", label: "Fixed Position", type: "boolean" },
  { key: "positionBroadcastSecs", label: "Position Broadcast", type: "number", suffix: "s" },
  { key: "positionBroadcastSmartEnabled", label: "Smart Broadcast", type: "boolean" },
  { key: "broadcastSmartMinimumDistance", label: "Smart Min Distance", type: "number", suffix: "m" },
  { key: "broadcastSmartMinimumIntervalSecs", label: "Smart Min Interval", type: "number", suffix: "s" },
  { key: "gpsUpdateInterval", label: "GPS Update Interval", type: "number", suffix: "s" },
  { key: "rxGpio", label: "RX GPIO", type: "number" },
  { key: "txGpio", label: "TX GPIO", type: "number" },
  { key: "gpsEnGpio", label: "GPS EN GPIO", type: "number" },
];

function PositionConfigView({ config, selectedIndex = 0, editingField, editValue }: { config?: Config.Config_PositionConfig } & EditableConfigViewProps) {
  if (!config) return <NoConfigLoaded />;

  const getFieldValue = (key: string): string | number | boolean => {
    switch (key) {
      case "gpsMode": return Config.Config_PositionConfig_GpsMode[config.gpsMode];
      case "fixedPosition": return config.fixedPosition;
      case "positionBroadcastSecs": return `${config.positionBroadcastSecs}s`;
      case "positionBroadcastSmartEnabled": return config.positionBroadcastSmartEnabled;
      case "broadcastSmartMinimumDistance": return `${config.broadcastSmartMinimumDistance}m`;
      case "broadcastSmartMinimumIntervalSecs": return `${config.broadcastSmartMinimumIntervalSecs}s`;
      case "gpsUpdateInterval": return `${config.gpsUpdateInterval}s`;
      case "rxGpio": return config.rxGpio || "Default";
      case "txGpio": return config.txGpio || "Default";
      case "gpsEnGpio": return config.gpsEnGpio || "Default";
      default: return "-";
    }
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={theme.fg.muted}>j/k navigate • Enter/Space edit • Esc cancel</Text>
      </Box>
      {POSITION_CONFIG_FIELDS.map((field, i) => (
        <SelectableConfigRow
          key={field.key}
          label={field.label}
          value={getFieldValue(field.key)}
          isSelected={i === selectedIndex}
          isEditing={editingField === `position_${field.key}`}
          editValue={editValue}
          fieldType={field.type}
          valueColor={field.key === "gpsMode" ? theme.fg.accent : undefined}
        />
      ))}
    </Box>
  );
}

const POWER_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "isPowerSaving", label: "Power Saving", type: "boolean" },
  { key: "onBatteryShutdownAfterSecs", label: "Shutdown After (battery)", type: "number", suffix: "s" },
  { key: "adcMultiplierOverride", label: "ADC Multiplier", type: "number" },
  { key: "waitBluetoothSecs", label: "Wait Bluetooth", type: "number", suffix: "s" },
  { key: "lsSecs", label: "Light Sleep", type: "number", suffix: "s" },
  { key: "sdsSecs", label: "Super Deep Sleep", type: "number", suffix: "s" },
  { key: "minWakeSecs", label: "Min Wake", type: "number", suffix: "s" },
  { key: "deviceBatteryInaAddress", label: "Battery INA Address", type: "number" },
];

function PowerConfigView({ config, selectedIndex = 0, editingField, editValue }: { config?: Config.Config_PowerConfig } & EditableConfigViewProps) {
  if (!config) return <NoConfigLoaded />;

  const getFieldValue = (key: string): string | number | boolean => {
    switch (key) {
      case "isPowerSaving": return config.isPowerSaving;
      case "onBatteryShutdownAfterSecs": return config.onBatteryShutdownAfterSecs ? `${config.onBatteryShutdownAfterSecs}s` : "Disabled";
      case "adcMultiplierOverride": return config.adcMultiplierOverride || "Default";
      case "waitBluetoothSecs": return `${config.waitBluetoothSecs || 60}s`;
      case "lsSecs": return `${config.lsSecs || 300}s`;
      case "sdsSecs": return config.sdsSecs ? `${config.sdsSecs}s` : "1 year";
      case "minWakeSecs": return `${config.minWakeSecs || 10}s`;
      case "deviceBatteryInaAddress": return config.deviceBatteryInaAddress ? `0x${config.deviceBatteryInaAddress.toString(16)}` : "Not set";
      default: return "-";
    }
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={theme.fg.muted}>j/k navigate • Enter/Space edit • Esc cancel</Text>
      </Box>
      {POWER_CONFIG_FIELDS.map((field, i) => (
        <SelectableConfigRow
          key={field.key}
          label={field.label}
          value={getFieldValue(field.key)}
          isSelected={i === selectedIndex}
          isEditing={editingField === `power_${field.key}`}
          editValue={editValue}
          fieldType={field.type}
          valueColor={field.key === "isPowerSaving" && config.isPowerSaving ? theme.status.online : undefined}
        />
      ))}
    </Box>
  );
}

const NETWORK_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "wifiEnabled", label: "WiFi Enabled", type: "boolean" },
  { key: "wifiSsid", label: "WiFi SSID", type: "text" },
  { key: "wifiPsk", label: "WiFi PSK", type: "text" },
  { key: "ethEnabled", label: "Ethernet Enabled", type: "boolean" },
  { key: "addressMode", label: "Address Mode", type: "enum" },
  { key: "ntpServer", label: "NTP Server", type: "text" },
  { key: "rsyslogServer", label: "Rsyslog Server", type: "text" },
  { key: "ipv6Enabled", label: "IPv6 Enabled", type: "boolean" },
];

function NetworkConfigView({ config, selectedIndex = 0, editingField, editValue }: { config?: Config.Config_NetworkConfig } & EditableConfigViewProps) {
  if (!config) return <NoConfigLoaded />;

  const getFieldValue = (key: string): string | number | boolean => {
    switch (key) {
      case "wifiEnabled": return config.wifiEnabled;
      case "wifiSsid": return config.wifiSsid || "Not set";
      case "wifiPsk": return config.wifiPsk ? "********" : "Not set";
      case "ethEnabled": return config.ethEnabled;
      case "addressMode": return Config.Config_NetworkConfig_AddressMode[config.addressMode];
      case "ntpServer": return config.ntpServer || "meshtastic.pool.ntp.org";
      case "rsyslogServer": return config.rsyslogServer || "Not set";
      case "ipv6Enabled": return config.ipv6Enabled;
      default: return "-";
    }
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={theme.fg.muted}>j/k navigate • Enter/Space edit • Esc cancel</Text>
      </Box>
      {NETWORK_CONFIG_FIELDS.map((field, i) => (
        <SelectableConfigRow
          key={field.key}
          label={field.label}
          value={getFieldValue(field.key)}
          isSelected={i === selectedIndex}
          isEditing={editingField === `network_${field.key}`}
          editValue={editValue}
          fieldType={field.type}
          valueColor={field.key === "wifiEnabled" ? (config.wifiEnabled ? theme.status.online : theme.status.offline) : undefined}
        />
      ))}
    </Box>
  );
}

const DISPLAY_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "screenOnSecs", label: "Screen On", type: "number", suffix: "s" },
  { key: "gpsFormat", label: "GPS Format", type: "enum" },
  { key: "autoScreenCarouselSecs", label: "Auto Carousel", type: "number", suffix: "s" },
  { key: "compassNorthTop", label: "Compass North Top", type: "boolean" },
  { key: "flipScreen", label: "Flip Screen", type: "boolean" },
  { key: "units", label: "Units", type: "enum" },
  { key: "oled", label: "OLED Type", type: "enum" },
  { key: "displaymode", label: "Display Mode", type: "enum" },
  { key: "headingBold", label: "Heading Bold", type: "boolean" },
  { key: "wakeOnTapOrMotion", label: "Wake on Tap/Motion", type: "boolean" },
  { key: "use12hClock", label: "12h Clock", type: "boolean" },
];

function DisplayConfigView({ config, selectedIndex = 0, editingField, editValue }: { config?: Config.Config_DisplayConfig } & EditableConfigViewProps) {
  if (!config) return <NoConfigLoaded />;

  const getFieldValue = (key: string): string | number | boolean => {
    switch (key) {
      case "screenOnSecs": return `${config.screenOnSecs || 60}s`;
      case "gpsFormat": return Config.Config_DisplayConfig_GpsCoordinateFormat[config.gpsFormat];
      case "autoScreenCarouselSecs": return config.autoScreenCarouselSecs ? `${config.autoScreenCarouselSecs}s` : "Disabled";
      case "compassNorthTop": return config.compassNorthTop;
      case "flipScreen": return config.flipScreen;
      case "units": return Config.Config_DisplayConfig_DisplayUnits[config.units];
      case "oled": return Config.Config_DisplayConfig_OledType[config.oled];
      case "displaymode": return Config.Config_DisplayConfig_DisplayMode[config.displaymode];
      case "headingBold": return config.headingBold;
      case "wakeOnTapOrMotion": return config.wakeOnTapOrMotion;
      case "use12hClock": return config.use12hClock;
      default: return "-";
    }
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={theme.fg.muted}>j/k navigate • Enter/Space edit • Esc cancel</Text>
      </Box>
      {DISPLAY_CONFIG_FIELDS.map((field, i) => (
        <SelectableConfigRow key={field.key} label={field.label} value={getFieldValue(field.key)} isSelected={i === selectedIndex} isEditing={editingField === `display_${field.key}`} editValue={editValue} fieldType={field.type} />
      ))}
    </Box>
  );
}

const LORA_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "region", label: "Region", type: "enum" },
  { key: "usePreset", label: "Use Preset", type: "boolean" },
  { key: "modemPreset", label: "Modem Preset", type: "enum" },
  { key: "bandwidth", label: "Bandwidth", type: "number", suffix: " kHz" },
  { key: "spreadFactor", label: "Spread Factor", type: "number" },
  { key: "codingRate", label: "Coding Rate", type: "number" },
  { key: "hopLimit", label: "Hop Limit", type: "number" },
  { key: "txEnabled", label: "TX Enabled", type: "boolean" },
  { key: "txPower", label: "TX Power", type: "number", suffix: " dBm" },
  { key: "channelNum", label: "Channel Num", type: "number" },
  { key: "overrideDutyCycle", label: "Override Duty Cycle", type: "boolean" },
  { key: "sx126xRxBoostedGain", label: "SX126x RX Boost", type: "boolean" },
  { key: "overrideFrequency", label: "Override Frequency", type: "number", suffix: " MHz" },
  { key: "ignoreMqtt", label: "Ignore MQTT", type: "boolean" },
];

function LoRaConfigView({ config, selectedIndex = 0, editingField, editValue }: { config?: Config.Config_LoRaConfig } & EditableConfigViewProps) {
  if (!config) return <NoConfigLoaded />;

  const getFieldValue = (key: string): string | number | boolean => {
    switch (key) {
      case "region": return Config.Config_LoRaConfig_RegionCode[config.region];
      case "usePreset": return config.usePreset;
      case "modemPreset": return Config.Config_LoRaConfig_ModemPreset[config.modemPreset];
      case "bandwidth": return config.bandwidth ? `${config.bandwidth} kHz` : "Preset";
      case "spreadFactor": return config.spreadFactor || "Preset";
      case "codingRate": return config.codingRate ? `4/${config.codingRate}` : "Preset";
      case "hopLimit": return config.hopLimit || 3;
      case "txEnabled": return config.txEnabled;
      case "txPower": return config.txPower ? `${config.txPower} dBm` : "Default";
      case "channelNum": return config.channelNum || "Auto";
      case "overrideDutyCycle": return config.overrideDutyCycle;
      case "sx126xRxBoostedGain": return config.sx126xRxBoostedGain;
      case "overrideFrequency": return config.overrideFrequency ? `${config.overrideFrequency} MHz` : "Not set";
      case "ignoreMqtt": return config.ignoreMqtt;
      default: return "-";
    }
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={theme.fg.muted}>j/k navigate • Enter/Space edit • Esc cancel</Text>
      </Box>
      {LORA_CONFIG_FIELDS.map((field, i) => (
        <SelectableConfigRow key={field.key} label={field.label} value={getFieldValue(field.key)} isSelected={i === selectedIndex} isEditing={editingField === `lora_${field.key}`} editValue={editValue} fieldType={field.type} valueColor={field.key === "region" ? theme.fg.accent : field.key === "modemPreset" ? theme.packet.telemetry : field.key === "txEnabled" ? (config.txEnabled ? theme.status.online : theme.status.offline) : undefined} />
      ))}
    </Box>
  );
}

const BLUETOOTH_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "enabled", label: "Enabled", type: "boolean" },
  { key: "mode", label: "Pairing Mode", type: "enum" },
  { key: "fixedPin", label: "Fixed PIN", type: "number" },
];

function BluetoothConfigView({ config, selectedIndex = 0, editingField, editValue }: { config?: Config.Config_BluetoothConfig } & EditableConfigViewProps) {
  if (!config) return <NoConfigLoaded />;

  const getFieldValue = (key: string): string | number | boolean => {
    switch (key) {
      case "enabled": return config.enabled;
      case "mode": return Config.Config_BluetoothConfig_PairingMode[config.mode];
      case "fixedPin": return config.fixedPin || "Not set";
      default: return "-";
    }
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={theme.fg.muted}>j/k navigate • Enter/Space edit • Esc cancel</Text>
      </Box>
      {BLUETOOTH_CONFIG_FIELDS.map((field, i) => (
        <SelectableConfigRow key={field.key} label={field.label} value={getFieldValue(field.key)} isSelected={i === selectedIndex} isEditing={editingField === `bluetooth_${field.key}`} editValue={editValue} fieldType={field.type} valueColor={field.key === "enabled" ? (config.enabled ? theme.status.online : theme.status.offline) : undefined} />
      ))}
    </Box>
  );
}

const SECURITY_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "serialEnabled", label: "Serial Enabled", type: "boolean" },
  { key: "debugLogApiEnabled", label: "Debug Log API", type: "boolean" },
  { key: "adminChannelEnabled", label: "Admin Channel", type: "boolean" },
  { key: "isManaged", label: "Is Managed", type: "boolean" },
];

function SecurityConfigView({ config, selectedIndex = 0, editingField, editValue }: { config?: Config.Config_SecurityConfig } & EditableConfigViewProps) {
  if (!config) return <NoConfigLoaded />;

  const getFieldValue = (key: string): string | number | boolean => {
    switch (key) {
      case "serialEnabled": return config.serialEnabled;
      case "debugLogApiEnabled": return config.debugLogApiEnabled;
      case "adminChannelEnabled": return config.adminChannelEnabled;
      case "isManaged": return config.isManaged;
      default: return "-";
    }
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={theme.fg.muted}>j/k navigate • Enter/Space edit • Esc cancel</Text>
      </Box>
      {SECURITY_CONFIG_FIELDS.map((field, i) => (
        <SelectableConfigRow key={field.key} label={field.label} value={getFieldValue(field.key)} isSelected={i === selectedIndex} isEditing={editingField === `security_${field.key}`} editValue={editValue} fieldType={field.type} />
      ))}
      <ConfigRow label="Public Key" value={config.publicKey?.length ? `${config.publicKey.length} bytes` : "Not set"} />
      <ConfigRow label="Private Key" value={config.privateKey?.length ? "********" : "Not set"} />
      <ConfigRow label="Admin Keys" value={`${config.adminKey?.length || 0} configured`} />
    </Box>
  );
}

const MQTT_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "enabled", label: "Enabled", type: "boolean" },
  { key: "address", label: "Address", type: "text" },
  { key: "username", label: "Username", type: "text" },
  { key: "password", label: "Password", type: "text" },
  { key: "encryptionEnabled", label: "Encryption", type: "boolean" },
  { key: "jsonEnabled", label: "JSON Enabled", type: "boolean" },
  { key: "tlsEnabled", label: "TLS Enabled", type: "boolean" },
  { key: "root", label: "Root Topic", type: "text" },
  { key: "proxyToClientEnabled", label: "Proxy to Serial", type: "boolean" },
  { key: "mapReportingEnabled", label: "Map Reporting", type: "boolean" },
];

function MQTTConfigView({ config, selectedIndex = 0, editingField, editValue }: { config?: ModuleConfig.ModuleConfig_MQTTConfig } & EditableConfigViewProps) {
  if (!config) return <NoConfigLoaded />;
  const getFieldValue = (key: string): string | number | boolean => {
    switch (key) {
      case "enabled": return config.enabled;
      case "address": return config.address || "mqtt.meshtastic.org";
      case "username": return config.username || "meshdev";
      case "password": return config.password ? "********" : "large4cats";
      case "encryptionEnabled": return config.encryptionEnabled;
      case "jsonEnabled": return config.jsonEnabled;
      case "tlsEnabled": return config.tlsEnabled;
      case "root": return config.root || "msh";
      case "proxyToClientEnabled": return config.proxyToClientEnabled;
      case "mapReportingEnabled": return config.mapReportingEnabled;
      default: return "-";
    }
  };
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text color={theme.fg.muted}>j/k navigate • Enter/Space edit • Esc cancel</Text></Box>
      {MQTT_CONFIG_FIELDS.map((field, i) => (
        <SelectableConfigRow key={field.key} label={field.label} value={getFieldValue(field.key)} isSelected={i === selectedIndex} isEditing={editingField === `mqtt_${field.key}`} editValue={editValue} fieldType={field.type} valueColor={field.key === "enabled" ? (config.enabled ? theme.status.online : theme.status.offline) : undefined} />
      ))}
    </Box>
  );
}

const SERIAL_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "enabled", label: "Enabled", type: "boolean" },
  { key: "echo", label: "Echo", type: "boolean" },
  { key: "rxd", label: "RX GPIO", type: "number" },
  { key: "txd", label: "TX GPIO", type: "number" },
  { key: "baud", label: "Baud Rate", type: "enum" },
  { key: "mode", label: "Mode", type: "enum" },
  { key: "timeout", label: "Timeout", type: "number", suffix: "ms" },
  { key: "overrideConsoleBaudRate", label: "Override Console Baud", type: "enum" },
];

function SerialConfigView({ config, selectedIndex = 0, editingField, editValue }: { config?: ModuleConfig.ModuleConfig_SerialConfig } & EditableConfigViewProps) {
  if (!config) return <NoConfigLoaded />;
  const getFieldValue = (key: string): string | number | boolean => {
    switch (key) {
      case "enabled": return config.enabled;
      case "echo": return config.echo;
      case "rxd": return config.rxd || "Default";
      case "txd": return config.txd || "Default";
      case "baud": return ModuleConfig.ModuleConfig_SerialConfig_Serial_Baud[config.baud];
      case "mode": return ModuleConfig.ModuleConfig_SerialConfig_Serial_Mode[config.mode];
      case "timeout": return `${config.timeout || 0}ms`;
      case "overrideConsoleBaudRate": return config.overrideConsoleBaudRate ? ModuleConfig.ModuleConfig_SerialConfig_Serial_Baud[config.overrideConsoleBaudRate] : "Default";
      default: return "-";
    }
  };
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text color={theme.fg.muted}>j/k navigate • Enter/Space edit • Esc cancel</Text></Box>
      {SERIAL_CONFIG_FIELDS.map((field, i) => (
        <SelectableConfigRow key={field.key} label={field.label} value={getFieldValue(field.key)} isSelected={i === selectedIndex} isEditing={editingField === `serial_${field.key}`} editValue={editValue} fieldType={field.type} valueColor={field.key === "enabled" ? (config.enabled ? theme.status.online : theme.status.offline) : undefined} />
      ))}
    </Box>
  );
}

const EXTNOTIF_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "enabled", label: "Enabled", type: "boolean" },
  { key: "output", label: "Output GPIO", type: "number" },
  { key: "outputVibra", label: "Output Vibra", type: "number" },
  { key: "outputBuzzer", label: "Output Buzzer", type: "number" },
  { key: "active", label: "Active", type: "boolean" },
  { key: "alertMessage", label: "Alert Message", type: "boolean" },
  { key: "alertMessageVibra", label: "Alert Message Vibra", type: "boolean" },
  { key: "alertMessageBuzzer", label: "Alert Message Buzzer", type: "boolean" },
  { key: "alertBell", label: "Alert Bell", type: "boolean" },
  { key: "alertBellVibra", label: "Alert Bell Vibra", type: "boolean" },
  { key: "alertBellBuzzer", label: "Alert Bell Buzzer", type: "boolean" },
  { key: "usePwm", label: "Use PWM", type: "boolean" },
  { key: "nagTimeout", label: "NAG Timeout", type: "number", suffix: "s" },
];

function ExtNotifConfigView({ config, selectedIndex = 0, editingField, editValue }: { config?: ModuleConfig.ModuleConfig_ExternalNotificationConfig } & EditableConfigViewProps) {
  if (!config) return <NoConfigLoaded />;
  const getFieldValue = (key: string): string | number | boolean => {
    switch (key) {
      case "enabled": return config.enabled;
      case "output": return config.output || "Default";
      case "outputVibra": return config.outputVibra || "Not set";
      case "outputBuzzer": return config.outputBuzzer || "Not set";
      case "active": return config.active;
      case "alertMessage": return config.alertMessage;
      case "alertMessageVibra": return config.alertMessageVibra;
      case "alertMessageBuzzer": return config.alertMessageBuzzer;
      case "alertBell": return config.alertBell;
      case "alertBellVibra": return config.alertBellVibra;
      case "alertBellBuzzer": return config.alertBellBuzzer;
      case "usePwm": return config.usePwm;
      case "nagTimeout": return `${config.nagTimeout || 0}s`;
      default: return "-";
    }
  };
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text color={theme.fg.muted}>j/k navigate • Enter/Space edit • Esc cancel</Text></Box>
      {EXTNOTIF_CONFIG_FIELDS.map((field, i) => (
        <SelectableConfigRow key={field.key} label={field.label} value={getFieldValue(field.key)} isSelected={i === selectedIndex} isEditing={editingField === `extnotif_${field.key}`} editValue={editValue} fieldType={field.type} valueColor={field.key === "enabled" ? (config.enabled ? theme.status.online : theme.status.offline) : undefined} />
      ))}
    </Box>
  );
}

const STOREFORWARD_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "enabled", label: "Enabled", type: "boolean" },
  { key: "heartbeat", label: "Heartbeat", type: "boolean" },
  { key: "records", label: "Records", type: "number" },
  { key: "historyReturnMax", label: "History Return Max", type: "number" },
  { key: "historyReturnWindow", label: "History Return Window", type: "number", suffix: "s" },
  { key: "isServer", label: "Is Server", type: "boolean" },
];

function StoreForwardConfigView({ config, selectedIndex = 0, editingField, editValue }: { config?: ModuleConfig.ModuleConfig_StoreForwardConfig } & EditableConfigViewProps) {
  if (!config) return <NoConfigLoaded />;
  const getFieldValue = (key: string): string | number | boolean => {
    switch (key) {
      case "enabled": return config.enabled;
      case "heartbeat": return config.heartbeat;
      case "records": return config.records || "Default";
      case "historyReturnMax": return config.historyReturnMax || "Default";
      case "historyReturnWindow": return `${config.historyReturnWindow || 0}s`;
      case "isServer": return config.isServer;
      default: return "-";
    }
  };
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text color={theme.fg.muted}>j/k navigate • Enter/Space edit • Esc cancel</Text></Box>
      {STOREFORWARD_CONFIG_FIELDS.map((field, i) => (
        <SelectableConfigRow key={field.key} label={field.label} value={getFieldValue(field.key)} isSelected={i === selectedIndex} isEditing={editingField === `storeforward_${field.key}`} editValue={editValue} fieldType={field.type} valueColor={field.key === "enabled" ? (config.enabled ? theme.status.online : theme.status.offline) : undefined} />
      ))}
    </Box>
  );
}

const RANGETEST_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "enabled", label: "Enabled", type: "boolean" },
  { key: "sender", label: "Sender", type: "number", suffix: "s" },
  { key: "save", label: "Save to CSV", type: "boolean" },
];

function RangeTestConfigView({ config, selectedIndex = 0, editingField, editValue }: { config?: ModuleConfig.ModuleConfig_RangeTestConfig } & EditableConfigViewProps) {
  if (!config) return <NoConfigLoaded />;
  const getFieldValue = (key: string): string | number | boolean => {
    switch (key) {
      case "enabled": return config.enabled;
      case "sender": return `${config.sender || 0}s`;
      case "save": return config.save;
      default: return "-";
    }
  };
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text color={theme.fg.muted}>j/k navigate • Enter/Space edit • Esc cancel</Text></Box>
      {RANGETEST_CONFIG_FIELDS.map((field, i) => (
        <SelectableConfigRow key={field.key} label={field.label} value={getFieldValue(field.key)} isSelected={i === selectedIndex} isEditing={editingField === `rangetest_${field.key}`} editValue={editValue} fieldType={field.type} valueColor={field.key === "enabled" ? (config.enabled ? theme.status.online : theme.status.offline) : undefined} />
      ))}
    </Box>
  );
}

const TELEMETRY_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "deviceUpdateInterval", label: "Device Update Interval", type: "number", suffix: "s" },
  { key: "environmentUpdateInterval", label: "Environment Update Interval", type: "number", suffix: "s" },
  { key: "environmentMeasurementEnabled", label: "Environment Display", type: "boolean" },
  { key: "environmentScreenEnabled", label: "Environment Screen", type: "boolean" },
  { key: "airQualityInterval", label: "Air Quality Interval", type: "number", suffix: "s" },
  { key: "airQualityEnabled", label: "Air Quality Enabled", type: "boolean" },
  { key: "powerMeasurementEnabled", label: "Power Measurement", type: "boolean" },
  { key: "powerUpdateInterval", label: "Power Update Interval", type: "number", suffix: "s" },
  { key: "powerScreenEnabled", label: "Power Screen", type: "boolean" },
  { key: "healthMeasurementEnabled", label: "Health Measurement", type: "boolean" },
  { key: "healthUpdateInterval", label: "Health Update Interval", type: "number", suffix: "s" },
  { key: "healthScreenEnabled", label: "Health Screen", type: "boolean" },
];

function TelemetryConfigView({ config, selectedIndex = 0, editingField, editValue }: { config?: ModuleConfig.ModuleConfig_TelemetryConfig } & EditableConfigViewProps) {
  if (!config) return <NoConfigLoaded />;
  const getFieldValue = (key: string): string | number | boolean => {
    switch (key) {
      case "deviceUpdateInterval": return `${config.deviceUpdateInterval || 0}s`;
      case "environmentUpdateInterval": return `${config.environmentUpdateInterval || 0}s`;
      case "environmentMeasurementEnabled": return config.environmentMeasurementEnabled;
      case "environmentScreenEnabled": return config.environmentScreenEnabled;
      case "airQualityInterval": return `${config.airQualityInterval || 0}s`;
      case "airQualityEnabled": return config.airQualityEnabled;
      case "powerMeasurementEnabled": return config.powerMeasurementEnabled;
      case "powerUpdateInterval": return `${config.powerUpdateInterval || 0}s`;
      case "powerScreenEnabled": return config.powerScreenEnabled;
      case "healthMeasurementEnabled": return config.healthMeasurementEnabled;
      case "healthUpdateInterval": return `${config.healthUpdateInterval || 0}s`;
      case "healthScreenEnabled": return config.healthScreenEnabled;
      default: return "-";
    }
  };
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text color={theme.fg.muted}>j/k navigate • Enter/Space edit • Esc cancel</Text></Box>
      {TELEMETRY_CONFIG_FIELDS.map((field, i) => (
        <SelectableConfigRow key={field.key} label={field.label} value={getFieldValue(field.key)} isSelected={i === selectedIndex} isEditing={editingField === `telemetry_${field.key}`} editValue={editValue} fieldType={field.type} />
      ))}
    </Box>
  );
}

const CANNEDMSG_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "enabled", label: "Enabled", type: "boolean" },
  { key: "rotary1Enabled", label: "Rotary 1 Enabled", type: "boolean" },
  { key: "inputbrokerEventCw", label: "Input Source", type: "enum" },
  { key: "sendBell", label: "Send Bell", type: "boolean" },
  { key: "inputbrokerEventPress", label: "Allow Input Source", type: "enum" },
  { key: "updown1Enabled", label: "Up/Down Enabled", type: "boolean" },
];

function CannedMsgConfigView({ config, selectedIndex = 0, editingField, editValue }: { config?: ModuleConfig.ModuleConfig_CannedMessageConfig } & EditableConfigViewProps) {
  if (!config) return <NoConfigLoaded />;
  const getFieldValue = (key: string): string | number | boolean => {
    switch (key) {
      case "enabled": return config.enabled;
      case "rotary1Enabled": return config.rotary1Enabled;
      case "inputbrokerEventCw": return ModuleConfig.ModuleConfig_CannedMessageConfig_InputEventChar[config.inputbrokerEventCw];
      case "sendBell": return config.sendBell;
      case "inputbrokerEventPress": return ModuleConfig.ModuleConfig_CannedMessageConfig_InputEventChar[config.inputbrokerEventPress];
      case "updown1Enabled": return config.updown1Enabled;
      default: return "-";
    }
  };
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text color={theme.fg.muted}>j/k navigate • Enter/Space edit • Esc cancel</Text></Box>
      {CANNEDMSG_CONFIG_FIELDS.map((field, i) => (
        <SelectableConfigRow key={field.key} label={field.label} value={getFieldValue(field.key)} isSelected={i === selectedIndex} isEditing={editingField === `cannedmsg_${field.key}`} editValue={editValue} fieldType={field.type} valueColor={field.key === "enabled" ? (config.enabled ? theme.status.online : theme.status.offline) : undefined} />
      ))}
    </Box>
  );
}

const AUDIO_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "codec2Enabled", label: "Codec2 Enabled", type: "boolean" },
  { key: "pttPin", label: "PTT GPIO", type: "number" },
  { key: "bitrate", label: "Bitrate", type: "enum" },
  { key: "i2sWs", label: "I2S WS", type: "number" },
  { key: "i2sSd", label: "I2S SD", type: "number" },
  { key: "i2sDin", label: "I2S DIN", type: "number" },
  { key: "i2sSck", label: "I2S SCK", type: "number" },
];

function AudioConfigView({ config, selectedIndex = 0, editingField, editValue }: { config?: ModuleConfig.ModuleConfig_AudioConfig } & EditableConfigViewProps) {
  if (!config) return <NoConfigLoaded />;
  const getFieldValue = (key: string): string | number | boolean => {
    switch (key) {
      case "codec2Enabled": return config.codec2Enabled;
      case "pttPin": return config.pttPin || "Default";
      case "bitrate": return ModuleConfig.ModuleConfig_AudioConfig_Audio_Baud[config.bitrate];
      case "i2sWs": return config.i2sWs || "Default";
      case "i2sSd": return config.i2sSd || "Default";
      case "i2sDin": return config.i2sDin || "Default";
      case "i2sSck": return config.i2sSck || "Default";
      default: return "-";
    }
  };
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text color={theme.fg.muted}>j/k navigate • Enter/Space edit • Esc cancel</Text></Box>
      {AUDIO_CONFIG_FIELDS.map((field, i) => (
        <SelectableConfigRow key={field.key} label={field.label} value={getFieldValue(field.key)} isSelected={i === selectedIndex} isEditing={editingField === `audio_${field.key}`} editValue={editValue} fieldType={field.type} valueColor={field.key === "codec2Enabled" ? (config.codec2Enabled ? theme.status.online : theme.status.offline) : undefined} />
      ))}
    </Box>
  );
}

const REMOTEHW_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "enabled", label: "Enabled", type: "boolean" },
  { key: "allowUndefinedPinAccess", label: "Allow Undefined Pins", type: "boolean" },
];

function RemoteHwConfigView({ config, selectedIndex = 0, editingField, editValue }: { config?: ModuleConfig.ModuleConfig_RemoteHardwareConfig } & EditableConfigViewProps) {
  if (!config) return <NoConfigLoaded />;
  const getFieldValue = (key: string): string | number | boolean => {
    switch (key) {
      case "enabled": return config.enabled;
      case "allowUndefinedPinAccess": return config.allowUndefinedPinAccess;
      default: return "-";
    }
  };
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text color={theme.fg.muted}>j/k navigate • Enter/Space edit • Esc cancel</Text></Box>
      {REMOTEHW_CONFIG_FIELDS.map((field, i) => (
        <SelectableConfigRow key={field.key} label={field.label} value={getFieldValue(field.key)} isSelected={i === selectedIndex} isEditing={editingField === `remotehw_${field.key}`} editValue={editValue} fieldType={field.type} valueColor={field.key === "enabled" ? (config.enabled ? theme.status.online : theme.status.offline) : undefined} />
      ))}
      <ConfigRow label="Available Pins" value={`${config.availablePins?.length || 0} configured`} />
    </Box>
  );
}

const NEIGHBORINFO_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "enabled", label: "Enabled", type: "boolean" },
  { key: "updateInterval", label: "Update Interval", type: "number", suffix: "s" },
  { key: "transmitOverLora", label: "Transmit Over LoRa", type: "boolean" },
];

function NeighborInfoConfigView({ config, selectedIndex = 0, editingField, editValue }: { config?: ModuleConfig.ModuleConfig_NeighborInfoConfig } & EditableConfigViewProps) {
  if (!config) return <NoConfigLoaded />;
  const getFieldValue = (key: string): string | number | boolean => {
    switch (key) {
      case "enabled": return config.enabled;
      case "updateInterval": return `${config.updateInterval || 0}s`;
      case "transmitOverLora": return config.transmitOverLora;
      default: return "-";
    }
  };
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text color={theme.fg.muted}>j/k navigate • Enter/Space edit • Esc cancel</Text></Box>
      {NEIGHBORINFO_CONFIG_FIELDS.map((field, i) => (
        <SelectableConfigRow key={field.key} label={field.label} value={getFieldValue(field.key)} isSelected={i === selectedIndex} isEditing={editingField === `neighborinfo_${field.key}`} editValue={editValue} fieldType={field.type} valueColor={field.key === "enabled" ? (config.enabled ? theme.status.online : theme.status.offline) : undefined} />
      ))}
    </Box>
  );
}

const AMBIENTLIGHT_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "ledState", label: "LED State", type: "boolean" },
  { key: "current", label: "Current", type: "number" },
  { key: "red", label: "Red", type: "number" },
  { key: "green", label: "Green", type: "number" },
  { key: "blue", label: "Blue", type: "number" },
];

function AmbientLightConfigView({ config, selectedIndex = 0, editingField, editValue }: { config?: ModuleConfig.ModuleConfig_AmbientLightingConfig } & EditableConfigViewProps) {
  if (!config) return <NoConfigLoaded />;
  const getFieldValue = (key: string): string | number | boolean => {
    switch (key) {
      case "ledState": return config.ledState;
      case "current": return config.current || "Default";
      case "red": return config.red || 0;
      case "green": return config.green || 0;
      case "blue": return config.blue || 0;
      default: return "-";
    }
  };
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text color={theme.fg.muted}>j/k navigate • Enter/Space edit • Esc cancel</Text></Box>
      {AMBIENTLIGHT_CONFIG_FIELDS.map((field, i) => (
        <SelectableConfigRow key={field.key} label={field.label} value={getFieldValue(field.key)} isSelected={i === selectedIndex} isEditing={editingField === `ambientlight_${field.key}`} editValue={editValue} fieldType={field.type} valueColor={field.key === "ledState" ? (config.ledState ? theme.status.online : theme.status.offline) : undefined} />
      ))}
    </Box>
  );
}

const DETECTIONSENSOR_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "enabled", label: "Enabled", type: "boolean" },
  { key: "minimumBroadcastSecs", label: "Minimum Broadcast", type: "number", suffix: "s" },
  { key: "stateBroadcastSecs", label: "State Broadcast", type: "number", suffix: "s" },
  { key: "sendBell", label: "Send Bell", type: "boolean" },
  { key: "name", label: "Name", type: "text" },
  { key: "monitorPin", label: "Monitor Pin", type: "number" },
  { key: "detectionTriggeredHigh", label: "Detection Triggered High", type: "boolean" },
  { key: "usePullup", label: "Use Pull-up", type: "boolean" },
];

function DetectionSensorConfigView({ config, selectedIndex = 0, editingField, editValue }: { config?: ModuleConfig.ModuleConfig_DetectionSensorConfig } & EditableConfigViewProps) {
  if (!config) return <NoConfigLoaded />;
  const getFieldValue = (key: string): string | number | boolean => {
    switch (key) {
      case "enabled": return config.enabled;
      case "minimumBroadcastSecs": return `${config.minimumBroadcastSecs || 0}s`;
      case "stateBroadcastSecs": return `${config.stateBroadcastSecs || 0}s`;
      case "sendBell": return config.sendBell;
      case "name": return config.name || "Not set";
      case "monitorPin": return config.monitorPin || "Default";
      case "detectionTriggeredHigh": return config.detectionTriggeredHigh;
      case "usePullup": return config.usePullup;
      default: return "-";
    }
  };
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text color={theme.fg.muted}>j/k navigate • Enter/Space edit • Esc cancel</Text></Box>
      {DETECTIONSENSOR_CONFIG_FIELDS.map((field, i) => (
        <SelectableConfigRow key={field.key} label={field.label} value={getFieldValue(field.key)} isSelected={i === selectedIndex} isEditing={editingField === `detectionsensor_${field.key}`} editValue={editValue} fieldType={field.type} valueColor={field.key === "enabled" ? (config.enabled ? theme.status.online : theme.status.offline) : undefined} />
      ))}
    </Box>
  );
}

const PAXCOUNTER_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "enabled", label: "Enabled", type: "boolean" },
  { key: "paxcounterUpdateInterval", label: "Update Interval", type: "number", suffix: "s" },
  { key: "wifiThreshold", label: "WiFi Threshold", type: "number", suffix: " dBm" },
  { key: "bleThreshold", label: "BLE Threshold", type: "number", suffix: " dBm" },
];

function PaxcounterConfigView({ config, selectedIndex = 0, editingField, editValue }: { config?: ModuleConfig.ModuleConfig_PaxcounterConfig } & EditableConfigViewProps) {
  if (!config) return <NoConfigLoaded />;
  const getFieldValue = (key: string): string | number | boolean => {
    switch (key) {
      case "enabled": return config.enabled;
      case "paxcounterUpdateInterval": return `${config.paxcounterUpdateInterval || 0}s`;
      case "wifiThreshold": return config.wifiThreshold !== undefined ? `${config.wifiThreshold} dBm` : "Default";
      case "bleThreshold": return config.bleThreshold !== undefined ? `${config.bleThreshold} dBm` : "Default";
      default: return "-";
    }
  };
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text color={theme.fg.muted}>j/k navigate • Enter/Space edit • Esc cancel</Text></Box>
      {PAXCOUNTER_CONFIG_FIELDS.map((field, i) => (
        <SelectableConfigRow key={field.key} label={field.label} value={getFieldValue(field.key)} isSelected={i === selectedIndex} isEditing={editingField === `paxcounter_${field.key}`} editValue={editValue} fieldType={field.type} valueColor={field.key === "enabled" ? (config.enabled ? theme.status.online : theme.status.offline) : undefined} />
      ))}
    </Box>
  );
}

interface ChannelsConfigViewProps {
  channels?: Mesh.Channel[];
  selectedIndex?: number;
  editingField?: string | null;
  editValue?: string;
}

function ChannelsConfigView({ channels, selectedIndex = 0, editingField, editValue }: ChannelsConfigViewProps) {
  // Filter out undefined entries (sparse array) and sort by index
  const validChannels = (channels || []).filter((ch): ch is Mesh.Channel => ch != null).sort((a, b) => a.index - b.index);

  if (validChannels.length === 0) return <NoConfigLoaded />;

  // Clamp selectedIndex to valid range
  const clampedIndex = Math.min(selectedIndex, validChannels.length - 1);
  const selectedChannel = validChannels[clampedIndex];
  const roleNames = ["DISABLED", "PRIMARY", "SECONDARY"];

  // Format PSK as base64
  const formatPsk = (psk?: Uint8Array): string => {
    if (!psk || psk.length === 0) return "None (unencrypted)";
    if (psk.length === 1 && psk[0] === 0) return "None (unencrypted)";
    const binary = String.fromCharCode(...psk);
    try {
      return btoa(binary);
    } catch {
      return "Invalid key";
    }
  };

  return (
    <Box flexDirection="column">
      {/* Channel list */}
      {validChannels.map((ch, i) => {
        const isSelected = i === clampedIndex;
        const roleName = Channel.Channel_Role[ch.role] || "UNKNOWN";
        const name = ch.settings?.name || (ch.index === 0 ? "Primary" : `Ch ${ch.index}`);
        const roleColor = ch.role === 0 ? theme.fg.muted : ch.role === 1 ? theme.status.online : theme.packet.telemetry;
        return (
          <Box key={ch.index} backgroundColor={isSelected ? theme.bg.selected : undefined}>
            <Text color={isSelected ? theme.fg.accent : theme.fg.muted}>{isSelected ? "► " : "  "}</Text>
            <Text color={theme.fg.accent} bold>{`${ch.index}`.padEnd(3)}</Text>
            <Text color={ch.role === 0 ? theme.fg.muted : theme.fg.primary}>{name.padEnd(16)}</Text>
            <Text color={roleColor}>{roleName.padEnd(12)}</Text>
            <Text color={theme.fg.muted}>{ch.settings?.psk?.length ? `${ch.settings.psk.length}B key` : "default"}</Text>
          </Box>
        );
      })}

      {/* Selected channel details */}
      {selectedChannel && (
        <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor={theme.border.normal} borderTop borderBottom={false} borderLeft={false} borderRight={false}>
          <Box marginBottom={1}>
            <Text color={theme.fg.accent} bold>Channel {selectedChannel.index}</Text>
            <Text color={theme.fg.muted}> [e]name [r]role [p]psk [u]up [D]down</Text>
          </Box>
          <EditableConfigRow
            label="Name"
            value={selectedChannel.settings?.name || ""}
            fieldKey={`channel${selectedChannel.index}_name`}
            editingField={editingField}
            editValue={editValue}
            hint=""
          />
          <Box>
            <Text color={theme.fg.muted}>{"Role".padEnd(24)}</Text>
            <Text color={selectedChannel.role === 0 ? theme.fg.muted : selectedChannel.role === 1 ? theme.status.online : theme.packet.telemetry}>
              {Channel.Channel_Role[selectedChannel.role]}
            </Text>
          </Box>
          <EditableConfigRow
            label="Encryption (base64)"
            value={formatPsk(selectedChannel.settings?.psk)}
            fieldKey={`channel${selectedChannel.index}_psk`}
            editingField={editingField}
            editValue={editValue}
            hint=""
          />
          <Box>
            <Text color={theme.fg.muted}>{"Uplink Enabled".padEnd(24)}</Text>
            <Text color={selectedChannel.settings?.uplinkEnabled ? theme.status.online : theme.fg.muted}>
              {selectedChannel.settings?.uplinkEnabled ? "Yes" : "No"}
            </Text>
          </Box>
          <Box>
            <Text color={theme.fg.muted}>{"Downlink Enabled".padEnd(24)}</Text>
            <Text color={selectedChannel.settings?.downlinkEnabled ? theme.status.online : theme.fg.muted}>
              {selectedChannel.settings?.downlinkEnabled ? "Yes" : "No"}
            </Text>
          </Box>
        </Box>
      )}
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

function LocalConfigView({ meshViewUrl, editingField, editValue }: { meshViewUrl?: string; editingField?: string | null; editValue?: string }) {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={theme.fg.secondary}>Local settings are stored on this computer, not the device.</Text>
      </Box>
      <EditableConfigRow
        label="MeshView URL"
        value={meshViewUrl || "Not set"}
        fieldKey="meshViewUrl"
        editingField={editingField}
        editValue={editValue}
        hint="(e to edit, clear to disable)"
      />
      <Box marginTop={1}>
        <Text color={theme.fg.muted}>Example: https://meshview.bayme.sh</Text>
      </Box>
    </Box>
  );
}
