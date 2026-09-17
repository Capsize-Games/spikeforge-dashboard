const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  credentialPath,
  isEncryptionAvailable,
  saveCredential,
  loadCredential,
  clearCredential,
} = require("./credential_store.cjs");

/** A safeStorage stand-in that really "encrypts" (reversibly, not securely)
 * so round-tripping can be asserted without the real OS keyring. */
function fakeSafeStorage(available) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plaintext) => Buffer.from(`enc:${plaintext}`, "utf8"),
    decryptString: (buffer) => {
      const text = buffer.toString("utf8");
      if (!text.startsWith("enc:")) throw new Error("not our ciphertext");
      return text.slice("enc:".length);
    },
  };
}

/** A not-yet-created `auth/` directory under a fresh temp dir, matching how
 * `credential_store` is actually called: `authDir` itself does not exist
 * until the first successful save creates it. */
function tempAuthDir() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "sf-auth-"));
  return path.join(parent, "auth");
}

test("round-trips a credential when encryption is available", () => {
  const dir = tempAuthDir();
  const safeStorage = fakeSafeStorage(true);
  const credential = { kind: "refresh_token", value: "sfh_rt_example" };

  saveCredential(safeStorage, dir, credential);
  assert.deepEqual(loadCredential(safeStorage, dir), credential);
});

test("persists the file at mode 0600 in a 0700 directory", () => {
  const dir = tempAuthDir();
  const safeStorage = fakeSafeStorage(true);
  saveCredential(safeStorage, dir, { kind: "pat", value: "sfh_pat_example" });

  const file = credentialPath(dir);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
});

test("returns null when nothing has been stored yet", () => {
  const dir = tempAuthDir();
  assert.equal(loadCredential(fakeSafeStorage(true), dir), null);
});

test("clearCredential is a no-op when there is nothing to remove", () => {
  const dir = tempAuthDir();
  assert.doesNotThrow(() => clearCredential(dir));
});

test("clearCredential removes a previously saved credential", () => {
  const dir = tempAuthDir();
  const safeStorage = fakeSafeStorage(true);
  saveCredential(safeStorage, dir, { kind: "pat", value: "sfh_pat_example" });

  clearCredential(dir);
  assert.equal(loadCredential(safeStorage, dir), null);
  assert.equal(fs.existsSync(credentialPath(dir)), false);
});

// The branch the issue calls out by name: "isEncryptionAvailable() === false"
// must never be silently bypassed by writing the credential anyway.
test("refuses to write anything when encryption is unavailable", () => {
  const dir = tempAuthDir();
  const safeStorage = fakeSafeStorage(false);

  assert.throws(() =>
    saveCredential(safeStorage, dir, { kind: "refresh_token", value: "x" }),
  );
  assert.equal(fs.existsSync(credentialPath(dir)), false);
  assert.equal(fs.existsSync(dir), false);
});

test("treats a stored credential as unreadable once encryption is unavailable", () => {
  const dir = tempAuthDir();
  saveCredential(fakeSafeStorage(true), dir, {
    kind: "refresh_token",
    value: "x",
  });

  // The file is still there (e.g. the secret service went away between
  // launches), but it must not be read back without it.
  assert.equal(loadCredential(fakeSafeStorage(false), dir), null);
});

test("returns null for a file it cannot decrypt rather than throwing", () => {
  const dir = tempAuthDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(credentialPath(dir), Buffer.from("not encrypted at all"));

  assert.equal(loadCredential(fakeSafeStorage(true), dir), null);
});

test("isEncryptionAvailable reflects the injected safeStorage", () => {
  assert.equal(isEncryptionAvailable(fakeSafeStorage(true)), true);
  assert.equal(isEncryptionAvailable(fakeSafeStorage(false)), false);
});
