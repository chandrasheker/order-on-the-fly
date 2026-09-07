import { prisma } from "@/lib/prisma";
import { MENU_CATEGORY_PRESETS } from "@/lib/menu-setup-service";
import { MENU_IMPORT_DEFAULT_PREP_MINUTES } from "@/lib/menu-import/constants";
import { MenuImportValidationError } from "@/lib/menu-import/errors";
import {
  annotateDraftDuplicates,
  menuLabelsMatch,
  parseMenuImportDraft,
  parseStoredDraft,
  serializeDraft,
} from "@/lib/menu-import/draft";
import { isDefaultSkippedDuplicate, isEligibleApplyItem } from "@/lib/menu-import/eligibility";
import { paiseToRupeeNumber } from "@/lib/menu-import/prices";
import { importAuditMetadata } from "@/lib/menu-import/public";
import type { MenuImportApplyResult, MenuImportDraft } from "@/lib/menu-import/types";
import { slugify } from "@/lib/utils";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/platform/forensics/constants";
import { appendPlatformAuditEventInTx } from "@/platform/forensics/platform-audit-service";
import { auditMenuCategorySnapshot, auditMenuItemSnapshot } from "@/platform/forensics/snapshots";
import { setForensicResource } from "@/platform/forensics/request-context";
import { scheduleMenuSync } from "@/lib/aggregator-sync-service";

function parseResult(json: string | null): MenuImportApplyResult | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as MenuImportApplyResult;
  } catch {
    return null;
  }
}

function parseReviewedDraft(input: unknown): MenuImportDraft {
  try {
    return parseMenuImportDraft(input);
  } catch {
    throw new MenuImportValidationError("INVALID_DRAFT", "Invalid import draft", 400);
  }
}

export async function applyMenuImportForRestaurant(params: {
  restaurantId: string;
  importId: string;
  draft?: unknown;
}) {
  const reviewedDraft = params.draft !== undefined ? parseReviewedDraft(params.draft) : null;

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.menuImport.findFirst({
      where: { id: params.importId, restaurantId: params.restaurantId },
    });
    if (!current) {
      throw new MenuImportValidationError("NOT_FOUND", "Not found", 400);
    }
    if (current.status === "APPLIED") {
      const existing = parseResult(current.appliedResultJson);
      if (existing) return existing;
    }
    if (current.status === "CANCELLED") {
      throw new MenuImportValidationError("CANCELLED", undefined, 409, current.status);
    }
    if (current.status !== "READY_FOR_REVIEW") {
      throw new MenuImportValidationError("INVALID_STATE", undefined, 409, current.status);
    }

    const claimed = await tx.menuImport.updateMany({
      where: { id: current.id, restaurantId: params.restaurantId, status: "READY_FOR_REVIEW" },
      data: { status: "APPLYING" },
    });
    if (claimed.count !== 1) {
      const again = await tx.menuImport.findFirst({
        where: { id: current.id, restaurantId: params.restaurantId },
      });
      if (again?.status === "APPLIED") {
        const existing = parseResult(again.appliedResultJson);
        if (existing) return existing;
      }
      throw new MenuImportValidationError("INVALID_STATE", undefined, 409, again?.status);
    }

    const draft = reviewedDraft ?? parseStoredDraft(current.draftJson);
    if (!draft) {
      throw new MenuImportValidationError("PROVIDER_INVALID_OUTPUT", undefined, 409);
    }

    await tx.menuImport.update({
      where: { id: current.id },
      data: { draftJson: serializeDraft(draft) },
    });

    const existingCategories = await tx.menuCategory.findMany({
      where: { restaurantId: params.restaurantId },
      include: { items: { select: { id: true, name: true } } },
    });
    const categories = [...existingCategories];
    const maxCatSort = categories.reduce((max, category) => Math.max(max, category.sortOrder), -1);
    const annotated = annotateDraftDuplicates(
      draft,
      categories.flatMap((category) =>
        category.items.map((item) => ({ categoryName: category.name, itemName: item.name })),
      ),
    );

    const result: MenuImportApplyResult = {
      createdCategoryCount: 0,
      reusedCategoryCount: 0,
      createdItemCount: 0,
      skippedDuplicateCount: 0,
      skippedIncompleteCount: 0,
      categoryIds: [],
      itemIds: [],
    };

    let nextCatSort = maxCatSort + 1;

    for (const draftCategory of annotated.categories) {
      const eligible: typeof draftCategory.items = [];
      for (const draftItem of draftCategory.items) {
        if (isDefaultSkippedDuplicate(draftItem)) {
          result.skippedDuplicateCount += 1;
          continue;
        }
        if (!isEligibleApplyItem(draftItem)) {
          result.skippedIncompleteCount += 1;
          continue;
        }
        eligible.push(draftItem);
      }
      if (eligible.length === 0) {
        continue;
      }

      let category = categories.find((row) => menuLabelsMatch(row.name, draftCategory.name));
      if (!category) {
        const baseSlug = slugify(draftCategory.name);
        if (!baseSlug) {
          result.skippedIncompleteCount += eligible.length;
          continue;
        }
        let slug = baseSlug;
        let attempt = 1;
        while (categories.some((row) => row.slug === slug)) {
          attempt += 1;
          slug = `${baseSlug}-${attempt}`;
        }
        const preset = MENU_CATEGORY_PRESETS.find(
          (item) => item.slug === baseSlug || item.name.toLowerCase() === draftCategory.name.toLowerCase(),
        );
        const created = await tx.menuCategory.create({
          data: {
            restaurantId: params.restaurantId,
            name: draftCategory.name.trim(),
            slug,
            icon: preset?.icon || "🍽️",
            sortOrder: nextCatSort++,
          },
          include: { items: { select: { id: true, name: true } } },
        });
        setForensicResource({ type: "MenuCategory", id: created.id, label: created.name });
        await appendPlatformAuditEventInTx(tx, {
          category: AUDIT_CATEGORY.MENU,
          action: AUDIT_ACTION.MENU_CATEGORY_CREATED,
          restaurantId: params.restaurantId,
          resourceType: "MenuCategory",
          resourceId: created.id,
          resourceLabel: created.name,
          after: auditMenuCategorySnapshot(created),
        });
        category = created;
        categories.push(created);
        result.createdCategoryCount += 1;
      } else {
        result.reusedCategoryCount += 1;
      }
      result.categoryIds.push(category.id);

      const liveNames = category.items.map((item) => item.name);
      const maxItemSort = await tx.menuItem.aggregate({
        where: { categoryId: category.id },
        _max: { sortOrder: true },
      });
      let nextItemSort = (maxItemSort._max.sortOrder ?? 0) + 1;

      for (const draftItem of eligible) {
        const duplicate = liveNames.some((name) => menuLabelsMatch(name, draftItem.name));
        if (duplicate && draftItem.skipOnApply !== false) {
          result.skippedDuplicateCount += 1;
          continue;
        }

        const created = await tx.menuItem.create({
          data: {
            name: draftItem.name.trim(),
            description: draftItem.description,
            price: paiseToRupeeNumber(draftItem.pricePaise!),
            categoryId: category.id,
            prepTimeMinutes: draftItem.prepTimeMinutes ?? MENU_IMPORT_DEFAULT_PREP_MINUTES,
            isAvailable: true,
            isVeg: draftItem.isVeg ?? true,
            isSpicy: false,
            trackInventory: false,
            sortOrder: nextItemSort++,
          },
        });
        liveNames.push(created.name);
        result.createdItemCount += 1;
        result.itemIds.push(created.id);
        setForensicResource({ type: "MenuItem", id: created.id, label: created.name });
        await appendPlatformAuditEventInTx(tx, {
          category: AUDIT_CATEGORY.MENU,
          action: AUDIT_ACTION.MENU_ITEM_CREATED,
          restaurantId: params.restaurantId,
          resourceType: "MenuItem",
          resourceId: created.id,
          resourceLabel: created.name,
          after: auditMenuItemSnapshot(created),
        });
      }
    }

    const applied = await tx.menuImport.update({
      where: { id: current.id },
      data: {
        status: "APPLIED",
        appliedAt: new Date(),
        appliedResultJson: JSON.stringify(result),
        errorCode: null,
        errorMessage: null,
      },
    });
    setForensicResource({ type: "MenuImport", id: applied.id, label: "menu-import" });
    await appendPlatformAuditEventInTx(tx, {
      category: AUDIT_CATEGORY.MENU,
      action: AUDIT_ACTION.MENU_IMPORT_APPLIED,
      restaurantId: params.restaurantId,
      resourceType: "MenuImport",
      resourceId: applied.id,
      resourceLabel: "menu-import",
      metadata: importAuditMetadata({
        ...applied,
        extra: {
          createdCategoryCount: result.createdCategoryCount,
          createdItemCount: result.createdItemCount,
          skippedDuplicateCount: result.skippedDuplicateCount,
        },
      }),
    });
    return result;
  });

  scheduleMenuSync(params.restaurantId);
  return result;
}
