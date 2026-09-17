/** Hashing and streaming the `.spkf` bytes themselves. */

import { HubApiError, problemFromBody } from "./hubProblemDetails.ts";

/** The hex sha256 the hub API's upload intent requires (§5.1: server-side
 * hashing is the fact; this is only the client's declared assertion). */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export interface UploadHandle {
  promise: Promise<void>;
  cancel: () => void;
}

/**
 * `PUT` `bytes` to `url` with upload progress, cancellable mid-flight.
 *
 * `fetch` does not expose upload progress consistently across the runtimes
 * this build ships to (a plain browser tab, and Electron's renderer);
 * `XMLHttpRequest` does, via `progress` events on `upload` rather than the
 * response.
 */
export function putUploadBytes(
  url: string,
  token: string,
  bytes: Blob,
  onProgress: (sent: number, total: number) => void,
): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<void>((resolve, reject) => {
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(
        new HubApiError(problemFromBody(xhr.status, url, xhr.responseText)),
      );
    };
    xhr.onerror = () => reject(new Error("network error while uploading"));
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
    xhr.send(bytes);
  });
  return { promise, cancel: () => xhr.abort() };
}
