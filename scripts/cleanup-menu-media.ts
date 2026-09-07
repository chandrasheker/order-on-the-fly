import { runMenuMediaCleanup } from "../src/lib/menu-media/cleanup";

async function main() {
  const apply = process.argv.includes("--apply");
  const result = await runMenuMediaCleanup({ apply });
  const summary = {
    mode: apply ? "apply" : "dry-run",
    listed: result.listed,
    referenced: result.referenced,
    skippedRecent: result.skippedRecent,
    skippedUnmanaged: result.skippedUnmanaged,
    orphanCount: result.orphans.length,
    deletedCount: result.deleted.length,
    failedCount: result.failed.length,
    orphans: result.orphans,
    deleted: result.deleted,
    failed: result.failed,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (result.failed.length > 0) {
    process.exitCode = 1;
  }
}

void main();
