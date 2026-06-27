export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { createRequire } = await import("node:module");
  const path = await import("node:path");
  const require = createRequire(import.meta.url);
  const crashDumpPath = path.join(process.cwd(), "scripts", "crash-dump.js");

  try {
    const { installCrashHandlers } = require(crashDumpPath) as {
      installCrashHandlers: (source: string) => void;
    };
    installCrashHandlers("next-instrumentation");
  } catch (error) {
    console.error("Failed to install crash handlers:", error);
  }
}
