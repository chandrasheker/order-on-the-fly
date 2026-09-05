import path from "node:path";
import { createRequire } from "node:module";
import { PDFDocument } from "pdf-lib";
import {
  MENU_IMPORT_PDF_MAX_RENDER_EDGE,
  MENU_IMPORT_PDF_MIN_TEXT_CHARS,
  MENU_IMPORT_UNSUPPORTED_MESSAGE,
} from "@/lib/menu-import/constants";
import { MenuImportValidationError } from "@/lib/menu-import/errors";

export type PdfPageText = {
  pageNumber: number;
  text: string;
  usableText: boolean;
};

export type InspectedPdf = {
  pageCount: number;
  encrypted: boolean;
  pages: PdfPageText[];
};

type PdfjsModule = {
  getDocument: (src: Record<string, unknown>) => { promise: Promise<PdfjsDocument> };
  GlobalWorkerOptions: { workerSrc: string };
};

type PdfjsDocument = {
  numPages: number;
  isEncrypted?: boolean;
  getPage: (pageNumber: number) => Promise<PdfjsPage>;
  destroy?: () => Promise<void>;
};

type PdfjsPage = {
  getViewport: (params: { scale: number }) => { width: number; height: number };
  getTextContent: () => Promise<{
    items: Array<{ str?: string; hasEOL?: boolean; transform?: number[] }>;
  }>;
  render: (params: { canvasContext: unknown; viewport: { width: number; height: number } }) => {
    promise: Promise<void>;
  };
  cleanup?: () => void;
};

function textFromPdfItems(items: Array<{ str?: string; hasEOL?: boolean; transform?: number[] }>) {
  const rows = new Map<number, Array<{ x: number; text: string }>>();
  for (const item of items) {
    const text = item.str ?? "";
    if (!text) continue;
    const y = Math.round((item.transform?.[5] ?? 0) / 4) * 4;
    const x = item.transform?.[4] ?? 0;
    const row = rows.get(y) ?? [];
    row.push({ x, text });
    rows.set(y, row);
  }
  if (rows.size > 0) {
    return [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) =>
        parts
          .sort((a, b) => a.x - b.x)
          .map((part) => part.text)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean)
      .join("\n");
  }
  return items
    .map((item) => `${item.str ?? ""}${item.hasEOL ? "\n" : " "}`)
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function usableText(text: string) {
  return (text.match(/[A-Za-z0-9]/g) ?? []).length >= MENU_IMPORT_PDF_MIN_TEXT_CHARS;
}

async function loadPdfjs(): Promise<PdfjsModule> {
  const mod = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfjsModule;
  // File path avoids webpack trying to bundle the ESM worker via require.resolve.
  mod.GlobalWorkerOptions.workerSrc = path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "legacy",
    "build",
    "pdf.worker.mjs",
  );
  return mod;
}

type NativeCanvas = {
  createCanvas: (width: number, height: number) => {
    getContext: (id: "2d") => unknown;
    width: number;
    height: number;
    toBuffer: (mime: "image/jpeg" | "image/png", quality?: number) => Buffer;
  };
};

function loadNativeCanvas(): NativeCanvas {
  const req = createRequire(path.join(process.cwd(), "package.json"));
  return req("@napi-rs/" + "canvas") as NativeCanvas;
}

class NodeCanvasFactory {
  private readonly createCanvas = loadNativeCanvas().createCanvas;

  create(width: number, height: number) {
    const canvas = this.createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(canvasAndContext: { canvas: { width: number; height: number } }, width: number, height: number) {
    canvasAndContext.canvas.width = Math.max(1, Math.ceil(width));
    canvasAndContext.canvas.height = Math.max(1, Math.ceil(height));
  }
  destroy(canvasAndContext: { canvas: { width: number; height: number } }) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
  }
}

export async function inspectPdf(bytes: Buffer): Promise<InspectedPdf> {
  if (!Buffer.isBuffer(bytes) || bytes.length < 5 || bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new MenuImportValidationError("UNSUPPORTED_FILE", MENU_IMPORT_UNSUPPORTED_MESSAGE);
  }

  const tail = bytes.subarray(Math.max(0, bytes.length - 4096)).toString("latin1");
  if (/\/Encrypt\s+(\d+\s+\d+\s+R|<)/.test(tail)) {
    return { pageCount: 0, encrypted: true, pages: [] };
  }

  try {
    const loaded = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
    if (loaded.isEncrypted) {
      return { pageCount: loaded.getPageCount(), encrypted: true, pages: [] };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/password|encrypt/i.test(message)) {
      return { pageCount: 0, encrypted: true, pages: [] };
    }
    throw new MenuImportValidationError("UNSUPPORTED_FILE", MENU_IMPORT_UNSUPPORTED_MESSAGE);
  }

  let pdf: PdfjsDocument | null = null;
  try {
    const pdfjs = await loadPdfjs();
    pdf = await pdfjs.getDocument({
      data: new Uint8Array(bytes),
      disableFontFace: true,
      isEvalSupported: false,
      useSystemFonts: true,
      disableAutoFetch: true,
      disableStream: true,
      verbosity: 0,
    }).promise;
    if (pdf.isEncrypted) {
      return { pageCount: pdf.numPages, encrypted: true, pages: [] };
    }

    const pages: PdfPageText[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = textFromPdfItems(content.items);
      pages.push({ pageNumber, text, usableText: usableText(text) });
      page.cleanup?.();
    }
    return { pageCount: pdf.numPages, encrypted: false, pages };
  } catch (error) {
    if (error instanceof MenuImportValidationError) throw error;
    throw new MenuImportValidationError("UNSUPPORTED_FILE", MENU_IMPORT_UNSUPPORTED_MESSAGE);
  } finally {
    await pdf?.destroy?.().catch(() => undefined);
  }
}

export async function renderPdfPage(bytes: Buffer, pageNumber: number): Promise<Buffer> {
  const pdfjs = await loadPdfjs();
  const canvasFactory = new NodeCanvasFactory();
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
    disableAutoFetch: true,
    disableStream: true,
    verbosity: 0,
    canvasFactory,
  }).promise;
  try {
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1.2, MENU_IMPORT_PDF_MAX_RENDER_EDGE / Math.max(base.width, base.height, 1));
    const viewport = page.getViewport({ scale });
    const created = canvasFactory.create(viewport.width, viewport.height);
    await page.render({ canvasContext: created.context, viewport }).promise;
    const jpeg = created.canvas.toBuffer("image/jpeg", 75);
    canvasFactory.destroy(created);
    page.cleanup?.();
    return jpeg;
  } finally {
    await pdf.destroy?.().catch(() => undefined);
  }
}
