const { execSync } = require("node:child_process");
const path = require("node:path");
const { logInfo, logError } = require("./logger");

function runCollectScript(extraArgs = []) {
  const script = path.join(__dirname, "collect-crash-dump.ts");
  execSync(`npx tsx "${script}" ${extraArgs.join(" ")}`, {
    stdio: "inherit",
    cwd: process.cwd(),
  });
}

function installCrashHandlers(source) {
  const handler = (label) => (error) => {
    logError(source, `${label}: ${error?.message || error}`, { stack: error?.stack });
    try {
      collectCrashDump({
        source,
        reason: label,
        message: error?.message,
        stack: error?.stack,
      });
    } catch (dumpError) {
      console.error("Failed to collect crash dump:", dumpError);
    }
  };

  process.on("uncaughtException", handler("uncaughtException"));
  process.on("unhandledRejection", (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    handler("unhandledRejection")(error);
  });

  logInfo(source, "Crash handlers installed; dumps go to logs/crashes/");
}

function collectCrashDump(options = {}) {
  if (options.reason === "manual" || options.source === "cli") {
    runCollectScript(["--reason", options.reason || "manual"]);
    return null;
  }

  runCollectScript(["--reason", options.reason || options.message || "crash"]);
  return null;
}

if (require.main === module) {
  runCollectScript(process.argv.slice(2));
}

module.exports = {
  collectCrashDump,
  installCrashHandlers,
};
