/**
 * PKCE (RFC 7636) and OAuth `state` generation for the desktop loopback flow.
 *
 * Mirrors `capsize_auth.oauth2.pkce` on the hub-api side exactly: a verifier
 * is 32 random bytes, base64url-encoded with no padding, and the S256
 * challenge is the base64url SHA-256 of the verifier's ASCII bytes. Node's
 * `base64url` buffer encoding already omits padding, so no separate trim is
 * needed.
 */

const crypto = require("node:crypto");

const METHOD = "S256";

/** A fresh, unguessable value for the OAuth `state` parameter. */
function generateState() {
  return crypto.randomBytes(24).toString("base64url");
}

/** A fresh PKCE verifier and its S256 challenge. */
function generatePkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier, "ascii")
    .digest("base64url");
  return { verifier, challenge, method: METHOD };
}

module.exports = { generateState, generatePkce, METHOD };
