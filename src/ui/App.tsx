import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { theme } from "./theme";
import type { DecodedPacket } from "../protocol/decoder";
import type { PacketStore } from "../protocol/packet-store";
import type { NodeStore, NodeData } from "../protocol/node-store";
import type { Transport, DeviceStatus } from "../transport/types";
import { HttpTransport } from "../transport";
import { Mesh, Portnums, Telemetry } from "@meshtastic/protobufs";
import { PacketList } from "./components/PacketList";
import { PacketInspector, InspectorTab } from "./components/PacketInspector";
import { NodesPanel } from "./components/NodesPanel";
import { ChatPanel } from "./components/ChatPanel";
import { HelpDialog } from "./components/HelpDialog";
import * as db from "../db";
import { toBinary, create } from "@bufbuild/protobuf";
import { formatNodeId } from "../utils/hex";

type AppMode = "packets" | "nodes" | "chat";

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
  const [showHelp, setShowHelp] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(stdout?.rows || 24);
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
    };
    stdout?.on("resize", updateSize);
    return () => {
      stdout?.off("resize", updateSize);
    };
  }, [stdout]);

  const [myNodeNum, setMyNodeNum] = useState(0);
  const [myShortName, setMyShortName] = useState("");
  const [messages, setMessages] = useState<db.DbMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatChannel, setChatChannel] = useState(0);
  const [notification, setNotification] = useState("");

  // Load initial data
  useEffect(() => {
    const initialPackets = packetStore.getAll().slice(-50);
    setPackets(initialPackets);
    if (initialPackets.length > 0) {
      setSelectedPacketIndex(initialPackets.length - 1);
    }

    const initialMessages = db.getMessages(undefined, 100);
    setMessages(initialMessages);

    nodeStore.onUpdate((updatedNodes) => {
      setNodes(updatedNodes);
    });
  }, []);

  // Subscribe to new packets with smart autoscroll
  const selectedPacketIndexRef = useRef(selectedPacketIndex);
  selectedPacketIndexRef.current = selectedPacketIndex;

  useEffect(() => {
    const unsubscribe = packetStore.onPacket((packet) => {
      processPacketForNodes(packet);
      setPackets((prev) => {
        const next = [...prev, packet].slice(-50);
        // Auto-scroll only if viewing the last packet
        const wasAtEnd = selectedPacketIndexRef.current >= prev.length - 1;
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
        };
        db.insertMessage(msg);
        setMessages((prev) => [...prev, msg].slice(-100));
      }
    }
  }, [nodeStore]);

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
      };
      db.insertMessage(msg);
      setMessages((prev) => [...prev, msg].slice(-100));
      setChatInput("");
    } catch {
      showNotification("Failed to send message");
    }
  }, [myNodeNum, chatChannel, transport, showNotification]);

  const sendTraceroute = useCallback(async (destNode: number) => {
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
      payloadVariant: { case: "decoded", value: data },
    });

    const toRadio = create(Mesh.ToRadioSchema, {
      payloadVariant: { case: "packet", value: meshPacket },
    });

    try {
      const binary = toBinary(Mesh.ToRadioSchema, toRadio);
      await transport.send(binary);
      showNotification(`Traceroute sent to ${nodeStore.getNodeName(destNode)}`);
    } catch {
      showNotification("Failed to send traceroute");
    }
  }, [myNodeNum, transport, nodeStore, showNotification]);

  // Key input handling
  useInput((input, key) => {
    // Quit - handle q, Q, and Ctrl+C
    if ((input === "q" || input === "Q") && mode !== "chat") {
      exit();
      return;
    }
    if (key.ctrl && input === "c") {
      exit();
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

    // Mode switching
    if (mode !== "chat") {
      if (input === "1" || input === "p") { setMode("packets"); return; }
      if (input === "2" || input === "n") { setMode("nodes"); return; }
      if (input === "3" || input === "c") { setMode("chat"); return; }
    } else {
      // In chat mode, Escape or Ctrl+C exits to packets
      if (key.escape) { setMode("packets"); return; }
    }

    // Mode-specific keys
    if (mode === "packets") {
      if (input === "j" || key.downArrow) {
        setSelectedPacketIndex((i) => Math.min(i + 1, packets.length - 1));
      }
      if (input === "k" || key.upArrow) {
        setSelectedPacketIndex((i) => Math.max(i - 1, 0));
      }
      // Jump to first/last packet (vim-style g/G)
      if (input === "g") {
        setSelectedPacketIndex(0);
      }
      if (input === "G") {
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
    } else if (mode === "nodes") {
      if (input === "j" || key.downArrow) {
        setSelectedNodeIndex((i) => Math.min(i + 1, nodes.length - 1));
      }
      if (input === "k" || key.upArrow) {
        setSelectedNodeIndex((i) => Math.max(i - 1, 0));
      }
      if (input === "t" && nodes[selectedNodeIndex]) {
        sendTraceroute(nodes[selectedNodeIndex].num);
      }
    } else if (mode === "chat") {
      if (key.return) {
        sendMessage(chatInput);
        return;
      }
      if (key.tab) {
        setChatChannel((c) => (c + 1) % 8);
        return;
      }
      if (key.backspace || key.delete) {
        setChatInput((s) => s.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setChatInput((s) => s + input);
      }
    }
  });

  const selectedPacket = packets[selectedPacketIndex];
  const selectedNode = nodes[selectedNodeIndex];

  const getModeLabel = () => {
    const p = mode === "packets";
    const n = mode === "nodes";
    const c = mode === "chat";
    return (
      <Text>
        <Text color={p ? theme.fg.accent : theme.fg.muted} bold={p}>[PACKETS]</Text>
        {" "}
        <Text color={n ? theme.fg.accent : theme.fg.muted} bold={n}>[NODES]</Text>
        {" "}
        <Text color={c ? theme.fg.accent : theme.fg.muted} bold={c}>[CHAT]</Text>
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
        {mode === "packets" && (
          <>
            <Box flexGrow={1} borderStyle="single" borderColor={theme.border.normal}>
              <PacketList
                packets={packets}
                selectedIndex={selectedPacketIndex}
                nodeStore={nodeStore}
                height={terminalHeight - inspectorHeight - 7}
              />
            </Box>
            <Box height={inspectorHeight} borderStyle="single" borderColor={theme.border.normal}>
              <PacketInspector packet={selectedPacket} activeTab={inspectorTab} height={inspectorHeight - 2} nodeStore={nodeStore} />
            </Box>
          </>
        )}

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
          <Box flexGrow={1} flexDirection="column" borderStyle="single" borderColor={theme.border.normal}>
            <ChatPanel
              messages={messages}
              channel={chatChannel}
              input={chatInput}
              nodeStore={nodeStore}
              myNodeNum={myNodeNum}
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
    </Box>
  );
}
