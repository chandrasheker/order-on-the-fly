import { resolveMenuMediaConfig } from "@/lib/menu-media/config";
import { LocalMenuMediaStorage } from "@/lib/menu-media/local-adapter";
import { S3MenuMediaStorage } from "@/lib/menu-media/s3-adapter";
import type { MenuMediaStorage } from "@/lib/menu-media/types";

let cached: MenuMediaStorage | null = null;

export function createMenuMediaStorage(env: NodeJS.ProcessEnv = process.env): MenuMediaStorage {
  const config = resolveMenuMediaConfig(env);
  if (config.mode === "local") {
    return new LocalMenuMediaStorage(config.localDir);
  }
  return new S3MenuMediaStorage(config);
}

export function getMenuMediaStorage(): MenuMediaStorage {
  if (!cached) cached = createMenuMediaStorage();
  return cached;
}

export function resetMenuMediaStorageForTests() {
  cached = null;
}

export function setMenuMediaStorageForTests(storage: MenuMediaStorage | null) {
  cached = storage;
}
