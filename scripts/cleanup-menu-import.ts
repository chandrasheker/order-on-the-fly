import { runMenuImportCleanup } from "../src/lib/menu-import/cleanup";

async function main() {
  const apply = process.argv.includes("--apply");
  const result = await runMenuImportCleanup({ apply });
  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    listed: result.listed,
    purgedImportCount: result.purgedImports.length,
    deletedKeyCount: result.deletedKeys.length,
    failedKeyCount: result.failedKeys.length,
    cancelledAbandonedCount: result.cancelledAbandoned.length,
    purgedImports: result.purgedImports,
    deletedKeys: result.deletedKeys,
    failedKeys: result.failedKeys,
    cancelledAbandoned: result.cancelledAbandoned,
  }, null, 2));
  if (result.failedKeys.length > 0) {
    process.exitCode = 1;
  }
}

void main();
