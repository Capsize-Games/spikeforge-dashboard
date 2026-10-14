import { useState } from "react";

import { bundleUrl } from "../bundleUrl";
import type { HubActionError } from "../hubActionError";
import type { HubBundleBuiltPayload } from "../hubTypes";
import { useI18n } from "../i18n/I18nProvider";
import type { SavedModel } from "../types";
import { FactGrid } from "./FactGrid";
import { HubActionErrorView } from "./HubActionErrorView";
import { PublishAction } from "./PublishAction";

interface Props {
  models: SavedModel[];
  connected: boolean;
  readOnly: boolean;
  built: HubBundleBuiltPayload | null;
  buildError: HubActionError | null;
  onBuild: (name: string) => void;
}

function sizeLabel(bytes: number): string {
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/**
 * The bundle tab: download a saved model as a portable `.spkf`, rebuild
 * it on the server first, or publish it to the hub.
 */
export function ModelBundleTab({
  models,
  connected,
  readOnly,
  built,
  buildError,
  onBuild,
}: Props) {
  const { t } = useI18n();
  const [bundleTarget, setBundleTarget] = useState("");
  // The result and the failure both belong to one target; a retargeted
  // select must not keep showing the previous model's outcome.
  const result =
    built !== null && built.name === bundleTarget ? built : null;
  const failure =
    buildError !== null && buildError.target === bundleTarget
      ? buildError
      : null;

  return (
    <div className="model-block">
      <div className="control-row">
        <select
          className="text-input"
          value={bundleTarget}
          onChange={(e) => setBundleTarget(e.target.value)}
          disabled={models.length === 0}
          aria-label="Model to bundle"
        >
          <option value="">
            {models.length ? t("model.choose") : t("model.noSaved")}
          </option>
          {models.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name}
            </option>
          ))}
        </select>
        <a
          className={`apply small ${bundleTarget ? "" : "disabled"}`}
          href={bundleTarget ? bundleUrl(bundleTarget) : undefined}
          aria-disabled={!bundleTarget}
          onClick={(e) => {
            if (!bundleTarget) e.preventDefault();
          }}
          download
        >
          {t("model.download")}
        </a>
        <button
          type="button"
          className="apply small"
          data-testid="model-bundle-build"
          disabled={!connected || readOnly || !bundleTarget}
          onClick={() => onBuild(bundleTarget)}
        >
          {t("model.build")}
        </button>
      </div>
      {result && (
        <div data-testid="model-bundle-built">
          <FactGrid
            facts={[
              { label: t("model.builtPath"), value: result.path },
              {
                label: t("model.builtSize"),
                value: sizeLabel(result.size_bytes),
              },
              { label: t("model.builtSha"), value: result.sha256 },
            ]}
          />
        </div>
      )}
      {failure && <HubActionErrorView error={failure} />}
      <p className="arch-note">
        A portable deployment bundle — everything a runtime needs to load
        and run this model, with no training code attached. Install it as a
        standalone command with{" "}
        <code>spikeforge-serve install &lt;file&gt;.spkf</code>, or serve it
        with <code>spikeforge-serve serve --bundle &lt;file&gt;.spkf</code>.
      </p>
      <PublishAction modelName={bundleTarget} disabled={!bundleTarget} />
    </div>
  );
}
