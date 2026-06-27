import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createToken, verifyPassword } from "@/lib/auth";
import { logApiError, logApiRequest, logInfo, logWarn } from "@/lib/logger";

export async function POST(req: NextRequest) {
  logApiRequest("auth/login", "POST");
  try {
    const { email: bodyEmail, password: bodyPassword } = await req.json();
    const email = String(bodyEmail).trim().toLowerCase();
    const password = String(bodyPassword);

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { restaurant: true },
    });

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      const anyUsers = await prisma.user.count();
      if (anyUsers === 0) {
        logWarn("auth/login", "Login failed: database not seeded");
        return NextResponse.json(
          { error: "Database not set up. Run: npm run db:reset" },
          { status: 503 }
        );
      }
      if (user) {
        logWarn("auth/login", "Password mismatch for existing user", { email });
        return NextResponse.json(
          {
            error:
              "Invalid password. Demo login is owner@varanasi.com / admin123. If this fails, run: npm run db:reset",
          },
          { status: 401 }
        );
      }
      logWarn("auth/login", "Unknown email", { email });
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    logInfo("auth/login", "Login successful", {
      userId: user.id,
      role: user.role,
      restaurantId: user.restaurantId,
    });

    const session = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      restaurantId: user.restaurantId,
      restaurantName: user.restaurant.name,
      restaurantSlug: user.restaurant.slug,
    };

    const token = await createToken(session);

    const response = NextResponse.json({ user: session });
    response.cookies.set("tabletap_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (error) {
    logApiError("auth/login", "POST", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
