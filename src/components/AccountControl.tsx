import { useState } from "react";
import { LogIn, LogOut, ShieldAlert } from "lucide-react";

import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../i18n/I18nProvider";
import { SignInDialog } from "./SignInDialog";

/**
 * Hub sign-in status in the header: a "Sign in" action when signed out, the
 * account's handle and a sign-out action when signed in.
 *
 * Desktop-only. Renders nothing when there is no `window.spikeforgeAuth`
 * bridge (the browser build), rather than an option that can never work.
 */
export function AccountControl() {
  const auth = useAuth();
  const { t } = useI18n();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!auth.available) return null;

  if (auth.state.status === "signed-in") {
    const name = auth.state.displayName ?? auth.state.handle;
    return (
      <div className="account-control">
        <span
          className="account-handle"
          title={`${t("auth.signedInAs")} ${name}`}
        >
          {name}
        </span>
        {!auth.state.persistent && (
          <span className="account-warning" title={t("auth.notPersisted")}>
            <ShieldAlert size={14} aria-hidden="true" />
          </span>
        )}
        <button
          type="button"
          className="icon-btn"
          onClick={auth.signOut}
          title={t("auth.signOut")}
          aria-label={t("auth.signOut")}
        >
          <LogOut size={15} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="account-control">
      <button
        type="button"
        className="icon-btn account-signin"
        onClick={() => setDialogOpen(true)}
      >
        <LogIn size={15} aria-hidden="true" />
        <span>{t("auth.signIn")}</span>
      </button>
      <SignInDialog
        open={dialogOpen}
        auth={auth}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
