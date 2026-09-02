const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");
const { ensureProductionJwt, isInsecureJwtSecret } = require("./ensure-production-jwt");

describe("ensureProductionJwt", () => {
  it("leaves a strong secret unchanged", () => {
    const strong = "production-jwt-secret-value-32chars-min";
    assert.equal(isInsecureJwtSecret(strong), false);
    assert.equal(ensureProductionJwt({ secret: strong, persistPath: path.join(os.tmpdir(), "unused-jwt") }), strong);
  });

  it("persists a generated secret when the env value is a placeholder", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tabletap-jwt-"));
    const file = path.join(dir, "jwt-secret");
    const first = ensureProductionJwt({
      secret: "change-this-to-a-secure-random-string-in-production",
      persistPath: file,
    });
    assert.equal(isInsecureJwtSecret(first), false);
    assert.equal(fs.readFileSync(file, "utf8").trim(), first);
    const second = ensureProductionJwt({
      secret: "change-this-to-a-secure-random-string-in-production",
      persistPath: file,
    });
    assert.equal(second, first);
  });
});
