import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import type { PrismaClient } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth";

const dbPath = path.join(os.tmpdir(), `tabletap-m6b-${process.pid}-${Date.now()}.db`);
const mediaDir = path.join(process.cwd(), ".data", "menu-media-tests", `m6b-${process.pid}-${Date.now()}`);
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || "m6b-test-jwt-secret-must-be-32-chars!";
process.env.TENANT_BASE_DOMAIN = "dvadtech.in";
process.env.MENU_MEDIA_STORAGE = "local";
process.env.MENU_MEDIA_LOCAL_DIR = mediaDir;
process.env.MENU_IMPORT_PROVIDER = "mock";
process.env.JOB_QUEUE_INLINE = "0";
delete process.env.MENU_IMPORT_API_KEY;

let prisma: PrismaClient;
let createMenuImportFromUpload: typeof import("@/lib/menu-import/service").createMenuImportFromUpload;
let findRestaurantMenuImport: typeof import("@/lib/menu-import/service").findRestaurantMenuImport;
let saveMenuImportDraft: typeof import("@/lib/menu-import/service").saveMenuImportDraft;
let cancelMenuImport: typeof import("@/lib/menu-import/service").cancelMenuImport;
let applyOwnedMenuImport: typeof import("@/lib/menu-import/service").applyOwnedMenuImport;
let processMenuImportById: typeof import("@/lib/menu-import/process").processMenuImportById;
let validateMenuImportFiles: typeof import("@/lib/menu-import/validate-source").validateMenuImportFiles;
let MenuImportValidationError: typeof import("@/lib/menu-import/errors").MenuImportValidationError;
let getLastMockExtractInvocation: typeof import("@/lib/menu-import/providers/mock").getLastMockExtractInvocation;
let setNextMockExtractDraft: typeof import("@/lib/menu-import/providers/mock").setNextMockExtractDraft;
let resetMockMenuImportExtractor: typeof import("@/lib/menu-import/providers/mock").resetMockMenuImportExtractor;
let runMenuImportCleanup: typeof import("@/lib/menu-import/cleanup").runMenuImportCleanup;
let runMenuMediaCleanup: typeof import("@/lib/menu-media/cleanup").runMenuMediaCleanup;
let isManagedMenuImportSourceKey: typeof import("@/lib/menu-media/keys").isManagedMenuImportSourceKey;
let isManagedMenuMediaKey: typeof import("@/lib/menu-media/keys").isManagedMenuMediaKey;
let createMenuMediaStorageKey: typeof import("@/lib/menu-media/keys").createMenuMediaStorageKey;
let resetMenuMediaStorageForTests: typeof import("@/lib/menu-media/storage").resetMenuMediaStorageForTests;
let hashPassword: typeof import("@/lib/auth").hashPassword;
let redactSecrets: typeof import("@/platform/forensics/redactor").redactSecrets;
let resolveMenuImportConfig: typeof import("@/lib/menu-import/config").resolveMenuImportConfig;
let rupeesStringToPaise: typeof import("@/lib/menu-import/prices").rupeesStringToPaise;
let parsePriceFromLine: typeof import("@/lib/menu-import/prices").parsePriceFromLine;

async function jpegBytes(width = 80, height = 60) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } })
    .jpeg({ quality: 80 })
    .toBuffer();
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

async function sampleMenuPdf(pages = 1) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([612, 792]);
    if (i === 0) {
      page.drawText("STARTERS", { x: 50, y: 720, size: 18, font });
      page.drawText("Chicken 65           Rs. 249", { x: 50, y: 690, size: 12, font });
      page.drawText("Paneer 65            Rs. 219", { x: 50, y: 670, size: 12, font });
    }
    if (i === 0 && pages === 1) {
      page.drawText("BIRYANI", { x: 50, y: 630, size: 18, font });
      page.drawText("Chicken Dum Biryani  Rs. 319", { x: 50, y: 600, size: 12, font });
      page.drawText("Veg Biryani          Rs. 249", { x: 50, y: 580, size: 12, font });
    }
    if (i > 0) {
      page.drawText(`PAGE ${i + 1}`, { x: 50, y: 720, size: 18, font });
      page.drawText(`Extra Item ${i + 1}     Rs. 100`, { x: 50, y: 690, size: 12, font });
    }
  }
  return Buffer.from(await doc.save());
}

function encryptedPdfBytes() {
  return Buffer.from(`%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
trailer << /Root 1 0 R /Encrypt 4 0 R >>
%%EOF
`);
}

before(async () => {
  fs.mkdirSync(mediaDir, { recursive: true });
  execFileSync(
    process.execPath,
    [path.join(process.cwd(), "scripts", "run-with-mem.js"), "npx", "prisma", "db", "push", "--url", `file:${dbPath}`],
    { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: `file:${dbPath}` }, stdio: "inherit" },
  );
  ({ prisma } = await import("@/lib/prisma"));
  ({
    createMenuImportFromUpload,
    findRestaurantMenuImport,
    saveMenuImportDraft,
    cancelMenuImport,
    applyOwnedMenuImport,
  } = await import("@/lib/menu-import/service"));
  ({ processMenuImportById } = await import("@/lib/menu-import/process"));
  ({ validateMenuImportFiles } = await import("@/lib/menu-import/validate-source"));
  ({ MenuImportValidationError } = await import("@/lib/menu-import/errors"));
  ({ getLastMockExtractInvocation, setNextMockExtractDraft, resetMockMenuImportExtractor } = await import(
    "@/lib/menu-import/providers/mock"
  ));
  ({ runMenuImportCleanup } = await import("@/lib/menu-import/cleanup"));
  ({ runMenuMediaCleanup } = await import("@/lib/menu-media/cleanup"));
  ({ isManagedMenuImportSourceKey, isManagedMenuMediaKey, createMenuMediaStorageKey } = await import(
    "@/lib/menu-media/keys"
  ));
  ({ resetMenuMediaStorageForTests } = await import("@/lib/menu-media/storage"));
  ({ hashPassword } = await import("@/lib/auth"));
  ({ redactSecrets } = await import("@/platform/forensics/redactor"));
  ({ resolveMenuImportConfig } = await import("@/lib/menu-import/config"));
  ({ rupeesStringToPaise, parsePriceFromLine } = await import("@/lib/menu-import/prices"));
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
    data: { name: `T ${suffix}`, nameNormalized: `t ${suffix}`, slug: `t-${suffix}`, isEnabled: true },
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
  const owner = await prisma.user.create({
    data: {
      email: `owner-${suffix}@example.test`,
      name: `Owner ${suffix}`,
      role: "OWNER",
      restaurantId: restaurant.id,
      passwordHash: await hashPassword("password-12"),
    },
  });
  return { tenant, restaurant, owner };
}

function sessionFor(owner: { id: string; email: string; name: string }, restaurant: { id: string; name: string; slug: string }): SessionUser {
  return {
    id: owner.id,
    email: owner.email,
    name: owner.name,
    role: "OWNER",
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    restaurantSlug: restaurant.slug,
  };
}

async function liveItemNames(restaurantId: string) {
  const items = await prisma.menuItem.findMany({
    where: { category: { restaurantId } },
    select: { name: true, price: true, category: { select: { name: true } } },
  });
  return items;
}

describe("M6-B source validation", () => {
  it("accepts a parseable PDF", async () => {
    const pdf = await sampleMenuPdf();
    const result = await validateMenuImportFiles([{ originalName: "menu.pdf", bytes: pdf }]);
    assert.equal(result.sourceType, "PDF");
    assert.equal(result.pageCount, 1);
  });

  it("accepts JPG, JPEG, PNG, and WebP as one image import", async () => {
    const files = [
      { originalName: "page-1.jpg", bytes: await jpegBytes() },
      { originalName: "page-2.jpeg", bytes: await jpegBytes(90, 70) },
      { originalName: "page-3.png", bytes: await pngBytes() },
      { originalName: "page-4.webp", bytes: await webpBytes() },
    ];
    const result = await validateMenuImportFiles(files);
    assert.equal(result.sourceType, "IMAGES");
    assert.equal(result.pageCount, 4);
    assert.deepEqual(
      result.files.map((file) => file.pageNumber),
      [1, 2, 3, 4],
    );
  });

  it("rejects unsupported and malformed files", async () => {
    await assert.rejects(
      () => validateMenuImportFiles([{ originalName: "menu.zip", bytes: Buffer.from("PK\u0003\u0004fake") }]),
      (error: unknown) => error instanceof MenuImportValidationError && error.message.includes("Unsupported"),
    );
    await assert.rejects(
      () => validateMenuImportFiles([{ originalName: "menu.pdf", bytes: Buffer.from("%PDF-1.4 not really") }]),
      (error: unknown) => error instanceof MenuImportValidationError,
    );
    await assert.rejects(
      () => validateMenuImportFiles([{ originalName: "pic.jpg", bytes: Buffer.from("not-an-image") }]),
      (error: unknown) => error instanceof MenuImportValidationError,
    );
    await assert.rejects(
      () => validateMenuImportFiles([{ originalName: "secret.pdf", bytes: encryptedPdfBytes() }]),
      (error: unknown) => error instanceof MenuImportValidationError && error.code === "ENCRYPTED_PDF",
    );
  });

  it("enforces file, page, and total size limits", async () => {
    const huge = Buffer.alloc(10 * 1024 * 1024 + 16, 1);
    huge.set(Buffer.from("%PDF-"), 0);
    await assert.rejects(
      () => validateMenuImportFiles([{ originalName: "huge.pdf", bytes: huge }]),
      (error: unknown) => error instanceof MenuImportValidationError && error.status === 413,
    );
    const images: Array<{ originalName: string; bytes: Buffer }> = [];
    for (let i = 0; i < 21; i += 1) {
      images.push({ originalName: `p${i}.jpg`, bytes: await jpegBytes(16, 16) });
    }
    await assert.rejects(
      () => validateMenuImportFiles(images),
      (error: unknown) => error instanceof MenuImportValidationError && error.code === "TOO_MANY_PAGES",
    );
    const manyPages = await sampleMenuPdf(21);
    await assert.rejects(
      () => validateMenuImportFiles([{ originalName: "long.pdf", bytes: manyPages }]),
      (error: unknown) => error instanceof MenuImportValidationError && error.code === "TOO_MANY_PAGES",
    );
  });

  it("normalizes common price strings to integer paise and flags ranges", () => {
    assert.equal(rupeesStringToPaise("249"), 24900);
    assert.equal(rupeesStringToPaise("249.00"), 24900);
    assert.equal(parsePriceFromLine("₹249").paise, 24900);
    assert.equal(parsePriceFromLine("Rs. 249").paise, 24900);
    assert.equal(parsePriceFromLine("INR 249").paise, 24900);
    assert.equal(parsePriceFromLine("249 / 349").ambiguous, true);
    assert.equal(parsePriceFromLine("249 / 349").paise, null);
    assert.equal(parsePriceFromLine("Chicken 65           Rs. 249").paise, 24900);
    assert.equal(parsePriceFromLine("Chicken 65           Rs. 249").ambiguous, false);
  });
});

describe("M6-B import workflow", () => {
  it("keeps multi-image uploads as one ordered import and isolates tenants", async () => {
    const abc = await seedRestaurant("abc-imp");
    const xyz = await seedRestaurant("xyz-imp");
    resetMockMenuImportExtractor();
    const created = await createMenuImportFromUpload({
      session: sessionFor(abc.owner, abc.restaurant),
      files: [
        { originalName: "menu-page-1.jpg", bytes: await jpegBytes() },
        { originalName: "menu-page-2.jpg", bytes: await jpegBytes(70, 70) },
        { originalName: "menu-page-3.jpg", bytes: await jpegBytes(60, 60) },
      ],
    });
    assert.equal(created.sourceType, "IMAGES");
    assert.equal(created.sourceFileCount, 3);
    assert.equal(created.pageCount, 3);
    assert.equal(created.status, "UPLOADED");
    const meta = JSON.parse(created.sourceMetaJson ?? "{}") as { files: Array<{ pageNumber: number; key: string }> };
    assert.deepEqual(meta.files.map((file) => file.pageNumber), [1, 2, 3]);
    assert.ok(meta.files.every((file) => isManagedMenuImportSourceKey(file.key)));
    assert.ok(meta.files.every((file) => !isManagedMenuMediaKey(file.key)));

    const stolen = await findRestaurantMenuImport(xyz.restaurant.id, created.id);
    assert.equal(stolen, null);
    const stolenApply = await applyOwnedMenuImport({ restaurantId: xyz.restaurant.id, importId: created.id });
    assert.equal(stolenApply, null);
    assert.equal(await findRestaurantMenuImport(abc.restaurant.id, created.id).then((row) => row?.id), created.id);
  });

  it("uses the text path for selectable PDFs and the image path for photos", async () => {
    const abc = await seedRestaurant("text-pdf");
    resetMockMenuImportExtractor();
    const pdfImport = await createMenuImportFromUpload({
      session: sessionFor(abc.owner, abc.restaurant),
      files: [{ originalName: "menu.pdf", bytes: await sampleMenuPdf() }],
    });
    const processed = await processMenuImportById(pdfImport.id);
    assert.equal(processed?.status, "READY_FOR_REVIEW");
    const textCall = getLastMockExtractInvocation();
    assert.equal(textCall?.mode, "text");
    assert.equal(textCall?.imagePages, 0);
    const draft = JSON.parse(processed?.draftJson ?? "{}") as { categories: Array<{ name: string; items: Array<{ name: string; pricePaise: number }> }> };
    assert.ok(draft.categories.some((category) => /starter/i.test(category.name)));
    assert.ok(draft.categories.some((category) => category.items.some((item) => item.name.includes("Chicken 65") && item.pricePaise === 24900)));

    const before = await liveItemNames(abc.restaurant.id);
    assert.equal(before.length, 0);

    resetMockMenuImportExtractor();
    const photoImport = await createMenuImportFromUpload({
      session: sessionFor(abc.owner, abc.restaurant),
      files: [{ originalName: "page.jpg", bytes: await jpegBytes() }],
    });
    const photoProcessed = await processMenuImportById(photoImport.id);
    assert.equal(photoProcessed?.status, "READY_FOR_REVIEW");
    const imageCall = getLastMockExtractInvocation();
    assert.equal(imageCall?.mode, "image");
    assert.ok((imageCall?.imagePages ?? 0) >= 1);
    const stillEmpty = await liveItemNames(abc.restaurant.id);
    assert.equal(stillEmpty.length, 0);
  });

  it("turns malformed provider output into FAILED without touching the live menu", async () => {
    const abc = await seedRestaurant("bad-provider");
    setNextMockExtractDraft({ not: "a draft" });
    const created = await createMenuImportFromUpload({
      session: sessionFor(abc.owner, abc.restaurant),
      files: [{ originalName: "menu.pdf", bytes: await sampleMenuPdf() }],
    });
    const processed = await processMenuImportById(created.id);
    assert.equal(processed?.status, "FAILED");
    assert.equal(processed?.errorCode, "PROVIDER_INVALID_OUTPUT");
    assert.equal((await liveItemNames(abc.restaurant.id)).length, 0);
    resetMockMenuImportExtractor();
  });

  it("persists draft edits and applies them idempotently, reusing categories and skipping live items", async () => {
    const abc = await seedRestaurant("apply-flow");
    const starters = await prisma.menuCategory.create({
      data: { name: "Starters", slug: "starters", restaurantId: abc.restaurant.id, icon: "🥗" },
    });
    await prisma.menuItem.create({
      data: { name: "Paneer 65", price: 199, categoryId: starters.id, prepTimeMinutes: 10 },
    });

    const created = await createMenuImportFromUpload({
      session: sessionFor(abc.owner, abc.restaurant),
      files: [{ originalName: "menu.pdf", bytes: await sampleMenuPdf() }],
    });
    await processMenuImportById(created.id);
    const ready = await findRestaurantMenuImport(abc.restaurant.id, created.id);
    const draft = JSON.parse(ready?.draftJson ?? "{}") as {
      categories: Array<{
        id: string;
        name: string;
        items: Array<{ id: string; name: string; pricePaise: number | null; priceAmbiguous?: boolean; description: string | null; isVeg: boolean | null }>;
      }>;
    };
    const chicken = draft.categories.flatMap((category) => category.items).find((item) => item.name.includes("Chicken 65"));
    assert.ok(chicken);
    chicken.pricePaise = 25900;
    draft.categories = draft.categories.map((category) => ({
      ...category,
      items: category.items.filter((item) => !item.name.includes("Veg Biryani")),
    }));
    draft.categories.push({
      id: "cat-added",
      name: "Breads",
      items: [
        {
          id: "item-added",
          name: "Butter Naan",
          description: "Tandoor",
          pricePaise: 4900,
          priceAmbiguous: false,
          isVeg: true,
        },
      ],
    });
    const saved = await saveMenuImportDraft({
      restaurantId: abc.restaurant.id,
      importId: created.id,
      draft,
    });
    assert.equal(saved?.status, "READY_FOR_REVIEW");
    const persisted = JSON.parse(saved?.draftJson ?? "{}") as typeof draft;
    assert.ok(persisted.categories.flatMap((category) => category.items).some((item) => item.pricePaise === 25900));
    assert.ok(!persisted.categories.flatMap((category) => category.items).some((item) => item.name.includes("Veg Biryani")));

    const first = await applyOwnedMenuImport({ restaurantId: abc.restaurant.id, importId: created.id });
    assert.ok(first);
    assert.equal(first.import?.status, "APPLIED");
    assert.ok((first.result.createdItemCount ?? 0) >= 3);
    const live = await liveItemNames(abc.restaurant.id);
    const paneer = live.find((item) => item.name === "Paneer 65");
    assert.equal(paneer?.price, 199);
    assert.ok(live.some((item) => item.name.includes("Chicken 65") && item.price === 259));
    assert.ok(live.some((item) => item.name === "Butter Naan"));
    assert.ok(!live.some((item) => item.name.includes("Veg Biryani")));
    const starterRows = await prisma.menuCategory.findMany({
      where: { restaurantId: abc.restaurant.id, name: "Starters" },
    });
    assert.equal(starterRows.length, 1);

    const second = await applyOwnedMenuImport({ restaurantId: abc.restaurant.id, importId: created.id });
    assert.deepEqual(second?.result, first.result);
    const afterSecond = await liveItemNames(abc.restaurant.id);
    assert.equal(afterSecond.length, live.length);

    const appliedAgain = await processMenuImportById(created.id);
    assert.equal(appliedAgain?.status, "APPLIED");
  });

  it("rejects apply after cancel and does not publish the draft", async () => {
    const abc = await seedRestaurant("cancel-flow");
    const created = await createMenuImportFromUpload({
      session: sessionFor(abc.owner, abc.restaurant),
      files: [{ originalName: "menu.pdf", bytes: await sampleMenuPdf() }],
    });
    await processMenuImportById(created.id);
    const cancelled = await cancelMenuImport({ restaurantId: abc.restaurant.id, importId: created.id });
    assert.equal(cancelled?.status, "CANCELLED");
    await assert.rejects(
      () => applyOwnedMenuImport({ restaurantId: abc.restaurant.id, importId: created.id }),
      (error: unknown) => error instanceof MenuImportValidationError && error.code === "CANCELLED",
    );
    assert.equal((await liveItemNames(abc.restaurant.id)).length, 0);
  });

  it("does not create two drafts when processing is retried", async () => {
    const abc = await seedRestaurant("retry-once");
    const created = await createMenuImportFromUpload({
      session: sessionFor(abc.owner, abc.restaurant),
      files: [{ originalName: "menu.pdf", bytes: await sampleMenuPdf() }],
    });
    const first = await processMenuImportById(created.id);
    const second = await processMenuImportById(created.id);
    assert.equal(first?.status, "READY_FOR_REVIEW");
    assert.equal(second?.status, "READY_FOR_REVIEW");
    assert.equal(first?.draftJson, second?.draftJson);
    assert.equal(second?.processingAttempt, first?.processingAttempt);
  });

  it("records forensic import events without secrets or raw documents", async () => {
    const abc = await seedRestaurant("forensic-imp");
    const created = await createMenuImportFromUpload({
      session: sessionFor(abc.owner, abc.restaurant),
      files: [{ originalName: "menu.pdf", bytes: await sampleMenuPdf() }],
    });
    await processMenuImportById(created.id);
    await applyOwnedMenuImport({ restaurantId: abc.restaurant.id, importId: created.id });
    const events = await prisma.platformAuditEvent.findMany({
      where: { restaurantId: abc.restaurant.id, action: { startsWith: "MENU_IMPORT_" } },
    });
    const actions = events.map((event) => event.action);
    assert.ok(actions.includes("MENU_IMPORT_CREATED"));
    assert.ok(actions.includes("MENU_IMPORT_PROCESSED"));
    assert.ok(actions.includes("MENU_IMPORT_APPLIED"));
    for (const event of events) {
      const blob = `${event.metadataJson ?? ""}${event.afterJson ?? ""}${event.beforeJson ?? ""}`;
      assert.equal(/sk-|api[_-]?key|Bearer |%PDF-|menu-imports\//i.test(blob), false);
      const metadata = event.metadataJson ? JSON.parse(event.metadataJson) : {};
      assert.equal(metadata.importId, created.id);
      assert.ok(metadata.fileCount != null);
    }
    const redacted = redactSecrets({
      MENU_IMPORT_API_KEY: "sk-secret-value",
      providerResponse: { raw: "ocr dump" },
    });
    assert.equal(redacted.MENU_IMPORT_API_KEY, "[REDACTED]");
    assert.equal(redacted.providerResponse, "[REDACTED]");
  });

  it("does not start failing when extraction credentials are missing", () => {
    const config = resolveMenuImportConfig({ MENU_IMPORT_PROVIDER: "openai" });
    assert.equal(config.configured, false);
  });

  it("cleans import sources without deleting food photographs", async () => {
    const abc = await seedRestaurant("cleanup-imp");
    const created = await createMenuImportFromUpload({
      session: sessionFor(abc.owner, abc.restaurant),
      files: [{ originalName: "page.jpg", bytes: await jpegBytes() }],
    });
    const category = await prisma.menuCategory.create({
      data: { name: "Mains", slug: "mains-clean", restaurantId: abc.restaurant.id },
    });
    const photoKey = createMenuMediaStorageKey({
      tenantId: abc.tenant.id,
      restaurantId: abc.restaurant.id,
      menuItemId: "itemclean1",
    });
    const { getMenuMediaStorage } = await import("@/lib/menu-media/storage");
    await getMenuMediaStorage().putObject({
      key: photoKey,
      body: await jpegBytes(),
      contentType: "image/webp",
    });
    await prisma.menuItem.create({
      data: {
        name: "Photo Item",
        price: 100,
        categoryId: category.id,
        imageStorageKey: photoKey,
        imageUrl: "/api/menu/media/itemclean1?v=1",
      },
    });
    await prisma.menuImport.update({
      where: { id: created.id },
      data: { status: "APPLIED", appliedAt: new Date("2020-01-01"), updatedAt: new Date("2020-01-01") },
    });
    const result = await runMenuImportCleanup({
      apply: true,
      now: new Date("2020-01-20"),
      terminalRetentionMs: 7 * 24 * 60 * 60 * 1000,
    });
    assert.ok(result.purgedImports.includes(created.id));
    const media = await runMenuMediaCleanup({ apply: false, now: new Date("2020-01-20") });
    assert.equal(media.orphans.includes(photoKey), false);
    assert.ok(await getMenuMediaStorage().getObject(photoKey));
  });
});
