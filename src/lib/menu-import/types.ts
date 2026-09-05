export type MenuImportSourceType = "PDF" | "IMAGES";

export type MenuImportDraftConfidence = {
  name?: number;
  price?: number;
};

export type MenuImportDraftItem = {
  id: string;
  name: string;
  description: string | null;
  pricePaise: number | null;
  priceAmbiguous: boolean;
  isVeg: boolean | null;
  prepTimeMinutes?: number;
  skipOnApply?: boolean;
  confidence?: MenuImportDraftConfidence;
  sourcePage?: number;
  reviewFlags?: string[];
  possibleDuplicate?: boolean;
};

export type MenuImportDraftCategory = {
  id: string;
  name: string;
  items: MenuImportDraftItem[];
};

export type MenuImportDraft = {
  categories: MenuImportDraftCategory[];
};

export type MenuImportSourceFileMeta = {
  key: string;
  originalName: string;
  contentType: string;
  byteLength: number;
  pageNumber: number;
};

export type MenuImportSourceMeta = {
  files: MenuImportSourceFileMeta[];
};

export type MenuImportExtractPage = {
  pageNumber: number;
  kind: "text" | "image";
  text?: string;
  image?: { bytes: Buffer; contentType: string };
};

export type MenuImportExtractInput = {
  pages: MenuImportExtractPage[];
};

export interface MenuImportExtractor {
  extractMenu(input: MenuImportExtractInput): Promise<MenuImportDraft>;
}

export type MenuImportApplyResult = {
  createdCategoryCount: number;
  reusedCategoryCount: number;
  createdItemCount: number;
  skippedDuplicateCount: number;
  skippedIncompleteCount: number;
  categoryIds: string[];
  itemIds: string[];
};

export type PublicMenuImport = {
  id: string;
  status: string;
  sourceType: string;
  sourceFileCount: number;
  pageCount: number | null;
  draft: MenuImportDraft | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  appliedAt: string | null;
  cancelledAt: string | null;
  appliedResult: MenuImportApplyResult | null;
  applyPreview?: {
    categoryCount: number;
    itemCount: number;
    duplicateCount: number;
    incompleteCount: number;
  };
};
