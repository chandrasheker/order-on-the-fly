import fs from "node:fs/promises";
import path from "node:path";
import {
  extensionForImageMime,
  resolveImageMime,
  validateUploadedImageFile,
  type UploadedImageFile,
} from "@/lib/image-upload";

const BACKGROUNDS_DIR = path.join(process.cwd(), "data", "backgrounds");
const MAX_BYTES = 8 * 1024 * 1024;

export function getBackgroundImagePublicUrl(slug: string, version?: number) {
  const base = `/api/branding/background/${encodeURIComponent(slug)}`;
  return version ? `${base}?v=${version}` : base;
}

function backgroundBasename(restaurantId: string) {
  return `restaurant-${restaurantId}`;
}

export async function ensureBackgroundsDir() {
  await fs.mkdir(BACKGROUNDS_DIR, { recursive: true });
}

export function validateBackgroundImageFile(file: UploadedImageFile) {
  return validateUploadedImageFile(file, MAX_BYTES);
}

export async function saveBackgroundImageFile(restaurantId: string, file: UploadedImageFile) {
  const error = validateBackgroundImageFile(file);
  if (error) throw new Error(error);

  const mime = resolveImageMime(file);
  const ext = extensionForImageMime(mime);
  await ensureBackgroundsDir();
  await removeBackgroundImageFile(restaurantId);

  const filePath = path.join(BACKGROUNDS_DIR, `${backgroundBasename(restaurantId)}${ext}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return { filePath, contentType: mime, ext };
}

export async function findBackgroundImageFile(restaurantId: string) {
  await ensureBackgroundsDir();
  const prefix = backgroundBasename(restaurantId);
  const entries = await fs.readdir(BACKGROUNDS_DIR);
  const match = entries.find((name) => name.startsWith(prefix + "."));

  if (!match) return null;

  const filePath = path.join(BACKGROUNDS_DIR, match);
  const ext = path.extname(match).toLowerCase();
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

  return { filePath, contentType };
}

export async function removeBackgroundImageFile(restaurantId: string) {
  await ensureBackgroundsDir();
  const prefix = backgroundBasename(restaurantId);
  const entries = await fs.readdir(BACKGROUNDS_DIR);
  await Promise.all(
    entries
      .filter((name) => name.startsWith(prefix + "."))
      .map((name) => fs.unlink(path.join(BACKGROUNDS_DIR, name)).catch(() => undefined)),
  );
}

export async function backgroundImageExists(restaurantId: string) {
  const file = await findBackgroundImageFile(restaurantId);
  return Boolean(file);
}
