import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { FORENSIC_ROUTE_EXEMPTIONS } from "@/platform/forensics/exemptions";

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listRouteFiles(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

describe("M4 forensic API route coverage", () => {
  it("requires every business API route to use the wrapper or a specific exemption", () => {
    const root = path.join(process.cwd(), "src/app/api");
    const files = listRouteFiles(root).map((file) => path.relative(process.cwd(), file).replaceAll("\\", "/"));
    const missing: string[] = [];
    for (const file of files) {
      const reason = FORENSIC_ROUTE_EXEMPTIONS[file];
      if (reason) {
        assert.ok(reason.trim().length > 0, `${file} exemption must include a reason`);
        assert.notEqual(reason.trim(), "*");
        continue;
      }
      const text = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      if (!text.includes("withForensicApiRoute")) missing.push(file);
    }
    assert.deepEqual(missing, [], `uncovered business API routes:\n${missing.join("\n")}`);

    for (const [file, reason] of Object.entries(FORENSIC_ROUTE_EXEMPTIONS)) {
      assert.ok(!file.includes("*"), `exemption paths must be specific: ${file}`);
      assert.ok(fs.existsSync(path.join(process.cwd(), file)), `exemption path does not exist: ${file}`);
      assert.ok(reason.trim().length > 0);
    }
  });
});
