import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve("app-builder-lib"));
const ajvRequire = createRequire(builderRequire.resolve("ajv"));
const uri = ajvRequire("fast-uri");

test("build tooling treats encoded and literal host names equally", () => {
  const encoded = "//%4Detadata.internal/private";
  const literal = "//metadata.internal/private";
  assert.equal(uri.parse(encoded).host, "metadata.internal");
  assert.equal(uri.equal(encoded, literal), true);
  assert.equal(uri.normalize(uri.normalize(encoded)), literal);
});

test("URI normalization preserves path case and reserved escapes", () => {
  assert.equal(uri.equal("//%41.com/Path", "//a.com/path"), false);
  assert.equal(uri.normalize("//example.com%2fpath"), "//example.com%2Fpath");
  assert.equal(uri.normalize("//%2541.com"), "//%2541.com");
});
