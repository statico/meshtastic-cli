import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

type AppMode = "packets" | "nodes" | "chat" | "dm" | "config" | "log" | "meshview";

interface HelpDialogProps {
  mode: AppMode;
  meshViewUrl?: string;
}

const getGlobalKeys = (hasMeshView: boolean) => [
  { key: hasMeshView ? "1-7" : "1-6", desc: "Switch to view (Packets/Nodes/...)" },
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
  { key: "o", desc: "Open packet in MeshView" },
  { key: "u", desc: "Update node from MeshView" },
];

const nodeKeys = [
  { key: "j / ↓", desc: "Next node" },
  { key: "k / ↑", desc: "Previous node" },
  { key: "Ctrl+d/PgDn", desc: "Page down" },
  { key: "Ctrl+u/PgUp", desc: "Page up" },
  { key: "g / G", desc: "First / Last node" },
  { key: "/", desc: "Filter nodes" },
  { key: "H/S/B/A/V", desc: "Sort: Hops/SNR/Battery/Age/Favs" },
  { key: "t", desc: "Traceroute to node" },
  { key: "p", desc: "Request position" },
  { key: "e", desc: "Request telemetry" },
  { key: "i", desc: "Request node info" },
  { key: "d", desc: "Start DM with node" },
  { key: "D", desc: "Direct ping (hop=0)" },
  { key: "u / U", desc: "Update from MeshView (one/all)" },
  { key: "m", desc: "Open position in Maps" },
  { key: "l", desc: "Lookup hardware model" },
  { key: "f", desc: "Toggle favorite" },
  { key: "I", desc: "Toggle ignored" },
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
  { key: "r", desc: "Reply to message" },
  { key: "R", desc: "Resend failed message" },
  { key: "n", desc: "Go to sender node" },
  { key: "p", desc: "Go to packet" },
  { key: "d", desc: "DM the sender" },
  { key: "u", desc: "Update node from MeshView" },
  { key: "Enter", desc: "Focus input" },
  { key: "Escape", desc: "Unfocus / Clear reply" },
  { key: "Alt+E", desc: "Emoji selector (in input)" },
];

const dmKeys = [
  { key: "j / ↓", desc: "Next conversation/message" },
  { key: "k / ↑", desc: "Previous conversation/message" },
  { key: "l / →", desc: "Enter message selection" },
  { key: "h / ←", desc: "Back to conversations" },
  { key: "g / G", desc: "First / Last" },
  { key: "r", desc: "Reply to message" },
  { key: "R", desc: "Resend failed message" },
  { key: "n", desc: "Go to node" },
  { key: "p", desc: "Go to packet" },
  { key: "u", desc: "Update node from MeshView" },
  { key: "#", desc: "Delete conversation" },
  { key: "Enter", desc: "Focus input" },
  { key: "Escape", desc: "Back / Clear reply" },
];

const configKeys = [
  { key: "h / l", desc: "Previous / Next column" },
  { key: "j / ↓", desc: "Next option" },
  { key: "k / ↑", desc: "Previous option" },
  { key: "g / G", desc: "First / Last option" },
  { key: "Enter", desc: "Select / Edit toggle" },
  { key: "Escape", desc: "Back to menu" },
  { key: "e", desc: "Edit channel name" },
  { key: "p", desc: "Edit channel PSK" },
  { key: "r", desc: "Cycle channel role" },
  { key: "u / D", desc: "Toggle uplink / downlink" },
  { key: "c", desc: "Commit changes" },
  { key: "C", desc: "Discard changes" },
  { key: "R", desc: "Reboot device" },
];

const logKeys = [
  { key: "j / ↓", desc: "Next response" },
  { key: "k / ↑", desc: "Previous response" },
  { key: "g / G", desc: "First / Last response" },
  { key: "n", desc: "Go to node from log message" },
];

const meshviewKeys = [
  { key: "j / ↓", desc: "Next packet" },
  { key: "k / ↑", desc: "Previous packet" },
  { key: "Ctrl+d/PgDn", desc: "Page down" },
  { key: "Ctrl+u/PgUp", desc: "Page up" },
  { key: "g / G", desc: "First / Last packet" },
  { key: "h / l", desc: "Previous / Next inspector tab" },
  { key: "Tab", desc: "Toggle pane sizes" },
  { key: "Space / b", desc: "Scroll inspector" },
  { key: "+ / -", desc: "Resize inspector" },
  { key: "o", desc: "Open in MeshView web UI" },
  { key: "c", desc: "Clear packets and refresh" },
];

// Status indicators shown in chat/dm/packets views
const statusIndicators = [
  { indicator: "[...]", desc: "Pending - waiting for acknowledgment" },
  { indicator: "[✓]", desc: "Acknowledged - recipient confirmed" },
  { indicator: "[✗]", desc: "Failed - delivery failed or timed out" },
  { indicator: "[M]", desc: "MeshView - packet seen on MeshView server" },
];

export function HelpDialog({ mode, meshViewUrl }: HelpDialogProps) {
  const globalKeys = getGlobalKeys(!!meshViewUrl);

  const modeKeys = mode === "packets" ? packetKeys
    : mode === "nodes" ? nodeKeys
    : mode === "chat" ? chatKeys
    : mode === "dm" ? dmKeys
    : mode === "config" ? configKeys
    : mode === "meshview" ? meshviewKeys
    : logKeys;

  // Check if a shortcut is MeshView-related
  const isMeshViewKey = (desc: string) => desc.toLowerCase().includes("meshview");

  const modeTitle = mode === "packets" ? "PACKETS"
    : mode === "nodes" ? "NODES"
    : mode === "chat" ? "CHAT"
    : mode === "dm" ? "DM"
    : mode === "config" ? "CONFIG"
    : mode === "meshview" ? "MESHVIEW"
    : "LOG";

  // Show status indicators for chat, dm, and packets modes
  const showStatusIndicators = mode === "chat" || mode === "dm" || mode === "packets";

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
      {modeKeys.map(({ key, desc }) => {
        const disabled = isMeshViewKey(desc) && !meshViewUrl;
        return (
          <Box key={key}>
            <Text color={disabled ? theme.fg.muted : theme.data.nodeFrom}>{key.padEnd(12)}</Text>
            <Text color={disabled ? theme.fg.muted : theme.fg.primary}>{desc}</Text>
            {disabled && <Text color={theme.fg.muted}> (disabled)</Text>}
          </Box>
        );
      })}

      {showStatusIndicators && (
        <>
          <Box marginY={1}>
            <Text bold color={theme.data.channel}>STATUS INDICATORS</Text>
          </Box>
          {statusIndicators.map(({ indicator, desc }) => {
            const disabled = indicator === "[M]" && !meshViewUrl;
            return (
              <Box key={indicator}>
                <Text color={disabled ? theme.fg.muted : theme.data.nodeFrom}>{indicator.padEnd(12)}</Text>
                <Text color={disabled ? theme.fg.muted : theme.fg.primary}>{desc}</Text>
              </Box>
            );
          })}
        </>
      )}

      <Box marginTop={1} justifyContent="center">
        <Text color={theme.fg.muted}>Press ? to close</Text>
      </Box>
    </Box>
  );
}
