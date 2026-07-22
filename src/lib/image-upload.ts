const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const ALLOWED_MIME = new Set(Object.keys(EXT_BY_MIME));

export type UploadedImageFile = {
  name: string;
  size: number;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export function getUploadedImageFile(
  formData: FormData,
  field = "file",
): UploadedImageFile | null {
  const entry = formData.get(field);
  if (!entry || typeof entry === "string") return null;
  if (typeof (entry as Blob).arrayBuffer !== "function") return null;

  const blob = entry as Blob & { name?: string };
  return {
    name: typeof blob.name === "string" ? blob.name : field,
    size: blob.size,
    type: blob.type,
    arrayBuffer: () => blob.arrayBuffer(),
  };
}

export function resolveImageMime(file: Pick<UploadedImageFile, "name" | "type">) {
  const declared = file.type?.toLowerCase().trim();
  if (declared && ALLOWED_MIME.has(declared)) {
    return declared;
  }

  const ext = pathExtname(file.name);
  return MIME_BY_EXT[ext] ?? "";
}

function pathExtname(name: string) {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "";
  return name.slice(dot).toLowerCase();
}

export function validateUploadedImageFile(
  file: UploadedImageFile,
  maxBytes: number,
): string | null {
  const mime = resolveImageMime(file);
  if (!mime) {
    return "Please upload a PNG, JPG, WEBP, or GIF image.";
  }
  if (file.size <= 0) {
    return "The selected file is empty.";
  }
  if (file.size > maxBytes) {
    return `Image must be ${Math.round(maxBytes / (1024 * 1024))} MB or smaller.`;
  }
  return null;
}

export function extensionForImageMime(mime: string) {
  return EXT_BY_MIME[mime] ?? ".jpg";
}
