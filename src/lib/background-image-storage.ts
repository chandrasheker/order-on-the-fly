import fs from "node:fs/promises";
import path from "node:path";

const BACKGROUNDS_DIR = path.join(process.cwd(), "data", "backgrounds");
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BYTES = 8 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

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

export function validateBackgroundImageFile(file: File) {
  if (!ALLOWED_MIME.has(file.type)) {
    return "Please upload a PNG, JPG, WEBP, or GIF image.";
  }
  if (file.size <= 0) {
    return "The selected file is empty.";
  }
  if (file.size > MAX_BYTES) {
    return "Image must be 8 MB or smaller.";
  }
  return null;
}

export async function saveBackgroundImageFile(restaurantId: string, file: File) {
  const error = validateBackgroundImageFile(file);
  if (error) throw new Error(error);

  const ext = EXT_BY_MIME[file.type] ?? ".jpg";
  await ensureBackgroundsDir();
  await removeBackgroundImageFile(restaurantId);

  const filePath = path.join(BACKGROUNDS_DIR, `${backgroundBasename(restaurantId)}${ext}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return { filePath, contentType: file.type, ext };
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
