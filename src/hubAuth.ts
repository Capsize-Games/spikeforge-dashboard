/**
 * Bridge to hub sign-in state.
 *
 * "Desktop sign-in: loopback PKCE + safeStorage" (issue #8) owns obtaining
 * and storing the hub access token; this reads it through the bridge its
 * preload script exposes as `window.spikeforgeAuth`
 * (`src/authTypes.ts`), rather than inventing publish-specific plumbing.
 * Sign-in *state* for rendering comes from `useAuth`; this module exists
 * for the one thing a hook cannot do in an event handler -- fetch the raw
 * token for the direct renderer-to-hub upload calls.
 *
 * The access token itself never has a reason to reach this repo's Python
 * backend (plans/hub_accounts_plan.md §8.1) -- it lives only here, in the
 * renderer, and is sent straight to the hub API.
 */

import type { SpikeforgeAuthBridge } from "./authTypes";

function windowBridge(): SpikeforgeAuthBridge | undefined {
  return typeof window === "undefined" ? undefined : window.spikeforgeAuth;
}

/**
 * The current hub access token, or null when signed out.
 *
 * `bridge` defaults to the real `window.spikeforgeAuth` and only exists as
 * a parameter so tests can supply a fake one directly, without touching
 * the global `window`.
 */
export async function getAccessToken(
  bridge: Pick<SpikeforgeAuthBridge, "getAccessToken"> | undefined =
    windowBridge(),
): Promise<string | null> {
  if (!bridge) return null;
  return bridge.getAccessToken();
}

/**
 * True inside SpikeForge Desktop's Electron shell, false in an ordinary
 * browser tab -- including `dash.spikeforge.net`, which serves the same
 * build (see AGENTS.md: "the same build is packaged as SpikeForge Desktop").
 * That means the desktop/hosted distinction has to be made at runtime by the
 * renderer itself, and nothing in this codebase does that yet.
 *
 * Electron's default user agent names itself unless a project strips it;
 * `desktop/main_window.cjs` sets no `userAgent` override, so this is a
 * stable signal without adding an IPC round trip just to answer "am I
 * desktop?".
 */
export function isDesktopRuntime(
  userAgent: string = typeof navigator === "undefined" ? "" : navigator.userAgent,
): boolean {
  return /\bElectron\//.test(userAgent);
}
