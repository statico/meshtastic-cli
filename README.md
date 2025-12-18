# Meshtastic CLI

<table>
  <tr>
    <td>
      <img width="945" height="801" alt="4" src="https://github.com/user-attachments/assets/460645ad-abca-4c64-a5a7-00efd0c96de2" />
    </td>
    <td>
      <img width="945" height="801" alt="3" src="https://github.com/user-attachments/assets/b329736b-45f3-465e-8a11-a58cb0013744" />
    </td> 
  </tr>
  <tr>
    <td>
      <img width="945" height="801" alt="2" src="https://github.com/user-attachments/assets/250c3e9b-e58f-48b7-8e38-5a142d362a4d" />
    </td>
    <td>
      <img width="945" height="801" alt="1" src="https://github.com/user-attachments/assets/51d5dab7-4b50-4d1e-8d92-21502ac32be7" />
    </td>
  </tr>
</table>

> [!WARNING]
> This project was completely vibe-coded with [Claude Code](https://claude.com/claude-code). Use at your own risk.

A terminal UI for monitoring Meshtastic mesh networks. Connects to a Meshtastic node via HTTP and displays real-time packet traffic, node information, and chat messages.

This is a read-only viewer. It does not support device configuration.

## Features

- **Packets view** - Live packet stream with detailed inspection (decoded payload, JSON, hex dump)
- **Nodes view** - Discovered nodes with signal quality, battery, position, and hardware info
- **Chat view** - Send and receive text messages on any channel
- **Log view** - Position and traceroute response history
- **Node commands** - Traceroute, position request, telemetry request, direct ping
- **Persistent storage** - SQLite database for nodes, messages, and packets
- **Session support** - Multiple named sessions for different radios

## Installation

### Download Binary

Grab the latest release for your platform from the [Releases page](../../releases).

```sh
chmod +x meshtastic-cli-darwin-arm64
./meshtastic-cli-darwin-arm64 192.168.1.100
```

### Docker

```sh
docker run --rm -it ghcr.io/statico/meshtastic-cli 192.168.1.100
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
  --help, -h         Show help
```

## Keybindings

### Global

| Key | Action |
|-----|--------|
| 1 | Packets view |
| 2 | Nodes view |
| 3 | Chat view |
| 4 | Log view |
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
| Enter | Jump to sender node |

### Nodes View

| Key | Action |
|-----|--------|
| j/k | Navigate nodes |
| t | Traceroute |
| p | Request position |
| e | Request telemetry |
| d | Direct ping |
| g | Google hardware model |

### Chat View

| Key | Action |
|-----|--------|
| Tab | Switch channel |
| Enter | Send message |
| Escape | Exit chat |

## License

MIT
