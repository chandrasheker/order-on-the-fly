-- Remove recoverable staff passwords. Passwords are bcrypt hashes only.
-- authVersion invalidates staff JWTs after a password change/reset.

ALTER TABLE "User" DROP COLUMN IF EXISTS "plainPassword";
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "authVersion" INTEGER NOT NULL DEFAULT 0;
