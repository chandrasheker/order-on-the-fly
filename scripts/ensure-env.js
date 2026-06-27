const fs = require("node:fs");
const path = require("node:path");

const envPath = path.join(process.cwd(), ".env");
const examplePath = path.join(process.cwd(), ".env.example");

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
    console.log("Created .env from .env.example");
  } else {
    fs.writeFileSync(
      envPath,
      'DATABASE_URL="file:./dev.db"\nJWT_SECRET="dev-secret-change-in-production"\nNEXT_PUBLIC_APP_URL="https://varanasihotel.duckdns.org"\n'
    );
    console.log("Created default .env file");
  }
}
