import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  MENU_IMPORT_PDF_MAX_RENDER_EDGE,
} from "@/lib/menu-import/constants";

type PdfjsModule = {
  getDocument: (src: Record<string, unknown>) => { promise: Promise<PdfjsDocument> };
  GlobalWorkerOptions: { workerSrc: string };
};

type PdfjsDocument = {
  getPage: (pageNumber: number) => Promise<PdfjsPage>;
  destroy?: () => Promise<void>;
};

type PdfjsPage = {
  getViewport: (params: { scale: number }) => { width: number; height: number };
  render: (params: { canvasContext: unknown; viewport: { width: number; height: number } }) => {
    promise: Promise<void>;
  };
  cleanup?: () => void;
};

type NativeCanvasModule = {
  createCanvas: (width: number, height: number) => {
    getContext: (id: "2d") => unknown;
    width: number;
    height: number;
    toBuffer: (mime: "image/jpeg" | "image/png", quality?: number) => Buffer;
  };
};

async function loadPdfjs(): Promise<PdfjsModule> {
  const mod = (await import(
    /* webpackIgnore: true */ "pdfjs-dist/legacy/build/pdf.mjs"
  )) as unknown as PdfjsModule;
  const workerPath = path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "legacy",
    "build",
    "pdf.worker.mjs",
  );
  mod.GlobalWorkerOptions.workerSrc = fs.existsSync(workerPath) ? pathToFileURL(workerPath).href : "";
  return mod;
}

async function loadNativeCanvas(): Promise<NativeCanvasModule> {
  return import(/* webpackIgnore: true */ "@napi-rs/canvas") as Promise<NativeCanvasModule>;
}

class NodeCanvasFactory {
  constructor(private readonly createCanvas: NativeCanvasModule["createCanvas"]) {}

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

export async function renderPdfPage(bytes: Buffer, pageNumber: number): Promise<Buffer> {
  const [{ createCanvas }, pdfjs] = await Promise.all([loadNativeCanvas(), loadPdfjs()]);
  const canvasFactory = new NodeCanvasFactory(createCanvas);
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
