import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { MENU_MEDIA_MAX_INPUT_PIXELS } from "@/lib/menu-media/constants";

type ImageOcrFn = (bytes: Buffer) => Promise<string>;

let override: ImageOcrFn | null = null;
let workerPromise: Promise<{
  recognize: (image: Buffer) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<void>;
}> | null = null;

export function setMenuImageOcrForTests(fn: ImageOcrFn | null) {
  override = fn;
}

export function resetMenuImageOcrForTests() {
  override = null;
}

async function prepareImageForOcr(bytes: Buffer) {
  try {
    return await sharp(bytes, {
      failOn: "error",
      limitInputPixels: MENU_MEDIA_MAX_INPUT_PIXELS,
    })
      .rotate()
      .grayscale()
      .normalize()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: false })
      .png()
      .toBuffer();
  } catch {
    return bytes;
  }
}

async function loadTesseractWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const tes = (await import(
        /* webpackIgnore: true */ "tesseract.js"
      )) as unknown as {
        createWorker: (
          lang?: string,
          oem?: number,
          options?: { cachePath?: string },
        ) => Promise<{
          recognize: (image: Buffer) => Promise<{ data: { text: string } }>;
          terminate: () => Promise<void>;
        }>;
      };
      return tes.createWorker("eng", 1, {
        cachePath: path.join(os.tmpdir(), "tabletap-tesseract"),
      });
    })().catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

export async function recognizeMenuImageText(bytes: Buffer): Promise<string> {
  if (override) return override(bytes);
  try {
    const prepared = await prepareImageForOcr(bytes);
    const worker = await loadTesseractWorker();
    const result = await worker.recognize(prepared);
    return String(result.data?.text ?? "").trim();
  } catch {
    return "";
  }
}
