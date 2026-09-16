/**
 * The versioned WebSocket contract between this client and its server.
 *
 * The dashboard and the engine ship from separate repositories on separate
 * release cadences, so the version handshake is the seam most likely to break
 * silently. These run through a raw socket opened inside the page, because the
 * interface offers no way to send a malformed message on purpose.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "../../fixtures/dashboard";
import { REPO_ROOT } from "../../support/env.mjs";

const pins = JSON.parse(
  readFileSync(
    path.join(REPO_ROOT, "tests", "e2e", "backend-pins.json"),
    "utf8",
  ),
) as { protocol_version: string };

const version = readFileSync(
  path.join(REPO_ROOT, "protocol", "protocol_version.txt"),
  "utf8",
).trim();

test.describe("protocol", () => {
  test("the repository's protocol version matches the pinned backend", () => {
    // Two files, two repositories, one contract. When they drift, every other
    // failure in this suite becomes a red herring.
    expect(version).toBe(pins.protocol_version);
  });

  test("a correctly versioned message is answered", async ({ dashboard }) => {
    const replies = await dashboard.protocolExchange([
      { protocol_version: version, type: "surrogates" },
    ]);
    const surrogates = replies.find((reply) => reply.type === "surrogate_list");
    expect(surrogates, `no surrogate_list in ${JSON.stringify(replies)}`)
      .toBeDefined();
    expect(surrogates?.payload).toEqual(
      expect.arrayContaining(["fast_sigmoid"]),
    );
  });

  test("a message with no protocol version is rejected", async ({
    dashboard,
  }) => {
    const replies = await dashboard.protocolExchange([{ type: "surrogates" }]);
    const error = replies.find((reply) => reply.type === "error");
    expect(error, `expected a rejection, got ${JSON.stringify(replies)}`)
      .toBeDefined();
    expect(error?.payload).toMatchObject({
      code: "protocol_version_mismatch",
      client: null,
    });
  });

  test("a major-version mismatch is rejected and names both sides", async ({
    dashboard,
  }) => {
    const replies = await dashboard.protocolExchange([
      { protocol_version: "99.0", type: "surrogates" },
    ]);
    const error = replies.find((reply) => reply.type === "error");
    expect(error, `expected a rejection, got ${JSON.stringify(replies)}`)
      .toBeDefined();
    expect(error?.payload).toMatchObject({
      code: "protocol_version_mismatch",
      client: "99.0",
      server: version,
    });
  });

  test("an unparseable request does not take the connection down", async ({
    dashboard,
  }) => {
    // `server/app.py` answers a bad message on the error channel and keeps
    // serving; a dropped socket here would strand the interface.
    const replies = await dashboard.protocolExchange([
      { protocol_version: version, type: "load_model", name: "no-such-model" },
      { protocol_version: version, type: "surrogates" },
    ]);
    expect(replies.some((reply) => reply.type === "surrogate_list")).toBe(true);
  });
});
