/**
 * The dashboard consumes the published Capsize frontend packages from the
 * npm registry, not from Git checkouts or workspace links. A Git dependency
 * would couple every install to a branch tip and break clean-checkout
 * installs, which is exactly what issue #21's acceptance criteria forbid.
 *
 * These pin the registry side: the declared range must be registry-shaped
 * and the lockfile must resolve it to a registry tarball.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { REPO_ROOT } from "../tests/e2e/support/env.mjs";

/** True when `spec` resolves from the registry, not git, a file, or a link. */
export function registryRef(spec) {
  const trimmed = spec.trim();
  if (/^(git\+|git:|github:|file:|link:|https?:)/.test(trimmed)) return false;
  if (trimmed.startsWith("/") || trimmed.startsWith(".")) return false;
  return true;
}

/** The lockfile's registry tarball URL for `name`. */
export function lockedResolution(packages, name) {
  const entry = packages[`node_modules/${name}`];
  const resolved = entry?.resolved;
  if (typeof resolved !== "string" || !resolved.startsWith("https://")) {
    throw new Error(`${name} has no registry tarball in package-lock.json`);
  }
  return resolved;
}

const pkg = JSON.parse(readFileSync(`${REPO_ROOT}/package.json`, "utf8"));
const lock = JSON.parse(
  readFileSync(`${REPO_ROOT}/package-lock.json`, "utf8"),
);

test("the shared commons package is a registry range", () => {
  const spec = pkg.dependencies?.["@capsizellc/commons"];
  assert.ok(typeof spec === "string" && registryRef(spec), `got ${spec}`);
});

test("the lockfile resolves it to a registry tarball", () => {
  assert.match(
    lockedResolution(lock.packages, "@capsizellc/commons"),
    /^https:\/\/registry\.npmjs\.org\//,
  );
});

test("rejects specs that bypass the registry", () => {
  for (const spec of [
    "github:Capsize-Games/capsize-web",
    "git+https://github.com/Capsize-Games/capsize-web.git",
    "file:../capsize-web/packages/commons",
    "link:../capsize-web/packages/commons",
    "https://example.invalid/commons-0.1.1.tgz",
  ]) {
    assert.equal(registryRef(spec), false, spec);
  }
});

test("reports a lockfile entry with no tarball URL", () => {
  assert.throws(() => lockedResolution({}, "@capsizellc/commons"),
    /no registry tarball/);
  assert.throws(
    () => lockedResolution(
      { "node_modules/@capsizellc/commons": {} }, "@capsizellc/commons",
    ),
    /no registry tarball/,
  );
});
