import { prisma } from "@/lib/prisma";
import { MENU_IMPORT_MAX_PROCESS_ATTEMPTS } from "@/lib/menu-import/constants";
import { userFacingImportError } from "@/lib/menu-import/errors";
import { getMenuImportExtractor } from "@/lib/menu-import/extractor";
import { LocalTextMenuImportExtractor } from "@/lib/menu-import/providers/local-text";
import { serializeDraft } from "@/lib/menu-import/draft";
import { importAuditMetadata } from "@/lib/menu-import/public";
import type { MenuImportDraft, MenuImportExtractPage, MenuImportSourceMeta } from "@/lib/menu-import/types";
import { getMenuMediaStorage } from "@/lib/menu-media/storage";
import { isManagedMenuImportSourceKey } from "@/lib/menu-media/keys";
import { AUDIT_ACTION, AUDIT_CATEGORY, AUDIT_EVENT_KIND, AUDIT_SEVERITY } from "@/platform/forensics/constants";
import { tryAppendPlatformAuditEvent } from "@/platform/forensics/platform-audit-service";
import { setForensicResource } from "@/platform/forensics/request-context";

function parseSourceMeta(json: string | null | undefined): MenuImportSourceMeta {
  if (!json) return { files: [] };
  try {
    const parsed = JSON.parse(json) as MenuImportSourceMeta;
    if (!parsed || !Array.isArray(parsed.files)) return { files: [] };
    return {
      files: parsed.files.filter((file) => file && isManagedMenuImportSourceKey(file.key)),
    };
  } catch {
    return { files: [] };
  }
}

async function markFailed(importId: string, restaurantId: string, code: string, error?: unknown) {
  const row = await prisma.menuImport.update({
    where: { id: importId },
    data: {
      status: "FAILED",
      errorCode: code,
      errorMessage: userFacingImportError(code, error instanceof Error ? error.message : null),
      processedAt: new Date(),
    },
  });
  setForensicResource({ type: "MenuImport", id: row.id, label: "menu-import" });
  await tryAppendPlatformAuditEvent({
    eventKind: AUDIT_EVENT_KIND.ACTION,
    severity: AUDIT_SEVERITY.WARN,
    category: AUDIT_CATEGORY.MENU,
    action: AUDIT_ACTION.MENU_IMPORT_FAILED,
    outcome: "FAILED",
    restaurantId,
    resourceType: "MenuImport",
    resourceId: row.id,
    resourceLabel: "menu-import",
    errorCode: code,
    metadata: importAuditMetadata({ ...row, extra: { errorCode: code } }),
  });
  return row;
}

async function buildExtractPages(row: {
  sourceType: string;
  sourceMetaJson: string | null;
}): Promise<MenuImportExtractPage[]> {
  const storage = getMenuMediaStorage();
  const meta = parseSourceMeta(row.sourceMetaJson);
  const pages: MenuImportExtractPage[] = [];

  if (row.sourceType === "PDF") {
    const file = meta.files[0];
    if (!file) throw new Error("UNSUPPORTED_FILE");
    const bytes = await storage.getObject(file.key);
    if (!bytes) throw new Error("UNSUPPORTED_FILE");
    const { inspectPdf } = await import("./pdf");
    const inspected = await inspectPdf(bytes);
    let renderPdfPage: ((source: Buffer, pageNumber: number) => Promise<Buffer>) | null = null;
    for (const page of inspected.pages) {
      if (page.usableText) {
        pages.push({ pageNumber: page.pageNumber, kind: "text", text: page.text });
        continue;
      }
      if (!renderPdfPage) {
        ({ renderPdfPage } = await import("./pdf-render"));
      }
      const image = await renderPdfPage(bytes, page.pageNumber);
      pages.push({
        pageNumber: page.pageNumber,
        kind: "image",
        image: { bytes: image, contentType: "image/jpeg" },
      });
    }
    return pages;
  }

  const ordered = [...meta.files].sort((a, b) => a.pageNumber - b.pageNumber);
  for (const file of ordered) {
    const bytes = await storage.getObject(file.key);
    if (!bytes) throw new Error("UNSUPPORTED_FILE");
    pages.push({
      pageNumber: file.pageNumber,
      kind: "image",
      image: { bytes, contentType: file.contentType },
    });
  }
  return pages;
}

export async function processMenuImportById(importId: string) {
  const existing = await prisma.menuImport.findUnique({ where: { id: importId } });
  if (!existing) return null;
  if (existing.status === "READY_FOR_REVIEW" || existing.status === "APPLIED" || existing.status === "CANCELLED") {
    return existing;
  }
  if (existing.status === "PROCESSING") return existing;
  if (existing.processingAttempt >= MENU_IMPORT_MAX_PROCESS_ATTEMPTS && existing.status === "FAILED") {
    return existing;
  }

  const claimed = await prisma.menuImport.updateMany({
    where: { id: importId, status: { in: ["UPLOADED", "FAILED"] } },
    data: {
      status: "PROCESSING",
      errorCode: null,
      errorMessage: null,
      processingAttempt: { increment: 1 },
    },
  });
  if (claimed.count !== 1) {
    return prisma.menuImport.findUnique({ where: { id: importId } });
  }

  const row = await prisma.menuImport.findUnique({ where: { id: importId } });
  if (!row || row.status !== "PROCESSING") return row;

  const { extractor, config } = getMenuImportExtractor();

  try {
    const pages = await buildExtractPages(row);
    if (!pages.length) {
      return markFailed(row.id, row.restaurantId, "UNSUPPORTED_FILE");
    }
    const textPages = pages.filter((page) => page.kind === "text");
    const imagePages = pages.filter((page) => page.kind === "image");
    let draft: MenuImportDraft;
    if (extractor && config.configured) {
      draft = await extractor.extractMenu({ pages });
    } else if (textPages.length) {
      draft = await new LocalTextMenuImportExtractor().extractMenu({ pages: textPages });
      if (!draft.categories.length) {
        return markFailed(
          row.id,
          row.restaurantId,
          imagePages.length ? "IMAGE_EXTRACTION_NOT_CONFIGURED" : "PROVIDER_INVALID_OUTPUT",
        );
      }
    } else {
      return markFailed(row.id, row.restaurantId, "IMAGE_EXTRACTION_NOT_CONFIGURED");
    }
    const stillOurs = await prisma.menuImport.updateMany({
      where: { id: row.id, status: "PROCESSING" },
      data: {
        status: "READY_FOR_REVIEW",
        draftJson: serializeDraft(draft),
        pageCount: pages.length,
        errorCode: null,
        errorMessage: null,
        processedAt: new Date(),
      },
    });
    if (stillOurs.count !== 1) {
      return prisma.menuImport.findUnique({ where: { id: row.id } });
    }
    const ready = await prisma.menuImport.findUnique({ where: { id: row.id } });
    if (!ready) return ready;
    setForensicResource({ type: "MenuImport", id: ready.id, label: "menu-import" });
    await tryAppendPlatformAuditEvent({
      category: AUDIT_CATEGORY.MENU,
      action: AUDIT_ACTION.MENU_IMPORT_PROCESSED,
      restaurantId: ready.restaurantId,
      resourceType: "MenuImport",
      resourceId: ready.id,
      resourceLabel: "menu-import",
      metadata: importAuditMetadata(ready),
    });
    return ready;
  } catch (error) {
    const code =
      error instanceof Error && /TIMEOUT/i.test(error.message)
        ? "PROVIDER_TIMEOUT"
        : error instanceof Error && /INVALID_DRAFT|INVALID_OUTPUT/i.test(error.message)
          ? "PROVIDER_INVALID_OUTPUT"
          : error instanceof Error && "code" in error
            ? String((error as { code: string }).code)
            : "PROVIDER_FAILED";
    const safeCode = [
      "EXTRACTION_NOT_CONFIGURED",
      "IMAGE_EXTRACTION_NOT_CONFIGURED",
      "UNSUPPORTED_FILE",
      "ENCRYPTED_PDF",
      "PROVIDER_FAILED",
      "PROVIDER_INVALID_OUTPUT",
      "PROVIDER_TIMEOUT",
    ].includes(code)
      ? code
      : "PROVIDER_FAILED";
    return markFailed(row.id, row.restaurantId, safeCode, error);
  }
}

export async function processMenuImportJob(importId: string) {
  await processMenuImportById(importId);
}
