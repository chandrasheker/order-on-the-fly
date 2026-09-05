import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterBySearch, normalizeListPageSize, paginateItems } from "@/lib/paged-list";

describe("paged list helpers", () => {
  it("defaults page size to 10 and accepts 50 or 100", () => {
    assert.equal(normalizeListPageSize(10), 10);
    assert.equal(normalizeListPageSize("50"), 50);
    assert.equal(normalizeListPageSize(100), 100);
    assert.equal(normalizeListPageSize(25), 10);
    assert.equal(normalizeListPageSize(undefined), 10);
  });

  it("filters by case-insensitive name or slug text", () => {
    const rows = [
      { name: "Alpha Kitchen", slug: "alpha" },
      { name: "Beta Cafe", slug: "beta-house" },
    ];
    assert.deepEqual(
      filterBySearch(rows, "BETA", (row) => `${row.name} ${row.slug}`).map((row) => row.slug),
      ["beta-house"],
    );
    assert.equal(filterBySearch(rows, "   ", (row) => row.name).length, 2);
  });

  it("shows the first 10 items and moves sideways to the next page", () => {
    const items = Array.from({ length: 23 }, (_, index) => index + 1);
    const first = paginateItems(items, 0, 10);
    assert.deepEqual(first.visible, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(first.showingFrom, 1);
    assert.equal(first.showingTo, 10);
    assert.equal(first.canPrev, false);
    assert.equal(first.canNext, true);
    assert.equal(first.pageCount, 3);

    const second = paginateItems(items, 1, 10);
    assert.deepEqual(second.visible, [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    assert.equal(second.canPrev, true);
    assert.equal(second.canNext, true);

    const last = paginateItems(items, 2, 10);
    assert.deepEqual(last.visible, [21, 22, 23]);
    assert.equal(last.showingFrom, 21);
    assert.equal(last.showingTo, 23);
    assert.equal(last.canNext, false);
  });

  it("clamps an out-of-range page after shrinking the list", () => {
    const items = [1, 2, 3];
    const page = paginateItems(items, 8, 10);
    assert.equal(page.page, 0);
    assert.deepEqual(page.visible, [1, 2, 3]);
  });
});
