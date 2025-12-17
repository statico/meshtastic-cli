import { BoxRenderable, TextRenderable, type CliRenderer, t, fg, bold } from "@opentui/core";
import { theme } from "../theme";
import type { DecodedPacket } from "../../protocol/decoder";
import { formatHexDump, formatNodeId } from "../../utils/hex";
import { Portnums } from "@meshtastic/protobufs";

export type InspectorTab = "normalized" | "protobuf" | "hex";

export class PacketInspector {
  private renderer: CliRenderer;
  private container: BoxRenderable;
  private tabBar: BoxRenderable;
  private content: BoxRenderable;
  private contentText: TextRenderable;
  private currentTab: InspectorTab = "normalized";
  private packet: DecodedPacket | null = null;

  constructor(renderer: CliRenderer) {
    this.renderer = renderer;
    this.container = new BoxRenderable(renderer, {
      id: "inspector",
      width: "100%",
      height: 10,
      flexDirection: "column",
      backgroundColor: theme.bg.panel,
      border: true,
      borderColor: theme.border.normal,
    });

    this.tabBar = new BoxRenderable(renderer, {
      id: "inspector-tabs",
      width: "100%",
      height: 1,
      flexDirection: "row",
      backgroundColor: theme.bg.panel,
      paddingLeft: 1,
    });

    this.content = new BoxRenderable(renderer, {
      id: "inspector-content",
      width: "100%",
      flexGrow: 1,
      backgroundColor: theme.bg.primary,
      paddingLeft: 1,
      paddingTop: 1,
    });

    this.contentText = new TextRenderable(renderer, {
      content: t`${fg(theme.fg.muted)("Select a packet to inspect")}`,
    });

    this.content.add(this.contentText);
    this.container.add(this.tabBar);
    this.container.add(this.content);
    this.updateTabs();
  }

  get element(): BoxRenderable {
    return this.container;
  }

  setPacket(packet: DecodedPacket) {
    this.packet = packet;
    this.render();
  }

  setTab(tab: InspectorTab) {
    this.currentTab = tab;
    this.updateTabs();
    this.render();
  }

  nextTab() {
    const tabs: InspectorTab[] = ["normalized", "protobuf", "hex"];
    const idx = tabs.indexOf(this.currentTab);
    this.setTab(tabs[(idx + 1) % tabs.length]);
  }

  private updateTabs() {
    for (const child of this.tabBar.getChildren()) {
      this.tabBar.remove(child.id);
    }
    const tabs: { key: InspectorTab; label: string }[] = [
      { key: "normalized", label: "Normalized" },
      { key: "protobuf", label: "Protobuf" },
      { key: "hex", label: "Hex" },
    ];

    for (const tab of tabs) {
      const isActive = tab.key === this.currentTab;
      const text = new TextRenderable(this.renderer, {
        content: isActive
          ? t`${bold(fg(theme.fg.accent)(`[${tab.label}]`))} `
          : t`${fg(theme.fg.secondary)(`[${tab.label}]`)} `,
      });
      this.tabBar.add(text);
    }
  }

  private render() {
    if (!this.packet) {
      this.contentText.content = t`${fg(theme.fg.muted)("Select a packet to inspect")}`;
      return;
    }

    switch (this.currentTab) {
      case "normalized":
        this.contentText.content = this.renderNormalized();
        break;
      case "protobuf":
        this.contentText.content = this.renderProtobuf();
        break;
      case "hex":
        this.contentText.content = this.renderHex();
        break;
    }
  }

  private renderNormalized(): string {
    const p = this.packet!;
    const lines: string[] = [];

    if (p.decodeError) {
      lines.push(t`${fg(theme.packet.encrypted)("Decode Error:")} ${p.decodeError}`);
      return lines.join("\n");
    }

    const fr = p.fromRadio;
    if (!fr) return t`${fg(theme.fg.muted)("Empty packet")}`;

    if (fr.payloadVariant.case === "packet" && p.meshPacket) {
      const mp = p.meshPacket;
      const portName = p.portnum !== undefined ? Portnums.PortNum[p.portnum] || `PORT_${p.portnum}` : "ENCRYPTED";

      lines.push(t`${fg(theme.fg.secondary)("Type:")} ${fg(theme.fg.primary)(portName)}`);
      lines.push(t`${fg(theme.fg.secondary)("From:")} ${fg(theme.fg.primary)(formatNodeId(mp.from))}`);
      lines.push(t`${fg(theme.fg.secondary)("To:")} ${fg(theme.fg.primary)(mp.to === 0xffffffff ? "broadcast" : formatNodeId(mp.to))}`);
      lines.push(t`${fg(theme.fg.secondary)("Channel:")} ${fg(theme.fg.primary)(mp.channel.toString())}`);
      lines.push(t`${fg(theme.fg.secondary)("ID:")} ${fg(theme.fg.primary)(`#${mp.id}`)}`);
      lines.push(t`${fg(theme.fg.secondary)("Hop Limit:")} ${fg(theme.fg.primary)(mp.hopLimit.toString())}`);

      if (mp.rxTime) lines.push(t`${fg(theme.fg.secondary)("RX Time:")} ${fg(theme.fg.primary)(new Date(mp.rxTime * 1000).toLocaleTimeString())}`);
      if (mp.rxRssi) lines.push(t`${fg(theme.fg.secondary)("RSSI:")} ${fg(theme.fg.primary)(`${mp.rxRssi} dBm`)}`);
      if (mp.rxSnr) lines.push(t`${fg(theme.fg.secondary)("SNR:")} ${fg(theme.fg.primary)(`${mp.rxSnr} dB`)}`);

      if (typeof p.payload === "string") {
        lines.push(t`${fg(theme.fg.secondary)("Payload:")} ${fg(theme.fg.accent)(`"${p.payload}"`)}`);
      }
    } else if (fr.payloadVariant.case) {
      lines.push(t`${fg(theme.fg.secondary)("Type:")} ${fg(theme.fg.primary)(fr.payloadVariant.case.toUpperCase())}`);
    }

    return lines.join("\n");
  }

  private renderProtobuf(): string {
    const p = this.packet!;
    const lines: string[] = [];

    if (p.decodeError) {
      lines.push(t`${fg(theme.packet.encrypted)("Decode Error:")} ${p.decodeError}`);
      return lines.join("\n");
    }

    const fr = p.fromRadio;
    if (!fr) return t`${fg(theme.fg.muted)("Empty packet")}`;

    lines.push(t`${fg(theme.fg.accent)("FromRadio")}`);
    lines.push(t`${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("id:")} ${fg(theme.fg.primary)(fr.id.toString())}`);

    if (fr.payloadVariant.case === "packet" && p.meshPacket) {
      const mp = p.meshPacket;
      lines.push(t`${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)("packet:")} ${fg(theme.fg.accent)("MeshPacket")}`);
      lines.push(t`   ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("from:")} ${fg(theme.fg.primary)(mp.from.toString())} ${fg(theme.fg.muted)(`(${formatNodeId(mp.from)})`)}`);
      lines.push(t`   ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("to:")} ${fg(theme.fg.primary)(mp.to.toString())} ${fg(theme.fg.muted)(`(${mp.to === 0xffffffff ? "broadcast" : formatNodeId(mp.to)})`)}`);
      lines.push(t`   ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("channel:")} ${fg(theme.fg.primary)(mp.channel.toString())}`);
      lines.push(t`   ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("id:")} ${fg(theme.fg.primary)(mp.id.toString())}`);
      lines.push(t`   ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("hop_limit:")} ${fg(theme.fg.primary)(mp.hopLimit.toString())}`);

      if (mp.payloadVariant.case === "decoded") {
        const decoded = mp.payloadVariant.value;
        const portName = Portnums.PortNum[decoded.portnum] || `PORT_${decoded.portnum}`;
        lines.push(t`   ${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)("decoded:")} ${fg(theme.fg.accent)("Data")}`);
        lines.push(t`      ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("portnum:")} ${fg(theme.fg.primary)(portName)}`);
        lines.push(t`      ${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)("payload:")} ${fg(theme.fg.primary)(`[${decoded.payload.length} bytes]`)}`);
      } else if (mp.payloadVariant.case === "encrypted") {
        lines.push(t`   ${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)("encrypted:")} ${fg(theme.packet.encrypted)(`[${mp.payloadVariant.value.length} bytes]`)}`);
      }
    } else if (fr.payloadVariant.case) {
      lines.push(t`${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)(fr.payloadVariant.case)}`);
    }

    return lines.join("\n");
  }

  private renderHex(): string {
    const p = this.packet!;
    const hexLines = formatHexDump(p.raw);
    return hexLines.map((line) => t`${fg(theme.fg.primary)(line)}`).join("\n");
  }
}
