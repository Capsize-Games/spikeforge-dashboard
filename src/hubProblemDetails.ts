/**
 * RFC 9457 problem documents, as `hub_api.errors.HubError.problem` renders
 * them, and turning one into text a person can act on.
 */

import type { ProblemDetail, PublishError } from "./hubPublishTypes";

/** Raised for any non-2xx response from the hub API. */
export class HubApiError extends Error {
  readonly problem: ProblemDetail;

  constructor(problem: ProblemDetail) {
    super(problem.detail || problem.title);
    this.problem = problem;
  }
}

/**
 * Build a problem document from a failed response's status and body text.
 *
 * Every rejection the hub API itself makes is already in this shape (see
 * `hub_api/errors.py`), but a response that never reached it -- a proxy
 * timeout, a 502 from Caddy -- is not, so this always returns something
 * usable instead of throwing while handling a failure.
 */
export function problemFromBody(
  status: number,
  url: string,
  bodyText: string,
): ProblemDetail {
  try {
    const parsed = JSON.parse(bodyText) as Partial<ProblemDetail>;
    if (typeof parsed.detail === "string") {
      const detail = parsed.detail;
      return {
        type: "about:blank",
        title: "request failed",
        instance: url,
        ...parsed,
        detail,
        status: parsed.status ?? status,
      };
    }
  } catch {
    // The body was not a problem document; fall through to a synthetic one.
  }
  return {
    type: "about:blank",
    title: "request failed",
    status,
    detail: `the hub API returned ${status}`,
    instance: url,
  };
}

/** Render a publish error, including any limit numbers a 413/422 carries. */
export function describeProblem(error: PublishError): string {
  if (error.kind !== "hub") return error.message;
  const { problem } = error;
  const parts = [problem.detail || problem.title];
  const megabytes = (bytes: number) => (bytes / 1024 ** 2).toFixed(1);

  if (
    typeof problem.limit_bytes === "number" &&
    typeof problem.requested_bytes === "number"
  ) {
    parts.push(
      `(limit ${megabytes(problem.limit_bytes)} MB, this bundle is ` +
        `${megabytes(problem.requested_bytes)} MB)`,
    );
  } else if (
    typeof problem.limit === "number" &&
    typeof problem.current === "number"
  ) {
    parts.push(`(limit ${problem.limit}, currently ${problem.current})`);
  }
  return parts.join(" ");
}

/** Normalize whatever a failed publish step threw into a `PublishError`. */
export function toPublishError(error: unknown): PublishError {
  if (error instanceof HubApiError) {
    return { kind: "hub", problem: error.problem };
  }
  if (error instanceof Error) {
    return { kind: "network", message: error.message };
  }
  return { kind: "network", message: "the upload failed" };
}
