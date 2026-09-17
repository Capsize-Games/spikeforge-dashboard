import { useEffect, useState } from "react";

import type { useAuth } from "../hooks/useAuth";
import { useDeviceCodeSignIn } from "../hooks/useDeviceCodeSignIn";
import { useI18n } from "../i18n/I18nProvider";
import { DeviceCodePanel } from "./DeviceCodePanel";
import { PatForm } from "./PatForm";

type Mode = "menu" | "device" | "pat";

interface Props {
  open: boolean;
  auth: ReturnType<typeof useAuth>;
  onClose: () => void;
}

/**
 * The three ways to sign in to the hub: the system-browser loopback flow
 * (primary), a device code (the fallback for a remote/SSH session or a
 * desktop with no browser handler), and a pasted personal access token
 * (always available, and the only option for CI and headless use).
 */
export function SignInDialog({ open, auth, onClose }: Props) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("menu");
  const device = useDeviceCodeSignIn(onClose);

  useEffect(() => {
    if (open) setMode("menu");
  }, [open]);

  // Closes on a clean sign-in, but not when there is a warning to show --
  // "keep the session in memory... and tell the user" (issue #8) means the
  // notice has to actually be seen, not replaced by the dialog vanishing.
  useEffect(() => {
    if (auth.state.status === "signed-in" && !auth.state.warning) onClose();
  }, [auth.state.status, auth.state.warning, onClose]);

  if (!open) return null;

  if (auth.state.status === "signed-in" && auth.state.warning) {
    return (
      <div className="confirm-overlay" onClick={onClose}>
        <div
          className="confirm-card auth-dialog-card"
          role="dialog"
          aria-modal="true"
          aria-label={t("auth.dialogTitle")}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="confirm-title">{t("auth.dialogTitle")}</div>
          <p className="confirm-message">{t("auth.notPersisted")}</p>
          <div className="confirm-actions">
            <button type="button" className="apply small" onClick={onClose}>
              {t("auth.dismiss")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div
        className="confirm-card auth-dialog-card"
        role="dialog"
        aria-modal="true"
        aria-label={t("auth.dialogTitle")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-title">{t("auth.dialogTitle")}</div>

        {mode === "menu" && (
          <div className="auth-dialog-menu">
            <button
              type="button"
              className="apply small"
              disabled={auth.browserPending}
              onClick={auth.signInWithBrowser}
            >
              {auth.browserPending
                ? t("auth.browserPending")
                : t("auth.browserOption")}
            </button>
            <p className="confirm-message">{t("auth.browserOptionHint")}</p>
            {auth.browserError && (
              <p className="auth-dialog-error">{t("auth.browserFailed")}</p>
            )}
            {auth.browserPending && (
              <button
                type="button"
                className="apply small ghost"
                onClick={auth.cancelBrowserSignIn}
              >
                {t("auth.cancel")}
              </button>
            )}

            <button
              type="button"
              className="apply small ghost"
              onClick={() => setMode("device")}
            >
              {t("auth.deviceCodeOption")}
            </button>
            <button
              type="button"
              className="apply small ghost"
              onClick={() => setMode("pat")}
            >
              {t("auth.patOption")}
            </button>
            <button
              type="button"
              className="apply small ghost"
              onClick={onClose}
            >
              {t("auth.cancel")}
            </button>
          </div>
        )}

        {mode === "device" && (
          <DeviceCodePanel device={device} onCancel={() => setMode("menu")} />
        )}

        {mode === "pat" && <PatForm onCancel={() => setMode("menu")} />}
      </div>
    </div>
  );
}
