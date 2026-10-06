/**
 * Bridge to hub sign-in state.
 *
 * "Desktop sign-in: loopback PKCE + safeStorage" (issue #8) owns obtaining
 * and storing the hub access token and is not built yet, so this assumes the
 * interface it will expose rather than inventing publish-specific plumbing:
 * a `window.spikeforgeHub` object a preload script sets with
 * `contextBridge.exposeInMainWorld`, matching how `desktop/main_window.cjs`
 * already keeps every privileged capability behind `contextIsolation` rather
 * than `nodeIntegration`. There is no preload script yet either -- issue #8
 * adds the first one. Until it lands, `window.spikeforgeHub` is undefined
 * everywhere, so every accessor below reports "signed out" rather than
 * throwing: the Publish action degrades to a sign-in prompt instead of a
 * broken page.
 *
 * The access token itself never has a reason to reach this repo's Python
 * backend (plans/hub_accounts_plan.md §8.1) -- it lives only here, in the
 * renderer, and is sent straight to the hub API.
 */

export interface HubAuthBridge {
  isSignedIn(): boolean;
  getAccessToken(): Promise<string | null>;
}

declare global {
  interface Window {
    spikeforgeHub?: HubAuthBridge;
  }
}

function windowBridge(): HubAuthBridge | undefined {
  return typeof window === "undefined" ? undefined : window.spikeforgeHub;
}

/**
 * Whether a signed-in session is available to publish with.
 *
 * `bridge` defaults to the real `window.spikeforgeHub` and only exists as a
 * parameter so tests can supply a fake one directly, without touching the
 * global `window`.
 */
export function isSignedIn(bridge = windowBridge()): boolean {
  return bridge?.isSignedIn() ?? false;
}

/** The current hub access token, or null when signed out. */
export async function getAccessToken(
  bridge = windowBridge(),
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
