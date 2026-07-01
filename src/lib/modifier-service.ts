import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/feature-flags";

export type SelectedModifier = {
  optionId: string;
  groupId: string;
  name: string;
  priceDelta: number;
};

export async function listModifierGroups(restaurantId: string) {
  return prisma.modifierGroup.findMany({
    where: { restaurantId },
    include: { options: { orderBy: { sortOrder: "asc" } } },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getModifiersForMenuItem(menuItemId: string) {
  const links = await prisma.menuItemModifierGroup.findMany({
    where: { menuItemId },
    include: {
      modifierGroup: {
        include: { options: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  return links.map((l) => l.modifierGroup);
}

export async function upsertModifierGroup(
  restaurantId: string,
  data: {
    id?: string;
    name: string;
    required?: boolean;
    minSelect?: number;
    maxSelect?: number;
    options: Array<{ id?: string; name: string; priceDelta?: number; isDefault?: boolean }>;
    menuItemIds?: string[];
  },
) {
  if (!(await isFeatureEnabled(restaurantId, "menu_modifiers"))) {
    throw new Error("Menu modifiers not enabled");
  }

  let groupId = data.id;
  if (groupId) {
    await prisma.modifierOption.deleteMany({ where: { groupId } });
    await prisma.modifierGroup.update({
      where: { id: groupId },
      data: {
        name: data.name.trim(),
        required: data.required ?? false,
        minSelect: data.minSelect ?? 0,
        maxSelect: data.maxSelect ?? 1,
        options: {
          create: data.options.map((o, i) => ({
            name: o.name.trim(),
            priceDelta: o.priceDelta ?? 0,
            isDefault: o.isDefault ?? false,
            sortOrder: i,
          })),
        },
      },
    });
  } else {
    const created = await prisma.modifierGroup.create({
      data: {
        restaurantId,
        name: data.name.trim(),
        required: data.required ?? false,
        minSelect: data.minSelect ?? 0,
        maxSelect: data.maxSelect ?? 1,
        options: {
          create: data.options.map((o, i) => ({
            name: o.name.trim(),
            priceDelta: o.priceDelta ?? 0,
            isDefault: o.isDefault ?? false,
            sortOrder: i,
          })),
        },
      },
    });
    groupId = created.id;
  }

  if (data.menuItemIds) {
    await prisma.menuItemModifierGroup.deleteMany({ where: { modifierGroupId: groupId } });
    if (data.menuItemIds.length > 0) {
      await prisma.menuItemModifierGroup.createMany({
        data: data.menuItemIds.map((menuItemId) => ({ menuItemId, modifierGroupId: groupId! })),
      });
    }
  }

  return prisma.modifierGroup.findUnique({
    where: { id: groupId },
    include: { options: true, menuItems: true },
  });
}

export async function validateAndPriceModifiers(
  restaurantId: string,
  menuItemId: string,
  selectedOptionIds: string[],
): Promise<{ modifiers: SelectedModifier[]; extraTotal: number }> {
  if (!(await isFeatureEnabled(restaurantId, "menu_modifiers"))) {
    return { modifiers: [], extraTotal: 0 };
  }

  const groups = await getModifiersForMenuItem(menuItemId);
  const modifiers: SelectedModifier[] = [];
  let extraTotal = 0;

  for (const group of groups) {
    const picked = group.options.filter((o) => selectedOptionIds.includes(o.id));
    if (group.required && picked.length === 0) {
      const defaults = group.options.filter((o) => o.isDefault);
      if (defaults.length === 0) {
        throw new Error(`Choose an option for ${group.name}`);
      }
      picked.push(...defaults.slice(0, 1));
    }
    if (picked.length < group.minSelect) {
      throw new Error(`Select at least ${group.minSelect} option(s) for ${group.name}`);
    }
    if (picked.length > group.maxSelect) {
      throw new Error(`Select at most ${group.maxSelect} option(s) for ${group.name}`);
    }
    for (const opt of picked) {
      modifiers.push({
        optionId: opt.id,
        groupId: group.id,
        name: opt.name,
        priceDelta: opt.priceDelta,
      });
      extraTotal += opt.priceDelta;
    }
  }

  return { modifiers, extraTotal };
}

export function modifiersToJson(modifiers: SelectedModifier[]) {
  return modifiers.length > 0 ? JSON.stringify(modifiers) : null;
}

export function formatModifiersNotes(modifiers: SelectedModifier[]) {
  if (!modifiers.length) return "";
  return modifiers.map((m) => m.name).join(", ");
}
