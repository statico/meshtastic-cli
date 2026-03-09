import _stringWidth from "string-width";

// Keycap sequences (digit/symbol + U+20E3) render as 2 cells in terminals,
// but string-width reports them as 1 when the VS16 (U+FE0F) is absent.
const KEYCAP = /\u20E3/;

export function stringWidth(str: string): number {
  let width = 0;
  for (const { segment } of new Intl.Segmenter().segment(str)) {
    let w = _stringWidth(segment);
    if (w < 2 && KEYCAP.test(segment)) w = 2;
    width += w;
  }
  return width;
}

// Truncate string to fit within maxWidth visual columns
export function truncateVisual(str: string, maxWidth: number): string {
  let width = 0;
  let result = "";
  for (const { segment: char } of new Intl.Segmenter().segment(str)) {
    let charWidth = _stringWidth(char);
    if (charWidth < 2 && KEYCAP.test(char)) charWidth = 2;
    if (width + charWidth > maxWidth) break;
    result += char;
    width += charWidth;
  }
  return result;
}

// Pad string to target visual width with spaces
export function padEndVisual(str: string, targetWidth: number): string {
  const currentWidth = stringWidth(str);
  if (currentWidth >= targetWidth) return str;
  return str + " ".repeat(targetWidth - currentWidth);
}

// Truncate and pad to exact visual width
export function fitVisual(str: string, width: number): string {
  return padEndVisual(truncateVisual(str, width), width);
}
