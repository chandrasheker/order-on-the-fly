import {
  annotateDraftDuplicates,
  applyPreviewFromDraft,
  draftItemCount,
  parseStoredDraft,
} from "@/lib/menu-import/draft";
import { userFacingImportError } from "@/lib/menu-import/errors";
import type { MenuImportApplyResult, MenuImportDraft, PublicMenuImport } from "@/lib/menu-import/types";

export type MenuImportRow = {
  id: string;
  status: string;
  sourceType: string;
  sourceFileCount: number;
  pageCount: number | null;
  draftJson: string | null;
  appliedResultJson: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  processedAt: Date | null;
  appliedAt: Date | null;
  cancelledAt: Date | null;
};

function parseAppliedResult(json: string | null): MenuImportApplyResult | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as MenuImportApplyResult;
    if (!value || typeof value.createdItemCount !== "number") return null;
    return value;
  } catch {
    return null;
  }
}

export function toPublicMenuImport(
  row: MenuImportRow,
  options?: {
    includeDraft?: boolean;
    liveItems?: Array<{ categoryName: string; itemName: string }>;
  },
): PublicMenuImport {
  const includeDraft = options?.includeDraft !== false;
  let draft: MenuImportDraft | null = includeDraft ? parseStoredDraft(row.draftJson) : null;
  if (draft && options?.liveItems) {
    draft = annotateDraftDuplicates(draft, options.liveItems);
  }
  return {
    id: row.id,
    status: row.status,
    sourceType: row.sourceType,
    sourceFileCount: row.sourceFileCount,
    pageCount: row.pageCount,
    draft,
    errorCode: row.errorCode,
    errorMessage: row.errorCode ? userFacingImportError(row.errorCode, row.errorMessage) : null,
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
    appliedAt: row.appliedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    appliedResult: parseAppliedResult(row.appliedResultJson),
    applyPreview: draft ? applyPreviewFromDraft(draft) : undefined,
  };
}

export function importAuditMetadata(row: {
  id: string;
  sourceFileCount: number;
  pageCount?: number | null;
  status: string;
  draftJson?: string | null;
  extra?: Record<string, unknown>;
}) {
  const draft = parseStoredDraft(row.draftJson ?? null);
  return {
    importId: row.id,
    fileCount: row.sourceFileCount,
    pageCount: row.pageCount ?? null,
    categoryCount: draft?.categories.length ?? null,
    itemCount: draftItemCount(draft),
    status: row.status,
    ...row.extra,
  };
}
