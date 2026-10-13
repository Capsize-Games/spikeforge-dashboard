/**
 * Client-side mirrors of `hub_api.catalog.names` and `hub_api.catalog.licenses`.
 *
 * The hub API is the authority -- these exist only so a malformed name or
 * license is refused before a bundle is even fetched, not to replace the
 * server check. Keep the shapes identical; a difference here just means a
 * user's mistake is caught in the wrong place, one round trip later.
 */

//: hub_api/catalog/names.py: `_SLUG`
const SLUG = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
//: hub_api/catalog/names.py: `_VERSION`
const VERSION = /^[a-zA-Z0-9][a-zA-Z0-9.+_-]{0,63}$/;
//: hub_api/catalog/licenses.py: `_TOKEN` / `_EXPRESSION`
const LICENSE_TOKEN = "[A-Za-z0-9][A-Za-z0-9.+-]{0,62}";
const LICENSE_EXPRESSION = new RegExp(
  `^${LICENSE_TOKEN}(?: (?:WITH|AND|OR) ${LICENSE_TOKEN})*$`,
);
//: hub_api/catalog/licenses.py: `UNVERIFIED_CANDIDATE`
export const UNVERIFIED_CANDIDATE = "unverified-candidate";
//: hub_api/catalog/licenses.py: `_NON_ANSWERS`
const NON_ANSWERS = new Set([
  "unknown",
  "none",
  "other",
  "custom",
  "proprietary",
  "see-repo",
  "see-readme",
  "tbd",
  "n/a",
  "na",
]);

/** A few common SPDX ids, offered as suggestions -- any valid id is fine. */
export const LICENSE_SUGGESTIONS = [
  "MIT",
  "BSD-3-Clause",
  "Apache-2.0",
  "GPL-3.0-only",
  "CC-BY-4.0",
  "CC0-1.0",
  UNVERIFIED_CANDIDATE,
];

/** Return an error message for a bad model slug, or null when it is valid. */
export function validateSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  if (!SLUG.test(slug)) {
    return (
      "a model name is 1-64 characters of lowercase letters, digits, dots, " +
      "underscores and hyphens, and may not start or end with a separator"
    );
  }
  return null;
}

/** Return an error message for a bad version string, or null when valid. */
export function validateVersion(raw: string): string | null {
  const version = raw.trim();
  if (!VERSION.test(version)) {
    return (
      "a version is 1-64 characters of letters, digits, dots, plus signs, " +
      "underscores and hyphens, starting with a letter or digit"
    );
  }
  return null;
}

/** Return an error message for a bad license declaration, or null. */
export function validateLicense(raw: string): string | null {
  const value = raw.trim();
  if (value === UNVERIFIED_CANDIDATE) return null;
  if (!value || NON_ANSWERS.has(value.toLowerCase())) {
    return (
      "license must be a concrete SPDX-style identifier (for example " +
      "'BSD-3-Clause' or 'CC-BY-4.0'), or the exact marker " +
      `'${UNVERIFIED_CANDIDATE}' when the license could not be read from ` +
      "the publisher's own page"
    );
  }
  if (!LICENSE_EXPRESSION.test(value)) {
    return "license is not a valid SPDX-style identifier or expression";
  }
  return null;
}

/** Turn a saved model's local file name into a plausible starting slug. */
export function suggestSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");
  return slug || "model";
}
