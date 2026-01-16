import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { DbMessage, DMConversation } from "../../db";
import type { NodeStore } from "../../protocol/node-store";
import { formatNodeId, getHardwareModelName } from "../../utils";
import { fitVisual } from "../../utils/string-width";

const MESSAGE_TIMEOUT_MS = 30000;

const AnimatedDots = React.memo(() => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % 3);
    }, 200);
    return () => clearInterval(interval);
  }, []);

  return (
    <Text>
      {" "}
      <Text color={theme.fg.muted}>[</Text>
      <Text color={frame === 0 ? theme.fg.primary : theme.fg.muted}>.</Text>
      <Text color={frame === 1 ? theme.fg.primary : theme.fg.muted}>.</Text>
      <Text color={frame === 2 ? theme.fg.primary : theme.fg.muted}>.</Text>
      <Text color={theme.fg.muted}>]</Text>
    </Text>
  );
});

interface DMPanelProps {
  conversations: DMConversation[];
  messages: DbMessage[];
  selectedConvoIndex: number;
  selectedMessageIndex: number;
  inputFocused: boolean;
  input: string;
  nodeStore: NodeStore;
  myNodeNum: number;
  height: number;
  width: number;
  deleteConfirm?: boolean;
  meshViewConfirmedIds?: Set<number>;
  replyTo?: DbMessage | null;
}

// Left panel width: star(1) + space(1) + name(6) + space(1) + id(9) = 18
const LEFT_PANEL_WIDTH = 20;

function DMPanelComponent({
  conversations,
  messages,
  selectedConvoIndex,
  selectedMessageIndex,
  inputFocused,
  input,
  nodeStore,
  myNodeNum,
  height,
  width,
  deleteConfirm,
  meshViewConfirmedIds,
  replyTo,
}: DMPanelProps) {
  const selectedConvo = conversations[selectedConvoIndex];
  const listFocused = selectedMessageIndex < 0 && !inputFocused && !deleteConfirm;

  // Calculate scroll offset for conversation list
  const listHeight = height - 2; // Account for header
  let convoScrollOffset = 0;
  if (conversations.length > listHeight) {
    const halfView = Math.floor(listHeight / 2);
    convoScrollOffset = Math.max(0, Math.min(
      selectedConvoIndex - halfView,
      conversations.length - listHeight
    ));
  }
  const visibleConvos = conversations.slice(convoScrollOffset, convoScrollOffset + listHeight);

  // Right panel dimensions
  const rightPanelWidth = width - LEFT_PANEL_WIDTH - 3; // 3 for borders/padding
  const replyRowHeight = replyTo ? 1 : 0;
  const chatHeight = height - 7 - replyRowHeight; // 3-line header + separator + input area + optional reply

  // Calculate scroll offset for messages
  const visibleMsgCount = chatHeight;
  let msgScrollOffset = 0;
  if (messages.length > visibleMsgCount) {
    if (selectedMessageIndex < 0) {
      msgScrollOffset = Math.max(0, messages.length - visibleMsgCount);
    } else {
      const halfView = Math.floor(visibleMsgCount / 2);
      msgScrollOffset = Math.max(0, Math.min(
        selectedMessageIndex - halfView,
        messages.length - visibleMsgCount
      ));
    }
  }
  const visibleMessages = messages.slice(msgScrollOffset, msgScrollOffset + visibleMsgCount);

  return (
    <Box flexDirection="row" width="100%" height={height}>
      {/* Left panel - Conversation list */}
      <Box
        flexDirection="column"
        width={LEFT_PANEL_WIDTH}
        borderStyle="single"
        borderColor={listFocused ? theme.border.focused : theme.border.normal}
        borderRight
        borderTop={false}
        borderBottom={false}
        borderLeft={false}
      >
        {/* List header */}
        <Box paddingX={1}>
          <Text color={theme.fg.accent} bold>DMs</Text>
          <Text color={theme.fg.muted}> ({conversations.length})</Text>
        </Box>

        {/* Conversation list */}
        {conversations.length === 0 ? (
          <Box paddingX={1}>
            <Text color={theme.fg.muted}>-</Text>
          </Box>
        ) : (
          visibleConvos.map((convo, i) => {
            const actualIndex = convoScrollOffset + i;
            const isSelected = actualIndex === selectedConvoIndex;
            const isActive = actualIndex === selectedConvoIndex && listFocused;
            const node = nodeStore.getNode(convo.nodeNum);
            const shortName = node?.shortName || "???";
            const isFavorite = node?.isFavorite || false;
            const shortId = formatNodeId(convo.nodeNum).slice(0, 8); // !abcd1234

            return (
              <Box
                key={convo.nodeNum}
                backgroundColor={isActive ? theme.bg.selected : undefined}
                paddingX={1}
              >
                <Text color="#ffcc00">{isFavorite ? "★" : " "}</Text>
                <Text color={isSelected ? theme.fg.accent : theme.fg.primary}>{fitVisual(shortName, 5)} </Text>
                <Text color={theme.fg.muted}>{shortId}</Text>
                {convo.unreadCount > 0 && <Text color={theme.status.online}> •</Text>}
              </Box>
            );
          })
        )}
      </Box>

      {/* Right panel - Chat */}
      <Box flexDirection="column" flexGrow={1}>
        {/* Chat header - 2 lines of node info */}
        <NodeInfoHeader
          nodeNum={selectedConvo?.nodeNum}
          nodeStore={nodeStore}
          deleteConfirm={deleteConfirm}
        />

        {/* Messages */}
        <Box height={chatHeight} flexDirection="column" paddingX={1}>
          {!selectedConvo ? (
            null
          ) : messages.length === 0 ? (
            <Text color={theme.fg.muted}>No messages yet. Start the conversation!</Text>
          ) : (
            visibleMessages.filter(msg => msg != null).map((msg, i) => {
              const actualIndex = msgScrollOffset + i;
              return (
                <MessageRow
                  key={msg.id ?? `${msg.packetId}-${i}`}
                  message={msg}
                  nodeStore={nodeStore}
                  isOwn={msg.fromNode === myNodeNum}
                  isSelected={actualIndex === selectedMessageIndex && !inputFocused}
                  textWidth={rightPanelWidth - 25}
                  meshViewConfirmedIds={meshViewConfirmedIds}
                  allMessages={messages}
                />
              );
            })
          )}
        </Box>

        {/* Reply indicator */}
        {replyTo && (
          <Box paddingX={1}>
            <Text color={theme.fg.muted}>replying to </Text>
            <Text color={theme.fg.accent}>{nodeStore.getNodeName(replyTo.fromNode)}</Text>
            <Text color={theme.fg.muted}>: "{(replyTo.text || "").length > 30 ? (replyTo.text || "").slice(0, 30) + "..." : (replyTo.text || "")}"</Text>
          </Box>
        )}

        {/* Input */}
        <Box
          paddingX={1}
          borderStyle="single"
          borderColor={inputFocused ? theme.border.focused : theme.border.normal}
          borderTop
          borderBottom={false}
          borderLeft={false}
          borderRight={false}
        >
          <Text color={inputFocused ? theme.fg.accent : theme.fg.muted}>{">"} </Text>
          <Text color={theme.fg.primary}>{input}</Text>
          {inputFocused ? (
            <Text color={theme.fg.accent}>█</Text>
          ) : selectedConvo ? (
            <Text color={theme.fg.muted}> (Enter to type, # to delete convo)</Text>
          ) : (
            <Text color={theme.fg.muted}> (Select a conversation)</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export const DMPanel = React.memo(DMPanelComponent, (prevProps, nextProps) => {
  // Only re-render if relevant props changed
  return (
    prevProps.conversations.length === nextProps.conversations.length &&
    prevProps.messages.length === nextProps.messages.length &&
    prevProps.selectedConvoIndex === nextProps.selectedConvoIndex &&
    prevProps.selectedMessageIndex === nextProps.selectedMessageIndex &&
    prevProps.inputFocused === nextProps.inputFocused &&
    prevProps.input === nextProps.input &&
    prevProps.height === nextProps.height &&
    prevProps.width === nextProps.width &&
    prevProps.deleteConfirm === nextProps.deleteConfirm &&
    prevProps.replyTo === nextProps.replyTo &&
    prevProps.meshViewConfirmedIds === nextProps.meshViewConfirmedIds
  );
});

interface MessageRowProps {
  message: DbMessage;
  nodeStore: NodeStore;
  isOwn: boolean;
  isSelected: boolean;
  textWidth: number;
  meshViewConfirmedIds?: Set<number>;
  allMessages: DbMessage[];
}

const MessageRow = React.memo(function MessageRow({ message, nodeStore, isOwn, isSelected, textWidth, meshViewConfirmedIds, allMessages }: MessageRowProps) {
  const fromName = nodeStore.getNodeName(message.fromNode);
  const time = new Date(message.timestamp * 1000).toLocaleTimeString(undefined, { hour12: false });
  const nameColor = isOwn ? theme.fg.accent : theme.packet.position;
  const [now, setNow] = useState(Date.now());
  const isConfirmedByMeshView = message.packetId && meshViewConfirmedIds?.has(message.packetId);

  useEffect(() => {
    if (message.status !== "pending" || !isOwn) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [message.status, isOwn]);

  // Format error reason to human-readable short form
  const formatErrorReason = (reason?: string): string => {
    if (!reason) return "failed";
    const lowerReason = reason.toLowerCase().replace(/_/g, " ");

    // Direct enum name matches
    if (lowerReason === "max retransmit") return "max retries";
    if (lowerReason === "no route") return "no route";
    if (lowerReason === "got nak") return "rejected";
    if (lowerReason === "timeout") return "timeout";
    if (lowerReason === "no interface") return "no interface";
    if (lowerReason === "too large") return "too large";
    if (lowerReason === "no channel") return "no channel";
    if (lowerReason === "no response") return "no response";
    if (lowerReason === "duty cycle limit") return "duty limit";
    if (lowerReason === "bad request") return "bad request";
    if (lowerReason === "not authorized") return "no auth";
    if (lowerReason === "pki failed") return "pki failed";
    if (lowerReason === "pki unknown pubkey") return "unknown key";
    if (lowerReason === "admin bad session key") return "bad session";
    if (lowerReason === "admin public key unauthorized") return "admin no auth";
    if (lowerReason === "rate limit exceeded") return "rate limited";

    // Fallback to substring matches for legacy reasons
    if (lowerReason.includes("rate limit")) return "rate limited";

    return lowerReason.slice(0, 12);
  };

  const getStatusIndicator = () => {
    if (!isOwn) return null;
    switch (message.status) {
      case "pending": {
        const elapsed = now - message.timestamp * 1000;
        if (elapsed > MESSAGE_TIMEOUT_MS) {
          return (
            <Text>
              {" "}<Text color={theme.fg.muted}>[</Text>
              <Text color={theme.status.offline}>✗ timeout</Text>
              <Text color={theme.fg.muted}>]</Text>
            </Text>
          );
        }
        return <AnimatedDots />;
      }
      case "acked":
        return (
          <Text>
            {" "}<Text color={theme.fg.muted}>[</Text>
            <Text color={theme.status.online}>✓</Text>
            <Text color={theme.fg.muted}>]</Text>
          </Text>
        );
      case "error":
        return (
          <Text>
            {" "}<Text color={theme.fg.muted}>[</Text>
            <Text color={theme.status.offline}>✗ {formatErrorReason(message.errorReason)}</Text>
            <Text color={theme.fg.muted}>]</Text>
          </Text>
        );
      default:
        return null;
    }
  };

  const getMeshViewIndicator = () => {
    if (!isConfirmedByMeshView) return null;
    return <Text color={theme.fg.muted}> [M]</Text>;
  };

  const maxLen = Math.max(10, textWidth);
  // Remove carriage returns and other control characters that break terminal display
  const cleanText = (message.text || "").replace(/[\r\x00-\x1f]/g, "");
  const displayText = cleanText.length > maxLen
    ? cleanText.slice(0, maxLen - 3) + "..."
    : cleanText;

  // Find the message being replied to
  const repliedMessage = message.replyId
    ? allMessages.find(m => m.packetId === message.replyId)
    : null;
  const replyPreview = repliedMessage
    ? (repliedMessage.text || "").slice(0, 20) + ((repliedMessage.text || "").length > 20 ? "..." : "")
    : null;

  return (
    <Box flexDirection="column" backgroundColor={isSelected ? theme.bg.selected : undefined}>
      {repliedMessage && (
        <Text color={theme.fg.muted}>
          {"            "}┌ replying to{" "}
          <Text color={theme.fg.secondary}>{nodeStore.getNodeName(repliedMessage.fromNode)}</Text>
          : "{replyPreview}"
        </Text>
      )}
      <Text wrap="truncate">
        <Text color={theme.fg.muted}>[{time}] </Text>
        <Text color={nameColor}>{fitVisual(fromName, 8)} </Text>
        <Text color={theme.fg.primary}>{displayText}</Text>
        {getStatusIndicator()}
        {getMeshViewIndicator()}
      </Text>
    </Box>
  );
}, (prevProps, nextProps) => {
  // Only re-render if relevant props changed
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.status === nextProps.message.status &&
    prevProps.message.text === nextProps.message.text &&
    prevProps.message.timestamp === nextProps.message.timestamp &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.textWidth === nextProps.textWidth &&
    prevProps.isOwn === nextProps.isOwn &&
    prevProps.meshViewConfirmedIds === nextProps.meshViewConfirmedIds
  );
});

// Role name mappings
const ROLE_NAMES: Record<number, string> = {
  0: "CLIENT", 1: "MUTE", 2: "ROUTER", 3: "RTR_CLI", 4: "REPEAT",
  5: "TRACKER", 6: "SENSOR", 7: "TAK", 8: "HIDDEN", 9: "L&F", 10: "TAK_TRK",
  11: "RTR_LATE", 12: "CLI_BASE",
};

function formatRole(role?: number | null): string {
  if (role == null) return "-";
  return ROLE_NAMES[role] || `R${role}`;
}

function getRoleColor(role?: number | null): string {
  if (role == null) return theme.fg.muted;
  if (role === 2 || role === 4 || role === 11) return theme.packet.nodeinfo; // Router/Repeater/RouterLate = purple
  if (role === 5) return theme.packet.position; // Tracker = cyan
  if (role === 6 || role === 7 || role === 10) return theme.packet.telemetry; // Sensor/TAK = orange
  if (role === 1 || role === 8) return theme.packet.routing; // Mute/Hidden = gray
  return theme.packet.message; // Client/ClientBase = green
}

function formatLastHeard(timestamp?: number): string {
  if (!timestamp) return "never";
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function formatPublicKey(pk?: Uint8Array): string {
  if (!pk || pk.length === 0) return "None";
  return uint8ArrayToBase64(pk);
}

interface NodeInfoHeaderProps {
  nodeNum?: number;
  nodeStore: NodeStore;
  deleteConfirm?: boolean;
}

function NodeInfoHeader({ nodeNum, nodeStore, deleteConfirm }: NodeInfoHeaderProps) {
  if (!nodeNum) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color={theme.fg.muted}>Select a conversation (j/k, Enter)</Text>
        <Text color={theme.fg.secondary}>Press 'd' on a node to start a DM</Text>
      </Box>
    );
  }

  const node = nodeStore.getNode(nodeNum);
  const nodeName = nodeStore.getNodeName(nodeNum);

  if (deleteConfirm) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color={theme.status.offline} bold>Delete conversation with {nodeName}?</Text>
        <Text color={theme.fg.muted}>(y/n)</Text>
      </Box>
    );
  }

  const shortName = node?.shortName || "???";
  const longName = node?.longName || "";
  const nodeId = formatNodeId(nodeNum);
  const role = formatRole(node?.role);
  const lastHeard = formatLastHeard(node?.lastHeard);
  const hops = node?.hopsAway !== undefined ? `${node.hopsAway}` : "-";
  const hwModel = node?.hwModel !== undefined
    ? getHardwareModelName(node.hwModel).replace(/_/g, " ")
    : "-";

  return (
    <Box flexDirection="column">
      <Box paddingX={1}>
        {/* Line 1: Short name, ID, long name */}
        <Text color={theme.fg.accent} bold>{shortName}</Text>
        <Text color={theme.fg.muted}> {nodeId}</Text>
        {longName && <Text color={theme.fg.primary}> {longName}</Text>}
      </Box>
      <Box paddingX={1}>
        {/* Line 2: Role, last heard, hops, hardware */}
        <Text color={theme.fg.muted}>Role:</Text>
        <Text color={getRoleColor(node?.role)}>{role}</Text>
        <Text color={theme.fg.muted}>  Heard:</Text>
        <Text color={theme.fg.secondary}>{lastHeard}</Text>
        <Text color={theme.fg.muted}>  Hops:</Text>
        <Text color={theme.fg.secondary}>{hops}</Text>
        <Text color={theme.fg.muted}>  HW:</Text>
        <Text color={theme.data.hardware}>{hwModel}</Text>
      </Box>
      <Box paddingX={1}>
        {/* Line 3: Public key */}
        <Text color={theme.fg.muted}>PubKey: </Text>
        <Text color={theme.fg.secondary}>{formatPublicKey(node?.publicKey)}</Text>
      </Box>
      {/* Separator */}
      <Box borderStyle="single" borderColor={theme.border.normal} borderTop borderBottom={false} borderLeft={false} borderRight={false} />
    </Box>
  );
}
