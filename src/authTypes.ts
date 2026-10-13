/**
 * Types for the hub sign-in bridge `desktop/preload.cjs` exposes as
 * `window.spikeforgeAuth`. Electron-only: the same dashboard bundle served
 * to a browser has no such bridge, which is what `useAuth`'s `available`
 * flag is for.
 */

export type AuthStatus = "signed-out" | "signed-in";

/** A reason code for `AuthState.warning`, not a sentence -- the renderer
 * owns the translated wording (`src/i18n/translations.ts`'s
 * `auth.notPersisted` key) so the message reaches every supported locale. */
export type AuthWarning = "no_secure_storage";

/** The renderer-safe view of the session -- no tokens ever cross this
 * bridge; the access token stays in the main process. */
export interface AuthState {
  status: AuthStatus;
  handle: string | null;
  displayName: string | null;
  /** Whether this sign-in will still be there after a restart. False means
   * no secure credential storage was available on this system. */
  persistent: boolean;
  /** Set when the sign-in that just happened was not what was asked for --
   * currently only the no-keyring case. Not an error: `status` can still be
   * "signed-in". */
  warning: AuthWarning | null;
}

/** What starting the device-code fallback returns: the code to show. */
export interface DeviceCodeStart {
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string | null;
  expiresIn: number;
}

/** How a device-code attempt can end, pushed from main as it polls. */
export type DeviceCodeStatusKind = "granted" | "expired" | "denied" | "error";

export interface DeviceCodeStatusUpdate {
  status: DeviceCodeStatusKind;
  message?: string;
}

/** The bridge itself, matching `desktop/preload.cjs` exactly. */
export interface SpikeforgeAuthBridge {
  getState: () => Promise<AuthState>;
  signInWithBrowser: () => Promise<AuthState>;
  cancelBrowserSignIn: () => Promise<void>;
  startDeviceCode: () => Promise<DeviceCodeStart>;
  cancelDeviceCode: () => Promise<void>;
  signInWithPat: (token: string) => Promise<AuthState>;
  signOut: () => Promise<AuthState>;
  onStateChanged: (callback: (state: AuthState) => void) => () => void;
  onDeviceCodeStatus: (
    callback: (status: DeviceCodeStatusUpdate) => void,
  ) => () => void;
}

declare global {
  interface Window {
    spikeforgeAuth?: SpikeforgeAuthBridge;
  }
}
