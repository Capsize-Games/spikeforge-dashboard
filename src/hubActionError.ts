import type { HubDownloadStatus } from "./hubTypes";

/** A hub action the user started and is still awaiting. */
export type HubAction = "pull" | "build";

/** A hub action's failure, keeping the server's own words verbatim. */
export interface HubActionError {
  action: HubAction;
  target: string;
  detail: string;
  /** True when a pre-1.1 server rejected the action type itself. */
  unsupported: boolean;
}

/** The wire action behind each UI action. */
const WIRE_ACTION: Record<HubAction, string> = {
  pull: "hub_pull",
  build: "bundle_build",
};

/**
 * Extract display text from an error payload. The wire schema allows a
 * plain reason string or a structured object carrying `message`.
 */
function errorText(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (
    payload !== null &&
    typeof payload === "object" &&
    typeof (payload as { message?: unknown }).message === "string"
  ) {
    return (payload as { message: string }).message;
  }
  return "Unknown error";
}

/**
 * True when the server rejected the action's `type` itself. Negotiation
 * is major-only, so a pre-1.1 server accepts the connection and then
 * answers the unknown type with a validation error naming it -- that is
 * an absent action, not a failed one.
 */
function isUnsupported(action: HubAction, detail: string): boolean {
  return (
    detail.includes(WIRE_ACTION[action]) &&
    detail.includes("literal_error")
  );
}

/** Capture a server error received while a hub action was in flight. */
export function hubActionError(
  action: HubAction,
  target: string,
  payload: unknown,
): HubActionError {
  const detail = errorText(payload);
  return {
    action,
    target,
    detail,
    unsupported: isUnsupported(action, detail),
  };
}

/** True when a pull snapshot ends the action; nothing more will arrive. */
export function isTerminalPullStatus(status: HubDownloadStatus): boolean {
  return status === "done" || status === "cancelled" || status === "error";
}
