import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { DbMessage } from "../../db";
import type { NodeStore } from "../../protocol/node-store";

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
      <Text color={frame === 0 ? theme.fg.primary : theme.fg.muted}>.</Text>
      <Text color={frame === 1 ? theme.fg.primary : theme.fg.muted}>.</Text>
      <Text color={frame === 2 ? theme.fg.primary : theme.fg.muted}>.</Text>
    </Text>
  );
}

interface ChatPanelProps {
  messages: DbMessage[];
  channel: number;
  input: string;
  nodeStore: NodeStore;
  myNodeNum: number;
}

export function ChatPanel({ messages, channel, input, nodeStore, myNodeNum }: ChatPanelProps) {
  const channelMessages = messages.filter((m) => m.channel === channel);
  const visibleMessages = channelMessages.slice(-20);

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Channel selector */}
      <Box paddingX={1} paddingY={0}>
        <Text color={theme.fg.muted}>Channel: </Text>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((ch) => (
          <Text key={ch} color={ch === channel ? theme.fg.accent : theme.fg.muted} bold={ch === channel}>
            {ch === channel ? `[${ch}]` : ` ${ch} `}
          </Text>
        ))}
        <Text color={theme.fg.muted}> (Tab to switch)</Text>
      </Box>

      {/* Messages */}
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {visibleMessages.length === 0 ? (
          <Text color={theme.fg.muted}>No messages on channel {channel}</Text>
        ) : (
          visibleMessages.map((msg, i) => (
            <MessageRow
              key={msg.id ?? `${msg.packetId}-${i}`}
              message={msg}
              nodeStore={nodeStore}
              isOwn={msg.fromNode === myNodeNum}
            />
          ))
        )}
      </Box>

      {/* Input */}
      <Box paddingX={1} borderStyle="single" borderColor={theme.border.focused}>
        <Text color={theme.fg.accent}>{">"} </Text>
        <Text color={theme.fg.primary}>{input}</Text>
        <Text color={theme.fg.accent}>{"█"}</Text>
      </Box>
    </Box>
  );
}

interface MessageRowProps {
  message: DbMessage;
  nodeStore: NodeStore;
  isOwn: boolean;
}

function MessageRow({ message, nodeStore, isOwn }: MessageRowProps) {
  const fromName = nodeStore.getNodeName(message.fromNode);
  const time = new Date(message.timestamp * 1000).toLocaleTimeString("en-US", { hour12: false });
  const nameColor = isOwn ? theme.fg.accent : theme.packet.position;

  const getStatusIndicator = () => {
    if (!isOwn) return null;
    switch (message.status) {
      case "pending":
        return <AnimatedDots />;
      case "acked":
        return <Text color={theme.status.online}> ✓</Text>;
      case "error":
        return <Text color={theme.status.offline}> ✗</Text>;
      default:
        return null;
    }
  };

  return (
    <Box>
      <Text color={theme.fg.muted}>[{time}] </Text>
      <Text color={nameColor}>{fromName.padEnd(10)}</Text>
      <Text color={theme.fg.primary}>{message.text}</Text>
      {getStatusIndicator()}
    </Box>
  );
}
