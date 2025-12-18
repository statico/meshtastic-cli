import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { theme } from "./theme";
import type { DecodedPacket } from "../protocol/decoder";
import type { PacketStore } from "../protocol/packet-store";
import type { NodeStore, NodeData } from "../protocol/node-store";
import type { Transport, DeviceStatus } from "../transport/types";
import { HttpTransport } from "../transport";
import { Mesh, Portnums, Telemetry, Channel } from "@meshtastic/protobufs";
import { PacketList } from "./components/PacketList";
import { PacketInspector, InspectorTab } from "./components/PacketInspector";
import { NodesPanel } from "./components/NodesPanel";
import { ChatPanel } from "./components/ChatPanel";
import { HelpDialog } from "./components/HelpDialog";
import { QuitDialog } from "./components/QuitDialog";
import { ResponseModal } from "./components/ResponseModal";
import { LogPanel } from "./components/LogPanel";
import * as db from "../db";
import { toBinary, create } from "@bufbuild/protobuf";
import { formatNodeId } from "../utils/hex";
import { exec } from "child_process";

type AppMode = "packets" | "nodes" | "chat" | "log";

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
}

export function App({ address, packetStore, nodeStore, skipConfig = false }: AppProps) {
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
        setMessages((prev) => [...prev, msg].slice(-100));
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

    // Mode switching (allow in chat only when input not focused)
    if (mode !== "chat" || !chatInputFocused) {
      if (input === "1") { setMode("packets"); setChatInputFocused(false); return; }
      if (input === "2") { setMode("nodes"); setChatInputFocused(false); return; }
      if (input === "3") { setMode("chat"); return; }
      if (input === "4") { setMode("log"); setChatInputFocused(false); return; }
    }
    if (mode === "chat" && key.escape && !chatInputFocused && !showEmojiSelector) {
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
      const nodePageSize = Math.max(1, terminalHeight - 16);
      if (input === "j" || key.downArrow) {
        setSelectedNodeIndex((i) => Math.min(i + 1, nodes.length - 1));
      }
      if (input === "k" || key.upArrow) {
        setSelectedNodeIndex((i) => Math.max(i - 1, 0));
      }
      // Page up/down
      if ((key.ctrl && input === "d") || key.pageDown) {
        setSelectedNodeIndex((i) => Math.min(i + nodePageSize, nodes.length - 1));
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
        setSelectedNodeIndex(nodes.length - 1);
      }
      if (input === "t" && nodes[selectedNodeIndex]) {
        sendTraceroute(nodes[selectedNodeIndex].num);
      }
      if (input === "p" && nodes[selectedNodeIndex]) {
        sendPositionRequest(nodes[selectedNodeIndex].num);
      }
      if (input === "e" && nodes[selectedNodeIndex]) {
        sendTelemetryRequest(nodes[selectedNodeIndex].num);
      }
      if (input === "d" && nodes[selectedNodeIndex]) {
        sendTraceroute(nodes[selectedNodeIndex].num, 0);
      }
      if (input === "l" && nodes[selectedNodeIndex]?.hwModel) {
        const hwName = Mesh.HardwareModel[nodes[selectedNodeIndex].hwModel!];
        if (hwName) {
          const query = encodeURIComponent(`Meshtastic ${hwName}`);
          exec(`open "https://www.google.com/search?q=${query}"`);
        }
      }
      if (input === "m" && nodes[selectedNodeIndex]) {
        const node = nodes[selectedNodeIndex];
        if (node.latitudeI != null && node.longitudeI != null) {
          const lat = node.latitudeI / 1e7;
          const lon = node.longitudeI / 1e7;
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
      // Home/End keys
      const isLogHome = input === "\x1b[H" || input === "\x1b[1~" || input === "\x1bOH";
      const isLogEnd = input === "\x1b[F" || input === "\x1b[4~" || input === "\x1bOF";
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
      } else {
        // Message navigation
        if (input === "j" || key.downArrow) {
          setSelectedChatMessageIndex((i) => {
            if (i < 0) return channelMessages.length - 1; // Start at bottom
            return Math.min(i + 1, channelMessages.length - 1);
          });
          return;
        }
        if (input === "k" || key.upArrow) {
          setSelectedChatMessageIndex((i) => {
            if (i < 0) return channelMessages.length - 1; // Start at bottom
            return Math.max(i - 1, 0);
          });
          return;
        }
        // Page up/down
        const chatPageSize = Math.max(1, terminalHeight - 12);
        if ((key.ctrl && input === "d") || key.pageDown) {
          setSelectedChatMessageIndex((i) => Math.min(i + chatPageSize, channelMessages.length - 1));
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
          setSelectedChatMessageIndex(Math.max(0, channelMessages.length - 1));
          return;
        }
        // 'n' to go to sender node
        if (input === "n") {
          const selectedMsg = channelMessages[selectedChatMessageIndex];
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
    const l = mode === "log";
    return (
      <Text>
        <Text color={p ? theme.fg.accent : theme.fg.muted} bold={p}>[PACKETS]</Text>
        {" "}
        <Text color={n ? theme.fg.accent : theme.fg.muted} bold={n}>[NODES]</Text>
        {" "}
        <Text color={c ? theme.fg.accent : theme.fg.muted} bold={c}>[CHAT]</Text>
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
                <PacketInspector packet={selectedPacket} activeTab={inspectorTab} height={detailHeight - 2} nodeStore={nodeStore} scrollOffset={inspectorScrollOffset} />
              </Box>
            </>
          );
        })()}

        {mode === "nodes" && (
          <Box flexGrow={1} borderStyle="single" borderColor={theme.border.normal}>
            <NodesPanel
              nodes={nodes}
              selectedIndex={selectedNodeIndex}
              height={terminalHeight - 6}
            />
          </Box>
        )}

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
