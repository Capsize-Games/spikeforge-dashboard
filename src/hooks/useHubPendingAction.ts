import { useCallback, useRef, useState } from "react";

import { hubActionError } from "../hubActionError";
import type { HubAction, HubActionError } from "../hubActionError";

/** The pull or build the user started and is still awaiting, if any. */
export interface PendingHubAction {
  action: HubAction;
  target: string;
}

/**
 * Track one in-flight pull or build and capture its error. The error
 * channel is global, so an error only belongs to an action that is
 * still awaiting its answer; anything else passes through to the viewer.
 */
export function useHubPendingAction() {
  const [actionError, setActionError] = useState<HubActionError | null>(
    null,
  );
  const pendingRef = useRef<PendingHubAction | null>(null);

  /** Mark an action in flight, dropping any earlier failure. */
  const begin = useCallback((action: HubAction, target: string) => {
    pendingRef.current = { action, target };
    setActionError(null);
  }, []);

  /** Settle the in-flight action without recording a failure. */
  const settle = useCallback(() => {
    pendingRef.current = null;
  }, []);

  /** Drop a failure left behind by an abandoned selection. */
  const clear = useCallback(() => {
    setActionError(null);
  }, []);

  /**
   * Capture an error payload for the in-flight action, if there is one.
   * Returns the settled action so the caller can unwind its own state.
   */
  const capture = useCallback(
    (payload: unknown): PendingHubAction | null => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending === null) return null;
      setActionError(
        hubActionError(pending.action, pending.target, payload),
      );
      return pending;
    },
    [],
  );

  return { actionError, begin, settle, clear, capture };
}
