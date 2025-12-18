import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

type AppMode = "packets" | "nodes" | "chat" | "dm" | "config" | "log";

interface HelpDialogProps {
  mode: AppMode;
}

const globalKeys = [
  { key: "1-6", desc: "Switch to view (Packets/Nodes/...)" },
  { key: "[ / ]", desc: "Previous / Next view" },
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
  { key: "n / Enter", desc: "Jump to sender node" },
  { key: "u", desc: "Update node from MeshView" },
];

const nodeKeys = [
  { key: "j / ↓", desc: "Next node" },
  { key: "k / ↑", desc: "Previous node" },
  { key: "Ctrl+d/PgDn", desc: "Page down" },
  { key: "Ctrl+u/PgUp", desc: "Page up" },
  { key: "g / G", desc: "First / Last node" },
  { key: "/", desc: "Filter nodes" },
  { key: "t", desc: "Traceroute to node" },
  { key: "p", desc: "Request position" },
  { key: "e", desc: "Request telemetry" },
  { key: "d", desc: "Start DM with node" },
  { key: "D", desc: "Direct ping (hop=0)" },
  { key: "u", desc: "Update from MeshView" },
  { key: "m", desc: "Open position in Maps" },
  { key: "l", desc: "Lookup hardware model" },
  { key: "f", desc: "Toggle favorite" },
  { key: "i", desc: "Toggle ignored" },
  { key: "x", desc: "Remove node from DB" },
];

const chatKeys = [
  { key: "j / ↓", desc: "Next message" },
  { key: "k / ↑", desc: "Previous message" },
  { key: "Ctrl+d/PgDn", desc: "Page down" },
  { key: "Ctrl+u/PgUp", desc: "Page up" },
  { key: "g / G", desc: "First / Last message" },
  { key: "/", desc: "Filter messages" },
  { key: "Tab/S-Tab", desc: "Next/Prev channel" },
  { key: "n", desc: "Go to sender node" },
  { key: "d", desc: "DM the sender" },
  { key: "u", desc: "Update node from MeshView" },
  { key: "R", desc: "Resend failed message" },
  { key: "Enter", desc: "Focus input" },
  { key: "Escape", desc: "Unfocus / Exit chat" },
  { key: "Ctrl+E", desc: "Emoji selector (in input)" },
];

const dmKeys = [
  { key: "j / ↓", desc: "Next conversation/message" },
  { key: "k / ↑", desc: "Previous conversation/message" },
  { key: "g / G", desc: "First / Last" },
  { key: "n", desc: "Go to node" },
  { key: "u", desc: "Update node from MeshView" },
  { key: "R", desc: "Resend failed message" },
  { key: "#", desc: "Delete conversation" },
  { key: "Enter", desc: "Focus input" },
  { key: "Escape", desc: "Back / Unfocus" },
];

const configKeys = [
  { key: "h / l", desc: "Previous / Next column" },
  { key: "j / ↓", desc: "Next option" },
  { key: "k / ↑", desc: "Previous option" },
  { key: "g / G", desc: "First / Last option" },
  { key: "Enter", desc: "Select / Refresh" },
  { key: "Escape", desc: "Back to menu" },
  { key: "e / E", desc: "Edit field (User config)" },
  { key: "c", desc: "Commit changes" },
  { key: "C", desc: "Discard changes" },
  { key: "r", desc: "Reboot device" },
];

const logKeys = [
  { key: "j / ↓", desc: "Next response" },
  { key: "k / ↑", desc: "Previous response" },
];

export function HelpDialog({ mode }: HelpDialogProps) {
  const modeKeys = mode === "packets" ? packetKeys
    : mode === "nodes" ? nodeKeys
    : mode === "chat" ? chatKeys
    : mode === "dm" ? dmKeys
    : mode === "config" ? configKeys
    : logKeys;

  const modeTitle = mode === "packets" ? "PACKETS"
    : mode === "nodes" ? "NODES"
    : mode === "chat" ? "CHAT"
    : mode === "dm" ? "DM"
    : mode === "config" ? "CONFIG"
    : "LOG";

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
