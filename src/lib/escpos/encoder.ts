const ESC = 0x1b;
const GS = 0x1d;

export class EscPosEncoder {
  private chunks: Uint8Array[] = [];

  raw(bytes: Uint8Array) {
    this.chunks.push(bytes);
    return this;
  }

  init() {
    return this.raw(new Uint8Array([ESC, 0x40]));
  }

  align(mode: "left" | "center" | "right") {
    const value = mode === "center" ? 1 : mode === "right" ? 2 : 0;
    return this.raw(new Uint8Array([ESC, 0x61, value]));
  }

  bold(on = true) {
    return this.raw(new Uint8Array([ESC, 0x45, on ? 1 : 0]));
  }

  size(width = 1, height = 1) {
    const n = ((width - 1) << 4) | (height - 1);
    return this.raw(new Uint8Array([GS, 0x21, n]));
  }

  text(value: string) {
    return this.raw(new TextEncoder().encode(value));
  }

  line(value = "") {
    return this.text(`${value}\n`);
  }

  feed(lines = 1) {
    const count = Math.max(0, Math.min(255, Math.round(Number(lines) || 0)));
    return this.raw(new Uint8Array([ESC, 0x64, count]));
  }

  cut(partial = true) {
    return this.raw(new Uint8Array([GS, 0x56, partial ? 1 : 0]));
  }

  rasterImage(data: Uint8Array, widthBytes: number, height: number) {
    const header = new Uint8Array([
      GS,
      0x76,
      0x30,
      0x00,
      widthBytes & 0xff,
      (widthBytes >> 8) & 0xff,
      height & 0xff,
      (height >> 8) & 0xff,
    ]);
    const merged = new Uint8Array(header.length + data.length);
    merged.set(header);
    merged.set(data, header.length);
    return this.raw(merged);
  }

  build() {
    const total = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

export function padLine(left: string, right: string, width = 32) {
  const gap = Math.max(1, width - left.length - right.length);
  const trimmedLeft = left.length + right.length + 1 > width
    ? left.slice(0, Math.max(1, width - right.length - 1))
    : left;
  return `${trimmedLeft}${" ".repeat(gap)}${right}`.slice(0, width);
}

/** Cheap ESC/POS printers often ignore ESC a; center by padding spaces instead. */
export function centerPad(text: string, width = 32) {
  const s = String(text ?? "").slice(0, Math.max(1, width));
  const pad = Math.max(0, Math.floor((width - s.length) / 2));
  return `${" ".repeat(pad)}${s}`;
}

/** Thermal printers use ASCII; always show paise so CGST 1.50 is not rounded to 1. */
export function formatReceiptMoney(amount: number) {
  const paise = Math.round((Number(amount) || 0) * 100);
  const safe = Number.isFinite(paise) ? paise : 0;
  const sign = safe < 0 ? "-" : "";
  return `${sign}Rs.${(Math.abs(safe) / 100).toFixed(2)}`;
}

export function wrapText(text: string, width = 32) {
  const maxWidth = Math.max(1, width);
  const paragraphs = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().length === 0 ? [] : paragraph.trim().split(/\s+/);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    const flush = () => {
      if (current) {
        lines.push(current);
        current = "";
      }
    };
    for (const word of words) {
      if (word.length > maxWidth) {
        flush();
        for (let i = 0; i < word.length; i += maxWidth) {
          const chunk = word.slice(i, i + maxWidth);
          if (chunk.length === maxWidth && i + maxWidth < word.length) {
            lines.push(chunk);
          } else {
            current = chunk;
          }
        }
        continue;
      }
      const next = current ? `${current} ${word}` : word;
      if (next.length <= maxWidth) {
        current = next;
      } else {
        flush();
        current = word;
      }
    }
    flush();
  }

  return lines;
}
