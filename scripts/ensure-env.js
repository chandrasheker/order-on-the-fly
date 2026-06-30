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
