import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

type AppMode = "packets" | "nodes" | "chat" | "log";

interface HelpDialogProps {
  mode: AppMode;
}

const globalKeys = [
  { key: "1", desc: "Packets view" },
  { key: "2", desc: "Nodes view" },
  { key: "3", desc: "Chat view" },
  { key: "4", desc: "Log view" },
  { key: "q / Q", desc: "Quit" },
  { key: "?", desc: "Toggle help" },
];

const packetKeys = [
  { key: "j / ↓", desc: "Next packet" },
  { key: "k / ↑", desc: "Previous packet" },
  { key: "Ctrl+d/PgDn", desc: "Page down" },
  { key: "Ctrl+u/PgUp", desc: "Page up" },
  { key: "g", desc: "First packet" },
  { key: "G", desc: "Last packet" },
  { key: "h / ←", desc: "Previous inspector tab" },
  { key: "l / →", desc: "Next inspector tab" },
  { key: "Tab", desc: "Toggle pane sizes" },
  { key: "Space / b", desc: "Scroll inspector" },
  { key: "+ / -", desc: "Resize inspector" },
  { key: "m", desc: "Open position in Maps" },
  { key: "Enter", desc: "Jump to node" },
];

const nodeKeys = [
  { key: "j / ↓", desc: "Next node" },
  { key: "k / ↑", desc: "Previous node" },
  { key: "Ctrl+d/PgDn", desc: "Page down" },
  { key: "Ctrl+u/PgUp", desc: "Page up" },
  { key: "g / G", desc: "First / Last node" },
  { key: "t", desc: "Traceroute to node" },
  { key: "p", desc: "Request position" },
  { key: "e", desc: "Request telemetry" },
  { key: "d", desc: "Direct ping (hop=0)" },
  { key: "m", desc: "Open position in Maps" },
  { key: "l", desc: "Lookup hardware model" },
];

const chatKeys = [
  { key: "j / ↓", desc: "Next message" },
  { key: "k / ↑", desc: "Previous message" },
  { key: "Ctrl+d/PgDn", desc: "Page down" },
  { key: "Ctrl+u/PgUp", desc: "Page up" },
  { key: "g / G", desc: "First / Last message" },
  { key: "Tab/S-Tab", desc: "Next/Prev channel" },
  { key: "n", desc: "Go to sender node" },
  { key: "Enter", desc: "Focus input" },
  { key: "Escape", desc: "Unfocus / Exit chat" },
  { key: "Ctrl+E", desc: "Emoji selector (in input)" },
];

const logKeys = [
  { key: "j / ↓", desc: "Next response" },
  { key: "k / ↑", desc: "Previous response" },
];

export function HelpDialog({ mode }: HelpDialogProps) {
  const modeKeys = mode === "packets" ? packetKeys
    : mode === "nodes" ? nodeKeys
    : mode === "log" ? logKeys
    : chatKeys;

  const modeTitle = mode === "packets" ? "PACKETS"
    : mode === "nodes" ? "NODES"
    : mode === "log" ? "LOG"
    : "CHAT";

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={theme.fg.accent}
      backgroundColor={theme.bg.primary}
      paddingX={2}
      paddingY={1}
    >
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color={theme.fg.accent}>{"═══ KEYBOARD SHORTCUTS ═══"}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text bold color={theme.data.channel}>GLOBAL</Text>
      </Box>
      {globalKeys.map(({ key, desc }) => (
        <Box key={key}>
          <Text color={theme.data.nodeFrom}>{key.padEnd(12)}</Text>
          <Text color={theme.fg.primary}>{desc}</Text>
        </Box>
      ))}

      <Box marginY={1}>
        <Text bold color={theme.data.channel}>{modeTitle} MODE</Text>
      </Box>
      {modeKeys.map(({ key, desc }) => (
        <Box key={key}>
          <Text color={theme.data.nodeFrom}>{key.padEnd(12)}</Text>
          <Text color={theme.fg.primary}>{desc}</Text>
        </Box>
      ))}

      <Box marginTop={1} justifyContent="center">
        <Text color={theme.fg.muted}>Press ? to close</Text>
      </Box>
    </Box>
  );
}
