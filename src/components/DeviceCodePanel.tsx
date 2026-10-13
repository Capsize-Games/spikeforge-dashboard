import { useEffect } from "react";

import type { useDeviceCodeSignIn } from "../hooks/useDeviceCodeSignIn";
import { useI18n } from "../i18n/I18nProvider";

interface Props {
  device: ReturnType<typeof useDeviceCodeSignIn>;
  onCancel: () => void;
}

/** The device-code fallback: "go to hub.spikeforge.net/activate and enter
 * WXYZ-1234", with an "open in browser" shortcut and the poll's outcome. */
export function DeviceCodePanel({ device, onCancel }: Props) {
  const { t } = useI18n();
  const { start, cancel } = device;

  // `start`/`cancel` are stable (`useCallback` with no deps in
  // `useDeviceCodeSignIn`), so this runs once per mount of this panel rather
  // than on every status update `device` carries.
  useEffect(() => {
    start();
    return cancel;
  }, [start, cancel]);

  if (!device.info) {
    return <p className="confirm-message">{t("auth.deviceCodeWaiting")}</p>;
  }

  const { verificationUri, verificationUriComplete, userCode } = device.info;
  const openUrl = verificationUriComplete ?? verificationUri;

  return (
    <div className="device-code-panel">
      <p className="confirm-message">
        {t("auth.deviceCodeIntro")}{" "}
        <span className="device-code-host">{verificationUri}</span>{" "}
        {t("auth.deviceCodeEnter")}
      </p>
      <div className="device-code-value">{userCode}</div>
      <button
        type="button"
        className="apply small ghost"
        onClick={() => window.open(openUrl, "_blank", "noopener,noreferrer")}
      >
        {t("auth.deviceCodeOpenButton")}
      </button>

      {device.status === null && (
        <p className="confirm-message">{t("auth.deviceCodeWaiting")}</p>
      )}
      {device.status === "expired" && (
        <p className="auth-dialog-error">{t("auth.deviceCodeExpired")}</p>
      )}
      {device.status === "denied" && (
        <p className="auth-dialog-error">{t("auth.deviceCodeDenied")}</p>
      )}
      {device.status === "error" && (
        <p className="auth-dialog-error">{t("auth.browserFailed")}</p>
      )}

      <div className="confirm-actions">
        <button type="button" className="apply small ghost" onClick={onCancel}>
          {t("auth.cancel")}
        </button>
      </div>
    </div>
  );
}
