export const MENU_MEDIA_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MENU_MEDIA_MAX_INPUT_PIXELS = 40_000_000;
export const MENU_MEDIA_MAX_EDGE = 1600;
export const MENU_MEDIA_WEBP_QUALITY = 82;
export const MENU_MEDIA_CONTENT_TYPE = "image/webp";
export const MENU_MEDIA_KEY_PREFIX = "tenant/";
export const MENU_MEDIA_DEFAULT_LOCAL_DIR = ".data/menu-media";
export const MENU_MEDIA_CLEANUP_GRACE_MS = 24 * 60 * 60 * 1000;

export const MENU_MEDIA_KEY_RE =
  /^tenant\/[a-zA-Z0-9_-]+\/restaurant\/[a-zA-Z0-9_-]+\/menu\/[a-zA-Z0-9_-]+\/[a-f0-9]{32}\.webp$/;

export const MENU_MEDIA_ACCEPTED_INPUT_FORMATS = ["jpeg", "png", "webp"] as const;
