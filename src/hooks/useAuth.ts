import { useCallback, useEffect, useState } from "react";

import type { AuthState } from "../authTypes";

const SIGNED_OUT: AuthState = {
  status: "signed-out",
  handle: null,
  displayName: null,
  persistent: false,
  warning: null,
};

function bridge() {
  return typeof window === "undefined" ? undefined : window.spikeforgeAuth;
}

/**
 * Hub sign-in state, the loopback-browser flow, and sign-out.
 *
 * Only present in the desktop build (`available`); a browser build has no
 * `window.spikeforgeAuth` bridge, and callers should hide sign-in UI rather
 * than show one that can never do anything. The device-code fallback lives
 * in `useDeviceCodeSignIn`, and pasting a PAT is simple enough to call the
 * bridge directly from `SignInDialog` -- splitting those out keeps this hook
 * short and each concern independently readable.
 */
export function useAuth() {
  const available = bridge() !== undefined;
  const [state, setState] = useState<AuthState>(SIGNED_OUT);
  const [browserPending, setBrowserPending] = useState(false);
  const [browserError, setBrowserError] = useState<string | null>(null);

  useEffect(() => {
    const api = bridge();
    if (!api) return;
    api.getState().then(setState);
    return api.onStateChanged(setState);
  }, []);

  const signInWithBrowser = useCallback(() => {
    const api = bridge();
    if (!api) return;
    setBrowserError(null);
    setBrowserPending(true);
    api
      .signInWithBrowser()
      .then(setState)
      .catch((error: unknown) =>
        setBrowserError(
          error instanceof Error ? error.message : String(error),
        ),
      )
      .finally(() => setBrowserPending(false));
  }, []);

  const cancelBrowserSignIn = useCallback(() => {
    setBrowserPending(false);
    bridge()?.cancelBrowserSignIn();
  }, []);

  const signOut = useCallback(() => {
    bridge()
      ?.signOut()
      .then(setState);
  }, []);

  return {
    available,
    state,
    browserPending,
    browserError,
    signInWithBrowser,
    cancelBrowserSignIn,
    signOut,
  };
}
