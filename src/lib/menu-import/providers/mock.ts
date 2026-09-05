import { parseMenuImportDraft } from "@/lib/menu-import/draft";
import { parseTextMenuPages } from "@/lib/menu-import/providers/local-text";
import type { MenuImportDraft, MenuImportExtractInput, MenuImportExtractor } from "@/lib/menu-import/types";

export type MockExtractInvocation = {
  mode: "text" | "image" | "mixed";
  pageCount: number;
  textPages: number;
  imagePages: number;
};

let lastInvocation: MockExtractInvocation | null = null;
let nextDraft: MenuImportDraft | unknown | null = null;
let nextError: Error | null = null;

export function getLastMockExtractInvocation() {
  return lastInvocation;
}

export function setNextMockExtractDraft(draft: MenuImportDraft | unknown | null) {
  nextDraft = draft;
}

export function setNextMockExtractError(error: Error | null) {
  nextError = error;
}

export function resetMockMenuImportExtractor() {
  lastInvocation = null;
  nextDraft = null;
  nextError = null;
}

const CANNED_IMAGE_DRAFT: MenuImportDraft = {
  categories: [
    {
      id: "cat-mock-starters",
      name: "Starters",
      items: [
        {
          id: "item-mock-c65",
          name: "Chicken 65",
          description: null,
          pricePaise: 24900,
          priceAmbiguous: false,
          isVeg: false,
          sourcePage: 1,
        },
        {
          id: "item-mock-p65",
          name: "Paneer 65",
          description: null,
          pricePaise: 21900,
          priceAmbiguous: false,
          isVeg: true,
          sourcePage: 1,
        },
      ],
    },
    {
      id: "cat-mock-biryani",
      name: "Biryani",
      items: [
        {
          id: "item-mock-cdb",
          name: "Chicken Dum Biryani",
          description: null,
          pricePaise: 31900,
          priceAmbiguous: false,
          isVeg: false,
          sourcePage: 2,
        },
        {
          id: "item-mock-vb",
          name: "Veg Biryani",
          description: null,
          pricePaise: 24900,
          priceAmbiguous: false,
          isVeg: true,
          sourcePage: 2,
        },
      ],
    },
  ],
};

export class MockMenuImportExtractor implements MenuImportExtractor {
  async extractMenu(input: MenuImportExtractInput): Promise<MenuImportDraft> {
    const textPages = input.pages.filter((page) => page.kind === "text").length;
    const imagePages = input.pages.filter((page) => page.kind === "image").length;
    lastInvocation = {
      mode: textPages && imagePages ? "mixed" : imagePages ? "image" : "text",
      pageCount: input.pages.length,
      textPages,
      imagePages,
    };
    if (nextError) {
      const error = nextError;
      nextError = null;
      throw error;
    }
    if (nextDraft != null) {
      const draft = nextDraft;
      nextDraft = null;
      return parseMenuImportDraft(draft);
    }
    if (textPages > 0 && imagePages === 0) {
      return parseTextMenuPages(input.pages);
    }
    if (textPages > 0) {
      const fromText = parseTextMenuPages(input.pages.filter((page) => page.kind === "text"));
      if (fromText.categories.length > 0) return fromText;
    }
    return parseMenuImportDraft(CANNED_IMAGE_DRAFT);
  }
}
