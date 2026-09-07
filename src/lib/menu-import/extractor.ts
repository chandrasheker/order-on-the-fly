import { resolveMenuImportConfig, type MenuImportRuntimeConfig } from "@/lib/menu-import/config";
import type { MenuImportExtractor } from "@/lib/menu-import/types";
import { MockMenuImportExtractor } from "@/lib/menu-import/providers/mock";
import { OpenAiMenuImportExtractor } from "@/lib/menu-import/providers/openai";

let override: MenuImportExtractor | null = null;

export function setMenuImportExtractorForTests(extractor: MenuImportExtractor | null) {
  override = extractor;
}

export function resetMenuImportExtractorForTests() {
  override = null;
}

export function createMenuImportExtractor(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): { extractor: MenuImportExtractor | null; config: MenuImportRuntimeConfig } {
  const config = resolveMenuImportConfig(env);
  if (override) return { extractor: override, config };
  if (!config.configured) return { extractor: null, config };
  if (config.provider === "mock") return { extractor: new MockMenuImportExtractor(), config };
  if (config.provider === "openai") return { extractor: new OpenAiMenuImportExtractor(config), config };
  return { extractor: null, config };
}

export function getMenuImportExtractor() {
  return createMenuImportExtractor();
}
