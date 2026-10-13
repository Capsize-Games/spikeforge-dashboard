import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/translations";
import type { PublishStatus } from "../hubPublishTypes";

interface Props {
  status: PublishStatus;
  bytesSent: number;
  totalBytes: number | null;
  onCancel: () => void;
}

/** In-progress statuses only -- "done"/"error"/"cancelled" render elsewhere. */
const TITLE_KEY: Record<string, TranslationKey> = {
  hashing: "publish.status.hashing",
  reserving: "publish.status.reserving",
  uploading: "publish.status.uploading",
  committing: "publish.status.committing",
};

function megabytes(bytes: number): string {
  return (bytes / 1024 ** 2).toFixed(1);
}

/** Publish progress, mirroring `HubDownloadProgress`'s look for uploads. */
export function HubUploadProgress({
  status,
  bytesSent,
  totalBytes,
  onCancel,
}: Props) {
  const { t } = useI18n();
  const known = totalBytes !== null && totalBytes > 0;
  const progress = known
    ? `${megabytes(bytesSent)} / ${megabytes(totalBytes)} MB`
    : `${megabytes(bytesSent)} MB`;
  const percent = known ? Math.min(100, (bytesSent / totalBytes) * 100) : null;

  return (
    <div className="hub-upload" role="status" aria-live="polite">
      <div className="hub-upload-title">
        {t(TITLE_KEY[status] ?? "publish.status.uploading")}
      </div>
      <div className="hub-upload-bar" aria-hidden="true">
        <span
          className={`hub-upload-fill${status === "uploading" ? "" : " indeterminate"}`}
          style={percent !== null ? { width: `${percent}%` } : undefined}
        />
      </div>
      <div className="hub-upload-meta">
        <span>{status === "uploading" ? progress : ""}</span>
        {status === "uploading" && (
          <button type="button" className="link danger" onClick={onCancel}>
            {t("action.cancel")}
          </button>
        )}
      </div>
    </div>
  );
}
