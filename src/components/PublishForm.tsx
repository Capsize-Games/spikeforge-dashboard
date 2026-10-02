import { useI18n } from "../i18n/I18nProvider";
import {
  LICENSE_SUGGESTIONS,
  validateLicense,
  validateSlug,
  validateVersion,
} from "../hubPublishValidation";
import type { PublishFormValues } from "../hubPublishTypes";

interface Props {
  values: PublishFormValues;
  onChange: (values: PublishFormValues) => void;
  onSubmit: () => void;
  onCancel: () => void;
  canSubmit: boolean;
}

/** Name/version/license/summary fields, validated client-side to fail fast
 * against the same shape `hub_api.catalog.licenses`/`names` enforce. */
export function PublishForm({
  values,
  onChange,
  onSubmit,
  onCancel,
  canSubmit,
}: Props) {
  const { t } = useI18n();
  const patch = (fields: Partial<PublishFormValues>) =>
    onChange({ ...values, ...fields });

  const nameError = values.name ? validateSlug(values.name) : null;
  const versionError = values.version ? validateVersion(values.version) : null;
  const licenseError = values.license ? validateLicense(values.license) : null;

  return (
    <>
      <div className="publish-field">
        <label htmlFor="publish-name">{t("publish.name")}</label>
        <input
          id="publish-name"
          className="text-input"
          value={values.name}
          onChange={(e) => patch({ name: e.target.value })}
          data-testid="publish-name"
        />
        {nameError && <p className="field-error">{nameError}</p>}
      </div>

      <div className="publish-field">
        <label htmlFor="publish-version">{t("publish.version")}</label>
        <input
          id="publish-version"
          className="text-input"
          value={values.version}
          onChange={(e) => patch({ version: e.target.value })}
          data-testid="publish-version"
        />
        {versionError && <p className="field-error">{versionError}</p>}
      </div>

      <div className="publish-field">
        <label htmlFor="publish-license">{t("publish.license")}</label>
        <input
          id="publish-license"
          className="text-input"
          list="publish-license-suggestions"
          value={values.license}
          onChange={(e) => patch({ license: e.target.value })}
          data-testid="publish-license"
        />
        <datalist id="publish-license-suggestions">
          {LICENSE_SUGGESTIONS.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
        {licenseError && <p className="field-error">{licenseError}</p>}
      </div>

      <div className="publish-field">
        <label htmlFor="publish-summary">{t("publish.summary")}</label>
        <textarea
          id="publish-summary"
          className="text-input"
          value={values.summary}
          onChange={(e) => patch({ summary: e.target.value })}
          maxLength={200}
          data-testid="publish-summary"
        />
      </div>

      <div className="confirm-actions">
        <button type="button" className="apply small ghost" onClick={onCancel}>
          {t("action.cancel")}
        </button>
        <button
          type="button"
          className="apply small"
          disabled={!canSubmit}
          onClick={onSubmit}
          data-testid="publish-submit"
        >
          {t("publish.submit")}
        </button>
      </div>
    </>
  );
}
