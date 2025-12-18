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
  // Split pane: conversation list (top), messages (bottom)
  const inputHeight = 3;
  const headerHeight = 1;
  const listHeight = Math.max(3, Math.floor((height - inputHeight - headerHeight) * 0.35));
  const messageAreaHeight = Math.max(3, height - listHeight - inputHeight - headerHeight - 1);

  const selectedConvo = conversations[selectedConvoIndex];

  // Calculate scroll offset for conversation list
  const visibleConvoCount = Math.max(1, listHeight - 1);
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
  let msgScrollOffset = 0;
  if (messages.length > messageAreaHeight) {
    if (selectedMessageIndex < 0) {
      msgScrollOffset = messages.length - messageAreaHeight;
    } else {
      const halfView = Math.floor(messageAreaHeight / 2);
      msgScrollOffset = Math.max(0, Math.min(
        selectedMessageIndex - halfView,
        messages.length - messageAreaHeight
      ));
    }
  }
  const visibleMessages = messages.slice(msgScrollOffset, msgScrollOffset + messageAreaHeight);

  return (
    <Box flexDirection="column" width="100%" height={height}>
      {/* Header */}
      <Box paddingX={1}>
        <Text color={theme.fg.accent} bold>DIRECT MESSAGES</Text>
        <Text color={theme.fg.muted}> ({conversations.length} conversation{conversations.length !== 1 ? "s" : ""})</Text>
      </Box>

      {/* Conversation list */}
      <Box height={listHeight} flexDirection="column" borderStyle="single" borderColor={!inputFocused && selectedMessageIndex < 0 ? theme.border.focused : theme.border.normal}>
        {conversations.length === 0 ? (
          <Box paddingX={1}>
            <Text color={theme.fg.muted}>No DM conversations yet. Press 'd' on a node to start one.</Text>
          </Box>
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

      {/* Message view */}
      <Box flexGrow={1} flexDirection="column" borderStyle="single" borderColor={selectedMessageIndex >= 0 && !inputFocused ? theme.border.focused : theme.border.normal} overflowY="hidden">
        {selectedConvo ? (
          <>
            <Box paddingX={1} borderBottom borderColor={theme.border.normal}>
              <Text color={theme.fg.muted}>DM with </Text>
              <Text color={theme.fg.accent}>{nodeStore.getNodeName(selectedConvo.nodeNum)}</Text>
              <Text color={theme.fg.muted}> ({formatNodeId(selectedConvo.nodeNum)})</Text>
            </Box>
            <Box flexDirection="column" flexGrow={1} flexShrink={1} paddingX={1} overflowY="hidden">
              {messages.length === 0 ? (
                <Text color={theme.fg.muted}>No messages yet. Start the conversation!</Text>
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
                      width={width}
                    />
                  );
                })
              )}
            </Box>
          </>
        ) : (
          <Box paddingX={1} paddingY={1}>
            <Text color={theme.fg.muted}>Select a conversation or press 'd' on a node to start a DM</Text>
          </Box>
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
  const preview = conversation.lastMessage.length > 30
    ? conversation.lastMessage.slice(0, 30) + "..."
    : conversation.lastMessage;
  const time = formatRelativeTime(conversation.lastTimestamp);

  return (
    <Box backgroundColor={isSelected ? theme.bg.selected : undefined} paddingX={1}>
      <Text wrap="truncate">
        <Text color={isActive ? theme.fg.accent : theme.fg.primary}>{name.padEnd(12)}</Text>
        <Text color={theme.fg.muted}>{nodeId.padEnd(12)}</Text>
        {conversation.unreadCount > 0 && (
          <Text color={theme.status.online} bold>{`${conversation.unreadCount} new `.padEnd(8)}</Text>
        )}
        {conversation.unreadCount === 0 && (
          <Text color={theme.fg.muted}>{"        "}</Text>
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
  width: number;
}

function MessageRow({ message, nodeStore, isOwn, isSelected, width }: MessageRowProps) {
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

  const textWidth = Math.max(20, width - PREFIX_WIDTH - 4 - 6);

  const wrapText = (text: string, maxWidth: number): string[] => {
    const result: string[] = [];
    for (const line of text.split("\n")) {
      if (line.length <= maxWidth) {
        result.push(line);
      } else {
        let remaining = line;
        while (remaining.length > maxWidth) {
          let breakPoint = remaining.lastIndexOf(" ", maxWidth);
          if (breakPoint <= 0) breakPoint = maxWidth;
          result.push(remaining.slice(0, breakPoint));
          remaining = remaining.slice(breakPoint).trimStart();
        }
        if (remaining) result.push(remaining);
      }
    }
    return result;
  };

  const lines = wrapText(message.text, textWidth);
  const continuationPadding = " ".repeat(PREFIX_WIDTH);

  return (
    <Box flexDirection="column" backgroundColor={isSelected ? theme.bg.selected : undefined}>
      {lines.map((line, lineIndex) => (
        <Box key={lineIndex}>
          {lineIndex === 0 ? (
            <Text>
              <Text color={theme.fg.muted}>[{time}] </Text>
              <Text color={nameColor}>{fromName.padEnd(10)}</Text>
              <Text> </Text>
            </Text>
          ) : (
            <Text>{continuationPadding}</Text>
          )}
          <Text color={theme.fg.primary}>{line}</Text>
          {lineIndex === lines.length - 1 && getStatusIndicator()}
        </Box>
      ))}
    </Box>
  );
}
