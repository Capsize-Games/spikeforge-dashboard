/**
 * These pin the client-side mirrors of `hub_api.catalog.names` and
 * `hub_api.catalog.licenses` to the exact server behavior (see that repo's
 * `tests/test_api_publish.py`), so a validation drift is caught here rather
 * than as a confusing round trip to the hub API.
 *
 * Run with `npm run scripts:test`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  UNVERIFIED_CANDIDATE,
  suggestSlug,
  validateLicense,
  validateSlug,
  validateVersion,
} from "./hubPublishValidation.ts";

test("valid slugs are accepted", () => {
  for (const slug of ["a", "my-model", "my_model.v2", "a1"]) {
    assert.equal(validateSlug(slug), null, slug);
  }
});

// hub_api/catalog/names.py's own test parametrizes exactly these malformed
// names: empty, uppercase/spaced, and a slash (which would break the
// @handle/slug URL shape).
test("malformed slugs are refused, matching the server's own cases", () => {
  for (const slug of ["", "Bad Name", "a/b"]) {
    assert.notEqual(validateSlug(slug), null, slug);
  }
});

test("a slug may not start or end with a separator", () => {
  assert.notEqual(validateSlug("-leading"), null);
  assert.notEqual(validateSlug("trailing-"), null);
});

test("valid versions are accepted", () => {
  for (const version of ["1.0.0", "v2", "2024.01.01+build"]) {
    assert.equal(validateVersion(version), null, version);
  }
});

test("a version may not start with a separator", () => {
  assert.notEqual(validateVersion("-1.0"), null);
  assert.notEqual(validateVersion(""), null);
});

test("concrete SPDX ids and expressions are accepted", () => {
  for (const license of [
    "MIT",
    "BSD-3-Clause",
    "Apache-2.0",
    "CC-BY-4.0",
    "MIT OR Apache-2.0",
    "GPL-3.0-only WITH Classpath-exception-2.0",
  ]) {
    assert.equal(validateLicense(license), null, license);
  }
});

test("the unverified-candidate marker is accepted verbatim", () => {
  assert.equal(validateLicense(UNVERIFIED_CANDIDATE), null);
});

// hub_api/catalog/licenses.py refuses these non-answers outright, with a
// message pointing at the marker instead of a generic "invalid" error.
test("free-text non-answers are refused, matching the server's list", () => {
  for (const bad of ["see-repo", "unknown", "proprietary", "", "TBD"]) {
    assert.notEqual(validateLicense(bad), null, bad);
  }
});

// The server's own test uses this exact string (test_api_publish.py); it is
// refused by the expression shape check rather than the non-answer list.
test("free text that is not SPDX-shaped is refused", () => {
  assert.notEqual(validateLicense("see repo"), null);
  assert.notEqual(validateLicense("this is not spdx!!"), null);
});

test("a saved model's local name becomes a plausible starting slug", () => {
  assert.equal(suggestSlug("My Cool Model"), "my-cool-model");
  assert.equal(suggestSlug("__weird__"), "weird");
  assert.equal(suggestSlug(""), "model");
});
