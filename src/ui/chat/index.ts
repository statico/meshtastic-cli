import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  InputRenderable,
  type CliRenderer,
  t,
  fg,
  bold,
} from "@opentui/core";
import { theme } from "../theme";
import type { NodeStore } from "../../protocol/node-store";
import * as db from "../../db";

interface ChatMessage {
  id?: number;
  fromNode: number;
  toNode: number;
  channel: number;
  text: string;
  timestamp: number;
  rxSnr?: number;
}

export class ChatPanel {
  private renderer: CliRenderer;
  private nodeStore: NodeStore;
  private container: BoxRenderable;
  private channelBar: BoxRenderable;
  private messageList: ScrollBoxRenderable;
  private inputBox: BoxRenderable;
  private input: InputRenderable;
  private currentChannel = 0;
  private messages: ChatMessage[] = [];
  private onSend?: (channel: number, text: string) => void;

  constructor(renderer: CliRenderer, nodeStore: NodeStore) {
    this.renderer = renderer;
    this.nodeStore = nodeStore;

    this.container = new BoxRenderable(renderer, {
      id: "chat-panel",
      width: "100%",
      flexGrow: 1,
      flexDirection: "column",
    });

    this.channelBar = new BoxRenderable(renderer, {
      id: "channel-bar",
      width: "100%",
      height: 1,
      backgroundColor: theme.bg.panel,
      flexDirection: "row",
      paddingLeft: 1,
    });

    this.messageList = new ScrollBoxRenderable(renderer, {
      id: "message-list",
      rootOptions: { backgroundColor: theme.bg.primary, flexGrow: 1, border: true, borderColor: theme.border.normal },
      viewportOptions: { backgroundColor: theme.bg.primary },
      contentOptions: { backgroundColor: theme.bg.primary, paddingLeft: 1 },
    });

    this.inputBox = new BoxRenderable(renderer, {
      id: "chat-input-box",
      width: "100%",
      height: 3,
      backgroundColor: theme.bg.panel,
      border: true,
      borderColor: theme.border.normal,
      paddingLeft: 1,
    });

    this.input = new InputRenderable(renderer, {
      id: "chat-input",
      width: "100%",
      placeholder: "Type message...",
      placeholderFg: theme.fg.muted,
      fg: theme.fg.primary,
      cursorColor: theme.fg.accent,
    });

    this.inputBox.add(this.input);
    this.container.add(this.channelBar);
    this.container.add(this.messageList);
    this.container.add(this.inputBox);

    this.updateChannelBar();
    this.loadMessages();
  }

  get element(): BoxRenderable {
    return this.container;
  }

  get inputElement(): InputRenderable {
    return this.input;
  }

  setSendHandler(handler: (channel: number, text: string) => void) {
    this.onSend = handler;
  }

  setChannel(channel: number) {
    this.currentChannel = channel;
    this.updateChannelBar();
    this.loadMessages();
  }

  nextChannel() {
    this.setChannel((this.currentChannel + 1) % 8);
  }

  prevChannel() {
    this.setChannel((this.currentChannel + 7) % 8);
  }

  addMessage(msg: ChatMessage) {
    if (msg.channel === this.currentChannel) {
      this.messages.push(msg);
      this.renderMessage(msg);
      this.messageList.scrollTo(0, this.messageList.scrollHeight);
    }
  }

  sendCurrentMessage() {
    const text = this.input.value.trim();
    if (text && this.onSend) {
      this.onSend(this.currentChannel, text);
      this.input.value = "";
    }
  }

  focusInput() {
    this.input.focus();
  }

  private updateChannelBar() {
    for (const child of this.channelBar.getChildren()) {
      this.channelBar.remove(child.id);
    }

    const channels = [0, 1, 2, 3, 4, 5, 6, 7];
    for (const ch of channels) {
      const isActive = ch === this.currentChannel;
      const label = ch === 0 ? "Primary" : `Ch ${ch}`;
      const text = new TextRenderable(this.renderer, {
        content: isActive
          ? t`${bold(fg(theme.fg.accent)(`[${label}]`))} `
          : t`${fg(theme.fg.muted)(`[${label}]`)} `,
      });
      this.channelBar.add(text);
    }
  }

  private loadMessages() {
    this.messages = db.getMessages(this.currentChannel, 100) as ChatMessage[];
    this.renderAllMessages();
  }

  private renderAllMessages() {
    for (const child of this.messageList.getChildren()) {
      this.messageList.remove(child.id);
    }

    for (const msg of this.messages) {
      this.renderMessage(msg);
    }

    this.messageList.scrollTo(0, this.messageList.scrollHeight);
  }

  private renderMessage(msg: ChatMessage) {
    const row = new BoxRenderable(this.renderer, {
      id: `msg-${msg.id || Date.now()}`,
      width: "100%",
      minHeight: 1,
      backgroundColor: theme.bg.primary,
    });

    const time = new Date(msg.timestamp * 1000).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
    const fromName = this.nodeStore.getNodeName(msg.fromNode);
    const snr = msg.rxSnr !== undefined ? ` [${msg.rxSnr.toFixed(1)}dB]` : "";

    const text = new TextRenderable(this.renderer, {
      content: t`${fg(theme.fg.muted)(`[${time}]`)} ${fg(theme.fg.accent)(fromName)}${fg(theme.fg.muted)(snr)}: ${fg(theme.fg.primary)(msg.text)}`,
    });

    row.add(text);
    this.messageList.add(row);
  }
}
