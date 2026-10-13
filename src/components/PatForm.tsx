import { useState } from "react";

import { useI18n } from "../i18n/I18nProvider";

interface Props {
  onCancel: () => void;
}

/** Paste a personal access token: always available, and the only path for
 * CI and headless use. Submits straight to the auth bridge -- there is no
 * shared state to lift, since sign-in success is observed via `useAuth`'s
 * subscription in the parent. */
export function PatForm({ onCancel }: Props) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const api = window.spikeforgeAuth;
    const token = value.trim();
    if (!api || !token) return;
    setPending(true);
    setError(null);
    try {
      await api.signInWithPat(token);
    } catch {
      setError(t("auth.patInvalid"));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="pat-form">
      <input
        type="password"
        className="pat-input"
        value={value}
        placeholder={t("auth.patPlaceholder")}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();
        }}
        autoFocus
      />
      {error && <p className="auth-dialog-error">{error}</p>}
      <div className="confirm-actions">
        <button type="button" className="apply small ghost" onClick={onCancel}>
          {t("auth.cancel")}
        </button>
        <button
          type="button"
          className="apply small"
          disabled={pending || value.trim().length === 0}
          onClick={submit}
        >
          {t("auth.patSubmit")}
        </button>
      </div>
    </div>
  );
}
