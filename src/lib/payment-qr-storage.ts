import fs from "node:fs/promises";
import path from "node:path";
import {
  extensionForImageMime,
  resolveImageMime,
  validateUploadedImageFile,
  type UploadedImageFile,
} from "@/lib/image-upload";

const PAYMENTS_DIR = path.join(process.cwd(), "data", "payments");
const MAX_BYTES = 5 * 1024 * 1024;

export function getPaymentQrPublicUrl(slug: string, version?: number) {
  const base = `/api/payment/qr/${encodeURIComponent(slug)}`;
  return version ? `${base}?v=${version}` : base;
}

function paymentQrBasename(restaurantId: string) {
  return `restaurant-${restaurantId}`;
}

export async function ensurePaymentsDir() {
  await fs.mkdir(PAYMENTS_DIR, { recursive: true });
}

export function validatePaymentQrFile(file: UploadedImageFile) {
  return validateUploadedImageFile(file, MAX_BYTES);
}

export async function savePaymentQrFile(restaurantId: string, file: UploadedImageFile) {
  const error = validatePaymentQrFile(file);
  if (error) throw new Error(error);

  const mime = resolveImageMime(file);
  const ext = extensionForImageMime(mime);
  await ensurePaymentsDir();
  await removePaymentQrFile(restaurantId);

  const filePath = path.join(PAYMENTS_DIR, `${paymentQrBasename(restaurantId)}${ext}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return { filePath, contentType: mime, ext };
}

export async function findPaymentQrFile(restaurantId: string) {
  await ensurePaymentsDir();
  const prefix = paymentQrBasename(restaurantId);
  const entries = await fs.readdir(PAYMENTS_DIR);
  const match = entries.find((name) => name.startsWith(prefix + "."));

  if (!match) return null;

  const filePath = path.join(PAYMENTS_DIR, match);
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

export async function removePaymentQrFile(restaurantId: string) {
  await ensurePaymentsDir();
  const prefix = paymentQrBasename(restaurantId);
  const entries = await fs.readdir(PAYMENTS_DIR);
  await Promise.all(
    entries
      .filter((name) => name.startsWith(prefix + "."))
      .map((name) => fs.unlink(path.join(PAYMENTS_DIR, name)).catch(() => undefined)),
  );
}

export async function paymentQrExists(restaurantId: string) {
  const file = await findPaymentQrFile(restaurantId);
  return Boolean(file);
}
