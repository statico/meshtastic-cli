import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { DbMessage, DMConversation } from "../../db";
import type { NodeStore } from "../../protocol/node-store";
import { formatNodeId } from "../../utils/hex";

const MESSAGE_TIMEOUT_MS = 30000;

function AnimatedDots() {
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
}

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
}

// Prefix width: [HH:MM:SS] (10) + space (1) + name (10) + space (1) = 22 chars
const PREFIX_WIDTH = 22;

export function DMPanel({
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
}: DMPanelProps) {
  const selectedConvo = conversations[selectedConvoIndex];

  // Fixed conversation list height (3-5 rows depending on count)
  const convoListHeight = Math.min(5, Math.max(3, conversations.length));

  // Message area height: total - header(1) - convo list - separator(1) - msg header(1) - input(3)
  const messageAreaHeight = Math.max(3, height - 1 - convoListHeight - 1 - 1 - 3);

  // Calculate scroll offset for conversation list
  const visibleConvoCount = convoListHeight;
  let convoScrollOffset = 0;
  if (conversations.length > visibleConvoCount) {
    const halfView = Math.floor(visibleConvoCount / 2);
    convoScrollOffset = Math.max(0, Math.min(
      selectedConvoIndex - halfView,
      conversations.length - visibleConvoCount
    ));
  }
  const visibleConvos = conversations.slice(convoScrollOffset, convoScrollOffset + visibleConvoCount);

  // Calculate scroll offset for messages
  const visibleMsgCount = messageAreaHeight;
  let msgScrollOffset = 0;
  if (messages.length > visibleMsgCount) {
    if (selectedMessageIndex < 0) {
      msgScrollOffset = messages.length - visibleMsgCount;
    } else {
      const halfView = Math.floor(visibleMsgCount / 2);
      msgScrollOffset = Math.max(0, Math.min(
        selectedMessageIndex - halfView,
        messages.length - visibleMsgCount
      ));
    }
  }
  const visibleMessages = messages.slice(msgScrollOffset, msgScrollOffset + visibleMsgCount);

  // Available width for message text
  const textWidth = Math.max(20, width - 4 - PREFIX_WIDTH - 6);

  return (
    <Box flexDirection="column" width="100%" height={height}>
      {/* Header */}
      <Box paddingX={1} flexShrink={0}>
        <Text color={theme.fg.accent} bold>DIRECT MESSAGES</Text>
        <Text color={theme.fg.muted}> ({conversations.length} conversation{conversations.length !== 1 ? "s" : ""})</Text>
      </Box>

      {/* Conversation list */}
      <Box height={convoListHeight} flexDirection="column" paddingX={1} flexShrink={0}>
        {conversations.length === 0 ? (
          <Text color={theme.fg.muted}>No DM conversations yet. Press 'd' on a node to start one.</Text>
        ) : (
          visibleConvos.map((convo, i) => {
            const actualIndex = convoScrollOffset + i;
            const isSelected = actualIndex === selectedConvoIndex && selectedMessageIndex < 0 && !inputFocused;
            return (
              <ConversationRow
                key={convo.nodeNum}
                conversation={convo}
                nodeStore={nodeStore}
                isSelected={isSelected}
                isActive={actualIndex === selectedConvoIndex}
              />
            );
          })
        )}
      </Box>

      {/* Separator */}
      <Box flexShrink={0} borderStyle="single" borderColor={theme.border.normal} borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} />

      {/* Message header */}
      <Box paddingX={1} flexShrink={0}>
        {selectedConvo ? (
          <>
            <Text color={theme.fg.muted}>DM with </Text>
            <Text color={theme.fg.accent}>{nodeStore.getNodeName(selectedConvo.nodeNum)}</Text>
            <Text color={theme.fg.muted}> ({formatNodeId(selectedConvo.nodeNum)})</Text>
          </>
        ) : (
          <Text color={theme.fg.muted}>Select a conversation</Text>
        )}
      </Box>

      {/* Messages */}
      <Box height={messageAreaHeight} flexDirection="column" paddingX={1}>
        {messages.length === 0 ? (
          <Text color={theme.fg.muted}>{selectedConvo ? "No messages yet. Start the conversation!" : "Press 'd' on a node to start a DM"}</Text>
        ) : (
          visibleMessages.map((msg, i) => {
            const actualIndex = msgScrollOffset + i;
            return (
              <MessageRow
                key={msg.id ?? `${msg.packetId}-${i}`}
                message={msg}
                nodeStore={nodeStore}
                isOwn={msg.fromNode === myNodeNum}
                isSelected={actualIndex === selectedMessageIndex && !inputFocused}
                textWidth={textWidth}
              />
            );
          })
        )}
      </Box>

      {/* Input */}
      <Box paddingX={1} borderStyle="single" borderColor={inputFocused ? theme.border.focused : theme.border.normal} flexShrink={0}>
        <Text color={inputFocused ? theme.fg.accent : theme.fg.muted}>{">"} </Text>
        <Text color={theme.fg.primary}>{input}</Text>
        {inputFocused ? (
          <Text color={theme.fg.accent}>█</Text>
        ) : selectedConvo ? (
          <Text color={theme.fg.muted}> (Enter to type)</Text>
        ) : (
          <Text color={theme.fg.muted}> (Select a conversation first)</Text>
        )}
      </Box>
    </Box>
  );
}

interface ConversationRowProps {
  conversation: DMConversation;
  nodeStore: NodeStore;
  isSelected: boolean;
  isActive: boolean;
}

function ConversationRow({ conversation, nodeStore, isSelected, isActive }: ConversationRowProps) {
  const name = nodeStore.getNodeName(conversation.nodeNum);
  const nodeId = formatNodeId(conversation.nodeNum);
  const preview = conversation.lastMessage.length > 25
    ? conversation.lastMessage.slice(0, 25) + "..."
    : conversation.lastMessage;
  const time = formatRelativeTime(conversation.lastTimestamp);

  return (
    <Box backgroundColor={isSelected ? theme.bg.selected : undefined}>
      <Text wrap="truncate">
        <Text color={isActive ? theme.fg.accent : theme.fg.primary}>{name.padEnd(10)}</Text>
        <Text color={theme.fg.muted}>{nodeId.padEnd(12)}</Text>
        {conversation.unreadCount > 0 && (
          <Text color={theme.status.online} bold>{`${conversation.unreadCount} new `.padEnd(7)}</Text>
        )}
        {conversation.unreadCount === 0 && (
          <Text color={theme.fg.muted}>{"       "}</Text>
        )}
        <Text color={theme.fg.secondary}>"{preview}"</Text>
        <Text color={theme.fg.muted}> {time}</Text>
      </Text>
    </Box>
  );
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

interface MessageRowProps {
  message: DbMessage;
  nodeStore: NodeStore;
  isOwn: boolean;
  isSelected: boolean;
  textWidth: number;
}

function MessageRow({ message, nodeStore, isOwn, isSelected, textWidth }: MessageRowProps) {
  const fromName = nodeStore.getNodeName(message.fromNode);
  const time = new Date(message.timestamp * 1000).toLocaleTimeString("en-US", { hour12: false });
  const nameColor = isOwn ? theme.fg.accent : theme.packet.position;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (message.status !== "pending" || !isOwn) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [message.status, isOwn]);

  const getStatusIndicator = () => {
    if (!isOwn) return null;
    switch (message.status) {
      case "pending": {
        const elapsed = now - message.timestamp * 1000;
        if (elapsed > MESSAGE_TIMEOUT_MS) {
          return (
            <Text>
              {" "}<Text color={theme.fg.muted}>[</Text>
              <Text color={theme.status.offline}>✗</Text>
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
            <Text color={theme.status.offline}>✗</Text>
            <Text color={theme.fg.muted}>]</Text>
          </Text>
        );
      default:
        return null;
    }
  };

  // Simple single-line display with truncation
  const maxLen = textWidth;
  const displayText = message.text.length > maxLen
    ? message.text.slice(0, maxLen - 3) + "..."
    : message.text;

  return (
    <Box backgroundColor={isSelected ? theme.bg.selected : undefined}>
      <Text wrap="truncate">
        <Text color={theme.fg.muted}>[{time}] </Text>
        <Text color={nameColor}>{fromName.padEnd(10)}</Text>
        <Text> </Text>
        <Text color={theme.fg.primary}>{displayText}</Text>
        {getStatusIndicator()}
      </Text>
    </Box>
  );
}
