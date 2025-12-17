import { BoxRenderable, TextRenderable, ScrollBoxRenderable, type CliRenderer, t, fg, bold } from "@opentui/core";
import { theme } from "../theme";
import type { DecodedPacket } from "../../protocol/decoder";
import { formatHexDump, formatNodeId } from "../../utils/hex";
import { Mesh, Portnums, Channel } from "@meshtastic/protobufs";

export type InspectorTab = "normalized" | "protobuf" | "hex";

export class PacketInspector {
  private renderer: CliRenderer;
  private container: BoxRenderable;
  private tabBar: BoxRenderable;
  private content: ScrollBoxRenderable;
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

    this.content = new ScrollBoxRenderable(renderer, {
      id: "inspector-content",
      rootOptions: { flexGrow: 1, backgroundColor: theme.bg.primary },
      viewportOptions: { backgroundColor: theme.bg.primary },
      contentOptions: { backgroundColor: theme.bg.primary, paddingLeft: 1 },
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

  scrollUp() {
    this.content.scrollBy(-1);
  }

  scrollDown() {
    this.content.scrollBy(1);
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

  private renderNormalized() {
    const p = this.packet!;

    if (p.decodeError) {
      return t`${fg(theme.packet.encrypted)("Decode Error:")} ${p.decodeError}`;
    }

    const fr = p.fromRadio;
    if (!fr) return t`${fg(theme.fg.muted)("Empty packet")}`;

    if (fr.payloadVariant.case === "packet" && p.meshPacket) {
      const mp = p.meshPacket;
      const portName = p.portnum !== undefined ? Portnums.PortNum[p.portnum] || `PORT_${p.portnum}` : "ENCRYPTED";
      const to = mp.to === 0xffffffff ? "^all" : formatNodeId(mp.to);

      // Build all values as strings first to avoid StyledText concatenation issues
      const snr = mp.rxSnr != null ? `${mp.rxSnr.toFixed(2)} dB` : "-";
      const rssi = mp.rxRssi ? `${mp.rxRssi} dBm` : "-";

      // Determine payload display
      let payloadLine = "";
      if (typeof p.payload === "string") {
        payloadLine = `"${p.payload}"`;
      } else if (p.portnum === Portnums.PortNum.TRACEROUTE_APP && p.payload && typeof p.payload === "object" && "route" in p.payload) {
        const route = (p.payload as Mesh.RouteDiscovery).route;
        payloadLine = route.length > 0 ? route.map((n: number) => formatNodeId(n)).join(" → ") : "(direct)";
      }

      // Single template to avoid [object Object] from StyledText concatenation
      if (payloadLine) {
        return t`${fg(theme.fg.secondary)("Type:")} ${fg(theme.fg.primary)(portName)}
${fg(theme.fg.secondary)("From:")} ${fg(theme.fg.primary)(formatNodeId(mp.from))}
${fg(theme.fg.secondary)("To:")} ${fg(theme.fg.primary)(to)}
${fg(theme.fg.secondary)("SNR:")} ${fg(theme.fg.primary)(snr)}
${fg(theme.fg.secondary)("RSSI:")} ${fg(theme.fg.primary)(rssi)}
${fg(theme.fg.secondary)("Payload:")} ${fg(theme.fg.accent)(payloadLine)}`;
      }

      return t`${fg(theme.fg.secondary)("Type:")} ${fg(theme.fg.primary)(portName)}
${fg(theme.fg.secondary)("From:")} ${fg(theme.fg.primary)(formatNodeId(mp.from))}
${fg(theme.fg.secondary)("To:")} ${fg(theme.fg.primary)(to)}
${fg(theme.fg.secondary)("SNR:")} ${fg(theme.fg.primary)(snr)}
${fg(theme.fg.secondary)("RSSI:")} ${fg(theme.fg.primary)(rssi)}`;
    } else if (fr.payloadVariant.case === "nodeInfo") {
      const info = fr.payloadVariant.value as Mesh.NodeInfo;
      const name = info.user?.shortName || info.user?.longName || "???";
      const longName = info.user?.longName || "Unknown";
      const hwModel = info.user?.hwModel != null ? Mesh.HardwareModel[info.user.hwModel] || `MODEL_${info.user.hwModel}` : "Unknown";
      return t`${fg(theme.fg.secondary)("Type:")} ${fg(theme.fg.primary)("NODE INFO")}
${fg(theme.fg.secondary)("Node:")} ${fg(theme.fg.accent)(name)} ${fg(theme.fg.muted)(`(${formatNodeId(info.num)})`)}
${fg(theme.fg.secondary)("Long Name:")} ${fg(theme.fg.primary)(longName)}
${fg(theme.fg.secondary)("Hardware:")} ${fg(theme.fg.primary)(hwModel)}`;
    } else if (fr.payloadVariant.case === "config") {
      const config = fr.payloadVariant.value as Mesh.Config;
      const configType = config.payloadVariant.case || "unknown";
      return t`${fg(theme.fg.secondary)("Type:")} ${fg(theme.fg.primary)("CONFIG")}
${fg(theme.fg.secondary)("Config:")} ${fg(theme.fg.accent)(configType)}`;
    } else if (fr.payloadVariant.case === "moduleConfig") {
      const config = fr.payloadVariant.value as Mesh.ModuleConfig;
      const configType = config.payloadVariant.case || "unknown";
      return t`${fg(theme.fg.secondary)("Type:")} ${fg(theme.fg.primary)("MODULE CONFIG")}
${fg(theme.fg.secondary)("Module:")} ${fg(theme.fg.accent)(configType)}`;
    } else if (fr.payloadVariant.case === "channel") {
      const channel = fr.payloadVariant.value as Mesh.Channel;
      const name = channel.settings?.name || `Channel ${channel.index}`;
      const role = Channel.Channel_Role[channel.role] || `ROLE_${channel.role}`;
      return t`${fg(theme.fg.secondary)("Type:")} ${fg(theme.fg.primary)("CHANNEL")}
${fg(theme.fg.secondary)("Index:")} ${fg(theme.fg.accent)(channel.index.toString())}
${fg(theme.fg.secondary)("Name:")} ${fg(theme.fg.primary)(name)}
${fg(theme.fg.secondary)("Role:")} ${fg(theme.fg.primary)(role)}`;
    } else if (fr.payloadVariant.case === "myInfo") {
      const myInfo = fr.payloadVariant.value as Mesh.MyNodeInfo;
      return t`${fg(theme.fg.secondary)("Type:")} ${fg(theme.fg.primary)("MY INFO")}
${fg(theme.fg.secondary)("My Node:")} ${fg(theme.fg.accent)(formatNodeId(myInfo.myNodeNum))}`;
    } else if (fr.payloadVariant.case) {
      return t`${fg(theme.fg.secondary)("Type:")} ${fg(theme.fg.primary)(fr.payloadVariant.case.toUpperCase())}`;
    }

    return t`${fg(theme.fg.muted)("Unknown packet")}`;
  }

  private renderProtobuf() {
    const p = this.packet!;

    if (p.decodeError) {
      return t`${fg(theme.packet.encrypted)("Decode Error:")} ${p.decodeError}`;
    }

    const fr = p.fromRadio;
    if (!fr) return t`${fg(theme.fg.muted)("Empty packet")}`;

    if (fr.payloadVariant.case === "packet" && p.meshPacket) {
      const mp = p.meshPacket;
      const to = mp.to === 0xffffffff ? "^all" : formatNodeId(mp.to);
      const snr = mp.rxSnr != null ? mp.rxSnr.toFixed(2) : "-";
      const rssi = mp.rxRssi ? mp.rxRssi.toString() : "-";

      if (mp.payloadVariant.case === "decoded") {
        const decoded = mp.payloadVariant.value;
        const portName = Portnums.PortNum[decoded.portnum] || `PORT_${decoded.portnum}`;
        return t`${fg(theme.fg.accent)("FromRadio")}
${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("id:")} ${fg(theme.fg.primary)(fr.id.toString())}
${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)("packet:")} ${fg(theme.fg.accent)("MeshPacket")}
   ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("from:")} ${fg(theme.fg.primary)(mp.from.toString())} ${fg(theme.fg.muted)(`(${formatNodeId(mp.from)})`)}
   ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("to:")} ${fg(theme.fg.primary)(mp.to.toString())} ${fg(theme.fg.muted)(`(${to})`)}
   ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("rx_snr:")} ${fg(theme.fg.primary)(snr)}
   ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("rx_rssi:")} ${fg(theme.fg.primary)(rssi)}
   ${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)("decoded:")} ${fg(theme.fg.accent)("Data")}
      ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("portnum:")} ${fg(theme.fg.primary)(portName)}
      ${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)("payload:")} ${fg(theme.fg.primary)(`[${decoded.payload.length} bytes]`)}`;
      } else if (mp.payloadVariant.case === "encrypted") {
        return t`${fg(theme.fg.accent)("FromRadio")}
${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("id:")} ${fg(theme.fg.primary)(fr.id.toString())}
${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)("packet:")} ${fg(theme.fg.accent)("MeshPacket")}
   ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("from:")} ${fg(theme.fg.primary)(mp.from.toString())} ${fg(theme.fg.muted)(`(${formatNodeId(mp.from)})`)}
   ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("to:")} ${fg(theme.fg.primary)(mp.to.toString())} ${fg(theme.fg.muted)(`(${to})`)}
   ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("rx_snr:")} ${fg(theme.fg.primary)(snr)}
   ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("rx_rssi:")} ${fg(theme.fg.primary)(rssi)}
   ${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)("encrypted:")} ${fg(theme.packet.encrypted)(`[${mp.payloadVariant.value.length} bytes]`)}`;
      }

      return t`${fg(theme.fg.accent)("FromRadio")}
${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("id:")} ${fg(theme.fg.primary)(fr.id.toString())}
${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)("packet:")} ${fg(theme.fg.accent)("MeshPacket")}
   ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("from:")} ${fg(theme.fg.primary)(mp.from.toString())} ${fg(theme.fg.muted)(`(${formatNodeId(mp.from)})`)}
   ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("to:")} ${fg(theme.fg.primary)(mp.to.toString())} ${fg(theme.fg.muted)(`(${to})`)}
   ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("rx_snr:")} ${fg(theme.fg.primary)(snr)}
   ${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)("rx_rssi:")} ${fg(theme.fg.primary)(rssi)}`;
    } else if (fr.payloadVariant.case === "nodeInfo") {
      const info = fr.payloadVariant.value as Mesh.NodeInfo;
      const hwModel = info.user?.hwModel != null ? Mesh.HardwareModel[info.user.hwModel] || `MODEL_${info.user.hwModel}` : "unknown";
      return t`${fg(theme.fg.accent)("FromRadio")}
${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("id:")} ${fg(theme.fg.primary)(fr.id.toString())}
${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)("nodeInfo:")} ${fg(theme.fg.accent)("NodeInfo")}
   ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("num:")} ${fg(theme.fg.primary)(info.num.toString())} ${fg(theme.fg.muted)(`(${formatNodeId(info.num)})`)}
   ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("lastHeard:")} ${fg(theme.fg.primary)(info.lastHeard.toString())}
   ${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)("user:")} ${fg(theme.fg.accent)("User")}
      ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("shortName:")} ${fg(theme.fg.primary)(info.user?.shortName || "-")}
      ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("longName:")} ${fg(theme.fg.primary)(info.user?.longName || "-")}
      ${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)("hwModel:")} ${fg(theme.fg.primary)(hwModel)}`;
    } else if (fr.payloadVariant.case === "config") {
      const config = fr.payloadVariant.value as Mesh.Config;
      return t`${fg(theme.fg.accent)("FromRadio")}
${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("id:")} ${fg(theme.fg.primary)(fr.id.toString())}
${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)("config:")} ${fg(theme.fg.accent)("Config")}
   ${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)(config.payloadVariant.case || "unknown")}`;
    } else if (fr.payloadVariant.case === "moduleConfig") {
      const config = fr.payloadVariant.value as Mesh.ModuleConfig;
      return t`${fg(theme.fg.accent)("FromRadio")}
${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("id:")} ${fg(theme.fg.primary)(fr.id.toString())}
${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)("moduleConfig:")} ${fg(theme.fg.accent)("ModuleConfig")}
   ${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)(config.payloadVariant.case || "unknown")}`;
    } else if (fr.payloadVariant.case === "channel") {
      const channel = fr.payloadVariant.value as Mesh.Channel;
      const role = Channel.Channel_Role[channel.role] || `ROLE_${channel.role}`;
      return t`${fg(theme.fg.accent)("FromRadio")}
${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("id:")} ${fg(theme.fg.primary)(fr.id.toString())}
${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)("channel:")} ${fg(theme.fg.accent)("Channel")}
   ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("index:")} ${fg(theme.fg.primary)(channel.index.toString())}
   ${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("role:")} ${fg(theme.fg.primary)(role)}
   ${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)("name:")} ${fg(theme.fg.primary)(channel.settings?.name || "-")}`;
    } else if (fr.payloadVariant.case === "myInfo") {
      const myInfo = fr.payloadVariant.value as Mesh.MyNodeInfo;
      return t`${fg(theme.fg.accent)("FromRadio")}
${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("id:")} ${fg(theme.fg.primary)(fr.id.toString())}
${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)("myInfo:")} ${fg(theme.fg.accent)("MyNodeInfo")}
   ${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)("myNodeNum:")} ${fg(theme.fg.primary)(myInfo.myNodeNum.toString())} ${fg(theme.fg.muted)(`(${formatNodeId(myInfo.myNodeNum)})`)}`;
    } else if (fr.payloadVariant.case) {
      return t`${fg(theme.fg.accent)("FromRadio")}
${fg(theme.fg.muted)("├─")} ${fg(theme.fg.secondary)("id:")} ${fg(theme.fg.primary)(fr.id.toString())}
${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)(fr.payloadVariant.case)}`;
    }

    return t`${fg(theme.fg.accent)("FromRadio")}
${fg(theme.fg.muted)("└─")} ${fg(theme.fg.secondary)("id:")} ${fg(theme.fg.primary)(fr.id.toString())}`;
  }

  private renderHex() {
    const p = this.packet!;
    const hexLines = formatHexDump(p.raw);
    return t`${fg(theme.fg.primary)(hexLines.join("\n"))}`;
  }
}
