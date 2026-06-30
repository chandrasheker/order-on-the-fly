const PRINTER_WIDTH = 384;

function absoluteImageUrl(url: string, origin?: string) {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) {
    if (origin) return new URL(url, origin).toString();
    if (typeof window !== "undefined") {
      return new URL(url, window.location.origin).toString();
    }
  }
  return url;
}

function proxyLogoUrl(absoluteUrl: string) {
  if (typeof window === "undefined") return absoluteUrl;
  if (absoluteUrl.startsWith(window.location.origin)) {
    return absoluteUrl;
  }
  return `/api/receipt/logo?url=${encodeURIComponent(absoluteUrl)}`;
}

export async function logoToEscPosRaster(
  logoUrl: string | null,
  maxWidth = PRINTER_WIDTH,
  origin?: string
) {
  if (!logoUrl) return null;

  const candidates = [
    logoUrl,
    absoluteImageUrl(logoUrl, origin),
  ].filter(Boolean);

  const unique = [...new Set(candidates)];

  for (const candidate of unique) {
    const sources = [
      candidate.startsWith("data:") ? candidate : proxyLogoUrl(candidate),
      candidate,
    ];

    for (const src of [...new Set(sources)]) {
      try {
        const image = await loadImage(src);
        return rasterizeImage(image, maxWidth);
      } catch {
        // try next source
      }
    }
  }

  return null;
}

function rasterizeImage(image: HTMLImageElement, maxWidth: number) {
  const scale = Math.min(1, maxWidth / image.width);
  const width = Math.max(1, Math.floor(image.width * scale));
  const height = Math.max(1, Math.floor(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  const { data } = ctx.getImageData(0, 0, width, height);
  const widthBytes = Math.ceil(width / 8);
  const raster = new Uint8Array(widthBytes * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha < 32) continue;
      const luminance = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      if (luminance < 180) {
        const byteIndex = y * widthBytes + Math.floor(x / 8);
        const bit = 7 - (x % 8);
        raster[byteIndex] |= 1 << bit;
      }
    }
  }

  return { data: raster, widthBytes, height };
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load logo image"));
    image.src = src;
  });
}
