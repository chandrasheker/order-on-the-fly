import fs from "node:fs/promises";
import path from "node:path";
import {
  extensionForImageMime,
  resolveImageMime,
  validateUploadedImageFile,
  type UploadedImageFile,
} from "@/lib/image-upload";

const LOGOS_DIR = path.join(process.cwd(), "data", "logos");
const MAX_BYTES = 4 * 1024 * 1024;

export function getLogoImagePublicUrl(slug: string, version?: number) {
  const base = `/api/branding/logo/${encodeURIComponent(slug)}`;
  return version ? `${base}?v=${version}` : base;
}

function logoBasename(restaurantId: string) {
  return `restaurant-${restaurantId}`;
}

export async function ensureLogosDir() {
  await fs.mkdir(LOGOS_DIR, { recursive: true });
}

export function validateLogoImageFile(file: UploadedImageFile) {
  return validateUploadedImageFile(file, MAX_BYTES);
}

export async function saveLogoImageFile(restaurantId: string, file: UploadedImageFile) {
  const error = validateLogoImageFile(file);
  if (error) throw new Error(error);

  const mime = resolveImageMime(file);
  const ext = extensionForImageMime(mime);
  await ensureLogosDir();
  await removeLogoImageFile(restaurantId);

  const filePath = path.join(LOGOS_DIR, `${logoBasename(restaurantId)}${ext}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return { filePath, contentType: mime, ext };
}

export async function findLogoImageFile(restaurantId: string) {
  await ensureLogosDir();
  const prefix = logoBasename(restaurantId);
  const entries = await fs.readdir(LOGOS_DIR);
  const matches = entries.filter((name) => name.startsWith(prefix + "."));
  if (matches.length === 0) return null;

  let newestPath: string | null = null;
  let newestMtime = 0;
  for (const name of matches) {
    const filePath = path.join(LOGOS_DIR, name);
    const stat = await fs.stat(filePath);
    if (stat.mtimeMs >= newestMtime) {
      newestMtime = stat.mtimeMs;
      newestPath = filePath;
    }
  }
  if (!newestPath) return null;

  const ext = path.extname(newestPath).toLowerCase();
  const contentType =
    ext === ".png"
      ? "image/png"
      : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".webp"
          ? "image/webp"
          : ext === ".gif"
            ? "image/gif"
            : "application/octet-stream";

  return { filePath: newestPath, contentType, mtimeMs: newestMtime };
}

export async function removeLogoImageFile(restaurantId: string) {
  await ensureLogosDir();
  const prefix = logoBasename(restaurantId);
  const entries = await fs.readdir(LOGOS_DIR);
  await Promise.all(
    entries
      .filter((name) => name.startsWith(prefix + "."))
      .map((name) => fs.unlink(path.join(LOGOS_DIR, name)).catch(() => undefined)),
  );
}

export async function logoImageExists(restaurantId: string) {
  const file = await findLogoImageFile(restaurantId);
  return Boolean(file);
}

function isManagedLogoApiUrl(slug: string, url: string) {
  const expected = `/api/branding/logo/${encodeURIComponent(slug)}`;
  return url === expected || url.startsWith(`${expected}?`);
}

/** Versioned public URL for the uploaded file; busts browser cache after replace. */
export async function resolveLogoImagePublicUrl(restaurant: {
  id: string;
  slug: string;
  logoUrl: string | null;
}): Promise<string | null> {
  const stored = await findLogoImageFile(restaurant.id);
  if (!stored) {
    const legacy = restaurant.logoUrl?.trim() || null;
    if (legacy?.includes("/api/branding/logo/")) {
      return null;
    }
    return legacy;
  }

  const dbUrl = restaurant.logoUrl?.trim() ?? "";
  if (dbUrl && isManagedLogoApiUrl(restaurant.slug, dbUrl.split("?")[0] ?? dbUrl)) {
    if (dbUrl.includes("?v=")) {
      return dbUrl;
    }
  }

  return getLogoImagePublicUrl(restaurant.slug, stored.mtimeMs);
}
