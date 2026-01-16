import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { Channel, Config } from "@meshtastic/protobufs";
import { theme } from "../theme";
import type { DbMessage } from "../../db";
import type { NodeStore } from "../../protocol/node-store";
import type { ChannelInfo } from "../App";
import { fitVisual } from "../../utils/string-width";

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
  { emoji: "☕", name: "coffee" },
  { emoji: "💤", name: "zzz" },
];

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
  loraConfig?: Config.Config_LoRaConfig;
  filter?: string;
  filterInputActive?: boolean;
  meshViewConfirmedIds?: Set<number>;
  replyTo?: DbMessage | null;
}

// Prefix width: [HH:MM:SS] (10) + space (1) + name (10) + space (1) = 22 chars
const PREFIX_WIDTH = 22;

function ChatPanelComponent({
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
  loraConfig,
  filter,
  filterInputActive,
  meshViewConfirmedIds,
  replyTo,
}: ChatPanelProps) {
  const hasFilter = filter && filter.length > 0;
  const filterRowHeight = (hasFilter || filterInputActive) ? 1 : 0;

  // Filter messages by text content or sender name
  // Filter for channel messages (broadcast, not DMs)
  const channelMessages = messages.filter((m) => m.channel === channel && m.toNode === 0xffffffff);
  const filteredMessages = hasFilter
    ? channelMessages.filter(m => {
        const senderName = nodeStore.getNodeName(m.fromNode).toLowerCase();
        const text = (m.text || "").toLowerCase();
        const filterLower = filter!.toLowerCase();
        return text.includes(filterLower) || senderName.includes(filterLower);
      })
    : channelMessages;

  const channelInfo = channels.get(channel);

  // Fixed header height (4 lines for channel selector box, +1 if loraConfig) + input box (3 lines)
  const headerHeight = loraConfig ? 5 : 4;
  const inputHeight = 3;
  const emojiHeight = showEmojiSelector ? 3 : 0;
  const replyRowHeight = replyTo ? 1 : 0;
  const messageAreaHeight = Math.max(1, height - headerHeight - inputHeight - emojiHeight - filterRowHeight - replyRowHeight);

  // Helper to calculate how many lines a message will take
  const textWidth = Math.max(20, width - PREFIX_WIDTH - 4 - 6);
  const getMessageHeight = (msg: DbMessage): number => {
    if (!msg || !msg.text) return 1; // Fallback for messages without text
    const cleanText = msg.text.replace(/[\r\x00-\x1f]/g, "");
    let lineCount = 0;
    for (const line of cleanText.split("\n")) {
      if (line.length <= textWidth) {
        lineCount++;
      } else {
        let remaining = line;
        while (remaining.length > textWidth) {
          let breakPoint = remaining.lastIndexOf(" ", textWidth);
          if (breakPoint <= 0) breakPoint = textWidth;
          lineCount++;
          remaining = remaining.slice(breakPoint).trimStart();
        }
        if (remaining) lineCount++;
      }
    }
    // Add 1 line if message has a reply indicator
    if (msg.replyId && messages.find(m => m.packetId === msg.replyId)) {
      lineCount++;
    }
    return lineCount || 1; // Ensure at least 1 line
  };

  // Calculate visible messages based on actual line heights
  const visibleMessages: DbMessage[] = [];
  let scrollOffset = 0;
  let totalLines = 0;

  if (selectedMessageIndex < 0) {
    // No selection - show most recent messages that fit
    let linesUsed = 0;
    for (let i = filteredMessages.length - 1; i >= 0; i--) {
      const msgHeight = getMessageHeight(filteredMessages[i]);
      if (linesUsed + msgHeight <= messageAreaHeight) {
        visibleMessages.unshift(filteredMessages[i]);
        linesUsed += msgHeight;
        scrollOffset = i;
      } else {
        break;
      }
    }
  } else {
    // Try to center the selected message
    scrollOffset = Math.max(0, selectedMessageIndex);
    let linesUsed = 0;

    // Add selected message first
    if (scrollOffset < filteredMessages.length) {
      visibleMessages.push(filteredMessages[scrollOffset]);
      linesUsed += getMessageHeight(filteredMessages[scrollOffset]);
    }

    // Add messages before and after alternately to center
    let before = scrollOffset - 1;
    let after = scrollOffset + 1;
    while ((before >= 0 || after < filteredMessages.length) && linesUsed < messageAreaHeight) {
      if (after < filteredMessages.length) {
        const msgHeight = getMessageHeight(filteredMessages[after]);
        if (linesUsed + msgHeight <= messageAreaHeight) {
          visibleMessages.push(filteredMessages[after]);
          linesUsed += msgHeight;
          after++;
        } else {
          break;
        }
      }
      if (before >= 0) {
        const msgHeight = getMessageHeight(filteredMessages[before]);
        if (linesUsed + msgHeight <= messageAreaHeight) {
          visibleMessages.unshift(filteredMessages[before]);
          linesUsed += msgHeight;
          scrollOffset = before;
          before--;
        } else if (after >= filteredMessages.length) {
          break;
        }
      }
    }
  }

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
        {loraConfig && (
          <Box>
            <Text color={theme.fg.muted}>Preset: </Text>
            <Text color={theme.packet.telemetry}>{Config.Config_LoRaConfig_ModemPreset[loraConfig.modemPreset]}</Text>
            <Text color={theme.fg.muted}>  Slot: </Text>
            <Text color={theme.fg.primary}>{loraConfig.channelNum || "Auto"}</Text>
            {loraConfig.overrideFrequency > 0 && (
              <>
                <Text color={theme.fg.muted}>  Freq: </Text>
                <Text color={theme.fg.accent}>{loraConfig.overrideFrequency.toFixed(3)} MHz</Text>
              </>
            )}
          </Box>
        )}
      </Box>

      {/* Filter row */}
      {filterInputActive && (
        <Box paddingX={1}>
          <Text color={theme.fg.accent}>/</Text>
          <Text color={theme.fg.primary}>{filter}</Text>
          <Text color={theme.fg.accent}>█</Text>
        </Box>
      )}
      {hasFilter && !filterInputActive && (
        <Box paddingX={1}>
          <Text color={theme.packet.encrypted} bold>[FILTERED: "{filter}"]</Text>
          <Text color={theme.fg.muted}> ({filteredMessages.length} match{filteredMessages.length !== 1 ? "es" : ""}) </Text>
          <Text color={theme.fg.secondary}>Esc to clear</Text>
        </Box>
      )}

      {/* Messages */}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} paddingX={1} overflowY="hidden">
        {filteredMessages.length === 0 ? (
          hasFilter ? (
            <Text color={theme.fg.muted}>No messages matching "{filter}"</Text>
          ) : (
            <Text color={theme.fg.muted}>No messages on channel {channel}</Text>
          )
        ) : (
          visibleMessages.filter(msg => msg != null).map((msg, i) => {
            const actualIndex = filteredMessages.indexOf(msg);
            return (
              <MessageRow
                key={msg.id ?? `${msg.packetId}-${i}`}
                message={msg}
                nodeStore={nodeStore}
                isOwn={msg.fromNode === myNodeNum}
                isSelected={actualIndex === selectedMessageIndex && !inputFocused}
                width={width}
                meshViewConfirmedIds={meshViewConfirmedIds}
                allMessages={messages}
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

      {/* Reply indicator */}
      {replyTo && (
        <Box paddingX={1}>
          <Text color={theme.fg.muted}>replying to </Text>
          <Text color={theme.fg.accent}>{nodeStore.getNodeName(replyTo.fromNode)}</Text>
          <Text color={theme.fg.muted}>: "{replyTo.text.length > 30 ? replyTo.text.slice(0, 30) + "..." : replyTo.text}"</Text>
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

export const ChatPanel = React.memo(ChatPanelComponent, (prevProps, nextProps) => {
  // Only re-render if relevant props changed
  return (
    prevProps.messages.length === nextProps.messages.length &&
    prevProps.channel === nextProps.channel &&
    prevProps.input === nextProps.input &&
    prevProps.inputFocused === nextProps.inputFocused &&
    prevProps.height === nextProps.height &&
    prevProps.width === nextProps.width &&
    prevProps.selectedMessageIndex === nextProps.selectedMessageIndex &&
    prevProps.showEmojiSelector === nextProps.showEmojiSelector &&
    prevProps.emojiSelectorIndex === nextProps.emojiSelectorIndex &&
    prevProps.filter === nextProps.filter &&
    prevProps.filterInputActive === nextProps.filterInputActive &&
    prevProps.replyTo === nextProps.replyTo &&
    prevProps.channels === nextProps.channels &&
    prevProps.meshViewConfirmedIds === nextProps.meshViewConfirmedIds
  );
});

interface MessageRowProps {
  message: DbMessage;
  nodeStore: NodeStore;
  isOwn: boolean;
  isSelected: boolean;
  width: number;
  meshViewConfirmedIds?: Set<number>;
  allMessages: DbMessage[];
}

const MessageRow = React.memo(function MessageRow({ message, nodeStore, isOwn, isSelected, width, meshViewConfirmedIds, allMessages }: MessageRowProps) {
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
  // Based on Routing.Error enum from mesh.proto
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

  // Remove carriage returns and other control characters that break terminal display
  const cleanText = (message.text || "").replace(/[\r\x00-\x1f]/g, "");
  const lines = wrapText(cleanText, textWidth);
  const continuationPadding = " ".repeat(PREFIX_WIDTH);

  // Find the message being replied to
  const repliedMessage = message.replyId
    ? allMessages.find(m => m.packetId === message.replyId)
    : null;

  // Build reply indicator with proper width constraints
  const replyIndicator = repliedMessage ? (() => {
    const prefix = "└─ replying to ";
    const name = nodeStore.getNodeName(repliedMessage.fromNode);
    const quoteSuffix = ': "';
    const quoteEnd = '"';

    // Calculate available width for the preview text (accounting for continuation padding)
    const prefixLength = PREFIX_WIDTH + prefix.length + name.length + quoteSuffix.length;
    const availableWidth = width - prefixLength - quoteEnd.length - 2; // -2 for padding

    // Truncate the preview if needed
    const cleanReplyText = (repliedMessage.text || "").replace(/[\r\n\x00-\x1f]/g, " ");
    const replyPreview = availableWidth > 10
      ? (cleanReplyText.length > availableWidth
          ? cleanReplyText.slice(0, availableWidth - 3) + "..."
          : cleanReplyText)
      : "...";

    return { prefix, name, quoteSuffix, replyPreview, quoteEnd };
  })() : null;

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" backgroundColor={isSelected ? theme.bg.selected : undefined}>
        {lines.map((line, lineIndex) => (
          <Box key={lineIndex}>
            {lineIndex === 0 ? (
              <Text>
                <Text color={theme.fg.muted}>[{time}] </Text>
                <Text color={nameColor}>{fitVisual(fromName, 10)}</Text>
                <Text> </Text>
              </Text>
            ) : (
              <Text>{continuationPadding}</Text>
            )}
            <Text color={theme.fg.primary}>{line}</Text>
            {lineIndex === lines.length - 1 && getStatusIndicator()}
            {lineIndex === lines.length - 1 && getMeshViewIndicator()}
          </Box>
        ))}
      </Box>
      {replyIndicator && (
        <Box>
          <Text>
            <Text>{continuationPadding}</Text>
            <Text color={theme.fg.muted}>{replyIndicator.prefix}</Text>
            <Text color={theme.fg.secondary}>{replyIndicator.name}</Text>
            <Text color={theme.fg.muted}>{replyIndicator.quoteSuffix}{replyIndicator.replyPreview}{replyIndicator.quoteEnd}</Text>
          </Text>
        </Box>
      )}
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
    prevProps.width === nextProps.width &&
    prevProps.isOwn === nextProps.isOwn &&
    prevProps.meshViewConfirmedIds === nextProps.meshViewConfirmedIds
  );
});
