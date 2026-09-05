export const MENU_IMPORT_STATUSES = [
  "UPLOADED",
  "PROCESSING",
  "READY_FOR_REVIEW",
  "FAILED",
  "APPLYING",
  "APPLIED",
  "CANCELLED",
] as const;

export type MenuImportStatus = (typeof MENU_IMPORT_STATUSES)[number];

export const MENU_IMPORT_MAX_FILES = 20;
export const MENU_IMPORT_MAX_PAGES = 20;
export const MENU_IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MENU_IMPORT_MAX_TOTAL_BYTES = 50 * 1024 * 1024;
export const MENU_IMPORT_MAX_PROCESS_ATTEMPTS = 3;
export const MENU_IMPORT_PROVIDER_TIMEOUT_MS = 45_000;
export const MENU_IMPORT_PDF_MIN_TEXT_CHARS = 40;
export const MENU_IMPORT_PDF_MAX_RENDER_EDGE = 1200;
export const MENU_IMPORT_DEFAULT_PREP_MINUTES = 10;
export const MENU_IMPORT_TERMINAL_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const MENU_IMPORT_ABANDONED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export const MENU_IMPORT_UNSUPPORTED_MESSAGE = "Unsupported or unreadable menu file";

export const MENU_IMPORT_ERROR_MESSAGES: Record<string, string> = {
  EXTRACTION_NOT_CONFIGURED:
    "Photo and scanned-page extraction is not configured. Upload a selectable text PDF, or enter the menu manually.",
  IMAGE_EXTRACTION_NOT_CONFIGURED:
    "Photo menus cannot be read until an extraction provider is configured. Upload a selectable text PDF, or enter the menu manually.",
  UNSUPPORTED_FILE: MENU_IMPORT_UNSUPPORTED_MESSAGE,
  ENCRYPTED_PDF: "Password-protected PDFs are not supported.",
  TOO_MANY_PAGES: "This import exceeds the 20 page/image limit.",
  FILE_TOO_LARGE: "Each menu file must be 10 MB or smaller.",
  PAYLOAD_TOO_LARGE: "The total import must be 50 MB or smaller.",
  PROVIDER_FAILED: "Menu extraction failed. You can retry or enter the menu manually.",
  PROVIDER_INVALID_OUTPUT: "Menu extraction returned unusable data. You can retry or enter the menu manually.",
  PROVIDER_TIMEOUT: "Menu extraction timed out. You can retry or enter the menu manually.",
  RETRY_LIMIT: "This import has reached the extraction retry limit.",
  INVALID_STATE: "This import cannot be used in its current state.",
  CANCELLED: "This import was cancelled.",
};

export const MENU_IMPORT_JOB_TYPE = "menu_import_process" as const;
