/**
 * At-rest storage for the one long-lived hub credential the app keeps: a
 * refresh token from the loopback/device-code flow, or a pasted personal
 * access token. Never the short-lived access token, which the session layer
 * keeps in memory only.
 *
 * `safeStorage` is injected rather than required from `electron` directly,
 * so this module -- like `main_helpers.cjs` -- can be exercised by plain
 * `node --test` with a fake implementation. That is also what makes the
 * no-keyring path easy to pin down in a test: it is a fake returning `false`
 * from `isEncryptionAvailable()`, not a real Linux secret-service dependency.
 *
 * The rule this file exists to enforce: if
 * `safeStorage.isEncryptionAvailable()` is false, nothing is ever written
 * here, in any form. Callers that want the session to persist anyway have
 * exactly one option -- a personal access token pasted again next launch --
 * and that choice is made by the caller, not by this module silently
 * degrading to plaintext.
 */

const fs = require("node:fs");
const path = require("node:path");

const FILE_NAME = "credential.enc";
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

/** Where the encrypted credential would live under `authDir`. */
function credentialPath(authDir) {
  return path.join(authDir, FILE_NAME);
}

/** One stored credential: which kind it is, and its opaque value. */
function isEncryptionAvailable(safeStorage) {
  return safeStorage.isEncryptionAvailable();
}

/**
 * Encrypt and persist `credential` under `authDir`, mode 0600 in a 0700
 * directory. Throws rather than writing anything if the platform has no
 * secret storage -- see the module comment.
 */
function saveCredential(safeStorage, authDir, credential) {
  if (!isEncryptionAvailable(safeStorage)) {
    throw new Error(
      "no secure credential storage is available on this system; refusing " +
        "to write a credential in any form",
    );
  }
  fs.mkdirSync(authDir, { recursive: true, mode: DIR_MODE });
  const encrypted = safeStorage.encryptString(JSON.stringify(credential));
  const file = credentialPath(authDir);
  fs.writeFileSync(file, encrypted, { mode: FILE_MODE });
  // `writeFileSync`'s mode only applies when the file is created; an existing
  // file from a previous run keeps whatever mode it already had.
  fs.chmodSync(file, FILE_MODE);
}

/**
 * Return the stored credential, or `null` if there is none, encryption is
 * unavailable, or the file cannot be decrypted (a different machine's key,
 * or a corrupt file -- either way, nothing usable).
 */
function loadCredential(safeStorage, authDir) {
  if (!isEncryptionAvailable(safeStorage)) return null;
  const file = credentialPath(authDir);
  if (!fs.existsSync(file)) return null;
  try {
    const decrypted = safeStorage.decryptString(fs.readFileSync(file));
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

/** Remove the stored credential, if any. */
function clearCredential(authDir) {
  try {
    fs.unlinkSync(credentialPath(authDir));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

module.exports = {
  credentialPath,
  isEncryptionAvailable,
  saveCredential,
  loadCredential,
  clearCredential,
};
