import os from "node:os";
import path from "node:path";
import { MENU_MEDIA_DEFAULT_LOCAL_DIR } from "@/lib/menu-media/constants";

export type MenuMediaStorageMode = "local" | "s3";

export type LocalMenuMediaConfig = {
  mode: "local";
  localDir: string;
};

export type S3MenuMediaConfig = {
  mode: "s3";
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export type MenuMediaConfig = LocalMenuMediaConfig | S3MenuMediaConfig;

export type PublicMenuMediaConfig = {
  mode: MenuMediaStorageMode;
  localDir?: string;
  s3Bucket?: string;
  s3Region?: string;
  s3Endpoint?: string;
  s3ForcePathStyle?: boolean;
};

type EnvMap = Record<string, string | undefined>;

function envTrim(env: EnvMap, key: string) {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

export function resolveSafeLocalMenuMediaDir(raw?: string, cwd = process.cwd()) {
  const specified = String(raw ?? "").trim();
  const resolved = path.resolve(cwd, specified || MENU_MEDIA_DEFAULT_LOCAL_DIR);
  const tmp = path.resolve(os.tmpdir());
  if (resolved === tmp || resolved.startsWith(`${tmp}${path.sep}`)) {
    throw new Error(
      "MENU_MEDIA_LOCAL_DIR must be a persistent directory, not a temporary OS directory",
    );
  }
  const publicDir = path.resolve(cwd, "public");
  if (resolved === publicDir || resolved.startsWith(`${publicDir}${path.sep}`)) {
    throw new Error("MENU_MEDIA_LOCAL_DIR must not be inside the Next.js public/ directory");
  }
  return resolved;
}

export function resolveMenuMediaConfig(env: EnvMap = process.env): MenuMediaConfig {
  const modeRaw = envTrim(env, "MENU_MEDIA_STORAGE") || "local";
  const mode = modeRaw.toLowerCase();
  if (mode !== "local" && mode !== "s3") {
    throw new Error('MENU_MEDIA_STORAGE must be "local" or "s3"');
  }

  if (mode === "s3") {
    const bucket = envTrim(env, "MENU_MEDIA_S3_BUCKET");
    const region = envTrim(env, "MENU_MEDIA_S3_REGION");
    const accessKeyId = envTrim(env, "MENU_MEDIA_S3_ACCESS_KEY_ID");
    const secretAccessKey = envTrim(env, "MENU_MEDIA_S3_SECRET_ACCESS_KEY");
    const endpoint = envTrim(env, "MENU_MEDIA_S3_ENDPOINT") || undefined;
    const forcePathStyle = envTrim(env, "MENU_MEDIA_S3_FORCE_PATH_STYLE") === "1";
    if (!bucket || !region || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "MENU_MEDIA_STORAGE=s3 requires MENU_MEDIA_S3_BUCKET, MENU_MEDIA_S3_REGION, MENU_MEDIA_S3_ACCESS_KEY_ID, and MENU_MEDIA_S3_SECRET_ACCESS_KEY",
      );
    }
    return {
      mode: "s3",
      bucket,
      region,
      endpoint,
      accessKeyId,
      secretAccessKey,
      forcePathStyle,
    };
  }

  return {
    mode: "local",
    localDir: resolveSafeLocalMenuMediaDir(envTrim(env, "MENU_MEDIA_LOCAL_DIR")),
  };
}

export function publicMenuMediaConfig(config: MenuMediaConfig): PublicMenuMediaConfig {
  if (config.mode === "local") {
    return { mode: "local", localDir: config.localDir };
  }
  return {
    mode: "s3",
    s3Bucket: config.bucket,
    s3Region: config.region,
    s3Endpoint: config.endpoint,
    s3ForcePathStyle: config.forcePathStyle,
  };
}
