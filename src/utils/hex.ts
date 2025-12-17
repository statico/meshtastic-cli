export function formatHexDump(data: Uint8Array, bytesPerLine = 16): string[] {
  const lines: string[] = [];
  for (let i = 0; i < data.length; i += bytesPerLine) {
    const offset = i.toString(16).padStart(4, "0").toUpperCase();
    const bytes = Array.from(data.slice(i, i + bytesPerLine));
    const hex = bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
    const ascii = bytes.map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".")).join("");
    lines.push(`${offset}  ${hex.padEnd(bytesPerLine * 3 - 1)}  ${ascii}`);
  }
  return lines;
}

export function formatNodeId(id: number): string {
  return `!${id.toString(16).padStart(8, "0")}`;
}
