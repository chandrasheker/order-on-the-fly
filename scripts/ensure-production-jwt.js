/**
 * If production `next start` still has a placeholder JWT_SECRET, persist a
 * machine-local secret so startup validation can pass. A value already set in
 * the environment that is strong is left untouched.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const INSECURE = new Set([
  "tabletap-super-secret-key-change-in-production",
  "change-this-to-a-secure-random-string-in-production",
  "changeme",
  "secret",
  "jwt-secret",
]);

function isInsecureJwtSecret(secret) {
  const value = String(secret ?? "").trim();
  if (value.length < 32) return true;
  return INSECURE.has(value);
}

function defaultPersistPath() {
  return path.join(__dirname, "..", ".data", "jwt-secret");
}

function ensureProductionJwt(options = {}) {
  const current = options.secret ?? process.env.JWT_SECRET;
  if (!isInsecureJwtSecret(current)) {
    return String(current).trim();
  }

  const file = options.persistPath ?? defaultPersistPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  let secret = "";
  try {
    secret = fs.readFileSync(file, "utf8").trim();
  } catch {
    secret = "";
  }

  if (isInsecureJwtSecret(secret)) {
    secret = crypto.randomBytes(48).toString("base64");
    fs.writeFileSync(file, `${secret}\n`, { encoding: "utf8", mode: 0o600 });
    console.warn("[config] JWT_SECRET was a placeholder; generated a host-local secret at .data/jwt-secret");
  }

  process.env.JWT_SECRET = secret;
  return secret;
}

module.exports = {
  isInsecureJwtSecret,
  ensureProductionJwt,
};

if (require.main === module) {
  ensureProductionJwt();
}
