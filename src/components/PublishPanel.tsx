import { useState } from "react";

import { useI18n } from "../i18n/I18nProvider";
import { usePublish } from "../hooks/usePublish";
import { describeProblem } from "../hubProblemDetails";
import {
  validateLicense,
  validateSlug,
  validateVersion,
  suggestSlug,
} from "../hubPublishValidation";
import { HubUploadProgress } from "./HubUploadProgress";
import { PublishForm } from "./PublishForm";
import type { PublishFormValues } from "../hubPublishTypes";

interface Props {
  modelName: string;
  onClose: () => void;
}

const IN_FLIGHT = new Set(["hashing", "reserving", "uploading", "committing"]);

/** Publish `modelName`'s bundle to the hub: form, then upload progress. */
export function PublishPanel({ modelName, onClose }: Props) {
  const { t } = useI18n();
  const publish = usePublish();
  const [values, setValues] = useState<PublishFormValues>({
    name: suggestSlug(modelName),
    version: "1.0.0",
    license: "",
    summary: "",
  });

  const canSubmit =
    publish.status === "idle" || publish.status === "error"
      ? !validateSlug(values.name) &&
        !validateVersion(values.version) &&
        !validateLicense(values.license) &&
        values.name.trim() !== "" &&
        values.version.trim() !== "" &&
        values.license.trim() !== ""
      : false;

  const inFlight = IN_FLIGHT.has(publish.status);
  // Clicking outside mid-upload would lose it silently; make Cancel explicit.
  const closable = !inFlight;

  return (
    <div className="confirm-overlay" onClick={closable ? onClose : undefined}>
      <div
        className="confirm-card publish-card"
        role="dialog"
        aria-modal="true"
        aria-label={t("publish.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-title">{t("publish.title")}</div>

        {(publish.status === "idle" || publish.status === "error") && (
          <PublishForm
            values={values}
            onChange={setValues}
            onSubmit={() => publish.start(modelName, values)}
            onCancel={onClose}
            canSubmit={canSubmit}
          />
        )}

        {publish.status === "error" && publish.error && (
          <p className="field-error" role="alert" data-testid="publish-error">
            {describeProblem(publish.error)}
          </p>
        )}

        {inFlight && (
          <HubUploadProgress
            status={publish.status}
            bytesSent={publish.bytesSent}
            totalBytes={publish.totalBytes}
            onCancel={publish.cancel}
          />
        )}

        {publish.status === "cancelled" && (
          <>
            <p className="field-error">{t("publish.cancelled")}</p>
            <div className="confirm-actions">
              <button
                type="button"
                className="apply small"
                onClick={publish.reset}
              >
                {t("action.tryAgain")}
              </button>
            </div>
          </>
        )}

        {publish.status === "done" && (
          <>
            <p className="hub-note" data-testid="publish-done">
              {t("publish.done")}
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                className="apply small"
                onClick={onClose}
                data-testid="publish-done-close"
              >
                {t("action.close")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
