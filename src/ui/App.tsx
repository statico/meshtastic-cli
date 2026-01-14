import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { theme } from "./theme";
import type { DecodedPacket } from "../protocol/decoder";
import type { PacketStore } from "../protocol/packet-store";
import type { NodeStore, NodeData } from "../protocol/node-store";
import type { Transport, DeviceStatus } from "../transport/types";
import { HttpTransport } from "../transport";
import { Mesh, Portnums, Telemetry, Channel, Admin, Config, ModuleConfig } from "@meshtastic/protobufs";
import { PacketList } from "./components/PacketList";
import { PacketInspector, InspectorTab } from "./components/PacketInspector";
import { NodesPanel } from "./components/NodesPanel";
import { ChatPanel } from "./components/ChatPanel";
import { DMPanel } from "./components/DMPanel";
import { ConfigPanel, ConfigSection, getMenuItemByIndex, getMenuItemCount, CONFIG_FIELD_COUNTS } from "./components/ConfigPanel";
import * as adminHelper from "../protocol/admin";
import { HelpDialog } from "./components/HelpDialog";
import { QuitDialog } from "./components/QuitDialog";
import { ResponseModal } from "./components/ResponseModal";
import { LogPanel } from "./components/LogPanel";
import { MeshViewPacketList, MeshViewInspector, MeshViewInspectorTab } from "./components/MeshViewPanel";
import { MeshViewStore, MeshViewPacket, MeshViewApiResponse, extractPublicKeyFromPayload } from "../protocol/meshview";
import { RebootModal } from "./components/RebootModal";
import { DeviceNotificationModal } from "./components/DeviceNotificationModal";
import * as db from "../db";
import { toBinary, create } from "@bufbuild/protobuf";
import { formatNodeId, getHardwareModelName } from "../utils";
import { setSetting } from "../settings";
import packageJson from "../../package.json";
import { Logger } from "../logger";
import { safeOpenUrl, validateUrl } from "../utils/safe-exec";

const BROADCAST_ADDR = 0xFFFFFFFF;

// Map error codes to enum names for routing errors
const ROUTING_ERROR_NAMES: Record<number, string> = {
  0: "NONE",
  1: "NO_ROUTE",
  2: "GOT_NAK",
  3: "TIMEOUT",
  4: "NO_INTERFACE",
  5: "MAX_RETRANSMIT",
  6: "NO_CHANNEL",
  7: "TOO_LARGE",
  8: "NO_RESPONSE",
  9: "DUTY_CYCLE_LIMIT",
  32: "BAD_REQUEST",
  33: "NOT_AUTHORIZED",
  34: "PKI_FAILED",
  35: "PKI_UNKNOWN_PUBKEY",
  36: "ADMIN_BAD_SESSION_KEY",
  37: "ADMIN_PUBLIC_KEY_UNAUTHORIZED",
  38: "RATE_LIMIT_EXCEEDED",
};

type AppMode = "packets" | "nodes" | "chat" | "dm" | "config" | "log" | "meshview";

export interface ChannelInfo {
  index: number;
  name: string;
  role: number;
  psk: Uint8Array | null;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface AppProps {
  address: string;
  packetStore: PacketStore;
  nodeStore: NodeStore;
  skipConfig?: boolean;
  skipNodes?: boolean;
  meshViewUrl?: string;
  useFahrenheit?: boolean;
}

export function App({ address, packetStore, nodeStore, skipConfig = false, skipNodes = false, meshViewUrl, useFahrenheit = false }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [transport, setTransport] = useState<Transport | null>(null);
  const [mode, setMode] = useState<AppMode>("packets");
  const [status, setStatus] = useState<DeviceStatus>("connecting");
  const [packets, setPackets] = useState<DecodedPacket[]>([]);
  const [selectedPacketIndex, setSelectedPacketIndex] = useState(0);
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [selectedNodeIndex, setSelectedNodeIndex] = useState(0);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("info");
  const [inspectorHeight, setInspectorHeight] = useState(12);
  const [inspectorScrollOffset, setInspectorScrollOffset] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [showQuitDialog, setShowQuitDialog] = useState(false);
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [responseModalData, setResponseModalData] = useState<{
    type: "position" | "traceroute" | "nodeinfo";
    fromNode: number;
    data: unknown;
  } | null>(null);
  const [logResponses, setLogResponses] = useState<db.LogResponse[]>([]);
  const [selectedLogIndex, setSelectedLogIndex] = useState(0);
  const [inspectorExpanded, setInspectorExpanded] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(stdout?.rows || 24);
  const [terminalWidth, setTerminalWidth] = useState(stdout?.columns || 80);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Reboot modal state
  const [showRebootModal, setShowRebootModal] = useState(false);
  const [rebootReason, setRebootReason] = useState("");
  const [rebootElapsed, setRebootElapsed] = useState(0);

  // Device notification modal state
  const [deviceNotification, setDeviceNotification] = useState<{ message: string; level?: number } | null>(null);
  const [deviceNotificationRemaining, setDeviceNotificationRemaining] = useState(5);

  // Spinner animation
  useEffect(() => {
    if (status === "connecting") {
      const interval = setInterval(() => {
        setSpinnerFrame((f) => (f + 1) % SPINNER_FRAMES.length);
      }, 80);
      return () => clearInterval(interval);
    }
  }, [status]);

  // Connect to device
  useEffect(() => {
    let cancelled = false;
    Logger.info("App", "Initiating device connection", { address });
    (async () => {
      try {
        const t = await HttpTransport.create(address);
        if (!cancelled) {
          Logger.info("App", "Transport created successfully", { address });
          setTransport(t);
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          Logger.error("App", "Connection failed", e as Error, { address });
          console.error(`Connection failed: ${msg}`);
          process.exit(1);
        }
      }
    })();
    return () => {
      if (cancelled) {
        Logger.debug("App", "Connection effect cancelled");
      }
      cancelled = true;
    };
  }, [address]);

  // Track terminal resize with 500ms debounce
  useEffect(() => {
    const updateSize = () => {
      setTerminalHeight(stdout?.rows || 24);
      setTerminalWidth(stdout?.columns || 80);
    };

    const debouncedResize = () => {
      // Clear existing timeout
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      // Set new timeout for 500ms after last resize
      resizeTimeoutRef.current = setTimeout(() => {
        updateSize();
      }, 500);
    };

    // Update immediately on mount to get correct initial size
    updateSize();
    stdout?.on("resize", debouncedResize);
    return () => {
      stdout?.off("resize", debouncedResize);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [stdout]);

  // Reset inspector scroll when packet or tab changes
  useEffect(() => {
    setInspectorScrollOffset(0);
  }, [selectedPacketIndex, inspectorTab]);

  // Reboot modal elapsed time tracker
  useEffect(() => {
    if (!showRebootModal) return;
    const interval = setInterval(() => {
      setRebootElapsed(e => e + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [showRebootModal]);

  // Trigger full redraw when switching tabs/modes
  useEffect(() => {
    setRefreshKey(k => k + 1);
  }, [mode]);

  // Auto-dismiss reboot modal when connection is restored
  useEffect(() => {
    if (showRebootModal && status === "connected") {
      setShowRebootModal(false);
      setRebootElapsed(0);
      setRebootReason("");
    }
  }, [showRebootModal, status]);

  // Device notification auto-dismiss timer
  useEffect(() => {
    if (!deviceNotification) return;
    const interval = setInterval(() => {
      setDeviceNotificationRemaining(r => {
        if (r <= 1) {
          setDeviceNotification(null);
          return 5;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [deviceNotification]);

  const [myNodeNum, setMyNodeNum] = useState(0);
  const [myShortName, setMyShortName] = useState("");
  const [messages, setMessages] = useState<db.DbMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatChannel, setChatChannel] = useState(0);
  const [chatInputFocused, setChatInputFocused] = useState(false);
  const [selectedChatMessageIndex, setSelectedChatMessageIndex] = useState(-1);
  const [chatReplyTo, setChatReplyTo] = useState<db.DbMessage | null>(null);
  const [showEmojiSelector, setShowEmojiSelector] = useState(false);
  const [emojiSelectorIndex, setEmojiSelectorIndex] = useState(0);
  const [channels, setChannels] = useState<Map<number, ChannelInfo>>(new Map());
  const [notification, setNotification] = useState<{ message: string; color?: string } | null>(null);

  // DM state
  const [dmConversations, setDmConversations] = useState<db.DMConversation[]>([]);
  const [dmMessages, setDmMessages] = useState<db.DbMessage[]>([]);
  const [selectedDMConvoIndex, setSelectedDMConvoIndex] = useState(0);
  const [selectedDMMessageIndex, setSelectedDMMessageIndex] = useState(-1);
  const [dmInputFocused, setDmInputFocused] = useState(false);
  const [dmInput, setDmInput] = useState("");
  const [dmDeleteConfirm, setDmDeleteConfirm] = useState(false);
  const [dmReplyTo, setDmReplyTo] = useState<db.DbMessage | null>(null);

  // Config state
  const [configSection, setConfigSection] = useState<ConfigSection>("menu");
  const [configMenuIndex, setConfigMenuIndex] = useState(0);
  const [configLoading, setConfigLoading] = useState(false);
  const [deviceConfig, setDeviceConfig] = useState<Config.Config_DeviceConfig>();
  const [positionConfig, setPositionConfig] = useState<Config.Config_PositionConfig>();
  const [powerConfig, setPowerConfig] = useState<Config.Config_PowerConfig>();
  const [networkConfig, setNetworkConfig] = useState<Config.Config_NetworkConfig>();
  const [displayConfig, setDisplayConfig] = useState<Config.Config_DisplayConfig>();
  const [loraConfig, setLoraConfig] = useState<Config.Config_LoRaConfig>();
  const [bluetoothConfig, setBluetoothConfig] = useState<Config.Config_BluetoothConfig>();
  const [securityConfig, setSecurityConfig] = useState<Config.Config_SecurityConfig>();
  const [mqttConfig, setMqttConfig] = useState<ModuleConfig.ModuleConfig_MQTTConfig>();
  const [serialConfig, setSerialConfig] = useState<ModuleConfig.ModuleConfig_SerialConfig>();
  const [extNotifConfig, setExtNotifConfig] = useState<ModuleConfig.ModuleConfig_ExternalNotificationConfig>();
  const [storeForwardConfig, setStoreForwardConfig] = useState<ModuleConfig.ModuleConfig_StoreForwardConfig>();
  const [rangeTestConfig, setRangeTestConfig] = useState<ModuleConfig.ModuleConfig_RangeTestConfig>();
  const [telemetryConfig, setTelemetryConfig] = useState<ModuleConfig.ModuleConfig_TelemetryConfig>();
  const [cannedMsgConfig, setCannedMsgConfig] = useState<ModuleConfig.ModuleConfig_CannedMessageConfig>();
  const [audioConfig, setAudioConfig] = useState<ModuleConfig.ModuleConfig_AudioConfig>();
  const [remoteHwConfig, setRemoteHwConfig] = useState<ModuleConfig.ModuleConfig_RemoteHardwareConfig>();
  const [neighborInfoConfig, setNeighborInfoConfig] = useState<ModuleConfig.ModuleConfig_NeighborInfoConfig>();
  const [ambientLightConfig, setAmbientLightConfig] = useState<ModuleConfig.ModuleConfig_AmbientLightingConfig>();
  const [detectionSensorConfig, setDetectionSensorConfig] = useState<ModuleConfig.ModuleConfig_DetectionSensorConfig>();
  const [paxcounterConfig, setPaxcounterConfig] = useState<ModuleConfig.ModuleConfig_PaxcounterConfig>();
  const [configChannels, setConfigChannels] = useState<Mesh.Channel[]>([]);
  const [configOwner, setConfigOwner] = useState<Mesh.User>();
  const [configEditing, setConfigEditing] = useState<string | null>(null);
  const [configEditValue, setConfigEditValue] = useState("");
  const [selectedChannelIndex, setSelectedChannelIndex] = useState(0);
  const [selectedConfigFieldIndex, setSelectedConfigFieldIndex] = useState(0);
  const [localMeshViewUrl, setLocalMeshViewUrl] = useState<string | undefined>(meshViewUrl);

  // MeshView firehose state
  const [meshViewPackets, setMeshViewPackets] = useState<MeshViewPacket[]>([]);
  const [selectedMeshViewIndex, setSelectedMeshViewIndex] = useState(0);
  const [meshViewInspectorTab, setMeshViewInspectorTab] = useState<MeshViewInspectorTab>("info");
  const [meshViewInspectorHeight, setMeshViewInspectorHeight] = useState(18);
  const [meshViewInspectorExpanded, setMeshViewInspectorExpanded] = useState(false);
  const [meshViewInspectorScrollOffset, setMeshViewInspectorScrollOffset] = useState(0);
  const [meshViewPolling, setMeshViewPolling] = useState(false);
  const [meshViewError, setMeshViewError] = useState<string | null>(null);
  const meshViewStoreRef = useRef<MeshViewStore>(new MeshViewStore());
  const meshViewConfirmedIdsRef = useRef<Set<number>>(new Set());
  const [meshViewConfirmedIds, setMeshViewConfirmedIds] = useState<Set<number>>(new Set());

  const [batchEditMode, setBatchEditMode] = useState(false);
  const [batchEditCount, setBatchEditCount] = useState(0);

  // Filter state
  const [nodesFilter, setNodesFilter] = useState("");
  const [nodesFilterInput, setNodesFilterInput] = useState(false);
  const [chatFilter, setChatFilter] = useState("");
  const [chatFilterInput, setChatFilterInput] = useState(false);

  // Sort state for nodes
  type NodeSortKey = "hops" | "snr" | "battery" | "time" | "favorites";
  const [nodesSortKey, setNodesSortKey] = useState<NodeSortKey>("hops");
  const [nodesSortAscending, setNodesSortAscending] = useState(true);

  // Load initial data
  useEffect(() => {
    const initialPackets = packetStore.getAll();
    setPackets(initialPackets);
    if (initialPackets.length > 0) {
      setSelectedPacketIndex(initialPackets.length - 1);
    }

    const initialMessages = db.getMessages(undefined, 100);
    setMessages(initialMessages);

    const initialLogs = db.getLogResponses(100);
    setLogResponses(initialLogs);
    if (initialLogs.length > 0) {
      setSelectedLogIndex(initialLogs.length - 1);
    }

    nodeStore.onUpdate((updatedNodes) => {
      setNodes(updatedNodes);
    });
  }, []);

  // Load DM conversations when myNodeNum is known
  useEffect(() => {
    if (myNodeNum) {
      const convos = db.getDMConversations(myNodeNum);
      setDmConversations(convos);
    }
  }, [myNodeNum, messages]); // Re-fetch when messages change

  // Load DM messages when selected conversation changes
  useEffect(() => {
    if (myNodeNum && dmConversations[selectedDMConvoIndex]) {
      const otherNode = dmConversations[selectedDMConvoIndex].nodeNum;
      const msgs = db.getDMMessages(myNodeNum, otherNode, 100);
      setDmMessages(msgs);
    } else {
      setDmMessages([]);
    }
  }, [myNodeNum, dmConversations, selectedDMConvoIndex]);

  // Try to detect myNodeNum from loaded nodes if not set
  useEffect(() => {
    if (myNodeNum !== 0 || nodes.length === 0) return;
    // Look for local node (hopsAway === 0)
    const localNode = nodes.find(n => n.hopsAway === 0);
    if (localNode) {
      setMyNodeNum(localNode.num);
      if (localNode.shortName) setMyShortName(localNode.shortName);
    }
  }, [myNodeNum, nodes]);

  const processPacketForNodes = useCallback((packet: DecodedPacket) => {
    const fr = packet.fromRadio;
    if (!fr) return;

    if (fr.payloadVariant.case === "myInfo") {
      const myInfo = fr.payloadVariant.value as Mesh.MyNodeInfo;
      Logger.info("App", "Received myInfo", { myNodeNum: myInfo.myNodeNum });
      setMyNodeNum(myInfo.myNodeNum);
    }

    if (fr.payloadVariant.case === "nodeInfo") {
      const nodeInfo = fr.payloadVariant.value;
      Logger.debug("App", "Received nodeInfo", { num: nodeInfo.num });
      nodeStore.updateFromNodeInfo(nodeInfo);
    }

    if (fr.payloadVariant.case === "channel") {
      const channel = fr.payloadVariant.value as Mesh.Channel;
      Logger.debug("App", "Received channel", { index: channel.index, name: channel.settings?.name, role: channel.role });
      setChannels((prev) => {
        const next = new Map(prev);
        next.set(channel.index, {
          index: channel.index,
          name: channel.settings?.name || "",
          role: channel.role,
          psk: channel.settings?.psk && channel.settings.psk.length > 0 ? channel.settings.psk : null,
        });
        return next;
      });
    }

    // Handle device notifications - show in modal
    if (fr.payloadVariant.case === "clientNotification") {
      const notif = fr.payloadVariant.value as { level?: number; message?: string };
      if (notif.message) {
        Logger.info("App", "Received device notification", { message: notif.message, level: notif.level });
        setDeviceNotification({ message: notif.message, level: notif.level });
        setDeviceNotificationRemaining(5);
      }
    }

    if (fr.payloadVariant.case === "packet" && packet.meshPacket) {
      const mp = packet.meshPacket;
      const hops = mp.hopStart && mp.hopLimit ? mp.hopStart - mp.hopLimit : undefined;
      nodeStore.updateFromPacket(mp.from, mp.rxSnr, hops);

      if (packet.portnum === Portnums.PortNum.NODEINFO_APP && packet.payload && typeof packet.payload === "object" && "id" in packet.payload) {
        nodeStore.updateFromUser(mp.from, packet.payload as Mesh.User);
      }

      if (packet.portnum === Portnums.PortNum.POSITION_APP && packet.payload) {
        nodeStore.updatePosition(mp.from, packet.payload as Mesh.Position);
      }

      if (packet.portnum === Portnums.PortNum.TELEMETRY_APP && packet.payload) {
        const telem = packet.payload as Telemetry.Telemetry;
        if (telem.variant.case === "deviceMetrics") {
          nodeStore.updateDeviceMetrics(mp.from, telem.variant.value);
        }
      }

      // Detect position responses directed to us
      if (packet.portnum === Portnums.PortNum.POSITION_APP && packet.payload && mp.to === myNodeNum) {
        const pos = packet.payload as Mesh.Position;
        const posResponse: db.DbPositionResponse = {
          packetId: mp.id,
          fromNode: mp.from,
          requestedBy: myNodeNum,
          latitudeI: pos.latitudeI,
          longitudeI: pos.longitudeI,
          altitude: pos.altitude,
          satsInView: pos.satsInView,
          timestamp: Math.floor(Date.now() / 1000),
        };
        db.insertPositionResponse(posResponse);
        setLogResponses(prev => [...prev, posResponse].slice(-100));
        setResponseModalData({ type: "position", fromNode: mp.from, data: pos });
        setShowResponseModal(true);
      }

      // Detect traceroute responses directed to us
      if (packet.portnum === Portnums.PortNum.TRACEROUTE_APP && packet.payload && mp.to === myNodeNum) {
        const route = packet.payload as Mesh.RouteDiscovery;
        const trResponse: db.DbTracerouteResponse = {
          packetId: mp.id,
          fromNode: mp.from,
          requestedBy: myNodeNum,
          route: route.route ? [...route.route] : [],
          snrTowards: route.snrTowards ? [...route.snrTowards] : [],
          snrBack: route.snrBack ? [...route.snrBack] : [],
          hopLimit: mp.hopLimit ?? 0,
          timestamp: Math.floor(Date.now() / 1000),
        };
        db.insertTracerouteResponse(trResponse);
        setLogResponses(prev => [...prev, trResponse].slice(-100));
        setResponseModalData({ type: "traceroute", fromNode: mp.from, data: route });
        setShowResponseModal(true);
      }

      // Detect nodeinfo responses directed to us
      if (packet.portnum === Portnums.PortNum.NODEINFO_APP && packet.payload && mp.to === myNodeNum) {
        const user = packet.payload as Mesh.User;
        const niResponse: db.DbNodeInfoResponse = {
          packetId: mp.id,
          fromNode: mp.from,
          requestedBy: myNodeNum,
          longName: user.longName,
          shortName: user.shortName,
          hwModel: user.hwModel,
          timestamp: Math.floor(Date.now() / 1000),
        };
        db.insertNodeInfoResponse(niResponse);
        setLogResponses(prev => [...prev, niResponse].slice(-100));
        setResponseModalData({ type: "nodeinfo", fromNode: mp.from, data: user });
        setShowResponseModal(true);
      }

      if (packet.portnum === Portnums.PortNum.TEXT_MESSAGE_APP && typeof packet.payload === "string") {
        Logger.info("App", "Received text message", {
          from: mp.from,
          to: mp.to,
          channel: mp.channel,
          isBroadcast: mp.to === BROADCAST_ADDR,
          textLength: packet.payload.length,
        });
        const msg: db.DbMessage = {
          packetId: mp.id,
          fromNode: mp.from,
          toNode: mp.to,
          channel: mp.channel,
          text: packet.payload,
          timestamp: Math.floor(Date.now() / 1000),
          rxTime: mp.rxTime,
          rxSnr: mp.rxSnr,
          rxRssi: mp.rxRssi,
          hopLimit: mp.hopLimit,
          hopStart: mp.hopStart,
          status: "received",
          replyId: packet.replyId,
        };
        db.insertMessage(msg);

        // Only add broadcast messages to chat, not DMs
        if (mp.to === BROADCAST_ADDR) {
          setMessages((prev) => [...prev, msg].slice(-100));
        } else {
          // DM received - refresh conversations list
          setDmConversations(db.getDMConversations(myNodeNum));
          // If viewing this conversation, refresh messages
          const selectedConvo = dmConversations[selectedDMConvoIndex];
          if (selectedConvo && mp.from === selectedConvo.nodeNum) {
            setDmMessages(db.getDMMessages(myNodeNum, selectedConvo.nodeNum));
          }
        }
      }

      // Handle routing ACK/NAK for our sent messages
      if (packet.portnum === Portnums.PortNum.ROUTING_APP && packet.requestId && mp.to === myNodeNum) {
        const routing = packet.payload as { variant?: { case?: string; value?: number } };
        if (routing.variant?.case === "errorReason" && routing.variant.value !== undefined) {
          const isAck = routing.variant.value === Mesh.Routing_Error.NONE;
          const newStatus: db.MessageStatus = isAck ? "acked" : "error";
          const errorReason = isAck ? undefined : (ROUTING_ERROR_NAMES[routing.variant.value] || `error_${routing.variant.value}`);
          Logger.info("App", "Received routing response", {
            requestId: packet.requestId,
            from: mp.from,
            isAck,
            errorReason,
          });
          db.updateMessageStatus(packet.requestId, newStatus, errorReason);
          setMessages((prev) =>
            prev.map((m) =>
              m.packetId === packet.requestId ? { ...m, status: newStatus, errorReason } : m
            )
          );
          // Show ACK notification (but not for self-to-self)
          if (isAck && mp.from !== myNodeNum) {
            const nodeName = nodeStore.getNodeName(mp.from);
            showNotification(`✓ ACK from ${nodeName}`, theme.packet.direct);
          }
        }
      }

      // Handle admin responses for config
      if (packet.portnum === Portnums.PortNum.ADMIN_APP && mp.to === myNodeNum && packet.payload) {
        const adminMsg = packet.payload as Admin.AdminMessage;
        Logger.info("App", "Received admin response", {
          from: mp.from,
          variantCase: adminMsg.payloadVariant.case,
        });
        setConfigLoading(false);

        switch (adminMsg.payloadVariant.case) {
          case "getConfigResponse": {
            const config = adminMsg.payloadVariant.value;
            switch (config.payloadVariant.case) {
              case "device":
                setDeviceConfig(config.payloadVariant.value);
                break;
              case "position":
                setPositionConfig(config.payloadVariant.value);
                break;
              case "power":
                setPowerConfig(config.payloadVariant.value);
                break;
              case "network":
                setNetworkConfig(config.payloadVariant.value);
                break;
              case "display":
                setDisplayConfig(config.payloadVariant.value);
                break;
              case "lora":
                setLoraConfig(config.payloadVariant.value);
                break;
              case "bluetooth":
                setBluetoothConfig(config.payloadVariant.value);
                break;
              case "security":
                setSecurityConfig(config.payloadVariant.value);
                break;
            }
            break;
          }
          case "getModuleConfigResponse": {
            const moduleConfig = adminMsg.payloadVariant.value;
            switch (moduleConfig.payloadVariant.case) {
              case "mqtt":
                setMqttConfig(moduleConfig.payloadVariant.value);
                break;
              case "serial":
                setSerialConfig(moduleConfig.payloadVariant.value);
                break;
              case "externalNotification":
                setExtNotifConfig(moduleConfig.payloadVariant.value);
                break;
              case "storeForward":
                setStoreForwardConfig(moduleConfig.payloadVariant.value);
                break;
              case "rangeTest":
                setRangeTestConfig(moduleConfig.payloadVariant.value);
                break;
              case "telemetry":
                setTelemetryConfig(moduleConfig.payloadVariant.value);
                break;
              case "cannedMessage":
                setCannedMsgConfig(moduleConfig.payloadVariant.value);
                break;
              case "audio":
                setAudioConfig(moduleConfig.payloadVariant.value);
                break;
              case "remoteHardware":
                setRemoteHwConfig(moduleConfig.payloadVariant.value);
                break;
              case "neighborInfo":
                setNeighborInfoConfig(moduleConfig.payloadVariant.value);
                break;
              case "ambientLighting":
                setAmbientLightConfig(moduleConfig.payloadVariant.value);
                break;
              case "detectionSensor":
                setDetectionSensorConfig(moduleConfig.payloadVariant.value);
                break;
              case "paxcounter":
                setPaxcounterConfig(moduleConfig.payloadVariant.value);
                break;
            }
            break;
          }
          case "getChannelResponse": {
            const channel = adminMsg.payloadVariant.value;
            setConfigChannels((prev) => {
              const next = [...prev];
              const idx = channel.index;
              next[idx] = channel;
              return next;
            });
            break;
          }
          case "getOwnerResponse": {
            setConfigOwner(adminMsg.payloadVariant.value);
            break;
          }
        }
      }
    }
  }, [nodeStore, myNodeNum]);

  // Subscribe to new packets with smart autoscroll
  const selectedPacketIndexRef = useRef(selectedPacketIndex);
  selectedPacketIndexRef.current = selectedPacketIndex;

  // Keep a ref to processPacketForNodes so the subscription always uses the latest
  const processPacketRef = useRef(processPacketForNodes);
  processPacketRef.current = processPacketForNodes;

  // MeshView cache (5 second TTL)
  const meshViewCacheRef = useRef<{ data: any[]; timestamp: number } | null>(null);

  useEffect(() => {
    const unsubscribe = packetStore.onPacket((packet) => {
      try {
        processPacketRef.current(packet);
      } catch (error) {
        Logger.error("App", "Error processing packet", error as Error, {
          packetId: packet.id,
          hasFromRadio: !!packet.fromRadio,
        });
      }
      setPackets((prev) => {
        const next = [...prev, packet].slice(-5000);
        // Auto-scroll only if exactly at the last packet (not just near it)
        const lastIndex = prev.length - 1;
        const wasAtEnd = prev.length > 0 && selectedPacketIndexRef.current === lastIndex;
        if (wasAtEnd) {
          setSelectedPacketIndex(next.length - 1);
        }
        return next;
      });
    });
    return unsubscribe;
  }, []);

  // MeshView firehose polling - poll every second when on meshview tab
  useEffect(() => {
    if (mode !== "meshview" || !localMeshViewUrl) return;

    let running = true;
    const poll = async () => {
      if (!running) return;
      setMeshViewPolling(true);
      try {
        const since = meshViewStoreRef.current.getLatestImportTime();
        const url = since
          ? `${localMeshViewUrl}/api/packets?since=${since}&limit=100`
          : `${localMeshViewUrl}/api/packets?limit=100`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: MeshViewApiResponse = await response.json();
        if (data.packets?.length > 0) {
          // Get count BEFORE adding new packets to check if user was at end
          const prevCount = meshViewStoreRef.current.count;
          meshViewStoreRef.current.addPackets(data.packets, data.latest_import_time);
          const allPackets = meshViewStoreRef.current.getAll();
          setMeshViewPackets(allPackets);
          // Only auto-scroll if user was at the end (following)
          setSelectedMeshViewIndex((prev) => {
            const wasAtEnd = prevCount === 0 || prev >= prevCount - 1;
            return wasAtEnd ? allPackets.length - 1 : prev;
          });
        }
        setMeshViewError(null);
      } catch (e) {
        setMeshViewError(e instanceof Error ? e.message : "Poll failed");
      } finally {
        setMeshViewPolling(false);
      }
    };

    // Initial poll immediately
    poll();
    // Then poll every second
    const interval = setInterval(poll, 1000);

    return () => {
      running = false;
      clearInterval(interval);
    };
  }, [mode, localMeshViewUrl]);

  // MeshView confirmation tracking - always-on polling to track confirmed packet IDs and sync public keys
  // This runs regardless of current tab when meshViewUrl is configured
  useEffect(() => {
    if (!localMeshViewUrl) return;

    let running = true;
    let latestTime = 0;

    const pollConfirmations = async () => {
      if (!running) return;
      try {
        const url = latestTime
          ? `${localMeshViewUrl}/api/packets?since=${latestTime}&limit=100`
          : `${localMeshViewUrl}/api/packets?limit=100`;
        const response = await fetch(url);
        if (!response.ok) return;
        const data: MeshViewApiResponse = await response.json();
        if (data.packets?.length > 0) {
          let hasNewConfirmed = false;
          for (const pkt of data.packets) {
            // Track confirmed packet IDs
            if (!meshViewConfirmedIdsRef.current.has(pkt.id)) {
              meshViewConfirmedIdsRef.current.add(pkt.id);
              hasNewConfirmed = true;
            }

            // Process NODEINFO packets for public key sync
            if (pkt.portnum === Portnums.PortNum.NODEINFO_APP) {
              const existingNode = nodeStore.getNode(pkt.from_node_id);
              if (existingNode) {
                const publicKey = extractPublicKeyFromPayload(pkt.payload);
                if (publicKey) {
                  // Only update if we have a new key that's different from existing
                  const existingKey = existingNode.publicKey;
                  const keysMatch = existingKey && publicKey.length === existingKey.length &&
                    publicKey.every((b, i) => b === existingKey[i]);
                  if (!keysMatch) {
                    nodeStore.updatePublicKey(pkt.from_node_id, publicKey);
                  }
                }
              }
            }
          }

          // Update state to trigger re-renders
          if (hasNewConfirmed) {
            setMeshViewConfirmedIds(new Set(meshViewConfirmedIdsRef.current));
          }

          // Update latest time for next poll
          if (data.latest_import_time) {
            latestTime = data.latest_import_time;
          } else {
            const lastPkt = data.packets[data.packets.length - 1];
            if (lastPkt.import_time_us > latestTime) {
              latestTime = lastPkt.import_time_us;
            }
          }
        }
      } catch {
        // Ignore polling errors
      }
    };

    // Initial poll
    pollConfirmations();
    // Poll every 5 seconds
    const interval = setInterval(pollConfirmations, 5000);

    return () => {
      running = false;
      clearInterval(interval);
    };
  }, [localMeshViewUrl, nodeStore]);

  // Start transport
  useEffect(() => {
    if (!transport) return;

    let running = true;
    let configRequested = false;

    (async () => {
      try {
        for await (const output of transport.fromDevice) {
          if (!running) break;
          if (output.type === "status") {
            Logger.info("App", "Status changed", {
              status: output.status,
              reason: (output as any).reason,
            });
            setStatus(output.status);
            if (output.status === "connected" && !configRequested) {
              Logger.info("App", "Connected - requesting config", { skipConfig, skipNodes });
              configRequested = true;
              if (!skipConfig) {
                requestConfig(skipNodes);
              }
              fetchOwnerFallback();
            }
          } else if (output.type === "packet") {
            Logger.debug("App", "Processing packet from device");
            try {
              const { decodeFromRadio } = await import("../protocol/decoder");
              const decoded = decodeFromRadio(output.data);
              packetStore.add(decoded);
            } catch (error) {
              Logger.error("App", "Error decoding/storing packet", error as Error);
            }
          }
        }
        // Log when transport loop exits normally
        Logger.warn("App", "Transport loop exited", { running });
        if (running) {
          console.error("CRITICAL: Transport iterator completed unexpectedly while running=true");
          Logger.error("App", "TRANSPORT_LOOP_EXIT: Transport loop exited while running=true", new Error("Transport loop exited"));
        }
      } catch (error) {
        Logger.error("App", "Transport reading loop error", error as Error);
        if (running) {
          console.error("Transport error:", error);
        }
      }
    })();

    return () => {
      running = false;
    };
  }, [transport]);

  // Special nonce values from Meshtastic firmware (PhoneAPI.h)
  // SPECIAL_NONCE_ONLY_CONFIG = 69420 - Skips node database, gets config only
  // SPECIAL_NONCE_ONLY_NODES = 69421 - Gets only nodes, skips other config
  const SPECIAL_NONCE_ONLY_CONFIG = 69420;

  const requestConfig = useCallback(async (skipNodes: boolean = false) => {
    if (!transport) return;
    // Use special nonce to skip node database if requested
    const nonce = skipNodes ? SPECIAL_NONCE_ONLY_CONFIG : Math.floor(Math.random() * 0xffffffff);
    const toRadio = create(Mesh.ToRadioSchema, {
      payloadVariant: { case: "wantConfigId", value: nonce },
    });
    try {
      const binary = toBinary(Mesh.ToRadioSchema, toRadio);
      await transport.send(binary);
    } catch {
      showNotification("Failed to request config");
    }
  }, [transport]);

  const fetchOwnerFallback = useCallback(async () => {
    if (!transport?.fetchOwner) {
      return;
    }
    const owner = await transport.fetchOwner();
    if (owner && owner.myNodeNum) {
      setMyNodeNum(owner.myNodeNum);
      setMyShortName(owner.shortName || "");
    }
  }, [transport]);

  const showNotification = useCallback((msg: string, color?: string) => {
    setNotification({ message: msg, color });
    setTimeout(() => setNotification(null), 2000);
  }, []);

  const sendMessage = useCallback(async (text: string, replyId?: number) => {
    if (!transport || !myNodeNum || !text.trim()) return;

    const packetId = Math.floor(Math.random() * 0xffffffff);
    const data = create(Mesh.DataSchema, {
      portnum: Portnums.PortNum.TEXT_MESSAGE_APP,
      payload: new TextEncoder().encode(text),
      replyId: replyId ?? 0,
    });

    const meshPacket = create(Mesh.MeshPacketSchema, {
      id: packetId,
      from: myNodeNum,
      to: 0xffffffff,
      channel: chatChannel,
      wantAck: true,
      payloadVariant: { case: "decoded", value: data },
    });

    const toRadio = create(Mesh.ToRadioSchema, {
      payloadVariant: { case: "packet", value: meshPacket },
    });

    try {
      const binary = toBinary(Mesh.ToRadioSchema, toRadio);
      await transport.send(binary);

      const msg: db.DbMessage = {
        packetId,
        fromNode: myNodeNum,
        toNode: 0xffffffff,
        channel: chatChannel,
        text,
        timestamp: Math.floor(Date.now() / 1000),
        status: "pending",
        replyId,
      };
      db.insertMessage(msg);
      setMessages((prev) => [...prev, msg].slice(-100));
      setChatInput("");
      setChatReplyTo(null);
    } catch {
      showNotification("Failed to send message");
    }
  }, [myNodeNum, chatChannel, transport, showNotification]);

  const resendMessage = useCallback(async (msg: db.DbMessage) => {
    if (!transport || !myNodeNum) return;

    const packetId = Math.floor(Math.random() * 0xffffffff);
    const data = create(Mesh.DataSchema, {
      portnum: Portnums.PortNum.TEXT_MESSAGE_APP,
      payload: new TextEncoder().encode(msg.text),
      replyId: msg.replyId ?? 0,
    });

    const meshPacket = create(Mesh.MeshPacketSchema, {
      id: packetId,
      from: myNodeNum,
      to: msg.toNode,
      channel: msg.channel,
      wantAck: true,
      payloadVariant: { case: "decoded", value: data },
    });

    const toRadio = create(Mesh.ToRadioSchema, {
      payloadVariant: { case: "packet", value: meshPacket },
    });

    try {
      const binary = toBinary(Mesh.ToRadioSchema, toRadio);
      await transport.send(binary);

      // Add new message entry for the resend (old message stays with error status)
      const newMsg: db.DbMessage = {
        packetId,
        fromNode: myNodeNum,
        toNode: msg.toNode,
        channel: msg.channel,
        text: msg.text,
        timestamp: Math.floor(Date.now() / 1000),
        status: "pending",
        replyId: msg.replyId,
      };
      db.insertMessage(newMsg);
      setMessages((prev) => [...prev, newMsg].slice(-100));

      // Refresh DM conversations and keep selection on same conversation (only for DMs)
      if (msg.channel === 0) {
        const newConvos = db.getDMConversations(myNodeNum);
        const newIndex = newConvos.findIndex(c => c.nodeNum === msg.toNode);
        setDmConversations(newConvos);
        if (newIndex >= 0) setSelectedDMConvoIndex(newIndex);
        setDmMessages(db.getDMMessages(myNodeNum, msg.toNode));
      }

      showNotification("Message resent");
    } catch {
      showNotification("Failed to resend message");
    }
  }, [myNodeNum, transport, showNotification]);

  const sendDM = useCallback(async (text: string, toNode: number, replyId?: number) => {
    if (!transport) {
      showNotification("Not connected");
      return;
    }
    if (!myNodeNum) {
      showNotification("Waiting for node info...");
      return;
    }
    if (!text.trim()) return;

    const packetId = Math.floor(Math.random() * 0xffffffff);
    const data = create(Mesh.DataSchema, {
      portnum: Portnums.PortNum.TEXT_MESSAGE_APP,
      payload: new TextEncoder().encode(text),
      replyId: replyId ?? 0,
    });

    const meshPacket = create(Mesh.MeshPacketSchema, {
      id: packetId,
      from: myNodeNum,
      to: toNode,
      channel: 0, // DMs typically use primary channel
      wantAck: true,
      payloadVariant: { case: "decoded", value: data },
    });

    const toRadio = create(Mesh.ToRadioSchema, {
      payloadVariant: { case: "packet", value: meshPacket },
    });

    try {
      const binary = toBinary(Mesh.ToRadioSchema, toRadio);
      await transport.send(binary);

      const msg: db.DbMessage = {
        packetId,
        fromNode: myNodeNum,
        toNode,
        channel: 0,
        text,
        timestamp: Math.floor(Date.now() / 1000),
        status: "pending",
        replyId,
      };
      db.insertMessage(msg);
      setMessages((prev) => [...prev, msg].slice(-100));
      setDmInput("");
      setDmReplyTo(null);

      // Refresh DM conversations and keep selection on same conversation
      const newConvos = db.getDMConversations(myNodeNum);
      const newIndex = newConvos.findIndex(c => c.nodeNum === toNode);
      setDmConversations(newConvos);
      if (newIndex >= 0) setSelectedDMConvoIndex(newIndex);
      setDmMessages(db.getDMMessages(myNodeNum, toNode));
    } catch {
      showNotification("Failed to send DM");
    }
  }, [myNodeNum, transport, showNotification]);

  // Start a DM conversation with a node (navigates to DM tab)
  const startDMWith = useCallback((nodeNum: number) => {
    // Check if conversation already exists
    const existingIndex = dmConversations.findIndex(c => c.nodeNum === nodeNum);
    if (existingIndex >= 0) {
      setSelectedDMConvoIndex(existingIndex);
    } else {
      // Will be created when first message is sent
      // For now, add a placeholder conversation
      setDmConversations(prev => [{
        nodeNum,
        lastMessage: "",
        lastTimestamp: Math.floor(Date.now() / 1000),
        unreadCount: 0,
      }, ...prev]);
      setSelectedDMConvoIndex(0);
    }
    setSelectedDMMessageIndex(-1);
    setDmInputFocused(true);
    setMode("dm");
  }, [dmConversations]);

  const sendTraceroute = useCallback(async (destNode: number, hopLimit?: number) => {
    if (!transport || !myNodeNum) return;

    const routeDiscovery = create(Mesh.RouteDiscoverySchema, { route: [] });
    const payload = toBinary(Mesh.RouteDiscoverySchema, routeDiscovery);

    const data = create(Mesh.DataSchema, {
      portnum: Portnums.PortNum.TRACEROUTE_APP,
      payload,
      wantResponse: true,
    });

    const meshPacket = create(Mesh.MeshPacketSchema, {
      from: myNodeNum,
      to: destNode,
      wantAck: true,
      hopLimit: hopLimit ?? 7,
      payloadVariant: { case: "decoded", value: data },
    });

    const toRadio = create(Mesh.ToRadioSchema, {
      payloadVariant: { case: "packet", value: meshPacket },
    });

    try {
      const binary = toBinary(Mesh.ToRadioSchema, toRadio);
      await transport.send(binary);
      const action = hopLimit === 0 ? "Direct ping" : "Traceroute";
      showNotification(`${action} sent to ${nodeStore.getNodeName(destNode)}`);
    } catch {
      showNotification("Failed to send traceroute");
    }
  }, [myNodeNum, transport, nodeStore, showNotification]);

  const sendPositionRequest = useCallback(async (destNode: number) => {
    if (!transport || !myNodeNum) return;

    const position = create(Mesh.PositionSchema, {});
    const payload = toBinary(Mesh.PositionSchema, position);

    const data = create(Mesh.DataSchema, {
      portnum: Portnums.PortNum.POSITION_APP,
      payload,
      wantResponse: true,
    });

    const meshPacket = create(Mesh.MeshPacketSchema, {
      from: myNodeNum,
      to: destNode,
      wantAck: true,
      payloadVariant: { case: "decoded", value: data },
    });

    const toRadio = create(Mesh.ToRadioSchema, {
      payloadVariant: { case: "packet", value: meshPacket },
    });

    try {
      const binary = toBinary(Mesh.ToRadioSchema, toRadio);
      await transport.send(binary);
      showNotification(`Position request sent to ${nodeStore.getNodeName(destNode)}`);
    } catch {
      showNotification("Failed to send position request");
    }
  }, [myNodeNum, transport, nodeStore, showNotification]);

  const sendNodeInfoRequest = useCallback(async (destNode: number) => {
    if (!transport || !myNodeNum) return;

    const user = create(Mesh.UserSchema, {});
    const payload = toBinary(Mesh.UserSchema, user);

    const data = create(Mesh.DataSchema, {
      portnum: Portnums.PortNum.NODEINFO_APP,
      payload,
      wantResponse: true,
    });

    const meshPacket = create(Mesh.MeshPacketSchema, {
      from: myNodeNum,
      to: destNode,
      wantAck: true,
      payloadVariant: { case: "decoded", value: data },
    });

    const toRadio = create(Mesh.ToRadioSchema, {
      payloadVariant: { case: "packet", value: meshPacket },
    });

    try {
      const binary = toBinary(Mesh.ToRadioSchema, toRadio);
      await transport.send(binary);
      showNotification(`NodeInfo request sent to ${nodeStore.getNodeName(destNode)}`);
    } catch {
      showNotification("Failed to send nodeinfo request");
    }
  }, [myNodeNum, transport, nodeStore, showNotification]);

  const sendTelemetryRequest = useCallback(async (destNode: number) => {
    if (!transport || !myNodeNum) return;

    const telemetry = create(Telemetry.TelemetrySchema, {});
    const payload = toBinary(Telemetry.TelemetrySchema, telemetry);

    const data = create(Mesh.DataSchema, {
      portnum: Portnums.PortNum.TELEMETRY_APP,
      payload,
      wantResponse: true,
    });

    const meshPacket = create(Mesh.MeshPacketSchema, {
      from: myNodeNum,
      to: destNode,
      wantAck: true,
      payloadVariant: { case: "decoded", value: data },
    });

    const toRadio = create(Mesh.ToRadioSchema, {
      payloadVariant: { case: "packet", value: meshPacket },
    });

    try {
      const binary = toBinary(Mesh.ToRadioSchema, toRadio);
      await transport.send(binary);
      showNotification(`Telemetry request sent to ${nodeStore.getNodeName(destNode)}`);
    } catch {
      showNotification("Failed to send telemetry request");
    }
  }, [myNodeNum, transport, nodeStore, showNotification]);

  const removeNode = useCallback(async (nodeNum: number) => {
    if (!transport || !myNodeNum) return;
    try {
      const binary = adminHelper.createRemoveNodeRequest(nodeNum, { myNodeNum });
      await transport.send(binary);
      // Remove from local state
      setNodes((prev) => prev.filter((n) => n.num !== nodeNum));
      nodeStore.removeNode(nodeNum);
      showNotification(`Removed node ${nodeStore.getNodeName(nodeNum)}`);
    } catch {
      showNotification("Failed to remove node");
    }
  }, [myNodeNum, transport, nodeStore, showNotification]);

  const toggleFavoriteNode = useCallback(async (nodeNum: number) => {
    if (!transport || !myNodeNum) return;
    const node = nodes.find((n) => n.num === nodeNum);
    const isFavorite = node?.isFavorite;
    try {
      const binary = isFavorite
        ? adminHelper.createRemoveFavoriteNodeRequest(nodeNum, { myNodeNum })
        : adminHelper.createSetFavoriteNodeRequest(nodeNum, { myNodeNum });
      await transport.send(binary);
      setNodes((prev) =>
        prev.map((n) => (n.num === nodeNum ? { ...n, isFavorite: !isFavorite } : n))
      );
      showNotification(`${isFavorite ? "Unfavorited" : "Favorited"} ${nodeStore.getNodeName(nodeNum)}`);
    } catch {
      showNotification("Failed to update favorite status");
    }
  }, [myNodeNum, transport, nodes, nodeStore, showNotification]);

  const toggleIgnoredNode = useCallback(async (nodeNum: number) => {
    if (!transport || !myNodeNum) return;
    const node = nodes.find((n) => n.num === nodeNum);
    const isIgnored = node?.isIgnored;
    try {
      const binary = isIgnored
        ? adminHelper.createRemoveIgnoredNodeRequest(nodeNum, { myNodeNum })
        : adminHelper.createSetIgnoredNodeRequest(nodeNum, { myNodeNum });
      await transport.send(binary);
      setNodes((prev) =>
        prev.map((n) => (n.num === nodeNum ? { ...n, isIgnored: !isIgnored } : n))
      );
      showNotification(`${isIgnored ? "Unignored" : "Ignored"} ${nodeStore.getNodeName(nodeNum)}`);
    } catch {
      showNotification("Failed to update ignored status");
    }
  }, [myNodeNum, transport, nodes, nodeStore, showNotification]);

  const fetchNodeFromMeshView = useCallback(async (nodeNum: number) => {
    if (!localMeshViewUrl) {
      showNotification("MeshView URL not configured", theme.status.offline);
      return;
    }

    const nodeHex = `!${nodeNum.toString(16).padStart(8, "0")}`;
    const now = Date.now();
    const CACHE_TTL = 5000; // 5 seconds

    // Check cache first
    let nodes: any[];
    if (meshViewCacheRef.current && (now - meshViewCacheRef.current.timestamp) < CACHE_TTL) {
      nodes = meshViewCacheRef.current.data;
      showNotification("Looking up from cache...");
    } else {
      showNotification("Fetching from MeshView...");
      try {
        const response = await fetch(`${localMeshViewUrl}/api/nodes?days_active=30`);
        if (!response.ok) {
          showNotification(`MeshView error: ${response.status}`);
          return;
        }

        const data = await response.json();
        nodes = data.nodes || data; // Handle both { nodes: [...] } and direct array

        if (!Array.isArray(nodes)) {
          showNotification("Invalid MeshView response format");
          return;
        }

        // Cache the response
        meshViewCacheRef.current = { data: nodes, timestamp: now };
      } catch (err) {
        showNotification(`Failed to fetch: ${err instanceof Error ? err.message : "unknown error"}`);
        return;
      }
    }

    const found = nodes.find((n: { id?: string; node_id?: number }) =>
      n.id === nodeHex || n.node_id === nodeNum
    );

    if (found) {
      nodeStore.updateFromMeshView(nodeNum, {
        longName: found.long_name,
        shortName: found.short_name,
        hwModel: found.hw_model,
        role: found.role,
        lastLat: found.last_lat,
        lastLong: found.last_long,
        lastSeen: found.last_seen_us,
      });
      showNotification(`Updated: ${found.short_name || found.long_name || nodeHex}`);
    } else {
      showNotification(`Node ${nodeHex} not found in MeshView`);
    }
  }, [localMeshViewUrl, nodeStore, showNotification]);

  const updateAllUnknownNodesFromMeshView = useCallback(async () => {
    if (!localMeshViewUrl) {
      showNotification("MeshView URL not configured", theme.status.offline);
      return;
    }

    const now = Date.now();
    const CACHE_TTL = 5000;

    // Fetch all nodes from MeshView
    let meshViewNodes: any[];
    if (meshViewCacheRef.current && (now - meshViewCacheRef.current.timestamp) < CACHE_TTL) {
      meshViewNodes = meshViewCacheRef.current.data;
      showNotification("Updating from cache...");
    } else {
      showNotification("Fetching all from MeshView...");
      try {
        const response = await fetch(`${localMeshViewUrl}/api/nodes?days_active=30`);
        if (!response.ok) {
          showNotification(`MeshView error: ${response.status}`);
          return;
        }

        const data = await response.json();
        meshViewNodes = data.nodes || data;

        if (!Array.isArray(meshViewNodes)) {
          showNotification("Invalid MeshView response format");
          return;
        }

        meshViewCacheRef.current = { data: meshViewNodes, timestamp: now };
      } catch (err) {
        showNotification(`Failed to fetch: ${err instanceof Error ? err.message : "unknown error"}`);
        return;
      }
    }

    // Find nodes that need updating (unknown shortName)
    const unknownNodes = nodes.filter(n => !n.shortName || n.shortName === "???");
    let updated = 0;

    for (const localNode of unknownNodes) {
      const nodeHex = `!${localNode.num.toString(16).padStart(8, "0")}`;
      const found = meshViewNodes.find((n: { id?: string; node_id?: number }) =>
        n.id === nodeHex || n.node_id === localNode.num
      );

      if (found && (found.short_name || found.long_name)) {
        nodeStore.updateFromMeshView(localNode.num, {
          longName: found.long_name,
          shortName: found.short_name,
          hwModel: found.hw_model,
          role: found.role,
          lastLat: found.last_lat,
          lastLong: found.last_long,
          lastSeen: found.last_seen_us,
        });
        updated++;
      }
    }

    showNotification(`Updated ${updated} of ${unknownNodes.length} unknown nodes`);
  }, [localMeshViewUrl, nodes, nodeStore, showNotification]);

  const requestConfigSection = useCallback(async (section: ConfigSection) => {
    if (!transport) {
      showNotification("Not connected");
      return;
    }
    if (!myNodeNum) {
      showNotification("Waiting for node info...");
      return;
    }
    setConfigLoading(true);

    const opts = { myNodeNum };

    try {
      let binary: Uint8Array | null = null;

      switch (section) {
        case "device":
          binary = adminHelper.createGetConfigRequest(adminHelper.ConfigType.DEVICE_CONFIG, opts);
          break;
        case "position":
          binary = adminHelper.createGetConfigRequest(adminHelper.ConfigType.POSITION_CONFIG, opts);
          break;
        case "power":
          binary = adminHelper.createGetConfigRequest(adminHelper.ConfigType.POWER_CONFIG, opts);
          break;
        case "network":
          binary = adminHelper.createGetConfigRequest(adminHelper.ConfigType.NETWORK_CONFIG, opts);
          break;
        case "display":
          binary = adminHelper.createGetConfigRequest(adminHelper.ConfigType.DISPLAY_CONFIG, opts);
          break;
        case "lora":
          binary = adminHelper.createGetConfigRequest(adminHelper.ConfigType.LORA_CONFIG, opts);
          break;
        case "bluetooth":
          binary = adminHelper.createGetConfigRequest(adminHelper.ConfigType.BLUETOOTH_CONFIG, opts);
          break;
        case "security":
          binary = adminHelper.createGetConfigRequest(adminHelper.ConfigType.SECURITY_CONFIG, opts);
          break;
        case "mqtt":
          binary = adminHelper.createGetModuleConfigRequest(adminHelper.ModuleConfigType.MQTT_CONFIG, opts);
          break;
        case "serial":
          binary = adminHelper.createGetModuleConfigRequest(adminHelper.ModuleConfigType.SERIAL_CONFIG, opts);
          break;
        case "extnotif":
          binary = adminHelper.createGetModuleConfigRequest(adminHelper.ModuleConfigType.EXTNOTIF_CONFIG, opts);
          break;
        case "storeforward":
          binary = adminHelper.createGetModuleConfigRequest(adminHelper.ModuleConfigType.STOREFORWARD_CONFIG, opts);
          break;
        case "rangetest":
          binary = adminHelper.createGetModuleConfigRequest(adminHelper.ModuleConfigType.RANGETEST_CONFIG, opts);
          break;
        case "telemetry":
          binary = adminHelper.createGetModuleConfigRequest(adminHelper.ModuleConfigType.TELEMETRY_CONFIG, opts);
          break;
        case "cannedmsg":
          binary = adminHelper.createGetModuleConfigRequest(adminHelper.ModuleConfigType.CANNEDMSG_CONFIG, opts);
          break;
        case "audio":
          binary = adminHelper.createGetModuleConfigRequest(adminHelper.ModuleConfigType.AUDIO_CONFIG, opts);
          break;
        case "remotehw":
          binary = adminHelper.createGetModuleConfigRequest(adminHelper.ModuleConfigType.REMOTEHARDWARE_CONFIG, opts);
          break;
        case "neighborinfo":
          binary = adminHelper.createGetModuleConfigRequest(adminHelper.ModuleConfigType.NEIGHBORINFO_CONFIG, opts);
          break;
        case "ambientlight":
          binary = adminHelper.createGetModuleConfigRequest(adminHelper.ModuleConfigType.AMBIENTLIGHTING_CONFIG, opts);
          break;
        case "detectionsensor":
          binary = adminHelper.createGetModuleConfigRequest(adminHelper.ModuleConfigType.DETECTIONSENSOR_CONFIG, opts);
          break;
        case "paxcounter":
          binary = adminHelper.createGetModuleConfigRequest(adminHelper.ModuleConfigType.PAXCOUNTER_CONFIG, opts);
          break;
        case "channels":
          // Request all 8 channels
          for (let i = 0; i < 8; i++) {
            const chBinary = adminHelper.createGetChannelRequest(i, opts);
            await transport.send(chBinary);
          }
          setConfigLoading(false);
          return;
        case "user":
          binary = adminHelper.createGetOwnerRequest(opts);
          break;
        default:
          setConfigLoading(false);
          return;
      }

      if (binary) {
        await transport.send(binary);
      }
    } catch {
      showNotification("Failed to request config");
      setConfigLoading(false);
    }
  }, [myNodeNum, transport, showNotification]);

  const sendRebootRequest = useCallback(async (seconds: number = 2, reason: string = "Manual reboot") => {
    if (!transport || !myNodeNum) return;
    try {
      const binary = adminHelper.createRebootRequest(seconds, { myNodeNum });
      await transport.send(binary);
      setRebootReason(reason);
      setRebootElapsed(0);
      setShowRebootModal(true);
    } catch {
      showNotification("Failed to send reboot request");
    }
  }, [myNodeNum, transport, showNotification]);

  const saveOwner = useCallback(async (field: string, value: string) => {
    if (!transport || !myNodeNum || !configOwner) return;
    try {
      const updatedOwner = create(Mesh.UserSchema, {
        ...configOwner,
        [field]: value,
      });
      const binary = adminHelper.createSetOwnerRequest(updatedOwner, { myNodeNum });
      await transport.send(binary);
      setConfigOwner(updatedOwner);
      if (batchEditMode) {
        setBatchEditCount(c => c + 1);
        showNotification(`Queued ${field} change (${batchEditCount + 1} pending)`);
      } else {
        showNotification(`Saved ${field}. Device may reboot.`);
      }
    } catch {
      showNotification("Failed to save owner config");
    }
  }, [myNodeNum, transport, configOwner, showNotification, batchEditMode, batchEditCount]);

  const saveChannel = useCallback(async (channelIndex: number, updates: { name?: string; role?: number; psk?: Uint8Array; uplinkEnabled?: boolean; downlinkEnabled?: boolean }) => {
    if (!transport || !myNodeNum) {
      showNotification("Cannot save: not connected to device");
      return;
    }
    const channel = configChannels.find(c => c.index === channelIndex);
    if (!channel) {
      showNotification(`Cannot save: channel ${channelIndex} not found`);
      return;
    }

    try {
      const updatedChannel = create(Mesh.ChannelSchema, {
        index: channel.index,
        role: updates.role !== undefined ? updates.role : channel.role,
        settings: create(Mesh.ChannelSettingsSchema, {
          ...channel.settings,
          name: updates.name !== undefined ? updates.name : channel.settings?.name,
          psk: updates.psk !== undefined ? updates.psk : channel.settings?.psk,
          uplinkEnabled: updates.uplinkEnabled !== undefined ? updates.uplinkEnabled : channel.settings?.uplinkEnabled,
          downlinkEnabled: updates.downlinkEnabled !== undefined ? updates.downlinkEnabled : channel.settings?.downlinkEnabled,
        }),
      });
      const binary = adminHelper.createSetChannelRequest(updatedChannel, { myNodeNum });
      await transport.send(binary);

      // Update local state
      setConfigChannels(prev => prev.map(c =>
        c.index === channelIndex ? updatedChannel : c
      ));

      if (batchEditMode) {
        setBatchEditCount(c => c + 1);
        showNotification(`Queued channel ${channelIndex} change`);
      } else {
        showNotification(`Saved channel ${channelIndex}. Device may reboot.`);
      }
    } catch {
      showNotification("Failed to save channel config");
    }
  }, [myNodeNum, transport, configChannels, showNotification, batchEditMode]);

  // Save radio config (device, position, power, network, display, lora, bluetooth, security)
  type RadioConfigCase = "device" | "position" | "power" | "network" | "display" | "lora" | "bluetooth" | "security";
  const saveRadioConfig = useCallback(async <T extends object>(
    configCase: RadioConfigCase,
    configValue: T,
    setter: React.Dispatch<React.SetStateAction<T | undefined>>,
    label: string
  ) => {
    if (!transport || !myNodeNum) return;
    try {
      const config = create(Config.ConfigSchema, {
        payloadVariant: { case: configCase, value: configValue } as Config.Config["payloadVariant"],
      });
      const binary = adminHelper.createSetConfigRequest(config, { myNodeNum });
      await transport.send(binary);
      setter(configValue);
      if (batchEditMode) {
        setBatchEditCount(c => c + 1);
        showNotification(`Queued ${label} change`);
      } else {
        showNotification(`Saved ${label}. Device may reboot.`);
      }
    } catch {
      showNotification(`Failed to save ${label}`);
    }
  }, [myNodeNum, transport, showNotification, batchEditMode]);

  // Save module config
  type ModuleConfigCase = "mqtt" | "serial" | "externalNotification" | "storeForward" | "rangeTest" | "telemetry" | "cannedMessage" | "audio" | "remoteHardware" | "neighborInfo" | "ambientLighting" | "detectionSensor" | "paxcounter";
  const saveModuleConfig = useCallback(async <T extends object>(
    configCase: ModuleConfigCase,
    configValue: T,
    setter: React.Dispatch<React.SetStateAction<T | undefined>>,
    label: string
  ) => {
    if (!transport || !myNodeNum) return;
    try {
      const config = create(ModuleConfig.ModuleConfigSchema, {
        payloadVariant: { case: configCase, value: configValue } as ModuleConfig.ModuleConfig["payloadVariant"],
      });
      const binary = adminHelper.createSetModuleConfigRequest(config, { myNodeNum });
      await transport.send(binary);
      setter(configValue);
      if (batchEditMode) {
        setBatchEditCount(c => c + 1);
        showNotification(`Queued ${label} change`);
      } else {
        showNotification(`Saved ${label}. Device may reboot.`);
      }
    } catch {
      showNotification(`Failed to save ${label}`);
    }
  }, [myNodeNum, transport, showNotification, batchEditMode]);

  const startBatchEdit = useCallback(async () => {
    if (!transport || !myNodeNum) return;
    try {
      const binary = adminHelper.createBeginEditSettingsRequest({ myNodeNum });
      await transport.send(binary);
      setBatchEditMode(true);
      setBatchEditCount(0);
    } catch {
      // Silently fail - batch mode is best-effort
    }
  }, [myNodeNum, transport]);

  const commitBatchEdit = useCallback(async () => {
    if (!transport || !myNodeNum) return;
    try {
      const binary = adminHelper.createCommitEditSettingsRequest({ myNodeNum });
      await transport.send(binary);
      setBatchEditMode(false);
      const count = batchEditCount;
      setBatchEditCount(0);
      setRebootReason(`Committing ${count} config changes`);
      setRebootElapsed(0);
      setShowRebootModal(true);
      showNotification(`Committed ${count} changes. Device rebooting.`);
    } catch {
      showNotification("Failed to commit batch edit");
    }
  }, [myNodeNum, transport, batchEditCount, showNotification]);

  const cancelBatchEdit = useCallback(() => {
    setBatchEditMode(false);
    setBatchEditCount(0);
    showNotification("Batch edit cancelled. Changes discarded.");
  }, [showNotification]);

  // Helper function to sort nodes
  const getSortedNodes = useCallback((nodeList: NodeData[], sortKey: NodeSortKey, sortAscending: boolean) => {
    return [...nodeList].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "hops": {
          const aHops = (a.hopsAway == null || a.hopsAway < 0) ? 999 : a.hopsAway;
          const bHops = (b.hopsAway == null || b.hopsAway < 0) ? 999 : b.hopsAway;
          cmp = aHops - bHops;
          break;
        }
        case "snr":
          cmp = (b.snr ?? -999) - (a.snr ?? -999);
          break;
        case "battery":
          cmp = (b.batteryLevel ?? -1) - (a.batteryLevel ?? -1);
          break;
        case "time":
          cmp = b.lastHeard - a.lastHeard;
          break;
        case "favorites":
          cmp = (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0);
          break;
      }
      return sortAscending ? cmp : -cmp;
    });
  }, []);

  // Helper function to navigate to a specific node
  const navigateToNode = useCallback((nodeNum: number) => {
    // Clear any active filter
    setNodesFilter("");
    setNodesFilterInput(false);

    // Get sorted nodes list
    const sortedNodes = getSortedNodes(nodes, nodesSortKey, nodesSortAscending);
    const nodeIndex = sortedNodes.findIndex((n) => n.num === nodeNum);

    if (nodeIndex >= 0) {
      setMode("nodes");
      setSelectedNodeIndex(nodeIndex);
    } else {
      showNotification("Node not found in list", theme.status.offline);
    }
  }, [nodes, nodesSortKey, nodesSortAscending, getSortedNodes, showNotification]);

  // Key input handling
  useInput((input, key) => {
    // If quit dialog is showing, it handles its own input
    if (showQuitDialog) {
      return;
    }

    // Check if any text input is focused (for suppressing global shortcuts)
    const isInputFocused = chatInputFocused || dmInputFocused || nodesFilterInput || chatFilterInput || configEditing !== null;

    // Quit - show confirmation dialog (but not when input is focused)
    if ((input === "q" || input === "Q") && !isInputFocused) {
      setShowQuitDialog(true);
      return;
    }
    if (key.ctrl && input === "c") {
      setShowQuitDialog(true);
      return;
    }
    // Ctrl+L to refresh/redraw screen
    if (key.ctrl && input === "l") {
      process.stdout.write("\x1b[2J\x1b[H"); // Clear screen and move cursor to top
      setRefreshKey((k) => k + 1); // Force re-render
      return;
    }
    if (input === "?" && !isInputFocused) {
      setShowHelp((h) => !h);
      return;
    }

    // Close help on any key if open
    if (showHelp) {
      setShowHelp(false);
      return;
    }

    // Dismiss device notification on escape or space
    if (deviceNotification && (key.escape || input === " ")) {
      setDeviceNotification(null);
      setDeviceNotificationRemaining(5);
      return;
    }

    // Dismiss reboot modal on any key if timed out
    if (showRebootModal && rebootElapsed >= 60) {
      setShowRebootModal(false);
      setRebootElapsed(0);
      setRebootReason("");
      return;
    }

    // Mode switching (allow only when input not focused)
    if (!isInputFocused) {
      if (input === "1") { setMode("packets"); setChatInputFocused(false); setDmInputFocused(false); return; }
      if (input === "2") { setMode("nodes"); setChatInputFocused(false); setDmInputFocused(false); return; }
      if (input === "3") { setMode("chat"); return; }
      if (input === "4") { setMode("dm"); return; }
      if (input === "5") { setMode("log"); setChatInputFocused(false); setDmInputFocused(false); return; }
      if (input === "6" && localMeshViewUrl) { setMode("meshview"); setChatInputFocused(false); setDmInputFocused(false); return; }
      if (input === (localMeshViewUrl ? "7" : "6")) { setMode("config"); setChatInputFocused(false); setDmInputFocused(false); if (!batchEditMode) startBatchEdit(); return; }
      // Bracket keys for tab switching
      const modes: AppMode[] = localMeshViewUrl
        ? ["packets", "nodes", "chat", "dm", "log", "meshview", "config"]
        : ["packets", "nodes", "chat", "dm", "log", "config"];
      if (input === "[") {
        const idx = modes.indexOf(mode);
        const newMode = modes[(idx - 1 + modes.length) % modes.length];
        setMode(newMode);
        setChatInputFocused(false);
        setDmInputFocused(false);
        if (newMode === "config" && !batchEditMode) startBatchEdit();
        return;
      }
      if (input === "]") {
        const idx = modes.indexOf(mode);
        const newMode = modes[(idx + 1) % modes.length];
        setMode(newMode);
        setChatInputFocused(false);
        setDmInputFocused(false);
        if (newMode === "config" && !batchEditMode) startBatchEdit();
        return;
      }
    }
    // Mode-specific keys
    if (mode === "packets") {
      const pageSize = Math.max(1, terminalHeight - inspectorHeight - 10);
      if (input === "j" || key.downArrow) {
        setSelectedPacketIndex((i) => Math.min(i + 1, packets.length - 1));
      }
      if (input === "k" || key.upArrow) {
        setSelectedPacketIndex((i) => Math.max(i - 1, 0));
      }
      // Page up/down with Ctrl+u/d (vim-style) or Page keys
      if ((key.ctrl && input === "d") || key.pageDown) {
        setSelectedPacketIndex((i) => Math.min(i + pageSize, packets.length - 1));
        return;
      }
      if ((key.ctrl && input === "u") || key.pageUp) {
        setSelectedPacketIndex((i) => Math.max(i - pageSize, 0));
        return;
      }
      // Jump to first/last packet (vim-style g/G or Home/End)
      // Home key escape sequences: \x1b[H, \x1b[1~, \x1bOH
      // End key escape sequences: \x1b[F, \x1b[4~, \x1bOF
      const isHome = input === "g" || input === "\x1b[H" || input === "\x1b[1~" || input === "\x1bOH";
      const isEnd = input === "G" || input === "\x1b[F" || input === "\x1b[4~" || input === "\x1bOF";
      if (isHome) {
        setSelectedPacketIndex(0);
      }
      if (isEnd) {
        setSelectedPacketIndex(packets.length - 1);
      }
      // Tab switching with h/l or left/right arrows
      const tabs: InspectorTab[] = ["info", "json", "hex"];
      if (input === "h" || key.leftArrow) {
        setInspectorTab((t) => {
          const idx = tabs.indexOf(t);
          return tabs[(idx - 1 + tabs.length) % tabs.length];
        });
      }
      if (input === "l" || key.rightArrow) {
        setInspectorTab((t) => {
          const idx = tabs.indexOf(t);
          return tabs[(idx + 1) % tabs.length];
        });
      }
      // Resize inspector pane
      if (input === "+" || input === "=") {
        setInspectorHeight((h) => Math.min(h + 2, terminalHeight - 10));
      }
      if (input === "-" || input === "_") {
        setInspectorHeight((h) => Math.max(h - 2, 6));
      }
      // Scroll inspector content with space/b
      if (input === " ") {
        setInspectorScrollOffset((o) => o + 3);
      }
      if (input === "b") {
        setInspectorScrollOffset((o) => Math.max(0, o - 3));
      }
      // Toggle pane sizes
      if (key.tab) {
        setInspectorExpanded(e => !e);
      }
      // Open Google Maps for position packets
      if (input === "m" && selectedPacket?.portnum === Portnums.PortNum.POSITION_APP && selectedPacket?.payload) {
        const pos = selectedPacket.payload as Mesh.Position;
        if (pos.latitudeI && pos.longitudeI) {
          const lat = pos.latitudeI / 1e7;
          const lon = pos.longitudeI / 1e7;
          try {
            safeOpenUrl(`https://www.google.com/maps?q=${lat},${lon}`);
          } catch (error) {
            Logger.error("App", "Failed to open maps URL", error as Error);
            showNotification("Failed to open maps", theme.status.error);
          }
        }
      }
      // Jump to node from packet
      if (key.return && selectedPacket?.meshPacket) {
        const fromNode = selectedPacket.meshPacket.from;
        const nodeIndex = nodes.findIndex(n => n.num === fromNode);
        if (nodeIndex >= 0) {
          setSelectedNodeIndex(nodeIndex);
        }
        setMode("nodes");
      }
      // 'n' to jump to sender node without leaving packet view
      if (input === "n" && selectedPacket?.meshPacket) {
        const fromNode = selectedPacket.meshPacket.from;
        const nodeIndex = nodes.findIndex(n => n.num === fromNode);
        if (nodeIndex >= 0) {
          setSelectedNodeIndex(nodeIndex);
        }
        setMode("nodes");
      }
      // 'u' to update sender node from MeshView
      if (input === "u" && selectedPacket?.meshPacket) {
        fetchNodeFromMeshView(selectedPacket.meshPacket.from);
      }
      // 'o' to open packet in MeshView
      if (input === "o" && selectedPacket?.meshPacket?.id) {
        if (!localMeshViewUrl) {
          showNotification("MeshView URL not configured", theme.status.offline);
          return;
        }
        const packetId = selectedPacket.meshPacket.id;
        if (packetId !== 0) {
          try {
            const url = `${localMeshViewUrl}/packet/${packetId}`;
            validateUrl(url); // Validate before opening
            safeOpenUrl(url);
          } catch (error) {
            Logger.error("App", "Failed to open MeshView URL", error as Error);
            showNotification("Failed to open MeshView URL", theme.status.error);
          }
        }
      }
    } else if (mode === "nodes") {
      // Compute filtered and sorted nodes
      const filteredNodes = getSortedNodes(nodesFilter
        ? nodes.filter(n =>
            (n.shortName?.toLowerCase().includes(nodesFilter.toLowerCase())) ||
            (n.longName?.toLowerCase().includes(nodesFilter.toLowerCase()))
          )
        : nodes, nodesSortKey, nodesSortAscending);

      // Filter input mode
      if (nodesFilterInput) {
        if (key.escape) {
          setNodesFilterInput(false);
          setNodesFilter("");
          setSelectedNodeIndex(0);
          return;
        }
        if (key.return) {
          setNodesFilterInput(false);
          setSelectedNodeIndex(0);
          return;
        }
        if (key.backspace || key.delete) {
          setNodesFilter(s => s.slice(0, -1));
          setSelectedNodeIndex(0);
          return;
        }
        // Emacs keybindings
        if (key.ctrl && input === "w") {
          setNodesFilter(s => s.replace(/\s*\S*$/, ""));
          setSelectedNodeIndex(0);
          return;
        }
        if (key.ctrl && (input === "k" || input === "u")) {
          setNodesFilter("");
          setSelectedNodeIndex(0);
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setNodesFilter(s => s + input);
          setSelectedNodeIndex(0);
          return;
        }
        return;
      }

      // '/' to enter filter mode
      if (input === "/") {
        setNodesFilterInput(true);
        return;
      }

      // Escape to clear filter when filter is active
      if (key.escape && nodesFilter) {
        setNodesFilter("");
        setSelectedNodeIndex(0);
        return;
      }

      // Sort key handlers (capital letters to avoid conflicts)
      const handleSortKey = (newKey: NodeSortKey) => {
        if (nodesSortKey === newKey) {
          setNodesSortAscending(a => !a);
        } else {
          setNodesSortKey(newKey);
          setNodesSortAscending(true);
        }
        setSelectedNodeIndex(0);
      };
      if (input === "H") { handleSortKey("hops"); return; }
      if (input === "S") { handleSortKey("snr"); return; }
      if (input === "B") { handleSortKey("battery"); return; }
      if (input === "A") { handleSortKey("time"); return; }
      if (input === "F") { handleSortKey("favorites"); return; }

      const nodePageSize = Math.max(1, terminalHeight - 16);
      if (input === "j" || key.downArrow) {
        setSelectedNodeIndex((i) => Math.min(i + 1, filteredNodes.length - 1));
      }
      if (input === "k" || key.upArrow) {
        setSelectedNodeIndex((i) => Math.max(i - 1, 0));
      }
      // Page up/down
      if ((key.ctrl && input === "d") || key.pageDown) {
        setSelectedNodeIndex((i) => Math.min(i + nodePageSize, filteredNodes.length - 1));
        return;
      }
      if ((key.ctrl && input === "u") || key.pageUp) {
        setSelectedNodeIndex((i) => Math.max(i - nodePageSize, 0));
        return;
      }
      // Home/End keys
      const isNodeHome = input === "g" || input === "\x1b[H" || input === "\x1b[1~" || input === "\x1bOH";
      const isNodeEnd = input === "G" || input === "\x1b[F" || input === "\x1b[4~" || input === "\x1bOF";
      if (isNodeHome) {
        setSelectedNodeIndex(0);
      }
      if (isNodeEnd) {
        setSelectedNodeIndex(filteredNodes.length - 1);
      }
      // Commands operate on filtered list
      const selectedNode = filteredNodes[selectedNodeIndex];
      if (input === "t" && selectedNode && !key.ctrl) {
        sendTraceroute(selectedNode.num);
      }
      if (input === "p" && selectedNode && !key.ctrl) {
        sendPositionRequest(selectedNode.num);
      }
      if (input === "e" && selectedNode && !key.ctrl) {
        sendTelemetryRequest(selectedNode.num);
      }
      if (input === "d" && selectedNode && !key.ctrl) {
        startDMWith(selectedNode.num);
      }
      if (input === "D" && selectedNode && !key.ctrl) {
        sendTraceroute(selectedNode.num, 0); // Direct ping
      }
      if (input === "l" && selectedNode?.hwModel) {
        const hwName = getHardwareModelName(selectedNode.hwModel);
        if (hwName && hwName !== "Unknown") {
          try {
            const query = encodeURIComponent(`Meshtastic ${hwName}`);
            safeOpenUrl(`https://www.google.com/search?q=${query}`);
          } catch (error) {
            Logger.error("App", "Failed to open search URL", error as Error);
            showNotification("Failed to open search", theme.status.error);
          }
        }
      }
      if (input === "m" && selectedNode) {
        if (selectedNode.latitudeI != null && selectedNode.longitudeI != null) {
          try {
            const lat = selectedNode.latitudeI / 1e7;
            const lon = selectedNode.longitudeI / 1e7;
            safeOpenUrl(`https://www.google.com/maps?q=${lat},${lon}`);
          } catch (error) {
            Logger.error("App", "Failed to open maps URL", error as Error);
            showNotification("Failed to open maps", theme.status.error);
          }
        } else {
          showNotification("No position data for this node");
        }
      }
      // Node management shortcuts
      if (input === "x" && selectedNode && selectedNode.num !== myNodeNum) {
        removeNode(selectedNode.num);
      }
      if (input === "f" && selectedNode) {
        toggleFavoriteNode(selectedNode.num);
      }
      // 'i' to request nodeinfo from node
      if (input === "i" && selectedNode) {
        sendNodeInfoRequest(selectedNode.num);
      }
      // 'I' (shift+i) to toggle ignored
      if (input === "I" && selectedNode && selectedNode.num !== myNodeNum) {
        toggleIgnoredNode(selectedNode.num);
      }
      // 'u' to update node info from MeshView
      if (input === "u" && selectedNode) {
        fetchNodeFromMeshView(selectedNode.num);
      }
      // 'U' (shift+u) to update all unknown nodes from MeshView
      if (input === "U") {
        updateAllUnknownNodesFromMeshView();
      }
    } else if (mode === "log") {
      if (input === "j" || key.downArrow) {
        setSelectedLogIndex((i) => Math.min(i + 1, logResponses.length - 1));
      }
      if (input === "k" || key.upArrow) {
        setSelectedLogIndex((i) => Math.max(i - 1, 0));
      }
      // Home/End keys (g/G for vim-style, escape sequences for Home/End)
      const isLogHome = input === "g" || input === "\x1b[H" || input === "\x1b[1~" || input === "\x1bOH";
      const isLogEnd = input === "G" || input === "\x1b[F" || input === "\x1b[4~" || input === "\x1bOF";
      if (isLogHome) {
        setSelectedLogIndex(0);
      }
      if (isLogEnd) {
        setSelectedLogIndex(logResponses.length - 1);
      }
      // 'n' to go to node from log message
      if (input === "n") {
        const selectedResponse = logResponses[selectedLogIndex];
        if (selectedResponse) {
          navigateToNode(selectedResponse.fromNode);
        }
      }
    } else if (mode === "chat") {
      const channelMessages = messages.filter((m) => m.channel === chatChannel);
      const emojiCount = 17; // FIRMWARE_EMOJIS.length

      // Emoji selector mode
      if (showEmojiSelector) {
        if (key.escape) {
          setShowEmojiSelector(false);
          return;
        }
        if (key.leftArrow || input === "h") {
          setEmojiSelectorIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (key.rightArrow || input === "l") {
          setEmojiSelectorIndex((i) => Math.min(i + 1, emojiCount - 1));
          return;
        }
        if (key.return) {
          // Import emoji and insert - need to get from ChatPanel
          const emojis = ["👋", "👍", "👎", "❓", "‼️", "💩", "🤣", "🤠", "🐭", "☀️", "☔", "☁️", "🌫️", "😈", "♥️", "☕", "💤"];
          setChatInput((s) => s + emojis[emojiSelectorIndex]);
          setShowEmojiSelector(false);
          return;
        }
        return;
      }

      if (chatInputFocused) {
        if (key.escape) {
          setChatInputFocused(false);
          setSelectedChatMessageIndex(-1); // Clear selection when blurring
          setChatReplyTo(null); // Clear reply when blurring
          return;
        }
        if (key.return) {
          if (chatInput.trim()) {
            sendMessage(chatInput, chatReplyTo?.packetId);
            setChatInputFocused(false);
          }
          return;
        }
        if (key.backspace || key.delete) {
          setChatInput((s) => s.slice(0, -1));
          return;
        }
        // Emacs keybindings
        if (key.ctrl && input === "w") {
          // Delete last word
          setChatInput((s) => s.replace(/\s*\S*$/, ""));
          return;
        }
        if (key.ctrl && (input === "k" || input === "u")) {
          // Kill line (clear input)
          setChatInput("");
          return;
        }
        // Alt+E for emoji selector
        if (key.meta && input === "e") {
          setShowEmojiSelector(true);
          setEmojiSelectorIndex(0);
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setChatInput((s) => s + input);
        }
      } else if (chatFilterInput) {
        // Filter input mode
        if (key.escape) {
          setChatFilterInput(false);
          setChatFilter("");
          setSelectedChatMessageIndex(-1);
          return;
        }
        if (key.return) {
          setChatFilterInput(false);
          setSelectedChatMessageIndex(-1);
          return;
        }
        if (key.backspace || key.delete) {
          setChatFilter(s => s.slice(0, -1));
          setSelectedChatMessageIndex(-1);
          return;
        }
        // Emacs keybindings
        if (key.ctrl && input === "w") {
          setChatFilter(s => s.replace(/\s*\S*$/, ""));
          setSelectedChatMessageIndex(-1);
          return;
        }
        if (key.ctrl && (input === "k" || input === "u")) {
          setChatFilter("");
          setSelectedChatMessageIndex(-1);
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setChatFilter(s => s + input);
          setSelectedChatMessageIndex(-1);
          return;
        }
        return;
      } else {
        // Filter messages by text content or sender name
        const filteredMessages = chatFilter
          ? channelMessages.filter(m => {
              const senderName = nodeStore.getNodeName(m.fromNode).toLowerCase();
              const text = m.text.toLowerCase();
              const filter = chatFilter.toLowerCase();
              return text.includes(filter) || senderName.includes(filter);
            })
          : channelMessages;

        // '/' to enter filter mode
        if (input === "/") {
          setChatFilterInput(true);
          return;
        }

        // Escape to clear filter
        if (key.escape && chatFilter) {
          setChatFilter("");
          setSelectedChatMessageIndex(-1);
          return;
        }

        // Message navigation
        if (input === "j" || key.downArrow) {
          setSelectedChatMessageIndex((i) => {
            if (i < 0) return filteredMessages.length - 1; // Start at bottom
            return Math.min(i + 1, filteredMessages.length - 1);
          });
          return;
        }
        if (input === "k" || key.upArrow) {
          setSelectedChatMessageIndex((i) => {
            if (i < 0) return filteredMessages.length - 1; // Start at bottom
            return Math.max(i - 1, 0);
          });
          return;
        }
        // Page up/down
        const chatPageSize = Math.max(1, terminalHeight - 12);
        if ((key.ctrl && input === "d") || key.pageDown) {
          setSelectedChatMessageIndex((i) => Math.min(i + chatPageSize, filteredMessages.length - 1));
          return;
        }
        if ((key.ctrl && input === "u") || key.pageUp) {
          setSelectedChatMessageIndex((i) => Math.max(i - chatPageSize, 0));
          return;
        }
        // Home/End
        const isChatHome = input === "g" || input === "\x1b[H" || input === "\x1b[1~" || input === "\x1bOH";
        const isChatEnd = input === "G" || input === "\x1b[F" || input === "\x1b[4~" || input === "\x1bOF";
        if (isChatHome) {
          setSelectedChatMessageIndex(0);
          return;
        }
        if (isChatEnd) {
          setSelectedChatMessageIndex(Math.max(0, filteredMessages.length - 1));
          return;
        }
        // 'n' to go to sender node
        if (input === "n") {
          const selectedMsg = filteredMessages[selectedChatMessageIndex];
          if (selectedMsg) {
            navigateToNode(selectedMsg.fromNode);
          }
          return;
        }
        // 'R' to resend failed message
        if (input === "R") {
          const selectedMsg = filteredMessages[selectedChatMessageIndex];
          if (selectedMsg && selectedMsg.fromNode === myNodeNum) {
            const elapsed = Date.now() - selectedMsg.timestamp * 1000;
            const isTimedOut = selectedMsg.status === "pending" && elapsed > 30000;
            if (selectedMsg.status === "error" || isTimedOut) {
              resendMessage(selectedMsg);
            }
          }
          return;
        }
        // 'r' to reply to selected message
        if (input === "r") {
          const selectedMsg = filteredMessages[selectedChatMessageIndex];
          if (selectedMsg) {
            setChatReplyTo(selectedMsg);
            setChatInputFocused(true);
          }
          return;
        }
        // Enter to focus input
        if (key.return) {
          setChatInputFocused(true);
          setSelectedChatMessageIndex(-1); // Clear selection when focusing
          return;
        }
        // Tab/Shift+Tab to switch channels
        if (key.tab) {
          if (key.shift) {
            setChatChannel((c) => (c + 7) % 8); // Go backwards
          } else {
            setChatChannel((c) => (c + 1) % 8);
          }
          setSelectedChatMessageIndex(-1);
          setChatFilter(""); // Clear filter when changing channels
          return;
        }
        // 'd' to start DM with message sender
        if (input === "d" && filteredMessages[selectedChatMessageIndex]) {
          const msg = filteredMessages[selectedChatMessageIndex];
          if (msg.fromNode !== myNodeNum) {
            startDMWith(msg.fromNode);
          }
          return;
        }
        // 'u' to update sender node from MeshView
        if (input === "u" && filteredMessages[selectedChatMessageIndex]) {
          const msg = filteredMessages[selectedChatMessageIndex];
          fetchNodeFromMeshView(msg.fromNode);
          return;
        }
        // 'p' to go to packet
        if (input === "p" && filteredMessages[selectedChatMessageIndex]) {
          const msg = filteredMessages[selectedChatMessageIndex];
          const packetIndex = packets.findIndex(p => p.meshPacket?.id === msg.packetId);
          if (packetIndex >= 0) {
            setSelectedPacketIndex(packetIndex);
            setMode("packets");
          } else {
            showNotification("Packet not found in history", theme.status.offline);
          }
          return;
        }
      }
    } else if (mode === "dm") {
      const selectedConvo = dmConversations[selectedDMConvoIndex];

      if (dmInputFocused) {
        if (key.escape) {
          setDmInputFocused(false);
          setDmReplyTo(null); // Clear reply when blurring
          return;
        }
        if (key.return && dmInput.trim() && selectedConvo) {
          sendDM(dmInput, selectedConvo.nodeNum, dmReplyTo?.packetId);
          setDmInputFocused(false);
          return;
        }
        if (key.backspace || key.delete) {
          setDmInput((s) => s.slice(0, -1));
          return;
        }
        // Emacs keybindings
        if (key.ctrl && input === "w") {
          setDmInput((s) => s.replace(/\s*\S*$/, ""));
          return;
        }
        if (key.ctrl && (input === "k" || input === "u")) {
          setDmInput("");
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setDmInput((s) => s + input);
          return;
        }
        return;
      }

      // Message view navigation (when message selected)
      if (selectedDMMessageIndex >= 0) {
        if (input === "j" || key.downArrow) {
          setSelectedDMMessageIndex((i) => Math.min(i + 1, dmMessages.length - 1));
          return;
        }
        if (input === "k" || key.upArrow) {
          setSelectedDMMessageIndex((i) => Math.max(i - 1, 0));
          return;
        }
        // Escape or 'h' / left arrow to go back to conversation list
        if (key.escape || input === "h" || key.leftArrow) {
          setSelectedDMMessageIndex(-1);
          return;
        }
        if (key.return) {
          setDmInputFocused(true);
          setSelectedDMMessageIndex(-1);
          return;
        }
        // Page up/down
        const dmPageSize = Math.max(1, terminalHeight - 12);
        if ((key.ctrl && input === "d") || key.pageDown) {
          setSelectedDMMessageIndex((i) => Math.min(i + dmPageSize, dmMessages.length - 1));
          return;
        }
        if ((key.ctrl && input === "u") || key.pageUp) {
          setSelectedDMMessageIndex((i) => Math.max(i - dmPageSize, 0));
          return;
        }
        // Home/End
        const isDmMsgHome = input === "g" || input === "\x1b[H" || input === "\x1b[1~" || input === "\x1bOH";
        const isDmMsgEnd = input === "G" || input === "\x1b[F" || input === "\x1b[4~" || input === "\x1bOF";
        if (isDmMsgHome) {
          setSelectedDMMessageIndex(0);
          return;
        }
        if (isDmMsgEnd) {
          setSelectedDMMessageIndex(dmMessages.length - 1);
          return;
        }
        // 'n' to go to node
        if (input === "n" && dmMessages[selectedDMMessageIndex]) {
          const msg = dmMessages[selectedDMMessageIndex];
          navigateToNode(msg.fromNode);
          return;
        }
        // 'R' to resend failed message
        if (input === "R" && dmMessages[selectedDMMessageIndex]) {
          const msg = dmMessages[selectedDMMessageIndex];
          if (msg.fromNode === myNodeNum) {
            const elapsed = Date.now() - msg.timestamp * 1000;
            const isTimedOut = msg.status === "pending" && elapsed > 30000;
            if (msg.status === "error" || isTimedOut) {
              resendMessage(msg);
            }
          }
          return;
        }
        // 'r' to reply to selected message
        if (input === "r" && dmMessages[selectedDMMessageIndex]) {
          const msg = dmMessages[selectedDMMessageIndex];
          setDmReplyTo(msg);
          setDmInputFocused(true);
          return;
        }
        // 'u' to update sender node from MeshView
        if (input === "u" && dmMessages[selectedDMMessageIndex]) {
          const msg = dmMessages[selectedDMMessageIndex];
          fetchNodeFromMeshView(msg.fromNode);
          return;
        }
        // 'p' to go to packet
        if (input === "p" && dmMessages[selectedDMMessageIndex]) {
          const msg = dmMessages[selectedDMMessageIndex];
          const packetIndex = packets.findIndex(p => p.meshPacket?.id === msg.packetId);
          if (packetIndex >= 0) {
            setSelectedPacketIndex(packetIndex);
            setMode("packets");
          } else {
            showNotification("Packet not found in history", theme.status.offline);
          }
          return;
        }
        return;
      }

      // Conversation list navigation
      if (input === "j" || key.downArrow) {
        setSelectedDMConvoIndex((i) => Math.min(i + 1, dmConversations.length - 1));
        return;
      }
      if (input === "k" || key.upArrow) {
        setSelectedDMConvoIndex((i) => Math.max(i - 1, 0));
        return;
      }
      // 'l' or right arrow to enter message selection mode
      if ((input === "l" || key.rightArrow) && dmMessages.length > 0) {
        setSelectedDMMessageIndex(dmMessages.length - 1); // Start at most recent message
        return;
      }
      // Home/End for conversation list
      const isDmConvoHome = input === "g" || input === "\x1b[H" || input === "\x1b[1~" || input === "\x1bOH";
      const isDmConvoEnd = input === "G" || input === "\x1b[F" || input === "\x1b[4~" || input === "\x1bOF";
      if (isDmConvoHome) {
        setSelectedDMConvoIndex(0);
        return;
      }
      if (isDmConvoEnd) {
        setSelectedDMConvoIndex(dmConversations.length - 1);
        return;
      }
      // Delete confirmation mode
      if (dmDeleteConfirm && selectedConvo) {
        if (input === "y" || input === "Y") {
          db.deleteDMConversation(myNodeNum, selectedConvo.nodeNum);
          setDmConversations(db.getDMConversations(myNodeNum));
          setDmMessages([]);
          setSelectedDMConvoIndex(0);
          setDmDeleteConfirm(false);
          showNotification("Conversation deleted");
          return;
        }
        if (input === "n" || input === "N" || key.escape) {
          setDmDeleteConfirm(false);
          return;
        }
        return; // Ignore other keys during confirmation
      }
      // '#' to delete conversation
      if (input === "#" && selectedConvo) {
        setDmDeleteConfirm(true);
        return;
      }
      // Enter to focus input directly
      if (key.return && selectedConvo) {
        setDmInputFocused(true);
        return;
      }
      // 'n' to go to selected conversation's node
      if (input === "n" && selectedConvo) {
        navigateToNode(selectedConvo.nodeNum);
        return;
      }
      // 'u' to update selected conversation's node from MeshView
      if (input === "u" && selectedConvo) {
        fetchNodeFromMeshView(selectedConvo.nodeNum);
        return;
      }
    } else if (mode === "config") {
      const menuCount = getMenuItemCount();

      if (configSection === "menu") {
        // Menu navigation
        if (input === "j" || key.downArrow) {
          setConfigMenuIndex((i) => Math.min(i + 1, menuCount - 1));
          return;
        }
        if (input === "k" || key.upArrow) {
          setConfigMenuIndex((i) => Math.max(i - 1, 0));
          return;
        }
        // Column navigation with h/l or left/right arrows
        // Columns: radio (0-7), module (8-20), other (21-22), local (23)
        const columnStarts = [0, 8, 21, 23];
        const columnEnds = [7, 20, 22, 23];
        const getColumn = (idx: number) => {
          for (let c = 0; c < columnStarts.length; c++) {
            if (idx >= columnStarts[c] && idx <= columnEnds[c]) return c;
          }
          return 0;
        };
        const getRowInColumn = (idx: number, col: number) => idx - columnStarts[col];
        if (input === "h" || key.leftArrow) {
          const col = getColumn(configMenuIndex);
          if (col > 0) {
            const row = getRowInColumn(configMenuIndex, col);
            const newCol = col - 1;
            const maxRow = columnEnds[newCol] - columnStarts[newCol];
            const newRow = Math.min(row, maxRow);
            setConfigMenuIndex(columnStarts[newCol] + newRow);
          }
          return;
        }
        if (input === "l" || key.rightArrow) {
          const col = getColumn(configMenuIndex);
          if (col < columnStarts.length - 1) {
            const row = getRowInColumn(configMenuIndex, col);
            const newCol = col + 1;
            const maxRow = columnEnds[newCol] - columnStarts[newCol];
            const newRow = Math.min(row, maxRow);
            setConfigMenuIndex(columnStarts[newCol] + newRow);
          }
          return;
        }
        // Home/End
        const isConfigHome = input === "g" || input === "\x1b[H" || input === "\x1b[1~" || input === "\x1bOH";
        const isConfigEnd = input === "G" || input === "\x1b[F" || input === "\x1b[4~" || input === "\x1bOF";
        if (isConfigHome) {
          setConfigMenuIndex(0);
          return;
        }
        if (isConfigEnd) {
          setConfigMenuIndex(menuCount - 1);
          return;
        }
        // Enter to select section
        if (key.return) {
          const item = getMenuItemByIndex(configMenuIndex);
          if (item) {
            setConfigSection(item.key);
            // Reset indices when entering sections
            setSelectedConfigFieldIndex(0);
            if (item.key === "channels") {
              setSelectedChannelIndex(0);
            }
            requestConfigSection(item.key);
          }
          return;
        }
        // 'r' for reboot
        if (input === "r") {
          sendRebootRequest(2);
          return;
        }
        // 'b' to toggle batch edit mode
        if (input === "b") {
          if (batchEditMode) {
            showNotification(`Batch mode active (${batchEditCount} pending). Press 'c' to commit or 'C' to cancel.`);
          } else {
            startBatchEdit();
          }
          return;
        }
        // 'c' to commit batch edits
        if (input === "c" && batchEditMode) {
          commitBatchEdit();
          return;
        }
        // 'C' to cancel batch edits
        if (input === "C" && batchEditMode) {
          cancelBatchEdit();
          return;
        }
      } else {
        // Handle config editing mode
        if (configEditing) {
          if (key.escape) {
            setConfigEditing(null);
            setConfigEditValue("");
            return;
          }
          if (key.return) {
            // Save the edit - show notification to confirm we reached here
            showNotification(`Saving ${configEditing}...`);
            if (configSection === "user" && configOwner) {
              saveOwner(configEditing, configEditValue);
            } else if (configSection === "local" && configEditing === "meshViewUrl") {
              // Save local settings
              const newUrl = configEditValue.trim() || undefined;
              setSetting("meshViewUrl", newUrl);
              setLocalMeshViewUrl(newUrl);
              showNotification(newUrl ? `MeshView URL set to ${newUrl}` : "MeshView URL cleared");
            } else if (configSection === "channels" && configEditing?.startsWith("channel")) {
              // Save channel settings - parse channel index from field key like "channel0_name" or "channel0_psk"
              const nameMatch = configEditing.match(/^channel(\d+)_name$/);
              const pskMatch = configEditing.match(/^channel(\d+)_psk$/);
              if (nameMatch) {
                const channelIndex = parseInt(nameMatch[1], 10);
                saveChannel(channelIndex, { name: configEditValue });
              } else if (pskMatch) {
                const channelIndex = parseInt(pskMatch[1], 10);
                // Parse base64 PSK
                try {
                  const trimmed = configEditValue.trim();
                  if (trimmed === "" || trimmed === "0") {
                    // Empty or "0" means unencrypted
                    saveChannel(channelIndex, { psk: new Uint8Array([0]) });
                  } else if (trimmed === "1" || trimmed.toLowerCase() === "default") {
                    // "1" or "default" means default key
                    saveChannel(channelIndex, { psk: new Uint8Array([1]) });
                  } else {
                    // Try to decode as base64
                    const decoded = atob(trimmed);
                    const psk = new Uint8Array(decoded.length);
                    for (let i = 0; i < decoded.length; i++) {
                      psk[i] = decoded.charCodeAt(i);
                    }
                    saveChannel(channelIndex, { psk });
                  }
                } catch {
                  showNotification("Invalid base64 key");
                }
              }
            }
            setConfigEditing(null);
            setConfigEditValue("");
            return;
          }
          if (key.backspace || key.delete) {
            setConfigEditValue(s => s.slice(0, -1));
            return;
          }
          // Emacs keybindings
          if (key.ctrl && input === "w") {
            setConfigEditValue(s => s.replace(/\s*\S*$/, ""));
            return;
          }
          if (key.ctrl && (input === "k" || input === "u")) {
            setConfigEditValue("");
            return;
          }
          if (input && !key.ctrl && !key.meta) {
            setConfigEditValue(s => s + input);
            return;
          }
          return;
        }

        // In a config section - Escape to go back to menu
        if (key.escape) {
          setConfigSection("menu");
          return;
        }
        // Enter to refresh the config
        if (key.return) {
          requestConfigSection(configSection);
          return;
        }
        // 'e' to enter edit mode for user config
        if (input === "e" && configSection === "user" && configOwner) {
          // Start editing long name
          setConfigEditing("longName");
          setConfigEditValue(configOwner.longName || "");
          return;
        }
        // 'E' (shift+e) for short name
        if (input === "E" && configSection === "user" && configOwner) {
          setConfigEditing("shortName");
          setConfigEditValue(configOwner.shortName || "");
          return;
        }
        // 'e' to edit local settings
        if (input === "e" && configSection === "local") {
          setConfigEditing("meshViewUrl");
          setConfigEditValue(localMeshViewUrl || "");
          return;
        }
        // Generic config field navigation and editing for radio/module configs
        const isEditableConfigSection = [
          "device", "position", "power", "network", "display", "lora", "bluetooth", "security",
          "mqtt", "serial", "extnotif", "storeforward", "rangetest", "telemetry", "cannedmsg",
          "audio", "remotehw", "neighborinfo", "ambientlight", "detectionsensor", "paxcounter"
        ].includes(configSection);

        if (isEditableConfigSection) {
          const fieldCount = CONFIG_FIELD_COUNTS[configSection] || 0;

          // j/k to navigate fields
          if (input === "j" || key.downArrow) {
            setSelectedConfigFieldIndex(i => Math.min(i + 1, fieldCount - 1));
            return;
          }
          if (input === "k" || key.upArrow) {
            setSelectedConfigFieldIndex(i => Math.max(i - 1, 0));
            return;
          }
          // g/G for first/last field
          if (input === "g") {
            setSelectedConfigFieldIndex(0);
            return;
          }
          if (input === "G") {
            setSelectedConfigFieldIndex(fieldCount - 1);
            return;
          }
        }

        // Channel navigation and editing
        const validChannels = configChannels.filter(ch => ch != null).sort((a, b) => a.index - b.index);
        if (configSection === "channels" && validChannels.length > 0) {
          // j/k to navigate channels
          if (input === "j" || key.downArrow) {
            setSelectedChannelIndex(i => Math.min(i + 1, validChannels.length - 1));
            return;
          }
          if (input === "k" || key.upArrow) {
            setSelectedChannelIndex(i => Math.max(i - 1, 0));
            return;
          }
          // 'e' to edit channel name
          if (input === "e") {
            const channel = validChannels[selectedChannelIndex];
            if (channel) {
              setConfigEditing(`channel${channel.index}_name`);
              setConfigEditValue(channel.settings?.name || "");
            }
            return;
          }
          // 'r' to cycle channel role
          if (input === "r") {
            const channel = validChannels[selectedChannelIndex];
            if (channel) {
              // Cycle: DISABLED(0) -> PRIMARY(1) -> SECONDARY(2) -> DISABLED(0)
              const nextRole = (channel.role + 1) % 3;
              saveChannel(channel.index, { role: nextRole });
            }
            return;
          }
          // 'p' to edit PSK
          if (input === "p") {
            const channel = validChannels[selectedChannelIndex];
            if (channel) {
              setConfigEditing(`channel${channel.index}_psk`);
              // Show current PSK as base64
              const psk = channel.settings?.psk;
              if (psk && psk.length > 0 && !(psk.length === 1 && psk[0] === 0)) {
                const binary = String.fromCharCode(...psk);
                try {
                  setConfigEditValue(btoa(binary));
                } catch {
                  setConfigEditValue("");
                }
              } else {
                setConfigEditValue("");
              }
            }
            return;
          }
          // 'u' to toggle uplink
          if (input === "u") {
            const channel = validChannels[selectedChannelIndex];
            if (channel) {
              const newValue = !channel.settings?.uplinkEnabled;
              saveChannel(channel.index, { uplinkEnabled: newValue });
            }
            return;
          }
          // 'D' to toggle downlink (capital to avoid conflict with DM shortcut)
          if (input === "D") {
            const channel = validChannels[selectedChannelIndex];
            if (channel) {
              const newValue = !channel.settings?.downlinkEnabled;
              saveChannel(channel.index, { downlinkEnabled: newValue });
            }
            return;
          }
        }
      }
    } else if (mode === "meshview") {
      const pageSize = Math.max(1, terminalHeight - meshViewInspectorHeight - 10);

      // Navigation
      if (input === "j" || key.downArrow) {
        setSelectedMeshViewIndex((i) => Math.min(i + 1, meshViewPackets.length - 1));
        setMeshViewInspectorScrollOffset(0);
      }
      if (input === "k" || key.upArrow) {
        setSelectedMeshViewIndex((i) => Math.max(i - 1, 0));
        setMeshViewInspectorScrollOffset(0);
      }
      if ((key.ctrl && input === "d") || key.pageDown) {
        setSelectedMeshViewIndex((i) => Math.min(i + pageSize, meshViewPackets.length - 1));
        setMeshViewInspectorScrollOffset(0);
        return;
      }
      if ((key.ctrl && input === "u") || key.pageUp) {
        setSelectedMeshViewIndex((i) => Math.max(i - pageSize, 0));
        setMeshViewInspectorScrollOffset(0);
        return;
      }
      // Home/End
      const isMvHome = input === "g" || input === "\x1b[H" || input === "\x1b[1~" || input === "\x1bOH";
      const isMvEnd = input === "G" || input === "\x1b[F" || input === "\x1b[4~" || input === "\x1bOF";
      if (isMvHome) {
        setSelectedMeshViewIndex(0);
        setMeshViewInspectorScrollOffset(0);
      }
      if (isMvEnd) {
        setSelectedMeshViewIndex(meshViewPackets.length - 1);
        setMeshViewInspectorScrollOffset(0);
      }

      // Inspector tabs
      if (input === "h" || key.leftArrow) {
        setMeshViewInspectorTab((t) => t === "json" ? "info" : "json");
        setMeshViewInspectorScrollOffset(0);
      }
      if (input === "l" || key.rightArrow) {
        setMeshViewInspectorTab((t) => t === "info" ? "json" : "info");
        setMeshViewInspectorScrollOffset(0);
      }

      // Inspector scroll
      if (input === " " || input === "b") {
        const scrollAmount = meshViewInspectorHeight - 3;
        if (input === " ") {
          setMeshViewInspectorScrollOffset((o) => o + scrollAmount);
        } else {
          setMeshViewInspectorScrollOffset((o) => Math.max(0, o - scrollAmount));
        }
      }

      // Resize inspector
      if (input === "+" || input === "=") {
        setMeshViewInspectorHeight((h) => Math.min(h + 2, terminalHeight - 10));
      }
      if (input === "-" || input === "_") {
        setMeshViewInspectorHeight((h) => Math.max(h - 2, 6));
      }

      // Toggle expanded
      if (key.tab) {
        setMeshViewInspectorExpanded((e) => !e);
      }

      // 'o' to open packet in MeshView web UI
      if (input === "o") {
        if (!localMeshViewUrl) {
          showNotification("MeshView URL not configured", theme.status.offline);
          return;
        }
        const packet = meshViewPackets[selectedMeshViewIndex];
        if (packet) {
          try {
            const url = `${localMeshViewUrl}/packet/${packet.id}`;
            validateUrl(url); // Validate before opening
            safeOpenUrl(url);
          } catch (error) {
            Logger.error("App", "Failed to open MeshView URL", error as Error);
            showNotification("Failed to open MeshView URL", theme.status.error);
          }
        }
      }

      // 'c' to clear and refresh
      if (input === "c") {
        meshViewStoreRef.current.clear();
        setMeshViewPackets([]);
        setSelectedMeshViewIndex(0);
        setMeshViewInspectorScrollOffset(0);
      }
    }
  });

  const selectedPacket = packets[selectedPacketIndex];
  const selectedNode = nodes[selectedNodeIndex];

  const getModeLabel = () => {
    const p = mode === "packets";
    const n = mode === "nodes";
    const c = mode === "chat";
    const d = mode === "dm";
    const cfg = mode === "config";
    const l = mode === "log";
    const mv = mode === "meshview";
    const compact = terminalWidth <= 90;
    return (
      <Text>
        <Text color={p ? theme.fg.accent : theme.fg.muted} bold={p}>{compact ? "[P]" : "[PACKETS]"}</Text>
        {" "}
        <Text color={n ? theme.fg.accent : theme.fg.muted} bold={n}>{compact ? "[N]" : "[NODES]"}</Text>
        {" "}
        <Text color={c ? theme.fg.accent : theme.fg.muted} bold={c}>{compact ? "[C]" : "[CHAT]"}</Text>
        {" "}
        <Text color={d ? theme.fg.accent : theme.fg.muted} bold={d}>{compact ? "[D]" : "[DM]"}</Text>
        {" "}
        <Text color={l ? theme.fg.accent : theme.fg.muted} bold={l}>{compact ? "[L]" : "[LOG]"}</Text>
        {localMeshViewUrl && (
          <>
            {" "}
            <Text color={mv ? theme.fg.accent : theme.fg.muted} bold={mv}>{compact ? "[M]" : "[MESHVIEW]"}</Text>
          </>
        )}
        {" "}
        <Text color={cfg ? theme.fg.accent : theme.fg.muted} bold={cfg}>{compact ? "[CFG]" : "[CONFIG]"}</Text>
      </Text>
    );
  };

  const statusColor = status === "connected" ? theme.status.online : theme.status.offline;
  const nodeCount = nodes.length;

  const helpHint = terminalWidth < 65 ? "[?]" : terminalWidth <= 90 ? `v${packageJson.version} | [?]` : `v${packageJson.version} | [?] Help`;

  // Show connecting screen
  if (!transport) {
    const banner = terminalWidth <= 90 ? "▓ MESHTASTIC ▓" : "▓▓▓ MESHTASTIC ▓▓▓";
    return (
      <Box flexDirection="column" width="100%" height="100%" justifyContent="center" alignItems="center">
        <Box flexDirection="column" alignItems="center">
          <Text bold color={theme.fg.accent}>{banner}</Text>
          <Text> </Text>
          {connectError ? (
            <>
              <Text color={theme.packet.encrypted}>Connection failed</Text>
              <Text color={theme.fg.muted}>{connectError}</Text>
              <Text> </Text>
              <Text color={theme.fg.secondary}>Press q to quit</Text>
            </>
          ) : (
            <>
              <Text color={theme.fg.accent}>{SPINNER_FRAMES[spinnerFrame]} Connecting to {address}...</Text>
            </>
          )}
        </Box>
      </Box>
    );
  }

  const banner = terminalWidth < 65 ? "" : terminalWidth <= 90 ? "▓ MESHTASTIC ▓" : "▓▓▓ MESHTASTIC ▓▓▓";

  // Truncate node name to fit small screens
  const nodeName = myShortName || (myNodeNum ? nodeStore.getNodeName(myNodeNum) : "???");
  const maxNodeNameLength = terminalWidth < 65 ? 10 : 20;
  const truncatedNodeName = nodeName.length > maxNodeNameLength ? nodeName.slice(0, maxNodeNameLength - 1) + "…" : nodeName;

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <Box
        height={3}
        borderStyle="single"
        borderColor={theme.border.normal}
        paddingX={2}
        justifyContent="space-between"
        alignItems="center"
        flexWrap="nowrap"
      >
        {banner && <Text bold color={theme.fg.accent}>{banner}</Text>}
        <Text color={theme.fg.secondary} flexShrink={1}>
          {truncatedNodeName} <Text color={theme.fg.muted}>{formatNodeId(myNodeNum)}</Text>
        </Text>
        <Box flexShrink={0}>
          {getModeLabel()}
        </Box>
      </Box>

      {/* Main content */}
      <Box key={refreshKey} flexGrow={1} flexDirection="column">
        {mode === "packets" && (() => {
          const contentHeight = terminalHeight - 4;
          const listHeight = inspectorExpanded
            ? Math.floor(contentHeight * 0.2)
            : contentHeight - inspectorHeight;
          const detailHeight = inspectorExpanded
            ? Math.floor(contentHeight * 0.8)
            : inspectorHeight;
          return (
            <Box height={contentHeight} flexDirection="column">
              <Box flexGrow={1} borderStyle="single" borderColor={theme.border.normal}>
                <PacketList
                  packets={packets}
                  selectedIndex={selectedPacketIndex}
                  nodeStore={nodeStore}
                  height={listHeight}
                  isFollowing={selectedPacketIndex === packets.length - 1}
                  useFahrenheit={useFahrenheit}
                  meshViewConfirmedIds={meshViewConfirmedIds}
                />
              </Box>
              <Box height={detailHeight} borderStyle="single" borderColor={theme.border.normal}>
                <PacketInspector packet={selectedPacket} activeTab={inspectorTab} height={detailHeight - 2} nodeStore={nodeStore} scrollOffset={inspectorScrollOffset} meshViewUrl={localMeshViewUrl} useFahrenheit={useFahrenheit} />
              </Box>
            </Box>
          );
        })()}

        {mode === "nodes" && (() => {
          const filteredNodes = getSortedNodes(nodesFilter
            ? nodes.filter(n =>
                (n.shortName?.toLowerCase().includes(nodesFilter.toLowerCase())) ||
                (n.longName?.toLowerCase().includes(nodesFilter.toLowerCase()))
              )
            : nodes, nodesSortKey, nodesSortAscending);
          return (
            <Box flexGrow={1} borderStyle="single" borderColor={theme.border.normal}>
              <NodesPanel
                nodes={filteredNodes}
                selectedIndex={selectedNodeIndex}
                height={terminalHeight - 6}
                filter={nodesFilter}
                filterInputActive={nodesFilterInput}
                sortKey={nodesSortKey}
                sortAscending={nodesSortAscending}
                terminalWidth={terminalWidth}
              />
            </Box>
          );
        })()}

        {mode === "chat" && (
          <Box flexGrow={1} flexDirection="column">
            <ChatPanel
              messages={messages}
              channel={chatChannel}
              channels={channels}
              input={chatInput}
              inputFocused={chatInputFocused}
              nodeStore={nodeStore}
              myNodeNum={myNodeNum}
              height={terminalHeight - 4}
              width={terminalWidth}
              selectedMessageIndex={selectedChatMessageIndex}
              showEmojiSelector={showEmojiSelector}
              emojiSelectorIndex={emojiSelectorIndex}
              loraConfig={loraConfig}
              filter={chatFilter}
              filterInputActive={chatFilterInput}
              meshViewConfirmedIds={meshViewConfirmedIds}
              replyTo={chatReplyTo}
            />
          </Box>
        )}

        {mode === "dm" && (() => {
          const contentHeight = terminalHeight - 4;
          return (
            <Box height={contentHeight} borderStyle="single" borderColor={theme.border.normal}>
              <DMPanel
                conversations={dmConversations}
                messages={dmMessages}
                selectedConvoIndex={selectedDMConvoIndex}
                selectedMessageIndex={selectedDMMessageIndex}
                inputFocused={dmInputFocused}
                input={dmInput}
                nodeStore={nodeStore}
                myNodeNum={myNodeNum}
                height={contentHeight - 2}
                width={terminalWidth}
                deleteConfirm={dmDeleteConfirm}
                meshViewConfirmedIds={meshViewConfirmedIds}
                replyTo={dmReplyTo}
              />
            </Box>
          );
        })()}

        {mode === "config" && (
          <Box flexGrow={1} borderStyle="single" borderColor={theme.border.normal}>
            <ConfigPanel
              section={configSection}
              selectedMenuIndex={configMenuIndex}
              height={terminalHeight - 6}
              loading={configLoading}
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
              channels={configChannels}
              owner={configOwner}
              meshViewUrl={localMeshViewUrl}
              editingField={configEditing}
              editValue={configEditValue}
              selectedFieldIndex={selectedConfigFieldIndex}
              selectedChannelIndex={selectedChannelIndex}
              batchEditMode={batchEditMode}
              batchEditCount={batchEditCount}
            />
          </Box>
        )}

        {mode === "log" && (
          <Box flexGrow={1} borderStyle="single" borderColor={theme.border.normal}>
            <LogPanel
              responses={logResponses}
              selectedIndex={selectedLogIndex}
              height={terminalHeight - 6}
              nodeStore={nodeStore}
            />
          </Box>
        )}

        {mode === "meshview" && (() => {
          const listHeight = meshViewInspectorExpanded
            ? Math.floor((terminalHeight - 7) * 0.2)
            : terminalHeight - meshViewInspectorHeight - 7;
          const detailHeight = meshViewInspectorExpanded
            ? Math.floor((terminalHeight - 7) * 0.8)
            : meshViewInspectorHeight;

          return (
            <>
              <Box flexGrow={1} borderStyle="single" borderColor={theme.border.normal}>
                <MeshViewPacketList
                  packets={meshViewPackets}
                  selectedIndex={selectedMeshViewIndex}
                  height={listHeight}
                  error={meshViewError}
                  useFahrenheit={useFahrenheit}
                />
              </Box>
              <Box height={detailHeight} borderStyle="single" borderColor={theme.border.normal}>
                <MeshViewInspector
                  packet={meshViewPackets[selectedMeshViewIndex]}
                  activeTab={meshViewInspectorTab}
                  height={detailHeight - 2}
                  scrollOffset={meshViewInspectorScrollOffset}
                  meshViewUrl={localMeshViewUrl}
                  useFahrenheit={useFahrenheit}
                />
              </Box>
            </>
          );
        })()}
      </Box>

      {/* Status bar */}
      <Box height={1} paddingX={1} flexWrap="nowrap" overflow="hidden">
        <Text color={statusColor}>{status.toUpperCase()}</Text>
        <Text color={theme.fg.muted}> | </Text>
        <Text color={theme.fg.secondary}>{packets.length} pkts</Text>
        <Text color={theme.fg.muted}> | </Text>
        <Text color={theme.fg.secondary}>{nodeCount} nodes</Text>
        <Text color={theme.fg.muted}> | </Text>
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          <Text color={notification ? (notification.color || theme.fg.accent) : theme.fg.muted}>
            {notification?.message || helpHint}
          </Text>
        </Box>
      </Box>

      {/* Help dialog overlay */}
      {showHelp && (
        <Box
          position="absolute"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          width="100%"
          height="100%"
        >
          <HelpDialog mode={mode} meshViewUrl={localMeshViewUrl} />
        </Box>
      )}

      {/* Quit confirmation dialog */}
      {showQuitDialog && (
        <Box
          position="absolute"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          width="100%"
          height="100%"
        >
          <QuitDialog
            onConfirm={() => {
              exit();
              process.stdout.write('\x1bc'); // Clear screen on quit
              process.exit(0);
            }}
            onCancel={() => setShowQuitDialog(false)}
          />
        </Box>
      )}

      {/* Response modal overlay */}
      {showResponseModal && responseModalData && (
        <Box
          position="absolute"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          width="100%"
          height="100%"
        >
          <ResponseModal
            type={responseModalData.type}
            fromNode={responseModalData.fromNode}
            data={responseModalData.data}
            nodeStore={nodeStore}
            onDismiss={() => {
              setShowResponseModal(false);
              setResponseModalData(null);
            }}
          />
        </Box>
      )}

      {/* Reboot modal overlay */}
      {showRebootModal && (
        <Box
          position="absolute"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          width="100%"
          height="100%"
        >
          <RebootModal
            reason={rebootReason}
            elapsed={rebootElapsed}
            timeout={60}
          />
        </Box>
      )}

      {deviceNotification && (
        <Box
          position="absolute"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          width="100%"
          height="100%"
        >
          <DeviceNotificationModal
            message={deviceNotification.message}
            level={deviceNotification.level}
            remaining={deviceNotificationRemaining}
          />
        </Box>
      )}
    </Box>
  );
}
