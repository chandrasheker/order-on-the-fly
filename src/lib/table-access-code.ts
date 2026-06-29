import crypto from "node:crypto";

const CODE_LENGTH = 10;
const ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ROTATION_HOURS = 12;

function accessSecret() {
  return process.env.TABLE_ACCESS_SECRET || process.env.JWT_SECRET || "tabletap-table-access-secret";
}

export function tableAccessWindow(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const slot = Math.floor(date.getUTCHours() / ROTATION_HOURS);
  return `${year}${month}${day}-${slot}`;
}

export function currentTableAccessCode(table: { id: string; qrToken: string }, date = new Date()) {
  const digest = crypto
    .createHmac("sha256", accessSecret())
    .update(`${table.id}:${table.qrToken}:${tableAccessWindow(date)}`)
    .digest();

  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHANUMERIC[digest[i] % ALPHANUMERIC.length];
  }
  return code;
}

export function isTableAccessCodeFormat(code: string) {
  return /^[A-Z0-9]{10}$/.test(code);
}

export function validateCurrentTableAccessCode(
  table: { id: string; qrToken: string },
  code: string,
  date = new Date(),
) {
  const normalized = code.trim().toUpperCase();
  if (!isTableAccessCodeFormat(normalized)) return false;

  const expected = currentTableAccessCode(table, date);
  return crypto.timingSafeEqual(Buffer.from(normalized), Buffer.from(expected));
}

