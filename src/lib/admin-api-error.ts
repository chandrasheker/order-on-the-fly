export async function readApiErrorMessage(res: Response, fallback: string) {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { error?: string };
    return json.error || fallback;
  } catch {
    if (res.status === 413) {
      return "Image is too large for the server. Try a smaller file (under 8 MB).";
    }
    return text.trim().slice(0, 200) || fallback;
  }
}

export const LOGO_CHANGED_EVENT = "tabletap:logo-changed";

export function notifyLogoChanged(url: string | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LOGO_CHANGED_EVENT, { detail: { url } }));
}
