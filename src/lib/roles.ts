import type { Role } from "@/generated/prisma/client";

export function getHomeForRole(role: Role) {
  switch (role) {
    case "COOK":
      return "/kitchen";
    case "OWNER":
    case "MANAGER":
    case "SERVER":
    default:
      return "/staff/dashboard";
  }
}
