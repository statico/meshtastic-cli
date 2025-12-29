# Meshtastic CLI

[![Build](https://github.com/statico/meshtastic-cli/actions/workflows/build.yml/badge.svg)](https://github.com/statico/meshtastic-cli/actions/workflows/build.yml)
[![Docker](https://github.com/statico/meshtastic-cli/actions/workflows/docker.yml/badge.svg)](https://github.com/statico/meshtastic-cli/actions/workflows/docker.yml)
[![Release](https://img.shields.io/github/v/release/statico/meshtastic-cli)](https://github.com/statico/meshtastic-cli/releases)
[![License](https://img.shields.io/github/license/statico/meshtastic-cli)](LICENSE)

<table>
  <tr>
    <td>
      <h3>Live Packet View</h3>
      <img width="799" height="815" alt="CleanShot 2025-12-28 at 17 10 17" src="https://github.com/user-attachments/assets/c1862da1-5088-453f-8a14-ed324e2f6edf" />
    </td>
    <td>
      <h3>Node List</h3>
      <img width="856" height="793" alt="CleanShot 2025-12-28 at 17 17 16" src="https://github.com/user-attachments/assets/a3efcc6a-70f7-4cb8-a7bf-0588493bbde8" />
    </td>
  </tr>
  <tr>
    <td>
      <h3>Chat Channels</h3>
      <img width="799" height="815" alt="CleanShot 2025-12-28 at 17 11 04" src="https://github.com/user-attachments/assets/345982b9-dac1-4783-8a30-a52c3df92cce" />
    </td>
    <td>
      <h3>Interactive Help</h3>
      <img width="799" height="815" alt="CleanShot 2025-12-28 at 17 12 58" src="https://github.com/user-attachments/assets/71cdf736-1c95-40e6-a689-8f50682ebc7d" />\
    </td>
  </tr>
</table>

> [!WARNING]
> This project was completely vibe-coded with [Claude Code](https://claude.com/claude-code) and [Cursor](https://www.cursor.com/).

A terminal UI for monitoring and configuring Meshtastic mesh networks. Connects to a Meshtastic node via HTTP and displays real-time packet traffic, node information, chat messages, and device configuration.

## Features

- **Packets view** - Live packet stream with detailed inspection (decoded payload, JSON, hex dump)
- **Nodes view** - Discovered nodes with signal quality, battery, position, hardware, favorites
- **Chat view** - Send and receive channel messages with emoji support and delivery status
- **DM view** - Direct messages with delivery status and resend support
- **Config view** - View and edit device configuration with batch mode
- **Log view** - Position, traceroute, and nodeinfo response history
- **Node commands** - Traceroute, position/telemetry/nodeinfo request, direct ping, DM
- **ACK notifications** - Visual feedback when nodes acknowledge your packets
- **MeshView integration** - Update node info from a MeshView server, view live MeshView traffic
- **Persistent storage** - SQLite database for nodes, messages, and packets
- **Session support** - Multiple named sessions for different radios

## Installation

### Download Binary

Grab the latest release for your platform from the [Releases page](../../releases).

```sh
chmod +x meshtastic-cli-darwin-arm64
./meshtastic-cli-darwin-arm64 192.168.1.100
```

Note: macOS binaries are not codesigned. You may need to right-click and select "Open" or run `xattr -d com.apple.quarantine <binary>` to bypass Gatekeeper.

### Docker

```sh
docker volume create meshtastic-cli
docker run --rm -it -e TERM -v meshtastic-cli:/root/.config ghcr.io/statico/meshtastic-cli 192.168.1.100

# With MeshView integration (e.g., Baymesh)
docker run --rm -it -e TERM -v meshtastic-cli:/root/.config ghcr.io/statico/meshtastic-cli 192.168.1.100 --meshview https://meshview.bayme.sh
```

### Build from Source

Requires [Bun](https://bun.sh).

```sh
bun install
bun run dev 192.168.1.100
```

## Usage

```
meshtastic-cli [address] [options]

Arguments:
  address            Device address (default: 192.168.0.123)

Options:
  --session, -s      Session name for database (default: default)
  --clear            Clear the database for the session and exit
  --skip-config      Skip loading device configuration on startup
  --skip-nodes       Skip downloading node database (faster connect)
  --meshview, -m     MeshView URL for packet/node links
  --fahrenheit, -F   Display temperatures in Fahrenheit
  --help, -h         Show help
```

## Message Status Indicators

In Chat and DM views, messages show delivery status:

| Indicator | Meaning |
|-----------|---------|
| `[...]` | Pending - waiting for acknowledgment |
| `[✓]` | Acknowledged - recipient confirmed receipt |
| `[✗]` | Failed - delivery failed or timed out |
| `[M]` | MeshView confirmed - packet seen on MeshView server |

The `[M]` indicator also appears in the Packets view when a MeshView URL is configured. This confirms the packet was received by the MeshView aggregation server, which is useful for verifying mesh propagation.

## Terminal Compatibility

For proper emoji and Unicode character display, ensure your terminal uses Unicode-compliant width calculations:

- **Ghostty** - Uses Unicode widths by default (`grapheme-width-method = unicode`)
- **Kitty** - Uses Unicode widths by default
- **iTerm2** - Enable in Preferences → Profiles → Text → "Unicode version 9+ widths"
- **Terminal.app** - May have issues with some emoji

There are still issues with some emoji and fixing them is a work in progress.

## Keybindings

### Global

| Key | Action |
|-----|--------|
| 1-7 | Switch to view (7 with MeshView) |
| [ / ] | Previous / Next view |
| Ctrl+L | Redraw screen |
| q | Quit |
| ? | Toggle help |

### Packets View

| Key | Action |
|-----|--------|
| j/k | Navigate packets |
| g/G | First/last packet |
| h/l | Switch inspector tab |
| Tab | Toggle pane sizes |
| +/- | Resize inspector |
| m | Open position in Maps |
| n/Enter | Jump to sender node |
| u | Update node from MeshView |
| o | Open packet in MeshView |

### Nodes View

| Key | Action |
|-----|--------|
| j/k | Navigate nodes |
| / | Filter nodes |
| t | Traceroute |
| p | Request position |
| e | Request telemetry |
| d | Start DM |
| D | Direct ping (hop=0) |
| u | Update from MeshView |
| U | Update all unknown from MeshView |
| m | Open position in Maps |
| l | Lookup hardware model |
| f | Toggle favorite |
| i | Request node info |
| I | Toggle ignored |
| x | Remove node from DB |
| H | Sort by hops |
| S | Sort by SNR |
| B | Sort by battery |
| A | Sort by age (last heard) |
| F | Sort by favorites |

### Chat View

| Key | Action |
|-----|--------|
| j/k | Navigate messages |
| / | Filter messages |
| Tab | Switch channel |
| n | Go to sender node |
| d | DM the sender |
| u | Update node from MeshView |
| R | Resend failed message |
| Enter | Focus input |
| Alt+E | Emoji selector |
| Escape | Unfocus / Exit |

### DM View

| Key | Action |
|-----|--------|
| j/k | Navigate conversations or messages |
| l/→ | Enter message selection mode |
| h/← | Back to conversation list |
| n | Go to node |
| u | Update node from MeshView |
| R | Resend failed message |
| Enter | Focus input |
| Escape | Back / Unfocus |
| # | Delete conversation |

### Log View

| Key | Action |
|-----|--------|
| j/k | Navigate responses |
| g/G | First/last response |

### Config View

| Key | Action |
|-----|--------|
| h/j/k/l | Navigate menu |
| Enter | Select section |
| j/k | Navigate config fields |
| g/G | First/last field |
| c | Commit changes |
| C | Discard changes |
| Escape | Back to menu |
| r | Reboot device |

### Channel Config

| Key | Action |
|-----|--------|
| j/k | Navigate channels |
| e | Edit channel name |
| r | Cycle channel role |
| p | Edit encryption key (PSK) |
| u | Toggle uplink |
| D | Toggle downlink |

## License

MIT
