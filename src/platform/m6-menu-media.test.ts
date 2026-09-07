import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { NextRequest } from "next/server";
import sharp from "sharp";
import type { PrismaClient } from "@/generated/prisma/client";

const dbPath = path.join(os.tmpdir(), `tabletap-m6-${process.pid}-${Date.now()}.db`);
const mediaDir = path.join(process.cwd(), ".data", "menu-media-tests", `m6-${process.pid}-${Date.now()}`);
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || "m6-test-jwt-secret-must-be-32-chars!!";
process.env.TENANT_BASE_DOMAIN = "dvadtech.in";
process.env.MENU_MEDIA_STORAGE = "local";
process.env.MENU_MEDIA_LOCAL_DIR = mediaDir;
delete process.env.MENU_MEDIA_S3_SECRET_ACCESS_KEY;
delete process.env.MENU_MEDIA_S3_ACCESS_KEY_ID;

let prisma: PrismaClient;
let processMenuItemImage: typeof import("@/lib/menu-media/process-image").processMenuItemImage;
let MenuMediaValidationError: typeof import("@/lib/menu-media/process-image").MenuMediaValidationError;
let LocalMenuMediaStorage: typeof import("@/lib/menu-media/local-adapter").LocalMenuMediaStorage;
let createMenuMediaStorageKey: typeof import("@/lib/menu-media/keys").createMenuMediaStorageKey;
let isManagedMenuMediaKey: typeof import("@/lib/menu-media/keys").isManagedMenuMediaKey;
let resolveMenuMediaConfig: typeof import("@/lib/menu-media/config").resolveMenuMediaConfig;
let resolveSafeLocalMenuMediaDir: typeof import("@/lib/menu-media/config").resolveSafeLocalMenuMediaDir;
let resetAppConfigCache: typeof import("@/config/app-config").resetAppConfigCache;
let authorizeMenuItemImageMutation: typeof import("@/lib/menu-media/service").authorizeMenuItemImageMutation;
let uploadMenuItemImage: typeof import("@/lib/menu-media/service").uploadMenuItemImage;
let removeMenuItemImage: typeof import("@/lib/menu-media/service").removeMenuItemImage;
let deleteManagedMenuMediaBestEffort: typeof import("@/lib/menu-media/service").deleteManagedMenuMediaBestEffort;
let getMenuMediaStorage: typeof import("@/lib/menu-media/storage").getMenuMediaStorage;
let resetMenuMediaStorageForTests: typeof import("@/lib/menu-media/storage").resetMenuMediaStorageForTests;
let setMenuMediaStorageForTests: typeof import("@/lib/menu-media/storage").setMenuMediaStorageForTests;
let runMenuMediaCleanup: typeof import("@/lib/menu-media/cleanup").runMenuMediaCleanup;
let redactSecrets: typeof import("@/platform/forensics/redactor").redactSecrets;
let hashPassword: typeof import("@/lib/auth").hashPassword;
let clearHostTenantCache: typeof import("@/platform/host-tenant").clearHostTenantCache;
let runWithForensicContext: typeof import("@/platform/forensics/request-context").runWithForensicContext;
let generateRequestId: typeof import("@/platform/forensics/request-context").generateRequestId;
let setForensicActor: typeof import("@/platform/forensics/request-context").setForensicActor;
let mediaGet: typeof import("@/app/api/menu/media/[itemId]/route").GET;
let appendPlatformAuditEventInTx: typeof import("@/platform/forensics/platform-audit-service").appendPlatformAuditEventInTx;
let AUDIT_ACTION: typeof import("@/platform/forensics/constants").AUDIT_ACTION;
let AUDIT_CATEGORY: typeof import("@/platform/forensics/constants").AUDIT_CATEGORY;
let auditMenuItemSnapshot: typeof import("@/platform/forensics/snapshots").auditMenuItemSnapshot;

async function jpegBytes(width = 80, height = 60, color = { r: 220, g: 90, b: 40 }) {
  return sharp({ create: { width, height, channels: 3, background: color } }).jpeg({ quality: 80 }).toBuffer();
}

async function pngBytes() {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 40, g: 160, b: 80 } } })
    .png()
    .toBuffer();
}

async function webpBytes() {
  return sharp({ create: { width: 72, height: 72, channels: 3, background: { r: 40, g: 80, b: 200 } } })
    .webp({ quality: 80 })
    .toBuffer();
}

before(async () => {
  fs.mkdirSync(mediaDir, { recursive: true });
  execFileSync(
    process.execPath,
    [
      path.join(process.cwd(), "scripts", "run-with-mem.js"),
      "npx",
      "prisma",
      "db",
      "push",
      "--url",
      `file:${dbPath}`,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      stdio: "inherit",
    },
  );
  ({ prisma } = await import("@/lib/prisma"));
  ({ processMenuItemImage, MenuMediaValidationError } = await import("@/lib/menu-media/process-image"));
  ({ LocalMenuMediaStorage } = await import("@/lib/menu-media/local-adapter"));
  ({ createMenuMediaStorageKey, isManagedMenuMediaKey } = await import("@/lib/menu-media/keys"));
  ({ resolveMenuMediaConfig, resolveSafeLocalMenuMediaDir } = await import("@/lib/menu-media/config"));
  ({ resetAppConfigCache } = await import("@/config/app-config"));
  ({
    authorizeMenuItemImageMutation,
    uploadMenuItemImage,
    removeMenuItemImage,
    deleteManagedMenuMediaBestEffort,
  } = await import("@/lib/menu-media/service"));
  ({ getMenuMediaStorage, resetMenuMediaStorageForTests, setMenuMediaStorageForTests } = await import(
    "@/lib/menu-media/storage"
  ));
  ({ runMenuMediaCleanup } = await import("@/lib/menu-media/cleanup"));
  ({ redactSecrets } = await import("@/platform/forensics/redactor"));
  ({ hashPassword } = await import("@/lib/auth"));
  ({ clearHostTenantCache } = await import("@/platform/host-tenant"));
  ({ runWithForensicContext, generateRequestId, setForensicActor } = await import(
    "@/platform/forensics/request-context"
  ));
  ({ GET: mediaGet } = await import("@/app/api/menu/media/[itemId]/route"));
  ({ appendPlatformAuditEventInTx } = await import("@/platform/forensics/platform-audit-service"));
  ({ AUDIT_ACTION, AUDIT_CATEGORY } = await import("@/platform/forensics/constants"));
  ({ auditMenuItemSnapshot } = await import("@/platform/forensics/snapshots"));
  resetMenuMediaStorageForTests();
  execFileSync(
    process.execPath,
    [path.join(process.cwd(), "scripts", "run-with-mem.js"), "npx", "prisma", "validate", "--schema", "prisma/schema.postgres.prisma"],
    { cwd: process.cwd(), stdio: "inherit" },
  );
});

after(async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
  if (prisma) await prisma.$disconnect().catch(() => undefined);
  for (const extra of ["", "-wal", "-shm", "-journal"]) {
    fs.rmSync(`${dbPath}${extra}`, { force: true });
  }
  fs.rmSync(mediaDir, { recursive: true, force: true });
});

async function seedRestaurant(suffix: string) {
  const tenant = await prisma.tenant.create({
    data: {
      name: `T ${suffix}`,
      nameNormalized: `t ${suffix}`,
      slug: `t-${suffix}`,
      isEnabled: true,
    },
  });
  const restaurant = await prisma.restaurant.create({
    data: {
      name: `R ${suffix}`,
      nameNormalized: `r ${suffix}`,
      slug: `r-${suffix}`,
      tenantId: tenant.id,
      receiptFooter: "Thanks",
    },
  });
  const category = await prisma.menuCategory.create({
    data: { name: "Mains", slug: `mains-${suffix}`, restaurantId: restaurant.id },
  });
  const menuItem = await prisma.menuItem.create({
    data: { name: "Butter Chicken", price: 320, categoryId: category.id },
  });
  clearHostTenantCache();
  return { tenant, restaurant, category, menuItem };
}

async function seedStaff(
  restaurantId: string,
  role: "OWNER" | "MANAGER" | "SERVER" | "COOK",
  suffix: string,
) {
  return prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${suffix}@example.test`,
      name: `${role} ${suffix}`,
      role,
      restaurantId,
      passwordHash: await hashPassword("password-12"),
    },
  });
}

function forensicCtx(restaurantId: string, hostname: string) {
  return {
    requestId: generateRequestId(),
    startedAt: Date.now(),
    method: "POST",
    routeTemplate: "/api/menu/manage/[itemId]/image",
    hostname,
    clientIp: "49.37.120.82",
    clientIpSource: "trusted-proxy",
    userAgent: "M6Test/1.0",
    source: "API" as const,
    actor: { type: "STAFF" as const, id: "actor-1", name: "Owner", role: "OWNER", sessionId: "sess-1" },
    tenant: { restaurantId },
  };
}

function routeCtx(itemId: string) {
  return { params: Promise.resolve({ itemId }) };
}

describe("M6 menu media processing", () => {
  it("normalizes JPEG, PNG, and WebP to WebP", async () => {
    for (const bytes of [await jpegBytes(), await pngBytes(), await webpBytes()]) {
      const out = await processMenuItemImage(bytes);
      assert.equal(out.contentType, "image/webp");
      const meta = await sharp(out.bytes).metadata();
      assert.equal(meta.format, "webp");
      assert.ok((meta.width ?? 0) <= 1600);
      assert.ok((meta.height ?? 0) <= 1600);
    }
  });

  it("rejects non-image content even when the name claims an image", async () => {
    for (const payload of [
      Buffer.from("<html><body>not an image</body></html>"),
      Buffer.from("%PDF-1.4 fake-pdf"),
      Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"),
    ]) {
      await assert.rejects(() => processMenuItemImage(payload), (error: unknown) => {
        assert.ok(error instanceof MenuMediaValidationError);
        assert.equal(error.status, 400);
        return true;
      });
    }
  });

  it("rejects uploads larger than 5 MiB", async () => {
    const huge = Buffer.alloc(5 * 1024 * 1024 + 32, 1);
    await assert.rejects(() => processMenuItemImage(huge), (error: unknown) => {
      assert.ok(error instanceof MenuMediaValidationError);
      assert.equal(error.status, 413);
      return true;
    });
  });

  it("rejects excessive decoded pixel dimensions", async () => {
    const bomb = await sharp({
      create: { width: 7000, height: 6000, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .jpeg({ quality: 30 })
      .toBuffer();
    await assert.rejects(() => processMenuItemImage(bomb), (error: unknown) => {
      assert.ok(error instanceof MenuMediaValidationError);
      assert.equal(error.status, 400);
      return true;
    });
  });

  it("does not preserve EXIF or input metadata in the normalized WebP", async () => {
    const marker = "SECRET-LOCATION-MUST-GO";
    const withExif = await sharp(await jpegBytes(120, 80))
      .withMetadata({
        exif: { IFD0: { Copyright: marker } },
      })
      .jpeg()
      .toBuffer();
    const out = await processMenuItemImage(withExif);
    assert.equal(out.bytes.includes(Buffer.from(marker)), false);
    const meta = await sharp(out.bytes).metadata();
    assert.equal(meta.exif, undefined);
    assert.equal(meta.icc, undefined);
  });
});

describe("M6 storage keys and local adapter", () => {
  it("blocks path traversal and arbitrary key access", async () => {
    const storage = new LocalMenuMediaStorage(mediaDir);
    const valid = createMenuMediaStorageKey({
      tenantId: "tenant1",
      restaurantId: "rest1",
      menuItemId: "item1",
    });
    assert.equal(isManagedMenuMediaKey(valid), true);
    await storage.putObject({ key: valid, body: Buffer.from("webp"), contentType: "image/webp" });
    assert.ok(await storage.getObject(valid));

    for (const bad of [
      "../../../etc/passwd",
      "/etc/passwd",
      "tenant/x/restaurant/y/menu/z/../secret.webp",
      "tenant/x/../../etc/passwd",
      "public/secret.webp",
      "tenant/x/restaurant/y/menu/z/not-hex.webp",
    ]) {
      assert.equal(isManagedMenuMediaKey(bad), false);
      await assert.rejects(() => storage.putObject({ key: bad, body: Buffer.from("x"), contentType: "image/webp" }));
      const got = await storage.getObject(bad);
      assert.equal(got, null);
    }
  });

  it("rejects unsafe local directories and incomplete S3 config", () => {
    assert.throws(() => resolveSafeLocalMenuMediaDir(os.tmpdir()));
    assert.throws(() => resolveSafeLocalMenuMediaDir(path.join(os.tmpdir(), "menu-media")));
    assert.throws(() => resolveSafeLocalMenuMediaDir("public"));
    assert.throws(() =>
      resolveMenuMediaConfig({
        MENU_MEDIA_STORAGE: "s3",
        MENU_MEDIA_S3_BUCKET: "bucket",
      }),
    );
    const local = resolveMenuMediaConfig({
      MENU_MEDIA_STORAGE: "local",
      MENU_MEDIA_LOCAL_DIR: mediaDir,
    });
    assert.equal(local.mode, "local");
    resetAppConfigCache();
  });

  it("redacts S3 access credentials", () => {
    const redacted = redactSecrets({
      MENU_MEDIA_S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
      MENU_MEDIA_S3_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG",
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG",
    });
    assert.equal(redacted.MENU_MEDIA_S3_ACCESS_KEY_ID, "[REDACTED]");
    assert.equal(redacted.MENU_MEDIA_S3_SECRET_ACCESS_KEY, "[REDACTED]");
    assert.equal(redacted.accessKeyId, "[REDACTED]");
    assert.equal(redacted.secretAccessKey, "[REDACTED]");
  });
});

describe("M6 upload tenancy, forensics, and lifecycle", () => {
  it("requires menu-management permission and restaurant ownership", async () => {
    const suffix = `perm-${Date.now()}`;
    const a = await seedRestaurant(`${suffix}-a`);
    const b = await seedRestaurant(`${suffix}-b`);
    const ownerA = await seedStaff(a.restaurant.id, "OWNER", `${suffix}-oa`);
    const serverA = await seedStaff(a.restaurant.id, "SERVER", `${suffix}-sa`);
    const ownerB = await seedStaff(b.restaurant.id, "OWNER", `${suffix}-ob`);

    const denied = await authorizeMenuItemImageMutation(
      {
        id: serverA.id,
        email: serverA.email,
        name: serverA.name,
        role: serverA.role,
        restaurantId: a.restaurant.id,
        restaurantName: a.restaurant.name,
        restaurantSlug: a.restaurant.slug,
      },
      a.menuItem.id,
    );
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.status, 401);

    const cross = await authorizeMenuItemImageMutation(
      {
        id: ownerB.id,
        email: ownerB.email,
        name: ownerB.name,
        role: ownerB.role,
        restaurantId: b.restaurant.id,
        restaurantName: b.restaurant.name,
        restaurantSlug: b.restaurant.slug,
      },
      a.menuItem.id,
    );
    assert.equal(cross.ok, false);
    if (!cross.ok) assert.equal(cross.status, 404);

    const allowed = await authorizeMenuItemImageMutation(
      {
        id: ownerA.id,
        email: ownerA.email,
        name: ownerA.name,
        role: ownerA.role,
        restaurantId: a.restaurant.id,
        restaurantName: a.restaurant.name,
        restaurantSlug: a.restaurant.slug,
      },
      a.menuItem.id,
    );
    assert.equal(allowed.ok, true);
  });

  it("records one uploaded, replaced, and removed forensic event with the DB mutation", async () => {
    const suffix = `life-${Date.now()}`;
    const seeded = await seedRestaurant(suffix);
    const host = `${seeded.restaurant.slug}.dvadtech.in`;

    await runWithForensicContext(forensicCtx(seeded.restaurant.id, host), async () => {
      setForensicActor({ type: "STAFF", id: "owner-1", name: "Owner", role: "OWNER" });
      const first = await uploadMenuItemImage({
        restaurantId: seeded.restaurant.id,
        itemId: seeded.menuItem.id,
        bytes: await jpegBytes(),
      });
      assert.equal(first.ok, true);
      if (!first.ok) return;
      assert.equal(first.action, "uploaded");
    });

    const afterUpload = await prisma.menuItem.findUnique({ where: { id: seeded.menuItem.id } });
    assert.ok(afterUpload?.imageStorageKey);
    assert.ok(afterUpload?.imageUrl?.includes(`/api/menu/media/${seeded.menuItem.id}?v=`));
    assert.equal(afterUpload?.imageRevision, 1);
    const uploadedEvents = await prisma.platformAuditEvent.findMany({
      where: { action: "MENU_ITEM_IMAGE_UPLOADED", resourceId: seeded.menuItem.id },
    });
    assert.equal(uploadedEvents.length, 1);
    const uploadedMeta = JSON.parse(uploadedEvents[0].metadataJson ?? "{}");
    assert.equal(uploadedMeta.hasImage, true);
    assert.equal(uploadedMeta.imageRevision, 1);
    assert.equal(uploadedMeta.menuItemId, seeded.menuItem.id);
    const blob = JSON.stringify(uploadedEvents[0]);
    assert.equal(blob.includes(afterUpload.imageStorageKey ?? "no-key"), false);

    const firstKey = afterUpload.imageStorageKey;

    await runWithForensicContext(forensicCtx(seeded.restaurant.id, host), async () => {
      const replaced = await uploadMenuItemImage({
        restaurantId: seeded.restaurant.id,
        itemId: seeded.menuItem.id,
        bytes: await pngBytes(),
      });
      assert.equal(replaced.ok, true);
      if (!replaced.ok) return;
      assert.equal(replaced.action, "replaced");
    });

    const afterReplace = await prisma.menuItem.findUnique({ where: { id: seeded.menuItem.id } });
    assert.ok(afterReplace?.imageStorageKey);
    assert.notEqual(afterReplace?.imageStorageKey, firstKey);
    assert.equal(afterReplace?.imageRevision, 2);
    assert.equal(await getMenuMediaStorage().getObject(firstKey!), null);
    const replacedEvents = await prisma.platformAuditEvent.findMany({
      where: { action: "MENU_ITEM_IMAGE_REPLACED", resourceId: seeded.menuItem.id },
    });
    assert.equal(replacedEvents.length, 1);

    await runWithForensicContext(forensicCtx(seeded.restaurant.id, host), async () => {
      const removed = await removeMenuItemImage({
        restaurantId: seeded.restaurant.id,
        itemId: seeded.menuItem.id,
      });
      assert.equal(removed.ok, true);
    });

    const afterRemove = await prisma.menuItem.findUnique({ where: { id: seeded.menuItem.id } });
    assert.equal(afterRemove?.imageStorageKey, null);
    assert.equal(afterRemove?.imageUrl, null);
    assert.equal(afterRemove?.imageRevision, 3);
    const removedEvents = await prisma.platformAuditEvent.findMany({
      where: { action: "MENU_ITEM_IMAGE_REMOVED", resourceId: seeded.menuItem.id },
    });
    assert.equal(removedEvents.length, 1);
    assert.equal(
      await prisma.platformAuditEvent.count({
        where: { action: "MENU_ITEM_IMAGE_UPLOADED", resourceId: seeded.menuItem.id },
      }),
      1,
    );
  });

  it("keeps the working image when replacement storage or commit fails", async () => {
    const suffix = `fail-${Date.now()}`;
    const seeded = await seedRestaurant(suffix);
    const host = `${seeded.restaurant.slug}.dvadtech.in`;

    await runWithForensicContext(forensicCtx(seeded.restaurant.id, host), async () => {
      const first = await uploadMenuItemImage({
        restaurantId: seeded.restaurant.id,
        itemId: seeded.menuItem.id,
        bytes: await jpegBytes(40, 40, { r: 10, g: 20, b: 30 }),
      });
      assert.equal(first.ok, true);
    });
    const original = await prisma.menuItem.findUnique({ where: { id: seeded.menuItem.id } });
    assert.ok(original?.imageStorageKey);
    const originalBytes = await getMenuMediaStorage().getObject(original.imageStorageKey!);
    assert.ok(originalBytes);

    const realStorage = getMenuMediaStorage();
    setMenuMediaStorageForTests({
      putObject: async () => {
        throw new Error("storage unavailable");
      },
      getObject: (key) => realStorage.getObject(key),
      deleteObject: (key) => realStorage.deleteObject(key),
      listObjects: (prefix) => realStorage.listObjects(prefix),
    });
    const replacementPng = await pngBytes();
    await assert.rejects(() =>
      uploadMenuItemImage({
        restaurantId: seeded.restaurant.id,
        itemId: seeded.menuItem.id,
        bytes: replacementPng,
      }),
    );
    const afterStorageFail = await prisma.menuItem.findUnique({ where: { id: seeded.menuItem.id } });
    assert.equal(afterStorageFail?.imageStorageKey, original.imageStorageKey);
    assert.ok(await getMenuMediaStorage().getObject(original.imageStorageKey!));
    resetMenuMediaStorageForTests();

    const listedBefore = new Set((await getMenuMediaStorage().listObjects()).map((row) => row.key));
    const origTx = prisma.$transaction.bind(prisma);
    prisma.$transaction = (async () => {
      throw new Error("commit failed");
    }) as typeof prisma.$transaction;
    const replacementWebp = await webpBytes();
    try {
      await assert.rejects(() =>
        uploadMenuItemImage({
          restaurantId: seeded.restaurant.id,
          itemId: seeded.menuItem.id,
          bytes: replacementWebp,
        }),
      );
    } finally {
      prisma.$transaction = origTx;
    }
    const afterTxFail = await prisma.menuItem.findUnique({ where: { id: seeded.menuItem.id } });
    assert.equal(afterTxFail?.imageStorageKey, original.imageStorageKey);
    assert.ok(await getMenuMediaStorage().getObject(original.imageStorageKey!));
    const listedAfter = await getMenuMediaStorage().listObjects();
    for (const object of listedAfter) {
      if (!listedBefore.has(object.key) && object.key !== original.imageStorageKey) {
        assert.fail(`new object ${object.key} was left behind after a failed commit`);
      }
    }
  });

  it("scopes public image GET to the restaurant hostname", async () => {
    const suffix = `host-${Date.now()}`;
    const abc = await seedRestaurant(`${suffix}-abc`);
    const xyz = await seedRestaurant(`${suffix}-xyz`);
    await runWithForensicContext(forensicCtx(abc.restaurant.id, `${abc.restaurant.slug}.dvadtech.in`), async () => {
      const uploaded = await uploadMenuItemImage({
        restaurantId: abc.restaurant.id,
        itemId: abc.menuItem.id,
        bytes: await jpegBytes(),
      });
      assert.equal(uploaded.ok, true);
    });

    const ok = await mediaGet(
      new NextRequest(`http://${abc.restaurant.slug}.dvadtech.in/api/menu/media/${abc.menuItem.id}?v=1`, {
        headers: { host: `${abc.restaurant.slug}.dvadtech.in` },
      }),
      routeCtx(abc.menuItem.id),
    );
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("content-type"), "image/webp");
    assert.equal(ok.headers.get("x-content-type-options"), "nosniff");
    assert.match(ok.headers.get("cache-control") ?? "", /max-age=31536000/);
    const body = Buffer.from(await ok.arrayBuffer());
    assert.equal((await sharp(body).metadata()).format, "webp");
    const text = `${ok.headers.get("x-storage-key") ?? ""}${JSON.stringify([...ok.headers.entries()])}`;
    assert.equal(text.includes("tenant/"), false);

    const wrong = await mediaGet(
      new NextRequest(`http://${xyz.restaurant.slug}.dvadtech.in/api/menu/media/${abc.menuItem.id}?v=1`, {
        headers: { host: `${xyz.restaurant.slug}.dvadtech.in` },
      }),
      routeCtx(abc.menuItem.id),
    );
    assert.equal(wrong.status, 404);
    const wrongJson = await wrong.json();
    assert.deepEqual(wrongJson, { error: "Not found" });
  });

  it("cannot upload or remove another restaurant's menu item image", async () => {
    const suffix = `cross-${Date.now()}`;
    const abc = await seedRestaurant(`${suffix}-abc`);
    const xyz = await seedRestaurant(`${suffix}-xyz`);
    const bytes = await jpegBytes();
    const uploaded = await uploadMenuItemImage({
      restaurantId: xyz.restaurant.id,
      itemId: abc.menuItem.id,
      bytes,
    });
    assert.equal(uploaded.ok, false);
    if (!uploaded.ok) assert.equal(uploaded.status, 404);
    const removed = await removeMenuItemImage({
      restaurantId: xyz.restaurant.id,
      itemId: abc.menuItem.id,
    });
    assert.equal(removed.ok, false);
    if (!removed.ok) assert.equal(removed.status, 404);
    const row = await prisma.menuItem.findUnique({ where: { id: abc.menuItem.id } });
    assert.equal(row?.imageStorageKey, null);
  });

  it("removes managed media after menu item deletion without failing the delete", async () => {
    const suffix = `del-${Date.now()}`;
    const seeded = await seedRestaurant(suffix);
    await runWithForensicContext(forensicCtx(seeded.restaurant.id, `${seeded.restaurant.slug}.dvadtech.in`), async () => {
      const uploaded = await uploadMenuItemImage({
        restaurantId: seeded.restaurant.id,
        itemId: seeded.menuItem.id,
        bytes: await jpegBytes(),
      });
      assert.equal(uploaded.ok, true);
    });
    const before = await prisma.menuItem.findUnique({ where: { id: seeded.menuItem.id } });
    assert.ok(before?.imageStorageKey);

    await prisma.$transaction(async (tx) => {
      await appendPlatformAuditEventInTx(tx, {
        category: AUDIT_CATEGORY.MENU,
        action: AUDIT_ACTION.MENU_ITEM_DELETED,
        restaurantId: seeded.restaurant.id,
        resourceType: "MenuItem",
        resourceId: before.id,
        resourceLabel: before.name,
        before: auditMenuItemSnapshot(before),
      });
      await tx.menuItem.delete({ where: { id: seeded.menuItem.id } });
    });
    await deleteManagedMenuMediaBestEffort(before.imageStorageKey);
    assert.equal(await prisma.menuItem.findUnique({ where: { id: seeded.menuItem.id } }), null);
    assert.equal(await getMenuMediaStorage().getObject(before.imageStorageKey!), null);
  });

  it("never deletes referenced objects and respects the cleanup grace period", async () => {
    const suffix = `clean-${Date.now()}`;
    const seeded = await seedRestaurant(suffix);
    await runWithForensicContext(forensicCtx(seeded.restaurant.id, `${seeded.restaurant.slug}.dvadtech.in`), async () => {
      const uploaded = await uploadMenuItemImage({
        restaurantId: seeded.restaurant.id,
        itemId: seeded.menuItem.id,
        bytes: await jpegBytes(),
      });
      assert.equal(uploaded.ok, true);
    });
    const live = await prisma.menuItem.findUnique({ where: { id: seeded.menuItem.id } });
    assert.ok(live?.imageStorageKey);

    const storage = getMenuMediaStorage();
    const recentKey = createMenuMediaStorageKey({
      tenantId: seeded.tenant.id,
      restaurantId: seeded.restaurant.id,
      menuItemId: "recentitemid123",
    });
    const oldKey = createMenuMediaStorageKey({
      tenantId: seeded.tenant.id,
      restaurantId: seeded.restaurant.id,
      menuItemId: "olditemid123456",
    });
    await storage.putObject({ key: recentKey, body: Buffer.from("recent"), contentType: "image/webp" });
    await storage.putObject({ key: oldKey, body: Buffer.from("old"), contentType: "image/webp" });
    const oldPath = path.join(mediaDir, oldKey);
    const oldTime = new Date(Date.now() - 36 * 60 * 60 * 1000);
    fs.utimesSync(oldPath, oldTime, oldTime);

    const dry = await runMenuMediaCleanup({ apply: false, graceMs: 24 * 60 * 60 * 1000 });
    assert.equal(dry.orphans.includes(live.imageStorageKey!), false);
    assert.equal(dry.orphans.includes(recentKey), false);
    assert.equal(dry.orphans.includes(oldKey), true);
    assert.ok(await storage.getObject(oldKey));
    assert.ok(await storage.getObject(recentKey));
    assert.ok(await storage.getObject(live.imageStorageKey!));

    const applied = await runMenuMediaCleanup({ apply: true, graceMs: 24 * 60 * 60 * 1000 });
    assert.equal(applied.deleted.includes(oldKey), true);
    assert.equal(applied.deleted.includes(live.imageStorageKey!), false);
    assert.equal(applied.deleted.includes(recentKey), false);
    assert.equal(await storage.getObject(oldKey), null);
    assert.ok(await storage.getObject(recentKey));
    assert.ok(await storage.getObject(live.imageStorageKey!));

    await deleteManagedMenuMediaBestEffort("https://evil.example/photo.jpg");
    await deleteManagedMenuMediaBestEffort("../../etc/passwd");
  });
});
