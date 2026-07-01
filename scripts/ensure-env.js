const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const envPath = path.join(process.cwd(), ".env");
const examplePath = path.join(process.cwd(), ".env.example");

function configuredAppUrl() {
  try {
    const { loadRestaurantConfig } = require("./restaurant-config");
    return loadRestaurantConfig().app.url || "http://localhost:3000";
  } catch {
    return "http://localhost:3000";
  }
}

function readEnvValue(envContent, key) {
  const match = envContent.match(new RegExp(`^${key}="([^"]*)"`, "m"));
  return match?.[1] ?? null;
}

function upsertEnvValue(envContent, key, value) {
  const line = `${key}="${value}"`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(envContent)) {
    return envContent.replace(pattern, line);
  }
  const trimmed = envContent.replace(/\s+$/, "");
  return `${trimmed}\n${line}\n`;
}

/** Keep APP_URL (runtime) aligned with NEXT_PUBLIC_APP_URL (.env source of truth). */
function syncAppUrlInEnv() {
  if (!fs.existsSync(envPath)) return;

  let env = fs.readFileSync(envPath, "utf8");
  const nextPublic = readEnvValue(env, "NEXT_PUBLIC_APP_URL") || configuredAppUrl();
  const appUrl = readEnvValue(env, "APP_URL");

  if (appUrl !== nextPublic) {
    env = upsertEnvValue(env, "APP_URL", nextPublic);
    fs.writeFileSync(envPath, env);
    console.log(`Synced APP_URL=${nextPublic} (server QR/webhooks read this at runtime)`);
  }

  process.env.APP_URL = readEnvValue(fs.readFileSync(envPath, "utf8"), "APP_URL") || nextPublic;
}

if (!fs.existsSync(envPath)) {
  const appUrl = configuredAppUrl();
  if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
    console.log("Created .env from .env.example");
  } else {
    const secret = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(
      envPath,
      `DATABASE_URL="file:./dev.db"\nJWT_SECRET="${secret}"\nNEXT_PUBLIC_APP_URL="${appUrl}"\nAPP_URL="${appUrl}"\n`,
    );
    console.log("Created default .env file");
  }
}

syncAppUrlInEnv();

function ensureDevVapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return;
  let webpush;
  try {
    webpush = require("web-push");
  } catch {
    return;
  }
  const keys = webpush.generateVAPIDKeys();
  let env = fs.readFileSync(envPath, "utf8");
  if (!/^VAPID_PUBLIC_KEY=/m.test(env)) {
    env += `\nVAPID_PUBLIC_KEY="${keys.publicKey}"\nVAPID_PRIVATE_KEY="${keys.privateKey}"\nVAPID_SUBJECT="mailto:admin@tabletap.app"\n`;
    fs.writeFileSync(envPath, env);
    console.log("Added dev VAPID keys to .env");
  }
}

ensureDevVapidKeys();
