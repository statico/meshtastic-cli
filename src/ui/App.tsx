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
import { ConfigPanel, ConfigSection, getMenuItemByIndex, getMenuItemCount } from "./components/ConfigPanel";
import * as adminHelper from "../protocol/admin";
import { HelpDialog } from "./components/HelpDialog";
import { QuitDialog } from "./components/QuitDialog";
import { ResponseModal } from "./components/ResponseModal";
import { LogPanel } from "./components/LogPanel";
import * as db from "../db";
import { toBinary, create } from "@bufbuild/protobuf";
import { formatNodeId } from "../utils/hex";
import { exec } from "child_process";

const BROADCAST_ADDR = 0xFFFFFFFF;

type AppMode = "packets" | "nodes" | "chat" | "dm" | "config" | "log";

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
  bruteForceDepth?: number;
}

export function App({ address, packetStore, nodeStore, skipConfig = false, bruteForceDepth = 2 }: AppProps) {
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
    type: "position" | "traceroute";
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
    (async () => {
      try {
        const t = await HttpTransport.create(address);
        if (!cancelled) {
          setTransport(t);
        }
      } catch (e) {
        if (!cancelled) {
          setConnectError(e instanceof Error ? e.message : String(e));
          setStatus("disconnected");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [address]);

  // Track terminal resize
  useEffect(() => {
    const updateSize = () => {
      setTerminalHeight(stdout?.rows || 24);
      setTerminalWidth(stdout?.columns || 80);
    };
    stdout?.on("resize", updateSize);
    return () => {
      stdout?.off("resize", updateSize);
    };
  }, [stdout]);

  // Reset inspector scroll when packet or tab changes
  useEffect(() => {
    setInspectorScrollOffset(0);
  }, [selectedPacketIndex, inspectorTab]);

  const [myNodeNum, setMyNodeNum] = useState(0);
  const [myShortName, setMyShortName] = useState("");
  const [messages, setMessages] = useState<db.DbMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatChannel, setChatChannel] = useState(0);
  const [chatInputFocused, setChatInputFocused] = useState(false);
  const [selectedChatMessageIndex, setSelectedChatMessageIndex] = useState(-1);
  const [showEmojiSelector, setShowEmojiSelector] = useState(false);
  const [emojiSelectorIndex, setEmojiSelectorIndex] = useState(0);
  const [channels, setChannels] = useState<Map<number, ChannelInfo>>(new Map());
  const [notification, setNotification] = useState("");

  // DM state
  const [dmConversations, setDmConversations] = useState<db.DMConversation[]>([]);
  const [dmMessages, setDmMessages] = useState<db.DbMessage[]>([]);
  const [selectedDMConvoIndex, setSelectedDMConvoIndex] = useState(0);
  const [selectedDMMessageIndex, setSelectedDMMessageIndex] = useState(-1);
  const [dmInputFocused, setDmInputFocused] = useState(false);
  const [dmInput, setDmInput] = useState("");

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

  // Filter state
  const [nodesFilter, setNodesFilter] = useState("");
  const [nodesFilterInput, setNodesFilterInput] = useState(false);
  const [chatFilter, setChatFilter] = useState("");
  const [chatFilterInput, setChatFilterInput] = useState(false);

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

  const processPacketForNodes = useCallback((packet: DecodedPacket) => {
    const fr = packet.fromRadio;
    if (!fr) return;

    if (fr.payloadVariant.case === "myInfo") {
      const myInfo = fr.payloadVariant.value as Mesh.MyNodeInfo;
      setMyNodeNum(myInfo.myNodeNum);
    }

    if (fr.payloadVariant.case === "nodeInfo") {
      const nodeInfo = fr.payloadVariant.value;
      nodeStore.updateFromNodeInfo(nodeInfo);
    }

    if (fr.payloadVariant.case === "channel") {
      const channel = fr.payloadVariant.value as Mesh.Channel;
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

      if (packet.portnum === Portnums.PortNum.TEXT_MESSAGE_APP && typeof packet.payload === "string") {
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
          db.updateMessageStatus(packet.requestId, newStatus);
          setMessages((prev) =>
            prev.map((m) =>
              m.packetId === packet.requestId ? { ...m, status: newStatus } : m
            )
          );
        }
      }

      // Handle admin responses for config
      if (packet.portnum === Portnums.PortNum.ADMIN_APP && mp.to === myNodeNum && packet.payload) {
        const adminMsg = packet.payload as Admin.AdminMessage;
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

  useEffect(() => {
    const unsubscribe = packetStore.onPacket((packet) => {
      processPacketRef.current(packet);
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

  // Start transport
  useEffect(() => {
    if (!transport) return;

    let running = true;
    let configRequested = false;

    (async () => {
      for await (const output of transport.fromDevice) {
        if (!running) break;
        if (output.type === "status") {
          setStatus(output.status);
          if (output.status === "connected" && !configRequested) {
            configRequested = true;
            if (!skipConfig) {
              requestConfig();
            }
            fetchOwnerFallback();
          }
        } else if (output.type === "packet") {
          const { decodeFromRadio } = await import("../protocol/decoder");
          const decoded = decodeFromRadio(output.data);
          packetStore.add(decoded);
        }
      }
    })();

    return () => {
      running = false;
    };
  }, [transport]);

  const requestConfig = useCallback(async () => {
    if (!transport) return;
    const toRadio = create(Mesh.ToRadioSchema, {
      payloadVariant: { case: "wantConfigId", value: Math.floor(Math.random() * 0xffffffff) },
    });
    try {
      const binary = toBinary(Mesh.ToRadioSchema, toRadio);
      await transport.send(binary);
    } catch {
      showNotification("Failed to request config");
    }
  }, [transport]);

  const fetchOwnerFallback = useCallback(async () => {
    if (!transport?.fetchOwner) return;
    const owner = await transport.fetchOwner();
    if (owner && owner.myNodeNum) {
      setMyNodeNum(owner.myNodeNum);
      setMyShortName(owner.shortName || "");
    }
  }, [transport]);

  const showNotification = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(""), 2000);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!transport || !myNodeNum || !text.trim()) return;

    const packetId = Math.floor(Math.random() * 0xffffffff);
    const data = create(Mesh.DataSchema, {
      portnum: Portnums.PortNum.TEXT_MESSAGE_APP,
      payload: new TextEncoder().encode(text),
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
      };
      db.insertMessage(msg);
      setMessages((prev) => [...prev, msg].slice(-100));
      setChatInput("");
    } catch {
      showNotification("Failed to send message");
    }
  }, [myNodeNum, chatChannel, transport, showNotification]);

  const sendDM = useCallback(async (text: string, toNode: number) => {
    if (!transport || !myNodeNum || !text.trim()) return;

    const packetId = Math.floor(Math.random() * 0xffffffff);
    const data = create(Mesh.DataSchema, {
      portnum: Portnums.PortNum.TEXT_MESSAGE_APP,
      payload: new TextEncoder().encode(text),
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
      };
      db.insertMessage(msg);
      setMessages((prev) => [...prev, msg].slice(-100));
      setDmInput("");
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

  const requestConfigSection = useCallback(async (section: ConfigSection) => {
    if (!transport || !myNodeNum) return;
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

  const sendRebootRequest = useCallback(async (seconds: number = 2) => {
    if (!transport || !myNodeNum) return;
    try {
      const binary = adminHelper.createRebootRequest(seconds, { myNodeNum });
      await transport.send(binary);
      showNotification(`Rebooting device in ${seconds}s...`);
    } catch {
      showNotification("Failed to send reboot request");
    }
  }, [myNodeNum, transport, showNotification]);

  // Key input handling
  useInput((input, key) => {
    // If quit dialog is showing, it handles its own input
    if (showQuitDialog) {
      return;
    }

    // Quit - show confirmation dialog (allow in chat when input not focused)
    if ((input === "q" || input === "Q") && (mode !== "chat" || !chatInputFocused)) {
      setShowQuitDialog(true);
      return;
    }
    if (key.ctrl && input === "c") {
      setShowQuitDialog(true);
      return;
    }

    // Toggle help
    if (input === "?") {
      setShowHelp((h) => !h);
      return;
    }

    // Close help on any key if open
    if (showHelp) {
      setShowHelp(false);
      return;
    }

    // Mode switching (allow in chat/dm only when input not focused)
    const inputFocused = (mode === "chat" && chatInputFocused) || (mode === "dm" && dmInputFocused);
    if (!inputFocused) {
      if (input === "1") { setMode("packets"); setChatInputFocused(false); setDmInputFocused(false); return; }
      if (input === "2") { setMode("nodes"); setChatInputFocused(false); setDmInputFocused(false); return; }
      if (input === "3") { setMode("chat"); return; }
      if (input === "4") { setMode("dm"); return; }
      if (input === "5") { setMode("config"); setChatInputFocused(false); setDmInputFocused(false); return; }
      if (input === "6") { setMode("log"); setChatInputFocused(false); setDmInputFocused(false); return; }
    }
    // Only treat bare escape (not escape sequences like Home/End) as tab switch
    const isBareEscape = key.escape && (input === "" || input === "\x1b");
    if (mode === "chat" && isBareEscape && !chatInputFocused && !showEmojiSelector) {
      setMode("packets");
      return;
    }
    if (mode === "dm" && isBareEscape && !dmInputFocused) {
      setMode("packets");
      return;
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
      }
      if ((key.ctrl && input === "u") || key.pageUp) {
        setSelectedPacketIndex((i) => Math.max(i - pageSize, 0));
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
          exec(`open "https://www.google.com/maps?q=${lat},${lon}"`);
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
    } else if (mode === "nodes") {
      // Compute filtered nodes for length checks
      const filteredNodes = nodesFilter
        ? nodes.filter(n =>
            (n.shortName?.toLowerCase().includes(nodesFilter.toLowerCase())) ||
            (n.longName?.toLowerCase().includes(nodesFilter.toLowerCase()))
          )
        : nodes;

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
      }
      if ((key.ctrl && input === "u") || key.pageUp) {
        setSelectedNodeIndex((i) => Math.max(i - nodePageSize, 0));
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
      if (input === "t" && selectedNode) {
        sendTraceroute(selectedNode.num);
      }
      if (input === "p" && selectedNode) {
        sendPositionRequest(selectedNode.num);
      }
      if (input === "e" && selectedNode) {
        sendTelemetryRequest(selectedNode.num);
      }
      if (input === "d" && selectedNode) {
        startDMWith(selectedNode.num);
      }
      if (input === "D" && selectedNode) {
        sendTraceroute(selectedNode.num, 0); // Direct ping
      }
      if (input === "l" && selectedNode?.hwModel) {
        const hwName = Mesh.HardwareModel[selectedNode.hwModel!];
        if (hwName) {
          const query = encodeURIComponent(`Meshtastic ${hwName}`);
          exec(`open "https://www.google.com/search?q=${query}"`);
        }
      }
      if (input === "m" && selectedNode) {
        if (selectedNode.latitudeI != null && selectedNode.longitudeI != null) {
          const lat = selectedNode.latitudeI / 1e7;
          const lon = selectedNode.longitudeI / 1e7;
          exec(`open "https://www.google.com/maps?q=${lat},${lon}"`);
        } else {
          showNotification("No position data for this node");
        }
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
    } else if (mode === "chat") {
      const channelMessages = messages.filter((m) => m.channel === chatChannel);
      const emojiCount = 15; // FIRMWARE_EMOJIS.length

      // Emoji selector mode
      if (showEmojiSelector) {
        if (key.escape) {
          setShowEmojiSelector(false);
          return;
        }
        if (key.leftArrow) {
          setEmojiSelectorIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (key.rightArrow) {
          setEmojiSelectorIndex((i) => Math.min(i + 1, emojiCount - 1));
          return;
        }
        if (key.return) {
          // Import emoji and insert - need to get from ChatPanel
          const emojis = ["👋", "👍", "👎", "❓", "‼️", "💩", "🤣", "🤠", "🐭", "☀️", "☔", "☁️", "🌫️", "😈", "♥️"];
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
          return;
        }
        if (key.return) {
          if (chatInput.trim()) {
            sendMessage(chatInput);
          }
          return;
        }
        if (key.backspace || key.delete) {
          setChatInput((s) => s.slice(0, -1));
          return;
        }
        // Ctrl+E for emoji selector
        if (key.ctrl && input === "e") {
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
            const nodeIndex = nodes.findIndex((n) => n.num === selectedMsg.fromNode);
            if (nodeIndex >= 0) {
              setMode("nodes");
              setSelectedNodeIndex(nodeIndex);
            }
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
      }
    } else if (mode === "dm") {
      const selectedConvo = dmConversations[selectedDMConvoIndex];

      if (dmInputFocused) {
        if (key.escape) {
          setDmInputFocused(false);
          return;
        }
        if (key.return && dmInput.trim() && selectedConvo) {
          sendDM(dmInput, selectedConvo.nodeNum);
          return;
        }
        if (key.backspace || key.delete) {
          setDmInput((s) => s.slice(0, -1));
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
        if (key.escape) {
          setSelectedDMMessageIndex(-1);
          return;
        }
        if (key.return) {
          setDmInputFocused(true);
          setSelectedDMMessageIndex(-1);
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
          const nodeIndex = nodes.findIndex((n) => n.num === msg.fromNode);
          if (nodeIndex >= 0) {
            setMode("nodes");
            setSelectedNodeIndex(nodeIndex);
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
      // Enter to focus messages or input
      if (key.return && selectedConvo) {
        if (dmMessages.length > 0) {
          setSelectedDMMessageIndex(dmMessages.length - 1);
        } else {
          setDmInputFocused(true);
        }
        return;
      }
      // 'n' to go to selected conversation's node
      if (input === "n" && selectedConvo) {
        const nodeIndex = nodes.findIndex((n) => n.num === selectedConvo.nodeNum);
        if (nodeIndex >= 0) {
          setMode("nodes");
          setSelectedNodeIndex(nodeIndex);
        }
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
            requestConfigSection(item.key);
          }
          return;
        }
        // 'r' for reboot
        if (input === "r") {
          sendRebootRequest(2);
          return;
        }
      } else {
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
    return (
      <Text>
        <Text color={p ? theme.fg.accent : theme.fg.muted} bold={p}>[PACKETS]</Text>
        {" "}
        <Text color={n ? theme.fg.accent : theme.fg.muted} bold={n}>[NODES]</Text>
        {" "}
        <Text color={c ? theme.fg.accent : theme.fg.muted} bold={c}>[CHAT]</Text>
        {" "}
        <Text color={d ? theme.fg.accent : theme.fg.muted} bold={d}>[DM]</Text>
        {" "}
        <Text color={cfg ? theme.fg.accent : theme.fg.muted} bold={cfg}>[CONFIG]</Text>
        {" "}
        <Text color={l ? theme.fg.accent : theme.fg.muted} bold={l}>[LOG]</Text>
      </Text>
    );
  };

  const statusColor = status === "connected" ? theme.status.online : theme.status.offline;
  const nodeCount = nodes.length;

  const helpHint = "[?] Help";

  // Show connecting screen
  if (!transport) {
    return (
      <Box flexDirection="column" width="100%" height="100%" justifyContent="center" alignItems="center">
        <Box flexDirection="column" alignItems="center">
          <Text bold color={theme.fg.accent}>{"▓▓▓ MESHTASTIC ▓▓▓"}</Text>
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
      >
        <Text bold color={theme.fg.accent}>{"▓▓▓ MESHTASTIC ▓▓▓"}</Text>
        <Text color={theme.fg.secondary}>
          {myShortName || (myNodeNum ? nodeStore.getNodeName(myNodeNum) : "???")} <Text color={theme.fg.muted}>{formatNodeId(myNodeNum)}</Text>
        </Text>
        {getModeLabel()}
      </Box>

      {/* Main content */}
      <Box flexGrow={1} flexDirection="column">
        {mode === "packets" && (() => {
          const listHeight = inspectorExpanded
            ? Math.floor((terminalHeight - 7) * 0.2)
            : terminalHeight - inspectorHeight - 7;
          const detailHeight = inspectorExpanded
            ? Math.floor((terminalHeight - 7) * 0.8)
            : inspectorHeight;
          return (
            <>
              <Box flexGrow={1} borderStyle="single" borderColor={theme.border.normal}>
                <PacketList
                  packets={packets}
                  selectedIndex={selectedPacketIndex}
                  nodeStore={nodeStore}
                  height={listHeight}
                  isFollowing={selectedPacketIndex === packets.length - 1}
                />
              </Box>
              <Box height={detailHeight} borderStyle="single" borderColor={theme.border.normal}>
                <PacketInspector packet={selectedPacket} activeTab={inspectorTab} height={detailHeight - 2} nodeStore={nodeStore} scrollOffset={inspectorScrollOffset} bruteForceDepth={bruteForceDepth} />
              </Box>
            </>
          );
        })()}

        {mode === "nodes" && (() => {
          const filteredNodes = nodesFilter
            ? nodes.filter(n =>
                (n.shortName?.toLowerCase().includes(nodesFilter.toLowerCase())) ||
                (n.longName?.toLowerCase().includes(nodesFilter.toLowerCase()))
              )
            : nodes;
          return (
            <Box flexGrow={1} borderStyle="single" borderColor={theme.border.normal}>
              <NodesPanel
                nodes={filteredNodes}
                selectedIndex={selectedNodeIndex}
                height={terminalHeight - 6}
                filter={nodesFilter}
                filterInputActive={nodesFilterInput}
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
      </Box>

      {/* Status bar */}
      <Box height={1} paddingX={1}>
        <Text color={statusColor}>{status.toUpperCase()}</Text>
        <Text color={theme.fg.muted}> | </Text>
        <Text color={theme.fg.secondary}>{packets.length} pkts</Text>
        <Text color={theme.fg.muted}> | </Text>
        <Text color={theme.fg.secondary}>{nodeCount} nodes</Text>
        <Text color={theme.fg.muted}> | </Text>
        <Text color={notification ? theme.fg.accent : theme.fg.muted}>
          {notification || helpHint}
        </Text>
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
          <HelpDialog mode={mode} />
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
    </Box>
  );
}
