import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, requirePlatformAdmin } from "@/lib/auth";
import type { Role } from "@/generated/prisma/client";
import { logApiError, logApiRequest, logInfo } from "@/lib/logger";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import { applyStaffUserMutationInTx } from "@/lib/staff-user-mutation";

const STAFF_ROLES: Role[] = ["OWNER", "MANAGER", "COOK", "SERVER"];

async function handleGET() {
  const admin = await requirePlatformAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    include: {
      restaurant: { select: { id: true, name: true, slug: true } },
    },
    orderBy: [{ restaurant: { name: "asc" } }, { role: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      restaurantId: u.restaurantId,
      restaurantName: u.restaurant.name,
      restaurantSlug: u.restaurant.slug,
      createdAt: u.createdAt,
    })),
  });
}

export const GET = withForensicApiRoute(handleGET);

async function handlePATCH(req: NextRequest) {
  logApiRequest("platform/users", "PATCH");
  const admin = await requirePlatformAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { userId, name, email, password, role } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const data: {
      name?: string;
      email?: string;
      passwordHash?: string;
      role?: Role;
    } = {};

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) {
        return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
      }
      data.name = trimmed;
    }

    if (email !== undefined) {
      const normalized = String(email).trim().toLowerCase();
      if (!normalized || !normalized.includes("@")) {
        return NextResponse.json({ error: "Valid email required" }, { status: 400 });
      }
      if (normalized !== existing.email) {
        const taken = await prisma.user.findUnique({ where: { email: normalized } });
        if (taken) {
          return NextResponse.json({ error: "Email already in use" }, { status: 409 });
        }
      }
      data.email = normalized;
    }

    if (password !== undefined && String(password).length > 0) {
      if (String(password).length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
      }
      data.passwordHash = await hashPassword(String(password));
    }

    if (role !== undefined) {
      if (!STAFF_ROLES.includes(role as Role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      data.role = role as Role;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    const user = await prisma.$transaction((tx) =>
      applyStaffUserMutationInTx(tx, { userId, existing, data }),
    );

    logInfo("platform/users", "Staff user updated by platform admin", {
      adminId: admin.id,
      userId: user.id,
      fields: Object.keys(data),
    });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        restaurantId: user.restaurantId,
        restaurantName: user.restaurant.name,
        restaurantSlug: user.restaurant.slug,
      },
    });
  } catch (error) {
    logApiError("platform/users", "PATCH", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export const PATCH = withForensicApiRoute(handlePATCH);
