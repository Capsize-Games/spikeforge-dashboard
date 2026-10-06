/**
 * The two-phase publish, metadata half: reserve an upload, then commit it.
 *
 * Bytes are handled separately (`hubUpload.ts`) -- this file only ever sends
 * JSON. Called straight from the renderer with the hub access token
 * (`hubAuth.ts`); this repo's Python backend never sees either call.
 */

import { HubApiError, problemFromBody } from "./hubProblemDetails.ts";

/** `hub.spikeforge.net` per plans/hub_accounts_plan.md §3.4: the hub web app
 * and its API share one origin. */
export const HUB_API_BASE_URL = "https://hub.spikeforge.net";

export interface UploadIntentRequest {
  name: string;
  version: string;
  sha256: string;
  size_bytes: number;
  license: string;
  summary: string;
}

export interface UploadIntentResponse {
  upload_id: string;
  put_url: string;
  expires_at: number;
  size_bytes: number;
}

export interface UploadCommitResponse {
  upload_id: string;
  state: string;
  published_at: string | null;
}

async function parseProblem(response: Response) {
  return problemFromBody(response.status, response.url, await response.text());
}

/** `POST /v1/uploads`: the quota/name/license check, before any bytes move. */
export async function reserveUpload(
  baseUrl: string,
  token: string,
  body: UploadIntentRequest,
): Promise<UploadIntentResponse> {
  const response = await fetch(`${baseUrl}/v1/uploads`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new HubApiError(await parseProblem(response));
  return (await response.json()) as UploadIntentResponse;
}

/** `POST /v1/uploads/{id}/commit`: publish what was received. */
export async function commitUpload(
  baseUrl: string,
  token: string,
  uploadId: string,
): Promise<UploadCommitResponse> {
  const response = await fetch(
    `${baseUrl}/v1/uploads/${encodeURIComponent(uploadId)}/commit`,
    { method: "POST", headers: { authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new HubApiError(await parseProblem(response));
  return (await response.json()) as UploadCommitResponse;
}

/** Resolve the intent's `put_url` (relative) against the hub API origin. */
export function resolveUploadUrl(baseUrl: string, putUrl: string): string {
  return new URL(putUrl, baseUrl).toString();
}
