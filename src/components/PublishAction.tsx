import { useState } from "react";

import { useI18n } from "../i18n/I18nProvider";
import { isDesktopRuntime, isSignedIn } from "../hubAuth";
import { PublishPanel } from "./PublishPanel";

interface Props {
  modelName: string;
  disabled: boolean;
}

/**
 * Publish trigger for a saved model's bundle tab.
 *
 * Gated to the desktop build: plans/hub_accounts_plan.md §8.3 -- on
 * `dash.spikeforge.net` every visitor shares one `MODEL_DIR`, so a publish
 * from there can't be attributed to an account or charged to its quota.
 * Per that section, the UI says so and points elsewhere rather than just
 * hiding the button.
 */
export function PublishAction({ modelName, disabled }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  if (!isDesktopRuntime()) {
    return <p className="arch-note">{t("publish.hostedNotice")}</p>;
  }

  if (!isSignedIn()) {
    return <p className="arch-note">{t("publish.signInNotice")}</p>;
  }

  return (
    <div className="publish-action">
      <button
        type="button"
        className="apply small"
        disabled={disabled}
        onClick={() => setOpen(true)}
        data-testid="publish-open"
      >
        {t("publish.action")}
      </button>
      {open && (
        <PublishPanel modelName={modelName} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
