import { MENU_IMPORT_ERROR_MESSAGES, MENU_IMPORT_UNSUPPORTED_MESSAGE } from "@/lib/menu-import/constants";

export class MenuImportValidationError extends Error {
  readonly status: 400 | 409 | 413;
  readonly code: string;

  constructor(code: string, message?: string, status: 400 | 409 | 413 = 400) {
    super(message || MENU_IMPORT_ERROR_MESSAGES[code] || MENU_IMPORT_UNSUPPORTED_MESSAGE);
    this.name = "MenuImportValidationError";
    this.code = code;
    this.status = status;
  }
}

export function userFacingImportError(code?: string | null, fallback?: string | null) {
  if (code && MENU_IMPORT_ERROR_MESSAGES[code]) return MENU_IMPORT_ERROR_MESSAGES[code];
  if (fallback && !/stack|api[_-]?key|bearer |sk-|authorization/i.test(fallback)) {
    return fallback.slice(0, 240);
  }
  return MENU_IMPORT_ERROR_MESSAGES.PROVIDER_FAILED;
}
