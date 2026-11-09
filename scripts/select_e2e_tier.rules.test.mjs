/**
 * Tier-selection business rules SF-TIER-01..05
 * (docs/business-rules.md). Example pins live in
 * select_e2e_tier.test.mjs; these properties generalize them so a
 * new path shape cannot quietly select a cheaper tier.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import fc from "fast-check";

import { selectTier } from "./select_e2e_tier.mjs";

const RANK = { none: 0, smoke: 1, full: 2 };
const SEGMENT = fc.stringMatching(/^[a-z0-9][a-z0-9_-]{0,12}$/);
const PATH = fc
  .array(SEGMENT, { minLength: 1, maxLength: 4 })
  .map((parts) => parts.join("/"));
const RUNS = { numRuns: 100 };

test("adding paths never lowers the tier", () => {
  fc.assert(
    fc.property(fc.array(PATH, { maxLength: 6 }),
      fc.array(PATH, { maxLength: 6 }), (base, extra) => {
        assert.ok(
          RANK[selectTier([...base, ...extra])]
            >= RANK[selectTier(base)],
        );
      }),
    RUNS,
  );
});

test("set tier is the max of singleton tiers", () => {
  fc.assert(
    fc.property(fc.array(PATH, { maxLength: 8 }), (paths) => {
      const expected = paths.reduce(
        (best, p) => Math.max(best, RANK[selectTier([p])]), 0,
      );
      assert.equal(RANK[selectTier(paths)], expected);
    }),
    RUNS,
  );
});

test("unlisted source paths select full", () => {
  const sourcePath = fc
    .array(SEGMENT, { minLength: 1, maxLength: 3 })
    .map((parts) => `src/${parts.join("/")}.ts`)
    .filter((p) => !p.startsWith("src/styles")
      && !p.startsWith("src/i18n/locales/"));
  fc.assert(
    fc.property(sourcePath, (p) => {
      assert.equal(selectTier([p]), "full");
    }),
    RUNS,
  );
});

test("markdown anywhere selects none alone", () => {
  fc.assert(
    fc.property(PATH, (p) => {
      assert.equal(selectTier([`${p}.md`]), "none");
    }),
    RUNS,
  );
});

test("presentational surfaces select smoke", () => {
  const presentational = fc.oneof(
    fc.array(SEGMENT, { maxLength: 2 }).map(
      (parts) => `src/styles/${parts.join("/")}.css`,
    ),
    SEGMENT.map((name) => `src/i18n/locales/${name}.ts`),
  );
  fc.assert(
    fc.property(presentational, (p) => {
      assert.equal(selectTier([p]), "smoke");
    }),
    RUNS,
  );
});
