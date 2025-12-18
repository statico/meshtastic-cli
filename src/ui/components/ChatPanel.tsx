import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { Channel } from "@meshtastic/protobufs";
import { theme } from "../theme";
import type { DbMessage } from "../../db";
import type { NodeStore } from "../../protocol/node-store";
import type { ChannelInfo } from "../App";

const MESSAGE_TIMEOUT_MS = 30000;

// Emojis with XBM graphics support in Meshtastic firmware
export const FIRMWARE_EMOJIS = [
  { emoji: "👋", name: "wave" },
  { emoji: "👍", name: "thumbs up" },
  { emoji: "👎", name: "thumbs down" },
  { emoji: "❓", name: "question" },
  { emoji: "‼️", name: "exclamation" },
  { emoji: "💩", name: "poop" },
  { emoji: "🤣", name: "laugh" },
  { emoji: "🤠", name: "cowboy" },
  { emoji: "🐭", name: "mouse" },
  { emoji: "☀️", name: "sun" },
  { emoji: "☔", name: "rain" },
  { emoji: "☁️", name: "cloud" },
  { emoji: "🌫️", name: "fog" },
  { emoji: "😈", name: "devil" },
  { emoji: "♥️", name: "heart" },
];

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

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

interface ChatPanelProps {
  messages: DbMessage[];
  channel: number;
  channels: Map<number, ChannelInfo>;
  input: string;
  inputFocused: boolean;
  nodeStore: NodeStore;
  myNodeNum: number;
  height: number;
  width: number;
  selectedMessageIndex: number;
  showEmojiSelector: boolean;
  emojiSelectorIndex: number;
}

// Prefix width: [HH:MM:SS] (10) + space (1) + name (10) + space (1) = 22 chars
const PREFIX_WIDTH = 22;

export function ChatPanel({
  messages,
  channel,
  channels,
  input,
  inputFocused,
  nodeStore,
  myNodeNum,
  height,
  width,
  selectedMessageIndex,
  showEmojiSelector,
  emojiSelectorIndex,
}: ChatPanelProps) {
  const channelMessages = messages.filter((m) => m.channel === channel);
  const channelInfo = channels.get(channel);

  // Fixed header height (4 lines for channel selector box) + input box (3 lines)
  const headerHeight = 4;
  const inputHeight = 3;
  const emojiHeight = showEmojiSelector ? 3 : 0;
  const messageAreaHeight = Math.max(1, height - headerHeight - inputHeight - emojiHeight);

  // Calculate scroll offset to keep selected message visible
  let scrollOffset = 0;
  if (channelMessages.length > messageAreaHeight) {
    if (selectedMessageIndex < 0) {
      // No selection - show most recent messages
      scrollOffset = channelMessages.length - messageAreaHeight;
    } else {
      // Center the selected message in the view
      const halfView = Math.floor(messageAreaHeight / 2);
      scrollOffset = Math.max(0, Math.min(
        selectedMessageIndex - halfView,
        channelMessages.length - messageAreaHeight
      ));
    }
  }

  const visibleMessages = channelMessages.slice(scrollOffset, scrollOffset + messageAreaHeight);

  const getRoleName = (role: number) => {
    return Channel.Channel_Role[role] || `ROLE_${role}`;
  };

  const getPskDisplay = (psk: Uint8Array | null) => {
    if (!psk || psk.length === 0) return "none";
    const b64 = uint8ArrayToBase64(psk);
    if (b64.length > 16) {
      return b64.slice(0, 16) + "...";
    }
    return b64;
  };

  return (
    <Box flexDirection="column" width="100%" height={height}>
      {/* Channel selector */}
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border.normal} paddingX={1} flexShrink={0}>
        <Box>
          <Text color={theme.fg.muted}>Channel: </Text>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((ch) => {
            const info = channels.get(ch);
            const hasKey = info && info.psk;
            const color = ch === channel ? theme.fg.accent : hasKey ? theme.fg.primary : theme.fg.muted;
            return (
              <Text key={ch} color={color} bold={ch === channel}>
                {ch === channel ? `[${ch}]` : ` ${ch} `}
              </Text>
            );
          })}
          <Text color={theme.fg.muted}> (Tab/S-Tab)</Text>
        </Box>
        <Box>
          {channelInfo ? (
            <>
              <Text color={theme.fg.muted}>Name: </Text>
              <Text color={theme.fg.accent}>{channelInfo.name || "(default)"}</Text>
              <Text color={theme.fg.muted}>  Role: </Text>
              <Text color={theme.fg.secondary}>{getRoleName(channelInfo.role)}</Text>
              <Text color={theme.fg.muted}>  Key: </Text>
              <Text color={theme.fg.muted}>{getPskDisplay(channelInfo.psk)}</Text>
            </>
          ) : (
            <Text color={theme.fg.muted}>No channel info (connect to device)</Text>
          )}
        </Box>
      </Box>

      {/* Messages */}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} paddingX={1} overflowY="hidden">
        {channelMessages.length === 0 ? (
          <Text color={theme.fg.muted}>No messages on channel {channel}</Text>
        ) : (
          visibleMessages.map((msg, i) => {
            const actualIndex = scrollOffset + i;
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

      {/* Emoji selector */}
      {showEmojiSelector && (
        <Box borderStyle="single" borderColor={theme.border.focused} paddingX={1} flexShrink={0}>
          <Text color={theme.fg.muted}>Emoji: </Text>
          {FIRMWARE_EMOJIS.map((e, i) => (
            <Text key={i} backgroundColor={i === emojiSelectorIndex ? theme.bg.selected : undefined}>
              {e.emoji}{" "}
            </Text>
          ))}
          <Text color={theme.fg.muted}> (←→ select, Enter insert, Esc cancel)</Text>
        </Box>
      )}

      {/* Input */}
      <Box paddingX={1} borderStyle="single" borderColor={inputFocused ? theme.border.focused : theme.border.normal} flexShrink={0}>
        <Text color={inputFocused ? theme.fg.accent : theme.fg.muted}>{">"} </Text>
        <Text color={theme.fg.primary}>{input}</Text>
        {inputFocused ? (
          <Text color={theme.fg.accent}>█</Text>
        ) : (
          <Text color={theme.fg.muted}> (Enter to type)</Text>
        )}
      </Box>
    </Box>
  );
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

  // Calculate available width for message text (width - prefix - padding - status indicator space)
  const textWidth = Math.max(20, width - PREFIX_WIDTH - 4 - 6);

  // Wrap text to fit within available width
  const wrapText = (text: string, maxWidth: number): string[] => {
    const result: string[] = [];
    for (const line of text.split("\n")) {
      if (line.length <= maxWidth) {
        result.push(line);
      } else {
        let remaining = line;
        while (remaining.length > maxWidth) {
          // Try to break at space
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
