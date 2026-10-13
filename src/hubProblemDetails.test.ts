/**
 * Parsing and rendering RFC 9457 problem documents shaped like
 * `hub_api.errors.HubError.problem` (see that repo's `hub_api/errors.py` and
 * `hub_api/quota/limits.py`, whose refusals carry the limit numbers this is
 * meant to surface).
 *
 * Run with `npm run scripts:test`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HubApiError,
  describeProblem,
  problemFromBody,
  toPublishError,
} from "./hubProblemDetails.ts";

test("a well-formed problem document is parsed as-is", () => {
  const body = JSON.stringify({
    type: "https://hub.spikeforge.net/errors/invalid_license",
    title: "invalid license",
    status: 422,
    detail: "license must be a concrete SPDX-style identifier",
    instance: "/v1/uploads",
    field: "license",
  });
  const problem = problemFromBody(422, "https://hub.example/v1/uploads", body);
  assert.equal(problem.status, 422);
  assert.equal(problem.title, "invalid license");
  assert.equal(problem.field, "license");
});

test("a non-JSON body still yields a usable problem document", () => {
  const problem = problemFromBody(502, "https://hub.example/v1/uploads", "");
  assert.equal(problem.status, 502);
  assert.match(problem.detail, /502/);
});

test("a JSON body without a detail field falls back the same way", () => {
  const problem = problemFromBody(
    500,
    "https://hub.example/v1/uploads",
    JSON.stringify({ oops: true }),
  );
  assert.equal(problem.status, 500);
  assert.match(problem.detail, /500/);
});

test("a quota-exceeded artifact-size error renders both numbers in MB", () => {
  const error = toPublishError(
    new HubApiError({
      type: "https://hub.spikeforge.net/errors/quota_exceeded",
      title: "quota exceeded",
      status: 413,
      detail: "this artifact is larger than a single upload may be",
      instance: "/v1/uploads",
      limit_bytes: 256 * 1024 ** 2,
      requested_bytes: 300 * 1024 ** 2,
    }),
  );
  const text = describeProblem(error);
  assert.match(text, /256\.0 MB/);
  assert.match(text, /300\.0 MB/);
});

test("a per-account quota error renders the count limit", () => {
  const error = toPublishError(
    new HubApiError({
      type: "https://hub.spikeforge.net/errors/quota_exceeded",
      title: "quota exceeded",
      status: 413,
      detail: "this account already holds as many models as it may",
      instance: "/v1/uploads",
      limit: 50,
      current: 50,
    }),
  );
  assert.match(describeProblem(error), /limit 50, currently 50/);
});

test("a network failure with no problem document renders its message", () => {
  const error = toPublishError(new Error("could not reach the hub API"));
  assert.equal(describeProblem(error), "could not reach the hub API");
});

test("a local (non-Error) failure gets a generic but honest message", () => {
  const error = toPublishError("nope");
  assert.equal(describeProblem(error), "the upload failed");
});
