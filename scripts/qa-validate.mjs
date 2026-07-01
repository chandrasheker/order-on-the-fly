#!/usr/bin/env node
/**
 * End-to-end smoke + API validation for TableTap.
 * Run with dev server up: node scripts/qa-validate.mjs
 */
import crypto from "node:crypto";
import { config as loadEnv } from "dotenv";

loadEnv();

const BASE = process.env.APP_URL || "http://localhost:3000";

const results = { pass: 0, fail: 0, items: [] };

function record(name, ok, detail = "") {
  results.items.push({ name, ok, detail });
  if (ok) results.pass++;
  else results.fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { res, json };
}

function cookiesFromResponse(res) {
  const raw = res.headers.getSetCookie?.() || [];
  return raw.map((c) => c.split(";")[0]).join("; ");
}

function tableAccessCode(tableId, qrToken) {
  const secret =
    process.env.TABLE_ACCESS_SECRET ||
    process.env.JWT_SECRET ||
    "tabletap-table-access-secret";
  const date = new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const slot = Math.floor(date.getUTCHours() / 12);
  const window = `${year}${month}${day}-${slot}`;
  const digest = crypto
    .createHmac("sha256", secret)
    .update(`${tableId}:${qrToken}:${window}`)
    .digest();
  const alpha = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 10; i++) code += alpha[digest[i] % alpha.length];
  return code;
}

async function loginStaff(email, password) {
  const { res, json } = await fetchJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return { ok: res.ok, cookies: cookiesFromResponse(res), json };
}

async function loginPlatform(email, password) {
  const { res, json } = await fetchJson("/api/platform/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return { ok: res.ok, cookies: cookiesFromResponse(res), json };
}

async function getWithCookie(path, cookies) {
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookies } });
  return res;
}

async function main() {
  console.log(`\nTableTap QA — ${BASE}\n`);

  // Health
  {
    const { res, json } = await fetchJson("/api/health");
    record("GET /api/health", res.ok && json?.status === "ok", json?.status);
  }

  // Staff login — restaurant 1 (owner)
  const staff1 = await loginStaff("owner@pistahouse-dt.local", "admin123");
  record("Staff login (owner, pistahouse-dt)", staff1.ok, staff1.json?.user?.email);
  const c1 = staff1.cookies;
  let table1 = null;

  if (c1) {
    const endpoints = [
      "/api/auth/me",
      "/api/staff/dashboard",
      "/api/tables/manage",
      "/api/floors",
      "/api/floor",
      "/api/menu/staff",
      "/api/menu/manage",
      "/api/realtime/kitchen",
      "/api/realtime/guest-requests",
      "/api/realtime/promotions",
      "/api/realtime/modifiers",
      "/api/realtime/combos",
      "/api/realtime/alerts-settings",
      "/api/realtime/gateway",
      "/api/analytics",
      "/api/forecasts",
      "/api/branches",
      "/api/recipes",
      "/api/api-keys",
      "/api/orders/service-tables",
      "/api/features",
      "/api/alerts",
      "/api/tables/qr",
      "/api/payment/settings",
      "/api/receipt/settings",
      "/api/branding/background",
      "/api/rewards/settings",
      "/api/integrations/aggregators",
    ];
    for (const ep of endpoints) {
      const res = await getWithCookie(ep, c1);
      record(`GET ${ep}`, res.ok, String(res.status));
    }

    const d1 = await getWithCookie("/api/staff/dashboard", c1);
    const d2 = await getWithCookie("/api/staff/dashboard", c1);
    record("Staff dashboard idempotent (2x)", d1.ok && d2.ok, `${d1.status}/${d2.status}`);

    // Enable ordering on table 1 for guest flow
    const manage = await fetchJson("/api/tables/manage", { headers: { Cookie: c1 } });
    table1 = manage.json?.tables
      ?.filter((t) => t.number >= 1 && t.number <= 10)
      ?.sort((a, b) => (a.activeSessions ?? 0) - (b.activeSessions ?? 0))[0];
    record("Tables manage has guest table", Boolean(table1?.id), `table ${table1?.number}`);

    if (table1?.id) {
      const open = await fetchJson("/api/tables/manage", {
        method: "PATCH",
        headers: { Cookie: c1 },
        body: JSON.stringify({ tableId: table1.id, orderingEnabled: true }),
      });
      record("Open table ordering (guest table)", open.res.ok, String(open.res.status));
    }
  }

  // Role logins
  for (const [role, email] of [
    ["manager", "manager1@pistahouse-dt.local"],
    ["cook", "cook1@pistahouse-dt.local"],
    ["server", "server1@pistahouse-dt.local"],
  ]) {
    const s = await loginStaff(email, "admin123");
    record(`Staff login (${role})`, s.ok, email);
    if (s.cookies) {
      const dash = await getWithCookie("/api/staff/dashboard", s.cookies);
      record(`Dashboard (${role})`, dash.ok, String(dash.status));
    }
  }

  // Staff login — restaurant 2
  const staff2 = await loginStaff("owner@pistahouse-ap.local", "admin123");
  record("Staff login (pistahouse-ap)", staff2.ok);
  if (staff2.cookies) {
    const res = await getWithCookie("/api/staff/dashboard", staff2.cookies);
    record("Staff dashboard (restaurant 2)", res.ok, String(res.status));
  }

  // Platform admin
  const plat = await loginPlatform("admin@twineats.com", "admin123");
  record("Platform admin login", plat.ok);
  const pc = plat.cookies;

  if (pc) {
    for (const ep of [
      "/api/platform/auth/me",
      "/api/platform/tenants",
    ]) {
      const res = await getWithCookie(ep, pc);
      record(`GET ${ep}`, res.ok, String(res.status));
    }

    const tenants = await fetchJson("/api/platform/tenants", { headers: { Cookie: pc } });
    const tenantId = tenants.json?.tenants?.[0]?.id;
    record("Platform tenants list", tenants.res.ok && tenantId, tenantId?.slice(0, 8));

    if (tenantId) {
      for (const ep of [
        `/api/platform/staff-config?tenantId=${tenantId}`,
        `/api/platform/features?tenantId=${tenantId}`,
      ]) {
        const res = await getWithCookie(ep, pc);
        record(`GET ${ep.split("?")[0]} (tenant)`, res.ok, String(res.status));
      }

      const res = await getWithCookie(`/api/platform/tenants/${tenantId}/overview`, pc);
      record("Tenant overview", res.ok, String(res.status));

      const bill = await fetchJson(`/api/platform/billing?tenantId=${tenantId}`, {
        headers: { Cookie: pc },
      });
      record("Billing GET", bill.res.ok);

      const upgrade = await fetchJson("/api/platform/billing", {
        method: "POST",
        headers: { Cookie: pc },
        body: JSON.stringify({ tenantId, plan: "PRO" }),
      });
      record("Billing upgrade POST", upgrade.res.ok);
    }
  }

  // Tenant signup
  const slug = `qa-${Date.now().toString(36)}`;
  const signup = await fetchJson("/api/tenant/signup", {
    method: "POST",
    body: JSON.stringify({
      tenantName: `QA Tenant ${slug}`,
      tenantSlug: slug,
      billingEmail: `${slug}@test.local`,
      restaurantName: `QA Restaurant ${slug}`,
      ownerName: "QA Owner",
      ownerEmail: `owner@${slug}.local`,
      ownerPassword: "testpass123",
      tableCount: 4,
    }),
  });
  record("Tenant signup POST", signup.res.ok && signup.json?.ok, signup.json?.restaurant?.slug);

  const tableToken = table1
    ? `${staff1.json?.user?.restaurantSlug || "pistahouse-dt"}-table-${table1.number}`
    : "pistahouse-dt-table-2";
  const sessionKey = crypto.randomUUID();

  // Leave any prior QA session on this table (idempotent cleanup)
  if (table1?.id) {
    await fetchJson("/api/tables/session", {
      method: "DELETE",
      body: JSON.stringify({ tableToken, sessionKey: "test-session-123" }),
    });
  }

  // Guest menu (public)
  {
    const res = await fetch(`${BASE}/api/menu/pistahouse-dt/${tableToken}`);
    record("Guest menu GET", res.ok, String(res.status));
  }

  // Guest dining status
  {
    const { res } = await fetchJson(
      `/api/tables/dining-status?tableToken=${encodeURIComponent(tableToken)}&sessionKey=${encodeURIComponent(sessionKey)}`,
    );
    record("Guest dining-status GET", res.ok, String(res.status));
  }

  // Guest check-in + session (requires table ordering open)
  let diningCookies = "";
  if (table1?.id) {
    const accessCode = tableAccessCode(table1.id, tableToken);
    const checkIn = await fetchJson("/api/tables/check-in", {
      method: "POST",
      body: JSON.stringify({ tableToken, sessionKey, accessCode }),
    });
    diningCookies = cookiesFromResponse(checkIn.res);
    record(
      "Guest check-in POST",
      checkIn.res.ok,
      checkIn.json?.canOrder !== undefined ? "verified" : checkIn.json?.error || String(checkIn.res.status),
    );

    const join = await fetchJson("/api/tables/session", {
      method: "POST",
      body: JSON.stringify({ tableToken, sessionKey }),
    });
    record("Guest table session POST", join.res.ok, join.json?.active ? "active" : String(join.res.status));

    // Guest order
    const menu = await fetchJson(`/api/menu/pistahouse-dt/${tableToken}`);
    const item = menu.json?.categories?.[0]?.items?.[0];
    if (item) {
      const order = await fetchJson("/api/orders", {
        method: "POST",
        headers: diningCookies ? { Cookie: diningCookies } : {},
        body: JSON.stringify({
          tableToken,
          sessionKey,
          customerName: "QA Guest",
          items: [{ menuItemId: item.id, quantity: 1 }],
        }),
      });
      record(
        "Guest order POST",
        order.res.ok || order.res.status === 201,
        order.json?.order?.id ? order.json.order.id.slice(0, 8) : order.json?.error || String(order.res.status),
      );
    } else {
      record("Guest order POST", false, "no menu item");
    }

    // Service request
    const svc = await fetchJson("/api/guest/service-request", {
      method: "POST",
      headers: diningCookies ? { Cookie: diningCookies } : {},
      body: JSON.stringify({ tableToken, sessionKey, type: "CALL_WAITER" }),
    });
    record("Guest service-request POST", svc.res.ok, String(svc.res.status));
  }

  // Push vapid (public)
  {
    const { res } = await fetchJson("/api/push/vapid");
    record("GET /api/push/vapid", res.ok, String(res.status));
  }

  // Pages (HTML)
  for (const page of [
    "/",
    "/staff/dashboard",
    "/platform/login",
    "/tenant/signup",
    "/admin/platform",
    "/admin/menu",
    "/admin/qr",
    "/kitchen",
    "/order/pistahouse-dt/pistahouse-dt-table-1/check-in",
  ]) {
    const res = await fetch(`${BASE}${page}`, { redirect: "manual" });
    record(
      `Page ${page}`,
      res.status === 200 || res.status === 307 || res.status === 302,
      String(res.status),
    );
  }

  // Jobs + print retry
  {
    const { res } = await fetchJson("/api/jobs/process", { method: "POST" });
    record("POST /api/jobs/process", res.ok || res.status === 401);
    const pr = await fetchJson("/api/print/retry", { method: "POST" });
    record("POST /api/print/retry", pr.res.ok || pr.res.status === 401);
  }

  // Payment reconciliation (staff)
  if (c1) {
    const rec = await fetchJson("/api/payments/reconciliation", {
      method: "POST",
      headers: { Cookie: c1 },
    });
    record("POST /api/payments/reconciliation", rec.res.ok, rec.json?.reconciliation?.status);
  }

  // Offline sync (staff POST)
  if (c1 && table1?.id) {
    const menu = await fetchJson("/api/menu/staff", { headers: { Cookie: c1 } });
    const item = menu.json?.categories?.[0]?.items?.[0];
    if (item) {
      const sync = await fetchJson("/api/offline/sync", {
        method: "POST",
        headers: { Cookie: c1 },
        body: JSON.stringify({
          clientId: `qa-offline-${Date.now()}`,
          tableId: table1.id,
          customerName: "Offline QA",
          items: [{ menuItemId: item.id, quantity: 1 }],
        }),
      });
      record("POST /api/offline/sync", sync.res.ok || sync.res.status === 201, String(sync.res.status));
    }
  }

  console.log(`\n--- ${results.pass} passed, ${results.fail} failed ---\n`);
  if (results.fail > 0) {
    console.log("Failures:");
    results.items.filter((i) => !i.ok).forEach((i) => console.log(`  - ${i.name}: ${i.detail}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
