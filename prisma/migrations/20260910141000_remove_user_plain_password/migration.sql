-- Remove recoverable staff passwords. Passwords are bcrypt hashes only.
-- authVersion invalidates staff JWTs after a password change/reset.

ALTER TABLE "User" DROP COLUMN "plainPassword";
ALTER TABLE "User" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
