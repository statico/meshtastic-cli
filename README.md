# Meshtastic CLI

[![Build](https://github.com/statico/meshtastic-cli/actions/workflows/build.yml/badge.svg)](https://github.com/statico/meshtastic-cli/actions/workflows/build.yml)
[![Docker](https://github.com/statico/meshtastic-cli/actions/workflows/docker.yml/badge.svg)](https://github.com/statico/meshtastic-cli/actions/workflows/docker.yml)
[![Release](https://img.shields.io/github/v/release/statico/meshtastic-cli)](https://github.com/statico/meshtastic-cli/releases)
[![License](https://img.shields.io/github/license/statico/meshtastic-cli)](LICENSE)

<table>
  <tr>
    <td>
      <img width="945" height="801" alt="1" src="https://github.com/user-attachments/assets/51d5dab7-4b50-4d1e-8d92-21502ac32be7" />
    </td>
    <td>
      <img width="945" height="801" alt="2" src="https://github.com/user-attachments/assets/250c3e9b-e58f-48b7-8e38-5a142d362a4d" />
    </td>
  </tr>
  <tr>
    <td>
      <img width="945" height="801" alt="3" src="https://github.com/user-attachments/assets/b329736b-45f3-465e-8a11-a58cb0013744" />
    </td> 
    <td>
      <img width="945" height="801" alt="4" src="https://github.com/user-attachments/assets/460645ad-abca-4c64-a5a7-00efd0c96de2" />
    </td>
  </tr>
</table>

> [!WARNING]
> This project was completely vibe-coded with [Claude Code](https://claude.com/claude-code). Use at your own risk.

A terminal UI for monitoring and configuring Meshtastic mesh networks. Connects to a Meshtastic node via HTTP and displays real-time packet traffic, node information, chat messages, and device configuration.

## Features

- **Packets view** - Live packet stream with detailed inspection (decoded payload, JSON, hex dump)
- **Nodes view** - Discovered nodes with signal quality, battery, position, hardware, favorites
- **Chat view** - Send and receive channel messages with emoji support
- **DM view** - Direct messages with delivery confirmation and resend support
- **Config view** - View and edit device configuration with batch mode
- **Log view** - Position and traceroute response history
- **Node commands** - Traceroute, position/telemetry request, direct ping, DM, MeshView lookup
- **MeshView integration** - Update node info from a MeshView server
- **Device notifications** - Auto-dismissing modal for device alerts
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
docker run --rm -it -e TERM ghcr.io/statico/meshtastic-cli 192.168.1.100
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
  --brute-force, -b  Brute force depth for encrypted packets (0-4, default: 2)
  --meshview, -m     MeshView URL for packet/node links
  --help, -h         Show help
```

## Keybindings

### Global

| Key | Action |
|-----|--------|
| 1-6 | Switch to view |
| [ / ] | Previous / Next view |
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
| m | Open position in Maps |
| l | Lookup hardware model |
| f | Toggle favorite |
| i | Toggle ignored |
| x | Remove node from DB |

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
| Ctrl+E | Emoji selector |
| Escape | Unfocus / Exit |

### DM View

| Key | Action |
|-----|--------|
| j/k | Navigate conversations/messages |
| n | Go to node |
| u | Update node from MeshView |
| R | Resend failed message |
| Enter | Select / Focus input |
| Escape | Back / Unfocus |

### Config View

| Key | Action |
|-----|--------|
| h/j/k/l | Navigate menu |
| Enter | Select section |
| c | Commit changes |
| C | Discard changes |
| Escape | Back to menu |
| r | Reboot device |

## License

MIT
