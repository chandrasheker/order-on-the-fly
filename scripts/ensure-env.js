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

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
    console.log("Created .env from .env.example");
  } else {
    const secret = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(
      envPath,
      `DATABASE_URL="file:./dev.db"\nJWT_SECRET="${secret}"\nNEXT_PUBLIC_APP_URL="${configuredAppUrl()}"\n`,
    );
    console.log("Created default .env file");
  }
}

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
