export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "tabletap-theme";

export function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === "light" || value === "dark";
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(mode);
}
