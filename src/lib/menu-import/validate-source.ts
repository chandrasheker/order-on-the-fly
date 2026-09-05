import sharp from "sharp";
import {
  MENU_IMPORT_MAX_FILE_BYTES,
  MENU_IMPORT_MAX_FILES,
  MENU_IMPORT_MAX_PAGES,
  MENU_IMPORT_MAX_TOTAL_BYTES,
  MENU_IMPORT_UNSUPPORTED_MESSAGE,
} from "@/lib/menu-import/constants";
import { MenuImportValidationError } from "@/lib/menu-import/errors";
import { inspectPdf, type InspectedPdf } from "@/lib/menu-import/pdf";
import { MENU_MEDIA_MAX_INPUT_PIXELS } from "@/lib/menu-media/constants";
import type { MenuImportSourceType } from "@/lib/menu-import/types";

export type IncomingImportFile = {
  originalName: string;
  bytes: Buffer;
};

export type ValidatedImportImage = {
  kind: "image";
  originalName: string;
  bytes: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  pageNumber: number;
};

export type ValidatedImportPdf = {
  kind: "pdf";
  originalName: string;
  bytes: Buffer;
  contentType: "application/pdf";
  pageCount: number;
  pdf: InspectedPdf;
};

export type ValidatedImportSource =
  | { sourceType: "PDF"; files: [ValidatedImportPdf]; pageCount: number }
  | { sourceType: "IMAGES"; files: ValidatedImportImage[]; pageCount: number };

function hasZipMagic(bytes: Buffer) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function hasPdfMagic(bytes: Buffer) {
  return bytes.length >= 5 && bytes.subarray(0, 5).toString("latin1") === "%PDF-";
}

async function decodeImportImage(bytes: Buffer): Promise<ValidatedImportImage["contentType"]> {
  let format: string | undefined;
  try {
    const metadata = await sharp(bytes, {
      animated: false,
      failOn: "error",
      limitInputPixels: MENU_MEDIA_MAX_INPUT_PIXELS,
    }).metadata();
    format = metadata.format;
    if ((metadata.pages ?? 1) > 1) {
      throw new MenuImportValidationError("UNSUPPORTED_FILE", MENU_IMPORT_UNSUPPORTED_MESSAGE);
    }
    if (!metadata.width || !metadata.height) {
      throw new MenuImportValidationError("UNSUPPORTED_FILE", MENU_IMPORT_UNSUPPORTED_MESSAGE);
    }
  } catch (error) {
    if (error instanceof MenuImportValidationError) throw error;
    throw new MenuImportValidationError("UNSUPPORTED_FILE", MENU_IMPORT_UNSUPPORTED_MESSAGE);
  }

  if (format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  throw new MenuImportValidationError("UNSUPPORTED_FILE", MENU_IMPORT_UNSUPPORTED_MESSAGE, 400);
}

export async function validateMenuImportFiles(files: IncomingImportFile[]): Promise<ValidatedImportSource> {
  if (!files.length) {
    throw new MenuImportValidationError("UNSUPPORTED_FILE", MENU_IMPORT_UNSUPPORTED_MESSAGE);
  }
  if (files.length > MENU_IMPORT_MAX_FILES) {
    throw new MenuImportValidationError("TOO_MANY_PAGES", undefined, 400);
  }

  let total = 0;
  for (const file of files) {
    if (!Buffer.isBuffer(file.bytes) || file.bytes.length <= 0) {
      throw new MenuImportValidationError("UNSUPPORTED_FILE", MENU_IMPORT_UNSUPPORTED_MESSAGE);
    }
    if (file.bytes.length > MENU_IMPORT_MAX_FILE_BYTES) {
      throw new MenuImportValidationError("FILE_TOO_LARGE", undefined, 413);
    }
    total += file.bytes.length;
    if (hasZipMagic(file.bytes)) {
      throw new MenuImportValidationError("UNSUPPORTED_FILE", MENU_IMPORT_UNSUPPORTED_MESSAGE);
    }
  }
  if (total > MENU_IMPORT_MAX_TOTAL_BYTES) {
    throw new MenuImportValidationError("PAYLOAD_TOO_LARGE", undefined, 413);
  }

  const pdfFiles = files.filter((file) => hasPdfMagic(file.bytes));
  if (pdfFiles.length && pdfFiles.length !== files.length) {
    throw new MenuImportValidationError("UNSUPPORTED_FILE", MENU_IMPORT_UNSUPPORTED_MESSAGE);
  }
  if (pdfFiles.length > 1) {
    throw new MenuImportValidationError("UNSUPPORTED_FILE", "Upload one PDF or a set of images as a single import.");
  }

  if (pdfFiles.length === 1) {
    const file = pdfFiles[0];
    const pdf = await inspectPdf(file.bytes);
    if (pdf.encrypted) {
      throw new MenuImportValidationError("ENCRYPTED_PDF");
    }
    if (pdf.pageCount < 1 || pdf.pageCount > MENU_IMPORT_MAX_PAGES) {
      throw new MenuImportValidationError("TOO_MANY_PAGES");
    }
    return {
      sourceType: "PDF" satisfies MenuImportSourceType,
      pageCount: pdf.pageCount,
      files: [
        {
          kind: "pdf",
          originalName: file.originalName,
          bytes: file.bytes,
          contentType: "application/pdf",
          pageCount: pdf.pageCount,
          pdf,
        },
      ],
    };
  }

  const images: ValidatedImportImage[] = [];
  for (const [index, file] of files.entries()) {
    const contentType = await decodeImportImage(file.bytes);
    images.push({
      kind: "image",
      originalName: file.originalName,
      bytes: file.bytes,
      contentType,
      pageNumber: index + 1,
    });
  }
  if (images.length > MENU_IMPORT_MAX_PAGES) {
    throw new MenuImportValidationError("TOO_MANY_PAGES");
  }
  return { sourceType: "IMAGES", files: images, pageCount: images.length };
}
