import "dotenv/config";
import { collectCrashDump } from "../src/lib/crash-dump";

const args = process.argv.slice(2);
const reasonIdx = args.indexOf("--reason");
const reason = reasonIdx >= 0 ? args[reasonIdx + 1] : "manual";

const dumpDir = collectCrashDump({ source: "cli", reason });

if (dumpDir) {
  console.log(`Crash dump written to: ${dumpDir}`);
}
