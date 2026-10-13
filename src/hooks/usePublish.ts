import { useCallback, useRef, useState } from "react";

import { bundleUrl } from "../bundleUrl";
import { getAccessToken } from "../hubAuth";
import { toPublishError } from "../hubProblemDetails";
import {
  HUB_API_BASE_URL,
  commitUpload,
  reserveUpload,
  resolveUploadUrl,
} from "../hubPublishApi";
import { putUploadBytes, sha256Hex } from "../hubUpload";
import type {
  PublishError,
  PublishFormValues,
  PublishStatus,
} from "../hubPublishTypes";

interface PublishState {
  status: PublishStatus;
  bytesSent: number;
  totalBytes: number | null;
  error: PublishError | null;
}

const IDLE: PublishState = {
  status: "idle",
  bytesSent: 0,
  totalBytes: null,
  error: null,
};

/**
 * Own one publish attempt: fetch the bundle from the local backend, reserve
 * an upload, stream the bytes, then commit. Never routes through the WS
 * protocol -- every hub call goes straight from the renderer to the hub API
 * (plans/hub_accounts_plan.md §8.1).
 */
export function usePublish() {
  const [state, setState] = useState<PublishState>(IDLE);
  const cancelRef = useRef<(() => void) | null>(null);

  const fail = useCallback((error: PublishError) => {
    cancelRef.current = null;
    setState((s) => ({ ...s, status: "error", error }));
  }, []);

  const start = useCallback(
    async (modelName: string, form: PublishFormValues) => {
      setState({ status: "hashing", bytesSent: 0, totalBytes: null, error: null });

      let bytes: ArrayBuffer;
      try {
        const response = await fetch(bundleUrl(modelName));
        if (!response.ok) {
          fail({
            kind: "local",
            message: `could not read the saved bundle (${response.status})`,
          });
          return;
        }
        bytes = await response.arrayBuffer();
      } catch {
        fail({ kind: "local", message: "could not reach the local backend" });
        return;
      }

      const token = await getAccessToken();
      if (!token) {
        fail({ kind: "auth", message: "sign in to the hub before publishing" });
        return;
      }

      try {
        const sha256 = await sha256Hex(bytes);
        setState((s) => ({ ...s, status: "reserving", totalBytes: bytes.byteLength }));

        const intent = await reserveUpload(HUB_API_BASE_URL, token, {
          name: form.name,
          version: form.version,
          sha256,
          size_bytes: bytes.byteLength,
          license: form.license,
          summary: form.summary,
        });

        setState((s) => ({ ...s, status: "uploading" }));
        const upload = putUploadBytes(
          resolveUploadUrl(HUB_API_BASE_URL, intent.put_url),
          token,
          new Blob([bytes]),
          (sent, total) => setState((s) => ({ ...s, bytesSent: sent, totalBytes: total })),
        );
        cancelRef.current = upload.cancel;
        await upload.promise;
        cancelRef.current = null;

        setState((s) => ({ ...s, status: "committing" }));
        await commitUpload(HUB_API_BASE_URL, token, intent.upload_id);
        setState((s) => ({ ...s, status: "done" }));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          cancelRef.current = null;
          setState((s) => ({ ...s, status: "cancelled" }));
          return;
        }
        fail(toPublishError(error));
      }
    },
    [fail],
  );

  const cancel = useCallback(() => {
    cancelRef.current?.();
  }, []);

  const reset = useCallback(() => setState(IDLE), []);

  return { ...state, start, cancel, reset };
}
