import { createHash } from "node:crypto";
import { sanitizeErrorText } from "@/platform/forensics/redactor";

export function forensicErrorFingerprint(params: {
  errorType?: string | null;
  errorCode?: string | null;
  message?: string | null;
  route?: string | null;
}) {
  const message = sanitizeErrorText(params.message ?? "", 256)
    .toLowerCase()
    .replace(/[0-9a-f]{8,}/gi, "#")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim();
  const material = [
    params.errorType ?? "Error",
    params.errorCode ?? "",
    message,
    params.route ?? "",
  ].join("|");
  return createHash("sha256").update(material).digest("hex");
}
