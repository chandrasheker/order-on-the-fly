/**
 * Canonical PlatformAdmin UI lives under `/oof/platform`.
 * The App Router implementation remains at `src/app/platform` and is reached
 * via next.config beforeFiles rewrites so the browser URL stays canonical.
 *
 * `/api/platform/*` is unchanged.
 */

export const PLATFORM_UI_ROOT = "/oof/platform";
export const PLATFORM_UI_INTERNAL_ROOT = "/platform";

export function isCanonicalPlatformUiPath(pathname: string): boolean {
  return pathname === PLATFORM_UI_ROOT || pathname.startsWith(`${PLATFORM_UI_ROOT}/`);
}

export function isLegacyPlatformUiPath(pathname: string): boolean {
  return pathname === "/platform" || pathname.startsWith("/platform/");
}

export function isPlatformUiPath(pathname: string): boolean {
  return isCanonicalPlatformUiPath(pathname) || isLegacyPlatformUiPath(pathname);
}

export function isPlatformApiPath(pathname: string): boolean {
  return pathname === "/api/platform" || pathname.startsWith("/api/platform/");
}

export function isPlatformPath(pathname: string): boolean {
  return isPlatformUiPath(pathname) || isPlatformApiPath(pathname);
}

/** Browser-visible `/oof/platform...` for a legacy or already-canonical UI path. */
export function canonicalPlatformUiPath(pathname: string): string {
  if (isCanonicalPlatformUiPath(pathname)) return pathname;
  if (isLegacyPlatformUiPath(pathname)) {
    return `${PLATFORM_UI_ROOT}${pathname.slice(PLATFORM_UI_INTERNAL_ROOT.length)}`;
  }
  return pathname;
}

/** Internal App Router path (`/platform...`) for a canonical UI request. */
export function rewritePlatformUiToInternal(pathname: string): string {
  if (isCanonicalPlatformUiPath(pathname)) {
    return `${PLATFORM_UI_INTERNAL_ROOT}${pathname.slice(PLATFORM_UI_ROOT.length)}`;
  }
  return pathname;
}

/**
 * Build a canonical PlatformAdmin href.
 * `path` is relative to the UI root (`""`, `"login"`, `"/tenants/x"`, `"?view=fleet"`).
 */
export function platformUiHref(path = ""): string {
  const raw = String(path ?? "");
  if (!raw || raw === "/") return PLATFORM_UI_ROOT;
  if (raw.startsWith("?")) return `${PLATFORM_UI_ROOT}${raw}`;
  if (isCanonicalPlatformUiPath(raw)) return raw;
  if (isLegacyPlatformUiPath(raw)) return canonicalPlatformUiPath(raw);
  const rest = raw.startsWith("/") ? raw : `/${raw}`;
  return `${PLATFORM_UI_ROOT}${rest}`;
}

export function platformUiPathFromBrowser(pathname: string): string {
  if (isCanonicalPlatformUiPath(pathname)) return rewritePlatformUiToInternal(pathname);
  return pathname;
}
