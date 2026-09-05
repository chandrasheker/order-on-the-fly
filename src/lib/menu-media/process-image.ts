import sharp from "sharp";
import {
  MENU_MEDIA_ACCEPTED_INPUT_FORMATS,
  MENU_MEDIA_CONTENT_TYPE,
  MENU_MEDIA_MAX_EDGE,
  MENU_MEDIA_MAX_INPUT_PIXELS,
  MENU_MEDIA_MAX_UPLOAD_BYTES,
  MENU_MEDIA_WEBP_QUALITY,
} from "@/lib/menu-media/constants";

export class MenuMediaValidationError extends Error {
  readonly status: 400 | 413;

  constructor(message: string, status: 400 | 413 = 400) {
    super(message);
    this.name = "MenuMediaValidationError";
    this.status = status;
  }
}

export type ProcessedMenuImage = {
  bytes: Buffer;
  contentType: typeof MENU_MEDIA_CONTENT_TYPE;
  width: number;
  height: number;
};

function isAcceptedFormat(
  format: string | undefined,
): format is (typeof MENU_MEDIA_ACCEPTED_INPUT_FORMATS)[number] {
  return (
    format === "jpeg" ||
    format === "png" ||
    format === "webp"
  );
}

export async function processMenuItemImage(input: Buffer): Promise<ProcessedMenuImage> {
  if (!Buffer.isBuffer(input) || input.length <= 0) {
    throw new MenuMediaValidationError("Please upload a JPEG, PNG, or WebP image.");
  }
  if (input.length > MENU_MEDIA_MAX_UPLOAD_BYTES) {
    throw new MenuMediaValidationError("Image must be 5 MB or smaller.", 413);
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input, {
      animated: false,
      failOn: "error",
      limitInputPixels: MENU_MEDIA_MAX_INPUT_PIXELS,
    }).metadata();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/limit|pixel/i.test(message)) {
      throw new MenuMediaValidationError("Image dimensions are too large.");
    }
    throw new MenuMediaValidationError("Please upload a JPEG, PNG, or WebP image.");
  }

  if (!isAcceptedFormat(metadata.format)) {
    throw new MenuMediaValidationError("Please upload a JPEG, PNG, or WebP image.");
  }
  if ((metadata.pages ?? 1) > 1) {
    throw new MenuMediaValidationError("Animated images are not supported.");
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) {
    throw new MenuMediaValidationError("Please upload a JPEG, PNG, or WebP image.");
  }
  if (width * height > MENU_MEDIA_MAX_INPUT_PIXELS) {
    throw new MenuMediaValidationError("Image dimensions are too large.");
  }

  try {
    const bytes = await sharp(input, {
      animated: false,
      failOn: "error",
      limitInputPixels: MENU_MEDIA_MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize(MENU_MEDIA_MAX_EDGE, MENU_MEDIA_MAX_EDGE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: MENU_MEDIA_WEBP_QUALITY, effort: 4 })
      .toBuffer();

    const outMeta = await sharp(bytes).metadata();
    return {
      bytes,
      contentType: MENU_MEDIA_CONTENT_TYPE,
      width: outMeta.width ?? width,
      height: outMeta.height ?? height,
    };
  } catch (error) {
    if (error instanceof MenuMediaValidationError) throw error;
    throw new MenuMediaValidationError("Please upload a JPEG, PNG, or WebP image.");
  }
}
