import fs from "node:fs/promises";
import path from "node:path";
import {
  assertStoredMenuObjectKey,
  isStoredMenuObjectKey,
  menuMediaListPrefix,
} from "@/lib/menu-media/keys";
import type { MenuMediaPutInput, MenuMediaStorage, StoredMenuMediaObject } from "@/lib/menu-media/types";

export class LocalMenuMediaStorage implements MenuMediaStorage {
  constructor(private readonly rootDir: string) {}

  private resolveKeyPath(key: string) {
    const safeKey = assertStoredMenuObjectKey(key);
    const root = path.resolve(this.rootDir);
    const resolved = path.resolve(root, safeKey);
    const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    if (resolved !== root && !resolved.startsWith(prefix)) {
      throw new Error("Invalid menu media storage key");
    }
    return resolved;
  }

  async putObject(input: MenuMediaPutInput) {
    const filePath = this.resolveKeyPath(input.key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, input.body);
  }

  async getObject(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.resolveKeyPath(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      if (error instanceof Error && error.message === "Invalid menu media storage key") {
        return null;
      }
      throw error;
    }
  }

  async deleteObject(key: string) {
    if (!isStoredMenuObjectKey(key)) return;
    try {
      await fs.unlink(this.resolveKeyPath(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }

  async listObjects(prefix = menuMediaListPrefix()): Promise<StoredMenuMediaObject[]> {
    const root = path.resolve(this.rootDir);
    const out: StoredMenuMediaObject[] = [];
    await this.walk(root, root, prefix, out);
    return out;
  }

  private async walk(
    root: string,
    dir: string,
    prefix: string,
    out: StoredMenuMediaObject[],
  ) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walk(root, full, prefix, out);
        continue;
      }
      if (!entry.isFile()) continue;
      const relative = path.relative(root, full).split(path.sep).join("/");
      if (!relative.startsWith(prefix) || !isStoredMenuObjectKey(relative)) continue;
      const stat = await fs.stat(full);
      out.push({ key: relative, lastModified: stat.mtime });
    }
  }
}
