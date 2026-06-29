import type { Role } from "@/generated/prisma/client";

export function getHomeForRole(role: Role) {
  switch (role) {
    case "OWNER":
    case "MANAGER":
      return "/staff/dashboard";
    case "COOK":
    case "SERVER":
      return "/staff/dashboard";
    default:
      return "/staff/dashboard";
  }
}
