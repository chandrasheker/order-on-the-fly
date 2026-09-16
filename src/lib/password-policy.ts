export function assertPlatformPasswordPolicy(password: string) {
  if (String(password ?? "").length < 6) {
    throw new Error("Password must be at least 6 characters");
  }
}

export function assertRequiredOwnerPassword(password: string) {
  if (!String(password ?? "")) {
    throw new Error("Owner password is required");
  }
  assertPlatformPasswordPolicy(password);
}
