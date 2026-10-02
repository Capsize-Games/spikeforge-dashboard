/**
 * `reserveUpload` / `commitUpload` against the exact request/response shape
 * `hub_api/routes/uploads.py` and its `tests/test_api_publish.py` exercise,
 * with a fake `fetch` standing in for the network.
 *
 * Run with `npm run scripts:test`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { HubApiError } from "./hubProblemDetails.ts";
import {
  commitUpload,
  reserveUpload,
  resolveUploadUrl,
} from "./hubPublishApi.ts";

interface Call {
  url: string;
  method: string | undefined;
  headers: Headers;
  body: string | undefined;
}

/** Install a fake `fetch` for the duration of `run`, recording each call. */
async function withFakeFetch<T>(
  respond: (call: Call) => Response,
  run: () => Promise<T>,
): Promise<T> {
  const calls: Call[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const call: Call = {
      url: String(input),
      method: init?.method,
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    calls.push(call);
    return respond(call);
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = real;
  }
}

test("reserveUpload posts the intent and returns the upload slot", async () => {
  let seen: Call | undefined;
  const slot = await withFakeFetch(
    (call) => {
      seen = call;
      return Response.json({
        upload_id: "u1",
        put_url: "/v1/uploads/u1/content",
        expires_at: 1000,
        size_bytes: 4096,
      });
    },
    () =>
      reserveUpload("https://hub.example", "tok123", {
        name: "my-model",
        version: "1.0.0",
        sha256: "a".repeat(64),
        size_bytes: 4096,
        license: "MIT",
        summary: "",
      }),
  );

  assert.equal(slot.upload_id, "u1");
  assert.equal(seen?.url, "https://hub.example/v1/uploads");
  assert.equal(seen?.method, "POST");
  assert.equal(seen?.headers.get("authorization"), "Bearer tok123");
  assert.equal(JSON.parse(seen?.body ?? "{}").name, "my-model");
});

test("reserveUpload throws a HubApiError carrying the problem document", async () => {
  await assert.rejects(
    withFakeFetch(
      () =>
        new Response(
          JSON.stringify({
            type: "https://hub.spikeforge.net/errors/invalid_license",
            title: "invalid license",
            status: 422,
            detail: "license must be a concrete SPDX-style identifier",
            instance: "/v1/uploads",
          }),
          { status: 422 },
        ),
      () =>
        reserveUpload("https://hub.example", "tok", {
          name: "my-model",
          version: "1.0.0",
          sha256: "a".repeat(64),
          size_bytes: 4096,
          license: "see repo",
          summary: "",
        }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof HubApiError);
      assert.equal(error.problem.status, 422);
      assert.equal(error.problem.title, "invalid license");
      return true;
    },
  );
});

test("commitUpload posts to the upload's commit route", async () => {
  let seen: Call | undefined;
  const result = await withFakeFetch(
    (call) => {
      seen = call;
      return Response.json({
        upload_id: "u1",
        state: "published",
        published_at: "2026-01-01T00:00:00Z",
      });
    },
    () => commitUpload("https://hub.example", "tok", "u1"),
  );

  assert.equal(result.state, "published");
  assert.equal(seen?.url, "https://hub.example/v1/uploads/u1/commit");
  assert.equal(seen?.method, "POST");
});

test("resolveUploadUrl resolves the intent's relative put_url", () => {
  assert.equal(
    resolveUploadUrl("https://hub.example", "/v1/uploads/u1/content"),
    "https://hub.example/v1/uploads/u1/content",
  );
});
