import fs from "node:fs/promises";
import path from "node:path";

const PAYMENTS_DIR = path.join(process.cwd(), "data", "payments");
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BYTES = 5 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

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

export function validatePaymentQrFile(file: File) {
  if (!ALLOWED_MIME.has(file.type)) {
    return "Please upload a PNG, JPG, WEBP, or GIF image.";
  }
  if (file.size <= 0) {
    return "The selected file is empty.";
  }
  if (file.size > MAX_BYTES) {
    return "Image must be 5 MB or smaller.";
  }
  return null;
}

export async function savePaymentQrFile(restaurantId: string, file: File) {
  const error = validatePaymentQrFile(file);
  if (error) throw new Error(error);

  const ext = EXT_BY_MIME[file.type] ?? ".png";
  await ensurePaymentsDir();
  await removePaymentQrFile(restaurantId);

  const filePath = path.join(PAYMENTS_DIR, `${paymentQrBasename(restaurantId)}${ext}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return { filePath, contentType: file.type, ext };
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
