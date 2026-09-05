import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PDFDocument } from "pdf-lib";
import {
  MENU_IMPORT_MAX_PAGES,
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

function sliceToPdfMagic(bytes: Buffer) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 5) return null;
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return bytes;
  const head = bytes.subarray(0, Math.min(bytes.length, 1024)).toString("latin1");
  const offset = head.indexOf("%PDF-");
  if (offset < 0) return null;
  return bytes.subarray(offset);
}

function looksEncrypted(bytes: Buffer) {
  const tail = bytes.subarray(Math.max(0, bytes.length - 4096)).toString("latin1");
  return /\/Encrypt\s+(\d+\s+\d+\s+R|<)/.test(tail);
}

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

let pdfTextExtractCallsForTests = 0;

export function resetPdfTextExtractCallCountForTests() {
  pdfTextExtractCallsForTests = 0;
}

export function getPdfTextExtractCallCountForTests() {
  return pdfTextExtractCallsForTests;
}

async function pageCountWithPdfLib(bytes: Buffer) {
  const loaded = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  return { pageCount: loaded.getPageCount(), encrypted: Boolean(loaded.isEncrypted) };
}

function assertAllowedPageCount(pageCount: number) {
  if (pageCount < 1) {
    throw new MenuImportValidationError("UNSUPPORTED_FILE", MENU_IMPORT_UNSUPPORTED_MESSAGE);
  }
  if (pageCount > MENU_IMPORT_MAX_PAGES) {
    throw new MenuImportValidationError("TOO_MANY_PAGES");
  }
}

async function resolvePageCountBeforeExtract(pdfBytes: Buffer): Promise<{ pageCount: number | null; encrypted: boolean }> {
  try {
    const loaded = await PDFDocument.load(pdfBytes, { ignoreEncryption: false, updateMetadata: false });
    if (loaded.isEncrypted) {
      return { pageCount: loaded.getPageCount(), encrypted: true };
    }
    const pageCount = loaded.getPageCount();
    assertAllowedPageCount(pageCount);
    return { pageCount, encrypted: false };
  } catch (error) {
    if (error instanceof MenuImportValidationError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (/password|encrypt/i.test(message)) {
      return { pageCount: 0, encrypted: true };
    }
  }

  try {
    const fallback = await pageCountWithPdfLib(pdfBytes);
    if (fallback.encrypted) return { pageCount: fallback.pageCount, encrypted: true };
    assertAllowedPageCount(fallback.pageCount);
    return { pageCount: fallback.pageCount, encrypted: false };
  } catch (error) {
    if (error instanceof MenuImportValidationError) throw error;
    return { pageCount: null, encrypted: false };
  }
}

export async function inspectPdf(bytes: Buffer): Promise<InspectedPdf> {
  const pdfBytes = sliceToPdfMagic(bytes);
  if (!pdfBytes) {
    throw new MenuImportValidationError("UNSUPPORTED_FILE", MENU_IMPORT_UNSUPPORTED_MESSAGE);
  }

  if (looksEncrypted(pdfBytes)) {
    return { pageCount: 0, encrypted: true, pages: [] };
  }

  const counted = await resolvePageCountBeforeExtract(pdfBytes);
  if (counted.encrypted) {
    return { pageCount: counted.pageCount ?? 0, encrypted: true, pages: [] };
  }

  let pdf: PdfjsDocument | null = null;
  try {
    const pdfjs = await loadPdfjs();
    pdf = await pdfjs.getDocument({
      data: new Uint8Array(pdfBytes),
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
    assertAllowedPageCount(pdf.numPages);

    const pages: PdfPageText[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      pdfTextExtractCallsForTests += 1;
      const content = await page.getTextContent();
      const text = textFromPdfItems(content.items);
      pages.push({ pageNumber, text, usableText: usableText(text) });
      page.cleanup?.();
    }
    return { pageCount: pdf.numPages, encrypted: false, pages };
  } catch (error) {
    if (error instanceof MenuImportValidationError) throw error;
    if (counted.pageCount != null && counted.pageCount >= 1 && counted.pageCount <= MENU_IMPORT_MAX_PAGES) {
      return {
        pageCount: counted.pageCount,
        encrypted: false,
        pages: Array.from({ length: counted.pageCount }, (_, index) => ({
          pageNumber: index + 1,
          text: "",
          usableText: false,
        })),
      };
    }
    throw new MenuImportValidationError("UNSUPPORTED_FILE", MENU_IMPORT_UNSUPPORTED_MESSAGE);
  } finally {
    await pdf?.destroy?.().catch(() => undefined);
  }
}
